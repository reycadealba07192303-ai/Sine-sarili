"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Film } from "@/lib/film-types";
import { EditorialFilmCard } from "@/components/editorial-film-card";

type CollectionFilm = Film & { createdAt?: string };
const MAX_TABS = 5;
const SHOWN = 8;
const newest = (a: CollectionFilm, b: CollectionFilm) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0) || (b.releaseYear ?? 0) - (a.releaseYear ?? 0);

export function HomeCollection() {
  const [films, setFilms] = useState<CollectionFilm[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [genre, setGenre] = useState("All");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch("/api/films?limit=100", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ data: CollectionFilm[] }>; })
      .then(({ data }) => { setFilms([...data].sort(newest)); setState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt]);

  // The most common genres become the filter tabs.
  const counts = new Map<string, number>();
  films.forEach(film => film.genres?.forEach(name => counts.set(name, (counts.get(name) ?? 0) + 1)));
  const tabs = ["All", ...[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_TABS).map(([name]) => name)];
  const visible = films.filter(film => genre === "All" || film.genres?.includes(genre));

  return (
    <section className="ed-collection" id="films" aria-labelledby="collection-title">
      <div className="ed-collection-head">
        <div>
          <p className="ed-index"><span>02 / Collection</span><i aria-hidden="true" /></p>
          <h2 id="collection-title">Mga pelikula<span aria-hidden="true">*</span></h2>
        </div>
        {films.length > 0 && (
          <div className="ed-tabs" role="group" aria-label="Filter by genre">
            {tabs.map(name => <button key={name} type="button" aria-pressed={genre === name} onClick={() => setGenre(name)}>{name === "All" ? "All films" : name}</button>)}
          </div>
        )}
      </div>

      {state === "loading" && <p className="ed-collection-note" role="status">Loading the collection…</p>}
      {state === "error" && (
        <div className="ed-collection-empty" role="alert">
          <h3>We&rsquo;ll be back on screen shortly.</h3>
          <p>The collection couldn&rsquo;t load.</p>
          <button type="button" className="ed-outline-button" onClick={() => setAttempt(value => value + 1)}>Try again</button>
        </div>
      )}
      {state === "ready" && films.length === 0 && (
        <div className="ed-collection-empty">
          <span className="ed-collection-mark" aria-hidden="true">*</span>
          <h3>Ang susunod na kuwento ay paparating.</h3>
          <p>New Filipino films will appear here as soon as they are published.</p>
        </div>
      )}
      {state === "ready" && visible.length > 0 && (
        <div className="ed-grid">
          {visible.slice(0, SHOWN).map((film, index) => <EditorialFilmCard key={film._id} film={film} index={index} />)}
        </div>
      )}
      {state === "ready" && films.length > 0 && visible.length === 0 && <p className="ed-collection-note">No films in this genre yet.</p>}
      {state === "ready" && visible.length > SHOWN && <div className="ed-collection-more"><Link className="ed-outline-button" href="/films">View all {visible.length} films</Link></div>}
    </section>
  );
}
