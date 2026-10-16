"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Person = {
  _id: string;
  name: string;
  title?: string;
  displayOrder?: number;
  bio?: string;
  photoUrl?: string;
};

type Draft = { name: string; title: string; displayOrder: string; bio: string; photoUrl: string };

const EMPTY: Draft = { name: "", title: "", displayOrder: "0", bio: "", photoUrl: "" };
const TITLE_SUGGESTIONS = [
  "Festival Director",
  "Associate Producer",
  "Supervising Producer",
  "Program Coordinator",
  "Finance Coordinator",
  "Creative Coordinator",
  "Marketing Coordinator",
  "Production and Logistics Coordinator",
  "Sponsorship Coordinator",
  "Film Director",
];

type Props = {
  notify: (message: string, type?: "success" | "error") => void;
  confirm: (title: string, message: string, onConfirm: () => void | Promise<void>) => void;
  onCountChange?: (count: number) => void;
};

async function errorFrom(response: Response, fallback: string) {
  try { return ((await response.json()) as { error?: string }).error ?? fallback; } catch { return fallback; }
}

export function AdminPeopleManager({ notify, confirm, onCountChange }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/directors", { cache: "no-store" });
    const list = response.ok ? ((await response.json()) as { data: Person[] }).data : [];
    setPeople(list);
    onCountChange?.(list.length);
  }, [onCountChange]);

  useEffect(() => { load().catch(() => setPeople([])); }, [load]);

  function openForm(person: Person | null) {
    setEditing(person);
    setDraft(person
      ? { name: person.name, title: person.title ?? "", displayOrder: String(person.displayOrder ?? 0), bio: person.bio ?? "", photoUrl: person.photoUrl ?? "" }
      : { ...EMPTY, displayOrder: String((people?.length ?? 0) + 1) });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/admin/directors/${editing._id}` : "/api/admin/directors", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, displayOrder: Number(draft.displayOrder) || 0 }),
      });
      if (!response.ok) { notify(await errorFrom(response, "Could not save this person"), "error"); return; }
      notify(editing ? `${draft.name} updated` : `${draft.name} added`, "success");
      setDraft(null);
      await load();
    } catch {
      notify("Could not save this person", "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Upload a JPG, PNG, or WebP image", "error"); return; }
    if (file.size > 20 * 1024 * 1024) { notify("Images must be 20 MB or smaller", "error"); return; }
    setUploading(true);
    try {
      const response = await fetch("/api/admin/uploads/photo", { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) { notify(await errorFrom(response, "Could not upload the photo"), "error"); return; }
      const url = ((await response.json()) as { data: { url: string } }).data.url;
      setDraft((current) => (current ? { ...current, photoUrl: url } : current));
    } catch {
      notify("Could not upload the photo", "error");
    } finally {
      setUploading(false);
    }
  }

  function remove(person: Person) {
    confirm("Remove person", `Remove ${person.name}${person.title ? ` (${person.title})` : ""}?`, async () => {
      const response = await fetch(`/api/admin/directors/${person._id}`, { method: "DELETE" });
      if (!response.ok) { notify(await errorFrom(response, "Could not remove this person"), "error"); return; }
      notify(`${person.name} removed`, "success");
      await load();
    });
  }

  return (
    <>
      <div className="studio-page-heading">
        <div>
          <p className="admin-kicker">PEOPLE & CREDITS</p>
          <h1>Directors & Team</h1>
          <p>Directors, filmmakers, and festival team members with their titles. Lower order numbers appear first.</p>
        </div>
        <button className="studio-primary" onClick={() => openForm(null)}>+ Add person</button>
      </div>

      {people === null ? (
        <p className="studio-empty-note">Loading people…</p>
      ) : people.length === 0 ? (
        <div className="studio-empty-state">
          <h3>No people yet</h3>
          <p>Add your directors and festival team, like the Festival Director and producers.</p>
          <button className="studio-primary" onClick={() => openForm(null)}>+ Add the first person</button>
        </div>
      ) : (
        <div className="studio-category-grid">
          {people.map((person) => (
            <div key={person._id} className="studio-category-card">
              <div className="studio-category-card-head">
                <div className="studio-genre-mark studio-person-mark">
                  {person.photoUrl ? <img src={person.photoUrl} alt="" /> : person.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3>{person.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "3px" }}>
                    {person.title && <span className="section-tag-badge showcase">{person.title}</span>}
                    <span style={{ color: "#5c5870", fontSize: "10px", fontWeight: 600 }}>#{person.displayOrder ?? 0}</span>
                  </div>
                </div>
              </div>
              {person.bio && <p>{person.bio}</p>}
              <div className="studio-category-card-actions">
                <span />
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="studio-delete-button" style={{ color: "#40328c" }} onClick={() => openForm(person)}>Edit</button>
                  <button className="studio-delete-button" onClick={() => remove(person)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="studio-dialog-backdrop">
          <div className="studio-dialog">
            <div className="studio-section-heading">
              <h2>{editing ? `Edit ${editing.name}` : "Add person"}</h2>
              <button className="studio-cancel" onClick={() => setDraft(null)} aria-label="Close">✕</button>
            </div>
            <form className="studio-simple-form" onSubmit={save}>
              <label>
                Full name *
                <input required maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Debhe Marie Carlos" />
              </label>
              <label>
                Title / position
                <input list="people-title-suggestions" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Festival Director" />
                <datalist id="people-title-suggestions">{TITLE_SUGGESTIONS.map((title) => <option key={title} value={title} />)}</datalist>
              </label>
              <label>
                Display order
                <input type="number" value={draft.displayOrder} onChange={(e) => setDraft({ ...draft, displayOrder: e.target.value })} />
              </label>
              <div className="people-photo-field">
                <span className="people-photo-label">Photo <small>Optional · JPG, PNG, or WebP up to 20 MB</small></span>
                <div className="people-photo-row">
                  <span className="people-photo-preview" aria-hidden="true">
                    {draft.photoUrl ? <img src={draft.photoUrl} alt="" /> : (draft.name.trim().charAt(0).toUpperCase() || "?")}
                  </span>
                  <div className="people-photo-actions">
                    <label className="people-photo-upload">
                      {uploading ? "Uploading…" : draft.photoUrl ? "Replace photo" : "Upload photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadPhoto(file); }} />
                    </label>
                    {draft.photoUrl && <button type="button" className="people-photo-remove" disabled={uploading} onClick={() => setDraft({ ...draft, photoUrl: "" })}>Remove photo</button>}
                  </div>
                </div>
              </div>
              <label>
                Short bio <small>Optional</small>
                <textarea rows={3} maxLength={5000} value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
              </label>
              <div className="studio-dialog-actions">
                <button type="button" className="studio-cancel" onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className="studio-primary" disabled={saving || uploading}>{saving ? "Saving…" : editing ? "Save changes" : "Add person"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
