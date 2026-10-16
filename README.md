# SineSarili — Full-Stack Cinematic Film Streaming & Showcase Platform

**SineSarili** is a full-stack digital cinema streaming platform dedicated to celebrating Filipino cinema, independent filmmakers, student productions, and cinematic achievements. Inspired by the sleek browsing experience of Netflix, SineSarili features its own unique dark cinematic visual identity, role-based content management, and robust streaming integration.

---

## Architecture Overview

The repository is structured as a TypeScript monorepo with dedicated apps:

- **`apps/web`**: Next.js 16 (App Router) + React 19 + Tailwind CSS + Lucide React.
  - Public-facing showcase with cinematic hero carousel, curated shelf rows, responsive search and catalog filtering, film detail pages with interactive custom video player, categories discovery, and announcement banners.
  - Professional administrative studio (`/admin`) for comprehensive content management and system administration.
- **`apps/api`**: Express 5 + Node.js 22 + MongoDB with Mongoose + Zod + Helmet.
  - Modular REST API handling authentication, role-based access control (Super Admin vs Admin/Editor), content workflows, video stream resolution, analytics event tracking, and immutable activity auditing.

---

## Roles and Access Control (RBAC)

1. **Super Admin**:
   - Platform-wide administrative authority.
   - Manages administrator accounts (create, activate, suspend, password reset).
   - Configures platform settings (content publishing approval policy, hero film slug, site branding).
   - Access to platform-wide statistics, CSV performance report exports, and immutable audit logs.
2. **Admin / Editor**:
   - Manages film catalog, announcements, categories, director profiles, and awards according to assigned permissions.
   - If the publishing policy is set to *Require Approval*, publishing actions automatically route films to `pending_approval` for Super Admin review.
   - Enforced on the server for all protected routes (`requireAdmin`, `requireSuperAdmin`, `requirePermission`).

---

## Database Models

The MongoDB schema in `apps/api/src/models/` contains:

- `AdminUser`: Name, email, scrypt `passwordHash`, role (`super_admin`, `admin`, `editor`), permissions list, status (`active`, `suspended`, `deactivated`), `lastLoginAt`.
- `Film`: Title, slug, synopsis, tagline, posterUrl, backdropUrl, releaseYear, runtimeMinutes, genres, categories, directorNames, cast members, awards, videoUrl, videoProvider, teaserUrl, teaserProvider, subtitlesUrl, isFeatured, status (`draft`, `pending_approval`, `published`, `archived`), visibility (`public`, `restricted`), viewCount, playCount, audienceScore.
- `Category`: Name, slug, description, sectionKey (`films`, `announcements`, `award-winning`, `sb-category`, `achievements`, `custom`), displayOrder, isVisible.
- `Director`: Name, slug, bio, photoUrl, nationality, birthYear, featured, awardsSummary.
- `Award`: Title, organization, year, category, awardType (`win`, `nomination`, `official_selection`, `honorary`), filmId reference, recipientName, description.
- `Announcement`: Title, message, status (`draft`, `published`, `archived`), publishedAt.
- `AnalyticsEvent`: Tracks actual events: `page_view`, `video_start`, `video_progress`, `video_complete`, `playback_error`, filmId, filmSlug, duration, progress, ipHash, userAgent.
- `ActivityLog`: Immutable security audit log tracking actor, action, resourceType, resourceId, details, IP address, and timestamp.
- `SystemSetting`: Key-value store for global platform settings such as publishing policies.

---

## Video Streaming & Integration Layer

The video service layer (`apps/api/src/video-service.ts`) abstracts media playback so providers can be configured or swapped without rewriting application code:

- **Direct / Hosted Video**: MP4, WebM, or local uploads (`/uploads/*`).
- **External Video Embeds**: YouTube (`youtube-nocookie.com/embed/...`) and Vimeo (`player.vimeo.com/video/...`).
- **Adaptive Streaming**: HLS streams (`.m3u8`).
- **Interactive Player**: Custom cinematic playback controls in `apps/web/src/components/video-player.tsx`, featuring play/pause, volume scrubbing, fullscreen, error retry recovery, subtitles support, and real-time viewing analytics logging (`POST /api/films/:slug/events`).

---

## Local Development Setup

### Prerequisites
- Node.js 22 or newer
- MongoDB instance (local or MongoDB Atlas)

### Setup Steps

1. **Install dependencies**:
   ```powershell
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` in `apps/api` and `apps/web`:
   ```powershell
   Copy-Item apps/api/.env.example apps/api/.env
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```
   Ensure `MONGODB_URI` points to your MongoDB instance and `SESSION_SECRET` is set to a secure string of at least 32 characters.

3. **Create the Super Admin account**:
   The database starts empty — there is no sample data. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `apps/api/.env`, then run:
   ```powershell
   npm run admin:create --workspace @sinesarili/api
   ```
   Sign in to the Admin Studio to add films, categories, payment accounts, and announcements.

4. **Start Development Servers**:
   ```powershell
   npm run dev
   ```
   - Public Website: `http://localhost:3000`
   - Admin Studio: `http://localhost:3000/admin`
   - API Server: `http://localhost:4000`

---

## Deployment Guide (e.g., Vercel / Next.js + Node.js)

1. **Web Deployment (`apps/web`)**:
   - Framework preset: Next.js.
   - Root directory: `apps/web`.
   - Set environment variable: `API_ORIGIN` pointing to your deployed API origin (e.g. `https://api.sinesarili.com`).
   - The Next.js reverse-proxy rewrite rules in `next.config.ts` will forward `/api/*` and `/uploads/*` requests to the API while preserving HttpOnly session cookies.

2. **API Deployment (`apps/api`)**:
   - Framework preset: Express / Node.js Serverless Function.
   - Root directory: `apps/api`.
   - Set environment variables: `MONGODB_URI`, `SESSION_SECRET`, `WEB_ORIGIN`, and optional SMTP variables.
   - Ensure large production video assets use dedicated managed video hosting (e.g., Cloudflare Stream, Vimeo OTT, Bunny.net, or AWS S3/CloudFront) rather than storing files in the server process.

---

## Client Decisions Pending Confirmation

1. **Meaning of "SB Category"**:
   - The system implements "SB Category" as a fully configurable spotlight showcase (`sectionKey: "sb-category"`). Names, ordering, descriptions, and visibility can be altered in the Admin Studio at any time once the client clarifies whether SB stands for a Director series (e.g., Sine Bayan), a student cohort/batch, or a subject category.
2. **Video Hosting Provider Selection**:
   - The playback integration layer supports Direct MP4/WebM, HLS, YouTube embeds, and Vimeo embeds out-of-the-box. Confirm whether the client will deploy a dedicated CDN / S3 bucket or a managed service like Cloudflare Stream for commercial DRM / private streaming.
3. **Admin Publishing Policy**:
   - Configurable in Studio Settings: Decide whether standard administrators should publish immediately or submit drafts for Super Admin review (`require_super_admin_approval`).

### Receipt verification with OpenRouter

Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in `apps/api/.env`, then restart the API. Use an OpenRouter model ID with image input and JSON Schema structured output support. The key stays on the API server. OpenRouter takes priority; when its key is absent, the existing Anthropic integration remains available. A configured OpenRouter key without a model disables automatic receipt reading. Invalid/incomplete outputs and provider failures go to manual review, never automatic approval. Receipt images are sent to the chosen model provider via OpenRouter; requests restrict routing to providers that support the required parameters and deny data collection.

### Playback privacy shield

Full film and episode players pause and cover playback when the tab becomes hidden, the browser window loses focus, printing begins, or supported capture shortcuts reach the page. The viewer explicitly continues playback. Native video picture-in-picture/remote playback are disabled for these screenings. Embedded players are unloaded while shielded and restart when continued.

This is a deterrent, not screenshot/recording detection or guaranteed capture blocking. OS shortcuts may never reach JavaScript, recorders can run without focus changes, and iframe/native fullscreen behavior varies. Multi-DRM integration is prepared but disabled until a provider and encrypted streams are configured; see [DRM setup](docs/drm-setup.md). Stronger protection requires encrypted packaged streams, a DRM license service, an EME-capable player, and a supported browser/device combination; even DRM is not a universal capture guarantee.

See [Multi-DRM setup](docs/drm-setup.md) for provider configuration, admin fields, gateway contracts, and production validation.

## Local setup notes

- Copy `apps/api/.env.example` to `apps/api/.env` and fill in real values. `.env` files are never committed.
- Automatic DRM encryption of uploaded videos needs [Shaka Packager](https://github.com/shaka-project/shaka-packager/releases) at `apps/api/bin/packager` (`packager.exe` on Windows). The binary is not committed; without it, uploads stay unencrypted.
- Uploaded media (`apps/api/uploads/`) and original masters (`apps/api/private-masters/`) are local data and are not committed.
