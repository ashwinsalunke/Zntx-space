import React from "react";
import { Telescope, Library, BookOpen, FlaskConical, GraduationCap, Atom, Code2, Landmark, Upload, Microscope, Globe, ScrollText, Database } from "lucide-react";
import "./source-icons.css";

const glyphs = {
  deep: Telescope, zotero: Library, mendeley: BookOpen, pubmed: FlaskConical,
  scholar: GraduationCap, arxiv: Atom, python: Code2, grants: Landmark,
  uploaded: Upload, trials: Microscope, google: Globe, patents: ScrollText, datasets: Database,
};
// Original source markers. Names remain visible beside every icon.
export default function SourceIcon({ source, size = 18 }) {
  const Icon = glyphs[source] || Database;
  return <span className={`source-mark source-mark-${source}`} aria-hidden="true"><Icon size={size} strokeWidth={2.1} /></span>;
}
