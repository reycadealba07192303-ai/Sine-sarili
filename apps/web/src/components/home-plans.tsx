"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";

type Plan = { id: string; name: string; price: number; durationDays: number; description: string; perks: string[]; badge: string };

const peso = (value: number) => `₱${value.toLocaleString("en-PH")}`;
const days = (value: number) => `${value} ${value === 1 ? "day" : "days"}`;

export function HomePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/payments/plans", { signal: controller.signal })
      .then(async (response) => response.ok && setPlans(((await response.json()) as { data: Plan[] }).data))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!plans.length) return null;

  return (
    <section className="home-plans" aria-labelledby="home-plans-title">
      <div className="home-plans-heading">
        <p className="ed-index"><span>03 / CinePass</span><i aria-hidden="true" /></p>
        <h2 id="home-plans-title">Choose your pass<span aria-hidden="true">*</span></h2>
        <p>One pass for every film and every episode. Pick the plan that fits how you watch.</p>
      </div>
      <div className="home-plans-grid">
        {plans.map((plan) => (
          <article key={plan.id} className={`home-plan${plan.badge ? " is-featured" : ""}`}>
            {plan.badge && <span className="home-plan-badge">{plan.badge}</span>}
            <span className="home-plan-num">{String(plans.indexOf(plan) + 1).padStart(2, "0")}</span>
            <h3>{plan.name}</h3>
            <p className="home-plan-price"><strong>{peso(plan.price)}</strong>/{days(plan.durationDays)}</p>
            {plan.description && <p className="home-plan-desc">{plan.description}</p>}
            {plan.perks.length > 0 && (
              <ul>{plan.perks.map((perk) => <li key={perk}><Check size={14} aria-hidden="true" />{perk}</li>)}</ul>
            )}
            <Link className="home-plan-cta" href={`/subscribe?plan=${plan.id}`}>Choose {plan.name}</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
