"use client";

import { useEffect, useRef, useState } from "react";
import { useDrmPlayback } from "@/components/use-drm-playback";
import { Maximize, Minimize, ShieldCheck } from "lucide-react";
import "@/app/playback-privacy.css";

export interface VideoPlayerProps {
  filmSlug: string;
  filmTitle: string;
  videoUrl?: string;
  videoProvider?: "direct" | "youtube" | "vimeo" | "hls" | "embed" | "external" | "drm";
  subtitlesUrl?: string;
  posterUrl?: string;
  isRestricted?: boolean;
  autoPlay?: boolean;
  fitToContainer?: boolean;
  trackHistory?: boolean;
  episodeId?: string;
  episodeLabel?: string;
  isTeaser?: boolean;
}

export function VideoPlayer({
  filmSlug,
  filmTitle,
  videoUrl = "",
  videoProvider = "direct",
  subtitlesUrl = "",
  posterUrl = "",
  isRestricted = false,
  autoPlay = false,
  fitToContainer = false,
  trackHistory = false,
  episodeId = "",
  episodeLabel = "",
  isTeaser = false,
}: VideoPlayerProps) {
  const lastProgressAt = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { drmError, drmReady, retryDrm } = useDrmPlayback(videoRef, videoProvider === "drm" && !isRestricted, filmSlug, episodeId, autoPlay, isTeaser);
  // Start protected playback only after the "ready" state has rendered; playing earlier
  // hits the onPlay guard below, which still sees the old not-ready state and pauses.
  useEffect(() => {
    if (!drmReady || !autoPlay || document.hidden || videoRef.current?.closest(".is-shielded")) return;
    void videoRef.current?.play().catch(() => undefined);
  }, [drmReady, autoPlay]);
  const protectionEnabled = trackHistory || videoProvider === "drm";

  const [privacyShield, setPrivacyShield] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const trackEvent = async (
    eventType: "page_view" | "video_start" | "video_progress" | "video_complete" | "playback_error",
    errorMessage?: string
  ) => {
    try {
      await fetch(`/api/films/${encodeURIComponent(filmSlug)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          durationSeconds: videoRef.current ? Math.round(videoRef.current.duration || 0) : 0,
          progressSeconds: videoRef.current ? Math.round(videoRef.current.currentTime || 0) : 0,
          errorMessage: errorMessage || "",
          trackHistory,
          episodeId,
          episodeLabel,
        }),
        keepalive: true,
      });
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    trackEvent("page_view");
  }, [filmSlug]);

  // This is a browser-level deterrent, not OS screenshot/recording detection or DRM.
  useEffect(() => {
    if (!protectionEnabled || !videoUrl || isRestricted) return;
    function shield() {
      containerRef.current?.classList.add("is-shielded");
      videoRef.current?.pause();
      setPrivacyShield(true);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    }
    function visibility() { if (document.hidden) shield(); }
    function blur() {
      // Clicking embedded player controls transfers focus to the iframe.
      if (document.activeElement?.tagName !== "IFRAME") shield();
    }
    function shortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      // The OS grabs Win+Shift+S, Win+PrtSc and Win+Alt+R before the browser sees the last key,
      // so the screen is covered as soon as the Windows/Command key goes down.
      if (key === "meta" || key === "os" || event.metaKey) { shield(); return; }
      if (key === "printscreen") {
        event.preventDefault(); shield();
        // PrintScreen copies to the clipboard; replace what it captured.
        void navigator.clipboard?.writeText("Screenshots are disabled during SineSarili screenings.").catch(() => undefined);
      }
    }
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("keydown", shortcut, true);
    window.addEventListener("keyup", shortcut, true);
    window.addEventListener("beforeprint", shield);
    if (document.hidden) shield();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", shortcut, true);
      window.removeEventListener("keyup", shortcut, true);
      window.removeEventListener("beforeprint", shield);
    };
  }, [protectionEnabled, videoUrl, isRestricted]);

  // Fullscreen the whole player (not just the <video>) so the watermark and privacy shield come along.
  // It must be requested straight from the click; browsers refuse fullscreen requests made later.
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement) && document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => undefined); return; }
    if (container.requestFullscreen) { void container.requestFullscreen().catch(() => undefined); return; }
    // iPhone Safari has no element fullscreen; fall back to the native video player.
    (videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
  }
  const fullscreenButton = protectionEnabled ? (
    <button type="button" className="playback-fullscreen" aria-label={isFullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
    </button>
  ) : null;

  // Visible forensic watermark: a recording made anyway still shows whose account it came from.
  const [viewerMark, setViewerMark] = useState("");
  const [markSpot, setMarkSpot] = useState(0);
  useEffect(() => {
    if (!protectionEnabled || !videoUrl || isRestricted) return;
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { data?: { email?: string } }).data?.email ?? "" : ""))
      .then((email) => { if (!cancelled && email) setViewerMark(email); })
      .catch(() => undefined);
    const timer = window.setInterval(() => setMarkSpot((spot) => (spot + 1 + Math.floor(Math.random() * 4)) % 5), 9000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [protectionEnabled, videoUrl, isRestricted]);
  const watermark = viewerMark ? <div className={`playback-watermark spot-${markSpot}`} aria-hidden="true">{viewerMark} · SineSarili</div> : null;

  const privacyOverlay = protectionEnabled ? <div className="playback-privacy-shield" role={privacyShield ? "status" : undefined}>
    <ShieldCheck size={32} aria-hidden="true" />
    <strong>Your screening is paused.</strong>
    <p>Return to this window to continue watching.</p>
    <button type="button" onClick={() => {
      if (document.hidden || !document.hasFocus()) return;
      containerRef.current?.classList.remove("is-shielded");
      setPrivacyShield(false);
      videoRef.current?.play().catch(() => undefined);
    }}>Continue watching</button>
  </div> : null;

  // Detect YouTube or Vimeo
  const isEmbed =
    videoProvider !== "drm" && (videoProvider === "youtube" ||
    videoProvider === "vimeo" ||
    videoProvider === "embed" ||
    videoUrl.includes("youtube.com") ||
    videoUrl.includes("youtu.be") ||
    videoUrl.includes("vimeo.com"));

  let embedSrc = videoUrl;
  if (isEmbed) {
    const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch) {
      embedSrc = `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&rel=0&modestbranding=1`;
    }
    const vimeoMatch = videoUrl.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/);
    if (vimeoMatch) {
      embedSrc = `https://player.vimeo.com/video/${vimeoMatch[3]}?autoplay=1&dnt=1`;
    }
  }

  // 1. Missing video
  if (!videoUrl) {
    return (
      <div className="play-unavailable">
        <span aria-hidden="true">▶</span>
        <div>
          <strong>Coming soon to SineSarili</strong>
          <p>We’re preparing this film for online viewing.</p>
        </div>
      </div>
    );
  }

  // 2. Restricted video
  if (isRestricted) {
    return (
      <div className="play-unavailable" style={{ borderColor: "#21226b", background: "#101020" }}>
        <span aria-hidden="true" style={{ color: "#8a8bf5" }}>⚠</span>
        <div>
          <strong style={{ color: "#a1a2f7" }}>Restricted Screening</strong>
          <p>This film is currently limited to authorized screenings or authenticated viewers.</p>
        </div>
      </div>
    );
  }

  // 3. Embed iframe
  if (isEmbed) {
    return (
      <div
        ref={containerRef}
        className={protectionEnabled ? `protected-screening${privacyShield ? " is-shielded" : ""}` : undefined}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: fitToContainer ? undefined : "16/9",
          height: fitToContainer ? "100%" : undefined,
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #ffffff25",
          background: "#000",
          boxShadow: "0 15px 40px rgba(0,0,0,0.7)",
        }}
      >
        {(!trackHistory || !privacyShield) && <iframe
          src={embedSrc}
          title={filmTitle}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0 }}
          onLoad={() => trackEvent("video_start")}
        />}
        {watermark}
        {privacyOverlay}
      </div>
    );
  }

  // 4. HTML5 Direct Video
  return (
    <div
      ref={containerRef}
      className={protectionEnabled ? `protected-screening${privacyShield ? " is-shielded" : ""}` : undefined}
      style={{
        position: "relative",
        width: "100%",
        height: fitToContainer ? "100%" : undefined,
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid #ffffff25",
        background: "#000",
        boxShadow: "0 15px 40px rgba(0,0,0,0.7)",
      }}
    >
      <video
        ref={videoRef}
        onDoubleClick={protectionEnabled ? (event) => { event.preventDefault(); toggleFullscreen(); } : undefined}
        controls
        controlsList={protectionEnabled ? "nodownload noremoteplayback nofullscreen" : undefined}
        disablePictureInPicture={protectionEnabled}
        disableRemotePlayback={protectionEnabled}
        autoPlay={videoProvider === "drm" ? false : autoPlay}
        playsInline
        preload="metadata"
        poster={posterUrl}
        src={videoProvider === "drm" ? undefined : videoUrl}
        onPlay={() => {
          if (videoProvider === "drm" && !drmReady) { videoRef.current?.pause(); return; }
          setIsPlaying(true);
          if (!hasStarted) {
            setHasStarted(true);
            trackEvent("video_start");
          }
        }}
        onPause={() => {
          setIsPlaying(false);
          if (trackHistory && !videoRef.current?.ended) trackEvent("video_progress");
        }}
        onTimeUpdate={() => {
          if (!trackHistory || Date.now() - lastProgressAt.current < 30000) return;
          lastProgressAt.current = Date.now();
          trackEvent("video_progress");
        }}
        onEnded={() => {
          setIsPlaying(false);
          trackEvent("video_complete");
        }}
        onError={() => {
          setPlaybackError("Unable to load video stream. The source may be unavailable or blocked.");
          trackEvent("playback_error", "HTML5 video error");
        }}
        style={{ visibility: videoProvider === "drm" && !drmReady ? "hidden" : undefined, width: "100%", display: "block", height: fitToContainer ? "100%" : undefined, maxHeight: fitToContainer ? "none" : "72vh", objectFit: "contain" }}
      >
        {subtitlesUrl && (
          <track src={subtitlesUrl} kind="subtitles" srcLang="en" label="English" default />
        )}
        Your browser does not support HTML5 video streaming.
      </video>

      {watermark}
      {fullscreenButton}
      {privacyOverlay}
      {videoProvider === "drm" && !drmReady && !drmError && <div className="drm-loading" role="status">Preparing your protected screening...</div>}
      {(playbackError || drmError) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(14,14,18,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <span style={{ color: "#ff4d88", fontSize: "24px", marginBottom: "8px" }}>⚠</span>
          <p style={{ color: "#f0f0f3", fontSize: "12px", marginBottom: "12px" }}>{drmError || playbackError}</p>
          <button
            className="button button-primary"
            onClick={() => {
              if (videoProvider === "drm") { retryDrm(); return; }
              setPlaybackError(null);
              if (videoRef.current) {
                videoRef.current.load();
                videoRef.current.play().catch(() => {});
              }
            }}
          >
            Retry Playback
          </button>
        </div>
      )}
    </div>
  );
}
