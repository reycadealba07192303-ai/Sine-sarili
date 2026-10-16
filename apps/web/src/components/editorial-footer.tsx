import Link from "next/link";
import { BrandMarks } from "@/components/brand-marks";

export function EditorialFooter() {
  return (
    <footer className="ed-footer">
      <div className="ed-footer-main">
        <div className="ed-footer-brand">
          <Link className="wordmark" href="/" aria-label="SineSarili home"><BrandMarks /><span className="brand-name">SineSarili</span></Link>
          <p>Independent voices.<br />Unforgettable Filipino stories.</p>
        </div>
        <nav aria-label="Explore"><h3>Explore</h3><Link href="/films">All films</Link><Link href="/categories">Categories</Link><Link href="/discover">Discover</Link><Link href="/about">About</Link></nav>
        <nav aria-label="Your cinema"><h3>Your cinema</h3><Link href="/signup?mode=signin">Sign in</Link><Link href="/signup">Create an account</Link><Link href="/subscribe">Get CinePass</Link></nav>
      </div>
      <div className="ed-footer-bar">
        <span>SineSarili</span>
        <i aria-hidden="true" />
        <p>Malayang pelikula. Sariling kuwento.</p>
        <i aria-hidden="true" />
        <span className="ed-footer-blocks" aria-hidden="true"><b /><b /><b /><b /><b /></span>
      </div>
      <small className="ed-footer-copy">&copy; SineSarili</small>
    </footer>
  );
}
