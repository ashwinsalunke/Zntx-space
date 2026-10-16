import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, ArrowRight, Search, FileText, PenLine, Network, Presentation,
  Library, BookOpen, FlaskConical, GraduationCap, Atom, Code2,
  BadgeDollarSign, Upload, Microscope, Globe, ScrollText, Database, Check,
} from "lucide-react";
import { Composer, useApp } from "./App.jsx";
import { sourceUrl } from "./lib.js";
import { researchSources, researchSourcePath } from "./research-sources.js";

const icons = {
  sparkles: Search, library: Library, books: BookOpen, flask: FlaskConical,
  graduation: GraduationCap, atom: Atom, code: Code2, badge: BadgeDollarSign,
  upload: Upload, microscope: Microscope, globe: Globe, patent: ScrollText,
  database: Database,
};
const tasks = [
  [FileText, "Literature review", "review", "/chat"],
  [PenLine, "Write a draft", "draft", "/ai-writer"],
  [Network, "Create diagram", "diagram", "/diagrams"],
  [Presentation, "Make slides", "slides", "/presentation"],
];
const tools = [
  [FlaskConical, "Pharma research", "Compounds, trials, labels, and papers", "/pharma"],
  [BookOpen, "Read a PDF", "Find passages and save reading notes", "/chat-pdf"],
  [Library, "My Library", "Organize sources, notes, and saved searches", "/library"],
];

export default function HomeWorkspace() {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("search");
  const [source, setSource] = useState("deep");
  const { navigate, library } = useApp();
  const active = researchSources.find((item) => item.id === source);
  const recent = [...library]
    .sort((a, b) => new Date(b.savedAt || b.createdAt || 0) - new Date(a.savedAt || a.createdAt || 0))
    .slice(0, 3);

  function submit(task = mode) {
    const params = new URLSearchParams({ topic: value });
    if (task === "draft") navigate("/ai-writer?" + params);
    else if (task === "diagram" || task === "slides")
      navigate((task === "diagram" ? "/diagrams" : "/presentation") + "?" + params);
    else if (task === "review") navigate(researchSourcePath("deep", value));
    else navigate(researchSourcePath(source, value));
  }
  function choose(id) {
    setSource(id);
    setMode("search");
    document.querySelector('textarea[aria-label="Research task input"]')?.focus();
  }

  return (
    <div className="studio-home">
      <section className="studio-hero">
        <h1>Your research workspace</h1>
        <p className="studio-intro">Find papers, compare evidence, and keep track of your sources.</p>
        <Composer value={value} setValue={setValue} onSubmit={() => submit()} mode={mode}
          setMode={setMode} placeholder={active.placeholder} />
        <div className="home-source-heading"><span>USE</span><p>{active.description}</p></div>
        <div className="source-shortcuts" aria-label="Research sources">
          {researchSources.map((item) => {
            const Icon = icons[item.icon];
            return <button key={item.id} className={`source-shortcut ${source === item.id ? "selected" : ""}`}
              data-source={item.id} type="button" aria-pressed={source === item.id} onClick={() => choose(item.id)}>
              <Icon size={15} aria-hidden="true" /><span>{item.label}</span>
              {source === item.id && <Check size={12} aria-hidden="true" />}
            </button>;
          })}
        </div>
        <div className="studio-task-actions" aria-label="Research tasks">
          {tasks.map(([Icon, label, id, path]) => <button className={mode === id ? "active" : ""} key={id}
            onClick={() => value.trim() ? submit(id) : navigate(path)}>
            <Icon size={15} aria-hidden="true" />{label}<ArrowUpRight size={13} aria-hidden="true" />
          </button>)}
        </div>
      </section>
      <div className="home-workbench">
        <section className="home-saved" aria-label="Recently saved sources">
          <div className="home-section-title"><h2>Recently saved</h2><Link to="/library">View library <ArrowRight size={14} /></Link></div>
          {recent.length ? <div className="home-saved-list">{recent.map((paper) => {
            const url = sourceUrl(paper);
            return <article key={paper.id}><FileText size={18} aria-hidden="true" /><div>
              {url ? <a href={url} target="_blank" rel="noopener noreferrer">{paper.title}<ArrowUpRight size={13} /></a> : <Link to="/library?tab=papers">{paper.title}</Link>}
              <p>{paper.authors?.slice(0, 2).join(", ") || paper.source || "Saved source"}{paper.year ? ` · ${paper.year}` : ""}</p>
            </div></article>;
          })}</div> : <div className="home-library-empty"><p>Saved sources will appear here. Use the bookmark button on any search result to keep it.</p><Link to="/search">Find research papers <ArrowRight size={14} /></Link></div>}
        </section>
        <section className="home-tool-list" aria-label="Research workspace tools">
          <div className="home-section-title"><h2>Research tools</h2></div>
          {tools.map(([Icon, title, description, path]) => <Link to={path} className="home-tool-row" key={path}>
            <Icon size={18} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div><ArrowUpRight size={15} aria-hidden="true" />
          </Link>)}
        </section>
      </div>
    </div>
  );
}
