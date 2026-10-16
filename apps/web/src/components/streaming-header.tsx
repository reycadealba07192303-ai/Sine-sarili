import Link from "next/link";
import { BrandMarks } from "@/components/brand-marks";
import { HeaderAccount } from "@/components/header-account";

type Section = "home" | "about" | "films" | "categories" | "discover" | "subscribe" | "account";

export function StreamingHeader({ active, overlay = false }: { active: Section; overlay?: boolean }) {
  return (
    <header className={`site-header stream-header${overlay ? "" : " catalog-header"}`}>
      <Link className="wordmark" href="/" aria-label="SineSarili home"><BrandMarks /><span className="brand-name">SineSarili</span></Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/" aria-current={active === "home" ? "page" : undefined}>Home</Link>
        <Link href="/about" aria-current={active === "about" ? "page" : undefined}>About</Link>
        <Link href="/films" aria-current={active === "films" ? "page" : undefined}>Films</Link>
        <Link href="/categories" aria-current={active === "categories" ? "page" : undefined}>Categories</Link>
        <Link href="/discover" aria-current={active === "discover" ? "page" : undefined}>Discover</Link>
      </nav>
      <div className="stream-header-actions">
        <Link href="/films" aria-label="Search films" className="search-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg></Link>
        <HeaderAccount />
      </div>
    </header>
  );
}
