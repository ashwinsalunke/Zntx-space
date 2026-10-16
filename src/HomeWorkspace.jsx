import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, ArrowRight, Search, FileText, PenLine, Network, Presentation,
  Library, BookOpen, FlaskConical, Check, ChevronLeft, ChevronRight, Clock,
} from "lucide-react";
import { Composer, useApp } from "./App.jsx";
import { sourceUrl } from "./lib.js";
import { researchSources, researchSourcePath } from "./research-sources.js";
import { researchModePath } from "./research-modes.js";
import SourceIcon from "./SourceIcon.jsx";

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
  const [researchMode, setResearchMode] = useState("deep");
  const [allSources, setAllSources] = useState(false);
  const sourceRail = useRef(null);
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
    else navigate(source === "deep" ? researchModePath(researchMode, value) : researchSourcePath(source, value));
  }
  function choose(id) {
    setSource(id);
    setMode("search");
    setResearchMode("deep");
    document.querySelector('textarea[aria-label="Research task input"]')?.focus();
  }

  return (
    <div className="studio-home">
      <section className="studio-hero">
        <h1>Your research workspace</h1>
        <p className="studio-intro">Find papers, compare evidence, and keep track of your sources.</p>
        <Composer value={value} setValue={setValue} onSubmit={() => submit()} mode={mode}
          setMode={setMode} researchMode={researchMode} setResearchMode={(id) => {setResearchMode(id);setSource("deep");}} placeholder={active.placeholder} />
        <div className="home-source-heading"><span>USE</span><p>{active.description}</p>
          <div className="source-rail-controls"><button type="button" onClick={() => setAllSources(!allSources)} aria-expanded={allSources}>{allSources ? "Collapse" : "Show all"}</button>
          {!allSources && <><button type="button" aria-label="Scroll sources left" onClick={() => sourceRail.current?.scrollBy({left:-300,behavior:"smooth"})}><ChevronLeft size={16}/></button><button type="button" aria-label="Scroll sources right" onClick={() => sourceRail.current?.scrollBy({left:300,behavior:"smooth"})}><ChevronRight size={16}/></button></>}</div>
        </div>
        <div className={`source-shortcuts ${allSources ? "show-all" : ""}`} aria-label="Research sources" ref={sourceRail} tabIndex={0}>
          {researchSources.map((item) => {
            return <button key={item.id} className={`source-shortcut ${source === item.id ? "selected" : ""}`}
              data-source={item.id} type="button" aria-pressed={source === item.id} onClick={() => choose(item.id)}>
              <SourceIcon source={item.id} /><span>{item.label}</span>
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
      <Link className="home-watch-link" to="/automations"><Clock size={17}/><span>Keep up with your research</span><span className="home-watch-description">Create a literature or clinical-trial watch</span><ArrowUpRight size={15}/></Link>
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
