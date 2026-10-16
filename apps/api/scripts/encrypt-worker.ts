/*
 * DRM encryption worker for hosted (Vercel) deployments. Runs in GitHub Actions
 * (.github/workflows/encrypt-videos.yml) because Vercel Functions can't run Shaka Packager
 * on full-length films.
 *
 * Required env: SINESARILI_API_URL, DRM_WORKER_SECRET, PUBLIC_BLOB_READ_WRITE_TOKEN,
 * PRIVATE_BLOB_READ_WRITE_TOKEN, PACKAGER (path to the packager binary).
 */
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { promisify } from "node:util";
import { get, put } from "@vercel/blob";

type Job = { filmId: string; title: string; target: "film" | "teaser" | "episode"; seasonId?: string; episodeId?: string; sourceUrl: string; access: "public" | "private" };

const run = promisify(execFile);
const env = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
};
const apiUrl = env("SINESARILI_API_URL").replace(/\/$/, "");
const secret = env("DRM_WORKER_SECRET");
const publicToken = env("PUBLIC_BLOB_READ_WRITE_TOKEN");
const privateToken = env("PRIVATE_BLOB_READ_WRITE_TOKEN");
const packager = env("PACKAGER");

async function api(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}/api/internal/drm${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} failed (${response.status}): ${body.error ?? "unknown error"}`);
  return body.data;
}

async function download(job: Job, destination: string) {
  const result = await get(job.sourceUrl, { access: job.access, token: job.access === "private" ? privateToken : publicToken });
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Source video could not be downloaded");
  await pipeline(Readable.fromWeb(result.stream as WebReadableStream), createWriteStream(destination));
}

async function packageVideo(source: string, outDir: string, keyId: string, contentKey: Buffer) {
  const keyArgs = [
    "--enable_raw_key_encryption",
    "--keys", `label=:key_id=${keyId.replaceAll("-", "")}:key=${contentKey.toString("hex")}`,
    "--protection_systems", "Widevine,PlayReady",
    "--clear_lead", "0",
    "--mpd_output", path.join(outDir, "manifest.mpd"),
  ];
  const video = `in=${source},stream=video,output=${path.join(outDir, "video.mp4")}`;
  const audio = `in=${source},stream=audio,output=${path.join(outDir, "audio.mp4")}`;
  const options = { timeout: 3 * 60 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 };
  try { await run(packager, [video, audio, ...keyArgs], options); }
  catch { await run(packager, [video, ...keyArgs], options); } // silent videos have no audio track
}

async function uploadOutput(outDir: string, keyId: string) {
  let manifestUrl = "";
  for (const name of await readdir(outDir)) {
    const file = path.join(outDir, name);
    const { size } = await stat(file);
    const blob = await put(`drm/${keyId}/${name}`, createReadStream(file), {
      access: "public",
      token: publicToken,
      addRandomSuffix: false,
      contentType: name.endsWith(".mpd") ? "application/dash+xml" : "video/mp4",
      multipart: size > 100 * 1024 * 1024,
    });
    if (name === "manifest.mpd") manifestUrl = blob.url;
  }
  if (!manifestUrl) throw new Error("Packager did not produce a manifest");
  return manifestUrl;
}

async function processJob(job: Job) {
  const workDir = await mkdtemp(path.join(tmpdir(), "sinesarili-drm-"));
  try {
    const source = path.join(workDir, `source${path.extname(new URL(job.sourceUrl).pathname) || ".mp4"}`);
    const outDir = path.join(workDir, "out");
    console.log(`Downloading ${job.title} (${job.target})…`);
    await download(job, source);
    const keyId = randomUUID();
    const contentKey = randomBytes(16);
    console.log("Encrypting…");
    await mkdir(outDir, { recursive: true });
    await packageVideo(source, outDir, keyId, contentKey);
    console.log("Uploading encrypted stream…");
    const manifestUrl = await uploadOutput(outDir, keyId);
    const result = await api("/complete", {
      method: "POST",
      body: JSON.stringify({ filmId: job.filmId, target: job.target, seasonId: job.seasonId, episodeId: job.episodeId, sourceUrl: job.sourceUrl, keyId, contentKeyHex: contentKey.toString("hex"), manifestUrl }),
    });
    console.log(result.applied ? `Protected: ${job.title}` : `Skipped (video changed while encrypting): ${job.title}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const jobs = (await api("/queue")) as Job[];
console.log(`${jobs.length} video(s) waiting for encryption.`);
let failures = 0;
for (const job of jobs) {
  try {
    await processJob(job);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not protect ${job.title}: ${message}`);
    await api("/failed", { method: "POST", body: JSON.stringify({ sourceUrl: job.sourceUrl, error: message }) }).catch(() => undefined);
  }
}
if (failures) process.exitCode = 1;
