"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AwardType = "win" | "nomination" | "official_selection" | "honorary";
type Award = {
  _id: string;
  title: string;
  organization: string;
  year: number;
  category?: string;
  awardType: AwardType;
  filmTitle?: string;
  recipientName?: string;
  description?: string;
  filmId?: { title: string; slug: string } | string | null;
};

const TYPE_LABELS: Record<AwardType, string> = { win: "Winner", nomination: "Nominee", official_selection: "Official selection", honorary: "Honorary award" };

export function PublicAwards() {
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/awards", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setAwards(((await response.json()) as { data: Award[] }).data);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  if (failed) return <div className="info-status" role="alert"><h2>We couldn't load the awards.</h2><p>Please refresh the page to try again.</p></div>;
  if (!awards) return <div className="info-status" role="status">Loading…</div>;
  if (awards.length === 0) return <div className="info-status"><h2>Recognitions are on their way.</h2><p>Awards, nominations, and festival selections will be listed here.</p></div>;

  const years = [...new Set(awards.map((award) => award.year))].sort((a, b) => b - a);

  return (
    <>
      {years.map((year) => (
        <section key={year} className="info-year" aria-labelledby={`awards-${year}`}>
          <h2 id={`awards-${year}`}>{year}</h2>
          <div className="info-awards">
            {awards.filter((award) => award.year === year).map((award) => {
              const film = award.filmId && typeof award.filmId === "object" ? award.filmId : null;
              return (
                <article key={award._id} className={`info-award${award.awardType === "win" ? " is-win" : ""}`}>
                  <span className="info-award-type">{TYPE_LABELS[award.awardType] ?? "Recognition"}</span>
                  <h3>{award.title}</h3>
                  <p className="info-award-org">{award.organization}{award.category ? ` · ${award.category}` : ""}</p>
                  {(film || award.filmTitle || award.recipientName) && (
                    <p className="info-award-meta">
                      {film ? <Link href={`/films/${film.slug}`}>{film.title}</Link> : award.filmTitle}
                      {(film || award.filmTitle) && award.recipientName ? " · " : ""}
                      {award.recipientName}
                    </p>
                  )}
                  {award.description && <p className="info-award-meta">{award.description}</p>}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
