"use client";

import { useEffect, useState } from "react";

type Plan = {
  id: "standard_monthly" | "vip_monthly" | "patron_annual";
  name: string;
  price: number;
  durationDays: number;
  description: string;
  perks: string[];
  badge: string;
};

type Draft = Omit<Plan, "price" | "durationDays" | "perks"> & { price: string; durationDays: string; perks: string };

const toDraft = (plan: Plan): Draft => ({ ...plan, price: String(plan.price), durationDays: String(plan.durationDays), perks: plan.perks.join("\n") });

function perDay(draft: Draft) {
  const price = Number(draft.price);
  const days = Number(draft.durationDays);
  if (!Number.isFinite(price) || !Number.isInteger(days) || days < 1) return "";
  return `≈ ₱${(price / days).toFixed(2)} per day`;
}

export function AdminPlansEditor({ notify }: { notify: (message: string, type?: "success" | "error") => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState("");

  function loadDrafts(plans: Plan[]) {
    const next = plans.map(toDraft);
    setDrafts(next);
    setSavedSnapshot(JSON.stringify(next));
  }

  useEffect(() => {
    fetch("/api/admin/plans", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        loadDrafts(((await response.json()) as { data: Plan[] }).data);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const update = (id: Plan["id"], patch: Partial<Draft>) => setDrafts((list) => list.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plans: drafts.map((draft) => ({
            ...draft,
            price: Number(draft.price),
            durationDays: Number(draft.durationDays),
            perks: draft.perks.split("\n").map((perk) => perk.trim()).filter(Boolean),
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify(data.error || "Could not save the plans", "error");
        return;
      }
      loadDrafts(data.data as Plan[]);
      notify("CinePass plans updated. New prices apply to the next payments.");
    } catch {
      notify("Could not save the plans", "error");
    } finally {
      setSaving(false);
    }
  }

  if (state === "loading") return <p className="plans-editor-note">Loading plans…</p>;
  if (state === "error") return <p className="plans-editor-note">Plans could not be loaded. Refresh the page to try again.</p>;

  const dirty = JSON.stringify(drafts) !== savedSnapshot;

  return (
    <div className="plans-editor">
      <div className="plans-editor-grid">
        {drafts.map((draft, index) => {
          const days = Number(draft.durationDays);
          return (
            <article key={draft.id} className={`plans-editor-card${draft.badge.trim() ? " is-featured" : ""}`}>
              <header className="plans-editor-head">
                <div className="plans-editor-head-top">
                  <span className="plans-editor-number">Plan {index + 1}</span>
                  {draft.badge.trim() && <span className="plans-editor-badge">{draft.badge}</span>}
                </div>
                <strong className="plans-editor-name">{draft.name || "Untitled plan"}</strong>
                <p className="plans-editor-price">
                  <b>₱{Number(draft.price || 0).toLocaleString("en-PH")}</b>
                  <span>/ {days >= 1 ? `${days} ${days === 1 ? "day" : "days"}` : "— days"}</span>
                </p>
                {perDay(draft) && <small className="plans-editor-perday">{perDay(draft)}</small>}
              </header>

              <div className="plans-editor-body">
                <label>Plan name<input value={draft.name} maxLength={60} onChange={(event) => update(draft.id, { name: event.target.value })} /></label>
                <div className="plans-editor-pair">
                  <label>
                    Price (₱)
                    <input type="number" min={1} max={100000} step={1} inputMode="numeric" value={draft.price} onChange={(event) => update(draft.id, { price: event.target.value })} />
                  </label>
                  <label>
                    Access (days)
                    <input type="number" min={1} max={3650} step={1} inputMode="numeric" value={draft.durationDays} onChange={(event) => update(draft.id, { durationDays: event.target.value })} />
                  </label>
                </div>
                <label>Short description<textarea rows={2} maxLength={200} value={draft.description} onChange={(event) => update(draft.id, { description: event.target.value })} /></label>
                <label>
                  <span className="plans-editor-label-row">Perks <small>One per line, up to 6</small></span>
                  <textarea rows={4} value={draft.perks} onChange={(event) => update(draft.id, { perks: event.target.value })} />
                </label>
                <label>
                  <span className="plans-editor-label-row">Badge <small>Optional, e.g. “Most popular”</small></span>
                  <input value={draft.badge} maxLength={24} placeholder="No badge" onChange={(event) => update(draft.id, { badge: event.target.value })} />
                </label>
              </div>
            </article>
          );
        })}
      </div>
      <div className={`plans-editor-actions${dirty ? " is-dirty" : ""}`}>
        <p className="plans-editor-note">
          {dirty ? <strong>You have unsaved changes.</strong> : "All changes saved."} Updates show on the CinePass page right away. Payments already made keep the price and days they were bought with.
        </p>
        <button type="button" className="studio-primary" disabled={saving || !dirty} onClick={save}>{saving ? "Saving…" : "Save plans"}</button>
      </div>
    </div>
  );
}
