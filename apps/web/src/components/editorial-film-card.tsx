import Link from "next/link";
import { Play } from "lucide-react";
import type { Film } from "@/lib/film-types";

export const filmByline = (film: Film) =>
  film.directorNames?.length ? `A film by ${film.directorNames.join(" & ")}` : [film.releaseYear, film.genres?.[0]].filter(Boolean).join(" · ");

export function EditorialFilmCard({ film, index }: { film: Film; index: number }) {
  const image = film.posterUrl || film.backdropUrl;
  return (
    <Link className="ed-card" href={`/films/${film.slug}`}>
      <div className="ed-card-media">
        {image ? <img src={image} alt="" loading="lazy" /> : <div className="ed-card-fallback" aria-hidden="true"><span>{film.title}</span></div>}
        <span className="ed-card-num">{String(index + 1).padStart(2, "0")}<i aria-hidden="true" /></span>
        <span className="ed-card-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
      </div>
      <h3>{film.title}</h3>
      <p>{filmByline(film)}</p>
    </Link>
  );
}
