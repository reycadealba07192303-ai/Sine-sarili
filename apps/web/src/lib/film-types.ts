export type CastMember = { name: string; characterName: string; photoUrl: string };

export type Film = {
  _id: string;
  title: string;
  slug: string;
  synopsis: string;
  tagline?: string;
  releaseYear: number;
  runtimeMinutes: number;
  audienceScore?: number;
  genres: string[];
  directorNames: string[];
  cast: CastMember[];
  posterUrl: string;
  backdropUrl: string;
  teaserUrl?: string;
  videoUrl?: string;
};
