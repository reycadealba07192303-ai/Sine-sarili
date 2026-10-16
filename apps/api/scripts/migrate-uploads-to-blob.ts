/*
 * One-time move of local uploads (apps/api/uploads) into Vercel Blob, rewriting every
 * "/uploads/..." link in the database to its new Blob URL.
 *
 * Run from apps/api after adding PUBLIC_BLOB_READ_WRITE_TOKEN and PRIVATE_BLOB_READ_WRITE_TOKEN
 * to apps/api/.env:
 *   node --env-file=.env --import tsx scripts/migrate-uploads-to-blob.ts          (dry run)
 *   node --env-file=.env --import tsx scripts/migrate-uploads-to-blob.ts --write  (do it)
 *
 * Safe to run again: links that already point to Blob are left alone.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import { BankAccount } from "../src/models/bank-account.js";
import { Director } from "../src/models/director.js";
import { Film } from "../src/models/film.js";
import { PaymentSubmission } from "../src/models/payment-submission.js";
import { tokenFor } from "../src/services/storage.js";
import { uploadsDirectory } from "../src/uploads.js";

const write = process.argv.includes("--write");
if (!process.env.PUBLIC_BLOB_READ_WRITE_TOKEN || !process.env.PRIVATE_BLOB_READ_WRITE_TOKEN) {
  console.error("Set PUBLIC_BLOB_READ_WRITE_TOKEN and PRIVATE_BLOB_READ_WRITE_TOKEN in apps/api/.env first.");
  process.exit(1);
}

const CONTENT_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mpd": "application/dash+xml", ".vtt": "text/vtt", ".srt": "text/plain" };
const moved = new Map<string, string>();

/** Decides where a local file goes, based on which field links to it. */
function destination(localUrl: string, fieldPath: string): { access: "public" | "private"; pathname: string } {
  const name = path.basename(localUrl);
  if (name.startsWith("receipt-")) return { access: "private", pathname: `receipts/${name}` };
  const isVideo = /\.(mp4|m4v|mov|webm)$/i.test(name);
  if (isVideo && /teaser/i.test(fieldPath)) return { access: "public", pathname: `teasers/${name}` };
  if (isVideo) return { access: "private", pathname: `films/${name}` };
  if (/subtitle/i.test(fieldPath)) return { access: "public", pathname: `subtitles/${name}` };
  return { access: "public", pathname: `${fieldPath.split(".").pop()!.replace(/Url$/, "").toLowerCase()}s/${name}` };
}

async function upload(localPath: string, pathname: string, access: "public" | "private") {
  const data = await readFile(localPath);
  const blob = await put(pathname, data, { access, token: tokenFor(access), addRandomSuffix: false, allowOverwrite: true, contentType: CONTENT_TYPES[path.extname(localPath).toLowerCase()] ?? "application/octet-stream", multipart: data.length > 100 * 1024 * 1024 });
  return blob.url;
}

async function migrateUrl(localUrl: string, fieldPath: string) {
  if (moved.has(localUrl)) return moved.get(localUrl)!;
  const drm = /^\/uploads\/drm\/([a-f0-9-]{36})\/manifest\.mpd$/i.exec(localUrl);
  if (drm) {
    // An encrypted stream: copy the whole folder so the manifest's relative links keep working.
    const folder = path.join(uploadsDirectory, "drm", drm[1]);
    if (!existsSync(folder)) { console.warn(`  missing folder for ${localUrl}`); return null; }
    let manifest = "";
    for (const file of await readdir(folder)) {
      const url = write ? await upload(path.join(folder, file), `drm/${drm[1]}/${file}`, "public") : `(public) drm/${drm[1]}/${file}`;
      if (file === "manifest.mpd") manifest = url;
    }
    moved.set(localUrl, manifest);
    return manifest;
  }
  const localPath = path.join(uploadsDirectory, path.basename(localUrl));
  if (!existsSync(localPath)) { console.warn(`  missing file for ${localUrl}`); return null; }
  const target = destination(localUrl, fieldPath);
  const url = write ? await upload(localPath, target.pathname, target.access) : `(${target.access}) ${target.pathname}`;
  moved.set(localUrl, url);
  return url;
}

/** Finds every "/uploads/..." string in a document and returns { "a.b.0.c": "/uploads/x" }. */
function findLocalLinks(value: unknown, prefix = "", found: Record<string, string> = {}) {
  if (typeof value === "string" && value.startsWith("/uploads/")) found[prefix] = value;
  else if (Array.isArray(value)) value.forEach((item, index) => findLocalLinks(item, prefix ? `${prefix}.${index}` : String(index), found));
  else if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    for (const [key, item] of Object.entries(value)) if (key !== "_id") findLocalLinks(item, prefix ? `${prefix}.${key}` : key, found);
  }
  return found;
}

await connectDatabase();
const collections: [string, mongoose.Model<any>][] = [["films", Film], ["directors", Director], ["bank accounts", BankAccount], ["payment submissions", PaymentSubmission]];
let changed = 0;
for (const [label, model] of collections) {
  for (const doc of await model.find().lean()) {
    const links = findLocalLinks(doc);
    if (!Object.keys(links).length) continue;
    const updates: Record<string, string> = {};
    for (const [fieldPath, localUrl] of Object.entries(links)) {
      const url = await migrateUrl(localUrl, fieldPath);
      if (url) { updates[fieldPath] = url; console.log(`${label} ${doc._id} ${fieldPath}: ${localUrl} -> ${url}`); }
    }
    if (write && Object.keys(updates).length) { await model.updateOne({ _id: doc._id }, { $set: updates }); changed += 1; }
  }
}
console.log(write ? `Done. Updated ${changed} record(s).` : "Dry run only. Re-run with --write to upload files and update the database.");
process.exit(0);
