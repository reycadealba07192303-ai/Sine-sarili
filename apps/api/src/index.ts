import { playbackRouter } from "./routes/playback.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { adminRouter } from "./routes/admin.js";
import { accountRouter } from "./routes/account.js";
import { filmsRouter } from "./routes/films.js";
import { announcementsRouter } from "./routes/announcements.js";
import { categoriesRouter } from "./routes/categories.js";
import { directorsRouter } from "./routes/directors.js";
import { awardsRouter } from "./routes/awards.js";
import { paymentsRouter } from "./routes/payments.js";
import { uploadsDirectory } from "./uploads.js";
import { Film } from "./models/film.js";
import { hasFilmAccess } from "./auth.js";
import { connectDatabase } from "./db.js";
import { adminInvitePublicRouter, adminInvitesRouter } from "./routes/admin-invites.js";
import { internalDrmRouter } from "./routes/internal-drm.js";
import { protectUploadedVideos } from "./services/auto-drm.js";

const app = express();
const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use("/api/playback", playbackRouter);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", async (request, response, next) => {
  try {
    const assetPath = decodeURIComponent(request.path);
    const drmAsset = /^\/drm\/([a-f0-9-]{36})\//i.exec(assetPath);
    if (drmAsset) {
      response.setHeader("Cache-Control", "private, no-store");
      await connectDatabase();
      const keyId = drmAsset[1].toLowerCase();
      const isTeaser = await Film.exists({ teaserDrmAssetId: keyId });
      if (!isTeaser && !await hasFilmAccess(request)) {
        response.status(401).json({ error: "An active CinePass is required to watch this title" });
        return;
      }
      return next();
    }
    if (/\.(mp4|webm|mov|m3u8|ts|vtt|srt)$/i.test(assetPath)) {
      await connectDatabase();
      const url = `/uploads${assetPath}`;
      const fullFilm = await Film.exists({ $or: [
        { videoUrl: url },
        { subtitlesUrl: url },
        { "seasons.episodes.videoUrl": url },
        { "seasons.episodes.subtitlesUrl": url },
      ] });
      if (fullFilm) {
        response.setHeader("Cache-Control", "private, no-store");
        if (!await hasFilmAccess(request)) {
          response.status(401).json({ error: "An active CinePass is required to watch this title" });
          return;
        }
      }
    }
    next();
  } catch (error) { next(error); }
}, express.static(uploadsDirectory, { fallthrough: false, maxAge: 0 }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "sinesarili-api" });
});

app.use("/api/films", filmsRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/directors", directorsRouter);
app.use("/api/awards", awardsRouter);
app.use("/api/account", accountRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/internal/drm", internalDrmRouter);
app.use("/api/admin-invite", adminInvitePublicRouter);
app.use("/api/admin", adminInvitesRouter);
app.use("/api/admin", adminRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("API request failed:", error instanceof Error ? error.stack : error);
  response.status(503).json({ error: "The service is temporarily unavailable" });
});

if (process.env.NODE_ENV !== "production") {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`SineSarili API listening on http://localhost:${port}`);
    // Every uploaded full film and episode is DRM-encrypted automatically.
    const protect = () => void connectDatabase().then(protectUploadedVideos).catch((error) => console.error("DRM worker:", error));
    protect();
    setInterval(protect, 20_000).unref();
  });
}

export default app;
