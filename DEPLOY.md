# Deploying SineSarili to Vercel

SineSarili runs as **two Vercel projects from this one repository**, plus a GitHub Actions job
that encrypts uploaded videos.

| Piece | Where it runs | Root Directory |
| --- | --- | --- |
| Website (Next.js) | Vercel project `sinesarili-web` | `apps/web` |
| API (Express) | Vercel project `sinesarili-api` | `apps/api` |
| DRM encryption | GitHub Actions (`.github/workflows/encrypt-videos.yml`) | — |
| Files | Vercel Blob: one public store, one private store | — |
| Database | MongoDB Atlas (already hosted) | — |

## 1. API project

1. Vercel → **Add New → Project** → import `Sine-sarili`.
2. **Root Directory: `apps/api`**. Framework Preset: **Express** (detected automatically).
3. Environment Variables: copy every value from your local `apps/api/.env`, then set:
   - `NODE_ENV` = `production`
   - `WEB_ORIGIN` = the website's address, e.g. `https://sinesarili-web.vercel.app` (comma-separate several)
4. Deploy. Check `https://<api-address>/api/health` shows `{"status":"ok"}`.

## 2. Blob stores (connect both to the API project)

In the API project → **Storage → Create → Blob**:

1. Store **sinesarili-public**, access **Public**. Under Advanced Options set the variable prefix to
   `PUBLIC_BLOB` so the token is saved as `PUBLIC_BLOB_READ_WRITE_TOKEN`.
2. Store **sinesarili-private**, access **Private**, prefix `PRIVATE_BLOB`
   (`PRIVATE_BLOB_READ_WRITE_TOKEN`).

If the variable names come out different, add `PUBLIC_BLOB_READ_WRITE_TOKEN` and
`PRIVATE_BLOB_READ_WRITE_TOKEN` yourself with the tokens from each store's page. Redeploy the API.

## 3. Website project

1. **Add New → Project** → import `Sine-sarili` again.
2. **Root Directory: `apps/web`**. Framework Preset: **Next.js**.
3. Environment Variables: `API_ORIGIN` = the API address from step 1 (no trailing slash).
4. Deploy. Then put the website address in the API's `WEB_ORIGIN` and redeploy the API.

> The error `The Next.js output directory ".next" was not found at "/vercel/path0/.next"` means
> the Root Directory was left at the repository root. Set it to `apps/web` (Settings → Build and
> Deployment → Root Directory) and redeploy.

## 4. Move existing local files into Blob (once)

Add the two Blob tokens to your local `apps/api/.env`, then from `apps/api`:

```bash
node --env-file=.env --import tsx scripts/migrate-uploads-to-blob.ts          # preview
node --env-file=.env --import tsx scripts/migrate-uploads-to-blob.ts --write  # upload + update links
```

## 5. Video encryption (GitHub Actions)

Uploaded full films and teasers stay private until they are encrypted. In GitHub → repository
**Settings → Secrets and variables → Actions**, add:

| Secret | Value |
| --- | --- |
| `SINESARILI_API_URL` | the API address, e.g. `https://sinesarili-api.vercel.app` |
| `DRM_WORKER_SECRET` | same value as the API's `DRM_WORKER_SECRET` |
| `PUBLIC_BLOB_READ_WRITE_TOKEN` | public store token |
| `PRIVATE_BLOB_READ_WRITE_TOKEN` | private store token |

Generate `DRM_WORKER_SECRET` once (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
and put the same value in the API project and in GitHub.

The job runs every 15 minutes. To start it right after an admin saves a title, also set
`GITHUB_DISPATCH_TOKEN` (a fine-grained token with **Actions: write** on this repo) and
`GITHUB_REPOSITORY` = `reycadealba07192303-ai/Sine-sarili` in the API project.

## Notes

- Viewers' receipt screenshots are limited to 4 MB on Vercel; larger photos are shrunk in the browser first.
- The website and the API must each be redeployed after changing their environment variables.
