import { EditorialFooter } from "@/components/editorial-footer";
import { FilmCatalog } from "@/components/film-catalog";
import { StreamingHeader } from "@/components/streaming-header";

export const metadata = { title: "Films | SineSarili" };

export default function FilmsPage() {
  return (
    <main className="stream-home ed-page">
      <StreamingHeader active="films" />
      <FilmCatalog />
      <EditorialFooter />
    </main>
  );
}
