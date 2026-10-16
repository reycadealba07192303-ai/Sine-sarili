"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

type Person = { _id: string; name: string; title?: string; bio?: string; photoUrl?: string };

const AUTOPLAY_MS = 5500;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "S";
}

export function PublicPeople() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [holding, setHolding] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/directors", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setPeople(((await response.json()) as { data: Person[] }).data);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  // Scroll only the track, never the page, so autoplay cannot move the reader.
  const goTo = useCallback((index: number) => {
    const node = track.current;
    const cards = node?.querySelectorAll<HTMLElement>(".credit");
    if (!node || !cards?.length) return;
    const next = (index + cards.length) % cards.length;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The track is position: relative, so offsetLeft is measured from its padding box.
    node.scrollTo({ left: cards[next].offsetLeft - parseFloat(getComputedStyle(node).paddingLeft || "0"), behavior: smooth ? "smooth" : "auto" });
    setActive(next);
  }, []);

  useEffect(() => {
    const node = track.current;
    if (!node || !people?.length) return;
    const update = () => {
      const cards = [...node.querySelectorAll<HTMLElement>(".credit")];
      const start = node.scrollLeft + parseFloat(getComputedStyle(node).paddingLeft || "0");
      let nearest = 0;
      cards.forEach((card, index) => {
        if (Math.abs(card.offsetLeft - start) < Math.abs(cards[nearest].offsetLeft - start)) nearest = index;
      });
      // At the very end the last card may never reach the start edge.
      if (start + node.clientWidth >= node.scrollWidth - 4) nearest = cards.length - 1;
      setActive(nearest);
    };
    node.addEventListener("scroll", update, { passive: true });
    return () => node.removeEventListener("scroll", update);
  }, [people]);

  useEffect(() => {
    if (!playing || holding || !people || people.length < 2) return;
    const timer = window.setTimeout(() => goTo(active + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, holding, active, people, goTo]);

  if (failed) return <div className="credit-status" role="alert"><h3>We couldn&rsquo;t load the team.</h3><p>Please refresh the page to try again.</p></div>;
  if (!people) return <div className="credit-status" role="status"><p>Loading the ensemble…</p></div>;
  if (people.length === 0) {
    return (
      <div className="credit-empty" role="status">
        <div className="credit-empty-stub" aria-hidden="true"><span>Admit</span><b>*</b></div>
        <div className="credit-empty-body">
          <p className="ed-index"><span>Coming to the screen</span><i aria-hidden="true" /></p>
          <h3>The ensemble is assembling.</h3>
          <p>Directors, storytellers, and the festival team will be credited here.</p>
        </div>
      </div>
    );
  }

  const many = people.length > 1;
  return (
    <div className="credits" onMouseEnter={() => setHolding(true)} onMouseLeave={() => setHolding(false)} onFocus={() => setHolding(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHolding(false); }}>
      <div className="credits-ticker" aria-hidden="true">
        <div>{[0, 1].map((copy) => <span key={copy}>{people.map((person) => <em key={`${copy}-${person._id}`}>{person.name}<b>*</b></em>)}</span>)}</div>
      </div>

      <div
        className="credits-track"
        ref={track}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Directors and team"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") { event.preventDefault(); goTo(active - 1); }
          if (event.key === "ArrowRight") { event.preventDefault(); goTo(active + 1); }
        }}
      >
        {people.map((person, index) => (
          <article
            key={person._id}
            className={`credit tone-${index % 4}${index === active ? " is-active" : ""}`}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${people.length}: ${person.name}`}
          >
            <header className="credit-stub">
              <span className="credit-num">{String(index + 1).padStart(2, "0")}</span>
              <span className="credit-role">{person.title || "SineSarili team"}</span>
            </header>
            <div className="credit-body">
              <span className="credit-monogram" aria-hidden="true">{initials(person.name)}</span>
              <h3>{person.name}</h3>
              {person.bio && <p>{person.bio}</p>}
            </div>
            <footer className="credit-foot" aria-hidden="true">
              <span>SineSarili / Credit {String(index + 1).padStart(2, "0")}</span>
              <i className="credit-barcode" />
            </footer>
          </article>
        ))}
      </div>

      {many && (
        <div className="credits-controls">
          <p className="credits-count" aria-live="polite"><strong>{String(active + 1).padStart(2, "0")}</strong> / {String(people.length).padStart(2, "0")}</p>
          <div className="credits-progress" aria-hidden="true">
            {people.map((person, index) => (
              <button
                key={person._id}
                type="button"
                tabIndex={-1}
                className={index === active ? "is-active" : index < active ? "is-past" : undefined}
                style={index === active && playing && !holding ? { animationDuration: `${AUTOPLAY_MS}ms` } : undefined}
                onClick={() => goTo(index)}
              ><span /></button>
            ))}
          </div>
          <div className="credits-buttons">
            <button type="button" aria-label={playing ? "Pause carousel" : "Play carousel"} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <button type="button" aria-label="Previous person" onClick={() => goTo(active - 1)}><ChevronLeft size={20} /></button>
            <button type="button" aria-label="Next person" onClick={() => goTo(active + 1)}><ChevronRight size={20} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
