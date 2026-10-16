"use client";

import { useCallback, useEffect, useState } from "react";

type ActivityLog = {
  _id: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
};

const ACTIONS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  "film.create": "Added a film",
  "film.update": "Edited a film",
  "film.status_change": "Changed a film's status",
  "film.delete": "Deleted a film",
  "category.create": "Added a category",
  "category.update": "Edited a category",
  "category.delete": "Deleted a category",
  "director.create": "Added a person",
  "director.update": "Edited a person",
  "director.delete": "Removed a person",
  "award.create": "Added an award",
  "award.update": "Edited an award",
  "award.delete": "Deleted an award",
  "announcement.create": "Posted an announcement",
  "announcement.update": "Edited an announcement",
  "announcement.delete": "Deleted an announcement",
  "user.create": "Added an administrator",
  "user.update": "Edited an administrator",
  "user.reset_password": "Reset an administrator's password",
  "setting.update": "Changed platform settings",
  "plans.update": "Updated CinePass plans",
  "bank_account.create": "Added a payment account",
  "bank_account.update": "Edited a payment account",
  "bank_account.delete": "Deleted a payment account",
  "payment.approve": "Approved a payment",
  "payment.reject": "Rejected a payment",
};

const FILTERS: [string, string][] = [
  ["", "All activity"],
  ["session", "Sign-ins"],
  ["film", "Films"],
  ["category", "Categories"],
  ["director", "Directors & team"],
  ["award", "Awards"],
  ["announcement", "Announcements"],
  ["user", "Administrators"],
  ["setting", "Settings & plans"],
  ["bank_account", "Payment accounts"],
  ["payment_submission", "Payments"],
];

function describe(details: Record<string, unknown> = {}) {
  const parts: string[] = [];
  const text = (key: string) => (typeof details[key] === "string" && details[key] ? String(details[key]) : "");
  const main = text("title") || text("name") || text("subscriber") || text("email");
  if (main) parts.push(main);
  if (text("title") && text("name")) parts.push(text("name"));
  if (typeof details.status === "string") parts.push(`Status: ${details.status}`);
  if (Array.isArray(details.prices)) parts.push(details.prices.join(" · "));
  if (Array.isArray(details.updatedFields) && details.updatedFields.length) parts.push(`Changed: ${details.updatedFields.join(", ")}`);
  if (typeof details.reason === "string" && details.reason) parts.push(`Reason: ${details.reason}`);
  return parts.join(" — ") || "—";
}

function relative(value: string) {
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminActivityLog() {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);
  const [filter, setFilter] = useState("");
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (resourceType: string) => {
    setRefreshing(true);
    setFailed(false);
    try {
      const query = new URLSearchParams({ limit: "200", ...(resourceType ? { resourceType } : {}) });
      const response = await fetch(`/api/admin/activity-logs?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setLogs(((await response.json()) as { data: ActivityLog[] }).data);
    } catch {
      setFailed(true);
      setLogs((current) => current ?? []);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="admin-kicker">SECURITY</p>
          <h1>System Activity Logs</h1>
          <p>Every administrator action is recorded here automatically — sign-ins, content changes, payments, and settings.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <select className="studio-log-filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter activity">
            {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="studio-primary" onClick={() => load(filter)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      {failed && <p className="studio-message" role="alert">The activity log couldn't load. Try Refresh.</p>}

      <section className="studio-records">
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr>
                <th>WHEN</th>
                <th>WHO</th>
                <th>ACTION</th>
                <th>DETAILS</th>
              </tr>
            </thead>
            <tbody>
              {logs === null ? (
                <tr><td colSpan={4} className="studio-empty-note">Loading activity…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="studio-empty-note">No activity recorded yet{filter ? " for this filter" : ""}.</td></tr>
              ) : logs.map((log) => (
                <tr key={log._id}>
                  <td title={new Date(log.createdAt).toLocaleString("en-PH")} style={{ whiteSpace: "nowrap" }}>{relative(log.createdAt)}</td>
                  <td>
                    <strong>{log.actorName}</strong>
                    <small style={{ display: "block", color: "#5c5870" }}>{log.actorEmail} · {log.actorRole.replace("_", " ")}</small>
                  </td>
                  <td style={{ color: "#40328c", fontWeight: 700 }}>{ACTIONS[log.action] ?? log.action}</td>
                  <td style={{ color: "#3b3652" }}>{describe(log.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
