"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type AwardType = "win" | "nomination" | "official_selection" | "honorary";

type Award = {
  _id: string;
  title: string;
  organization: string;
  year: number;
  category?: string;
  awardType: AwardType;
  filmId?: string | null;
  filmTitle?: string;
  recipientName?: string;
  description?: string;
};

type FilmOption = { _id: string; title: string };

type Draft = { title: string; organization: string; year: string; category: string; awardType: AwardType; filmId: string; recipientName: string; description: string };

const TYPE_LABELS: Record<AwardType, string> = {
  win: "Winner",
  nomination: "Nominee",
  official_selection: "Official selection",
  honorary: "Honorary",
};

type Props = {
  notify: (message: string, type?: "success" | "error") => void;
  confirm: (title: string, message: string, onConfirm: () => void | Promise<void>) => void;
  onCountChange?: (count: number) => void;
};

async function errorFrom(response: Response, fallback: string) {
  try { return ((await response.json()) as { error?: string }).error ?? fallback; } catch { return fallback; }
}

export function AdminAwardsManager({ notify, confirm, onCountChange }: Props) {
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [films, setFilms] = useState<FilmOption[]>([]);
  const [editing, setEditing] = useState<Award | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/awards", { cache: "no-store" });
    const list = response.ok ? ((await response.json()) as { data: Award[] }).data : [];
    setAwards(list);
    onCountChange?.(list.length);
  }, [onCountChange]);

  useEffect(() => {
    load().catch(() => setAwards([]));
    fetch("/api/admin/films", { cache: "no-store" })
      .then(async (response) => response.ok && setFilms(((await response.json()) as { data: FilmOption[] }).data))
      .catch(() => undefined);
  }, [load]);

  function openForm(award: Award | null) {
    setEditing(award);
    setDraft(award
      ? { title: award.title, organization: award.organization, year: String(award.year), category: award.category ?? "", awardType: award.awardType, filmId: award.filmId ?? "", recipientName: award.recipientName ?? "", description: award.description ?? "" }
      : { title: "", organization: "", year: String(new Date().getFullYear()), category: "", awardType: "win", filmId: "", recipientName: "", description: "" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    const film = films.find((item) => item._id === draft.filmId);
    try {
      const response = await fetch(editing ? `/api/admin/awards/${editing._id}` : "/api/admin/awards", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, year: Number(draft.year), filmId: film?._id ?? "", filmTitle: film?.title ?? "" }),
      });
      if (!response.ok) { notify(await errorFrom(response, "Could not save this award"), "error"); return; }
      notify(editing ? "Award updated" : "Award added", "success");
      setDraft(null);
      await load();
    } catch {
      notify("Could not save this award", "error");
    } finally {
      setSaving(false);
    }
  }

  function remove(award: Award) {
    confirm("Delete award", `Delete "${award.title}" (${award.organization}, ${award.year})?`, async () => {
      const response = await fetch(`/api/admin/awards/${award._id}`, { method: "DELETE" });
      if (!response.ok) { notify(await errorFrom(response, "Could not delete this award"), "error"); return; }
      notify("Award deleted", "success");
      await load();
    });
  }

  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="admin-kicker">RECOGNITIONS</p>
          <h1>Awards & Honors</h1>
          <p>Festival accolades, selections, and honors received by films and people.</p>
        </div>
        <button className="studio-primary" onClick={() => openForm(null)}>+ Add award</button>
      </div>

      <section className="studio-records">
        <div className="studio-table-wrap">
          <table className="studio-table">
            <thead>
              <tr>
                <th>AWARD</th>
                <th>ORGANIZATION</th>
                <th>YEAR</th>
                <th>TYPE</th>
                <th>FILM / RECIPIENT</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {awards === null ? (
                <tr><td colSpan={6} className="studio-empty-note">Loading awards…</td></tr>
              ) : awards.length === 0 ? (
                <tr><td colSpan={6} className="studio-empty-note">No awards yet. Use “Add award” to record the first one.</td></tr>
              ) : awards.map((award) => (
                <tr key={award._id}>
                  <td><strong>{award.title}</strong>{award.category && <small style={{ display: "block", color: "#5c5870" }}>{award.category}</small>}</td>
                  <td>{award.organization}</td>
                  <td>{award.year}</td>
                  <td style={{ color: "#b3561b", fontWeight: 700 }}>{TYPE_LABELS[award.awardType] ?? award.awardType}</td>
                  <td>{[award.filmTitle, award.recipientName].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                      <button className="studio-delete-button" style={{ color: "#40328c" }} onClick={() => openForm(award)}>Edit</button>
                      <button className="studio-delete-button" onClick={() => remove(award)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {draft && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog">
            <div className="studio-section-heading">
              <h2>{editing ? "Edit award" : "Add award"}</h2>
              <button className="studio-cancel" onClick={() => setDraft(null)} aria-label="Close">✕</button>
            </div>
            <form className="studio-simple-form" onSubmit={save}>
              <label>
                Award title *
                <input required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Best Short Film" />
              </label>
              <label>
                Organization / festival *
                <input required maxLength={200} value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} placeholder="e.g. Cinemalaya Philippine Independent Film Festival" />
              </label>
              <label>
                Year *
                <input required type="number" min={1900} max={2200} value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })} />
              </label>
              <label>
                Type
                <select value={draft.awardType} onChange={(e) => setDraft({ ...draft, awardType: e.target.value as AwardType })}>
                  {(Object.keys(TYPE_LABELS) as AwardType[]).map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                </select>
              </label>
              <label>
                Category <small>Optional</small>
                <input maxLength={200} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Short Film Competition" />
              </label>
              <label>
                Film <small>Optional</small>
                <select value={draft.filmId} onChange={(e) => setDraft({ ...draft, filmId: e.target.value })}>
                  <option value="">No linked film</option>
                  {films.map((film) => <option key={film._id} value={film._id}>{film.title}</option>)}
                </select>
              </label>
              <label>
                Recipient <small>Optional — person or team who received it</small>
                <input maxLength={200} value={draft.recipientName} onChange={(e) => setDraft({ ...draft, recipientName: e.target.value })} />
              </label>
              <label>
                Notes <small>Optional</small>
                <textarea rows={3} maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </label>
              <div className="studio-dialog-actions">
                <button type="button" className="studio-cancel" onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className="studio-primary" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add award"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
