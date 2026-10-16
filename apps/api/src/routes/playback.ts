import express, { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import { currentViewer, getViewerAccessStatus } from "../auth.js";
import { connectDatabase } from "../db.js";
import { Film } from "../models/film.js";
import { Subscription } from "../models/subscription.js";
import { DrmKey } from "../models/drm-key.js";
import { buildDrmConfig, DRM_SYSTEMS, httpsUrl, licenseUpstream, licenseHeaders, localDrmUrl, type DrmSystem } from "../services/drm.js";

export const playbackRouter = Router();
playbackRouter.use(async (request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  try {
    const origin = request.get("origin");
    const allowed = (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(",").map(value => value.trim());
    if (request.get("sec-fetch-site") === "cross-site" || (origin && !allowed.includes(origin))) {
      response.status(403).json({ error: "Playback request not allowed" }); return;
    }
    // Teasers are public previews: encrypted like everything else, but no CinePass needed.
    if (request.query.teaser === "1") { next(); return; }
    const access = await getViewerAccessStatus(request);
    if (!access.isAuthenticated) { response.status(403).json({ error: "An active CinePass is required for this screening" }); return; }
    const viewer = currentViewer(request);
    if (viewer && !await Subscription.exists({ viewerId: viewer.sub, status: "active", expiresAt: { $gt: new Date() } })) {
      response.status(403).json({ error: "Your CinePass has ended. Renew to continue watching." }); return;
    }
    next();
  } catch (error) { next(error); }
});
async function selectedAsset(request: Request, response: Response) {
  await connectDatabase();
  const film = await Film.findOne({ slug: request.params.slug, status: "published" }).lean();
  const episodeId = typeof request.query.episode === "string" ? request.query.episode : "";
  if (film && request.query.teaser === "1") {
    const teaser = { videoUrl: film.teaserUrl, videoProvider: film.teaserProvider, drmAssetId: film.teaserDrmAssetId ?? "", drmHlsUrl: "" };
    if (teaser.videoProvider !== "drm") { response.status(404).json({ error: "Protected screening not found" }); return null; }
    const config = buildDrmConfig(film.slug, "", teaser, true);
    if (!config) { response.status(503).json({ error: "Protected playback is being prepared for this title. Please try again later." }); return null; }
    return { asset: teaser, config };
  }
  if (!film || (film.contentType === "series" && !mongoose.isValidObjectId(episodeId))) {
    response.status(404).json({ error: "Screening not found" }); return null;
  }
  const asset = episodeId ? film.seasons.flatMap(season => season.episodes).find(episode => String(episode._id) === episodeId) : film;
  if (!asset || asset.videoProvider !== "drm") { response.status(404).json({ error: "Protected screening not found" }); return null; }
  const config = buildDrmConfig(film.slug, episodeId, asset);
  if (!config) { response.status(503).json({ error: "Protected playback is being prepared for this title. Please try again later." }); return null; }
  return { asset, config };
}
playbackRouter.get("/:slug/config", async (request, response, next) => {
  try { const selected = await selectedAsset(request, response); if (selected) response.json({ data: selected.config }); }
  catch (error) { next(error); }
});
export async function boundedResponse(upstream: globalThis.Response) {
  const reader = upstream.body?.getReader();
  if (!reader) throw new Error("Empty DRM response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024 * 1024) throw new Error("Oversized DRM response");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  if (!size) throw new Error("Empty DRM response");
  return Buffer.concat(chunks);
}
playbackRouter.get("/:slug/certificate", async (request, response) => {
  try {
    if (!await selectedAsset(request, response)) return;
    const upstream = await fetch(httpsUrl(process.env.DRM_FAIRPLAY_CERTIFICATE_URL)!, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!upstream.ok) { response.status(502).json({ error: "Protected playback is temporarily unavailable" }); return; }
    response.type("application/octet-stream").send(await boundedResponse(upstream));
  } catch { response.status(502).json({ error: "Protected playback is temporarily unavailable" }); }
});
playbackRouter.post("/:slug/license/:system", express.raw({ type: () => true, limit: "256kb" }), async (request, response) => {
  try {
    const system = String(request.params.system);
    if (!Object.hasOwn(DRM_SYSTEMS, system)) { response.status(400).json({ error: "Unsupported protection system" }); return; }
    if (!Buffer.isBuffer(request.body) || !request.body.length) { response.status(400).json({ error: "Missing playback challenge" }); return; }
    const selected = await selectedAsset(request, response);
    if (!selected) return;
    const url = licenseUpstream(system as DrmSystem, selected.asset.drmAssetId)!;
    const stored = localDrmUrl(selected.asset.videoUrl) ? await DrmKey.findOne({ keyId: selected.asset.drmAssetId.toLowerCase() }).lean() : null;
    const upstream = await fetch(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: licenseHeaders(system as DrmSystem, selected.asset.drmAssetId, stored?.encryptedKey ?? ""),
      body: new Uint8Array(request.body),
    });
    // Gateway must bind the challenge KIDs to this asset and enforce short-lived,
    // nonpersistent licenses plus the provider's output protection policies.
    if (!upstream.ok) { response.status(502).json({ error: "Playback license unavailable" }); return; }
    response.type("application/octet-stream").send(await boundedResponse(upstream));
  } catch { response.status(502).json({ error: "Playback license unavailable" }); }
});

playbackRouter.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
  if (error && typeof error === "object" && "status" in error && error.status === 413) {
    response.status(413).json({ error: "Playback challenge is too large" }); return;
  }
  next(error);
});
