import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import { connectDatabase } from "../db.js";
import { DrmFailure } from "../models/drm-failure.js";
import { DrmKey } from "../models/drm-key.js";
import { Film } from "../models/film.js";
import { encryptContentKey, uuid } from "../services/axinom.js";
import { drmIsConfigured, localDrmUrl } from "../services/drm.js";
import { deleteStoredFile, isPrivateBlobUrl, isPublicBlobUrl } from "../services/storage.js";

/*
 * Used by the GitHub Actions encryption worker (.github/workflows/encrypt-videos.yml), because
 * Vercel Functions can't run Shaka Packager on long videos. The worker asks for the queue,
 * packages each video, uploads the encrypted stream to the public Blob store, then reports back.
 */
export const internalDrmRouter = Router();

const MAX_ATTEMPTS = 3;

function requireWorker(request: Request, response: Response, next: NextFunction) {
  const secret = process.env.DRM_WORKER_SECRET ?? "";
  const given = (request.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok = secret.length >= 32 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) { response.status(401).json({ error: "Unauthorized" }); return; }
  response.setHeader("Cache-Control", "no-store");
  next();
}
internalDrmRouter.use(requireWorker);

// Only videos we uploaded to Blob ourselves are queued (not YouTube links or other sites).
const isBlobVideo = (url?: string | null) => Boolean(url && (isPrivateBlobUrl(url) || isPublicBlobUrl(url)) && /\/(films|teasers)\/[^/]+\.(mp4|m4v|mov|webm)$/i.test(url));
type Job = { filmId: string; title: string; target: "film" | "teaser" | "episode"; seasonId?: string; episodeId?: string; sourceUrl: string; access: "public" | "private" };

internalDrmRouter.get("/queue", async (_request, response, next) => {
  try {
    if (!drmIsConfigured()) { response.json({ data: [] }); return; }
    await connectDatabase();
    const blocked = new Set((await DrmFailure.find({ attempts: { $gte: MAX_ATTEMPTS } }).select("sourceUrl").lean()).map((item) => item.sourceUrl));
    const jobs: Job[] = [];
    const films = await Film.find({ $or: [{ videoProvider: "direct" }, { teaserProvider: "direct" }, { "seasons.episodes.videoProvider": "direct" }] }).select("title videoUrl videoProvider teaserUrl teaserProvider seasons").lean();
    const add = (job: Omit<Job, "access">) => { if (!blocked.has(job.sourceUrl)) jobs.push({ ...job, access: isPrivateBlobUrl(job.sourceUrl) ? "private" : "public" }); };
    for (const film of films) {
      const filmId = String(film._id);
      if (film.teaserProvider === "direct" && isBlobVideo(film.teaserUrl)) add({ filmId, title: film.title, target: "teaser", sourceUrl: film.teaserUrl! });
      if (film.videoProvider === "direct" && isBlobVideo(film.videoUrl)) add({ filmId, title: film.title, target: "film", sourceUrl: film.videoUrl! });
      for (const season of film.seasons ?? []) for (const episode of season.episodes ?? []) {
        if (episode.videoProvider === "direct" && isBlobVideo(episode.videoUrl)) add({ filmId, title: `${film.title} S${season.number}E${episode.number}`, target: "episode", seasonId: String(season._id), episodeId: String(episode._id), sourceUrl: episode.videoUrl! });
      }
    }
    response.json({ data: jobs.slice(0, 10) });
  } catch (error) { next(error); }
});

internalDrmRouter.post("/complete", async (request, response, next) => {
  try {
    const { filmId, target, seasonId, episodeId, sourceUrl, keyId, contentKeyHex, manifestUrl } = request.body ?? {};
    if (!mongoose.isValidObjectId(filmId) || !["film", "teaser", "episode"].includes(target) || typeof sourceUrl !== "string") { response.status(400).json({ error: "Invalid job" }); return; }
    if (!uuid(String(keyId)) || !/^[a-f0-9]{32}$/i.test(String(contentKeyHex))) { response.status(400).json({ error: "Invalid key" }); return; }
    if (!localDrmUrl(String(manifestUrl)) || !String(manifestUrl).includes(`/drm/${String(keyId).toLowerCase()}/`)) { response.status(400).json({ error: "Invalid manifest URL" }); return; }
    await connectDatabase();
    const id = String(keyId).toLowerCase();
    await DrmKey.updateOne({ keyId: id }, { $setOnInsert: { keyId: id, encryptedKey: encryptContentKey(id, Buffer.from(String(contentKeyHex), "hex")), sourceUrl } }, { upsert: true });

    // Only switch the title over if it still points at the video that was encrypted.
    let updated;
    if (target === "teaser") updated = await Film.updateOne({ _id: filmId, teaserUrl: sourceUrl }, { $set: { teaserUrl: manifestUrl, teaserProvider: "drm", teaserDrmAssetId: id } });
    else if (target === "film") updated = await Film.updateOne({ _id: filmId, videoUrl: sourceUrl }, { $set: { videoUrl: manifestUrl, videoProvider: "drm", drmAssetId: id } });
    else {
      if (!mongoose.isValidObjectId(seasonId) || !mongoose.isValidObjectId(episodeId)) { response.status(400).json({ error: "Invalid episode" }); return; }
      updated = await Film.updateOne(
        { _id: filmId },
        { $set: { "seasons.$[s].episodes.$[e].videoUrl": manifestUrl, "seasons.$[s].episodes.$[e].videoProvider": "drm", "seasons.$[s].episodes.$[e].drmAssetId": id } },
        { arrayFilters: [{ "s._id": new mongoose.Types.ObjectId(seasonId) }, { "e._id": new mongoose.Types.ObjectId(episodeId), "e.videoUrl": sourceUrl }] },
      );
    }
    await DrmFailure.deleteOne({ sourceUrl });
    // A plain teaser in the public store would stay downloadable, so remove it once it is replaced.
    // Private film masters are kept so a title can be re-encrypted later.
    if (updated.modifiedCount && isPublicBlobUrl(sourceUrl) && !await Film.exists({ $or: [{ videoUrl: sourceUrl }, { teaserUrl: sourceUrl }, { "seasons.episodes.videoUrl": sourceUrl }] })) await deleteStoredFile(sourceUrl);
    response.json({ data: { applied: updated.modifiedCount > 0 } });
  } catch (error) { next(error); }
});

internalDrmRouter.post("/failed", async (request, response, next) => {
  try {
    const sourceUrl = typeof request.body?.sourceUrl === "string" ? request.body.sourceUrl : "";
    if (!sourceUrl) { response.status(400).json({ error: "Missing source" }); return; }
    await connectDatabase();
    await DrmFailure.updateOne({ sourceUrl }, { $inc: { attempts: 1 }, $set: { lastError: String(request.body?.error ?? "").slice(0, 500) } }, { upsert: true });
    response.json({ data: { recorded: true } });
  } catch (error) { next(error); }
});
