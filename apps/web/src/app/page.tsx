import Link from "next/link";
import { FeaturedHero } from "@/components/featured-hero";
import { HomePlans } from "@/components/home-plans";
import { HomeCollection } from "@/components/home-collection";
import { StreamingHeader } from "@/components/streaming-header";
import { AnnouncementNotice } from "@/components/announcement-notice";
import { EditorialFooter } from "@/components/editorial-footer";
import "./home.css";

export default function Home() {
  return <main className="stream-home ed-page">
    <StreamingHeader active="home" />
    <AnnouncementNotice />
    <FeaturedHero />
    <HomeCollection />
    <HomePlans />
    <section className="ed-closing" aria-label="Start watching">
      <p className="ed-index"><span>04 / Now showing</span><i aria-hidden="true" /></p>
      <h2>Malayang pelikula.<br />Sariling kuwento.</h2>
      <div className="ed-closing-actions">
        <Link className="ed-ticket" href="/films"><span>Browse films</span></Link>
        <Link className="ed-outline-button" href="/about">About SineSarili</Link>
      </div>
    </section>
    <EditorialFooter />
  </main>;
}
