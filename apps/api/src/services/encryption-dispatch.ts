import { blobStorageEnabled } from "./storage.js";

/**
 * Asks GitHub Actions to start the encryption worker right away instead of waiting for its
 * 15-minute schedule. Optional: needs GITHUB_DISPATCH_TOKEN (a token allowed to trigger
 * workflows on the repo) and GITHUB_REPOSITORY ("owner/repo"). Never blocks or fails a save.
 */
export function requestEncryption() {
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  if (!blobStorageEnabled() || !token || !repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return;
  void fetch(`https://api.github.com/repos/${repository}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ event_type: "encrypt-videos" }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}
