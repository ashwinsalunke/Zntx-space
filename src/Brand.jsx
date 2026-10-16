import React from "react";

export function BrandCorner({ className = "" }) {
  return <svg className={`brand-corner ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h16v16" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function BrandTagline({ className = "" }) {
  return <span className={`brand-tagline ${className}`}>Research, <em>distilled.</em></span>;
}

export default function BrandLogo({ compact = false }) {
  if (compact) return <span className="brand-monogram"><img src="/logo.svg" alt="scrapeTx" width="40" height="40" /></span>;
  return <span className="brand-logo" role="img" aria-label="scrapeTx — Research, distilled.">
    <span className="brand-wordmark" aria-hidden="true"><span>scrape</span><span className="brand-wordmark-tx">Tx<BrandCorner /></span></span>
    <BrandTagline />
  </span>;
}
