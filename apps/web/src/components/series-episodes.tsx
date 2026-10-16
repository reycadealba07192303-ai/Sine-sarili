"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Lock, Play, SkipForward, X } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import type { Episode, FullFilm, Season } from "@/components/film-detail";

type Playing = { season: Season; episode: Episode };

export function SeriesEpisodes({ film }: { film: FullFilm }) {
  const seasons = film.seasons ?? [];
  const [seasonIndex, setSeasonIndex] = useState(0);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const season = seasons[seasonIndex];
  const unlocked = film.isAuthenticated === true;

  useEffect(() => {
    if (!playing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => { document.body.style.overflow = previous; };
  }, [playing]);

  if (!season) return null;

  const allEpisodes = seasons.flatMap(item => item.episodes.map(episode => ({ season: item, episode })));
  const playingIndex = playing ? allEpisodes.findIndex(item => item.episode._id === playing.episode._id) : -1;
  const nextUp = playingIndex >= 0 ? allEpisodes.slice(playingIndex + 1).find(item => item.episode.isAvailable) : undefined;
  const label = (item: Playing) => `S${item.season.number}:E${item.episode.number}`;

  return (
    <section className="series-episodes" aria-labelledby="episodes-title">
      <header className="series-episodes-heading">
        <div>
          <h2 id="episodes-title">Episodes</h2>
          <p>{[season.title, season.releaseYear, `${season.episodes.length} ${season.episodes.length === 1 ? "episode" : "episodes"}`].filter(Boolean).join(" · ")}</p>
        </div>
        {seasons.length > 1 ? (
          <label className="series-season-select">
            <span className="sr-only">Choose a season</span>
            <select value={seasonIndex} onChange={event => setSeasonIndex(Number(event.target.value))}>
              {seasons.map((item, index) => <option key={item._id} value={index}>Season {item.number}</option>)}
            </select>
          </label>
        ) : <span className="series-season-label">Season {season.number}</span>}
      </header>

      <ol className="series-episode-list">
        {season.episodes.map(episode => (
          <li key={episode._id}>
            <button type="button" className="series-episode" disabled={!episode.isAvailable} onClick={() => setPlaying({ season, episode })}>
              <span className="series-episode-number">{episode.number}</span>
              <span className="series-episode-thumb">
                {episode.thumbnailUrl || film.backdropUrl ? <img src={episode.thumbnailUrl || film.backdropUrl} alt="" loading="lazy" /> : null}
                <span className="series-episode-play" aria-hidden="true">{episode.isAvailable ? unlocked ? <Play size={18} fill="currentColor" /> : <Lock size={16} /> : null}</span>
              </span>
              <span className="series-episode-copy">
                <span className="series-episode-title"><strong>{episode.title}</strong>{episode.isAvailable ? episode.runtimeMinutes ? <span>{episode.runtimeMinutes}m</span> : null : <span className="series-soon">Coming soon</span>}</span>
                {episode.synopsis && <span className="series-episode-synopsis">{episode.synopsis}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {playing && <dialog ref={dialog} className="film-screening-dialog" aria-labelledby="episode-title" onCancel={() => setPlaying(null)} onClose={() => setPlaying(null)}>
        <header className="film-screening-heading">
          <div><p>{label(playing)} · {film.title.toUpperCase()}</p><h2 id="episode-title">{playing.episode.title}</h2></div>
          <button autoFocus aria-label="Close episode" onClick={() => setPlaying(null)}><X size={21} /></button>
        </header>
        <div className="film-screening-player">
          {unlocked && playing.episode.videoUrl
            ? <VideoPlayer key={playing.episode._id} filmSlug={film.slug} filmTitle={`${film.title} — ${label(playing)} ${playing.episode.title}`} videoUrl={playing.episode.videoUrl} videoProvider={playing.episode.videoProvider} subtitlesUrl={playing.episode.subtitlesUrl} posterUrl={playing.episode.thumbnailUrl || film.backdropUrl || film.posterUrl} autoPlay fitToContainer trackHistory episodeId={playing.episode._id} episodeLabel={`${label(playing)} · ${playing.episode.title}`} />
            : <div className="film-screening-empty"><Lock size={28} /><h3>This episode is part of CinePass.</h3><p>{film.isSignedIn ? "Subscribe to watch every episode of this series." : "Sign in, then get CinePass to watch every episode."}</p></div>}
        </div>
        {unlocked ? nextUp && <footer className="film-screening-footer">
          <div><strong>Up next · {label(nextUp)}</strong><p>{nextUp.episode.title}</p></div>
          <button type="button" className="series-next" onClick={() => { setSeasonIndex(seasons.indexOf(nextUp.season)); setPlaying(nextUp); }}><SkipForward size={16} />Next episode</button>
        </footer> : <footer className="film-screening-footer">
          <div><strong>{film.isSignedIn ? "Get CinePass to keep watching." : "The story doesn't end here."}</strong><p>{film.isSignedIn ? "Unlock every film and every episode." : "Sign in to start watching."}</p></div>
          <Link href={film.isSignedIn ? "/subscribe" : "/signup?mode=signin"}>{film.isSignedIn ? "Get CinePass" : "Sign in to watch"}</Link>
        </footer>}
      </dialog>}
    </section>
  );
}
