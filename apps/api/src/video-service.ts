/**
 * SineSarili Video Streaming & Provider Service Layer
 * Abstracts video streaming, provider detection, embed generation,
 * and security validation without hardcoding providers.
 */

export type VideoProviderType = "direct" | "youtube" | "vimeo" | "hls" | "embed" | "external" | "drm";

export interface VideoPlaybackMetadata {
  provider: VideoProviderType;
  streamUrl: string;
  embedUrl: string | null;
  isDirectPlayable: boolean;
  subtitlesUrl?: string;
  isRestricted: boolean;
  allowed: boolean;
  errorMessage?: string;
}

/**
 * Detects the video provider and normalizes stream/embed URLs.
 */
export function resolveVideoSource(
  rawUrl: string,
  preferredProvider?: VideoProviderType,
  subtitlesUrl?: string,
  isRestricted: boolean = false,
  isAuthenticatedViewer: boolean = false
): VideoPlaybackMetadata {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      provider: "direct",
      streamUrl: "",
      embedUrl: null,
      isDirectPlayable: false,
      isRestricted,
      allowed: false,
      errorMessage: "No video source configured for this title.",
    };
  }

  const url = rawUrl.trim();

  // If restricted, check access
  if (isRestricted && !isAuthenticatedViewer) {
    return {
      provider: "direct",
      streamUrl: "",
      embedUrl: null,
      isDirectPlayable: false,
      isRestricted: true,
      allowed: false,
      errorMessage: "This video requires viewer authentication or administrative clearance.",
    };
  }

  if (preferredProvider === "drm") return { provider: "drm", streamUrl: "", embedUrl: null, isDirectPlayable: false, isRestricted, allowed: true };

  // YouTube detection
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch || preferredProvider === "youtube") {
    const videoId = ytMatch ? ytMatch[1] : url;
    return {
      provider: "youtube",
      streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`,
      isDirectPlayable: false,
      subtitlesUrl,
      isRestricted,
      allowed: true,
    };
  }

  // Vimeo detection
  const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/);
  if (vimeoMatch || preferredProvider === "vimeo") {
    const videoId = vimeoMatch ? vimeoMatch[3] : url;
    return {
      provider: "vimeo",
      streamUrl: `https://vimeo.com/${videoId}`,
      embedUrl: `https://player.vimeo.com/video/${videoId}?dnt=1`,
      isDirectPlayable: false,
      subtitlesUrl,
      isRestricted,
      allowed: true,
    };
  }

  // HLS stream (.m3u8)
  if (url.includes(".m3u8") || preferredProvider === "hls") {
    return {
      provider: "hls",
      streamUrl: url,
      embedUrl: null,
      isDirectPlayable: true,
      subtitlesUrl,
      isRestricted,
      allowed: true,
    };
  }

  // Direct MP4 / WebM / local uploads (/uploads/*)
  const isDirect = url.startsWith("/uploads/") || url.endsWith(".mp4") || url.endsWith(".webm") || preferredProvider === "direct";
  return {
    provider: isDirect ? "direct" : "external",
    streamUrl: url,
    embedUrl: preferredProvider === "embed" ? url : null,
    isDirectPlayable: isDirect,
    subtitlesUrl,
    isRestricted,
    allowed: true,
  };
}

