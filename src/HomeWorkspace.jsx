import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolExamples, sourceExamples } from "./tool-examples.js";
import { wantsResearchGuide } from "../shared/research-guide.js";
import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, ArrowRight, Search, FileText, PenLine, Network, Presentation,
  Quote, Database, Check, ChevronLeft, ChevronRight, Clock,
} from "lucide-react";
import { Composer, useApp } from "./App.jsx";
import { sourceUrl } from "./lib.js";
import { researchSources, researchSourcePath } from "./research-sources.js";
import { researchModePath } from "./research-modes.js";
import SourceIcon from "./SourceIcon.jsx";
import { BrandCorner, BrandTagline } from "./Brand.jsx";

const tasks = [
  [FileText, "Literature review", "review", "/chat"],
  [PenLine, "Write a draft", "draft", "/ai-writer"],
  [Network, "Create diagram", "diagram", "/diagrams"],
  [Presentation, "Make slides", "slides", "/presentation"],
];
const tools = [
  [FileText, "Literature review", "Summarize and synthesize key findings.", "/search"],
  [PenLine, "AI Writer", "Draft, edit, and refine with citations.", "/ai-writer"],
  [Database, "Extract data", "Pull structured data from papers.", "/extract-data"],
  [Quote, "Citation generator", "Generate and manage accurate citations.", "/citation-generator"],
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
    if (task === "search" && wantsResearchGuide(value)) navigate("/chat?guide=1&q=" + encodeURIComponent(value));
    else if (task === "workflow") navigate("/research-workflow?" + params);
    else if (task === "draft") navigate("/ai-writer?" + params);
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
  function scrollSources(distance) {
    sourceRail.current?.scrollBy({ left: distance, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  return (
    <div className="studio-home">
      <section className="studio-hero">
        <div className="studio-heading">
          <div><span className="studio-kicker">Research workspace</span>
            <h1>Your research <span className="studio-heading-accent">workspace<BrandCorner /></span></h1>
            <p className="studio-intro">Find papers, compare evidence, and keep track of your sources.</p>
          </div>
          <aside className="studio-brand-note" aria-label="Research, distilled"><BrandTagline /><p>From complexity to clarity.<br />Find. Understand. Extract.</p></aside>
        </div>
        <div className="studio-composer-frame"><Composer value={value} setValue={setValue} onSubmit={() => submit()} mode={mode}
          setMode={setMode} researchMode={researchMode} setResearchMode={(id) => {setResearchMode(id);setSource("deep");}} placeholder={source === "deep" ? "Ask a research question, compare studies, or explore a drug…" : active.placeholder} /></div>
        <PromptSuggestions key={source + mode} examples={mode === "diagram" ? toolExamples.diagrams : mode === "slides" ? toolExamples.presentation : mode === "draft" ? toolExamples.writer : mode === "review" ? toolExamples.workflow : source === "deep" ? toolExamples.home : sourceExamples[source]} value={value} onChoose={["zotero", "mendeley"].includes(source) && mode === "search" ? undefined : setValue} hint={["zotero", "mendeley"].includes(source) && mode === "search" ? "Choose a question for help with your reference library." : "Choose one to fill the input, then edit it or run the tool."} />
        <div className="home-guide-start"><Link to="/chat?guide=1&q=What%20can%20scrapeTx%20help%20me%20with%3F">What can scrapeTx help me with? <ArrowRight size={14} aria-hidden="true" /></Link><Link to="/chat?guide=1&q=I%20want%20to%20start%20a%20research%20project">Help me start a research project <ArrowRight size={14} aria-hidden="true" /></Link></div>
        <div className="home-source-heading"><span>USE</span><p>{active.description}</p>
          <div className="source-rail-controls"><button type="button" onClick={() => setAllSources(!allSources)} aria-expanded={allSources}>{allSources ? "Collapse" : "Show all"}</button>
          {!allSources && <><button type="button" aria-label="Scroll sources left" onClick={() => scrollSources(-300)}><ChevronLeft size={16}/></button><button type="button" aria-label="Scroll sources right" onClick={() => scrollSources(300)}><ChevronRight size={16}/></button></>}</div>
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
          <button onClick={() => submit("workflow")}><FileText size={15} aria-hidden="true"/>Create paper & slides<ArrowUpRight size={13} aria-hidden="true"/></button>
          {tasks.map(([Icon, label, id, path]) => <button className={mode === id ? "active" : ""} key={id}
            onClick={() => value.trim() ? submit(id) : navigate(path)}>
            <Icon size={15} aria-hidden="true" />{label}<ArrowUpRight size={13} aria-hidden="true" />
          </button>)}
        </div>
      </section>
      <Link className="home-watch-link" to="/automations"><Clock size={24} aria-hidden="true"/><span className="home-watch-copy"><strong>Keep up with your research</strong><span className="home-watch-description">Save a literature or clinical-trial watch and check for new, relevant research.</span></span><span className="home-watch-action">Create a research watch <ArrowRight size={15} aria-hidden="true"/></span></Link>
      <div className="home-workbench">
        <section className="home-saved" aria-label="Recently saved sources">
          <div className="home-section-title"><h2>Recently saved</h2><Link to="/library">View library <ArrowRight size={14} /></Link></div>
          {recent.length ? <div className="home-saved-list">{recent.map((paper) => {
            const url = sourceUrl(paper);
            return <article key={paper.id}><span className="home-paper-icon"><FileText size={19} aria-hidden="true" /></span><div>
              {url ? <a href={url} target="_blank" rel="noopener noreferrer">{paper.title}<ArrowUpRight size={13} /></a> : <Link to="/library?tab=papers">{paper.title}</Link>}
              <p>{paper.authors?.slice(0, 2).join(", ") || paper.source || "Saved source"}{paper.year ? ` · ${paper.year}` : ""}</p>
            </div></article>;
          })}</div> : <div className="home-library-empty"><p>Saved sources will appear here. Use the bookmark button on any search result to keep it.</p><Link to="/search">Find research papers <ArrowRight size={14} /></Link></div>}
        </section>
        <section className="home-tool-list" aria-label="Research workspace tools">
          <div className="home-section-title"><h2>Research tools</h2><Link to="/agents">View all <ArrowRight size={14} /></Link></div>
          <div className="home-tool-grid">{tools.map(([Icon, title, description, path]) => <Link to={path} className="home-tool-row" key={path}>
            <span className="home-tool-icon"><Icon size={24} aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div><ArrowRight size={15} aria-hidden="true" />
          </Link>)}</div>
        </section>
      </div>
    </div>
  );
}
