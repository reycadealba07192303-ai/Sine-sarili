"use client";

import { useState, type FormEvent } from "react";

type Row = { key: number; name: string; email: string };
type Result = { name: string; email: string; status: "sent" | "resent" | "exists" | "invalid" | "duplicate" | "failed" };

const RESULT_TEXT: Record<Result["status"], string> = {
  sent: "Invitation sent",
  resent: "New invitation sent",
  exists: "Already has an account",
  invalid: "Check the name and email",
  duplicate: "Listed twice",
  failed: "Email could not be sent",
};

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, name: "", email: "" });

export function AdminInviteDialog({ onClose, onDone, notify }: { onClose: () => void; onDone: () => void; notify: (message: string, type?: "success" | "error" | "info") => void }) {
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [role, setRole] = useState<"super_admin" | "admin" | "editor">("admin");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const update = (key: number, patch: Partial<Row>) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Paste "Name, email" lines (or a column of emails) to fill many rows at once.
  function pasteMany(text: string) {
    const parsed = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const email = line.match(/[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/)?.[0] ?? "";
      const name = line.replace(email, "").replace(/[<>,;]/g, " ").trim();
      return { key: nextKey++, name, email };
    });
    if (parsed.length > 1) {
      setRows((list) => [...list.filter((row) => row.name || row.email), ...parsed].slice(0, 20));
      return true;
    }
    return false;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invites = rows.filter((row) => row.name.trim() || row.email.trim()).map(({ name, email }) => ({ name, email }));
    if (!invites.length) { notify("Add at least one name and email.", "error"); return; }
    setSending(true);
    try {
      const response = await fetch("/api/admin/users/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, invites }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { notify(data.error || "Invitations could not be sent", "error"); return; }
      const list = data.data as Result[];
      setResults(list);
      const sent = list.filter((item) => item.status === "sent" || item.status === "resent").length;
      notify(sent ? `${sent} invitation${sent === 1 ? "" : "s"} sent` : "No invitations were sent", sent ? "success" : "error");
      onDone();
    } catch {
      notify("Invitations could not be sent", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="studio-dialog-backdrop">
      <div className="studio-dialog" style={{ width: "min(720px, 100%)" }}>
        <div className="studio-section-heading">
          <div>
            <p className="admin-kicker">SYSTEM ACCESS</p>
            <h2>Invite administrators</h2>
          </div>
          <button className="studio-cancel" onClick={onClose}>✕ Close</button>
        </div>

        {results ? (
          <div className="studio-simple-form">
            <ul className="invite-results">
              {results.map((item, index) => (
                <li key={`${item.email}-${index}`} className={`is-${item.status}`}>
                  <span><strong>{item.name || "—"}</strong><small>{item.email || "no email"}</small></span>
                  <b>{RESULT_TEXT[item.status]}</b>
                </li>
              ))}
            </ul>
            <p className="invite-help">Each person gets an email with a link. They verify with a 6-digit code and create their own password. Links expire in 7 days.</p>
            <div className="studio-dialog-actions">
              <button type="button" className="studio-cancel" onClick={() => { setResults(null); setRows([blankRow()]); }}>Invite more</button>
              <button type="button" className="studio-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form className="studio-simple-form" onSubmit={submit}>
            <p className="invite-help">Add a name and email for each person. They'll receive an invitation to verify their email with a code and set their own password.</p>
            <div className="invite-rows">
              <div className="invite-row invite-row-head" aria-hidden="true"><span>Full name</span><span>Email address</span><span /></div>
              {rows.map((row, index) => (
                <div className="invite-row" key={row.key}>
                  <input aria-label={`Name ${index + 1}`} placeholder="e.g. Maria Santos" maxLength={120} value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} />
                  <input
                    aria-label={`Email ${index + 1}`}
                    type="email"
                    placeholder="name@email.com"
                    maxLength={254}
                    value={row.email}
                    onChange={(e) => update(row.key, { email: e.target.value })}
                    onPaste={(e) => { if (pasteMany(e.clipboardData.getData("text"))) e.preventDefault(); }}
                  />
                  <button type="button" className="invite-remove" aria-label={`Remove row ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows((list) => list.filter((item) => item.key !== row.key))}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="invite-add" disabled={rows.length >= 20} onClick={() => setRows((list) => [...list, blankRow()])}>+ Add another person</button>
            <label>
              Role for these invitations
              <select value={role} onChange={(e) => setRole(e.target.value as "super_admin" | "admin" | "editor")}>
                <option value="super_admin">Super Admin — Full access, including users, payments, and settings</option>
                <option value="admin">Admin — Films, categories, announcements, directors, awards</option>
                <option value="editor">Editor — Films only</option>
              </select>
            </label>
            {role === "super_admin" && <p className="invite-warning" role="note">Super Admins can invite and suspend other administrators, manage payments and bank accounts, and change platform settings. Only invite people you fully trust.</p>}
            <div className="studio-dialog-actions">
              <button type="button" className="studio-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="studio-primary" disabled={sending}>{sending ? "Sending…" : `Send ${rows.filter((row) => row.email.trim()).length || ""} invitation${rows.filter((row) => row.email.trim()).length === 1 ? "" : "s"}`.replace("  ", " ")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
