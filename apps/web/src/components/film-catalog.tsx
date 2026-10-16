"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EditorialFilmCard } from "@/components/editorial-film-card";
import type { Film } from "@/lib/film-types";

type CatalogFilm = Film & { categories?: string[]; createdAt?: string; viewCount?: number };

export function FilmCatalog() {
  const [films, setFilms] = useState<CatalogFilm[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch("/api/films?limit=100", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Film catalog unavailable");
        return response.json() as Promise<{ data: CatalogFilm[] }>;
      })
      .then(({ data }) => { setFilms(data); setState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    films.forEach((film) => {
      (film.categories ?? []).forEach((name) => set.add(name));
      (film.genres ?? []).forEach((name) => set.add(name));
    });
    return [...set].sort();
  }, [films]);

  const availableYears = useMemo(() => [...new Set(films.map((film) => film.releaseYear).filter(Boolean))].sort((a, b) => b - a), [films]);

  const visibleFilms = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const list = films.filter((film) => {
      if (needle && ![film.title, film.synopsis, ...(film.genres ?? []), ...(film.directorNames ?? []), ...(film.cast ?? []).map((member) => member.name)].some((value) => value?.toLocaleLowerCase().includes(needle))) return false;
      if (categoryFilter !== "all" && !(film.categories ?? []).includes(categoryFilter) && !(film.genres ?? []).includes(categoryFilter)) return false;
      if (yearFilter !== "all" && String(film.releaseYear) !== yearFilter) return false;
      return true;
    });
    if (sortBy === "popular") list.sort((a, b) => (b.viewCount || b.audienceScore || 0) - (a.viewCount || a.audienceScore || 0));
    else if (sortBy === "year") list.sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
    else if (sortBy === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0));
    return list;
  }, [films, query, categoryFilter, yearFilter, sortBy]);

  const filtered = categoryFilter !== "all" || yearFilter !== "all" || query.trim() !== "";
  const reset = () => { setQuery(""); setCategoryFilter("all"); setYearFilter("all"); };

  return (
    <div className="catalog">
      <header className="catalog-head">
        <div>
          <p className="ed-index"><span>01 / The SineSarili archive</span><i aria-hidden="true" /></p>
          <h1>Filipino cinema<br /><span>catalog.</span></h1>
          <p className="catalog-lead">Authentic narratives, student showcases, regional visions, and award-winning Filipino productions.</p>
        </div>
        <div className="catalog-count"><strong>{state === "ready" ? films.length : "—"}</strong><span>{films.length === 1 ? "film in the archive" : "films in the archive"}</span></div>
      </header>

      <div className="catalog-toolbar">
        <label className="catalog-search">
          <Search size={17} aria-hidden="true" />
          <input type="search" aria-label="Search films by title, director, or cast" placeholder="Search title, director, cast…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="catalog-filters">
          <label><span>Genre</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">All genres</option>
              {availableCategories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label><span>Year</span>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="all">All years</option>
              {availableYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
            </select>
          </label>
          <label><span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="newest">Recently added</option>
              <option value="popular">Most watched</option>
              <option value="year">Release year</option>
              <option value="title">A to Z</option>
            </select>
          </label>
          {filtered && <button type="button" className="catalog-reset" onClick={reset}>Reset</button>}
        </div>
      </div>

      <section className="catalog-results" aria-live="polite">
        {state === "loading" && <p className="ed-collection-note" role="status">Loading the film library…</p>}
        {state === "error" && (
          <div className="ed-collection-empty" role="alert">
            <h3>We&rsquo;ll be back on screen shortly.</h3>
            <p>The film library couldn&rsquo;t load.</p>
            <button type="button" className="ed-outline-button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
          </div>
        )}
        {state === "ready" && films.length === 0 && (
          <div className="ed-collection-empty">
            <span className="ed-collection-mark" aria-hidden="true">*</span>
            <h3>New films are on their way.</h3>
            <p>The collection is being prepared. Check back soon for Filipino stories worth staying in for.</p>
          </div>
        )}
        {state === "ready" && films.length > 0 && visibleFilms.length === 0 && (
          <div className="catalog-none" role="status">
            <h3>No matching films</h3>
            <p>Try another keyword, genre, or year.</p>
            <button type="button" className="ed-outline-button" onClick={reset}>Clear all filters</button>
          </div>
        )}
        {state === "ready" && visibleFilms.length > 0 && (
          <>
            <p className="catalog-showing">Showing <strong>{visibleFilms.length}</strong> {visibleFilms.length === 1 ? "film" : "films"}</p>
            <div className="ed-grid catalog-grid">{visibleFilms.map((film, index) => <EditorialFilmCard key={film._id} film={film} index={index} />)}</div>
          </>
        )}
      </section>
    </div>
  );
}
