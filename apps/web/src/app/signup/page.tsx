import { Suspense } from "react";
import { SignupEntry } from "@/components/signup-entry";
import { SignupForm } from "@/components/signup-form";

export const metadata = { title: "Create your account | SineSarili" };

export default function SignupPage() {
  return <Suspense fallback={<SignupForm />}><SignupEntry /></Suspense>;
}
