"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Film } from "@/lib/film-types";
import { FilmScreening } from "@/components/film-screening";

const byline = (film: Film) => (film.directorNames?.length ? `A film by ${film.directorNames.join(" & ")}` : "A SineSarili selection");

export function FeaturedHero() {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isScreeningOpen, setIsScreeningOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/films?limit=6", { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<{ data: Film[] }> : Promise.reject())
      .then(({ data }) => { setFilms(data); setActiveIndex(0); })
      .catch(() => { if (!controller.signal.aborted) setFilms([]); });
    return () => controller.abort();
  }, []);
  const featured = (films ?? []).slice(0, 5);
  useEffect(() => {
    if (isPaused || isScreeningOpen || featured.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => setActiveIndex(index => (index + 1) % featured.length), 8000);
    return () => window.clearInterval(interval);
  }, [featured.length, isPaused, isScreeningOpen]);
  const film = featured[activeIndex];
  const image = film?.backdropUrl || film?.posterUrl;
  const facts = film ? [film.genres?.[0], film.releaseYear, film.runtimeMinutes > 0 ? `${film.runtimeMinutes} MIN` : null, "PHILIPPINES"].filter(Boolean) : ["FILIPINO CINEMA", "INDEPENDENT", "PHILIPPINES"];

  return (
    <>
      <section className="ed-hero" aria-labelledby="hero-title">
        <div className="ed-hero-copy">
          <p className="ed-index"><span>01 / Spotlight</span><i aria-hidden="true" /></p>
          <h1 id="hero-title">Sariling<br />atin.<br />Panoorin.</h1>
          <span className="ed-underline" aria-hidden="true" />
          <p className="ed-tagline">Mga pelikulang malaya. Mga kuwentong malapit.</p>
          <div className="ed-hero-actions">
            {film ? <FilmScreening key={film.slug} film={film} compact onOpenChange={setIsScreeningOpen} /> : <Link className="ed-ticket" href="/films"><span>Explore films</span><Play size={15} fill="currentColor" aria-hidden="true" /></Link>}
          </div>
        </div>

        <div className={`ed-hero-media${image ? "" : " is-empty"}`}>
          {image && <img key={image} className="ed-hero-image" src={image} alt="" fetchPriority="high" />}
          {!image && <div className="ed-hero-placeholder" aria-hidden="true"><span>Sine</span><span>Sarili</span></div>}
          <span className="ed-label">{film ? "Featured film" : films === null ? "Loading" : "Coming soon"}</span>
          <div className="ed-hero-title" key={film?.slug ?? "empty"}>
            <h2>{film ? <Link href={`/films/${film.slug}`}>{film.title}</Link> : "Ang susunod na kuwento"}</h2>
            <p>{film ? byline(film) : "New Filipino films are on their way."}</p>
          </div>
          {featured.length > 1 && (
            <div className="ed-hero-dots" aria-label="Featured films">
              {featured.map((item, index) => <button key={item.slug} type="button" className={index === activeIndex ? "is-active" : ""} aria-label={`Show ${item.title}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => setActiveIndex(index)} />)}
              <button type="button" className="ed-hero-pause" aria-label={isPaused ? "Play featured films" : "Pause featured films"} onClick={() => setIsPaused(paused => !paused)}>{isPaused ? <Play size={12} /> : <Pause size={12} />}</button>
            </div>
          )}
        </div>

        <aside className="ed-hero-strip" aria-hidden="true"><span>SineSarili selection / Pelikulang Pilipino</span></aside>
      </section>

      <div className="ed-factbar">
        <p>{facts.map((fact, index) => <span key={`${fact}-${index}`}>{fact}</span>)}</p>
        {film ? <Link href={`/films/${film.slug}`}>Film details <Play size={12} fill="currentColor" aria-hidden="true" /></Link> : <Link href="/subscribe">Get CinePass <Play size={12} fill="currentColor" aria-hidden="true" /></Link>}
      </div>
    </>
  );
}
