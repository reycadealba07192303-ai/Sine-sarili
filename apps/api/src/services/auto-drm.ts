import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Film } from "../models/film.js";
import { DrmKey } from "../models/drm-key.js";
import { uploadsDirectory } from "../uploads.js";
import { encryptContentKey } from "./axinom.js";
import { drmIsConfigured } from "./drm.js";

const run = promisify(execFile);
const packager = fileURLToPath(new URL(`../../bin/packager${process.platform === "win32" ? ".exe" : ""}`, import.meta.url));
// Clear masters are moved out of the public uploads folder once they are encrypted.
const mastersDirectory = fileURLToPath(new URL("../../private-masters/", import.meta.url));
const UPLOADED_VIDEO = /^\/uploads\/([a-zA-Z0-9-]+\.(?:mp4|m4v|mov|webm))$/i;
const failed = new Set<string>();
let running = false;

async function packageVideo(sourceUrl: string) {
  const fileName = UPLOADED_VIDEO.exec(sourceUrl)![1];
  const source = path.join(uploadsDirectory, fileName);
  if (!existsSync(source)) throw new Error(`Missing upload ${fileName}`);
  const keyId = randomUUID();
  const contentKey = randomBytes(16);
  const outDir = path.join(uploadsDirectory, "drm", keyId);
  await mkdir(outDir, { recursive: true });
  const keyArgs = [
    "--enable_raw_key_encryption",
    "--keys", `label=:key_id=${keyId.replaceAll("-", "")}:key=${contentKey.toString("hex")}`,
    "--protection_systems", "Widevine,PlayReady",
    "--clear_lead", "0",
    "--mpd_output", path.join(outDir, "manifest.mpd"),
  ];
  const video = `in=${source},stream=video,output=${path.join(outDir, "video.mp4")}`;
  const audio = `in=${source},stream=audio,output=${path.join(outDir, "audio.mp4")}`;
  try {
    await run(packager, [video, audio, ...keyArgs], { timeout: 60 * 60 * 1000, windowsHide: true });
  } catch {
    // Silent videos have no audio stream.
    await run(packager, [video, ...keyArgs], { timeout: 60 * 60 * 1000, windowsHide: true });
  }
  await DrmKey.create({ keyId, encryptedKey: encryptContentKey(keyId, contentKey), sourceUrl });
  return { keyId, manifestUrl: `/uploads/drm/${keyId}/manifest.mpd`, source, fileName, outDir };
}

async function retireMaster(source: string, fileName: string) {
  const url = `/uploads/${fileName}`;
  // A teaser or another title may still point at the same file.
  if (await Film.exists({ $or: [{ videoUrl: url }, { teaserUrl: url }, { "seasons.episodes.videoUrl": url }] })) return;
  await mkdir(mastersDirectory, { recursive: true });
  await rename(source, path.join(mastersDirectory, fileName)).catch(() => undefined);
}

/** Encrypts every uploaded full film and episode that is still a plain video file. */
export async function protectUploadedVideos() {
  if (running || !drmIsConfigured() || !existsSync(packager)) return;
  running = true;
  try {
    const films = await Film.find({ $or: [
      { videoProvider: "direct", videoUrl: UPLOADED_VIDEO },
      { "seasons.episodes": { $elemMatch: { videoProvider: "direct", videoUrl: UPLOADED_VIDEO } } },
      { teaserProvider: "direct", teaserUrl: UPLOADED_VIDEO },
    ] }).select("title videoUrl videoProvider teaserUrl teaserProvider seasons");
    for (const film of films) {
      if (film.teaserProvider === "direct" && UPLOADED_VIDEO.test(film.teaserUrl ?? "") && !failed.has(film.teaserUrl!)) {
        const sourceUrl = film.teaserUrl!;
        try {
          const done = await packageVideo(sourceUrl);
          const updated = await Film.updateOne({ _id: film._id, teaserUrl: sourceUrl }, { $set: { teaserUrl: done.manifestUrl, teaserProvider: "drm", teaserDrmAssetId: done.keyId } });
          if (updated.modifiedCount) await retireMaster(done.source, done.fileName);
          else await rm(done.outDir, { recursive: true, force: true });
          console.log(`DRM: protected teaser of "${film.title}"`);
        } catch (error) {
          failed.add(sourceUrl);
          console.error(`DRM: could not protect teaser of "${film.title}"`, error instanceof Error ? error.message : error);
        }
      }
      if (film.videoProvider === "direct" && UPLOADED_VIDEO.test(film.videoUrl ?? "") && !failed.has(film.videoUrl!)) {
        const sourceUrl = film.videoUrl!;
        try {
          const done = await packageVideo(sourceUrl);
          const updated = await Film.updateOne({ _id: film._id, videoUrl: sourceUrl }, { $set: { videoUrl: done.manifestUrl, videoProvider: "drm", drmAssetId: done.keyId } });
          if (updated.modifiedCount) await retireMaster(done.source, done.fileName);
          else await rm(done.outDir, { recursive: true, force: true });
          console.log(`DRM: protected "${film.title}"`);
        } catch (error) {
          failed.add(sourceUrl);
          console.error(`DRM: could not protect "${film.title}"`, error instanceof Error ? error.message : error);
        }
      }
      for (const season of film.seasons ?? []) {
        for (const episode of season.episodes ?? []) {
          const sourceUrl = episode.videoUrl ?? "";
          if (episode.videoProvider !== "direct" || !UPLOADED_VIDEO.test(sourceUrl) || failed.has(sourceUrl)) continue;
          try {
            const done = await packageVideo(sourceUrl);
            const updated = await Film.updateOne(
              { _id: film._id },
              { $set: { "seasons.$[s].episodes.$[e].videoUrl": done.manifestUrl, "seasons.$[s].episodes.$[e].videoProvider": "drm", "seasons.$[s].episodes.$[e].drmAssetId": done.keyId } },
              { arrayFilters: [{ "s._id": season._id }, { "e._id": episode._id, "e.videoUrl": sourceUrl }] },
            );
            if (updated.modifiedCount) await retireMaster(done.source, done.fileName);
            else await rm(done.outDir, { recursive: true, force: true });
            console.log(`DRM: protected "${film.title}" S${season.number}E${episode.number}`);
          } catch (error) {
            failed.add(sourceUrl);
            console.error(`DRM: could not protect "${film.title}" S${season.number}E${episode.number}`, error instanceof Error ? error.message : error);
          }
        }
      }
    }
  } finally {
    running = false;
  }
}
