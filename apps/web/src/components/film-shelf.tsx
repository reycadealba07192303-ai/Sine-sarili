"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight, Clapperboard, Search, Star } from "lucide-react";
import { FilmPoster } from "@/components/film-poster";
import type { Film } from "@/lib/film-types";

type CollectionFilm = Film & { viewCount?: number; categories?: string[]; awards?: unknown[]; createdAt?: string };
function GenreFilter({ genres, value, onChange, label }: { genres: string[]; value: string; onChange: (genre: string) => void; label: string }) {
  return <div className="cinema-genres" role="group" aria-label={label}>{["All", ...genres].map(genre => <button key={genre} aria-pressed={value === genre} onClick={() => onChange(genre)}>{genre}</button>)}</div>;
}
function FilmCard({ film, index, compact = false }: { film: CollectionFilm; index: number; compact?: boolean }) {
  return <Link className={`cinema-film${compact ? " compact-film" : ""}`} href={`/films/${film.slug}`}>
    <FilmPoster film={film} index={index} />
    <div className="cinema-film-info"><h3>{film.title}</h3>{compact ? <p className="compact-film-facts">{film.audienceScore != null && <span className="cinema-film-score"><Star size={12} fill="currentColor" />{(film.audienceScore / 20).toFixed(1)}</span>}{film.releaseYear && <><span aria-hidden="true">&middot;</span><span>{film.releaseYear}</span></>}</p> : <p><span>{film.releaseYear || ""}</span>{film.audienceScore != null && <span className="cinema-film-score"><Star size={11} fill="currentColor" />{(film.audienceScore / 20).toFixed(1)}</span>}</p>}</div>
  </Link>;
}
const newest = (a: CollectionFilm, b: CollectionFilm) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0) || (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
const hasGenre = (film: CollectionFilm, genre: string) => genre === "All" || film.genres?.includes(genre);

export function FilmShelf() {
  const [films, setFilms] = useState<CollectionFilm[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("latest");
  const [query, setQuery] = useState("");
  const [minRating, setMinRating] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch("/api/films?limit=100", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ data: CollectionFilm[] }>; })
      .then(({ data }) => { setFilms(data); setState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt]);
  const genres = [...new Set(films.flatMap(film => film.genres ?? []))].sort();
  const trending = [...films].sort((a,b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, 12);
  const closeToHome = [...films].sort(newest).filter(film => film.genres?.some(genre => ["drama", "family", "coming of age", "community", "feel good"].includes(genre.toLowerCase()))).slice(0, 12);
  const collections = [
    { title: "Trending Filipino Films", films: trending },
    { title: "Stories Close to Home", films: closeToHome },
  ].filter(collection => collection.films.length > 0);
  const results = films.filter(film => hasGenre(film, genre) && (minRating === 0 || (film.audienceScore ?? 0) >= minRating * 20) && [film.title, ...film.directorNames ?? [], ...film.genres ?? []].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    .sort(sort === "title" ? (a,b) => a.title.localeCompare(b.title) : sort === "rating" ? (a,b) => (b.audienceScore ?? 0) - (a.audienceScore ?? 0) : sort === "year" ? (a,b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0) : newest);
  function reset() { setGenre("All"); setSort("latest"); setQuery(""); setMinRating(0); }
  if (state === "loading") return <div className="cinema-loading" role="status"><span className="loading-mark" /> Loading the collection...</div>;
  if (state === "error" || !films.length) return <div className="cinema-empty"><Clapperboard size={32} /><h2>{state === "error" ? "We'll be back on screen shortly." : "The next great story is on its way."}</h2><p>{state === "error" ? "The collection couldn't load. Please try again." : "Discover new films here as soon as they are published."}</p>{state === "error" && <button className="cinema-secondary" onClick={() => setAttempt(value => value + 1)}>Try again <ArrowUpRight size={15} /></button>}</div>;
  return <>
    <div className="cinema-classic-shelves">{collections.map(collection => <section className="cinema-classic-shelf" key={collection.title} aria-label={collection.title}>
      <div className="cinema-classic-heading"><h2>{collection.title}</h2><Link href="/films">View all <ChevronRight size={13} /></Link></div>
      <div className="cinema-classic-rail">{collection.films.map((film,index) => <FilmCard key={film._id} film={film} index={index} compact />)}</div>
    </section>)}</div>
    <section className="cinema-movies" aria-labelledby="movies-title">
      <div className="cinema-movies-heading"><h2 id="movies-title"><Clapperboard size={25} />The collection<span>{films.length} films</span></h2><label className="cinema-search"><Search size={16} /><input type="search" aria-label="Search the collection" placeholder="Find your next story" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
      <GenreFilter genres={genres} value={genre} onChange={setGenre} label="Filter collection by genre" />
      <div className="cinema-sort-bar"><label>Sort by<select aria-label="Sort films" value={sort} onChange={event => setSort(event.target.value)}><option value="latest">Latest</option><option value="year">Year</option><option value="title">A to Z</option><option value="rating">Top rated</option></select></label><span className="cinema-result-count" role="status">{results.length} {results.length === 1 ? "film" : "films"}</span><label className="cinema-rating-filter"><Star size={14} fill="currentColor" /><span className="sr-only">Minimum audience rating</span><input type="range" aria-label="Minimum audience rating" min="0" max="5" step="0.5" value={minRating} onChange={event => setMinRating(Number(event.target.value))} /><span>{minRating === 0 ? "All ratings" : `${minRating.toFixed(1)}+`}</span></label></div>
      <div className="cinema-film-grid">{results.map((film,index) => <FilmCard key={film._id} film={film} index={index} />)}</div>
      {!results.length && <div className="cinema-no-results" role="status"><h3>No matching stories.</h3><p>Try another genre, rating, or search.</p><button className="cinema-secondary" onClick={reset}>Reset filters</button></div>}
    </section>
  </>;
}
