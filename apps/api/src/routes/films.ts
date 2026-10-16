import { createHash } from "node:crypto";
import { Router } from "express";
import { Film } from "../models/film.js";
import { AnalyticsEvent } from "../models/analytics-event.js";
import { connectDatabase } from "../db.js";
import { resolveVideoSource } from "../video-service.js";
import mongoose from "mongoose";
import { currentViewer, getViewerAccessStatus } from "../auth.js";
import { WatchHistory } from "../models/watch-history.js";

export const filmsRouter = Router();

filmsRouter.get("/", async (request, response, next) => {
  try {
    await connectDatabase();
    const {
      q,
      category,
      genre,
      director,
      year,
      featured,
      sort = "newest",
      limit = "24",
      page = "1",
    } = request.query;

    const filter: Record<string, unknown> = {
      status: "published",
      visibility: "public",
    };

    if (typeof q === "string" && q.trim()) {
      const term = q.trim();
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { title: regex },
        { synopsis: regex },
        { genres: regex },
        { directorNames: regex },
        { "cast.name": regex },
      ];
    }

    if (typeof category === "string" && category.trim()) {
      filter.categories = category.trim();
    }

    if (typeof genre === "string" && genre.trim()) {
      filter.genres = genre.trim();
    }

    if (typeof director === "string" && director.trim()) {
      filter.directorNames = director.trim();
    }

    if (typeof year === "string" && !isNaN(Number(year))) {
      filter.releaseYear = Number(year);
    }

    if (featured === "true") {
      filter.isFeatured = true;
    }

    const sortOption: Record<string, 1 | -1> = {};
    if (sort === "popular") {
      sortOption.viewCount = -1;
      sortOption.playCount = -1;
    } else if (sort === "year") {
      sortOption.releaseYear = -1;
    } else if (sort === "oldest") {
      sortOption.createdAt = 1;
    } else if (sort === "title") {
      sortOption.title = 1;
    } else {
      sortOption.createdAt = -1;
    }

    const parsedLimit = Math.max(1, Math.min(100, Number(limit) || 24));
    const parsedPage = Math.max(1, Number(page) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [films, totalCount] = await Promise.all([
      Film.find(filter)
        .select(
          "title slug contentType synopsis tagline posterUrl backdropUrl teaserUrl teaserProvider releaseYear runtimeMinutes genres categories directorNames cast awards isFeatured audienceScore viewCount playCount createdAt"
        )
        .sort(sortOption)
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      Film.countDocuments(filter),
    ]);

    response.json({
      data: films,
      meta: {
        total: totalCount,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(totalCount / parsedLimit),
      },
    });
  } catch (error) {
    next(error);
  }
});

filmsRouter.get("/:slug", async (request, response, next) => {
  try {
    await connectDatabase();
    const film = await Film.findOne({
      slug: request.params.slug,
      status: "published",
      visibility: "public",
    }).lean();

    if (!film) {
      response.status(404).json({ error: "Film not found" });
      return;
    }

    // Check session for viewer / admin permissions
    const { isSignedIn, isAuthenticated } = await getViewerAccessStatus(request);
    response.setHeader("Cache-Control", "private, no-store");

    // Resolve video and teaser stream metadata
    const playback = resolveVideoSource(
      film.videoUrl,
      film.videoProvider as any,
      film.subtitlesUrl,
      true,
      isAuthenticated
    );

    const teaserPlayback = resolveVideoSource(
      film.teaserUrl,
      film.teaserProvider as any,
      undefined,
      false,
      true
    );

    // Find related films (sharing genres or categories, excluding self)
    const relatedFilms = await Film.find({
      _id: { $ne: film._id },
      status: "published",
      visibility: "public",
      $or: [
        { genres: { $in: film.genres } },
        { categories: { $in: film.categories } },
      ],
    })
      .select("title slug posterUrl backdropUrl releaseYear runtimeMinutes genres audienceScore")
      .limit(6)
      .lean();

    const seasons = [...(film.seasons ?? [])]
      .sort((a, b) => a.number - b.number)
      .map((season) => ({
        ...season,
        episodes: [...(season.episodes ?? [])]
          .sort((a, b) => a.number - b.number)
          .map((episode) => ({
            ...episode,
            isAvailable: Boolean(episode.videoUrl),
            videoUrl: isAuthenticated ? episode.videoUrl : "",
            drmAssetId: undefined,
            drmHlsUrl: undefined,
            subtitlesUrl: isAuthenticated ? episode.subtitlesUrl : "",
          })),
      }));

    response.json({
      data: {
        ...film,
        seasons,
        drmAssetId: undefined,
        drmHlsUrl: undefined,
        teaserDrmAssetId: undefined,
        videoUrl: isAuthenticated ? film.videoUrl : "",
        subtitlesUrl: isAuthenticated ? film.subtitlesUrl : "",
        isSignedIn,
        isAuthenticated,
        playback,
        teaserPlayback,
        relatedFilms,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Analytics tracking endpoint for film viewing and playback events
 */
filmsRouter.post("/:slug/events", async (request, response, next) => {
  try {
    await connectDatabase();
    const slug = request.params.slug;
    const { eventType, durationSeconds = 0, progressSeconds = 0, errorMessage = "", trackHistory = false, episodeId = "", episodeLabel = "" } = request.body ?? {};

    const validEvents = ["page_view", "video_start", "video_progress", "video_complete", "playback_error"];
    if (!validEvents.includes(eventType)) {
      response.status(400).json({ error: "Invalid eventType" });
      return;
    }

    const film = await Film.findOne({ slug }).select("_id title").lean();
    if (!film) {
      response.status(404).json({ error: "Film not found" });
      return;
    }

    const rawIp =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.socket.remoteAddress ||
      "";
    const ipHash = rawIp ? createHash("sha256").update(rawIp).digest("hex").slice(0, 16) : "";
    const userAgent = (request.headers["user-agent"] || "").slice(0, 255);

    await AnalyticsEvent.create({
      eventType,
      filmId: film._id,
      filmSlug: slug,
      filmTitle: film.title,
      durationSeconds: Number(durationSeconds) || 0,
      progressSeconds: Number(progressSeconds) || 0,
      errorMessage: String(errorMessage).slice(0, 500),
      userAgent,
      ipHash,
    });

    const viewer = trackHistory === true && eventType !== "playback_error" ? currentViewer(request) : null;
    if (viewer && mongoose.isValidObjectId(viewer.sub)) {
      const progress = Math.max(0, Number(progressSeconds) || 0);
      const duration = Math.max(0, Number(durationSeconds) || 0);
      const completed = eventType === "video_complete" || (duration > 0 && progress / duration >= 0.95);
      await WatchHistory.updateOne(
        { viewerId: viewer.sub, filmId: film._id },
        {
          $set: {
            episodeId: String(episodeId).slice(0, 64),
            episodeLabel: String(episodeLabel).slice(0, 200),
            lastWatchedAt: new Date(),
            completed,
            ...(progress > 0 || duration > 0 ? { progressSeconds: progress, durationSeconds: duration } : {}),
          },
        },
        { upsert: true }
      );
    }

    // Update real counts on film model
    if (eventType === "page_view") {
      await Film.updateOne({ _id: film._id }, { $inc: { viewCount: 1 } });
    } else if (eventType === "video_start") {
      await Film.updateOne({ _id: film._id }, { $inc: { playCount: 1 } });
    }

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});
