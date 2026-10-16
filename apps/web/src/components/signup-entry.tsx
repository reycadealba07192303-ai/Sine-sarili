"use client";

import { useSearchParams } from "next/navigation";
import { SignupForm } from "@/components/signup-form";

export function SignupEntry() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const requestedReturn = searchParams.get("returnTo") ?? "";
  const returnTo = (requestedReturn.startsWith("/subscribe/activate?") || /^\/subscribe\?plan=(standard_monthly|vip_monthly|patron_annual)$/.test(requestedReturn)) ? requestedReturn : "/";
  const resetMode = searchParams.get("mode") === "reset" && Boolean(token);
  return <SignupForm returnTo={returnTo} initialMode={resetMode ? "reset" : searchParams.get("mode") === "signin" ? "signin" : "create"} resetToken={resetMode ? token : ""} />;
}
