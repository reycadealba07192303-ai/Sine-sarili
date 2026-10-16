"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, CreditCard, HelpCircle, LogOut, UserRound } from "lucide-react";

export type Viewer = {
  name: string;
  email: string;
  subscriptionPlan: "free" | "standard_monthly" | "vip_monthly" | "patron_annual";
  subscriptionStatus: "inactive" | "active" | "cancelled" | "past_due";
  memberSince?: string;
};

type Announcement = { _id: string; title: string; message: string; publishedAt?: string };

const PLAN_NAMES: Record<Viewer["subscriptionPlan"], string> = {
  free: "No CinePass yet",
  standard_monthly: "CinePass Standard",
  vip_monthly: "Cinephile VIP",
  patron_annual: "SineSarili Patron",
};
const SEEN_KEY = "sinesarili:notifications-seen";

export function planLabel(viewer: Viewer) {
  return viewer.subscriptionStatus === "active" ? PLAN_NAMES[viewer.subscriptionPlan] : "No active CinePass";
}

function readSeen() {
  try { return Number(window.localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
}

function timeAgo(value?: string) {
  const time = value ? Date.parse(value) : NaN;
  if (Number.isNaN(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return new Date(time).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function fullDate(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : new Date(time).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
}

export function HeaderAccount() {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "viewer">("loading");
  const [notices, setNotices] = useState<Announcement[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | null>(null);
  const [openNotice, setOpenNotice] = useState<Announcement | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/me", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) { setState("guest"); return; }
        const { data } = await response.json() as { data: Viewer };
        setViewer(data);
        setState("viewer");
        setSeenAt(readSeen());
        const noticeResponse = await fetch("/api/announcements", { signal: controller.signal });
        if (noticeResponse.ok) setNotices((await noticeResponse.json() as { data: Announcement[] }).data);
      })
      .catch(() => { if (!controller.signal.aborted) setState("guest"); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [openMenu]);

  function toggleNotifications() {
    const next = openMenu === "notifications" ? null : "notifications";
    setOpenMenu(next);
    setOpenNotice(null);
    if (next) {
      const now = Date.now();
      try { window.localStorage.setItem(SEEN_KEY, String(now)); } catch {}
      window.setTimeout(() => setSeenAt(now), 1200);
    }
  }

  async function signOut() {
    await fetch("/api/account/session", { method: "DELETE" }).catch(() => undefined);
    window.location.assign("/");
  }

  if (state === "loading") return <span className="account-placeholder" aria-hidden="true" />;
  if (state === "guest" || !viewer) return <Link href="/signup" className="profile-link">Get started</Link>;

  const unread = notices.filter(notice => (Date.parse(notice.publishedAt ?? "") || 0) > seenAt).length;
  const initial = viewer.name.trim().charAt(0).toUpperCase() || "S";
  const subscribed = viewer.subscriptionStatus === "active";

  return (
    <div className="account-actions" ref={root}>
      <div className="account-menu-anchor">
        <button type="button" className="account-bell" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={openMenu === "notifications"} aria-haspopup="true" onClick={toggleNotifications}>
          <Bell size={20} />
          {unread > 0 && <span className="account-bell-count">{unread > 9 ? "9+" : unread}</span>}
        </button>
        {openMenu === "notifications" && <div className="account-popover account-notifications" role="region" aria-label="Notifications">
          {openNotice ? (
            <div className="account-notice-detail">
              <button type="button" className="account-notice-back" autoFocus onClick={() => setOpenNotice(null)}>All notifications</button>
              <h3>{openNotice.title}</h3>
              {openNotice.publishedAt && <time dateTime={openNotice.publishedAt}>{fullDate(openNotice.publishedAt)}</time>}
              <p>{openNotice.message}</p>
            </div>
          ) : (
            <>
              <p className="account-popover-title">Notifications</p>
              {notices.length ? <ul>{notices.map(notice => {
                const isNew = (Date.parse(notice.publishedAt ?? "") || 0) > seenAt;
                return <li key={notice._id} className={isNew ? "is-new" : undefined}>
                  <button type="button" className="account-notice-item" onClick={() => setOpenNotice(notice)}>
                    <span className="account-notice-dot" aria-hidden="true" />
                    <span className="account-notice-copy"><strong>{notice.title}</strong><span className="account-notice-preview">{notice.message}</span>{notice.publishedAt && <time dateTime={notice.publishedAt}>{timeAgo(notice.publishedAt)}</time>}</span>
                  </button>
                </li>;
              })}</ul> : <p className="account-empty">You're all caught up. New films and updates will show up here.</p>}
            </>
          )}
        </div>}
      </div>

      <div className="account-menu-anchor">
        <button type="button" className="account-profile-button" aria-label="Account menu" aria-expanded={openMenu === "profile"} aria-haspopup="menu" onClick={() => setOpenMenu(openMenu === "profile" ? null : "profile")}>
          <span className="account-avatar" aria-hidden="true">{initial}</span>
          <ChevronDown size={15} className="account-caret" />
        </button>
        {openMenu === "profile" && <div className="account-popover account-profile-menu" role="menu">
          <div className="account-profile-head">
            <span className="account-avatar account-avatar-large" aria-hidden="true">{initial}</span>
            <div><strong>{viewer.name}</strong><span>{viewer.email}</span></div>
          </div>
          <p className={`account-plan${subscribed ? " is-active" : ""}`}>{planLabel(viewer)}</p>
          <Link role="menuitem" href="/account" onClick={() => setOpenMenu(null)}><UserRound size={16} />Account</Link>
          {!subscribed && <Link role="menuitem" href="/subscribe" onClick={() => setOpenMenu(null)}><CreditCard size={16} />Get CinePass</Link>}
          <Link role="menuitem" href="/account#help" onClick={() => setOpenMenu(null)}><HelpCircle size={16} />Help Center</Link>
          <button role="menuitem" type="button" className="account-signout" onClick={signOut}><LogOut size={16} />Sign out of SineSarili</button>
        </div>}
      </div>
    </div>
  );
}
