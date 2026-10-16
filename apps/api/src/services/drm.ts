import { axinomCredentialsReady, createAxinomToken, uuid } from "./axinom.js";
export const DRM_SYSTEMS = {
  widevine: { keySystem: "com.widevine.alpha", env: "DRM_WIDEVINE_LICENSE_URL" },
  playready: { keySystem: "com.microsoft.playready", env: "DRM_PLAYREADY_LICENSE_URL" },
  fairplay: { keySystem: "com.apple.fps", env: "DRM_FAIRPLAY_LICENSE_URL" },
} as const;
export type DrmSystem = keyof typeof DRM_SYSTEMS;
export function httpsUrl(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
export function usingAxinom() { return process.env.DRM_PROVIDER === "axinom"; }
export function drmIsConfigured() {
  if (usingAxinom()) return process.env.DRM_ENABLED === "true" && axinomCredentialsReady() &&
    Object.keys(DRM_SYSTEMS).every(system => httpsUrl(process.env[`AXINOM_${system.toUpperCase()}_LICENSE_URL`])) &&
    Boolean(httpsUrl(process.env.DRM_FAIRPLAY_CERTIFICATE_URL));
  return process.env.DRM_ENABLED === "true" && Boolean(process.env.DRM_LICENSE_AUTHORIZATION) &&
    Object.values(DRM_SYSTEMS).every(system => httpsUrl(process.env[system.env]) && process.env[system.env]!.includes("{assetId}")) &&
    Boolean(httpsUrl(process.env.DRM_FAIRPLAY_CERTIFICATE_URL));
}
export function licenseUpstream(system: DrmSystem, assetId: string) {
  if (usingAxinom()) return httpsUrl(process.env[`AXINOM_${system.toUpperCase()}_LICENSE_URL`]);
  const template = process.env[DRM_SYSTEMS[system].env];
  if (!template || !template.includes("{assetId}")) return null;
  return httpsUrl(template.replaceAll("{assetId}", encodeURIComponent(assetId)));
}
// Videos packaged by SineSarili itself live under /uploads/drm/<keyId>/.
export function localDrmUrl(value: string | undefined) {
  return value && /^\/uploads\/drm\/[a-f0-9-]{36}\/manifest\.mpd$/i.test(value) ? value : null;
}
export function buildDrmConfig(slug: string, episodeId: string, asset: { videoUrl?: string; drmHlsUrl?: string; drmAssetId?: string }, teaser = false) {
  if (usingAxinom() && !uuid(asset.drmAssetId ?? "")) return null;
  const dashUrl = localDrmUrl(asset.videoUrl) ?? httpsUrl(asset.videoUrl);
  if (!drmIsConfigured() || !asset.drmAssetId || !dashUrl) return null;
  const base = `/api/playback/${encodeURIComponent(slug)}`;
  const query = teaser ? "?teaser=1" : episodeId ? `?episode=${encodeURIComponent(episodeId)}` : "";
  return {
    dashUrl, hlsUrl: httpsUrl(asset.drmHlsUrl) ?? "",
    servers: Object.fromEntries(Object.entries(DRM_SYSTEMS).map(([name, system]) => [system.keySystem, `${base}/license/${name}${query}`])),
    certificateUrl: `${base}/certificate${query}`,
  };
}

export function licenseHeaders(system: DrmSystem, assetId: string, encryptedKey = ""): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": system === "playready" && usingAxinom() ? "text/xml; charset=utf-8" : "application/octet-stream" };
  if (usingAxinom()) headers["X-AxDRM-Message"] = createAxinomToken(assetId, Date.now(), encryptedKey);
  else headers.Authorization = process.env.DRM_LICENSE_AUTHORIZATION!;
  return headers;
}
