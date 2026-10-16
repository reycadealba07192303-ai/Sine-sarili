import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Anton, Oswald } from "next/font/google";
import "./globals.css";
import "./ui-repairs.css";
import "./editorial.css";
import "./account-editorial.css";
import "./admin-editorial.css";

// Editorial poster type: Anton for headlines, Oswald for labels and navigation.
const display = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const label = Oswald({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-label", display: "swap" });

export const metadata: Metadata = {
  title: "SineSarili — Filipino cinema, for everyone",
  description: "Discover Filipino films, filmmakers, and the stories shaping our cinema.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${label.variable}`}>
      <body>{children}</body>
    </html>
  );
}
