import { upload } from "@vercel/blob/client";

export type MediaKind = "poster" | "backdrop" | "photo" | "qrcode" | "teaser" | "film";

let storageMode: Promise<"blob" | "local"> | null = null;

/** "blob" on Vercel (files go straight from the browser to Vercel Blob), "local" in development. */
function getStorageMode() {
  storageMode ??= fetch("/api/admin/storage", { cache: "no-store" })
    .then(async (response) => (response.ok ? ((await response.json()) as { data: { mode: "blob" | "local" } }).data.mode : "local"))
    .catch(() => "local" as const);
  return storageMode;
}

const safeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";

/**
 * Uploads an admin media file and returns the URL to save on the record.
 * Full films go to the private store (encrypted later); everything else is public.
 */
export async function uploadMedia(kind: MediaKind, file: File, onProgress?: (percent: number) => void): Promise<string> {
  if ((await getStorageMode()) === "blob") {
    const blob = await upload(`${kind}s/${safeName(file.name)}`, file, {
      access: kind === "film" ? "private" : "public",
      handleUploadUrl: "/api/admin/blob-upload",
      clientPayload: JSON.stringify({ kind }),
      contentType: file.type || undefined,
      multipart: file.size > 100 * 1024 * 1024,
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(Math.round(percentage)) : undefined,
    });
    return blob.url;
  }

  const response = await fetch(`/api/admin/uploads/${kind}`, {
    method: "POST",
    headers: { "Content-Type": file.type || (kind === "film" || kind === "teaser" ? "video/mp4" : "image/jpeg") },
    body: file,
  });
  const data = (await response.json().catch(() => ({}))) as { data?: { url: string }; error?: string };
  if (!response.ok || !data.data) throw new Error(data.error || "Upload failed");
  return data.data.url;
}

/** Shrinks large photos (e.g. phone screenshots) so they fit the hosted 4 MB upload limit. */
export async function shrinkImage(file: File, maxBytes = 3.5 * 1024 * 1024): Promise<File> {
  if (file.size <= maxBytes || !file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }
  return file;
}

/** Private receipts are shown to admins through an authenticated API route. */
export function receiptImageSrc(url: string) {
  return /^https:\/\/[a-z0-9-]+\.private\.blob\.vercel-storage\.com\//i.test(url) ? `/api/admin/receipt-image?url=${encodeURIComponent(url)}` : url;
}

/** True for a protected (DRM) stream SineSarili encrypted itself, locally or on Vercel Blob. */
export const isEncryptedStream = (url: string) => /\/drm\/[a-f0-9-]{36}\/manifest\.mpd$/i.test(url);
/** True for a video file SineSarili stored itself, which gets encrypted automatically. */
export const isStoredVideo = (url: string) => url.startsWith("/uploads/") || /\.blob\.vercel-storage\.com\/(films|teasers)\//i.test(url);
