import { Suspense } from "react";
import { EditorialFooter } from "@/components/editorial-footer";
import { FilmDetail } from "@/components/film-detail";
import { StreamingHeader } from "@/components/streaming-header";

async function FilmPageContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <FilmDetail slug={slug} />;
}

export default function FilmPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main className="stream-home ed-page">
      <StreamingHeader active="films" />
      <Suspense fallback={<section className="detail-state"><p className="eyebrow">SINESARILI · FILM</p><h1>Loading film…</h1></section>}><FilmPageContent params={params} /></Suspense>
      <EditorialFooter />
    </main>
  );
}
