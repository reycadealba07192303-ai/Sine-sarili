import { createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { del, get, put } from "@vercel/blob";
import { ensureUploadsDirectory, uploadsDirectory } from "../uploads.js";

/*
 * Where uploaded files live.
 * - On Vercel: two Vercel Blob stores. Public = artwork, teasers, and DRM-encrypted streams
 *   (safe to serve directly). Private = full-film masters and payment receipts.
 * - Locally (no Blob tokens): the apps/api/uploads folder, as before.
 */
export type UploadKind = "poster" | "backdrop" | "photo" | "qrcode" | "teaser" | "film" | "receipt";

const PRIVATE_KINDS = new Set<UploadKind>(["film", "receipt"]);
export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024 * 1024;

const publicToken = () => process.env.PUBLIC_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || "";
const privateToken = () => process.env.PRIVATE_BLOB_READ_WRITE_TOKEN || "";

/** Blob storage is used when both stores are configured; otherwise files go to local disk. */
export function blobStorageEnabled() {
  return Boolean(publicToken() && privateToken());
}
export function storageMode() {
  return blobStorageEnabled() ? "blob" : "local";
}
export function accessFor(kind: UploadKind): "public" | "private" {
  return PRIVATE_KINDS.has(kind) ? "private" : "public";
}
export function tokenFor(access: "public" | "private") {
  return access === "private" ? privateToken() : publicToken();
}
export function isVideoKind(kind: string) {
  return kind === "teaser" || kind === "film";
}
export function isUploadKind(kind: string): kind is UploadKind {
  return ["poster", "backdrop", "photo", "qrcode", "teaser", "film", "receipt"].includes(kind);
}

export const isPrivateBlobUrl = (url: string | undefined | null) => Boolean(url && /^https:\/\/[a-z0-9-]+\.private\.blob\.vercel-storage\.com\//i.test(url));
export const isPublicBlobUrl = (url: string | undefined | null) => Boolean(url && /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url));
/** A video SineSarili stored itself (and can therefore encrypt): a local upload or one of our blobs. */
export const isManagedVideoUrl = (url: string | undefined | null) =>
  Boolean(url && (/^\/uploads\/[a-zA-Z0-9-]+\.(mp4|m4v|mov|webm)$/i.test(url) || ((isPrivateBlobUrl(url) || isPublicBlobUrl(url)) && /\/(films|teasers)\//.test(url) && /\.(mp4|m4v|mov|webm)$/i.test(url))));

/** Saves a small upload (images, receipts) that arrived through the API itself. Returns its URL. */
export async function saveUpload(kind: UploadKind, filename: string, body: Readable, contentType: string, maxBytes: number) {
  let receivedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      callback(receivedBytes > maxBytes ? Object.assign(new Error("Upload is too large"), { status: 413 }) : null, chunk);
    },
  });

  if (blobStorageEnabled()) {
    const chunks: Buffer[] = [];
    await pipeline(body, sizeGuard, new Transform({ transform(chunk: Buffer, _e, callback) { chunks.push(chunk); callback(); } }));
    const access = accessFor(kind);
    const blob = await put(`${kind}s/${filename}`, Buffer.concat(chunks), { access, token: tokenFor(access), contentType, addRandomSuffix: false });
    return { url: blob.url, size: receivedBytes };
  }

  await ensureUploadsDirectory();
  const destination = path.join(uploadsDirectory, filename);
  try {
    await pipeline(body, sizeGuard, createWriteStream(destination, { flags: "wx" }));
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    throw error;
  }
  return { url: `/uploads/${filename}`, size: receivedBytes };
}

/** Reads a stored file (local or private/public blob) fully into memory. */
export async function readStoredFile(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (url.startsWith("/uploads/")) {
    const name = path.basename(url);
    try { return { data: await readFile(path.join(uploadsDirectory, name)), contentType: "" }; } catch { return null; }
  }
  const access = isPrivateBlobUrl(url) ? "private" : isPublicBlobUrl(url) ? "public" : null;
  if (!access) return null;
  const result = await get(url, { access, token: tokenFor(access) });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const data = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { data, contentType: result.blob.contentType ?? "" };
}

/** Streams a private blob (e.g. a receipt image) to an HTTP response. */
export async function openPrivateBlob(url: string) {
  if (!isPrivateBlobUrl(url)) return null;
  const result = await get(url, { access: "private", token: privateToken() });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return { stream: Readable.fromWeb(result.stream as import("node:stream/web").ReadableStream), contentType: result.blob.contentType ?? "application/octet-stream" };
}

export async function deleteStoredFile(url: string) {
  if (isPrivateBlobUrl(url)) await del(url, { token: privateToken() }).catch(() => undefined);
  else if (isPublicBlobUrl(url)) await del(url, { token: publicToken() }).catch(() => undefined);
}
