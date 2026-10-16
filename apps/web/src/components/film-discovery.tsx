"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Film as FilmIcon, Layers3, Search, Sparkles, Star } from "lucide-react";
import { EditorialFooter } from "@/components/editorial-footer";
import { FilmPoster } from "@/components/film-poster";
import { StreamingHeader } from "@/components/streaming-header";
import type { Film } from "@/lib/film-types";
import "@/app/discovery.css";

type CategoryItem = { _id: string; name: string; slug: string; description: string; sectionKey: string; filmCount: number };
type DiscoveryFilm = Film & { categories?: string[]; createdAt?: string; viewCount?: number };
function FilmCards({ films, rail = false }: { films: DiscoveryFilm[]; rail?: boolean }) {
  return <div className={rail ? "explore-film-rail" : "explore-film-grid"}>{films.map((film,index) => <Link className="explore-film" href={`/films/${film.slug}`} key={film._id}><FilmPoster film={film} index={index} /><h3>{film.title}</h3><p><span>{film.releaseYear}{film.genres?.[0] && <> &middot; {film.genres[0]}</>}</span>{film.audienceScore != null && <span><Star size={11} fill="currentColor" />{(film.audienceScore / 20).toFixed(1)}</span>}</p></Link>)}</div>;
}

export function FilmDiscovery({ mode }: { mode: "categories" | "discover" }) {
  const [films, setFilms] = useState<DiscoveryFilm[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selected, setSelected] = useState<CategoryItem | null>(null);
  const [results, setResults] = useState<DiscoveryFilm[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [resultState, setResultState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [resultAttempt, setResultAttempt] = useState(0);
  const resultSection = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    Promise.all([fetch("/api/films?limit=100",{signal:controller.signal}),fetch("/api/categories",{signal:controller.signal})])
      .then(async responses => { if (responses.some(response => !response.ok)) throw new Error(); return Promise.all([responses[0].json() as Promise<{data:DiscoveryFilm[]}>, responses[1].json() as Promise<{data:CategoryItem[]}>]); })
      .then(([filmData,categoryData]: [{data:DiscoveryFilm[]},{data:CategoryItem[]}]) => {
        setFilms(filmData.data); setCategories(categoryData.data);
        setSelected(previous => categoryData.data.find(category => category.slug === previous?.slug) ?? categoryData.data[0] ?? null);
        setState("ready");
      }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (mode !== "categories" || !selected) return;
    const controller = new AbortController();
    setResultState("loading");
    fetch(`/api/categories/${encodeURIComponent(selected.slug)}`,{signal:controller.signal})
      .then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<{data:{films:DiscoveryFilm[]}}>; })
      .then(({data}) => { setResults(data.films); setResultState("ready"); })
      .catch(() => { if (!controller.signal.aborted) setResultState("error"); });
    return () => controller.abort();
  }, [selected,mode,resultAttempt]);
  function selectCategory(category: CategoryItem) {
    setSelected(category);
    resultSection.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  }
  const visibleCategories = categories.filter(category => [category.name,category.description].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const topRated = [...films].sort((a,b)=>(b.audienceScore??0)-(a.audienceScore??0));
  const newest = [...films].sort((a,b)=>(Date.parse(b.createdAt??"")||0)-(Date.parse(a.createdAt??"")||0));
  const hiddenGems = [...films].sort((a,b)=>(a.viewCount??0)-(b.viewCount??0));
  const pick=topRated[0];

  return <main className="discovery-page ed-page">
    <StreamingHeader active={mode} />
    <div className="explore-main">
      <header className="explore-heading"><div><p className="explore-kicker">{mode === "categories" ? "FIND YOUR KIND OF CINEMA" : "TAKE THE ROAD LESS WATCHED"}</p><h1>{mode === "categories" ? <>Every mood.<br /><span>A different story.</span></> : <>Your next great<br /><span>discovery starts here.</span></>}</h1><p>{mode === "categories" ? "Pick a genre, a spotlight, or a collection. Make it your kind of movie night." : "A fresh way into Filipino cinema. Start with a standout, catch up on new arrivals, or find a film under the radar."}</p></div><div className="explore-heading-aside">{mode === "categories" ? <><Layers3 size={25} /><strong>{categories.length}</strong><span>collections to explore</span></> : <><Sparkles size={25} /><strong>{films.length}</strong><span>stories to discover</span></>}</div></header>
      {state === "loading" ? <div className="explore-message" role="status"><span className="loading-mark" />Loading the collection...</div> : state === "error" ? <div className="explore-message" role="alert"><h2>We're between screenings.</h2><p>The collection couldn't load. Please try again.</p><button onClick={()=>setAttempt(value=>value+1)}>Try again <ArrowRight size={15} /></button></div> : mode === "categories" ? <>
        <div className="explore-toolbar"><p><span>{categories.length}</span> COLLECTIONS. ENDLESS PERSPECTIVES.</p><label><Search size={16} /><input type="search" aria-label="Search categories" placeholder="Find a collection" value={query} onChange={event=>setQuery(event.target.value)} /></label></div>
        <div className="explore-category-grid">{visibleCategories.map((category,index)=>{
          const active=selected?.slug===category.slug;
          return <button className={`explore-category-card tone-${index%5}${active?" is-selected":""}`} aria-pressed={active} key={category.slug} onClick={()=>selectCategory(category)}>
            <span className="explore-card-num">{String(index+1).padStart(2,"0")}</span>
            <div className="explore-card-copy"><h2>{category.name}</h2><p><span>{category.description}</span><ArrowUpRight size={13} className="explore-card-arrow-icon" aria-hidden="true" /></p></div>
          </button>;
        })}</div>
        {!visibleCategories.length && <p className="explore-message" role="status">No collections match your search.</p>}
        {selected && <section className="explore-results" ref={resultSection} aria-labelledby="collection-title"><div className="explore-results-heading"><div><p className="explore-kicker">YOUR SELECTED COLLECTION</p><h2 id="collection-title">{selected.name}</h2><p>{selected.description}</p></div><span>{selected.filmCount} {selected.filmCount===1?"film":"films"}</span></div>{resultState === "loading" ? <div className="explore-message" role="status">Loading films...</div> : resultState === "error" ? <div className="explore-message" role="alert"><p>This collection couldn't load.</p><button onClick={()=>setResultAttempt(value=>value+1)}>Try again</button></div> : results.length ? <><FilmCards films={results}/>{results.length<selected.filmCount&&<p className="explore-result-note">Showing the latest {results.length} films in this collection.</p>}</> : <div className="explore-message"><FilmIcon size={30}/><h3>The next story is on its way.</h3><p>No published films in this collection yet.</p></div>}</section>}
      </> : <>
        {pick ? <section className="explore-feature" aria-labelledby="tonight-title">{pick.backdropUrl&&<img className="explore-feature-backdrop" src={pick.backdropUrl} alt=""/>}<div className="explore-feature-copy"><p className="explore-kicker"><Sparkles size={13}/> TONIGHT'S PICK</p><h2 id="tonight-title">{pick.title}</h2><div className="explore-feature-meta">{pick.audienceScore != null && <><Star size={13} fill="currentColor"/>{(pick.audienceScore/20).toFixed(1)}<span>&middot;</span></>}{pick.releaseYear}{pick.genres?.[0] && <><span>&middot;</span>{pick.genres[0]}</>}</div><p>{pick.synopsis.split("\n")[0]}</p><Link href={`/films/${pick.slug}`}>Explore film <ArrowUpRight size={16}/></Link></div>{pick.posterUrl&&<img className="explore-feature-poster" src={pick.posterUrl} alt={`Poster for ${pick.title}`}/>}</section> : <div className="explore-message">New stories are on their way.</div>}
        {[{title:"Highly rated",copy:"Standouts from the collection.",films:topRated},{title:"Fresh on screen",copy:"The latest additions, all in one place.",films:newest},{title:"Under the radar",copy:"Less watched. Worth a closer look.",films:hiddenGems}].filter(section=>section.films.length).map(section=><section className="explore-discover-section" key={section.title} aria-label={section.title}><div><h2>{section.title}</h2><p>{section.copy}</p></div><FilmCards films={section.films.slice(0,8)} rail/></section>)}
      </>}
    </div>
    <EditorialFooter />
  </main>;
}
