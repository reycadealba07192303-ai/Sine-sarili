"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play, X } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import "@/app/film-detail.css";
import type { FullFilm } from "@/components/film-detail";

type ScreeningFilm = FullFilm & { isAuthenticated?: boolean };

export function FilmScreening({ film, compact = false, onOpenChange }: { film: ScreeningFilm; compact?: boolean; onOpenChange?: (open: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [screening, setScreening] = useState<ScreeningFilm | null>(null);
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  async function watch() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/films/${encodeURIComponent(film.slug)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("This screening is unavailable right now. Please try again.");
      const { data } = await response.json() as { data: ScreeningFilm };
      setScreening(data);
      setOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open this screening.");
    } finally { setLoading(false); }
  }

  const fullFilm = screening?.isAuthenticated === true;
  const isSeries = film.contentType === "series";
  const firstEpisode = screening?.seasons?.flatMap(season => season.episodes.map(episode => ({ season, episode }))).find(item => item.episode.isAvailable);
  const fullSource = isSeries ? firstEpisode?.episode : screening;
  const source = fullFilm ? fullSource?.videoUrl : screening?.teaserUrl;
  const episodeLabel = isSeries && firstEpisode ? ` — S${firstEpisode.season.number}:E${firstEpisode.episode.number} ${firstEpisode.episode.title}` : "";
  return <>
    <div className="film-watch-actions">
      <button className="film-watch-button" onClick={watch} disabled={loading}><Play size={17} fill="currentColor" />{loading ? "Opening screening..." : isSeries ? "Watch series" : "Watch film"}</button>
      {!compact && film.isAuthenticated && <span className="film-watch-hint">Your screening, on your terms.</span>}
    </div>
    {error && <p role="alert" className="film-watch-error">{error}</p>}
    {open && screening && <dialog ref={dialog} className="film-screening-dialog" aria-labelledby="screening-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false); } }}>
      <header className="film-screening-heading"><div><p>{fullFilm ? "NOW SHOWING" : "OFFICIAL TEASER"}</p><h2 id="screening-title">{screening.title}</h2></div><button autoFocus aria-label="Close screening" onClick={() => setOpen(false)}><X size={21} /></button></header>
      <div className="film-screening-player">{source ? <VideoPlayer filmSlug={screening.slug} filmTitle={`${screening.title}${fullFilm ? episodeLabel : " — Official teaser"}`} videoUrl={source} videoProvider={fullFilm ? fullSource?.videoProvider : screening.teaserProvider} subtitlesUrl={fullFilm ? fullSource?.subtitlesUrl : undefined} posterUrl={screening.backdropUrl || screening.posterUrl} autoPlay fitToContainer trackHistory={fullFilm} isTeaser={!fullFilm} episodeId={isSeries ? firstEpisode?.episode._id : undefined} episodeLabel={isSeries && firstEpisode ? `S${firstEpisode.season.number}:E${firstEpisode.episode.number} · ${firstEpisode.episode.title}` : undefined} /> : <div className="film-screening-empty"><Play size={30} /><h3>{fullFilm ? isSeries ? "The first episode is coming soon." : "The film is coming soon." : "The teaser is coming soon."}</h3><p>{fullFilm ? "This title is being prepared for screening." : "Sign in to watch the full film when it is available."}</p></div>}</div>
      {!fullFilm && screening.isSignedIn && <footer className="film-screening-footer"><div><strong>Get CinePass to watch the full film.</strong><p>You're signed in. Subscribe to unlock access.</p></div><Link href="/subscribe">Get CinePass <ArrowUpRight size={16} /></Link></footer>}
      {!fullFilm && !screening.isSignedIn && <footer className="film-screening-footer"><div><strong>The story doesn't end here.</strong><p>Sign in to watch the full film.</p></div><Link href="/signup?mode=signin">Sign in to watch <ArrowUpRight size={16} /></Link></footer>}
    </dialog>}
  </>;
}
