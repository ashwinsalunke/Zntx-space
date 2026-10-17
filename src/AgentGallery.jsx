import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolExamples } from "./tool-examples.js";
import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Atom, BookOpen, CalendarClock, CheckCheck, ChevronRight,
  CirclePlay, Database, FileSearch, FileText, FlaskConical,
  GraduationCap, Library, ListFilter, Network, PenLine, Presentation,
  Quote, Search, ShieldCheck, SlidersHorizontal, Table2, Telescope,
  TestTubeDiagonal, X,
} from "lucide-react";
import AiPanel from "./AiPanel.jsx";
import { Modal, useApp } from "./App.jsx";
import {
  AGENT_WORKFLOWS, WORKFLOW_CATEGORIES, WORKFLOW_DOMAINS,
  RESEARCH_ROUTINES, filterWorkflows, workflowPrompt, workflowRoute,
} from "./agent-workflows.js";
import "./agent-gallery.css";

const toolMeta = {
  search: { label: "Publication search", icon: Search, color: "blue" },
  papers: { label: "Research papers", icon: BookOpen, color: "red" },
  library: { label: "My Library", icon: Library, color: "blue" },
  pubmed: { label: "PubMed", icon: FileSearch, color: "blue" },
  ai: { label: "ScrapeTx AI", icon: Telescope, color: "violet" },
  table: { label: "Evidence table", icon: Table2, color: "orange" },
  check: { label: "Review checklist", icon: CheckCheck, color: "blue" },
  compound: { label: "PubChem compounds", icon: FlaskConical, color: "teal" },
  trials: { label: "ClinicalTrials.gov", icon: TestTubeDiagonal, color: "violet" },
  safety: { label: "openFDA labels", icon: ShieldCheck, color: "red" },
  writer: { label: "Writing workspace", icon: PenLine, color: "blue" },
  pdf: { label: "PDF reader", icon: FileText, color: "red" },
  diagram: { label: "Concept diagrams", icon: Network, color: "violet" },
  dataset: { label: "Dataset discovery", icon: Database, color: "pink" },
  quote: { label: "Source citations", icon: Quote, color: "orange" },
  slides: { label: "Presentations", icon: Presentation, color: "orange" },
  python: { label: "Python packages", icon: Atom, color: "blue" },
};
const categoryIcons = [SlidersHorizontal, BookOpen, Search, CheckCheck, FlaskConical, Table2, PenLine];
const needsInput = (item) => !["projects", "citations", "pdf", "extract"].includes(item.route);

export function WorkflowToolIcons({ tools }) {
  return (
    <div className="workflow-tool-icons" role="img" aria-label={`Tools: ${tools.map((id) => toolMeta[id]?.label).filter(Boolean).join(", ")}`}>
      {tools.map((id) => {
        const meta = toolMeta[id];
        if (!meta) return null;
        const Icon = meta.icon;
        return <span key={id} className={`workflow-tool-icon workflow-tool-${meta.color}`} title={meta.label} aria-hidden="true"><Icon size={19} strokeWidth={2.2} /></span>;
      })}
    </div>
  );
}

function TaskDialog({ item, initialPreview, onClose }) {
  const { navigate, library = [] } = useApp();
  const [preview, setPreview] = useState(initialPreview);
  const [input, setInput] = useState(item.route === "ai" ? "" : item.example);
  const [useSources, setUseSources] = useState(false);
  const [confirmedInput, setConfirmedInput] = useState("");
  const eligibleSources = library.filter((source) => source.abstract?.trim() && source.title).slice(0, 16);
  let remainingEvidence = 72000;
  const sources = useSources ? eligibleSources.map((source) => {
    const abstract = source.abstract.slice(0, Math.min(remainingEvidence, 8000));
    remainingEvidence -= abstract.length;
    return { title: source.title, abstract, url: source.url || source.sourceUrl || "" };
  }).filter((source) => source.abstract) : [];
  const isAI = item.route === "ai";
  const ready = !needsInput(item) || Boolean(input.trim());
  const run = (event) => {
    event?.preventDefault();
    if (!ready) return;
    if (isAI) setConfirmedInput(input.trim());
    else navigate(workflowRoute(item, input));
  };
  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="workflow-dialog">
        <WorkflowToolIcons tools={item.tools} />
        <p className="workflow-dialog-intro">{item.description}</p>
        <div className="workflow-dialog-tabs" aria-label="Workflow details">
          <button type="button" onClick={() => setPreview(false)} aria-pressed={!preview}>Run task</button>
          <button type="button" onClick={() => setPreview(true)} aria-pressed={preview}>Output & process</button>
        </div>
        {preview ? (
          <div className="workflow-output-guide">
            <h3>What you will get</h3>
            <ul>{item.output.map((line) => <li key={line}>{line}</li>)}</ul>
            <h3>How it works</h3>
            <ol>{item.steps.map((line) => <li key={line}>{line}</li>)}</ol>
            <p className="workflow-output-note">This describes the output structure. Results are created from your task and the sources available when you run it.</p>
            {item.caution && <p className="workflow-output-note">{item.caution}</p>}
            <button className="workflow-primary" type="button" onClick={() => setPreview(false)}>Set up this task <ArrowRight size={16} aria-hidden="true" /></button>
          </div>
        ) : (
          <form className="workflow-task-form" onSubmit={run}>
            <label htmlFor="workflow-task-input">{isAI ? "Your task and source material" : ["pdf", "extract"].includes(item.route) ? "Question for your PDF" : "Research question or topic"}{!needsInput(item) && <span>Optional</span>}</label>
            <textarea id="workflow-task-input" rows={isAI ? 7 : 4} maxLength={isAI ? 18000 : 1500} value={input} onChange={(event) => { setInput(event.target.value); setConfirmedInput(""); }} placeholder={isAI ? item.example : "Describe the question for this task…"} required={needsInput(item)} autoFocus />
            <PromptSuggestions examples={item.example ? [item.example] : toolExamples.workflow} value={input} onChoose={value => { setInput(value); setConfirmedInput(""); }} title="Try this task" />
            {isAI && (
              <>
                <label className="workflow-source-option"><input type="checkbox" checked={useSources} onChange={(event) => { setUseSources(event.target.checked); setConfirmedInput(""); }} disabled={!eligibleSources.length} /><span>Use saved source abstracts <small>{eligibleSources.length ? `${eligibleSources.length} available · up to 16 sources` : "Save papers with abstracts to My Library first"}</small></span></label>
                {useSources && <details className="workflow-evidence-preview"><summary>Review the {sources.length} selected sources</summary><ol>{sources.map((source, index) => <li key={index}>{source.title}</li>)}</ol><p>Only use these sources if they are relevant to this task. Long abstracts are shortened to fit the request.</p></details>}
                <p className="workflow-field-note">Only the material you enter and the selected abstracts are sent to ScrapeTx AI. Remove personal information from research excerpts. Review the generated draft against the original sources.</p>
              </>
            )}
            {item.caution && <p className="workflow-field-note">{item.caution}</p>}
            <div className="workflow-task-actions">
              <button type="button" className="workflow-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="workflow-primary" disabled={!ready}>{isAI ? "Prepare task" : ["pdf", "extract"].includes(item.route) ? "Open PDF workspace" : "Open workspace"}<ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          </form>
        )}
        {!preview && isAI && confirmedInput && <AiPanel task={item.aiTask || "draft"} prompt={workflowPrompt(item, confirmedInput)} evidence={sources} label="Run with ScrapeTx AI" />}
      </div>
    </Modal>
  );
}

export default function AgentGallery() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const category = WORKFLOW_CATEGORIES.includes(params.get("category")) ? params.get("category") : "All workflows";
  const domain = WORKFLOW_DOMAINS.includes(params.get("domain")) ? params.get("domain") : "All domains";
  const [selected, setSelected] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const workflows = useMemo(() => filterWorkflows({ query, category, domain }), [query, category, domain]);
  const update = (name, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === "All workflows" || value === "All domains") next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  };
  const clear = () => setParams({}, { replace: true });
  const activeFilters = query || category !== "All workflows" || domain !== "All domains";
  return (
    <section className="workflow-gallery">
      <header className="workflow-page-heading">
        <div><div className="workflow-breadcrumb"><Link to="/">Workspace</Link><ChevronRight size={13} aria-hidden="true" /><span>Agent gallery</span></div><h1>Agent gallery</h1><p>Search publications, plan reviews, and work with your own sources.</p></div>
        <Link to="/automations" className="workflow-secondary"><CalendarClock size={17} aria-hidden="true" />Research automations</Link>
      </header>
      <div className="workflow-gallery-layout">
        <aside className={`workflow-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Filter research workflows">
          <button className="workflow-mobile-filter" type="button" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><ListFilter size={17} aria-hidden="true" />Filter workflows<span>{category === "All workflows" ? "All" : category}</span></button>
          <div className="workflow-filter-options">
            <h2>Browse by task</h2>
            {WORKFLOW_CATEGORIES.map((value, i) => {
              const Icon = categoryIcons[i];
              const count = value === "All workflows" ? AGENT_WORKFLOWS.length : AGENT_WORKFLOWS.filter((item) => item.category === value).length;
              return <button key={value} type="button" className={category === value ? "is-active" : ""} aria-pressed={category === value} onClick={() => update("category", value)}><Icon size={17} aria-hidden="true" /><span>{value}</span><small>{count}</small></button>;
            })}
            <h2>Research area</h2>
            <label className="workflow-domain-label" htmlFor="workflow-domain">Filter by domain</label>
            <select id="workflow-domain" value={domain} onChange={(event) => update("domain", event.target.value)}>{WORKFLOW_DOMAINS.map((value) => <option key={value}>{value}</option>)}</select>
            <Link to="/automations" className="workflow-filter-automation"><CalendarClock size={18} aria-hidden="true" /><span>Automations<small>Repeat a research check</small></span><ArrowRight size={15} aria-hidden="true" /></Link>
            <div className="workflow-filter-help"><GraduationCap size={20} aria-hidden="true" /><strong>Work from original sources</strong><p>Outputs come from live indexes, your documents, or clearly marked drafts. Every workflow explains its process.</p></div>
          </div>
        </aside>
        <div className="workflow-gallery-content">
          <PromptSuggestions examples={toolExamples.agents} value={query} onChoose={q => update("q", q)} title="Explore research tasks" hint="Choose a task keyword to filter the gallery." />
          <div className="workflow-search-field"><Search size={20} aria-hidden="true" /><input aria-label="Search all research agents" placeholder="Search tasks, tools, or research areas…" value={query} onChange={(event) => update("q", event.target.value)} />{query && <button type="button" onClick={() => update("q", "")} aria-label="Clear workflow search"><X size={17} aria-hidden="true" /></button>}</div>
          <div className="workflow-results-bar"><p role="status"><strong>{workflows.length}</strong> of {AGENT_WORKFLOWS.length} workflows{category !== "All workflows" && <span> · {category}</span>}</p>{activeFilters && <button type="button" onClick={clear}>Clear filters</button>}</div>
          <div className="workflow-card-grid">
            {workflows.map((item) => <article className="workflow-card" key={item.id}>
              <div className="workflow-card-content"><WorkflowToolIcons tools={item.tools} /><h2>{item.title}</h2><p>{item.description}</p><span className="workflow-card-category">{item.category}</span></div>
              <footer><button type="button" onClick={() => setSelected({ item, preview: false })} aria-label={`Run task: ${item.title}`}><CirclePlay size={17} aria-hidden="true" />Run Task</button><button type="button" onClick={() => setSelected({ item, preview: true })} aria-label={`View output: ${item.title}`}><FileText size={17} aria-hidden="true" />View Output</button></footer>
            </article>)}
          </div>
          {!workflows.length && <div className="workflow-empty"><Search size={28} aria-hidden="true" /><h2>No matching workflows</h2><p>Try fewer words or clear the task and domain filters.</p><button className="workflow-secondary" type="button" onClick={clear}>Show all workflows</button></div>}
          <section className="workflow-routines" aria-labelledby="workflow-routines-title">
            <div className="workflow-routines-heading"><div><h2 id="workflow-routines-title">Recommended research routines</h2><p>Repeat a useful check and keep a record of the results.</p></div><Link to="/automations">Open automations <ArrowRight size={15} aria-hidden="true" /></Link></div>
            <div className="workflow-routine-grid">{RESEARCH_ROUTINES.map((routine) => <article key={routine.id}><span><CalendarClock size={16} aria-hidden="true" />{routine.cadence}</span><h3>{routine.title}</h3><p>{routine.description}</p><Link to={`/automations?template=${encodeURIComponent(routine.id)}`}>Set up research watch <ArrowRight size={15} aria-hidden="true" /></Link></article>)}</div>
            <p className="workflow-routine-note">Research watches run when you choose “Run now.” These recommendations do not create a background schedule.</p>
          </section>
        </div>
      </div>
      {selected && <TaskDialog key={selected.item.id} item={selected.item} initialPreview={selected.preview} onClose={() => setSelected(null)} />}
    </section>
  );
}
