import { emailSubscriptionActivation } from "../services/subscription-activation.js";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import mongoose from "mongoose";
import { AdminUser, ADMIN_PERMISSIONS } from "../models/admin-user.js";
import { Film } from "../models/film.js";
import { Announcement } from "../models/announcement.js";
import { Category } from "../models/category.js";
import { Director } from "../models/director.js";
import { Award } from "../models/award.js";
import { ActivityLog } from "../models/activity-log.js";
import { AnalyticsEvent } from "../models/analytics-event.js";
import { SystemSetting } from "../models/system-setting.js";
import { Subscription } from "../models/subscription.js";
import { ViewerAccount } from "../models/viewer-account.js";
import { BankAccount } from "../models/bank-account.js";
import { PaymentSubmission } from "../models/payment-submission.js";
import { connectDatabase } from "../db.js";
import { ensureUploadsDirectory, uploadsDirectory } from "../uploads.js";
import { localDrmUrl } from "../services/drm.js";
import { getPlans, PlanValidationError, savePlans } from "../services/plans.js";
import {
  clearSessionCookie,
  createPasswordHash,
  currentSession,
  recordActivity,
  requireAdmin,
  requirePermission,
  requireSuperAdmin,
  setSessionCookie,
  verifyPassword,
} from "../auth.js";

export const adminRouter = Router();

const VIDEO_PROVIDERS = ["direct", "youtube", "vimeo", "hls", "embed", "external", "drm"];

// A source is only "drm" when it really is an encrypted stream with a key; anything else would never play.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function playableSource(rawUrl: unknown, rawProvider: unknown, rawAssetId: unknown) {
  const url = cleanText(rawUrl, 2048);
  const provider = VIDEO_PROVIDERS.includes(String(rawProvider)) ? String(rawProvider) : "direct";
  const assetId = cleanText(rawAssetId, 256);
  if (localDrmUrl(url)) return { url, provider: "drm", assetId: assetId || url.split("/")[3] };
  if (provider === "drm" && UUID.test(assetId) && /^https:\/\/.+\.mpd(\?.*)?$/i.test(url)) return { url, provider, assetId };
  if (provider !== "drm") return { url, provider, assetId: "" };
  const detected = /youtube\.com|youtu\.be/i.test(url) ? "youtube" : /vimeo\.com/i.test(url) ? "vimeo" : /\.m3u8(\?|$)/i.test(url) ? "hls" : "direct";
  return { url, provider: detected, assetId: "" };
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanNumber(value: unknown, min: number, max: number) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

function optionalScore(value: unknown) {
  return value === "" || value === null || value === undefined ? undefined : cleanNumber(value, 0, 100);
}

function sanitizeSeasons(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).map((season, seasonIndex) => {
    const rawEpisodes = Array.isArray(season?.episodes) ? season.episodes : [];
    return {
      number: cleanNumber(season?.number, 1, 99) ?? seasonIndex + 1,
      title: cleanText(season?.title, 160),
      releaseYear: cleanNumber(season?.releaseYear, 1888, 2200),
      episodes: rawEpisodes.slice(0, 200).map((episode: Record<string, unknown>, episodeIndex: number) => ({
        number: cleanNumber(episode?.number, 1, 999) ?? episodeIndex + 1,
        title: cleanText(episode?.title, 160) || `Episode ${episodeIndex + 1}`,
        synopsis: cleanText(episode?.synopsis, 2000),
        runtimeMinutes: cleanNumber(episode?.runtimeMinutes, 1, 600),
        thumbnailUrl: cleanText(episode?.thumbnailUrl, 2048),
        ...(() => {
          const source = playableSource(episode?.videoUrl, episode?.videoProvider, episode?.drmAssetId);
          return { videoUrl: source.url, videoProvider: source.provider, drmAssetId: source.assetId, drmHlsUrl: source.provider === "drm" ? cleanText(episode?.drmHlsUrl, 2048) : "" };
        })(),
        subtitlesUrl: cleanText(episode?.subtitlesUrl, 2048),
      })),
    };
  });
}

// ==========================================
// 1. Session & Auth Management
// ==========================================

adminRouter.post("/session", async (request, response, next) => {
  try {
    await connectDatabase();
    const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!email || !password || email.length > 254 || password.length > 1024) {
      response.status(400).json({ error: "Enter a valid email and password" });
      return;
    }

    const admin = await AdminUser.findOne({ email }).lean();
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      response.status(401).json({ error: "Email or password is incorrect" });
      return;
    }

    if (admin.status !== "active") {
      response.status(403).json({ error: "Your account is deactivated or suspended. Contact Super Admin." });
      return;
    }

    // Update lastLoginAt
    await AdminUser.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });

    setSessionCookie(response, {
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      role: admin.role as "super_admin" | "admin" | "editor",
    });

    await recordActivity(request, "login", "session", String(admin._id), {
      email: admin.email,
      role: admin.role,
    }, { sub: String(admin._id), name: admin.name, email: admin.email, role: admin.role });

    response.json({
      data: {
        id: String(admin._id),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions ?? [],
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/session", requireAdmin, async (_request, response) => {
  const admin = response.locals.admin;
  response.json({ data: admin });
});

adminRouter.delete("/session", async (request, response) => {
  const session = currentSession(request);
  if (session) {
    await recordActivity(request, "logout", "session", session.sub, { email: session.email });
  }
  clearSessionCookie(response);
  response.status(204).end();
});

// ==========================================
// 2. Dashboard Statistics & Overview
// ==========================================

adminRouter.get("/dashboard-stats", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();

    const [
      totalFilms,
      publishedFilms,
      draftFilms,
      pendingFilms,
      archivedFilms,
      activeAdmins,
      totalAnnouncements,
      totalCategories,
      totalDirectors,
      totalAwards,
      totalPageViews,
      totalVideoStarts,
      totalVideoCompletes,
      totalPlaybackErrors,
      recentActivity,
      recentErrors,
      recentFilms,
      topWatched,
    ] = await Promise.all([
      Film.countDocuments(),
      Film.countDocuments({ status: "published" }),
      Film.countDocuments({ status: "draft" }),
      Film.countDocuments({ status: "pending_approval" }),
      Film.countDocuments({ status: "archived" }),
      AdminUser.countDocuments({ status: "active" }),
      Announcement.countDocuments(),
      Category.countDocuments(),
      Director.countDocuments(),
      Award.countDocuments(),
      AnalyticsEvent.countDocuments({ eventType: "page_view" }),
      AnalyticsEvent.countDocuments({ eventType: "video_start" }),
      AnalyticsEvent.countDocuments({ eventType: "video_complete" }),
      AnalyticsEvent.countDocuments({ eventType: "playback_error" }),
      ActivityLog.find().sort({ createdAt: -1 }).limit(6).lean(),
      AnalyticsEvent.find({ eventType: "playback_error" }).sort({ createdAt: -1 }).limit(5).lean(),
      Film.find().select("title slug posterUrl status contentType createdAt").sort({ createdAt: -1 }).limit(5).lean(),
      Film.find({ $or: [{ playCount: { $gt: 0 } }, { viewCount: { $gt: 0 } }] })
        .select("title slug posterUrl status contentType playCount viewCount")
        .sort({ playCount: -1, viewCount: -1 })
        .limit(5)
        .lean(),
    ]);

    response.json({
      data: {
        recentFilms,
        topWatched,
        films: {
          total: totalFilms,
          published: publishedFilms,
          draft: draftFilms,
          pending_approval: pendingFilms,
          archived: archivedFilms,
        },
        admins: { active: activeAdmins },
        announcements: { total: totalAnnouncements },
        categories: { total: totalCategories },
        directors: { total: totalDirectors },
        awards: { total: totalAwards },
        metrics: {
          pageViews: totalPageViews,
          videoStarts: totalVideoStarts,
          videoCompletes: totalVideoCompletes,
          playbackErrors: totalPlaybackErrors,
        },
        recentActivity,
        recentErrors,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 3. Media Upload Layer
// ==========================================

adminRouter.post("/uploads/:kind", requireAdmin, async (request, response, next) => {
  const kind = String(request.params.kind ?? "");
  const imageTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const videoTypes: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
  const isImage = kind === "poster" || kind === "backdrop" || kind === "photo" || kind === "qrcode";
  const allowedTypes = isImage ? imageTypes : ["teaser", "film"].includes(kind) ? videoTypes : null;

  if (!allowedTypes) {
    response.status(400).json({ error: "Choose a poster, backdrop, photo, qrcode, teaser, or film upload" });
    return;
  }

  const contentType = request.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const extension = allowedTypes[contentType];
  const maxBytes = isImage ? 20 * 1024 * 1024 : 2 * 1024 * 1024 * 1024;
  const declaredBytes = Number(request.get("content-length") ?? 0);

  if (!extension) {
    response.status(415).json({ error: isImage ? "Upload a JPG, PNG, or WebP image" : "Upload an MP4, WebM, or MOV video" });
    return;
  }
  if (declaredBytes > maxBytes) {
    response.status(413).json({ error: isImage ? "Images must be 20 MB or smaller" : "Videos must be 2 GB or smaller" });
    return;
  }

  const filename = `${randomUUID()}.${extension}`;
  const destination = `${uploadsDirectory}/${filename}`;
  let receivedBytes = 0;
  const sizeGuard = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      callback(receivedBytes > maxBytes ? Object.assign(new Error("Upload is too large"), { status: 413 }) : null, chunk);
    },
  });

  try {
    await ensureUploadsDirectory();
    await pipeline(request, sizeGuard, createWriteStream(destination, { flags: "wx" }));
    response.status(201).json({ data: { url: `/uploads/${filename}`, size: receivedBytes } });
  } catch (error) {
    await unlink(destination).catch(() => undefined);
    if (error && typeof error === "object" && "status" in error && error.status === 413) {
      response.status(413).json({ error: isImage ? "Images must be 20 MB or smaller" : "Videos must be 2 GB or smaller" });
      return;
    }
    next(error);
  }
});

// ==========================================
// 4. Films Management
// ==========================================

adminRouter.get("/films", requireAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const { status, category, q } = request.query;
    const filter: Record<string, unknown> = {};

    if (typeof status === "string" && status && status !== "all") {
      filter.status = status;
    }
    if (typeof category === "string" && category) {
      filter.categories = category;
    }
    if (typeof q === "string" && q.trim()) {
      const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: regex }, { directorNames: regex }, { genres: regex }];
    }

    const films = await Film.find(filter)
      .sort({ updatedAt: -1 })
      .limit(150)
      .lean();

    response.json({ data: films });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/films", requirePermission("films"), async (request, response, next) => {
  try {
    await connectDatabase();
    const {
      title,
      slug,
      synopsis = "",
      tagline = "",
      releaseYear,
      runtimeMinutes,
      genres = [],
      categories = ["films"],
      directorNames = [],
      cast = [],
      awards = [],
      posterUrl = "",
      backdropUrl = "",
      videoUrl = "",
      videoProvider = "direct",
      drmAssetId = "",
      drmHlsUrl = "",
      teaserUrl = "",
      teaserProvider = "direct",
      subtitlesUrl = "",
      isFeatured = false,
      visibility = "public",
      audienceScore,
      contentType = "film",
      seasons = [],
    } = request.body ?? {};

    if (typeof title !== "string" || !title.trim() || title.length > 160) {
      response.status(400).json({ error: "Title is required and must be under 160 characters" });
      return;
    }

    const cleanSlug = typeof slug === "string" && slug.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const film = await Film.create({
      title: title.trim(),
      slug: cleanSlug,
      synopsis: String(synopsis || "").slice(0, 5000),
      tagline: String(tagline || "").slice(0, 240),
      releaseYear: Number(releaseYear) || undefined,
      runtimeMinutes: Number(runtimeMinutes) || undefined,
      genres: Array.isArray(genres) ? genres.map(String) : [],
      categories: Array.isArray(categories) && categories.length ? categories.map(String) : ["films"],
      directorNames: Array.isArray(directorNames) ? directorNames.map(String) : [],
      cast: Array.isArray(cast) ? cast : [],
      awards: Array.isArray(awards) ? awards : [],
      posterUrl: String(posterUrl || ""),
      backdropUrl: String(backdropUrl || ""),
      ...(() => {
        const source = playableSource(videoUrl, videoProvider, drmAssetId);
        const teaser = playableSource(teaserUrl, teaserProvider, "");
        return {
          videoUrl: source.url, videoProvider: source.provider, drmAssetId: source.assetId,
          drmHlsUrl: source.provider === "drm" ? cleanText(drmHlsUrl, 2048) : "",
          teaserUrl: teaser.url, teaserProvider: teaser.provider,
        };
      })(),
      subtitlesUrl: String(subtitlesUrl || ""),
      isFeatured: Boolean(isFeatured),
      visibility: ["public", "restricted"].includes(visibility) ? visibility : "public",
      audienceScore: optionalScore(audienceScore),
      contentType: contentType === "series" ? "series" : "film",
      seasons: contentType === "series" ? sanitizeSeasons(seasons) : [],
      status: "draft",
    });

    await recordActivity(request, "film.create", "film", String(film._id), {
      title: film.title,
      slug: film.slug,
    });

    response.status(201).json({ data: film });
  } catch (error: any) {
    if (error?.code === 11000) {
      response.status(409).json({ error: "That slug is already in use" });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/films/:id", requirePermission("films"), async (request, response, next) => {
  try {
    await connectDatabase();
    const body = request.body ?? {};
    const updates: Record<string, unknown> = {};

    if ("title" in body && typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim();
    }
    if ("slug" in body && typeof body.slug === "string" && body.slug.trim()) {
      updates.slug = body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    if ("synopsis" in body) updates.synopsis = String(body.synopsis || "");
    if ("tagline" in body) updates.tagline = String(body.tagline || "");
    if ("posterUrl" in body) updates.posterUrl = String(body.posterUrl || "");
    if ("backdropUrl" in body) updates.backdropUrl = String(body.backdropUrl || "");
    if ("videoUrl" in body) updates.videoUrl = String(body.videoUrl || "");
    if ("drmAssetId" in body) updates.drmAssetId = cleanText(body.drmAssetId, 256);
    if ("drmHlsUrl" in body) updates.drmHlsUrl = cleanText(body.drmHlsUrl, 2048);
    if ("videoProvider" in body) updates.videoProvider = body.videoProvider;
    if ("teaserUrl" in body) updates.teaserUrl = String(body.teaserUrl || "");
    if ("teaserProvider" in body) updates.teaserProvider = body.teaserProvider;
    if ("videoUrl" in body && "videoProvider" in body) {
      const source = playableSource(body.videoUrl, body.videoProvider, body.drmAssetId);
      Object.assign(updates, { videoUrl: source.url, videoProvider: source.provider, drmAssetId: source.assetId, drmHlsUrl: source.provider === "drm" ? cleanText(body.drmHlsUrl, 2048) : "" });
    }
    if ("teaserUrl" in body && "teaserProvider" in body) {
      const teaser = playableSource(body.teaserUrl, body.teaserProvider, "");
      Object.assign(updates, { teaserUrl: teaser.url, teaserProvider: teaser.provider });
    }
    if ("subtitlesUrl" in body) updates.subtitlesUrl = String(body.subtitlesUrl || "");
    if ("releaseYear" in body) updates.releaseYear = Number(body.releaseYear) || undefined;
    if ("runtimeMinutes" in body) updates.runtimeMinutes = Number(body.runtimeMinutes) || undefined;
    if ("genres" in body && Array.isArray(body.genres)) updates.genres = body.genres.map(String);
    if ("categories" in body && Array.isArray(body.categories)) updates.categories = body.categories.map(String);
    if ("directorNames" in body && Array.isArray(body.directorNames)) updates.directorNames = body.directorNames.map(String);
    if ("cast" in body && Array.isArray(body.cast)) updates.cast = body.cast;
    if ("awards" in body && Array.isArray(body.awards)) updates.awards = body.awards;
    if ("isFeatured" in body) updates.isFeatured = Boolean(body.isFeatured);
    if ("visibility" in body && ["public", "restricted"].includes(body.visibility)) updates.visibility = body.visibility;
    if ("audienceScore" in body) {
      const score = optionalScore(body.audienceScore);
      if (score === undefined) updates.$unset = { audienceScore: 1 };
      else updates.audienceScore = score;
    }
    if ("contentType" in body) updates.contentType = body.contentType === "series" ? "series" : "film";
    if ("seasons" in body) updates.seasons = sanitizeSeasons(body.seasons);

    const film = await Film.findByIdAndUpdate(request.params.id, updates, { new: true, runValidators: true });
    if (!film) {
      response.status(404).json({ error: "Film not found" });
      return;
    }

    await recordActivity(request, "film.update", "film", String(film._id), {
      title: film.title,
      updatedFields: Object.keys(updates),
    });

    response.json({ data: film });
  } catch (error: any) {
    if (error?.code === 11000) {
      response.status(409).json({ error: "That slug is already in use" });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/films/:id/status", requirePermission("films"), async (request, response, next) => {
  try {
    await connectDatabase();
    let requestedStatus = request.body?.status;

    if (!["draft", "pending_approval", "published", "archived"].includes(requestedStatus)) {
      response.status(400).json({ error: "Invalid publishing status" });
      return;
    }

    const currentAdmin = response.locals.admin;
    // Check system approval policy
    if (requestedStatus === "published" && currentAdmin.role !== "super_admin") {
      const policySetting = await SystemSetting.findOne({ key: "approvalPolicy" }).lean();
      if (policySetting?.value === "require_super_admin_approval") {
        requestedStatus = "pending_approval";
      }
    }

    const film = await Film.findByIdAndUpdate(
      request.params.id,
      { status: requestedStatus },
      { new: true, runValidators: true }
    );

    if (!film) {
      response.status(404).json({ error: "Film not found" });
      return;
    }

    await recordActivity(request, "film.status_change", "film", String(film._id), {
      title: film.title,
      status: requestedStatus,
    });

    response.json({ data: film });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/films/:id", requirePermission("films"), async (request, response, next) => {
  try {
    await connectDatabase();
    const film = await Film.findByIdAndDelete(request.params.id);
    if (!film) {
      response.status(404).json({ error: "Film not found" });
      return;
    }

    await recordActivity(request, "film.delete", "film", String(film._id), {
      title: film.title,
    });

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 5. Categories Management
// ==========================================

adminRouter.get("/categories", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const categories = await Category.find().sort({ displayOrder: 1, name: 1 }).lean();
    response.json({ data: categories });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/categories", requirePermission("categories"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { name, slug, description = "", sectionKey = "films", displayOrder = 0, isVisible = true } = request.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      response.status(400).json({ error: "Category name is required" });
      return;
    }

    const baseSlug = (typeof slug === "string" && slug.trim() ? slug : name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
    let cleanSlug = baseSlug;
    for (let suffix = 2; await Category.exists({ slug: cleanSlug }); suffix++) cleanSlug = `${baseSlug}-${suffix}`;

    const category = await Category.create({
      name: name.trim(),
      slug: cleanSlug,
      description: String(description).slice(0, 1000),
      sectionKey,
      displayOrder: Number(displayOrder) || 0,
      isVisible: Boolean(isVisible),
    });

    await recordActivity(request, "category.create", "category", String(category._id), {
      name: category.name,
      slug: category.slug,
    });

    response.status(201).json({ data: category });
  } catch (error: any) {
    if (error?.code === 11000) {
      response.status(409).json({ error: "Category slug already exists" });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/categories/:id", requirePermission("categories"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { name, description, sectionKey, displayOrder, isVisible } = request.body ?? {};
    const updates: Record<string, unknown> = {};

    if (name && typeof name === "string") updates.name = name.trim();
    if (description !== undefined) updates.description = String(description);
    if (sectionKey) updates.sectionKey = sectionKey;
    if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);
    if (isVisible !== undefined) updates.isVisible = Boolean(isVisible);

    const category = await Category.findByIdAndUpdate(request.params.id, updates, { new: true });
    if (!category) {
      response.status(404).json({ error: "Category not found" });
      return;
    }

    await recordActivity(request, "category.update", "category", String(category._id), updates);
    response.json({ data: category });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/categories/:id", requirePermission("categories"), async (request, response, next) => {
  try {
    await connectDatabase();
    const category = await Category.findByIdAndDelete(request.params.id);
    if (!category) {
      response.status(404).json({ error: "Category not found" });
      return;
    }

    await recordActivity(request, "category.delete", "category", String(category._id), { name: category.name });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 6. Directors Management
// ==========================================

adminRouter.get("/directors", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const directors = await Director.find().sort({ displayOrder: 1, name: 1 }).lean();
    response.json({ data: directors });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/directors", requirePermission("directors"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { name, slug, title = "", displayOrder, bio = "", photoUrl = "", nationality = "Filipino", birthYear, featured = false, awardsSummary = [] } = request.body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      response.status(400).json({ error: "Name is required" });
      return;
    }

    const baseSlug = typeof slug === "string" && slug.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let cleanSlug = baseSlug || "person";
    for (let suffix = 2; await Director.exists({ slug: cleanSlug }); suffix++) cleanSlug = `${baseSlug}-${suffix}`;

    const director = await Director.create({
      name: name.trim(),
      title: cleanText(title, 120),
      displayOrder: cleanNumber(displayOrder, -100000, 100000) ?? 0,
      slug: cleanSlug,
      bio: cleanText(bio, 5000),
      photoUrl: cleanText(photoUrl, 2048),
      nationality: cleanText(nationality, 80) || "Filipino",
      birthYear: cleanNumber(birthYear, 1850, 2100),
      featured: Boolean(featured),
      awardsSummary: Array.isArray(awardsSummary) ? awardsSummary.map((item: unknown) => cleanText(item, 200)).filter(Boolean) : [],
    });

    await recordActivity(request, "director.create", "director", String(director._id), { name: director.name, title: director.title });
    response.status(201).json({ data: director });
  } catch (error: any) {
    if (error?.code === 11000) {
      response.status(409).json({ error: "Director slug already exists" });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/directors/:id", requirePermission("directors"), async (request, response, next) => {
  try {
    await connectDatabase();
    const body = request.body ?? {};
    const updates: Record<string, unknown> = {};
    if ("name" in body) {
      const name = cleanText(body.name, 160);
      if (!name) { response.status(400).json({ error: "Name is required" }); return; }
      updates.name = name;
    }
    if ("title" in body) updates.title = cleanText(body.title, 120);
    if ("displayOrder" in body) updates.displayOrder = cleanNumber(body.displayOrder, -100000, 100000) ?? 0;
    if ("bio" in body) updates.bio = cleanText(body.bio, 5000);
    if ("photoUrl" in body) updates.photoUrl = cleanText(body.photoUrl, 2048);
    if ("nationality" in body) updates.nationality = cleanText(body.nationality, 80);
    if ("birthYear" in body) updates.birthYear = cleanNumber(body.birthYear, 1850, 2100);
    if ("featured" in body) updates.featured = Boolean(body.featured);

    const director = await Director.findByIdAndUpdate(request.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!director) {
      response.status(404).json({ error: "Director not found" });
      return;
    }

    await recordActivity(request, "director.update", "director", String(director._id), { name: director.name, title: director.title });
    response.json({ data: director });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/directors/:id", requirePermission("directors"), async (request, response, next) => {
  try {
    await connectDatabase();
    const director = await Director.findByIdAndDelete(request.params.id);
    if (!director) {
      response.status(404).json({ error: "Director not found" });
      return;
    }
    await recordActivity(request, "director.delete", "director", String(director._id), { name: director.name });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 7. Awards & Achievements Management
// ==========================================

adminRouter.get("/awards", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const awards = await Award.find().sort({ year: -1, organization: 1 }).lean();
    response.json({ data: awards });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/awards", requirePermission("awards"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { title, organization, year, category = "", awardType = "win", filmId, filmTitle = "", recipientName = "", description = "" } = request.body ?? {};

    const cleanTitle = cleanText(title, 200);
    const cleanOrganization = cleanText(organization, 200);
    const cleanYear = cleanNumber(year, 1900, 2200);
    if (!cleanTitle || !cleanOrganization || !cleanYear) {
      response.status(400).json({ error: "Award title, organization, and a valid year are required" });
      return;
    }

    const award = await Award.create({
      title: cleanTitle,
      organization: cleanOrganization,
      year: cleanYear,
      category: cleanText(category, 200),
      awardType: ["win", "nomination", "official_selection", "honorary"].includes(awardType) ? awardType : "win",
      filmId: mongoose.isValidObjectId(filmId) ? filmId : undefined,
      filmTitle: cleanText(filmTitle, 200),
      recipientName: cleanText(recipientName, 200),
      description: cleanText(description, 2000),
    });

    await recordActivity(request, "award.create", "award", String(award._id), { title: award.title });
    response.status(201).json({ data: award });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/awards/:id", requirePermission("awards"), async (request, response, next) => {
  try {
    await connectDatabase();
    const body = request.body ?? {};
    const updates: Record<string, unknown> = {};
    if ("title" in body) {
      const title = cleanText(body.title, 200);
      if (!title) { response.status(400).json({ error: "Award title is required" }); return; }
      updates.title = title;
    }
    if ("organization" in body) {
      const organization = cleanText(body.organization, 200);
      if (!organization) { response.status(400).json({ error: "Organization is required" }); return; }
      updates.organization = organization;
    }
    if ("year" in body) {
      const year = cleanNumber(body.year, 1900, 2200);
      if (!year) { response.status(400).json({ error: "Enter a valid year" }); return; }
      updates.year = year;
    }
    if ("category" in body) updates.category = cleanText(body.category, 200);
    if ("awardType" in body && ["win", "nomination", "official_selection", "honorary"].includes(body.awardType)) updates.awardType = body.awardType;
    if ("filmId" in body) updates.filmId = mongoose.isValidObjectId(body.filmId) ? body.filmId : null;
    if ("filmTitle" in body) updates.filmTitle = cleanText(body.filmTitle, 200);
    if ("recipientName" in body) updates.recipientName = cleanText(body.recipientName, 200);
    if ("description" in body) updates.description = cleanText(body.description, 2000);

    const award = await Award.findByIdAndUpdate(request.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!award) {
      response.status(404).json({ error: "Award not found" });
      return;
    }
    await recordActivity(request, "award.update", "award", String(award._id), { title: award.title });
    response.json({ data: award });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/awards/:id", requirePermission("awards"), async (request, response, next) => {
  try {
    await connectDatabase();
    const award = await Award.findByIdAndDelete(request.params.id);
    if (!award) {
      response.status(404).json({ error: "Award not found" });
      return;
    }
    await recordActivity(request, "award.delete", "award", String(award._id), { title: award.title });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 8. Announcements Management
// ==========================================

adminRouter.get("/announcements", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const announcements = await Announcement.find().sort({ updatedAt: -1 }).limit(100).lean();
    response.json({ data: announcements });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/announcements", requirePermission("announcements"), async (request, response, next) => {
  try {
    await connectDatabase();
    const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
    const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
    const status = request.body?.status ?? "draft";

    if (!title || title.length > 160 || !message || message.length > 2000) {
      response.status(400).json({ error: "Add a title and message under 2000 characters" });
      return;
    }

    const announcement = await Announcement.create({
      title,
      message,
      status: ["draft", "published", "archived"].includes(status) ? status : "draft",
      publishedAt: status === "published" ? new Date() : undefined,
    });

    await recordActivity(request, "announcement.create", "announcement", String(announcement._id), { title });
    response.status(201).json({ data: announcement });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/announcements/:id", requirePermission("announcements"), async (request, response, next) => {
  try {
    await connectDatabase();
    const body = request.body ?? {};
    const updates: Record<string, unknown> = {};

    if ("title" in body) updates.title = String(body.title).trim();
    if ("message" in body) updates.message = String(body.message).trim();
    if ("status" in body) {
      updates.status = body.status;
      if (body.status === "published") updates.publishedAt = new Date();
    }

    const announcement = await Announcement.findByIdAndUpdate(request.params.id, updates, { new: true });
    if (!announcement) {
      response.status(404).json({ error: "Announcement not found" });
      return;
    }

    await recordActivity(request, "announcement.update", "announcement", String(announcement._id), updates);
    response.json({ data: announcement });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/announcements/:id", requirePermission("announcements"), async (request, response, next) => {
  try {
    await connectDatabase();
    const announcement = await Announcement.findByIdAndDelete(request.params.id);
    if (!announcement) {
      response.status(404).json({ error: "Announcement not found" });
      return;
    }
    await recordActivity(request, "announcement.delete", "announcement", String(announcement._id), { title: announcement.title });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 9. User Management (Super Admin Only)
// ==========================================

adminRouter.get("/users", requireSuperAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const users = await AdminUser.find()
      .select("_id name email role permissions status lastLoginAt createdAt")
      .sort({ createdAt: -1 })
      .lean();
    response.json({ data: users });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/users", requireSuperAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const { name, email, password, role = "admin", permissions = [] } = request.body ?? {};

    if (!name || !email || !password || password.length < 10) {
      response.status(400).json({ error: "Name, email, and a password of at least 10 characters are required" });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const allowedRoles = ["super_admin", "admin", "user", "editor"];
    const targetRole = allowedRoles.includes(role) ? role : "admin";

    const user = await AdminUser.create({
      name: String(name).trim(),
      email: cleanEmail,
      passwordHash: createPasswordHash(password),
      role: targetRole,
      permissions: Array.isArray(permissions) ? permissions.filter((p) => ADMIN_PERMISSIONS.includes(p)) : ["films"],
      status: "active",
    });

    await recordActivity(request, "user.create", "user", String(user._id), {
      name: user.name,
      email: user.email,
      role: user.role,
    });

    response.status(201).json({
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        status: user.status,
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      response.status(409).json({ error: "An administrator with that email already exists" });
      return;
    }
    next(error);
  }
});

adminRouter.patch("/users/:id", requireSuperAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const targetId = request.params.id;
    const currentAdmin = response.locals.admin;

    // Prevent modifying own role or deactivating oneself
    if (currentAdmin.sub === targetId && request.body.status === "suspended") {
      response.status(400).json({ error: "You cannot suspend your own Super Admin account" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if ("name" in request.body) updates.name = String(request.body.name).trim();
    if ("status" in request.body && ["active", "suspended", "deactivated"].includes(request.body.status)) {
      const existing = await AdminUser.findById(targetId).select("status").lean();
      if (existing?.status === "invited") {
        response.status(400).json({ error: "This person hasn't accepted their invitation yet. Resend or revoke the invitation instead." });
        return;
      }
      updates.status = request.body.status;
    }
    if ("role" in request.body && ["admin", "editor"].includes(request.body.role)) {
      updates.role = request.body.role;
    }
    if ("permissions" in request.body && Array.isArray(request.body.permissions)) {
      updates.permissions = request.body.permissions.filter((p: any) => ADMIN_PERMISSIONS.includes(p));
    }

    const user = await AdminUser.findByIdAndUpdate(targetId, updates, { new: true }).select("-passwordHash -invite");
    if (!user) {
      response.status(404).json({ error: "Admin account not found" });
      return;
    }

    await recordActivity(request, "user.update", "user", String(targetId), updates);
    response.json({ data: user });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/users/:id/reset-password", requireSuperAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const { newPassword } = request.body ?? {};
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 10) {
      response.status(400).json({ error: "New password must be at least 10 characters long" });
      return;
    }

    const user = await AdminUser.findByIdAndUpdate(
      request.params.id,
      { passwordHash: createPasswordHash(newPassword) },
      { new: true }
    );

    if (!user) {
      response.status(404).json({ error: "Admin account not found" });
      return;
    }

    await recordActivity(request, "user.reset_password", "user", String(request.params.id), { email: user.email });
    response.json({ message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 10. Analytics & Reports
// ==========================================

adminRouter.get("/analytics", requirePermission("analytics"), async (_request, response, next) => {
  try {
    await connectDatabase();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    const startOfToday = new Date(currentYear, currentMonth, currentDate, 0, 0, 0, 0);
    const startOfThisMonth = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const startOfThisYear = new Date(currentYear, 0, 1, 0, 0, 0, 0);

    // Query all subscriptions for analytics
    const subscriptions = await Subscription.find().sort({ createdAt: -1 }).lean();
    const totalRegisteredUsers = await ViewerAccount.countDocuments();
    const plans = await getPlans();
    const planMeta = (id: string) => {
      const plan = plans.find((item) => item.id === id);
      return plan ? { label: plan.name, price: `₱${plan.price.toLocaleString("en-PH")}/${plan.durationDays} ${plan.durationDays === 1 ? "day" : "days"}` } : { label: id, price: "" };
    };

    // Calculate revenue totals
    let revenueToday = 0;
    let revenueThisMonth = 0;
    let revenueThisYear = 0;
    let lifetimeRevenue = 0;
    let activeSubscribers = 0;

    const planBreakdown = {
      standard: { count: 0, revenue: 0, ...planMeta("standard_monthly") },
      vip: { count: 0, revenue: 0, ...planMeta("vip_monthly") },
      patron: { count: 0, revenue: 0, ...planMeta("patron_annual") },
    };
    let mrrTotal = 0;

    // Day series buckets (24 hours)
    const revDayBuckets = Array.from({ length: 24 }, (_, h) => ({
      label: `${h.toString().padStart(2, "0")}:00`,
      revenue: 0,
      transactions: 0,
    }));

    // Month series buckets (last 30 days)
    const revMonthBuckets = Array.from({ length: 30 }, (_, d) => {
      const targetDate = new Date(now.getTime() - (29 - d) * 86400000);
      const label = targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return {
        label,
        dateKey: `${targetDate.getFullYear()}-${targetDate.getMonth()}-${targetDate.getDate()}`,
        revenue: 0,
        transactions: 0,
      };
    });

    // Year series buckets (12 months)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revYearBuckets = monthNames.map((m) => ({
      label: m,
      revenue: 0,
      transactions: 0,
    }));

    subscriptions.forEach((sub) => {
      const subDate = new Date(sub.createdAt);
      const amt = Number(sub.amount) || 0;
      lifetimeRevenue += amt;

      if (sub.status === "active" && new Date(sub.expiresAt) > now) {
        activeSubscribers++;
        const days = sub.durationDays || (sub.billingCycle === "annual" ? 365 : 30);
        mrrTotal += (amt * 30) / days;
      }

      if (sub.plan === "standard_monthly") {
        planBreakdown.standard.count++;
        planBreakdown.standard.revenue += amt;
      } else if (sub.plan === "vip_monthly") {
        planBreakdown.vip.count++;
        planBreakdown.vip.revenue += amt;
      } else if (sub.plan === "patron_annual") {
        planBreakdown.patron.count++;
        planBreakdown.patron.revenue += amt;
      }

      // Year aggregation
      if (subDate.getFullYear() === currentYear) {
        revenueThisYear += amt;
        const mIdx = subDate.getMonth();
        if (mIdx >= 0 && mIdx < 12) {
          revYearBuckets[mIdx].revenue += amt;
          revYearBuckets[mIdx].transactions++;
        }
      }

      // Month aggregation
      if (subDate >= startOfThisMonth) {
        revenueThisMonth += amt;
      }

      // Last 30 days matching
      const dateKey = `${subDate.getFullYear()}-${subDate.getMonth()}-${subDate.getDate()}`;
      const foundMonthBucket = revMonthBuckets.find((b) => b.dateKey === dateKey);
      if (foundMonthBucket) {
        foundMonthBucket.revenue += amt;
        foundMonthBucket.transactions++;
      }

      // Today aggregation
      if (subDate >= startOfToday) {
        revenueToday += amt;
        const h = subDate.getHours();
        if (h >= 0 && h < 24) {
          revDayBuckets[h].revenue += amt;
          revDayBuckets[h].transactions++;
        }
      }
    });

    const mrr = Math.round(mrrTotal);

    // ==========================================
    // User Analytics Aggregation (Day, Month, Year) — from real signups and analytics events
    // ==========================================
    const totalUsers = totalRegisteredUsers;
    const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 86400000);
    const since = thirtyDaysAgo < startOfThisYear ? thirtyDaysAgo : startOfThisYear;
    const [signups, events] = await Promise.all([
      ViewerAccount.find({ createdAt: { $gte: since } }).select("createdAt").lean(),
      AnalyticsEvent.find({ createdAt: { $gte: since } }).select("eventType ipHash createdAt").lean(),
    ]);

    type UserBucket = { label: string; visitors: Set<string>; newSignups: number; pageViews: number };
    const userDay: UserBucket[] = Array.from({ length: 24 }, (_, h) => ({ label: `${h.toString().padStart(2, "0")}:00`, visitors: new Set(), newSignups: 0, pageViews: 0 }));
    const userMonth: (UserBucket & { dateKey: string })[] = revMonthBuckets.map((b) => ({ label: b.label, dateKey: b.dateKey, visitors: new Set(), newSignups: 0, pageViews: 0 }));
    const userYear: UserBucket[] = monthNames.map((label) => ({ label, visitors: new Set(), newSignups: 0, pageViews: 0 }));
    const visitorsToday = new Set<string>();
    const visitorsThisMonth = new Set<string>();
    const visitorsThisYear = new Set<string>();
    let newSignupsToday = 0;
    let newSignupsThisMonth = 0;
    let newSignupsThisYear = 0;

    const bucketsFor = (date: Date) => {
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return [
        date >= startOfToday ? userDay[date.getHours()] : undefined,
        userMonth.find((b) => b.dateKey === dateKey),
        date.getFullYear() === currentYear ? userYear[date.getMonth()] : undefined,
      ].filter((bucket): bucket is UserBucket => Boolean(bucket));
    };

    signups.forEach((account) => {
      const date = new Date(account.createdAt);
      bucketsFor(date).forEach((bucket) => bucket.newSignups++);
      if (date >= startOfToday) newSignupsToday++;
      if (date >= startOfThisMonth) newSignupsThisMonth++;
      if (date >= startOfThisYear) newSignupsThisYear++;
    });

    events.forEach((event) => {
      const date = new Date(event.createdAt);
      const buckets = bucketsFor(date);
      if (event.eventType === "page_view") buckets.forEach((bucket) => bucket.pageViews++);
      if (!event.ipHash) return;
      buckets.forEach((bucket) => bucket.visitors.add(event.ipHash));
      if (date >= startOfToday) visitorsToday.add(event.ipHash);
      if (date >= startOfThisMonth) visitorsThisMonth.add(event.ipHash);
      if (date >= startOfThisYear) visitorsThisYear.add(event.ipHash);
    });

    const toChart = ({ label, visitors, newSignups, pageViews }: UserBucket) => ({ label, activeUsers: visitors.size, newSignups, pageViews });
    const userDayBuckets = userDay.map(toChart);
    const userMonthBuckets = userMonth.map(toChart);
    const userYearBuckets = userYear.map(toChart);
    const activeUsersToday = visitorsToday.size;
    const activeUsersThisMonth = visitorsThisMonth.size;
    const activeUsersThisYear = visitorsThisYear.size;

    // Query Top Films & Playback Summary
    const [eventTotals, topFilms, recentErrors] = await Promise.all([
      AnalyticsEvent.aggregate([{ $group: { _id: "$eventType", count: { $sum: 1 } } }]),
      Film.find({ status: "published" })
        .select("title slug viewCount playCount releaseYear genres audienceScore")
        .sort({ viewCount: -1, playCount: -1 })
        .limit(10)
        .lean(),
      AnalyticsEvent.find({ eventType: "playback_error" })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const summary: Record<string, number> = {
      page_view: 0,
      video_start: 0,
      video_progress: 0,
      video_complete: 0,
      playback_error: 0,
    };
    eventTotals.forEach((item) => {
      summary[item._id] = item.count;
    });

    response.json({
      data: {
        summary,
        topFilms,
        recentErrors,
        // Revenue & Income Analytics
        revenue: {
          today: revenueToday,
          thisMonth: revenueThisMonth,
          thisYear: revenueThisYear,
          lifetime: lifetimeRevenue,
          mrr,
          activeSubscribers,
          conversionRate: totalUsers > 0 ? Math.round((activeSubscribers / totalUsers) * 100 * 10) / 10 : 0,
          arpu: activeSubscribers > 0 ? Math.round(revenueThisMonth / activeSubscribers) : 0,
          plans: planBreakdown,
          chartDay: revDayBuckets,
          chartMonth: revMonthBuckets.map(({ label, revenue, transactions }) => ({ label, revenue, transactions })),
          chartYear: revYearBuckets,
          recentTransactions: subscriptions.slice(0, 10),
        },
        // User Growth & Activity Analytics
        users: {
          today: activeUsersToday,
          thisMonth: activeUsersThisMonth,
          thisYear: activeUsersThisYear,
          totalRegistered: totalUsers,
          newToday: newSignupsToday,
          newThisMonth: newSignupsThisMonth,
          newThisYear: newSignupsThisYear,
          chartDay: userDayBuckets,
          chartMonth: userMonthBuckets,
          chartYear: userYearBuckets,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/subscriptions", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { status, limit = 50 } = request.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === "string" && status) filter.status = status;

    const subscriptions = await Subscription.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Number(limit) || 50))
      .lean();

    response.json({ data: subscriptions });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/analytics/export.csv", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const type = request.query.type;

    if (type === "revenue") {
      const subs = await Subscription.find().sort({ createdAt: -1 }).limit(1000).lean();
      let csv = "Date,Subscriber Name,Subscriber Email,Plan,Amount (PHP),Payment Method,Billing Cycle,Status,Reference\n";
      subs.forEach((s) => {
        const dateStr = s.createdAt ? new Date(s.createdAt).toISOString() : "";
        const name = `"${(s.viewerName || "").replace(/"/g, '""')}"`;
        const email = `"${(s.viewerEmail || "").replace(/"/g, '""')}"`;
        csv += `${dateStr},${name},${email},${s.planName},${s.amount},${s.paymentMethod},${s.billingCycle},${s.status},${s.transactionReference}\n`;
      });
      response.setHeader("Content-Type", "text/csv");
      response.setHeader("Content-Disposition", 'attachment; filename="sinesarili-revenue-report.csv"');
      response.send(csv);
      return;
    }

    const films = await Film.find().select("title slug releaseYear viewCount playCount status visibility audienceScore").sort({ viewCount: -1 }).lean();
    let csv = "Title,Slug,Release Year,View Count,Play Count,Audience Score,Status,Visibility\n";
    films.forEach((f) => {
      const escapedTitle = `"${(f.title || "").replace(/"/g, '""')}"`;
      csv += `${escapedTitle},${f.slug},${f.releaseYear || ""},${f.viewCount || 0},${f.playCount || 0},${f.audienceScore != null ? `${f.audienceScore}%` : ""},${f.status},${f.visibility}\n`;
    });

    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", 'attachment; filename="sinesarili-analytics.csv"');
    response.send(csv);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 11. Activity Logs (Audit Log)
// ==========================================

adminRouter.get("/activity-logs", requirePermission("activity_logs"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { resourceType, action, limit = 50 } = request.query;
    const filter: Record<string, unknown> = {};

    if (typeof resourceType === "string" && resourceType) filter.resourceType = resourceType;
    if (typeof action === "string" && action) filter.action = action;

    const logs = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Number(limit) || 50))
      .lean();

    response.json({ data: logs });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 12. System Settings (Super Admin Only)
// ==========================================

adminRouter.get("/settings", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const settings = await SystemSetting.find().lean();
    const settingsMap: Record<string, any> = {
      approvalPolicy: "immediate",
      heroFilmSlug: "",
      siteTitle: "SineSarili",
    };
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    response.json({ data: settingsMap });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/settings", requireSuperAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const updates = request.body ?? {};

    for (const [key, value] of Object.entries(updates)) {
      await SystemSetting.updateOne({ key }, { $set: { value } }, { upsert: true });
    }

    await recordActivity(request, "setting.update", "setting", "global", updates);
    response.json({ message: "Settings updated successfully" });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/plans", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    response.json({ data: await getPlans() });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/plans", requireSuperAdmin, async (request, response, next) => {
  try {
    await connectDatabase();
    const before = await getPlans();
    const plans = await savePlans(request.body?.plans);
    await recordActivity(request, "plans.update", "setting", "subscription_plans", {
      prices: plans.map((plan) => {
        const previous = before.find((item) => item.id === plan.id)?.price;
        return `${plan.name}: ₱${previous} → ₱${plan.price}`;
      }),
    });
    response.json({ data: plans });
  } catch (error) {
    if (error instanceof PlanValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
});

// ==========================================
// 13. Receiving Bank & E-Wallet Accounts
// ==========================================

adminRouter.get("/bank-accounts", requireAdmin, async (_request, response, next) => {
  try {
    await connectDatabase();
    const accounts = await BankAccount.find().sort({ displayOrder: 1, createdAt: 1 }).lean();
    response.json({ data: accounts });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/bank-accounts", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const {
      providerName,
      accountType = "ewallet",
      accountName,
      accountNumber,
      qrCodeUrl = "",
      instructions = "",
      isActive = true,
      displayOrder = 0,
    } = request.body ?? {};

    if (!providerName || typeof providerName !== "string" || !providerName.trim()) {
      response.status(400).json({ error: "Bank or E-Wallet Provider name is required (e.g. GCash, Maya, BDO)" });
      return;
    }
    if (!accountName || typeof accountName !== "string" || !accountName.trim()) {
      response.status(400).json({ error: "Account holder name is required" });
      return;
    }
    if (!accountNumber || typeof accountNumber !== "string" || !accountNumber.trim()) {
      response.status(400).json({ error: "Account or mobile number is required" });
      return;
    }

    const account = await BankAccount.create({
      providerName: providerName.trim(),
      accountType,
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      qrCodeUrl: String(qrCodeUrl).trim(),
      instructions: String(instructions).trim(),
      isActive: Boolean(isActive),
      displayOrder: Number(displayOrder) || 0,
    });

    await recordActivity(request, "bank_account.create", "bank_account", String(account._id), {
      provider: account.providerName,
      account: account.accountNumber,
    });

    response.status(201).json({ data: account });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/bank-accounts/:id", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const updates = { ...request.body };
    const account = await BankAccount.findByIdAndUpdate(request.params.id, updates, { new: true });
    if (!account) {
      response.status(404).json({ error: "Bank account record not found" });
      return;
    }

    await recordActivity(request, "bank_account.update", "bank_account", String(account._id), updates);
    response.json({ data: account });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/bank-accounts/:id", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const account = await BankAccount.findByIdAndDelete(request.params.id);
    if (!account) {
      response.status(404).json({ error: "Bank account record not found" });
      return;
    }

    await recordActivity(request, "bank_account.delete", "bank_account", String(account._id), {
      provider: account.providerName,
    });

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ==========================================
// 14. Payment Submissions & Receipt Audits
// ==========================================

adminRouter.get("/payment-submissions", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { status, limit = 100 } = request.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === "string" && status && status !== "all") {
      filter.status = status;
    }

    const submissions = await PaymentSubmission.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(300, Number(limit) || 100))
      .lean();

    response.json({ data: submissions });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/payment-submissions/:id/approve", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const submission = await PaymentSubmission.findById(request.params.id);
    if (!submission) {
      response.status(404).json({ error: "Payment submission not found" });
      return;
    }

    const session = currentSession(request);
    const adminName = session?.name || "Admin Reviewer";

    submission.status = "verified";
    submission.reviewedByAdmin = adminName;
    submission.reviewedAt = new Date();
    await submission.save();

    await emailSubscriptionActivation(String(submission._id));

    await recordActivity(request, "payment.approve", "payment_submission", String(submission._id), {
      subscriber: submission.subscriberEmail,
      amount: submission.amountPaid,
      ref: submission.referenceNumber,
    });

    response.json({
      message: `Payment approved! Activation email sent to ${submission.subscriberEmail}.`,
      data: { submission },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/payment-submissions/:id/reject", requirePermission("analytics"), async (request, response, next) => {
  try {
    await connectDatabase();
    const { reason = "Invalid or unverified receipt details" } = request.body ?? {};
    const submission = await PaymentSubmission.findById(request.params.id);
    if (!submission) {
      response.status(404).json({ error: "Payment submission not found" });
      return;
    }

    if (submission.activatedAt) {
      response.status(409).json({ error: "This payment already activated a subscription" });
      return;
    }

    const session = currentSession(request);
    const adminName = session?.name || "Admin Reviewer";

    submission.status = "rejected";
    submission.rejectionReason = String(reason).trim();
    submission.reviewedByAdmin = adminName;
    submission.reviewedAt = new Date();
    await submission.save();

    await recordActivity(request, "payment.reject", "payment_submission", String(submission._id), {
      subscriber: submission.subscriberEmail,
      reason,
    });

    response.json({
      message: "Payment submission rejected.",
      data: submission,
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/payment-submissions/export.csv", requirePermission("analytics"), async (_request, response, next) => {
  try {
    await connectDatabase();
    const items = await PaymentSubmission.find().sort({ createdAt: -1 }).limit(1000).lean();

    let csv = "Date,Reference Number,Subscriber Name,Subscriber Email,Phone,Plan,Expected (PHP),Paid (PHP),Bank Provider,Confidence Score,Status,Reviewed By,Rejection Reason\n";
    items.forEach((p) => {
      const dateStr = p.createdAt ? new Date(p.createdAt).toISOString() : "";
      const name = `"${(p.subscriberName || "").replace(/"/g, '""')}"`;
      const email = `"${(p.subscriberEmail || "").replace(/"/g, '""')}"`;
      const ref = `"${(p.referenceNumber || "").replace(/"/g, '""')}"`;
      const reason = `"${(p.rejectionReason || "").replace(/"/g, '""')}"`;
      const score = p.receiptMetadata?.heuristicScore ?? 0;
      csv += `${dateStr},${ref},${name},${email},${p.subscriberPhone || ""},${p.planName},${p.amountExpected},${p.amountPaid},${p.bankProvider},${score}%,${p.status},${p.reviewedByAdmin || ""},${reason}\n`;
    });

    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", 'attachment; filename="sinesarili-payment-audits.csv"');
    response.send(csv);
  } catch (error) {
    next(error);
  }
});
