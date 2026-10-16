"use client";

import { useEffect, useState, type RefObject } from "react";
import type shaka from "shaka-player";

type DrmConfig = { dashUrl: string; hlsUrl: string; servers: Record<string, string>; certificateUrl: string };
export function useDrmPlayback(videoRef: RefObject<HTMLVideoElement | null>, enabled: boolean, slug: string, episodeId: string, autoPlay: boolean, teaser = false) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let player: shaka.Player | null = null;
    const controller = new AbortController();
    setReady(false); setError(null);
    async function load() {
      try {
        if (!window.isSecureContext) throw new Error("Protected playback requires a secure HTTPS connection.");
        const response = await fetch(`/api/playback/${encodeURIComponent(slug)}/config${teaser ? "?teaser=1" : episodeId ? `?episode=${encodeURIComponent(episodeId)}` : ""}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { data?: DrmConfig; error?: string };
        if (!response.ok || !result.data) throw new Error(result.error ?? "Protected playback is temporarily unavailable.");
        const config = result.data;
        const { default: shaka } = await import("shaka-player");
        if (disposed || !videoRef.current) return;
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) throw new Error("This browser cannot play this protected screening. Try an updated Chrome, Edge, Firefox, or Safari.");
        const support = await shaka.Player.probeSupport();
        if (disposed || !videoRef.current) return;
        const fairplay = Boolean(support.drm?.["com.apple.fps"]);
        player = new shaka.Player();
        await player.attach(videoRef.current);
        if (disposed) return;
        // Ask for hardware-protected decryption first: only then does the GPU keep frames out of
        // screenshots and screen recorders. Software levels remain as a fallback so playback still works.
        const playReady = config.servers["com.microsoft.playready"];
        player.configure({
          drm: {
            servers: playReady ? { ...config.servers, "com.microsoft.playready.recommendation": playReady } : config.servers,
            preferredKeySystems: ["com.microsoft.playready.recommendation", "com.widevine.alpha"],
            persistentSessionOnlinePlayback: false,
            advanced: {
              "com.widevine.alpha": { videoRobustness: ["HW_SECURE_ALL", "HW_SECURE_DECODE", "HW_SECURE_CRYPTO", "SW_SECURE_DECODE", "SW_SECURE_CRYPTO"], audioRobustness: ["SW_SECURE_CRYPTO"] },
              "com.microsoft.playready.recommendation": { videoRobustness: ["3000", "2000"], audioRobustness: ["2000"] },
              "com.apple.fps": { serverCertificateUri: config.certificateUrl, sessionType: "temporary" },
            } as Record<string, Partial<shaka.extern.AdvancedDrmConfiguration>> as Record<string, shaka.extern.AdvancedDrmConfiguration>,
          },
        });
        // Keep license challenges same-origin. No provider credentials enter JS.
        const licenseUrls = new Set(Object.values(config.servers).map(url => new URL(url, window.location.origin).href));
        player.getNetworkingEngine()!.registerRequestFilter((type, request) => {
          if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) return;
          if (!request.uris.every(url => licenseUrls.has(new URL(url, window.location.origin).href))) throw new Error("Unexpected license endpoint");
          request.headers["Content-Type"] = "application/octet-stream";
        });
        player.addEventListener("error", () => {
          if (!disposed) { videoRef.current?.pause(); setReady(false); setError("Protected playback stopped. Retry or check your CinePass access."); }
        });
        if (fairplay && !config.hlsUrl) throw new Error("This protected screening is not available in Safari yet. Please use Chrome, Edge, or Firefox.");
        await player.load(fairplay ? config.hlsUrl : config.dashUrl);
        if (disposed) return;
        if (!["com.widevine.alpha", "com.microsoft.playready", "com.microsoft.playready.recommendation", "com.apple.fps"].includes(player.keySystem()) || !player.drmInfo()) {
          await player.unload();
          throw new Error("This title does not have a valid protected stream. Please try again later.");
        }
        console.info("SineSarili DRM:", player.keySystem(), player.drmInfo()?.videoRobustness || "default robustness");
        setReady(true);
      } catch (reason) {
        if (!disposed) { setReady(false); setError(reason instanceof Error ? reason.message : "Protected playback is temporarily unavailable."); }
      }
    }
    void load();
    return () => { disposed = true; controller.abort(); if (player) void player.destroy(); };
  }, [enabled, slug, episodeId, autoPlay, videoRef, attempt, teaser]);
  return { drmError: error, drmReady: ready, retryDrm: () => setAttempt(value => value + 1) };
}
