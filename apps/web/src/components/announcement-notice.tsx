"use client";

import { useEffect, useState } from "react";

type Announcement = { _id: string; title: string; message: string };

export function AnnouncementNotice() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/announcements")
      .then(async (response) => response.ok ? response.json() as Promise<{ data: Announcement[] }> : { data: [] })
      .then((result) => setAnnouncement(result.data[0] ?? null))
      .catch(() => undefined);
  }, []);

  if (!announcement || dismissed) return null;
  return (
    <aside className="ed-banner" role="status">
      <p><strong>{announcement.title}</strong>{announcement.message && <span>{announcement.message}</span>}</p>
      <button type="button" aria-label="Dismiss announcement" onClick={() => setDismissed(true)}>×</button>
    </aside>
  );
}
