import Link from "next/link";
import { EditorialFooter } from "@/components/editorial-footer";
import { PublicAwards } from "@/components/public-awards";
import { PublicPeople } from "@/components/public-people";
import { StreamingHeader } from "@/components/streaming-header";
import "../info-pages.css";

export const metadata = { title: "About | SineSarili" };

const PILLARS = [
  { title: "Watch Filipino films", body: "Stream feature films, short films, and series from Filipino filmmakers in one place." },
  { title: "Meet the filmmakers", body: "Get to know the directors and the team behind every story we showcase." },
  { title: "Celebrate recognition", body: "Follow the awards, nominations, and festival selections our films have earned." },
  { title: "Stay in the loop", body: "Announcements about new releases, screenings, and calls for submissions." },
];

export default function AboutPage() {
  return (
    <main className="stream-home ed-page ed-about">
      <StreamingHeader active="about" />

      <section className="ab-hero" aria-labelledby="about-title">
        <div className="ab-hero-copy">
          <p className="ed-index"><span>01 / About SineSarili</span><i aria-hidden="true" /></p>
          <h1 id="about-title">A home for<br /><span>Filipino</span><br />cinema.</h1>
          <span className="ed-underline" aria-hidden="true" />
          <p className="ab-lead">SineSarili is a film streaming and showcase platform for discovering, watching, and celebrating Filipino films, the filmmakers who make them, and the achievements they earn along the way.</p>
          <p className="ab-presenter">A project of <strong>BulSU Cinephilia&rsquo;s SiBul</strong></p>
          <nav className="ab-jump" aria-label="On this page">
            <a href="#team">Directors &amp; team</a>
            <a href="#awards">Awards &amp; honors</a>
          </nav>
        </div>
        <figure className="ab-hero-art">
          <img src="/about/sibul.jpg" alt="SiBul artwork: a golden sun with the SiBul mark, framed by green trees and indigo waves, with two figures on boats" />
          <figcaption><span>Presented by</span> BulSU Cinephilia&rsquo;s SiBul</figcaption>
        </figure>
        <aside className="ed-hero-strip" aria-hidden="true"><span>Pelikulang Pilipino / Para sa lahat</span></aside>
      </section>

      <div className="ed-factbar ab-factbar"><p><span>Watch</span><span>Meet</span><span>Celebrate</span><span>Stay in the loop</span></p></div>

      <section className="ab-pillars" aria-label="What SineSarili offers">
        {PILLARS.map((pillar, index) => (
          <article key={pillar.title} className={`ab-pillar tone-${index}`}>
            <span className="ab-pillar-num">{String(index + 1).padStart(2, "0")}<i aria-hidden="true" /></span>
            <h2>{pillar.title}</h2>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      <section id="team" className="ab-section" aria-labelledby="team-title">
        <p className="ed-index"><span>02 / The people behind the stories</span><i aria-hidden="true" /></p>
        <h2 className="ed-section-title" id="team-title">Directors &amp; team<span aria-hidden="true">*</span></h2>
        <p className="ab-section-lead">The filmmakers and the festival team who bring Filipino stories to the screen.</p>
        <PublicPeople />
      </section>

      <section id="awards" className="ab-section ab-awards" aria-labelledby="awards-title">
        <p className="ed-index"><span>03 / Recognitions</span><i aria-hidden="true" /></p>
        <h2 className="ed-section-title" id="awards-title">Awards &amp; honors<span aria-hidden="true">*</span></h2>
        <p className="ab-section-lead">Festival wins, nominations, and selections earned by our films and filmmakers.</p>
        <PublicAwards />
      </section>

      <section className="ed-closing" aria-label="Start watching">
        <p className="ed-index"><span>04 / Now showing</span><i aria-hidden="true" /></p>
        <h2>Find your next<br />favorite story.</h2>
        <div className="ed-closing-actions">
          <Link className="ed-ticket" href="/films"><span>Browse films</span></Link>
          <Link className="ed-outline-button" href="/subscribe">Get CinePass</Link>
        </div>
      </section>
      <EditorialFooter />
    </main>
  );
}
