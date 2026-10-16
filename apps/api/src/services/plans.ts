import { SystemSetting } from "../models/system-setting.js";

export const PLAN_IDS = ["standard_monthly", "vip_monthly", "patron_annual"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  durationDays: number;
  description: string;
  perks: string[];
  badge: string;
};

const SETTING_KEY = "subscription_plans";
export const MAX_DURATION_DAYS = 3650;

const DEFAULT_PLANS: Plan[] = [
  { id: "standard_monthly", name: "CinePass Standard", price: 199, durationDays: 30, description: "Unlimited access to the SineSarili film collection.", perks: ["Every film in the collection", "Every series and episode"], badge: "" },
  { id: "vip_monthly", name: "Cinephile VIP", price: 399, durationDays: 30, description: "Enjoy the full collection and support Filipino filmmakers.", perks: ["Everything in Standard", "Extra support for Filipino filmmakers"], badge: "Most popular" },
  { id: "patron_annual", name: "SineSarili Patron", price: 2499, durationDays: 365, description: "Our longest pass, with an even bigger contribution to local stories.", perks: ["Our longest access period", "Our biggest contribution to local stories"], badge: "" },
];

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export class PlanValidationError extends Error {}

export function durationFor(planId: string, plans: Plan[] = DEFAULT_PLANS) {
  return plans.find(plan => plan.id === planId)?.durationDays ?? (planId === "patron_annual" ? 365 : 30);
}

function cleanPlan(base: Plan, input: Record<string, unknown> | undefined, strict: boolean): Plan {
  const price = Number(input?.price);
  const validPrice = Number.isInteger(price) && price >= 1 && price <= 100000;
  if (strict && !validPrice) throw new PlanValidationError(`${base.name}: price must be a whole number from ₱1 to ₱100,000`);
  const days = Number(input?.durationDays);
  const validDays = Number.isInteger(days) && days >= 1 && days <= MAX_DURATION_DAYS;
  if (strict && !validDays) throw new PlanValidationError(`${base.name}: access length must be a whole number of days from 1 to ${MAX_DURATION_DAYS}`);
  const name = text(input?.name, 60);
  if (strict && !name) throw new PlanValidationError("Every plan needs a name");
  const perks = Array.isArray(input?.perks) ? input.perks.map(perk => text(perk, 90)).filter(Boolean).slice(0, 6) : base.perks;
  return {
    id: base.id,
    name: name || base.name,
    price: validPrice ? price : base.price,
    durationDays: validDays ? days : base.durationDays,
    description: input && "description" in input ? text(input.description, 200) : base.description,
    perks,
    badge: input && "badge" in input ? text(input.badge, 24) : base.badge,
  };
}

function merge(stored: unknown, strict: boolean): Plan[] {
  const list = Array.isArray(stored) ? stored as Record<string, unknown>[] : [];
  return DEFAULT_PLANS.map(base => cleanPlan(base, list.find(item => item?.id === base.id), strict));
}

export async function getPlans(): Promise<Plan[]> {
  const setting = await SystemSetting.findOne({ key: SETTING_KEY }).lean();
  return merge(setting?.value, false);
}

export async function savePlans(input: unknown): Promise<Plan[]> {
  if (!Array.isArray(input) || PLAN_IDS.some(id => !input.some(item => item?.id === id))) {
    throw new PlanValidationError("Send all three plans");
  }
  const plans = merge(input, true);
  await SystemSetting.updateOne(
    { key: SETTING_KEY },
    { $set: { value: plans, description: "CinePass plan names, prices, access length, and perks" } },
    { upsert: true }
  );
  return plans;
}
