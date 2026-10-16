import type { Film } from "@/lib/film-types";

export function FilmPoster({ film, index, className = "" }: { film: Film; index: number; className?: string }) {
  return (
    <div className={`film-poster${film.posterUrl ? " has-uploaded-poster" : ""} ${className}`}>
      {film.posterUrl ? <img src={film.posterUrl} alt={`Poster for ${film.title}`} loading="lazy" /> : (
        <div className="poster-placeholder"><span>SINESARILI</span><strong>{film.title}</strong><small>Poster coming soon</small></div>
      )}
      <span className="poster-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="card-play" aria-hidden="true">&#9654;</span>
    </div>
  );
}
