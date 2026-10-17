import React, { useState } from "react";
import { Telescope, Library, BookOpen, FlaskConical, GraduationCap, Atom, Code2, Landmark, Upload, Microscope, Globe, ScrollText, Database } from "lucide-react";
import "./source-icons.css";

const glyphs = {
  deep: Telescope, zotero: Library, mendeley: BookOpen, pubmed: FlaskConical,
  scholar: GraduationCap, arxiv: Atom, python: Code2, grants: Landmark,
  uploaded: Upload, trials: Microscope, google: Globe, patents: ScrollText, datasets: Database,
};
// Vendored from provider-owned sites; see public/source-logos/provenance.json.
const logos = {
  zotero: "zotero.png", mendeley: "mendeley.ico", pubmed: "pubmed.png",
  scholar: "scholar.ico", arxiv: "arxiv.png", python: "python.png",
  grants: "grants.png", trials: "clinicaltrials.svg", google: "google.ico", patents: "google.ico",
};
export default function SourceIcon({ source, size = 18 }) {
  const [failed, setFailed] = useState(null);
  const Icon = glyphs[source] || Database;
  const logo = logos[source];
  return <span className={`source-mark source-mark-${source}`} aria-hidden="true">{logo && failed !== source ? <img src={"/source-logos/" + logo} width={size + 4} height={size + 4} alt="" decoding="async" onError={() => setFailed(source)} /> : <Icon size={size} strokeWidth={2} />}</span>;
}
