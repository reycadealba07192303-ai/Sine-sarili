"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FilmPoster } from "@/components/film-poster";
import { FilmScreening } from "@/components/film-screening";
import { SeriesEpisodes } from "@/components/series-episodes";
import "@/app/film-detail.css";
import type { Film } from "@/lib/film-types";

export type FilmAward = {
  awardName: string;
  organization: string;
  year: number;
  awardType: "win" | "nomination" | "official_selection" | "honorary";
  category?: string;
  recipientName?: string;
};

type VideoProvider = "direct" | "youtube" | "vimeo" | "hls" | "embed" | "external" | "drm";

export type Episode = {
  _id: string;
  number: number;
  title: string;
  synopsis?: string;
  runtimeMinutes?: number;
  thumbnailUrl?: string;
  videoUrl?: string;
  videoProvider?: VideoProvider;
  subtitlesUrl?: string;
  isAvailable?: boolean;
};

export type Season = { _id: string; number: number; title?: string; releaseYear?: number; episodes: Episode[] };

export type FullFilm = Film & {
  contentType?: "film" | "series";
  seasons?: Season[];
  isSignedIn?: boolean;
  isAuthenticated?: boolean;
  categories?: string[];
  awards?: FilmAward[];
  videoProvider?: VideoProvider;
  teaserProvider?: VideoProvider;
  subtitlesUrl?: string;
  visibility?: "public" | "restricted";
  relatedFilms?: Array<{
    _id: string;
    title: string;
    slug: string;
    posterUrl: string;
    releaseYear: number;
    runtimeMinutes: number;
    genres: string[];
    audienceScore: number;
  }>;
};

function AwardLaurel() {
  return <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? "translate(64 0) scale(-1 1)" : undefined}>
      <path d="M28 54C10 49 8 30 17 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 17q-5-8 3-11 3 7-3 11ZM13 26q-10-4-8-11 9 1 8 11ZM12 35Q1 34 3 26q9-1 9 9ZM15 44Q4 46 4 38q9-4 11 6ZM21 51q-9 6-12-1 7-6 12 1Z" fill="currentColor" opacity=".8" />
      <path d="M13 29q1-9 8-9 1 7-8 9ZM14 39q3-8 10-6-1 7-10 6ZM19 47q4-7 11-3-3 6-11 3Z" fill="currentColor" opacity=".5" />
    </g>)}
    <path d="m32 20 3.5 7.1 7.8 1.1-5.7 5.5 1.4 7.8-7-3.7-7 3.7 1.4-7.8-5.7-5.5 7.8-1.1Z" fill="currentColor" />
  </svg>;
}

function RatingBlock({ score }: { score?: number | null }) {
  const rated = typeof score === "number" && score > 0;
  const stars = rated ? Math.round((score / 20) * 2) / 2 : 0;
  return (
    <section className="detail-rating" aria-label={rated ? `Audience rating ${(score / 20).toFixed(1)} out of 5` : "Not rated yet"}>
      <span className="detail-rating-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => <span key={n} className={stars >= n ? "is-full" : stars >= n - 0.5 ? "is-half" : ""}>★</span>)}
      </span>
      <p>{rated ? <><strong>{(score / 20).toFixed(1)}</strong> / 5 <span>Audience rating</span></> : <span>Not rated yet</span>}</p>
    </section>
  );
}

function CastBlock({ cast }: { cast: { name: string; characterName?: string; photoUrl?: string }[] }) {
  const members = cast.filter((member) => member.name?.trim());
  if (!members.length) return null;
  return (
    <section className="detail-cast" aria-labelledby="cast-title">
      <div className="detail-cast-heading"><h2 id="cast-title">Cast</h2><span /></div>
      <ul>
        {members.map((member, index) => (
          <li key={`${member.name}-${index}`}>
            <span className="detail-cast-photo" aria-hidden="true">
              {member.photoUrl ? <img src={member.photoUrl} alt="" loading="lazy" /> : member.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="detail-cast-copy">
              <strong>{member.name}</strong>
              {member.characterName && <small>as {member.characterName}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AwardsBlock({ awards }: { awards: FilmAward[] }) {
  if (!awards?.length) return null;
  const labels: Record<FilmAward["awardType"], string> = { win: "Winner", nomination: "Nominee", official_selection: "Official selection", honorary: "Honorary award" };
  return <section className="film-recognition" aria-labelledby="recognition-title">
    <div className="film-recognition-heading"><h2 id="recognition-title">Awards &amp; recognition</h2><span /></div>
    <ul className="film-awards-list">{awards.map((award, index) => {
      const label = labels[award.awardType] ?? "Recognition";
      const title = award.awardName.toLowerCase() === label.toLowerCase() && award.organization ? award.organization : award.awardName;
      return <li className="film-award" key={`${award.awardName}-${award.year}-${index}`}>
        <div className="film-award-emblem"><AwardLaurel /></div>
        <div className="film-award-copy"><div className="film-award-meta"><span className="film-award-badge">{label}</span><span className="film-award-year">{award.year}</span></div><h3>{title}</h3>{award.organization && award.organization !== title && <p>{award.organization}</p>}{(award.category || award.recipientName) && <span className="film-award-category">{[award.category, award.recipientName].filter(Boolean).join(" · ")}</span>}</div>
      </li>;
    })}</ul>
  </section>;
}

export function FilmDetail({ slug }: { slug: string }) {
  const [film, setFilm] = useState<FullFilm | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    fetch(`/api/films/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Film unavailable");
        const result = (await response.json()) as { data: FullFilm };
        setFilm(result.data);
        setState("ready");
      })
      .catch(() => setState("missing"));
  }, [slug]);

  if (state !== "ready" || !film) {
    const copy =
      state === "loading"
        ? ["Loading film…", "Please wait while we find the story."]
        : ["Film not found.", "This film may have moved or is no longer published."];
    return (
      <section className="detail-state">
        <span className="eyebrow">SINESARILI · FILM</span>
        <h1>{copy[0]}</h1>
        <p>{copy[1]}</p>
        <Link className="button button-primary" href="/films">
          Back to the collection
        </Link>
      </section>
    );
  }

  const isSeries = film.contentType === "series";
  const seasonCount = film.seasons?.length ?? 0;

  return (
    <>
      <article className="detail-page cinema-detail">
        <div className="detail-art">
          {film.backdropUrl && <img className="detail-backdrop" src={film.backdropUrl} alt="" />}
        </div>
        <aside className="detail-side">
          <FilmPoster film={film} index={0} className="detail-poster" />
          <AwardsBlock awards={film.awards ?? []} />
        </aside>
        <div className="detail-copy">
          <p className="eyebrow">SINESARILI · FILIPINO CINEMA</p>
          <h1>{film.title}</h1>
          <p className="detail-facts">
            {[
              film.audienceScore != null ? <><span className="rating-star">★</span> {(film.audienceScore / 20).toFixed(1)}/5</> : null,
              film.releaseYear || null,
              isSeries ? (seasonCount ? `${seasonCount} ${seasonCount === 1 ? "Season" : "Seasons"}` : null) : film.runtimeMinutes ? `${film.runtimeMinutes} minutes` : null,
            ].filter(Boolean).map((fact, index) => <span key={index}>{index > 0 && <>&nbsp;&nbsp;|&nbsp;&nbsp;</>}{fact}</span>)}
          </p>

          <div className="detail-genres">
            {(film.genres ?? []).map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
            {(film.categories ?? []).map((cat) => (
              <span key={cat}>
                {cat}
              </span>
            ))}
          </div>

          {film.tagline && <p className="detail-tagline">{film.tagline}</p>}
          <p className="detail-synopsis">{film.synopsis || "A story from the filmmakers of SineSarili."}</p>

          {film.directorNames && film.directorNames.length > 0 && (
            <p className="detail-director">
              Directed by <strong>{film.directorNames.join(", ")}</strong>
            </p>
          )}

          <FilmScreening key={film.slug} film={film} />

          <RatingBlock score={film.audienceScore} />
          <CastBlock cast={film.cast ?? []} />

          {isSeries && seasonCount > 0 && <SeriesEpisodes film={film} />}

        </div>
      </article>

    </>
  );
}
