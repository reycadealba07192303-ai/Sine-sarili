import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const castMemberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    characterName: { type: String, default: "", trim: true, maxlength: 160 },
    photoUrl: { type: String, default: "", maxlength: 2048 },
  },
  { _id: false }
);

const filmAwardSchema = new Schema(
  {
    awardName: { type: String, required: true, trim: true, maxlength: 200 },
    organization: { type: String, required: true, trim: true, maxlength: 200 },
    year: { type: Number, required: true, min: 1900, max: 2200 },
    awardType: {
      type: String,
      enum: ["win", "nomination", "official_selection", "honorary"],
      default: "win",
    },
    category: { type: String, default: "", trim: true, maxlength: 200 },
  },
  { _id: false }
);

const videoProviders = ["direct", "youtube", "vimeo", "hls", "embed", "external", "drm"];

const episodeSchema = new Schema({
  number: { type: Number, required: true, min: 1, max: 999 },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  synopsis: { type: String, default: "", maxlength: 2000 },
  runtimeMinutes: { type: Number, min: 1, max: 600 },
  thumbnailUrl: { type: String, default: "", maxlength: 2048 },
  videoUrl: { type: String, default: "", maxlength: 2048 },
  videoProvider: { type: String, enum: videoProviders, default: "direct" },
  drmAssetId: { type: String, default: "", maxlength: 256 },
  drmHlsUrl: { type: String, default: "", maxlength: 2048 },
  subtitlesUrl: { type: String, default: "", maxlength: 2048 },
});

const seasonSchema = new Schema({
  number: { type: Number, required: true, min: 1, max: 99 },
  title: { type: String, default: "", trim: true, maxlength: 160 },
  releaseYear: { type: Number, min: 1888, max: 2200 },
  episodes: { type: [episodeSchema], default: [] },
});

const filmSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    contentType: { type: String, enum: ["film", "series"], default: "film", index: true },
    seasons: { type: [seasonSchema], default: [] },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    synopsis: { type: String, default: "", maxlength: 5000 },
    tagline: { type: String, default: "", maxlength: 240 },
    posterUrl: { type: String, default: "" },
    backdropUrl: { type: String, default: "" },
    releaseYear: { type: Number, min: 1888, max: 2200 },
    runtimeMinutes: { type: Number, min: 1 },
    genres: { type: [String], default: [] },
    categories: { type: [String], default: ["films"], index: true },
    directorNames: { type: [String], default: [] },
    directorIds: [{ type: Schema.Types.ObjectId, ref: "Director" }],
    cast: { type: [castMemberSchema], default: [] },
    awards: { type: [filmAwardSchema], default: [] },
    videoUrl: { type: String, default: "" },
    videoProvider: {
      type: String,
      enum: ["direct", "youtube", "vimeo", "hls", "embed", "external", "drm"],
      default: "direct",
    },
    teaserUrl: { type: String, default: "" },
    teaserProvider: {
      type: String,
      enum: ["direct", "youtube", "vimeo", "hls", "embed", "external", "drm"],
      default: "direct",
    },
    drmAssetId: { type: String, default: "", maxlength: 256 },
    drmHlsUrl: { type: String, default: "", maxlength: 2048 },
    teaserDrmAssetId: { type: String, default: "", maxlength: 256 },
    subtitlesUrl: { type: String, default: "" },
    isFeatured: { type: Boolean, default: false, index: true },
    featuredOrder: { type: Number, default: 0 },
    audienceScore: { type: Number, min: 0, max: 100 },
    viewCount: { type: Number, default: 0, min: 0 },
    playCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["draft", "pending_approval", "published", "archived"],
      default: "draft",
      index: true,
    },
    visibility: { type: String, enum: ["public", "restricted"], default: "public", index: true },
  },
  { timestamps: true }
);

filmSchema.index({ title: "text", synopsis: "text", genres: "text", directorNames: "text" });
filmSchema.index({ status: 1, visibility: 1, createdAt: -1 });
filmSchema.index({ "seasons.episodes.videoUrl": 1 });
filmSchema.index({ "seasons.episodes.subtitlesUrl": 1 });

type FilmRecord = InferSchemaType<typeof filmSchema>;
export const Film =
  (models.Film as Model<FilmRecord> | undefined) ?? model<FilmRecord>("Film", filmSchema);
