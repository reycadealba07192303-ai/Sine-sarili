"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BrandMarks } from "@/components/brand-marks";
import { AdminActivityLog } from "@/components/admin-activity-log";
import { AdminAwardsManager } from "@/components/admin-awards-manager";
import { AdminPeopleManager } from "@/components/admin-people-manager";
import { AdminInviteDialog } from "@/components/admin-invite-dialog";
import { AdminPlansEditor } from "@/components/admin-plans-editor";
import { AdminSeriesEditor, seasonDraftsFromApi, seasonDraftsToPayload, type SeasonDraft } from "@/components/admin-series-editor";

type Role = "super_admin" | "admin" | "user" | "editor";

type AdminSession = {
  sub: string;
  name: string;
  email: string;
  role: Role;
  permissions?: string[];
};

type OverviewFilm = {
  _id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  status: string;
  contentType?: "film" | "series";
  createdAt?: string;
  playCount?: number;
  viewCount?: number;
};

type DashboardStats = {
  recentFilms: OverviewFilm[];
  topWatched: OverviewFilm[];
  films: {
    total: number;
    published: number;
    draft: number;
    pending_approval: number;
    archived: number;
  };
  admins: { active: number };
  announcements: { total: number };
  categories: { total: number };
  directors: { total: number };
  awards: { total: number };
  metrics: {
    pageViews: number;
    videoStarts: number;
    videoCompletes: number;
    playbackErrors: number;
  };
  recentActivity: Array<{
    _id: string;
    actorName: string;
    actorEmail: string;
    action: string;
    resourceType: string;
    createdAt: string;
  }>;
};

type Film = {
  _id: string;
  title: string;
  slug: string;
  synopsis: string;
  tagline: string;
  posterUrl: string;
  backdropUrl: string;
  drmAssetId?: string;
  drmHlsUrl?: string;
  videoUrl: string;
  videoProvider: "direct" | "youtube" | "vimeo" | "hls" | "embed" | "external" | "drm";
  teaserUrl: string;
  teaserProvider: "direct" | "youtube" | "vimeo" | "hls" | "embed" | "external" | "drm";
  subtitlesUrl: string;
  contentType?: "film" | "series";
  seasons?: Parameters<typeof seasonDraftsFromApi>[0];
  releaseYear?: number;
  runtimeMinutes?: number;
  genres: string[];
  categories: string[];
  directorNames: string[];
  cast: { name: string; characterName: string; photoUrl: string }[];
  awards: { awardName: string; organization: string; year: number; awardType: string; category?: string }[];
  status: "draft" | "pending_approval" | "published" | "archived";
  visibility: "public" | "restricted";
  isFeatured: boolean;
  audienceScore?: number;
  viewCount: number;
  playCount: number;
  updatedAt: string;
};

type Category = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  sectionKey: string;
  displayOrder: number;
  isVisible: boolean;
};

type Announcement = {
  _id: string;
  title: string;
  message: string;
  status: "draft" | "published" | "archived";
  publishedAt?: string;
  createdAt?: string;
  updatedAt: string;
};

type AdminUser = {
  _id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  status: "invited" | "active" | "suspended" | "deactivated";
  lastLoginAt?: string;
  createdAt: string;
};

type TabType =
  | "overview"
  | "films"
  | "categories"
  | "announcements"
  | "directors"
  | "awards"
  | "analytics"
  | "payments"
  | "logs"
  | "users"
  | "settings";

type IconName =
  | "overview"
  | "film"
  | "announcement"
  | "genre"
  | "published"
  | "draft"
  | "plus"
  | "search"
  | "arrow"
  | "upload"
  | "edit"
  | "delete"
  | "users"
  | "trophy"
  | "chart"
  | "payment"
  | "logs"
  | "settings"
  | "logout";

type BankAccount = {
  _id: string;
  providerName: string;
  accountType: "ewallet" | "bank_transfer" | "qr_ph";
  accountName: string;
  accountNumber: string;
  qrCodeUrl: string;
  instructions: string;
  isActive: boolean;
  displayOrder: number;
  createdAt?: string;
};

type PaymentSubmission = {
  _id: string;
  subscriberName: string;
  subscriberEmail: string;
  subscriberPhone: string;
  plan: string;
  planName: string;
  amountExpected: number;
  amountPaid: number;
  currency: string;
  bankProvider: string;
  accountNumber?: string;
  referenceNumber: string;
  receiptUrl: string;
  receiptMetadata: {
    detectedAmount?: number;
    detectedReference?: string;
    amountMatched: boolean;
    referenceValid: boolean;
    heuristicScore: number;
    verificationNotes: string[];
  };
  status: "pending" | "verified" | "rejected" | "flagged";
  verificationSource: string;
  reviewedByAdmin?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
};

function AdminIcon({ name }: { name: IconName }) {
  const icons: Record<IconName, ReactNode> = {
    overview: (
      <>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    film: (
      <>
        <path d="M4 4.5h16v15H4z" />
        <path d="m4 8 16-3M4 13l16-3M4 18l16-3" />
        <path d="m9 4.5 2 3.1M16 4.5l2 3.1M9 12l2 3.1M16 10.6l2 3.1" />
      </>
    ),
    announcement: (
      <>
        <path d="M4 13V9a2 2 0 0 1 2-2h3l8-3v14l-8-3H6a2 2 0 0 1-2-2Z" />
        <path d="m8 15 1.5 5h3L11 15M20 9a4 4 0 0 1 0 4" />
      </>
    ),
    genre: (
      <>
        <path d="M20 13 13 20 4 11V4h7l9 9Z" />
        <circle cx="8" cy="8" r="1.2" />
      </>
    ),
    published: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </>
    ),
    draft: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h15" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 14v5h14v-5" />
      </>
    ),
    edit: (
      <>
        <path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" />
        <path d="m13.5 7 3.5 3.5" />
      </>
    ),
    delete: (
      <>
        <path d="M4 7h16M10 11v6M14 11v6M5.5 7l.8 14h11.4l.8-14M9 7V4h6v3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
      </>
    ),
    trophy: (
      <>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
        <path d="M6 4h12v7a6 6 0 0 1-12 0V4Z" />
      </>
    ),
    chart: (
      <>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </>
    ),
    payment: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </>
    ),
    logs: (
      <>
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </>
    ),
  };
  return (
    <svg
      className="admin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

export function AdminPanel() {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Enhanced toast notifications
  type ToastType = 'success' | 'error' | 'warning' | 'info';
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<ToastType>("info");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile navigation
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Custom confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  // Search input ref for Ctrl+K
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [films, setFilms] = useState<Film[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [directorCount, setDirectorCount] = useState(0);
  const [awardCount, setAwardCount] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [revenueTimeframe, setRevenueTimeframe] = useState<"day" | "month" | "year">("month");
  const [userTimeframe, setUserTimeframe] = useState<"day" | "month" | "year">("month");

  // Payment Accounts & Audits States
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [paymentSubmissions, setPaymentSubmissions] = useState<PaymentSubmission[]>([]);
  const [submissionFilter, setSubmissionFilter] = useState<"all" | "pending" | "verified" | "flagged" | "rejected">("all");
  const [inspectingReceipt, setInspectingReceipt] = useState<PaymentSubmission | null>(null);
  const [receiptImgError, setReceiptImgError] = useState(false);

  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankForm, setBankForm] = useState({
    providerName: "GCash",
    accountType: "ewallet" as "ewallet" | "bank_transfer" | "qr_ph",
    accountName: "",
    accountNumber: "",
    qrCodeUrl: "",
    instructions: "Transfer exact fee and save the digital transaction receipt.",
    isActive: true,
    displayOrder: "0",
  });

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [qrUploadBusy, setQrUploadBusy] = useState(false);

  // Filters & Search
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "super_admin" | "admin" | "user">("all");

  // Modals & Forms
  const [filmEditorOpen, setFilmEditorOpen] = useState(false);
  const [editingFilm, setEditingFilm] = useState<Film | null>(null);
  const [videoSourceMode, setVideoSourceMode] = useState<"upload" | "embed">("embed");
  const [teaserSourceMode, setTeaserSourceMode] = useState<"upload" | "embed">("embed");
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [seasonDrafts, setSeasonDrafts] = useState<SeasonDraft[]>([]);
  const [filmForm, setFilmForm] = useState({
    contentType: "film" as "film" | "series",
    title: "",
    slug: "",
    synopsis: "",
    tagline: "",
    posterUrl: "",
    backdropUrl: "",
    videoUrl: "",
    videoProvider: "direct",
    drmAssetId: "",
    drmHlsUrl: "",
    teaserUrl: "",
    teaserProvider: "direct",
    subtitlesUrl: "",
    releaseYear: "2025",
    runtimeMinutes: "90",
    genres: "Drama",
    categories: "films",
    directorNames: "",
    castRaw: "",
    awardsRaw: "",
    visibility: "public",
    isFeatured: false,
    audienceScore: "",
  });

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");

  const [annDialogOpen, setAnnDialogOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [annStatus, setAnnStatus] = useState<"draft" | "published">("published");

  const [userDialogOpen, setUserDialogOpen] = useState(false);

  // Relative time formatter
  const formatRelativeTime = useCallback((dateStr: string): string => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, []);

  // Enhanced notify with toast type
  const notify = useCallback((msg: string, type: ToastType = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    setToastType(type);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToastMessage(""), 350);
    }, 4500);
  }, []);

  // Custom confirm helper
  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ open: true, title, message, onConfirm });
  }, []);

  // Keyboard shortcut: Ctrl+K / Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (activeTab !== "films") setActiveTab("films");
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // Escape to close mobile nav
      if (e.key === "Escape" && mobileNavOpen) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeTab, mobileNavOpen]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const sessionRes = await fetch("/api/admin/session");
      if (!sessionRes.ok) {
        setAdmin(null);
        setLoading(false);
        return;
      }
      const sessionData = await sessionRes.json();
      setAdmin(sessionData.data);

      const [statsRes, filmsRes, catRes, annRes] = await Promise.all([
        fetch("/api/admin/dashboard-stats"),
        fetch("/api/admin/films"),
        fetch("/api/admin/categories"),
        fetch("/api/admin/announcements"),
      ]);

      if (statsRes.ok) setStats((await statsRes.json()).data);
      if (filmsRes.ok) setFilms((await filmsRes.json()).data);
      if (catRes.ok) setCategories((await catRes.json()).data);
      if (annRes.ok) setAnnouncements((await annRes.json()).data);

      fetch("/api/admin/directors").then((r) => r.ok && r.json()).then((d) => d && setDirectorCount(d.data.length)).catch(() => {});
      fetch("/api/admin/awards").then((r) => r.ok && r.json()).then((d) => d && setAwardCount(d.data.length)).catch(() => {});
      fetch("/api/admin/users").then((r) => r.ok && r.json()).then((d) => d && setUsers(d.data)).catch(() => {});
      fetch("/api/admin/analytics").then((r) => r.ok && r.json()).then((d) => d && setAnalyticsData(d.data)).catch(() => {});
      fetch("/api/admin/bank-accounts").then((r) => r.ok && r.json()).then((d) => d && setBankAccounts(d.data)).catch(() => {});
      fetch("/api/admin/payment-submissions").then((r) => r.ok && r.json()).then((d) => d && setPaymentSubmissions(d.data)).catch(() => {});
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Authentication failed");
        setBusy(false);
        return;
      }
      setAdmin(data.data);
      notify("Welcome to SineSarili Studio, " + data.data.name);
      loadAll();
    } catch {
      notify("Unable to reach authentication server");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    setAdmin(null);
    notify("Signed out successfully");
  };

  const handleUploadFile = async (kind: "poster" | "backdrop" | "teaser" | "film" | "qrcode", file: File) => {
    setBusy(true);
    setUploadingKind(kind);
    try {
      const res = await fetch(`/api/admin/uploads/${kind}`, {
        method: "POST",
        headers: { "Content-Type": file.type || (kind === "film" || kind === "teaser" ? "video/mp4" : "image/jpeg") },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Upload failed", "error");
        return null;
      }
      notify(`Uploaded ${kind} asset successfully!`, "success");
      return data.data.url as string;
    } catch {
      notify("Network error during upload", "error");
      return null;
    } finally {
      setBusy(false);
      setUploadingKind(null);
    }
  };

  const handleSaveFilm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        title: filmForm.title,
        slug: filmForm.slug,
        synopsis: filmForm.synopsis,
        tagline: filmForm.tagline,
        posterUrl: filmForm.posterUrl,
        backdropUrl: filmForm.backdropUrl,
        videoUrl: filmForm.videoUrl,
        videoProvider: filmForm.videoProvider,
        drmAssetId: filmForm.drmAssetId,
        drmHlsUrl: filmForm.drmHlsUrl,
        teaserUrl: filmForm.teaserUrl,
        teaserProvider: filmForm.teaserProvider,
        subtitlesUrl: filmForm.subtitlesUrl,
        releaseYear: parseInt(filmForm.releaseYear) || 2025,
        runtimeMinutes: parseInt(filmForm.runtimeMinutes) || 90,
        genres: filmForm.genres.split(",").map((s) => s.trim()).filter(Boolean),
        categories: filmForm.categories.split(",").map((s) => s.trim()).filter(Boolean),
        directorNames: filmForm.directorNames.split(",").map((s) => s.trim()).filter(Boolean),
        cast: filmForm.castRaw
          .split("\n")
          .map((line) => line.split("|").map((p) => p.trim()))
          .filter(([name]) => Boolean(name))
          .map(([name, role = "", photo = ""]) => ({ name, characterName: role, photoUrl: photo })),
        awards: filmForm.awardsRaw
          .split("\n")
          .map((line) => line.split("|").map((p) => p.trim()))
          .filter(([awardName]) => Boolean(awardName))
          .map(([awardName, org = "", yr = "2024", type = "win", cat = ""]) => ({
            awardName,
            organization: org,
            year: parseInt(yr) || 2024,
            awardType: type,
            category: cat,
          })),
        visibility: filmForm.visibility,
        isFeatured: filmForm.isFeatured,
        audienceScore: filmForm.audienceScore.trim() === "" ? "" : Number(filmForm.audienceScore),
        contentType: filmForm.contentType,
        seasons: filmForm.contentType === "series" ? seasonDraftsToPayload(seasonDrafts) : [],
      };

      const url = editingFilm ? `/api/admin/films/${editingFilm._id}` : "/api/admin/films";
      const method = editingFilm ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to save film record");
        setBusy(false);
        return;
      }

      notify(editingFilm ? "Film updated successfully!" : "Film record created!");
      setFilmEditorOpen(false);
      setEditingFilm(null);
      loadAll();
    } catch {
      notify("Failed to save film");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateFilmStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/films/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to update status");
        return;
      }
      notify(`Status changed to ${data.data.status}`);
      loadAll();
    } catch {
      notify("Failed to update status");
    }
  };

  const handleDeleteFilm = (id: string, title: string) => {
    showConfirm(
      "Delete Film Record",
      `Permanently delete "${title}" from the cinema catalog? This action cannot be reversed.`,
      async () => {
        try {
          const res = await fetch(`/api/admin/films/${id}`, { method: "DELETE" });
          if (!res.ok) {
            notify("Failed to delete film", "error");
            return;
          }
          notify(`Deleted "${title}"`, "success");
          loadAll();
        } catch {
          notify("Failed to delete film", "error");
        }
      }
    );
  };

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: catName, description: catDesc };
      const url = editingCategory ? `/api/admin/categories/${editingCategory._id}` : "/api/admin/categories";
      const method = editingCategory ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to save category");
        return;
      }
      notify("Category saved!");
      setCategoryDialogOpen(false);
      loadAll();
    } catch {
      notify("Failed to save category");
    }
  };

  const handleSaveAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: annTitle, message: annMessage, status: annStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to publish announcement");
        return;
      }
      notify("Announcement published!");
      setAnnDialogOpen(false);
      setAnnTitle("");
      setAnnMessage("");
      loadAll();
    } catch {
      notify("Failed to publish");
    }
  };

  const handleInviteAction = async (userId: string, action: "resend" | "revoke") => {
    try {
      const res = await fetch(action === "resend" ? `/api/admin/users/${userId}/resend-invite` : `/api/admin/users/${userId}/invite`, { method: action === "resend" ? "POST" : "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || "Something went wrong", "error"); return; }
      notify(data.message || "Done", "success");
      loadAll();
    } catch {
      notify("Something went wrong", "error");
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to update user");
        return;
      }
      notify(`User account is now ${nextStatus}`);
      loadAll();
    } catch {
      notify("Failed to update user");
    }
  };

  const handleSaveBank = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const url = editingBank ? `/api/admin/bank-accounts/${editingBank._id}` : "/api/admin/bank-accounts";
      const method = editingBank ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: bankForm.providerName,
          accountType: bankForm.accountType,
          accountName: bankForm.accountName,
          accountNumber: bankForm.accountNumber,
          qrCodeUrl: bankForm.qrCodeUrl,
          instructions: bankForm.instructions,
          isActive: bankForm.isActive,
          displayOrder: parseInt(bankForm.displayOrder) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to save bank account", "error");
        return;
      }
      notify(`Bank account for ${bankForm.providerName} saved successfully!`, "success");
      setBankDialogOpen(false);
      setEditingBank(null);
      loadAll();
    } catch {
      notify("Network error saving bank account", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteBank = async (id: string, name: string) => {
    showConfirm("Delete Bank Account", `Are you sure you want to remove ${name} receiving account?`, async () => {
      try {
        const res = await fetch(`/api/admin/bank-accounts/${id}`, { method: "DELETE" });
        if (res.ok) {
          notify(`Bank account ${name} removed`, "success");
          loadAll();
        }
      } catch {
        notify("Failed to delete bank account", "error");
      }
    });
  };

  const handleApprovePayment = async (submission: PaymentSubmission) => {
    showConfirm(
      "Approve Payment & Activate",
      `Approve payment ₱${submission.amountPaid.toLocaleString()} for ${submission.subscriberName} (${submission.planName}) and activate their subscription immediately?`,
      async () => {
        try {
          const res = await fetch(`/api/admin/payment-submissions/${submission._id}/approve`, {
            method: "POST",
          });
          const data = await res.json();
          if (!res.ok) {
            notify(data.error || "Failed to approve payment", "error");
            return;
          }
          notify(`Subscription activated for ${submission.subscriberName}!`, "success");
          setInspectingReceipt(null);
          loadAll();
        } catch {
          notify("Error approving payment", "error");
        }
      }
    );
  };

  const handleRejectPayment = async () => {
    if (!rejectingSubId) return;
    try {
      const res = await fetch(`/api/admin/payment-submissions/${rejectingSubId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || "Payment receipt could not be verified" }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error || "Failed to reject payment", "error");
        return;
      }
      notify("Payment submission rejected", "warning");
      setRejectDialogOpen(false);
      setRejectingSubId(null);
      setRejectReason("");
      setInspectingReceipt(null);
      loadAll();
    } catch {
      notify("Error rejecting payment", "error");
    }
  };

  const handleOpenEditBank = (b: BankAccount) => {
    setEditingBank(b);
    setBankForm({
      providerName: b.providerName,
      accountType: b.accountType,
      accountName: b.accountName,
      accountNumber: b.accountNumber,
      qrCodeUrl: b.qrCodeUrl || "",
      instructions: b.instructions || "",
      isActive: b.isActive,
      displayOrder: String(b.displayOrder ?? 0),
    });
    setBankDialogOpen(true);
  };

  const handleOpenNewBank = () => {
    setEditingBank(null);
    setBankForm({
      providerName: "GCash",
      accountType: "ewallet",
      accountName: "",
      accountNumber: "",
      qrCodeUrl: "",
      instructions: "Transfer exact fee and save the digital transaction receipt.",
      isActive: true,
      displayOrder: String(bankAccounts.length),
    });
    setBankDialogOpen(true);
  };

  const handleToggleBankActive = async (b: BankAccount) => {
    try {
      const res = await fetch(`/api/admin/bank-accounts/${b._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !b.isActive }),
      });
      if (res.ok) {
        notify(`${b.providerName} is now ${!b.isActive ? "Active" : "Inactive"}`);
        loadAll();
      }
    } catch {
      notify("Failed to update status", "error");
    }
  };

  const handleOpenInspectReceipt = (sub: PaymentSubmission) => {
    setReceiptImgError(false);
    setInspectingReceipt(sub);
  };

  const isPositiveCheck = (note: string) => {
    const lower = note.toLowerCase();
    if (lower.includes("underpayment") || lower.includes("invalid reference") || lower.includes("duplicate found") || lower.includes("mismatch") || lower.includes("alert")) {
      return false;
    }
    if (
      note.startsWith("✓") ||
      lower.includes("verified") ||
      lower.includes("uniqueness verified") ||
      lower.includes("exact payment") ||
      lower.includes("high-resolution") ||
      lower.includes("matches") ||
      lower.includes("valid")
    ) {
      return true;
    }
    return false;
  };

  const filteredSubmissions = useMemo(() => {
    return paymentSubmissions.filter((sub) => {
      const needle = submissionSearch.trim().toLowerCase();
      const matchesSearch =
        !needle ||
        sub.subscriberName.toLowerCase().includes(needle) ||
        sub.subscriberEmail.toLowerCase().includes(needle) ||
        sub.referenceNumber.toLowerCase().includes(needle) ||
        sub.bankProvider.toLowerCase().includes(needle);

      const matchesStatus =
        submissionFilter === "all" ||
        (submissionFilter === "pending" && sub.status === "pending") ||
        (submissionFilter === "verified" && sub.status === "verified") ||
        (submissionFilter === "flagged" && sub.status === "flagged") ||
        (submissionFilter === "rejected" && sub.status === "rejected");

      return matchesSearch && matchesStatus;
    });
  }, [paymentSubmissions, submissionSearch, submissionFilter]);

  const filteredFilms = useMemo(() => {
    return films.filter((f) => {
      const needle = query.trim().toLowerCase();
      const matchesSearch =
        !needle ||
        f.title.toLowerCase().includes(needle) ||
        f.directorNames.some((d) => d.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === "all" || f.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [films, query, statusFilter]);

  if (loading) {
    return (
      <main className="admin-screen" style={{ display: "grid", placeItems: "center" }}>
        <p className="admin-loading">
          <span className="loading-mark" style={{ display: "inline-block", marginRight: "10px" }} />
          Connecting to SineSarili Studio…
        </p>
      </main>
    );
  }

  // Login Screen
  if (!admin) {
    return (
      <main className="admin-login-screen">
        <Link className="admin-home-link" href="/">
          ← Back to website
        </Link>
        <section className="admin-login-card">
          <Link className="admin-brand" href="/">
            <BrandMarks />
            <span className="brand-name">SineSarili</span>
          </Link>
          <p className="admin-kicker">CINEMA MANAGEMENT</p>
          <h1>
            Admin <span>Studio</span>
          </h1>
          <p className="admin-lead">
            Sign in to manage films, streaming references, announcements, and categories.
          </p>

          <form className="studio-form" onSubmit={handleLogin}>
            <label>
              Administrator email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@sinesarili.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </label>

            <button type="submit" className="studio-primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to Studio"} <AdminIcon name="arrow" />
            </button>
          </form>

          {toastMessage && <p className="studio-message" style={{ marginTop: "15px" }}>{toastMessage}</p>}
        </section>
      </main>
    );
  }

  const isSuperAdmin = admin.role === "super_admin";

  return (
    <div className="studio-shell">
      {/* Toast Notification */}
      {toastMessage && <div className="studio-toast">{toastMessage}</div>}

      {/* Sidebar Navigation */}
      <aside className="studio-sidebar">
        <Link className="admin-brand" href="/">
          <BrandMarks />
          <div className="brand-titles">
            <span className="brand-name">SineSarili</span>
            <span className="brand-badge">STUDIO</span>
          </div>
        </Link>

        <p className="studio-nav-label">CONTENT</p>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="overview" />
          </span>
          <span className="studio-nav-text">Overview</span>
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "films" ? "active" : ""}`}
          onClick={() => setActiveTab("films")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="film" />
          </span>
          <span className="studio-nav-text">Films Catalog</span>
          {films.length > 0 && <b>{films.length}</b>}
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "categories" ? "active" : ""}`}
          onClick={() => setActiveTab("categories")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="genre" />
          </span>
          <span className="studio-nav-text">Categories</span>
          {categories.length > 0 && <b>{categories.length}</b>}
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "directors" ? "active" : ""}`}
          onClick={() => setActiveTab("directors")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="users" />
          </span>
          <span className="studio-nav-text">Directors</span>
          {directorCount > 0 && <b>{directorCount}</b>}
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "awards" ? "active" : ""}`}
          onClick={() => setActiveTab("awards")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="trophy" />
          </span>
          <span className="studio-nav-text">Awards & Honors</span>
          {awardCount > 0 && <b>{awardCount}</b>}
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "announcements" ? "active" : ""}`}
          onClick={() => setActiveTab("announcements")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="announcement" />
          </span>
          <span className="studio-nav-text">Announcements</span>
          {announcements.length > 0 && <b>{announcements.length}</b>}
        </button>

        <p className="studio-nav-label">REPORTS & AUDIT</p>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "analytics" ? "active" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="chart" />
          </span>
          <span className="studio-nav-text">Analytics & Reports</span>
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "payments" ? "active" : ""}`}
          onClick={() => setActiveTab("payments")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="payment" />
          </span>
          <span className="studio-nav-text">Bank Accounts & Audits</span>
          {paymentSubmissions.filter((p) => p.status === "pending" || p.status === "flagged").length > 0 && (
            <b style={{ background: "rgba(228, 92, 134, 0.25)", color: "#b4234f" }}>
              {paymentSubmissions.filter((p) => p.status === "pending" || p.status === "flagged").length}
            </b>
          )}
        </button>

        <button
          type="button"
          className={`studio-nav-link ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          <span className="studio-nav-icon">
            <AdminIcon name="logs" />
          </span>
          <span className="studio-nav-text">Activity Logs</span>
        </button>

        {isSuperAdmin && (
          <>
            <p className="studio-nav-label">SYSTEM & ACCESS</p>
            <button
              type="button"
              className={`studio-nav-link ${activeTab === "users" ? "active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              <span className="studio-nav-icon">
                <AdminIcon name="users" />
              </span>
              <span className="studio-nav-text">Administrators</span>
              {users.length > 0 && <b>{users.length}</b>}
            </button>
            <button
              type="button"
              className={`studio-nav-link ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              <span className="studio-nav-icon">
                <AdminIcon name="settings" />
              </span>
              <span className="studio-nav-text">Platform Settings</span>
            </button>
          </>
        )}

        <div className="studio-sidebar-bottom">
          <div className="studio-user">
            <div className="studio-avatar">{admin.name.charAt(0).toUpperCase()}</div>
            <div className="studio-user-meta">
              <strong>{admin.name}</strong>
              <small>{admin.role.replace("_", " ")}</small>
            </div>
          </div>
          <button type="button" className="studio-logout" onClick={handleLogout}>
            <span>Sign out</span>
            <AdminIcon name="logout" />
          </button>
        </div>
      </aside>

      {/* Main Studio Body */}
      <main className="studio-main">
        <header className="studio-topbar">
          <div className="studio-topbar-left">
            <div className="studio-topbar-breadcrumb">
              <span className="studio-crumb-portal">SineSarili Studio</span>
              <span className="studio-crumb-slash">/</span>
              <span className="studio-crumb-active">
                {activeTab === "overview" && "OVERVIEW"}
                {activeTab === "films" && "FILM CATALOG"}
                {activeTab === "categories" && "CATEGORIES & SECTIONS"}
                {activeTab === "announcements" && "ANNOUNCEMENTS"}
                {activeTab === "directors" && "DIRECTORS"}
                {activeTab === "awards" && "AWARDS & HONORS"}
                {activeTab === "analytics" && "ANALYTICS & REPORTS"}
                {activeTab === "payments" && "BANK ACCOUNTS & AUDITS"}
                {activeTab === "logs" && "ACTIVITY LOGS"}
                {activeTab === "users" && "SYSTEM ACCESS & ROLES"}
                {activeTab === "settings" && "PLATFORM SETTINGS"}
              </span>
            </div>
            <div className="studio-topbar-status">
              <span className="studio-status-pulse" />
              <span>Studio Live</span>
            </div>
          </div>
          <div className="studio-topbar-right">
            <div className="studio-topbar-user-badge">
              <span className="user-email">{admin.email}</span>
              <span className={`role-badge ${admin.role}`} style={{ fontSize: "10px", padding: "2px 8px" }}>
                {admin.role === "super_admin" ? "SUPER ADMIN" : admin.role === "admin" ? "ADMIN" : "USER"}
              </span>
            </div>
          </div>
        </header>

        <section className="studio-content">
          {/* ========================================================= */}
          {/* OVERVIEW TAB */}
          {/* ========================================================= */}
          {activeTab === "overview" && stats && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">STUDIO DASHBOARD & OPERATIONS</p>
                  <h1>Cinema Operations Overview</h1>
                  <p>Real-time platform metrics, active catalog records, and verified video playback events.</p>
                </div>
                <button
                  className="studio-primary"
                  onClick={() => {
                    setEditingFilm(null);
                    setSeasonDrafts([]);
                    setFilmForm((form) => ({ ...form, contentType: "film" }));
                    setVideoSourceMode("upload");
                    setTeaserSourceMode("upload");
                    setFilmEditorOpen(true);
                  }}
                >
                  <AdminIcon name="plus" /> Add Film Record
                </button>
              </div>

              <div className="studio-quick-strip">
                <div className="studio-quick-pill published">
                  <span className="dot" />
                  <strong>{stats.films.published}</strong> Published Films
                </div>
                <div className="studio-quick-pill draft">
                  <span className="dot" />
                  <strong>{stats.films.draft}</strong> In Draft
                </div>
                <div className="studio-quick-pill pending">
                  <span className="dot" />
                  <strong>{films.filter((f) => f.status === "pending_approval").length}</strong> Pending Review
                </div>
                <div className="studio-quick-pill archived">
                  <span className="dot" />
                  <strong>{films.filter((f) => f.status === "archived").length}</strong> Archived
                </div>
              </div>

              <div className="studio-stats studio-stats-four">
                <article>
                  <p>TOTAL FILMS</p>
                  <strong>{stats.films.total}</strong>
                  <small>
                    {stats.films.published} Published · {stats.films.draft} Draft
                  </small>
                  <span className="studio-stat-icon red">
                    <AdminIcon name="film" />
                  </span>
                </article>

                <article>
                  <p>PAGE VIEWS</p>
                  <strong>{stats.metrics.pageViews.toLocaleString()}</strong>
                  <small>Film detail pages viewed</small>
                  <span className="studio-stat-icon blue">
                    <AdminIcon name="chart" />
                  </span>
                </article>

                <article>
                  <p>VIDEO STARTS</p>
                  <strong>{stats.metrics.videoStarts.toLocaleString()}</strong>
                  <small>{stats.metrics.videoCompletes} completed plays</small>
                  <span className="studio-stat-icon green">
                    <AdminIcon name="published" />
                  </span>
                </article>

                <article>
                  <p>PLAYBACK ERRORS</p>
                  <strong>{stats.metrics.playbackErrors}</strong>
                  <small>Logged playback failures</small>
                  <span className="studio-stat-icon amber">
                    <AdminIcon name="draft" />
                  </span>
                </article>
              </div>

              <div className="studio-overview-pair">
                <section className="studio-records">
                  <div className="studio-section-heading">
                    <div>
                      <p className="admin-kicker">CATALOG</p>
                      <h2>Recently added</h2>
                    </div>
                  </div>
                  {(stats.recentFilms ?? []).length === 0 ? (
                    <p className="studio-overview-empty">No films yet. Use “Add Film Record” to add the first one.</p>
                  ) : (
                    <ol className="studio-overview-list">
                      {stats.recentFilms.map((film) => (
                        <li key={film._id}>
                          <span className="studio-overview-poster">{film.posterUrl ? <img src={film.posterUrl} alt="" /> : film.title.charAt(0)}</span>
                          <span className="studio-overview-copy">
                            <strong>{film.title}</strong>
                            <small>{film.contentType === "series" ? "Series" : "Film"} · {film.status.replace("_", " ")}{film.createdAt ? ` · added ${new Date(film.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : ""}</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section className="studio-records">
                  <div className="studio-section-heading">
                    <div>
                      <p className="admin-kicker">AUDIENCE</p>
                      <h2>Top 5 most watched</h2>
                    </div>
                  </div>
                  {(stats.topWatched ?? []).length === 0 ? (
                    <p className="studio-overview-empty">No views yet. Films appear here once people start watching.</p>
                  ) : (
                    <ol className="studio-overview-list is-ranked">
                      {stats.topWatched.map((film, index) => (
                        <li key={film._id}>
                          <span className="studio-overview-rank">{index + 1}</span>
                          <span className="studio-overview-poster">{film.posterUrl ? <img src={film.posterUrl} alt="" /> : film.title.charAt(0)}</span>
                          <span className="studio-overview-copy">
                            <strong>{film.title}</strong>
                            <small>{(film.playCount ?? 0).toLocaleString()} plays · {(film.viewCount ?? 0).toLocaleString()} views</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>

              {/* Recent Activity Card */}
              <section className="studio-records">
                <div className="studio-section-heading">
                  <div>
                    <p className="admin-kicker">AUDIT TRAIL</p>
                    <h2>Recent Administrative Activity</h2>
                  </div>
                  <button
                    className="studio-primary"
                    style={{ minHeight: "36px", fontSize: "12px" }}
                    onClick={() => setActiveTab("logs")}
                  >
                    View All Logs →
                  </button>
                </div>

                <div className="studio-table-wrap">
                  <table className="studio-table">
                    <thead>
                      <tr>
                        <th>ACTOR</th>
                        <th>ACTION</th>
                        <th>RESOURCE</th>
                        <th>TIMESTAMP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentActivity.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="studio-empty">
                            No recent activity recorded yet.
                          </td>
                        </tr>
                      ) : (
                        stats.recentActivity.map((log) => (
                          <tr key={log._id}>
                            <td>
                              <div className="studio-film">
                                <div className="studio-avatar" style={{ width: "32px", height: "32px", fontSize: "12px" }}>
                                  {log.actorName.charAt(0).toUpperCase()}
                                </div>
                                <span>
                                  <strong>{log.actorName}</strong>
                                  <small>{log.actorEmail}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className="role-badge super_admin" style={{ fontSize: "10.5px" }}>
                                {log.action}
                              </span>
                            </td>
                            <td style={{ color: "#8a6608", fontWeight: 600, textTransform: "capitalize" }}>
                              {log.resourceType}
                            </td>
                            <td style={{ color: "#5c5870" }}>
                              {formatRelativeTime(log.createdAt)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ========================================================= */}
          {/* FILMS TAB */}
          {/* ========================================================= */}
          {activeTab === "films" && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">CINEMA CATALOG & ARCHIVE</p>
                  <h1>Films Catalog</h1>
                  <p>Curate cinematic titles, streaming sources, approval states, and metadata.</p>
                </div>
                <button
                  className="studio-primary"
                  onClick={() => {
                    setEditingFilm(null);
                    setSeasonDrafts([]);
                    setFilmForm((form) => ({ ...form, contentType: "film" }));
                    setVideoSourceMode("upload");
                    setTeaserSourceMode("upload");
                    setFilmEditorOpen(true);
                  }}
                >
                  <AdminIcon name="plus" /> Add Film Record
                </button>
              </div>

              <section className="studio-records">
                <div className="studio-table-tools">
                  <div className="studio-status-filters">
                    {[
                      { key: "all", label: "ALL", count: films.length },
                      { key: "published", label: "PUBLISHED", count: films.filter((f) => f.status === "published").length },
                      { key: "draft", label: "DRAFT", count: films.filter((f) => f.status === "draft").length },
                      { key: "pending_approval", label: "PENDING", count: films.filter((f) => f.status === "pending_approval").length },
                      { key: "archived", label: "ARCHIVED", count: films.filter((f) => f.status === "archived").length },
                    ].map((item) => (
                      <button
                        key={item.key}
                        className={`studio-status-filter ${statusFilter === item.key ? "active" : ""}`}
                        onClick={() => setStatusFilter(item.key)}
                      >
                        {item.label} <span>{item.count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="studio-search" style={{ marginLeft: "auto" }}>
                    <AdminIcon name="search" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      placeholder="Search title, director, genre…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd className="studio-search-kbd">Ctrl+K</kbd>
                  </div>
                </div>

                <div className="studio-table-wrap">
                  <table className="studio-table">
                    <thead>
                      <tr>
                        <th>FILM TITLE & DETAILS</th>
                        <th>YEAR & RUNTIME</th>
                        <th>CATEGORIES</th>
                        <th>STATUS</th>
                        <th>PAGE VIEWS</th>
                        <th style={{ textAlign: "right", paddingRight: "22px" }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFilms.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="studio-empty">
                            No films match your current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredFilms.map((film) => (
                          <tr key={film._id}>
                            <td>
                              <div className="studio-film">
                                <div className="studio-film-thumb">
                                  {film.posterUrl ? (
                                    <img src={film.posterUrl} alt="" />
                                  ) : (
                                    film.title.charAt(0)
                                  )}
                                </div>
                                <span>
                                  <strong>{film.title}</strong>
                                  <small style={{ color: "#5c5870" }}>/{film.slug}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, color: "#40328c" }}>{film.releaseYear || "—"}</span>
                              <span style={{ color: "#5c5870", fontSize: "11px", marginLeft: "6px" }}>
                                · {film.runtimeMinutes ? `${film.runtimeMinutes}m` : "—"}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                {(film.categories || ["films"]).map((c) => (
                                  <span key={c} className="section-tag-badge films" style={{ fontSize: "9px" }}>
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span className={`studio-status ${film.status}`}>
                                <i /> {film.status.replace("_", " ")}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, color: "#40328c" }}>
                                {(film.viewCount || 0).toLocaleString()}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", paddingRight: "22px" }}>
                              <div className="studio-row-actions">
                                <select
                                  aria-label={`Status of ${film.title}`}
                                  value={film.status}
                                  onChange={(e) => handleUpdateFilmStatus(film._id, e.target.value)}
                                >
                                  <option value="draft">Draft</option>
                                  <option value="pending_approval">Pending</option>
                                  <option value="published">Published</option>
                                  <option value="archived">Archived</option>
                                </select>
                                <button
                                  onClick={() => {
                                    setEditingFilm(film);
                                    setSeasonDrafts(seasonDraftsFromApi(film.seasons));
                                    setFilmForm({
                                      contentType: film.contentType === "series" ? "series" : "film",
                                      title: film.title,
                                      slug: film.slug,
                                      synopsis: film.synopsis || "",
                                      tagline: film.tagline || "",
                                      posterUrl: film.posterUrl || "",
                                      backdropUrl: film.backdropUrl || "",
                                      videoUrl: film.videoUrl || "",
                                      videoProvider: film.videoProvider || "direct",
                                      drmAssetId: film.drmAssetId || "",
                                      drmHlsUrl: film.drmHlsUrl || "",
                                      teaserUrl: film.teaserUrl || "",
                                      teaserProvider: film.teaserProvider || "direct",
                                      subtitlesUrl: film.subtitlesUrl || "",
                                      releaseYear: film.releaseYear?.toString() || "2025",
                                      runtimeMinutes: film.runtimeMinutes?.toString() || "90",
                                      genres: (film.genres || []).join(", "),
                                      categories: (film.categories || ["films"]).join(", "),
                                      directorNames: (film.directorNames || []).join(", "),
                                      castRaw: (film.cast || [])
                                        .map((c) => `${c.name} | ${c.characterName || ""} | ${c.photoUrl || ""}`)
                                        .join("\n"),
                                      awardsRaw: (film.awards || [])
                                        .map(
                                          (a) =>
                                            `${a.awardName} | ${a.organization} | ${a.year} | ${a.awardType} | ${a.category || ""}`
                                        )
                                        .join("\n"),
                                      visibility: film.visibility || "public",
                                      isFeatured: Boolean(film.isFeatured),
                                      audienceScore: film.audienceScore?.toString() ?? "",
                                    });
                                    setVideoSourceMode(film.videoUrl?.startsWith("/uploads/") ? "upload" : "embed");
                                    setTeaserSourceMode(film.teaserUrl?.startsWith("/uploads/") ? "upload" : "embed");
                                    setFilmEditorOpen(true);
                                  }}
                                >
                                  <AdminIcon name="edit" /> Edit
                                </button>
                                <button className="is-danger" onClick={() => handleDeleteFilm(film._id, film.title)}>
                                  <AdminIcon name="delete" /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ========================================================= */}
          {/* CATEGORIES TAB */}
          {/* ========================================================= */}
          {activeTab === "categories" && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">CINEMA CATALOG & GENRES</p>
                  <h1>Film Categories & Genres</h1>
                  <p>Curate cinematic genres, film classifications, and showcase collections that organize your catalog.</p>
                </div>
                <button
                  className="studio-primary"
                  onClick={() => {
                    setEditingCategory(null);
                    setCatName("");
                    setCatDesc("");
                    setCategoryDialogOpen(true);
                  }}
                >
                  <AdminIcon name="plus" /> Add Category / Genre
                </button>
              </div>

              <div className="studio-category-grid">
                {categories.map((c) => {
                  const matchingCount = films.filter((f) => (f.categories || []).includes(c.slug)).length;
                  return (
                    <div key={c._id} className="studio-category-card">
                      <div className="studio-category-card-head">
                        <div className="studio-genre-mark">
                          <AdminIcon name="genre" />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h3>{c.name}</h3>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                            <span className={`section-tag-badge ${c.sectionKey || "films"}`}>
                              {c.sectionKey.replace("-", " ")}
                            </span>
                            <span style={{ color: "#5c5870", fontSize: "10px", fontWeight: 600 }}>
                              #{c.displayOrder}
                            </span>
                          </div>
                        </div>
                      </div>
                      <p>{c.description || "No description provided for this collection."}</p>
                      <div className="studio-category-card-actions">
                        <span style={{ fontSize: "11.5px", color: "#5c5870", fontWeight: 500 }}>
                          {matchingCount} {matchingCount === 1 ? "film" : "films"} assigned
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="studio-delete-button"
                            style={{ color: "#40328c" }}
                            onClick={() => {
                              setEditingCategory(c);
                              setCatName(c.name);
                              setCatDesc(c.description || "");
                              setCategoryDialogOpen(true);
                            }}
                          >
                            <AdminIcon name="edit" /> Edit
                          </button>
                          <button
                            className="studio-delete-button"
                            onClick={() => {
                              showConfirm(
                                "Delete Category",
                                `Are you sure you want to delete category "${c.name}"?`,
                                async () => {
                                  await fetch(`/api/admin/categories/${c._id}`, { method: "DELETE" });
                                  notify(`Category "${c.name}" deleted`, "success");
                                  loadAll();
                                }
                              );
                            }}
                          >
                            <AdminIcon name="delete" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* ANNOUNCEMENTS TAB */}
          {/* ========================================================= */}
          {activeTab === "announcements" && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">CINEMA BROADCASTS & NOTICES</p>
                  <h1>Announcements & Bulletins</h1>
                  <p>Publish cinema festival schedules, submissions calls, and platform bulletins.</p>
                </div>
                <button className="studio-primary" onClick={() => setAnnDialogOpen(true)}>
                  <AdminIcon name="plus" /> New Announcement
                </button>
              </div>

              <section className="studio-records">
                <div className="studio-table-wrap">
                  <table className="studio-table">
                    <thead>
                      <tr>
                        <th>ANNOUNCEMENT TITLE</th>
                        <th>MESSAGE CONTENT</th>
                        <th>DATE POSTED</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: "right", paddingRight: "22px" }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="studio-empty">
                            No active announcements broadcasted yet.
                          </td>
                        </tr>
                      ) : (
                        announcements.map((ann) => (
                          <tr key={ann._id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ color: "#40328c" }}>
                                  <AdminIcon name="announcement" />
                                </span>
                                <strong style={{ color: "#1c1733", fontSize: "13.5px" }}>{ann.title}</strong>
                              </div>
                            </td>
                            <td style={{ maxWidth: "440px", overflow: "hidden", textOverflow: "ellipsis", color: "#3b3652" }}>
                              {ann.message}
                            </td>
                            <td style={{ color: "#5c5870", fontSize: "12px" }}>
                              {formatRelativeTime(ann.publishedAt || ann.createdAt || ann.updatedAt || new Date().toISOString())}
                            </td>
                            <td>
                              <span className={`studio-status ${ann.status}`}>
                                <i /> {ann.status}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", paddingRight: "22px" }}>
                              <button
                                className="studio-delete-button"
                                onClick={() => {
                                  showConfirm(
                                    "Delete Announcement",
                                    `Remove announcement "${ann.title}" from the platform?`,
                                    async () => {
                                      await fetch(`/api/admin/announcements/${ann._id}`, { method: "DELETE" });
                                      notify("Announcement removed", "success");
                                      loadAll();
                                    }
                                  );
                                }}
                              >
                                <AdminIcon name="delete" /> Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ========================================================= */}
          {/* DIRECTORS TAB */}
          {/* ========================================================= */}
          {activeTab === "directors" && (
            <AdminPeopleManager notify={notify} confirm={showConfirm} onCountChange={setDirectorCount} />
          )}

          {/* ========================================================= */}
          {/* AWARDS TAB */}
          {/* ========================================================= */}
          {activeTab === "awards" && (
            <AdminAwardsManager notify={notify} confirm={showConfirm} onCountChange={setAwardCount} />
          )}

          {/* ========================================================= */}
          {/* ANALYTICS & REPORTS TAB */}
          {/* ========================================================= */}
          {activeTab === "analytics" && (() => {
            const rev = analyticsData?.revenue;
            const usr = analyticsData?.users;

            // Revenue chart data by timeframe
            const revChart: Array<{ label: string; revenue: number; transactions: number }> =
              revenueTimeframe === "day"
                ? (rev?.chartDay ?? [])
                : revenueTimeframe === "month"
                ? (rev?.chartMonth ?? [])
                : (rev?.chartYear ?? []);

            // User chart data by timeframe
            const usrChart: Array<{ label: string; activeUsers: number; newSignups: number; pageViews: number }> =
              userTimeframe === "day"
                ? (usr?.chartDay ?? [])
                : userTimeframe === "month"
                ? (usr?.chartMonth ?? [])
                : (usr?.chartYear ?? []);

            const revMax = Math.max(...revChart.map((b) => b.revenue), 1);
            const usrMax = Math.max(...usrChart.map((b) => b.activeUsers), 1);

            const SVW = 520;
            const SVH = 140;
            const PAD = { top: 14, right: 12, bottom: 28, left: 10 };
            const chartW = SVW - PAD.left - PAD.right;
            const chartH = SVH - PAD.top - PAD.bottom;

            const fmtPHP = (n: number) =>
              n >= 1_000_000
                ? `₱${(n / 1_000_000).toFixed(1)}M`
                : n >= 1_000
                ? `₱${(n / 1_000).toFixed(1)}K`
                : `₱${n.toLocaleString()}`;

            const fmtNum = (n: number) =>
              n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(n);

            // Build SVG bar chart path
            const buildBars = (data: number[], max: number, color: string, showLabel: boolean, labels: string[]) => {
              if (!data.length) return null;
              const barW = Math.max(2, (chartW / data.length) * 0.55);
              const gap = chartW / data.length;
              return data.map((v, i) => {
                const barH = Math.max(2, (v / max) * chartH);
                const x = PAD.left + i * gap + (gap - barW) / 2;
                const y = PAD.top + chartH - barH;
                const isLast = i === data.length - 1;
                const showLbl = showLabel && (data.length <= 14 ? true : i % Math.ceil(data.length / 10) === 0 || isLast);
                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={3}
                      fill={color}
                      opacity={0.85}
                      style={{ transition: "height 0.3s ease, y 0.3s ease" }}
                    />
                    {v > 0 && showLbl && (
                      <text
                        x={x + barW / 2}
                        y={SVH - PAD.bottom + 12}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#5c5870"
                        style={{ fontFamily: "Segoe UI, sans-serif" }}
                      >
                        {labels[i]}
                      </text>
                    )}
                  </g>
                );
              });
            };

            // Grid lines
            const gridLines = [0.25, 0.5, 0.75, 1].map((frac) => {
              const y = PAD.top + chartH - frac * chartH;
              return (
                <line
                  key={frac}
                  x1={PAD.left}
                  y1={y}
                  x2={SVW - PAD.right}
                  y2={y}
                  stroke="rgba(64, 50, 140, 0.085)"
                  strokeWidth={1}
                />
              );
            });

            const revTotal =
              revenueTimeframe === "day" ? rev?.today : revenueTimeframe === "month" ? rev?.thisMonth : rev?.thisYear;
            const usrTotal =
              userTimeframe === "day" ? usr?.today : userTimeframe === "month" ? usr?.thisMonth : usr?.thisYear;
            const newSigns =
              userTimeframe === "day" ? usr?.newToday : userTimeframe === "month" ? usr?.newThisMonth : usr?.newThisYear;

            const plans = rev?.plans ?? { standard: { count: 0, revenue: 0, label: "CinePass Standard", price: "₱199/mo" }, vip: { count: 0, revenue: 0, label: "Cinephile VIP", price: "₱399/mo" }, patron: { count: 0, revenue: 0, label: "SineSarili Patron", price: "₱2,499/yr" } };
            const totalPlanRev = (plans.standard.revenue + plans.vip.revenue + plans.patron.revenue) || 1;

            return (
              <>
                <div className="studio-page-heading">
                  <div>
                    <p className="admin-kicker">INTELLIGENCE</p>
                    <h1>Analytics & Reports</h1>
                    <p>Real-time platform intelligence — viewer activity, income performance, and subscription metrics.</p>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <a
                      href="/api/admin/analytics/export.csv"
                      download="sinesarili-film-analytics.csv"
                      className="studio-primary"
                      style={{ textDecoration: "none", fontSize: "12px" }}
                    >
                      <AdminIcon name="upload" /> Film Report CSV
                    </a>
                    <a
                      href="/api/admin/analytics/export.csv?type=revenue"
                      download="sinesarili-revenue-report.csv"
                      className="studio-primary"
                      style={{ textDecoration: "none", fontSize: "12px", background: "linear-gradient(135deg,#e67a35,#e67a35)" }}
                    >
                      <AdminIcon name="chart" /> Revenue Report CSV
                    </a>
                  </div>
                </div>

                {/* KPI Strip */}
                {rev && (
                  <div className="studio-stats studio-stats-four" style={{ marginBottom: "6px" }}>
                    <article>
                      <div className="studio-stat-icon" style={{ color: "#2e553e", background: "rgba(56, 99, 74, 0.12)", borderColor: "rgba(56, 99, 74, 0.3)" }}>
                        <AdminIcon name="chart" />
                      </div>
                      <p>Today&apos;s Revenue</p>
                      <strong>{fmtPHP(rev.today ?? 0)}</strong>
                      <small>Subscription transactions today</small>
                    </article>
                    <article>
                      <div className="studio-stat-icon" style={{ color: "#40328c", background: "rgba(64, 50, 140, 0.12)", borderColor: "rgba(64, 50, 140, 0.3)" }}>
                        <AdminIcon name="chart" />
                      </div>
                      <p>Monthly Revenue</p>
                      <strong>{fmtPHP(rev.thisMonth ?? 0)}</strong>
                      <small>This billing month · YTD: {fmtPHP(rev.thisYear ?? 0)}</small>
                    </article>
                    <article>
                      <div className="studio-stat-icon" style={{ color: "#8a6608", background: "rgba(232, 191, 69, 0.12)", borderColor: "rgba(232, 191, 69, 0.3)" }}>
                        <AdminIcon name="trophy" />
                      </div>
                      <p>Active Subscribers</p>
                      <strong>{(rev.activeSubscribers ?? 0).toLocaleString()}</strong>
                      <small>MRR: {fmtPHP(rev.mrr ?? 0)} · ARPU: ₱{rev.arpu ?? 0}</small>
                    </article>
                    <article>
                      <div className="studio-stat-icon blue">
                        <AdminIcon name="users" />
                      </div>
                      <p>Platform Users</p>
                      <strong>{fmtNum(usr?.totalRegistered ?? 0)}</strong>
                      <small>+{usr?.newThisMonth ?? 0} new · {rev?.conversionRate ?? 0}% conversion</small>
                    </article>
                  </div>
                )}

                <div className="studio-analytics-grid">
                  {/* Revenue Income Chart */}
                  <div className="studio-chart-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>

                    {/* Revenue Chart Card */}
                    <div className="studio-chart-card">
                      <div className="studio-chart-header">
                        <div className="studio-chart-header-left">
                          <div className="studio-chart-icon-badge">
                            <AdminIcon name="chart" />
                          </div>
                          <div>
                            <h3>Income Revenue</h3>
                            <p>Subscription payments & income collected</p>
                          </div>
                        </div>
                        <div className="studio-chart-time-pill">
                          {(["day", "month", "year"] as const).map((tf) => (
                            <button
                              key={tf}
                              type="button"
                              className={`studio-chart-time-btn${revenueTimeframe === tf ? " active" : ""}`}
                              onClick={() => setRevenueTimeframe(tf)}
                            >
                              {tf === "day" ? "24H" : tf === "month" ? "30D" : "YTD"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="studio-chart-highlight-strip">
                        <strong>{fmtPHP(revTotal ?? 0)}</strong>
                        <small>
                          {revenueTimeframe === "day" ? "today" : revenueTimeframe === "month" ? "this month" : "this year"}
                        </small>
                        <span className="badge-delta">↑ Active</span>
                      </div>
                      <div className="studio-chart-svg-wrap">
                        <svg
                          className="studio-chart-svg"
                          viewBox={`0 0 ${SVW} ${SVH}`}
                          preserveAspectRatio="none"
                          role="img"
                          aria-label="Revenue chart"
                        >
                          {gridLines}
                          {buildBars(
                            revChart.map((b) => b.revenue),
                            revMax,
                            "#40328c",
                            true,
                            revChart.map((b) => b.label)
                          )}
                        </svg>
                      </div>
                      <div className="studio-chart-footer-metrics">
                        <div className="studio-chart-mini-stat">
                          <span>Year to Date</span>
                          <strong>{fmtPHP(rev?.thisYear ?? 0)}</strong>
                        </div>
                        <div className="studio-chart-mini-stat">
                          <span>Lifetime</span>
                          <strong>{fmtPHP(rev?.lifetime ?? 0)}</strong>
                        </div>
                        <div className="studio-chart-mini-stat">
                          <span>Avg. per User</span>
                          <strong>₱{rev?.arpu ?? 0}</strong>
                        </div>
                      </div>
                    </div>

                    {/* User Activity Chart Card */}
                    <div className="studio-chart-card">
                      <div className="studio-chart-header">
                        <div className="studio-chart-header-left">
                          <div className="studio-chart-icon-badge blue">
                            <AdminIcon name="users" />
                          </div>
                          <div>
                            <h3>User Activity</h3>
                            <p>Active viewers & new signups over time</p>
                          </div>
                        </div>
                        <div className="studio-chart-time-pill">
                          {(["day", "month", "year"] as const).map((tf) => (
                            <button
                              key={tf}
                              type="button"
                              className={`studio-chart-time-btn blue${userTimeframe === tf ? " active blue" : ""}`}
                              onClick={() => setUserTimeframe(tf)}
                            >
                              {tf === "day" ? "24H" : tf === "month" ? "30D" : "YTD"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="studio-chart-highlight-strip">
                        <strong>{fmtNum(usrTotal ?? 0)}</strong>
                        <small>
                          active {userTimeframe === "day" ? "today" : userTimeframe === "month" ? "this month" : "this year"}
                        </small>
                        <span className="badge-delta">+{newSigns ?? 0} new</span>
                      </div>
                      <div className="studio-chart-svg-wrap">
                        <svg
                          className="studio-chart-svg"
                          viewBox={`0 0 ${SVW} ${SVH}`}
                          preserveAspectRatio="none"
                          role="img"
                          aria-label="User activity chart"
                        >
                          {gridLines}
                          {buildBars(
                            usrChart.map((b) => b.activeUsers),
                            usrMax,
                            "#40328c",
                            true,
                            usrChart.map((b) => b.label)
                          )}
                        </svg>
                      </div>
                      <div className="studio-chart-footer-metrics">
                        <div className="studio-chart-mini-stat">
                          <span>Total Registered</span>
                          <strong>{fmtNum(usr?.totalRegistered ?? 0)}</strong>
                        </div>
                        <div className="studio-chart-mini-stat">
                          <span>New This Month</span>
                          <strong>+{usr?.newThisMonth ?? 0}</strong>
                        </div>
                        <div className="studio-chart-mini-stat">
                          <span>Conversion Rate</span>
                          <strong>{rev?.conversionRate ?? 0}%</strong>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Subscription Plan Breakdown */}
                  <section className="studio-records">
                    <div className="studio-section-heading">
                      <h2>Subscription Plan Breakdown</h2>
                    </div>
                    <div className="studio-plan-grid" style={{ padding: "18px 20px 20px" }}>
                      {([
                        { key: "standard", color: "#40328c", fill: "rgba(64, 50, 140, 0.7)", label: "CinePass Standard", price: "₱199 / mo" },
                        { key: "vip", color: "#40328c", fill: "rgba(64, 50, 140, 0.8)", label: "Cinephile VIP", price: "₱399 / mo" },
                        { key: "patron", color: "#8a6608", fill: "rgba(232, 191, 69, 0.8)", label: "SineSarili Patron", price: "₱2,499 / yr" },
                      ] as const).map(({ key, color, fill, label, price }) => {
                        const plan = plans[key] ?? { count: 0, revenue: 0 };
                        const pct = totalPlanRev > 0 ? Math.round((plan.revenue / totalPlanRev) * 100) : 0;
                        return (
                          <div key={key} className="studio-plan-card">
                            <div className="studio-plan-card-top">
                              <strong className="plan-name">{label}</strong>
                              <span className={`studio-plan-pill ${key}`}>{key.toUpperCase()}</span>
                            </div>
                            <span className="plan-price">{price}</span>
                            <div className="studio-plan-metric">
                              <strong>{fmtPHP(plan.revenue)}</strong>
                              <small>{plan.count} subscribers</small>
                            </div>
                            <div className="studio-plan-bar">
                              <div
                                className="studio-plan-bar-fill"
                                style={{ width: `${pct}%`, background: fill }}
                              />
                            </div>
                            <small style={{ color: "#5c5870", fontSize: "11px" }}>{pct}% of total revenue</small>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Recent Transactions */}
                  <section className="studio-records">
                    <div className="studio-section-heading">
                      <h2>Recent Subscription Transactions</h2>
                      <a
                        href="/api/admin/analytics/export.csv?type=revenue"
                        download="revenue-report.csv"
                        style={{ fontSize: "11px", color: "#8a6608", textDecoration: "none", display: "flex", alignItems: "center", gap: "5px" }}
                      >
                        <AdminIcon name="upload" /> Export All
                      </a>
                    </div>
                    <div className="studio-table-wrap">
                      <table className="studio-table">
                        <thead>
                          <tr>
                            <th>DATE</th>
                            <th>SUBSCRIBER</th>
                            <th>PLAN</th>
                            <th>AMOUNT</th>
                            <th>METHOD</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(rev?.recentTransactions ?? []).length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#5c5870" }}>
                                No transactions yet. Subscriptions will appear here as they come in.
                              </td>
                            </tr>
                          ) : (
                            (rev?.recentTransactions ?? []).map((tx: any, i: number) => (
                              <tr key={tx._id ?? i}>
                                <td style={{ color: "#5c5870", fontSize: "11px" }}>
                                  {formatRelativeTime(tx.createdAt)}
                                </td>
                                <td>
                                  <strong style={{ display: "block" }}>{tx.viewerName}</strong>
                                  <small style={{ color: "#5c5870" }}>{tx.viewerEmail}</small>
                                </td>
                                <td>
                                  <span className={`studio-plan-pill ${tx.plan === "standard_monthly" ? "standard" : tx.plan === "vip_monthly" ? "vip" : "patron"}`}>
                                    {tx.planName}
                                  </span>
                                </td>
                                <td>
                                  <strong style={{ color: "#2e553e" }}>₱{Number(tx.amount).toLocaleString()}</strong>
                                </td>
                                <td>
                                  <span className={`pay-badge ${tx.paymentMethod}`}>{tx.paymentMethod}</span>
                                </td>
                                <td>
                                  <span className={`studio-status ${tx.status === "active" ? "published" : "draft"}`}>
                                    {tx.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Most Watched Films */}
                  <section className="studio-records">
                    <div className="studio-section-heading">
                      <h2>Most Watched Films</h2>
                    </div>
                    <div className="studio-table-wrap">
                      <table className="studio-table">
                        <thead>
                          <tr>
                            <th>RANK</th>
                            <th>FILM TITLE</th>
                            <th>PAGE VIEWS</th>
                            <th>VIDEO STARTS</th>
                            <th>AUDIENCE SCORE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {films
                            .slice()
                            .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
                            .map((f, i) => (
                              <tr key={f._id}>
                                <td>
                                  <span className={`rank-badge ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "standard"}`}>
                                    #{i + 1}
                                  </span>
                                </td>
                                <td><strong>{f.title}</strong></td>
                                <td>{(f.viewCount || 0).toLocaleString()}</td>
                                <td>{(f.playCount || 0).toLocaleString()}</td>
                                <td>
                                  <strong style={{ color: "#8a6608" }}>{f.audienceScore != null ? `${f.audienceScore}%` : "—"}</strong>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </>
            );
          })()}

          {/* ========================================================= */}
          {/* BANK ACCOUNTS & AUDITS TAB (IN-HOUSE PAYMENT MERCHANT) */}
          {/* ========================================================= */}
          {activeTab === "payments" && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">REPORTS & AUDIT</p>
                  <h1>Payment Merchant & Receipt Audits</h1>
                  <p>In-house merchant gateway: Manage receiving bank accounts / e-wallets and audit subscriber payment receipts.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <a
                    href="/api/admin/payment-submissions/export.csv"
                    className="studio-secondary"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <AdminIcon name="upload" /> Export Audits CSV
                  </a>
                  <button className="studio-primary" onClick={handleOpenNewBank}>
                    <AdminIcon name="plus" /> Add Receiving Account
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="studio-stats" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: "24px" }}>
                <article>
                  <p>PENDING REVIEW</p>
                  <strong style={{ color: "#8a6608" }}>
                    {paymentSubmissions.filter((p) => p.status === "pending").length}
                  </strong>
                  <small>Awaiting receipt verification</small>
                  <span className="studio-stat-icon amber">
                    <AdminIcon name="payment" />
                  </span>
                </article>
                <article>
                  <p>VERIFIED & ACTIVE</p>
                  <strong style={{ color: "#2e553e" }}>
                    {paymentSubmissions.filter((p) => p.status === "verified").length}
                  </strong>
                  <small>Approved subscriptions</small>
                  <span className="studio-stat-icon green">
                    <AdminIcon name="published" />
                  </span>
                </article>
                <article>
                  <p>FLAGGED / REJECTED</p>
                  <strong style={{ color: "#b4234f" }}>
                    {paymentSubmissions.filter((p) => p.status === "flagged" || p.status === "rejected").length}
                  </strong>
                  <small>Discrepancies found</small>
                  <span className="studio-stat-icon red">
                    <AdminIcon name="draft" />
                  </span>
                </article>
                <article>
                  <p>AUDITED REVENUE</p>
                  <strong style={{ color: "#8a6608" }}>
                    ₱{paymentSubmissions
                      .filter((p) => p.status === "verified")
                      .reduce((acc, cur) => acc + (cur.amountPaid || 0), 0)
                      .toLocaleString()}
                  </strong>
                  <small>From verified transfers</small>
                  <span className="studio-stat-icon gold">
                    <AdminIcon name="chart" />
                  </span>
                </article>
              </div>

              {/* Section 1: Receiving Bank & E-Wallet Accounts */}
              <section className="studio-records" style={{ marginBottom: "32px" }}>
                <div className="studio-section-heading">
                  <div>
                    <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      Receiving Bank & E-Wallet Accounts
                      <span className="studio-badge" style={{ background: "rgba(64, 50, 140, 0.072)", fontSize: "11px" }}>
                        {bankAccounts.length}
                      </span>
                    </h2>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#5c5870" }}>
                      Subscribers send direct transfers to these destination accounts and upload transaction receipts.
                    </p>
                  </div>
                  <button className="studio-ghost-btn" onClick={handleOpenNewBank}>
                    <AdminIcon name="plus" /> Add Account
                  </button>
                </div>

                {bankAccounts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "36px", color: "#5c5870" }}>
                    <p>No receiving accounts configured yet.</p>
                    <button className="studio-primary" onClick={handleOpenNewBank} style={{ marginTop: "12px" }}>
                      Add GCash or Bank Account
                    </button>
                  </div>
                ) : (
                  <div className="studio-bank-grid">
                    {bankAccounts.map((b) => (
                      <div key={b._id} className="studio-bank-card">
                        <div className="studio-bank-card-header">
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: "10px",
                                height: "10px",
                                borderRadius: "50%",
                                background: b.isActive ? "#38634a" : "#ffffff",
                                boxShadow: b.isActive ? "0 0 8px #38634a" : "none",
                              }}
                            />
                            <strong style={{ fontSize: "15px", color: "#1c1733" }}>{b.providerName}</strong>
                            <span className="studio-role-pill user" style={{ fontSize: "10px", textTransform: "uppercase" }}>
                              {b.accountType.replace("_", " ")}
                            </span>
                          </div>
                          <span
                            className="studio-audit-tag"
                            style={{
                              background: b.isActive ? "rgba(56, 99, 74, 0.15)" : "rgba(64, 50, 140, 0.045)",
                              color: b.isActive ? "#2e553e" : "#5c5870",
                              fontSize: "10px",
                              padding: "2px 8px",
                            }}
                          >
                            {b.isActive ? "Active (Visible)" : "Disabled"}
                          </span>
                        </div>

                        <div className="studio-bank-card-body">
                          <div>
                            <span style={{ fontSize: "10px", color: "#5c5870", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Account Number / Mobile
                            </span>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
                              <span className="studio-bank-num">{b.accountNumber}</span>
                              <button
                                type="button"
                                className="studio-ghost-btn"
                                style={{ padding: "2px 6px", fontSize: "10px" }}
                                onClick={() => {
                                  navigator.clipboard.writeText(b.accountNumber);
                                  notify("Account number copied!");
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          </div>

                          <div>
                            <span style={{ fontSize: "10px", color: "#5c5870", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Account Name
                            </span>
                            <div className="studio-bank-holder" style={{ color: "#40328c", fontWeight: "600" }}>
                              {b.accountName}
                            </div>
                          </div>

                          {b.qrCodeUrl ? (
                            <div className="studio-bank-qr-wrap">
                              <img src={b.qrCodeUrl} alt={`${b.providerName} QR`} className="studio-bank-qr-img" />
                              <div style={{ fontSize: "11px", color: "#5c5870" }}>
                                <strong style={{ color: "#8a6608", display: "block" }}>QR Code Ready</strong>
                                <span>Scan-to-pay active for mobile users</span>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "11px", color: "#5c5870", fontStyle: "italic", padding: "4px 0" }}>
                              No QR code image uploaded
                            </div>
                          )}

                          {b.instructions && (
                            <div style={{ fontSize: "11px", color: "#3b3652", background: "rgba(64, 50, 140, 0.018)", padding: "6px 8px", borderRadius: "6px" }}>
                              {b.instructions}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: "8px", marginTop: "12px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="studio-ghost-btn"
                            style={{ fontSize: "11px" }}
                            onClick={() => handleToggleBankActive(b)}
                          >
                            {b.isActive ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="studio-ghost-btn"
                            style={{ fontSize: "11px" }}
                            onClick={() => handleOpenEditBank(b)}
                          >
                            <AdminIcon name="edit" /> Edit
                          </button>
                          <button
                            type="button"
                            className="studio-danger-btn"
                            style={{ fontSize: "11px" }}
                            onClick={() => handleDeleteBank(b._id, b.providerName)}
                          >
                            <AdminIcon name="delete" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Section 2: Subscriber Payment & Receipt Audits Queue */}
              <section className="studio-records">
                <div className="studio-section-heading">
                  <div>
                    <h2>Subscriber Payment & Receipt Audits</h2>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#5c5870" }}>
                      Automated verification cross-references expected subscription fee, checks reference syntax, and scans for reused receipts.
                    </p>
                  </div>
                </div>

                {/* Filter Tools & Search Bar */}
                <div className="studio-table-tools" style={{ padding: "0 22px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                  <div className="studio-status-filters" style={{ flexWrap: "wrap" }}>
                    {[
                      { key: "all", label: "ALL AUDITS", count: paymentSubmissions.length },
                      { key: "pending", label: "PENDING REVIEW", count: paymentSubmissions.filter((p) => p.status === "pending").length },
                      { key: "flagged", label: "FLAGGED DISCREPANCIES", count: paymentSubmissions.filter((p) => p.status === "flagged").length },
                      { key: "verified", label: "VERIFIED", count: paymentSubmissions.filter((p) => p.status === "verified").length },
                      { key: "rejected", label: "REJECTED", count: paymentSubmissions.filter((p) => p.status === "rejected").length },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`studio-status-filter ${submissionFilter === item.key ? "active" : ""}`}
                        onClick={() => setSubmissionFilter(item.key as any)}
                      >
                        <span>{item.label}</span>
                        <b>{item.count}</b>
                      </button>
                    ))}
                  </div>

                  <div className="studio-search-bar" style={{ minWidth: "260px" }}>
                    <AdminIcon name="search" />
                    <input
                      type="text"
                      placeholder="Search subscriber, ref #, or provider..."
                      value={submissionSearch}
                      onChange={(e) => setSubmissionSearch(e.target.value)}
                    />
                    {submissionSearch && (
                      <button type="button" className="studio-search-clear" onClick={() => setSubmissionSearch("")}>✕</button>
                    )}
                  </div>
                </div>

                {/* Submissions Table */}
                <div className="studio-table-wrap">
                  <table className="studio-table" style={{ width: "100%", tableLayout: "auto" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "24%" }}>SUBSCRIBER</th>
                        <th style={{ width: "16%" }}>PLAN & FEE</th>
                        <th style={{ width: "22%" }}>RECEIVING ACCOUNT & REF</th>
                        <th style={{ width: "18%" }}>SYSTEM AUDIT</th>
                        <th style={{ width: "10%" }}>PROOF RECEIPT</th>
                        <th style={{ width: "10%", textAlign: "right", paddingRight: "20px" }}>DECISION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmissions.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#5c5870" }}>
                            No payment submissions matching this filter.
                          </td>
                        </tr>
                      ) : (
                        filteredSubmissions.map((sub) => {
                          const meta = sub.receiptMetadata || {};
                          const providerLower = sub.bankProvider.toLowerCase();
                          const providerClass = providerLower.includes("gcash")
                            ? "gcash"
                            : providerLower.includes("maya")
                            ? "maya"
                            : providerLower.includes("bdo") || providerLower.includes("bank")
                            ? "card"
                            : "grabpay";

                          return (
                            <tr key={sub._id}>
                              {/* 1. SUBSCRIBER */}
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <div
                                    style={{
                                      width: "34px",
                                      height: "34px",
                                      borderRadius: "50%",
                                      background: "linear-gradient(135deg, rgba(232, 191, 69, 0.25) 0%, rgba(64, 50, 140, 0.045) 100%)",
                                      border: "1px solid rgba(232, 191, 69, 0.3)",
                                      color: "#8a6608",
                                      fontWeight: 800,
                                      fontSize: "13px",
                                      display: "grid",
                                      placeItems: "center",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {sub.subscriberName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <strong style={{ display: "block", color: "#1c1733", fontSize: "13px" }}>
                                      {sub.subscriberName}
                                    </strong>
                                    <small style={{ color: "#5c5870", display: "block", fontSize: "11px" }}>
                                      {sub.subscriberEmail}
                                    </small>
                                    <span style={{ fontSize: "10px", color: "#5c5870" }}>
                                      {sub.subscriberPhone} • {formatRelativeTime(sub.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* 2. PLAN & FEE */}
                              <td>
                                <span
                                  className={`studio-plan-pill ${
                                    sub.plan.includes("standard") ? "standard" : sub.plan.includes("vip") ? "vip" : "patron"
                                  }`}
                                  style={{ marginBottom: "4px", display: "inline-block", fontSize: "10px" }}
                                >
                                  {sub.planName}
                                </span>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                                  <strong style={{ color: "#2e553e", fontSize: "14px", fontWeight: 800 }}>
                                    ₱{sub.amountPaid.toLocaleString()}
                                  </strong>
                                  <small style={{ color: "#5c5870", fontSize: "10px" }}>
                                    exp. ₱{sub.amountExpected.toLocaleString()}
                                  </small>
                                </div>
                                {meta.amountMatched ? (
                                  <span style={{ fontSize: "10px", color: "#2e553e", display: "block", fontWeight: 600 }}>
                                    ✓ Exact Fee Match
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "10px", color: "#b4234f", display: "block", fontWeight: 600 }}>
                                    ⚠ Amount Mismatch
                                  </span>
                                )}
                              </td>

                              {/* 3. RECEIVING ACCOUNT & REF */}
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                                  <span className={`pay-badge ${providerClass}`}>{sub.bankProvider}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <code
                                    style={{
                                      fontSize: "11px",
                                      background: "rgba(64, 50, 140, 0.054)",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                      color: "#1c1733",
                                      fontFamily: "monospace",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {sub.referenceNumber}
                                  </code>
                                  <button
                                    type="button"
                                    className="studio-ghost-btn"
                                    style={{ padding: "1px 5px", fontSize: "10px" }}
                                    title="Copy reference code"
                                    onClick={() => {
                                      navigator.clipboard.writeText(sub.referenceNumber);
                                      notify("Reference number copied!");
                                    }}
                                  >
                                    Copy
                                  </button>
                                </div>
                                {meta.referenceValid ? (
                                  <span style={{ fontSize: "10px", color: "#2e553e", display: "block", marginTop: "2px" }}>
                                    ✓ Format Syntax Valid
                                  </span>
                                ) : (
                                  <span style={{ fontSize: "10px", color: "#8a6608", display: "block", marginTop: "2px" }}>
                                    ⚠ Unusual Ref Format
                                  </span>
                                )}
                              </td>

                              {/* 4. SYSTEM AUDIT SCORE */}
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                                  <span
                                    className={`studio-score-badge ${
                                      (meta.heuristicScore || 0) >= 80 ? "high" : "low"
                                    }`}
                                  >
                                    {meta.heuristicScore || 0}% Score
                                  </span>
                                  <span className={`studio-audit-tag ${sub.status}`}>
                                    {sub.status}
                                  </span>
                                </div>
                                <span style={{ fontSize: "11px", color: meta.amountMatched && meta.referenceValid ? "#3b3652" : "#40328c" }}>
                                  {meta.amountMatched && meta.referenceValid ? "✓ Verification Passed" : "⚠ Discrepancy Found"}
                                </span>
                              </td>

                              {/* 5. PROOF RECEIPT */}
                              <td>
                                <button
                                  type="button"
                                  className="studio-receipt-chip"
                                  onClick={() => handleOpenInspectReceipt(sub)}
                                  title="Inspect uploaded payment proof"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                  </svg>
                                  <span>View Proof</span>
                                </button>
                              </td>

                              {/* 6. DECISION ACTIONS */}
                              <td style={{ textAlign: "right", paddingRight: "20px" }}>
                                <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                                  <button
                                    type="button"
                                    className="studio-ghost-btn"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    onClick={() => handleOpenInspectReceipt(sub)}
                                  >
                                    Inspect
                                  </button>
                                  {(sub.status === "pending" || sub.status === "flagged") && (
                                    <>
                                      <button
                                        type="button"
                                        className="studio-primary"
                                        style={{ fontSize: "11px", padding: "4px 10px", background: "#38634a" }}
                                        onClick={() => handleApprovePayment(sub)}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        className="studio-danger-btn"
                                        style={{ fontSize: "11px", padding: "4px 8px" }}
                                        onClick={() => {
                                          setRejectingSubId(sub._id);
                                          setRejectDialogOpen(true);
                                        }}
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {sub.status === "verified" && (
                                    <span style={{ fontSize: "11px", color: "#2e553e", fontWeight: 700 }}>
                                      ✓ Active
                                    </span>
                                  )}
                                  {sub.status === "rejected" && (
                                    <span style={{ fontSize: "11px", color: "#b4234f", fontWeight: 700 }}>
                                      ✕ Rejected
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ========================================================= */}
          {/* AUDIT LOGS TAB */}
          {/* ========================================================= */}
          {activeTab === "logs" && <AdminActivityLog />}

          {/* ========================================================= */}
          {/* ADMINISTRATORS TAB (SUPER ADMIN ONLY) */}
          {/* ========================================================= */}
          {activeTab === "users" && isSuperAdmin && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">SYSTEM ACCESS & ROLES</p>
                  <h1>System Access & Users</h1>
                  <p>Control platform permissions across three roles: Super Admin, Admin, and User.</p>
                </div>
                <button className="studio-primary" onClick={() => setUserDialogOpen(true)}>
                  <AdminIcon name="plus" /> Invite administrators
                </button>
              </div>

              <div className="studio-stats" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: "20px" }}>
                <article>
                  <p>SUPER ADMINS</p>
                  <strong>{users.filter((u) => u.role === "super_admin").length}</strong>
                  <small>Full system governance</small>
                  <span className="studio-stat-icon red">
                    <AdminIcon name="settings" />
                  </span>
                </article>
                <article>
                  <p>ADMINISTRATORS</p>
                  <strong>{users.filter((u) => u.role === "admin").length}</strong>
                  <small>Content management access</small>
                  <span className="studio-stat-icon amber">
                    <AdminIcon name="users" />
                  </span>
                </article>
                <article>
                  <p>REGISTERED USERS</p>
                  <strong>{users.filter((u) => u.role === "user").length}</strong>
                  <small>Platform viewers & members</small>
                  <span className="studio-stat-icon blue">
                    <AdminIcon name="published" />
                  </span>
                </article>
              </div>

              <section className="studio-records">
                <div className="studio-table-wrap">
                  <table className="studio-table">
                    <thead>
                      <tr>
                        <th>USER</th>
                        <th>EMAIL</th>
                        <th>ROLE</th>
                        <th>STATUS</th>
                        <th style={{ textAlign: "right", paddingRight: "24px" }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="studio-empty">
                            No users registered yet.
                          </td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u._id}>
                            <td>
                              <div className="studio-film">
                                <div
                                  className="studio-avatar"
                                  style={{
                                    width: "34px",
                                    height: "34px",
                                    fontSize: "13px",
                                    background:
                                      u.role === "super_admin"
                                        ? "linear-gradient(135deg, #40328c, #40328c)"
                                        : u.role === "admin"
                                        ? "linear-gradient(135deg, #8a6608, #8a6608)"
                                        : "linear-gradient(135deg, #40328c, #40328c)",
                                  }}
                                >
                                  {u.name.charAt(0).toUpperCase()}
                                </div>
                                <span>
                                  <strong>{u.name}</strong>
                                  <small>ID: {u._id.slice(-6)}</small>
                                </span>
                              </div>
                            </td>
                            <td>{u.email}</td>
                            <td>
                              <span className={`role-badge ${u.role}`}>
                                {u.role === "super_admin"
                                  ? "Super Admin"
                                  : u.role === "admin"
                                  ? "Admin"
                                  : u.role === "user"
                                  ? "User"
                                  : u.role}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`studio-status ${u.status === "active" ? "published" : u.status === "invited" ? "pending" : "archived"}`}
                              >
                                <i /> {u.status === "invited" ? "Invited · awaiting setup" : u.status}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", paddingRight: "24px" }}>
                              {u.status === "invited" ? (
                                <span className="studio-row-actions">
                                  <button type="button" onClick={() => handleInviteAction(u._id, "resend")}>Resend invite</button>
                                  <button type="button" className="is-danger" onClick={() => showConfirm("Revoke invitation", `Revoke the invitation for ${u.email}? Their link will stop working.`, () => handleInviteAction(u._id, "revoke"))}>Revoke</button>
                                </span>
                              ) : u.role !== "super_admin" && (
                                <button
                                  className="studio-cancel"
                                  style={{
                                    fontSize: "11.5px",
                                    padding: "6px 12px",
                                    color: u.status === "active" ? "#40328c" : "#2e553e",
                                  }}
                                  onClick={() => handleToggleUserStatus(u._id, u.status)}
                                >
                                  {u.status === "active" ? "Suspend Account" : "Activate Account"}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ========================================================= */}
          {/* PLATFORM SETTINGS TAB (SUPER ADMIN ONLY) */}
          {/* ========================================================= */}
          {activeTab === "settings" && isSuperAdmin && (
            <>
              <div className="studio-page-heading">
                <div>
                  <p className="admin-kicker">CONFIGURATION</p>
                  <h1>Platform Settings</h1>
                  <p>CinePass plan names, prices, and perks.</p>
                </div>
              </div>

              <section className="studio-records">
                <div className="studio-section-heading">
                  <div>
                    <p className="admin-kicker">CINEPASS</p>
                    <h2>Subscription plans & pricing</h2>
                  </div>
                </div>
                <AdminPlansEditor notify={notify} />
              </section>
            </>
          )}
        </section>
      </main>

      {/* ========================================================= */}
      {/* FILM EDITOR MODAL */}
      {/* ========================================================= */}
      {filmEditorOpen && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog" style={{ width: "min(820px, 100%)" }}>
            <div className="studio-section-heading">
              <div>
                <p className="admin-kicker">CINEMA ARCHIVE</p>
                <h2>{editingFilm ? `Edit "${editingFilm.title}"` : "Add New Film Record"}</h2>
              </div>
              <button className="studio-cancel" onClick={() => setFilmEditorOpen(false)}>
                ✕ Close
              </button>
            </div>

            <form
              className="studio-film-form"
              onSubmit={handleSaveFilm}
              onInvalidCapture={(event) => {
                // Never fail silently: reveal the field the browser rejected and say which one.
                const field = event.target as HTMLInputElement;
                const details = field.closest("details");
                if (details) details.open = true;
                field.scrollIntoView({ block: "center" });
                const label = field.closest("label")?.firstChild?.textContent?.trim() || field.closest(".studio-art")?.querySelector(".studio-art-label")?.textContent || "A field";
                notify(`${label}: ${field.validationMessage}`, "error");
              }}
            >
              <div className="studio-form-grid">
                {/* 1. Basic Metadata */}
                <div className="span-2" style={{ borderBottom: "1px solid rgba(64, 50, 140, 0.102)", paddingBottom: "6px", marginTop: "4px" }}>
                  <p className="admin-kicker" style={{ margin: 0 }}>1. BASIC METADATA</p>
                </div>

                <label>
                  Film Title *
                  <input
                    type="text"
                    required
                    value={filmForm.title}
                    onChange={(e) => setFilmForm({ ...filmForm, title: e.target.value })}
                  />
                </label>

                <label>
                  URL Slug
                  <input
                    type="text"
                    value={filmForm.slug}
                    onChange={(e) => setFilmForm({ ...filmForm, slug: e.target.value })}
                  />
                </label>

                <label className="span-2">
                  Content type
                  <select
                    value={filmForm.contentType}
                    onChange={(e) => {
                      const contentType = e.target.value === "series" ? "series" : "film";
                      setFilmForm({ ...filmForm, contentType });
                      if (contentType === "series" && seasonDrafts.length === 0) setSeasonDrafts(seasonDraftsFromApi([{ episodes: [{}] }]));
                    }}
                  >
                    <option value="film">Film (single feature)</option>
                    <option value="series">Series (seasons & episodes)</option>
                  </select>
                </label>

                <label className="span-2">
                  Tagline
                  <input
                    type="text"
                    value={filmForm.tagline}
                    onChange={(e) => setFilmForm({ ...filmForm, tagline: e.target.value })}
                  />
                </label>

                <label className="span-2">
                  Synopsis
                  <textarea
                    rows={3}
                    value={filmForm.synopsis}
                    onChange={(e) => setFilmForm({ ...filmForm, synopsis: e.target.value })}
                  />
                </label>

                {/* 2. Classification & Production */}
                <div className="span-2" style={{ borderBottom: "1px solid rgba(64, 50, 140, 0.102)", paddingBottom: "6px", marginTop: "12px" }}>
                  <p className="admin-kicker" style={{ margin: 0 }}>2. CLASSIFICATION & CREDITS</p>
                </div>

                <label>
                  Release Year
                  <input
                    type="number"
                    value={filmForm.releaseYear}
                    onChange={(e) => setFilmForm({ ...filmForm, releaseYear: e.target.value })}
                  />
                </label>

                <label>
                  Runtime (minutes)
                  <input
                    type="number"
                    value={filmForm.runtimeMinutes}
                    onChange={(e) => setFilmForm({ ...filmForm, runtimeMinutes: e.target.value })}
                  />
                </label>

                <label>
                  Rating (stars)
                  <select
                    value={filmForm.audienceScore === "" ? "" : String(Math.round((Number(filmForm.audienceScore) / 20) * 2) / 2)}
                    onChange={(e) => setFilmForm({ ...filmForm, audienceScore: e.target.value === "" ? "" : String(Math.round(Number(e.target.value) * 20)) })}
                  >
                    <option value="">Not rated yet</option>
                    {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((stars) => (
                      <option key={stars} value={String(stars)}>{"★".repeat(Math.floor(stars))}{stars % 1 ? "½" : ""} {stars.toFixed(1)} / 5</option>
                    ))}
                  </select>
                </label>

                {/* Film Categories Chip Selector */}
                <div className="span-2" style={{ display: "grid", gap: "8px" }}>
                  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Film Categories (Click to select)</span>
                    <small style={{ color: "#5c5870" }}>Assign this film to cinema collections & showcases</small>
                  </label>
                  <div className="studio-chip-cloud">
                    {categories.map((cat) => {
                      const selected = (filmForm.categories || "")
                        .split(",")
                        .map((s) => s.trim().toLowerCase())
                        .includes(cat.slug.toLowerCase());
                      return (
                        <button
                          key={cat._id}
                          type="button"
                          className={`studio-chip ${selected ? "selected" : ""}`}
                          onClick={() => {
                            const parts = (filmForm.categories || "")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const exists = parts.some((p) => p.toLowerCase() === cat.slug.toLowerCase());
                            const next = exists
                              ? parts.filter((p) => p.toLowerCase() !== cat.slug.toLowerCase())
                              : [...parts, cat.slug];
                            setFilmForm({ ...filmForm, categories: next.join(", ") });
                          }}
                        >
                          {selected && <span className="chip-check">✓</span>}
                          <span>{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    placeholder="Categories e.g. films, award-winning, sb-category"
                    value={filmForm.categories}
                    onChange={(e) => setFilmForm({ ...filmForm, categories: e.target.value })}
                    style={{ fontSize: "12px", padding: "8px 12px" }}
                  />
                </div>

                {/* Film Genres Chip Selector */}
                <div className="span-2" style={{ display: "grid", gap: "8px" }}>
                  <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Film Genres (Click to select)</span>
                    <small style={{ color: "#5c5870" }}>Cinematic genre tags</small>
                  </label>
                  <div className="studio-chip-cloud">
                    {[
                      "Drama",
                      "Romance",
                      "Comedy",
                      "Thriller",
                      "Action",
                      "Documentary",
                      "Mystery",
                      "Horror",
                      "Indie",
                      "Short Film",
                      "Family",
                      "Sci-Fi",
                      "Animation",
                    ].map((genre) => {
                      const selected = (filmForm.genres || "")
                        .split(",")
                        .map((s) => s.trim().toLowerCase())
                        .includes(genre.toLowerCase());
                      return (
                        <button
                          key={genre}
                          type="button"
                          className={`studio-chip ${selected ? "selected" : ""}`}
                          onClick={() => {
                            const parts = (filmForm.genres || "")
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const exists = parts.some((p) => p.toLowerCase() === genre.toLowerCase());
                            const next = exists
                              ? parts.filter((p) => p.toLowerCase() !== genre.toLowerCase())
                              : [...parts, genre];
                            setFilmForm({ ...filmForm, genres: next.join(", ") });
                          }}
                        >
                          {selected && <span className="chip-check">✓</span>}
                          <span>{genre}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    placeholder="Genres e.g. Drama, Romance, Thriller"
                    value={filmForm.genres}
                    onChange={(e) => setFilmForm({ ...filmForm, genres: e.target.value })}
                    style={{ fontSize: "12px", padding: "8px 12px" }}
                  />
                </div>

                <label className="span-2">
                  Director Names (comma-separated)
                  <input
                    type="text"
                    value={filmForm.directorNames}
                    onChange={(e) => setFilmForm({ ...filmForm, directorNames: e.target.value })}
                  />
                </label>

                {/* 3. Streaming & Media */}
                <div className="span-2" style={{ borderBottom: "1px solid rgba(64, 50, 140, 0.102)", paddingBottom: "6px", marginTop: "12px" }}>
                  <p className="admin-kicker" style={{ margin: 0 }}>3. STREAMING & VIDEO PLAYBACK</p>
                </div>

                {filmForm.contentType === "series" && (
                  <div className="span-2 studio-media-panel">
                    <div className="studio-media-panel-head">
                      <div className="studio-media-panel-title">
                        <strong>Seasons & Episodes</strong>
                        <small>Add each season and its episodes. The full film video below is not used for series.</small>
                      </div>
                    </div>
                    <AdminSeriesEditor
                      seasons={seasonDrafts}
                      onChange={setSeasonDrafts}
                      onUploadVideo={(file) => handleUploadFile("film", file)}
                    />
                  </div>
                )}

                {/* Full Film Video (Upload or Embed) */}
                <div className="span-2 studio-media-panel">
                  <div className="studio-media-panel-head">
                    <div className="studio-media-panel-title">
                      <strong>Full Film Video Stream</strong>
                      <small>Upload a video master file (MP4/WebM/MOV) or connect an external streaming / embed link.</small>
                    </div>
                    <div className="studio-seg-control">
                      <button
                        type="button"
                        className={`studio-seg-btn ${videoSourceMode === "upload" ? "active" : ""}`}
                        onClick={() => setVideoSourceMode("upload")}
                      >
                        <AdminIcon name="upload" /> Upload Video File
                      </button>
                      <button
                        type="button"
                        className={`studio-seg-btn ${videoSourceMode === "embed" ? "active" : ""}`}
                        onClick={() => setVideoSourceMode("embed")}
                      >
                        <AdminIcon name="film" /> Embed / URL Stream
                      </button>
                    </div>
                  </div>

                  {videoSourceMode === "upload" ? (
                    <div>
                      {filmForm.videoUrl && (filmForm.videoUrl.startsWith("/uploads/") || filmForm.videoProvider === "direct") ? (
                        <div style={{ display: "grid", gap: "12px" }}>
                          <div className="studio-media-loaded">
                            <div className="studio-media-loaded-info">
                              <span className="studio-media-loaded-check">✓</span>
                              <div className="studio-media-loaded-text">
                                <strong>Film Video Attached & Stream-Ready</strong>
                                <small title={filmForm.videoUrl}>{filmForm.videoUrl}</small>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
                              <label className="studio-button-ghost" style={{ cursor: "pointer", fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <AdminIcon name="upload" /> Replace File
                                <input
                                  type="file"
                                  accept="video/mp4,video/webm,video/quicktime"
                                  style={{ display: "none" }}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const url = await handleUploadFile("film", file);
                                      if (url) {
                                        setFilmForm((f) => ({ ...f, videoUrl: url, videoProvider: "direct" }));
                                      }
                                    }
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="studio-delete-button"
                                onClick={() => setFilmForm((f) => ({ ...f, videoUrl: "" }))}
                              >
                                <AdminIcon name="delete" /> Remove
                              </button>
                            </div>
                          </div>
                          {filmForm.videoUrl.startsWith("/uploads/drm/") ? (
                            <p className="studio-protect-note is-on">Protected and encrypted. Open the film page as a viewer to watch it.</p>
                          ) : <video
                            src={filmForm.videoUrl}
                            controls
                            preload="metadata"
                            style={{ width: "100%", maxHeight: "220px", borderRadius: "8px", background: "#e8e6ef", border: "1px solid rgba(64, 50, 140, 0.136)" }}
                          />}
                        </div>
                      ) : (
                        <label className={`studio-upload-bar ${uploadingKind === "film" ? "busy" : ""}`}>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime"
                            disabled={uploadingKind === "film"}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const url = await handleUploadFile("film", file);
                                if (url) {
                                  setFilmForm((f) => ({ ...f, videoUrl: url, videoProvider: "direct" }));
                                }
                              }
                            }}
                          />
                          <div className="studio-upload-bar-left">
                            <div className="studio-upload-bar-icon">
                              <AdminIcon name="film" />
                            </div>
                            <div className="studio-upload-bar-text">
                              <strong>{uploadingKind === "film" ? "Uploading Film Master… Please wait…" : "Click to Select Film Video File"}</strong>
                              <small>Supports MP4, WebM, QuickTime MOV up to 2 GB for streaming playback</small>
                            </div>
                          </div>
                          <span className="studio-upload-bar-btn">
                            <AdminIcon name="upload" /> {uploadingKind === "film" ? "Uploading…" : "Browse File"}
                          </span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(180px, 1fr)", gap: "12px" }}>
                      <label>
                        Video Stream URL / Embed Link
                        <input
                          type="text"
                          value={filmForm.videoUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            // Pick the provider from the link; "drm" is only ever set by the automatic encryption.
                            let provider = filmForm.videoProvider === "drm" ? "direct" : filmForm.videoProvider;
                            if (/^\/uploads\/drm\//.test(val)) provider = "drm";
                            else if (val.includes("youtube.com") || val.includes("youtu.be")) provider = "youtube";
                            else if (val.includes("vimeo.com")) provider = "vimeo";
                            else if (/\.m3u8(\?|$)/i.test(val)) provider = "hls";
                            else if (provider !== "embed" && provider !== "hls") provider = "direct";
                            setFilmForm({ ...filmForm, videoUrl: val, videoProvider: provider });
                          }}
                          placeholder="https://.../film.mp4 or YouTube link or iframe"
                        />
                      </label>
                      <label>
                        Video Provider
                        <select
                          value={filmForm.videoProvider}
                          onChange={(e) => setFilmForm({ ...filmForm, videoProvider: e.target.value as any })}
                        >
                          {filmForm.videoProvider === "drm" && <option value="drm">Protected (encrypted automatically)</option>}
                          <option value="direct">Direct File (MP4/WebM)</option>
                          <option value="youtube">YouTube Embed</option>
                          <option value="vimeo">Vimeo Embed</option>
                          <option value="hls">HLS Stream (.m3u8)</option>
                          <option value="embed">Generic Embed Iframe</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                {filmForm.videoProvider === "drm" ? (
                  <p className="span-2 studio-protect-note is-on">Protected. This video was encrypted automatically and can only be played by signed-in CinePass viewers.</p>
                ) : filmForm.videoUrl.startsWith("/uploads/") ? (
                  <p className="span-2 studio-protect-note">This uploaded video will be encrypted automatically about a minute after you save.</p>
                ) : null}

                {/* Teaser Video (Upload or Embed) */}
                <div className="span-2 studio-media-panel">
                  <div className="studio-media-panel-head">
                    <div className="studio-media-panel-title">
                      <strong>Teaser / Trailer Video</strong>
                      <small>Preview clip showcased in hero banners, film cards, and modal previews.</small>
                    </div>
                    <div className="studio-seg-control">
                      <button
                        type="button"
                        className={`studio-seg-btn ${teaserSourceMode === "upload" ? "active" : ""}`}
                        onClick={() => setTeaserSourceMode("upload")}
                      >
                        <AdminIcon name="upload" /> Upload Teaser File
                      </button>
                      <button
                        type="button"
                        className={`studio-seg-btn ${teaserSourceMode === "embed" ? "active" : ""}`}
                        onClick={() => setTeaserSourceMode("embed")}
                      >
                        <AdminIcon name="film" /> Embed / URL Stream
                      </button>
                    </div>
                  </div>

                  {teaserSourceMode === "upload" ? (
                    <div>
                      {filmForm.teaserUrl && (filmForm.teaserUrl.startsWith("/uploads/") || filmForm.teaserProvider === "direct") ? (
                        <div style={{ display: "grid", gap: "12px" }}>
                          <div className="studio-media-loaded">
                            <div className="studio-media-loaded-info">
                              <span className="studio-media-loaded-check">✓</span>
                              <div className="studio-media-loaded-text">
                                <strong>Teaser Clip Attached & Stream-Ready</strong>
                                <small title={filmForm.teaserUrl}>{filmForm.teaserUrl}</small>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
                              <label className="studio-button-ghost" style={{ cursor: "pointer", fontSize: "12px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                <AdminIcon name="upload" /> Replace Clip
                                <input
                                  type="file"
                                  accept="video/mp4,video/webm"
                                  style={{ display: "none" }}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const url = await handleUploadFile("teaser", file);
                                      if (url) setFilmForm((f) => ({ ...f, teaserUrl: url, teaserProvider: "direct" }));
                                    }
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="studio-delete-button"
                                onClick={() => setFilmForm((f) => ({ ...f, teaserUrl: "" }))}
                              >
                                <AdminIcon name="delete" /> Remove
                              </button>
                            </div>
                          </div>
                          {filmForm.teaserUrl.startsWith("/uploads/drm/") ? (
                            <p className="studio-protect-note is-on">Protected and encrypted. Open the film page as a viewer to watch it.</p>
                          ) : <video
                            src={filmForm.teaserUrl}
                            controls
                            preload="metadata"
                            style={{ width: "100%", maxHeight: "180px", borderRadius: "8px", background: "#e8e6ef", border: "1px solid rgba(64, 50, 140, 0.136)" }}
                          />}
                        </div>
                      ) : (
                        <label className={`studio-upload-bar ${uploadingKind === "teaser" ? "busy" : ""}`}>
                          <input
                            type="file"
                            accept="video/mp4,video/webm"
                            disabled={uploadingKind === "teaser"}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const url = await handleUploadFile("teaser", file);
                                if (url) setFilmForm((f) => ({ ...f, teaserUrl: url, teaserProvider: "direct" }));
                              }
                            }}
                          />
                          <div className="studio-upload-bar-left">
                            <div className="studio-upload-bar-icon">
                              <AdminIcon name="film" />
                            </div>
                            <div className="studio-upload-bar-text">
                              <strong>{uploadingKind === "teaser" ? "Uploading Teaser… Please wait…" : "Click to Select Teaser / Trailer File"}</strong>
                              <small>Supports MP4, WebM up to 500 MB for instant streaming preview</small>
                            </div>
                          </div>
                          <span className="studio-upload-bar-btn">
                            <AdminIcon name="upload" /> {uploadingKind === "teaser" ? "Uploading…" : "Browse File"}
                          </span>
                        </label>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(180px, 1fr)", gap: "12px" }}>
                      <label>
                        Teaser Video URL / Embed Link
                        <input
                          type="text"
                          value={filmForm.teaserUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            let provider = filmForm.teaserProvider;
                            if (val.includes("youtube.com") || val.includes("youtu.be")) provider = "youtube";
                            else if (val.includes("vimeo.com")) provider = "vimeo";
                            setFilmForm({ ...filmForm, teaserUrl: val, teaserProvider: provider });
                          }}
                          placeholder="https://.../teaser.mp4 or YouTube trailer link"
                        />
                      </label>
                      <label>
                        Teaser Provider
                        <select
                          value={filmForm.teaserProvider}
                          onChange={(e) => setFilmForm({ ...filmForm, teaserProvider: e.target.value as any })}
                        >
                          <option value="direct">Direct Video (MP4)</option>
                          <option value="youtube">YouTube Trailer</option>
                          <option value="vimeo">Vimeo Trailer</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                {/* Artwork Section (Poster and Backdrop) */}
                <div className="span-2 studio-artwork">
                  {([
                    { kind: "poster", label: "Poster", hint: "Portrait 2:3 · JPG, PNG, or WebP", key: "posterUrl" },
                    { kind: "backdrop", label: "Backdrop banner", hint: "Landscape 16:9 · JPG, PNG, or WebP", key: "backdropUrl" },
                  ] as const).map((art) => {
                    const value = filmForm[art.key];
                    return (
                      <div key={art.kind} className={`studio-art studio-art-${art.kind}`}>
                        <div className="studio-art-head">
                          <span className="studio-art-label">{art.label}</span>
                          <small>{art.hint}</small>
                        </div>
                        <div className={`studio-art-preview${value ? " has-image" : ""}`}>
                          {value ? <img src={value} alt={`${art.label} preview`} /> : <span>No {art.label.toLowerCase()} yet</span>}
                          {uploadingKind === art.kind && <span className="studio-art-busy">Uploading…</span>}
                        </div>
                        <div className="studio-art-actions">
                          <label className="studio-art-upload">
                            <AdminIcon name="upload" /> {value ? "Replace image" : "Upload image"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={uploadingKind !== null}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) {
                                  const url = await handleUploadFile(art.kind, file);
                                  if (url) setFilmForm((f) => ({ ...f, [art.key]: url }));
                                }
                              }}
                            />
                          </label>
                          {value && <button type="button" className="studio-art-remove" onClick={() => setFilmForm((f) => ({ ...f, [art.key]: "" }))}>Remove</button>}
                        </div>
                        <details className="studio-art-link">
                          <summary>Paste a link instead</summary>
                          <input type="text" inputMode="url" value={value} placeholder="https://…" onChange={(e) => setFilmForm({ ...filmForm, [art.key]: e.target.value })} />
                        </details>
                      </div>
                    );
                  })}
                </div>

                {/* 4. Cast & Recognition */}
                <div className="span-2" style={{ borderBottom: "1px solid rgba(64, 50, 140, 0.102)", paddingBottom: "6px", marginTop: "12px" }}>
                  <p className="admin-kicker" style={{ margin: 0 }}>4. CAST & RECOGNITION</p>
                </div>

                <label className="span-2">
                  Cast Members (Name | Character | Photo URL)
                  <textarea
                    rows={2}
                    value={filmForm.castRaw}
                    onChange={(e) => setFilmForm({ ...filmForm, castRaw: e.target.value })}
                    placeholder="Bea Alonzo | Elena | https://..."
                  />
                </label>

                <label className="span-2">
                  Awards (Award Name | Organization | Year | win/nomination/official_selection | Category)
                  <textarea
                    rows={2}
                    value={filmForm.awardsRaw}
                    onChange={(e) => setFilmForm({ ...filmForm, awardsRaw: e.target.value })}
                    placeholder="Best Picture | QCinema | 2024 | win | Asian Next Wave"
                  />
                </label>
              </div>

              <div className="studio-form-actions">
                <button type="button" className="studio-cancel" onClick={() => setFilmEditorOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="studio-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save Film Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CATEGORY DIALOG */}
      {/* ========================================================= */}
      {categoryDialogOpen && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog">
            <div className="studio-section-heading">
              <h2>{editingCategory ? "Edit Category" : "New Category"}</h2>
              <button className="studio-cancel" onClick={() => setCategoryDialogOpen(false)}>
                ✕
              </button>
            </div>
            <form className="studio-simple-form" onSubmit={handleSaveCategory}>
              <label>
                Name *
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Student Cinema"
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                />
              </label>
              <div className="studio-dialog-actions">
                <button type="button" className="studio-cancel" onClick={() => setCategoryDialogOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="studio-primary">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ANNOUNCEMENT DIALOG */}
      {/* ========================================================= */}
      {annDialogOpen && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog">
            <div className="studio-section-heading">
              <h2>New Announcement</h2>
              <button className="studio-cancel" onClick={() => setAnnDialogOpen(false)}>
                ✕
              </button>
            </div>
            <form className="studio-simple-form" onSubmit={handleSaveAnnouncement}>
              <label>
                Title *
                <input
                  type="text"
                  required
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                />
              </label>
              <label>
                Message *
                <textarea
                  rows={3}
                  required
                  value={annMessage}
                  onChange={(e) => setAnnMessage(e.target.value)}
                />
              </label>
              <label>
                Status
                <select value={annStatus} onChange={(e) => setAnnStatus(e.target.value as any)}>
                  <option value="published">Publish Immediately</option>
                  <option value="draft">Save as Draft</option>
                </select>
              </label>
              <div className="studio-dialog-actions">
                <button type="button" className="studio-cancel" onClick={() => setAnnDialogOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="studio-primary">
                  Publish Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* USER DIALOG (SUPER ADMIN ONLY) */}
      {/* ========================================================= */}
      {userDialogOpen && isSuperAdmin && (
        <AdminInviteDialog onClose={() => setUserDialogOpen(false)} onDone={loadAll} notify={notify} />
      )}

      {/* ========================================================= */}
      {/* BANK ACCOUNT DIALOG */}
      {/* ========================================================= */}
      {bankDialogOpen && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog" style={{ width: "min(640px, 100%)" }}>
            <div className="studio-section-heading">
              <div>
                <p className="admin-kicker">PAYMENT MERCHANT</p>
                <h2>{editingBank ? `Edit ${editingBank.providerName} Account` : "Add Receiving Account"}</h2>
              </div>
              <button className="studio-cancel" onClick={() => setBankDialogOpen(false)}>
                ✕ Close
              </button>
            </div>

            <form className="studio-simple-form" onSubmit={handleSaveBank}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <label>
                  Provider Name *
                  <select
                    value={bankForm.providerName}
                    onChange={(e) => setBankForm((f) => ({ ...f, providerName: e.target.value }))}
                  >
                    <option value="GCash">GCash</option>
                    <option value="Maya">Maya</option>
                    <option value="BDO Unibank">BDO Unibank</option>
                    <option value="BPI">BPI (Bank of the Philippine Islands)</option>
                    <option value="UnionBank">UnionBank</option>
                    <option value="RCBC">RCBC</option>
                    <option value="Landbank">Landbank</option>
                    <option value="QR Ph">QR Ph (National QR)</option>
                    <option value="Other">Other Bank / E-Wallet</option>
                  </select>
                </label>

                <label>
                  Account Type *
                  <select
                    value={bankForm.accountType}
                    onChange={(e) => setBankForm((f) => ({ ...f, accountType: e.target.value as any }))}
                  >
                    <option value="ewallet">E-Wallet (GCash, Maya)</option>
                    <option value="bank_transfer">Bank Transfer (BDO, BPI, etc.)</option>
                    <option value="qr_ph">QR Ph National Standard</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <label>
                  Account Holder Name *
                  <input
                    type="text"
                    required
                    placeholder="e.g. SINESARILI CINEMA / JUAN DELA CRUZ"
                    value={bankForm.accountName}
                    onChange={(e) => setBankForm((f) => ({ ...f, accountName: e.target.value }))}
                  />
                </label>

                <label>
                  Account / Mobile Number *
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0917 123 4567 or 0012 3456 7890"
                    value={bankForm.accountNumber}
                    onChange={(e) => setBankForm((f) => ({ ...f, accountNumber: e.target.value }))}
                  />
                </label>
              </div>

              <label>
                QR Code Image (Scan to Pay)
                <small>Upload official payment QR code image for instant scan by subscribers</small>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "4px" }}>
                  <input
                    type="text"
                    placeholder="/uploads/... or paste QR code image URL"
                    value={bankForm.qrCodeUrl}
                    onChange={(e) => setBankForm((f) => ({ ...f, qrCodeUrl: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <label
                    className="studio-secondary"
                    style={{
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <AdminIcon name="upload" />
                    <span>{qrUploadBusy ? "Uploading..." : "Upload QR"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setQrUploadBusy(true);
                        const url = await handleUploadFile("qrcode", file);
                        setQrUploadBusy(false);
                        if (url) {
                          setBankForm((f) => ({ ...f, qrCodeUrl: url }));
                        }
                      }}
                    />
                  </label>
                </div>
                {bankForm.qrCodeUrl && (
                  <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <img
                      src={bankForm.qrCodeUrl}
                      alt="QR Preview"
                      style={{ width: "60px", height: "60px", objectFit: "contain", background: "#ffffff", padding: "3px", borderRadius: "6px" }}
                    />
                    <button
                      type="button"
                      className="studio-ghost-btn"
                      style={{ fontSize: "11px", color: "#40328c" }}
                      onClick={() => setBankForm((f) => ({ ...f, qrCodeUrl: "" }))}
                    >
                      Remove QR
                    </button>
                  </div>
                )}
              </label>

              <label>
                Transfer Instructions
                <small>Shown to the subscriber during checkout</small>
                <textarea
                  rows={2}
                  placeholder="e.g. Please transfer exact amount and keep digital transaction receipt screenshot."
                  value={bankForm.instructions}
                  onChange={(e) => setBankForm((f) => ({ ...f, instructions: e.target.value }))}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <label>
                  Display Order
                  <input
                    type="number"
                    value={bankForm.displayOrder}
                    onChange={(e) => setBankForm((f) => ({ ...f, displayOrder: e.target.value }))}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "24px" }}>
                  <input
                    type="checkbox"
                    checked={bankForm.isActive}
                    onChange={(e) => setBankForm((f) => ({ ...f, isActive: e.target.checked }))}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <span>Active & visible to paying subscribers</span>
                </label>
              </div>

              <div className="studio-dialog-actions">
                <button type="button" className="studio-cancel" onClick={() => setBankDialogOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="studio-primary" disabled={busy}>
                  {busy ? "Saving..." : editingBank ? "Update Account" : "Add Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* INSPECT RECEIPT & AUDIT MODAL */}
      {/* ========================================================= */}
      {inspectingReceipt && (
        <div className="studio-dialog-backdrop studio-audit-backdrop">
          <div className="studio-dialog studio-audit-dialog">
            <div className="studio-section-heading studio-audit-heading">
              <div>
                <p className="admin-kicker">AUTOMATED RECEIPT AUDIT</p>
                <h2>Transaction #{inspectingReceipt.referenceNumber}</h2>
              </div>
              <button className="studio-cancel" onClick={() => setInspectingReceipt(null)}>
                ✕ Close
              </button>
            </div>

            <div className="studio-audit-layout">
              {/* Left Column: Proof Receipt Image & Digital Voucher */}
              <div className="studio-audit-proof">
                <div className="studio-audit-label-row">
                  <p>
                    Official Proof of Payment
                  </p>
                  <span>
                    IN-HOUSE AUDIT VOUCHER
                  </span>
                </div>

                {!receiptImgError && inspectingReceipt.receiptUrl && !inspectingReceipt.receiptUrl.startsWith("/uploads/sample") ? (
                  <div
                    style={{
                      background: "#e8e6ef",
                      border: "1px solid rgba(64, 50, 140, 0.17)",
                      borderRadius: "12px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <img
                      src={inspectingReceipt.receiptUrl}
                      alt="Payment Receipt"
                      onError={() => setReceiptImgError(true)}
                      style={{
                        width: "100%",
                        maxHeight: "460px",
                        objectFit: "contain",
                        borderRadius: "8px",
                        background: "#e8e6ef",
                      }}
                    />
                    <a
                      href={inspectingReceipt.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        marginTop: "12px",
                        fontSize: "12px",
                        color: "#8a6608",
                        textDecoration: "underline",
                        fontWeight: 600,
                      }}
                    >
                      ↗ Open Full Resolution Image in New Tab
                    </a>
                  </div>
                ) : (
                  /* Digital Cinema Receipt Voucher */
                  <div className="studio-digital-receipt">
                    <div className="studio-receipt-header">
                      <div className="studio-receipt-brand">SINESARILI INDIE CINEMA</div>
                      <div className="studio-receipt-subbrand">Official Payment Proof & Transaction Voucher</div>
                      <div style={{ marginTop: "10px" }}>
                        <span className={`studio-receipt-stamp ${inspectingReceipt.status}`}>
                          {inspectingReceipt.status === "verified" ? "✓ Verified Deposit" : inspectingReceipt.status === "flagged" ? "⚠ Discrepancy Flagged" : "⚡ Awaiting Review"}
                        </span>
                      </div>
                    </div>

                    <div className="studio-receipt-grid">
                      <div className="studio-receipt-row">
                        <span className="label">Transaction Ref</span>
                        <code className="val" style={{ fontFamily: "monospace", color: "#2e553e", fontSize: "13px" }}>
                          {inspectingReceipt.referenceNumber}
                        </code>
                      </div>
                      <div className="studio-receipt-row">
                        <span className="label">Provider / Gateway</span>
                        <span className="val">{inspectingReceipt.bankProvider}</span>
                      </div>
                      <div className="studio-receipt-row">
                        <span className="label">Payer Name</span>
                        <span className="val">{inspectingReceipt.subscriberName}</span>
                      </div>
                      <div className="studio-receipt-row">
                        <span className="label">Contact Email</span>
                        <span className="val" style={{ fontSize: "12px", color: "#40328c" }}>{inspectingReceipt.subscriberEmail}</span>
                      </div>
                      <div className="studio-receipt-row">
                        <span className="label">Plan Purchased</span>
                        <span className="val" style={{ color: "#8a6608" }}>{inspectingReceipt.planName}</span>
                      </div>
                      <div className="studio-receipt-row">
                        <span className="label">Submitted Time</span>
                        <span className="val" style={{ fontSize: "12px" }}>{new Date(inspectingReceipt.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="studio-receipt-total">
                      <span className="label">Total Amount Paid</span>
                      <span className="amount">₱{inspectingReceipt.amountPaid.toLocaleString()}.00</span>
                    </div>

                    <div className="studio-receipt-barcode">
                      ||| | ||||| || | |||| ||| |||| | ||| |||||
                      <div style={{ fontSize: "10px", color: "#5c5870", marginTop: "4px", letterSpacing: "0.08em" }}>
                        OFFICIAL SINESARILI IN-HOUSE AUDIT TRAIL
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Subscriber & Automated Findings */}
              <div className="studio-audit-details">
                {/* Subscriber Details Card */}
                <div className="studio-audit-card studio-audit-subscriber">
                  <div className="studio-audit-card-heading">
                    <p>
                      Subscriber Information
                    </p>
                    <span>
                      {formatRelativeTime(inspectingReceipt.createdAt)}
                    </span>
                  </div>
                  <div className="studio-audit-subscriber-grid">
                    <div className="studio-audit-field">
                      <span>Full Name</span>
                      <strong>{inspectingReceipt.subscriberName}</strong>
                    </div>
                    <div className="studio-audit-field">
                      <span>Email Address</span>
                      <strong>{inspectingReceipt.subscriberEmail}</strong>
                    </div>
                    <div className="studio-audit-field">
                      <span>Mobile Number</span>
                      <strong>{inspectingReceipt.subscriberPhone || "Not provided"}</strong>
                    </div>
                    <div className="studio-audit-field">
                      <span>Date Submitted</span>
                      <strong>{new Date(inspectingReceipt.createdAt).toLocaleDateString()}</strong>
                    </div>
                  </div>
                </div>

                {/* Plan & Amount Check Card */}
                <div className="studio-audit-card studio-audit-plan">
                  <div className="studio-audit-plan-row">
                    <div>
                      <span style={{ fontSize: "11px", color: "#5c5870", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                        Target Membership
                      </span>
                      <span className="studio-plan-pill vip" style={{ fontSize: "12px" }}>
                        {inspectingReceipt.planName}
                      </span>
                      <div style={{ fontSize: "11px", color: "#5c5870", marginTop: "6px" }}>
                        Destination: <strong style={{ color: "#1c1733" }}>{inspectingReceipt.bankProvider}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: "11px", color: "#5c5870", textTransform: "uppercase", display: "block" }}>
                        Amount Paid
                      </span>
                      <div style={{ fontSize: "22px", fontWeight: 900, color: inspectingReceipt.receiptMetadata?.amountMatched ? "#2e553e" : "#40328c" }}>
                        ₱{inspectingReceipt.amountPaid.toLocaleString()}
                      </div>
                      <small style={{ color: "#5c5870" }}>Expected: ₱{inspectingReceipt.amountExpected.toLocaleString()}</small>
                    </div>
                  </div>
                </div>

                {/* Automated Verification Engine Report */}
                <div className="studio-audit-card studio-audit-findings">
                  <div className="studio-audit-card-heading">
                    <p>
                      ⚡ Automated Verification Engine Findings
                    </p>
                    <span
                      className={`studio-score-badge ${
                        (inspectingReceipt.receiptMetadata?.heuristicScore || 0) >= 80 ? "high" : "low"
                      }`}
                    >
                      {inspectingReceipt.receiptMetadata?.heuristicScore || 0}% Score
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: "8px" }}>
                    {/* Amount Check */}
                    <div
                        style={{
                         display: "flex",
                         alignItems: "center",
                         gap: "10px",
                         padding: "8px 10px",
                         borderRadius: "6px",
                        background: inspectingReceipt.receiptMetadata?.amountMatched ? "rgba(56, 99, 74, 0.08)" : "rgba(64, 50, 140, 0.08)",
                        border: `1px solid ${inspectingReceipt.receiptMetadata?.amountMatched ? "rgba(56, 99, 74, 0.25)" : "rgba(64, 50, 140, 0.25)"}`,
                      }}
                    >
                      <span style={{ fontSize: "14px", color: inspectingReceipt.receiptMetadata?.amountMatched ? "#2e553e" : "#40328c", fontWeight: 800 }}>
                        {inspectingReceipt.receiptMetadata?.amountMatched ? "✓" : "✕"}
                      </span>
                      <span style={{ fontSize: "12px", color: "#40328c" }}>
                        Amount Match:{" "}
                        <strong style={{ color: inspectingReceipt.receiptMetadata?.amountMatched ? "#2e553e" : "#b4234f" }}>
                          {inspectingReceipt.receiptMetadata?.amountMatched ? "Exact Match" : "Mismatched Amount"}
                        </strong>
                      </span>
                    </div>

                    {/* Reference Syntax */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        background: inspectingReceipt.receiptMetadata?.referenceValid ? "rgba(56, 99, 74, 0.08)" : "rgba(232, 191, 69, 0.08)",
                        border: `1px solid ${inspectingReceipt.receiptMetadata?.referenceValid ? "rgba(56, 99, 74, 0.25)" : "rgba(232, 191, 69, 0.25)"}`,
                      }}
                    >
                      <span style={{ fontSize: "14px", color: inspectingReceipt.receiptMetadata?.referenceValid ? "#2e553e" : "#8a6608", fontWeight: 800 }}>
                        {inspectingReceipt.receiptMetadata?.referenceValid ? "✓" : "⚠"}
                      </span>
                      <span style={{ fontSize: "12px", color: "#40328c" }}>
                        Reference Syntax:{" "}
                        <strong style={{ color: inspectingReceipt.receiptMetadata?.referenceValid ? "#2e553e" : "#8a6608" }}>
                          {inspectingReceipt.receiptMetadata?.referenceValid ? "Valid Provider Format" : "Unusual Syntax"}
                        </strong>
                      </span>
                    </div>

                    {/* Verification Notes checklist */}
                    {inspectingReceipt.receiptMetadata?.verificationNotes && inspectingReceipt.receiptMetadata.verificationNotes.length > 0 && (
                      <div style={{ marginTop: "6px", borderTop: "1px solid rgba(64, 50, 140, 0.102)", paddingTop: "8px", display: "grid", gap: "5px" }}>
                        {inspectingReceipt.receiptMetadata.verificationNotes.map((note, idx) => {
                          const isPass = isPositiveCheck(note);
                          return (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: "8px",
                                fontSize: "11px",
                                color: isPass ? "#40328c" : "#40328c",
                                lineHeight: "1.4",
                              }}
                            >
                              <span style={{ color: isPass ? "#2e553e" : "#40328c", fontWeight: 800 }}>
                                {isPass ? "✓" : "✕"}
                              </span>
                              <span>{note.replace(/^[✓X✕•\s]+/, "")}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit Decision Section */}
                <div className="studio-audit-decision">
                  <div className="studio-audit-status">
                    <span>Current status</span>
                    <span className={`studio-audit-tag ${inspectingReceipt.status}`}>
                      {inspectingReceipt.status}
                    </span>
                  </div>

                  {inspectingReceipt.status === "verified" ? (
                    <div style={{ background: "rgba(56, 99, 74, 0.1)", border: "1px solid rgba(56, 99, 74, 0.3)", padding: "12px", borderRadius: "8px", color: "#2e553e", fontSize: "13px", textAlign: "center", fontWeight: 700 }}>
                      ✓ Subscription Activated ({inspectingReceipt.reviewedByAdmin || "Automated System"})
                    </div>
                  ) : inspectingReceipt.status === "rejected" ? (
                    <div style={{ background: "rgba(228, 92, 134, 0.1)", border: "1px solid rgba(228, 92, 134, 0.3)", padding: "12px", borderRadius: "8px", color: "#b4234f", fontSize: "13px" }}>
                      <strong>Rejection Reason:</strong> {inspectingReceipt.rejectionReason}
                    </div>
                  ) : (
                    <div className="studio-audit-actions">
                      <button
                        type="button"
                        className="studio-danger-btn"
                        onClick={() => {
                          setRejectingSubId(inspectingReceipt._id);
                          setRejectDialogOpen(true);
                        }}
                      >
                        Reject Submission
                      </button>
                      <button
                        type="button"
                        className="studio-primary"
                        onClick={() => handleApprovePayment(inspectingReceipt)}
                      >
                        ✓ Approve & Activate Subscription
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* REJECT PAYMENT DIALOG */}
      {/* ========================================================= */}
      {rejectDialogOpen && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog" style={{ width: "min(500px, 100%)" }}>
            <div className="studio-section-heading">
              <div>
                <p className="admin-kicker">AUDIT REJECTION</p>
                <h2>Reject Payment Submission</h2>
              </div>
              <button className="studio-cancel" onClick={() => setRejectDialogOpen(false)}>
                ✕ Close
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "#5c5870", margin: "10px 0 14px" }}>
              Specify the reason why this payment proof cannot be accepted. This reason will be recorded in the audit history.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
              {[
                "Amount does not match subscription plan",
                "Invalid or fake reference number",
                "Duplicate receipt already used",
                "Receipt screenshot is unreadable or blurry",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="studio-ghost-btn"
                  style={{ fontSize: "11px", padding: "4px 8px" }}
                  onClick={() => setRejectReason(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <form
              className="studio-simple-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleRejectPayment();
              }}
            >
              <label>
                Rejection Reason *
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why the receipt could not be verified..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </label>

              <div className="studio-dialog-actions">
                <button type="button" className="studio-cancel" onClick={() => setRejectDialogOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="studio-danger-btn" style={{ padding: "8px 16px" }}>
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDialog.open && (
        <div className="studio-dialog-backdrop" role="presentation" onClick={() => setConfirmDialog((dialog) => ({ ...dialog, open: false }))}>
          <div className="studio-confirm" role="alertdialog" aria-modal="true" aria-labelledby="studio-confirm-title" aria-describedby="studio-confirm-copy" onClick={(event) => event.stopPropagation()}>
            <p className="studio-confirm-kicker">Please confirm</p>
            <h2 className="studio-confirm-title" id="studio-confirm-title">{confirmDialog.title}</h2>
            <p className="studio-confirm-copy" id="studio-confirm-copy">{confirmDialog.message}</p>
            <div className="studio-confirm-actions">
              <button type="button" className="studio-cancel" autoFocus onClick={() => setConfirmDialog((dialog) => ({ ...dialog, open: false }))}>
                Cancel
              </button>
              <button
                type="button"
                className="studio-danger-btn"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog((dialog) => ({ ...dialog, open: false }));
                  void action();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
