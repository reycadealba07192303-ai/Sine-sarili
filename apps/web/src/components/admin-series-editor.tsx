"use client";

import { useState } from "react";

type VideoProvider = "direct" | "youtube" | "vimeo" | "hls" | "embed" | "external" | "drm";

export type EpisodeDraft = {
  key: string;
  title: string;
  synopsis: string;
  runtimeMinutes: string;
  thumbnailUrl: string;
  videoUrl: string;
  videoProvider: VideoProvider;
  drmAssetId: string;
  drmHlsUrl: string;
  subtitlesUrl: string;
};

export type SeasonDraft = { key: string; title: string; releaseYear: string; episodes: EpisodeDraft[] };

type ApiEpisode = { title?: string; synopsis?: string; runtimeMinutes?: number; thumbnailUrl?: string; videoUrl?: string; videoProvider?: VideoProvider; drmAssetId?: string; drmHlsUrl?: string; subtitlesUrl?: string };
type ApiSeason = { title?: string; releaseYear?: number; episodes?: ApiEpisode[] };

const PROVIDERS: VideoProvider[] = ["direct", "youtube", "vimeo", "hls", "embed", "external", "drm"];
const newKey = () => crypto.randomUUID();
const newEpisode = (): EpisodeDraft => ({ key: newKey(), title: "", synopsis: "", runtimeMinutes: "", thumbnailUrl: "", videoUrl: "", videoProvider: "direct", drmAssetId: "", drmHlsUrl: "", subtitlesUrl: "" });
const newSeason = (): SeasonDraft => ({ key: newKey(), title: "", releaseYear: "", episodes: [newEpisode()] });

export function seasonDraftsFromApi(seasons: ApiSeason[] = []): SeasonDraft[] {
  return seasons.map(season => ({
    key: newKey(),
    title: season.title ?? "",
    releaseYear: season.releaseYear ? String(season.releaseYear) : "",
    episodes: (season.episodes ?? []).map(episode => ({
      key: newKey(),
      title: episode.title ?? "",
      synopsis: episode.synopsis ?? "",
      runtimeMinutes: episode.runtimeMinutes ? String(episode.runtimeMinutes) : "",
      thumbnailUrl: episode.thumbnailUrl ?? "",
      videoUrl: episode.videoUrl ?? "",
      videoProvider: episode.videoProvider ?? "direct",
      drmAssetId: episode.drmAssetId ?? "",
      drmHlsUrl: episode.drmHlsUrl ?? "",
      subtitlesUrl: episode.subtitlesUrl ?? "",
    })),
  }));
}

export function seasonDraftsToPayload(seasons: SeasonDraft[]) {
  return seasons.map((season, seasonIndex) => ({
    number: seasonIndex + 1,
    title: season.title.trim(),
    releaseYear: Number(season.releaseYear) || undefined,
    episodes: season.episodes.map((episode, episodeIndex) => ({
      number: episodeIndex + 1,
      title: episode.title.trim() || `Episode ${episodeIndex + 1}`,
      synopsis: episode.synopsis.trim(),
      runtimeMinutes: Number(episode.runtimeMinutes) || undefined,
      thumbnailUrl: episode.thumbnailUrl.trim(),
      videoUrl: episode.videoUrl.trim(),
      videoProvider: episode.videoProvider,
      drmAssetId: episode.drmAssetId.trim(),
      drmHlsUrl: episode.drmHlsUrl.trim(),
      subtitlesUrl: episode.subtitlesUrl.trim(),
    })),
  }));
}

export function AdminSeriesEditor({ seasons, onChange, onUploadVideo }: {
  seasons: SeasonDraft[];
  onChange: (seasons: SeasonDraft[]) => void;
  onUploadVideo: (file: File) => Promise<string | null>;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const updateSeason = (key: string, patch: Partial<SeasonDraft>) => onChange(seasons.map(season => season.key === key ? { ...season, ...patch } : season));
  const updateEpisode = (seasonKey: string, episodeKey: string, patch: Partial<EpisodeDraft>) => onChange(seasons.map(season => season.key !== seasonKey ? season : {
    ...season,
    episodes: season.episodes.map(episode => episode.key === episodeKey ? { ...episode, ...patch } : episode),
  }));
  const moveEpisode = (season: SeasonDraft, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= season.episodes.length) return;
    const episodes = [...season.episodes];
    [episodes[index], episodes[target]] = [episodes[target], episodes[index]];
    updateSeason(season.key, { episodes });
  };

  async function upload(seasonKey: string, episodeKey: string, file: File | undefined) {
    if (!file) return;
    setUploadingKey(episodeKey);
    const url = await onUploadVideo(file);
    setUploadingKey(null);
    if (url) updateEpisode(seasonKey, episodeKey, { videoUrl: url, videoProvider: "direct" });
  }

  return (
    <div className="series-editor">
      <p className="series-editor-note">Members with an active CinePass watch these episodes. Guests only see the teaser. Episodes are numbered in the order listed.</p>
      {seasons.map((season, seasonIndex) => (
        <fieldset key={season.key} className="series-editor-season">
          <legend>Season {seasonIndex + 1}</legend>
          <div className="series-editor-row">
            <label>Season title (optional)<input value={season.title} placeholder={`Season ${seasonIndex + 1}`} onChange={event => updateSeason(season.key, { title: event.target.value })} /></label>
            <label>Release year<input type="number" min={1888} max={2200} value={season.releaseYear} onChange={event => updateSeason(season.key, { releaseYear: event.target.value })} /></label>
            <button type="button" className="series-editor-remove" onClick={() => { if (window.confirm(`Remove Season ${seasonIndex + 1} and all its episodes?`)) onChange(seasons.filter(item => item.key !== season.key)); }}>Remove season</button>
          </div>

          {season.episodes.map((episode, episodeIndex) => (
            <div key={episode.key} className="series-editor-episode">
              <div className="series-editor-episode-head">
                <strong>Episode {episodeIndex + 1}</strong>
                <div>
                  <button type="button" aria-label={`Move episode ${episodeIndex + 1} up`} disabled={episodeIndex === 0} onClick={() => moveEpisode(season, episodeIndex, -1)}>Move up</button>
                  <button type="button" aria-label={`Move episode ${episodeIndex + 1} down`} disabled={episodeIndex === season.episodes.length - 1} onClick={() => moveEpisode(season, episodeIndex, 1)}>Move down</button>
                  <button type="button" className="series-editor-remove" onClick={() => updateSeason(season.key, { episodes: season.episodes.filter(item => item.key !== episode.key) })}>Remove</button>
                </div>
              </div>
              <div className="series-editor-grid">
                <label className="span-2">Episode title<input value={episode.title} placeholder={`Episode ${episodeIndex + 1}`} onChange={event => updateEpisode(season.key, episode.key, { title: event.target.value })} /></label>
                <label className="span-2">Synopsis<textarea rows={2} value={episode.synopsis} onChange={event => updateEpisode(season.key, episode.key, { synopsis: event.target.value })} /></label>
                <label>Runtime (minutes)<input type="number" min={1} max={600} value={episode.runtimeMinutes} onChange={event => updateEpisode(season.key, episode.key, { runtimeMinutes: event.target.value })} /></label>
                <label>Thumbnail URL<input value={episode.thumbnailUrl} placeholder="https://… (optional)" onChange={event => updateEpisode(season.key, episode.key, { thumbnailUrl: event.target.value })} /></label>
                <label>Video URL<input value={episode.videoUrl} placeholder="Upload a file or paste a stream link" onChange={event => updateEpisode(season.key, episode.key, { videoUrl: event.target.value, ...(episode.videoProvider === "drm" ? { videoProvider: "direct" as VideoProvider } : {}) })} /></label>
                <label>Video provider<select value={episode.videoProvider} onChange={event => updateEpisode(season.key, episode.key, { videoProvider: event.target.value as VideoProvider })}>{PROVIDERS.filter(provider => provider !== "drm" || episode.videoProvider === "drm").map(provider => <option key={provider} value={provider}>{provider === "drm" ? "protected (automatic)" : provider}</option>)}</select></label>
                {episode.videoProvider === "drm" ? <p className="span-2 studio-protect-note is-on">Protected. This episode was encrypted automatically.</p> : episode.videoUrl.startsWith("/uploads/") ? <p className="span-2 studio-protect-note">This uploaded episode will be encrypted automatically about a minute after you save.</p> : null}
                <label>Upload episode video<input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={uploadingKey !== null} onChange={event => upload(season.key, episode.key, event.target.files?.[0])} />{uploadingKey === episode.key && <small>Uploading…</small>}</label>
                <label>Subtitles URL (.vtt)<input value={episode.subtitlesUrl} placeholder="Optional" onChange={event => updateEpisode(season.key, episode.key, { subtitlesUrl: event.target.value })} /></label>
              </div>
            </div>
          ))}
          <button type="button" className="series-editor-add" onClick={() => updateSeason(season.key, { episodes: [...season.episodes, newEpisode()] })}>+ Add episode</button>
        </fieldset>
      ))}
      <button type="button" className="series-editor-add series-editor-add-season" onClick={() => onChange([...seasons, newSeason()])}>+ Add season</button>
    </div>
  );
}
