import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, BookOpen, GraduationCap, Library, FileText, ArrowRight, ArrowUpRight, Building2, LockOpen, SlidersHorizontal, X, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Modal, Button, Empty } from "./App.jsx";
import { download } from "./lib.js";
import { templates, filterTemplates, templateContent, templatePath } from "./templates.js";
import "./templates-workspace.css";

const kindIcon = (kind) => kind === "Thesis & Dissertation" ? GraduationCap : kind === "Book Series" || kind === "Book Chapter" ? Library : BookOpen;
const facets = [
  { key: "topic", label: "Topic", values: ["Medicine", "Biology", "Pharmacology", "Chemistry", "Engineering", "Social Sciences"] },
  { key: "publisher", label: "Publisher", values: ["scrapeTx", "PLOS", "Frontiers", "BMJ"] },
  { key: "university", label: "University", values: ["University of Cambridge"] },
  { key: "access", label: "Access Type", values: ["Open Access", "Not specified"] },
];
const kinds = ["Journal Article", "Thesis & Dissertation", "Book Series", ...new Set(templates.map((item) => item.kind))].filter((kind, index, all) => all.indexOf(kind) === index);
function PaperPreview({ item, large = false }) {
  return <div className={`tc-paper ${large ? "large" : ""}`} aria-hidden="true">
    <div className="tc-paper-running">{item.kind} <span>SCRAPETX</span></div>
    <strong className="tc-paper-title">{item.title}</strong>
    <p className="tc-paper-author">Author name · Department or institution</p>
    {item.sections.slice(0, large ? 5 : 4).map(({ heading, prompt }) => <div className="tc-paper-section" key={heading}><b>{heading}</b><p>{prompt}</p></div>)}
    <div className="tc-paper-footer">Writing starter <span>1</span></div>
  </div>;
}
function Facet({ facet, filters, onToggle, onClear }) {
  const [expanded, setExpanded] = useState(false);
  const chosen = filters[facet.key];
  const choices = expanded ? facet.values : facet.values.slice(0, 5);
  return <fieldset className="tc-facet"><legend>Filter by {facet.label}</legend>
    <label className="tc-filter-option"><input type="checkbox" checked={!chosen.length} onChange={onClear} /><span>All</span></label>
    {choices.map((value) => {
      const count = filterTemplates({ ...filters, [facet.key]: [value] }).length;
      return <label className="tc-filter-option" key={value}><input type="checkbox" checked={chosen.includes(value)} disabled={!count && !chosen.includes(value)} onChange={() => onToggle(value)} /><span>{value}</span><small>{count}</small></label>;
    })}
    {facet.values.length > 5 && <button className="tc-view-more" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? "View less" : `View more (${facet.values.length - 5})`}</button>}
    {facet.key === "access" && <p className="tc-filter-help">Access refers to the destination journal. All writing starters are free to use.</p>}
  </fieldset>;
}

export default function TemplatesWorkspace() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [showKinds, setShowKinds] = useState(false);
  const [preview, setPreview] = useState(null);
  const filters = {
    query: params.get("q") || "", kind: params.get("kind") || "",
    ...Object.fromEntries(facets.map(({ key }) => [key, params.getAll(key)])),
  };
  const rows = filterTemplates(filters);
  const selected = [
    ...(filters.kind ? [{ key: "kind", value: filters.kind }] : []),
    ...facets.flatMap(({ key }) => filters[key].map((value) => ({ key, value }))),
  ];
  function setFilter(key, values) {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of Array.isArray(values) ? values : [values]) if (value) next.append(key, value);
    setParams(next, { replace: true });
  }
  function toggle(key, value) {
    const current = filters[key];
    setFilter(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  }
  function remove(key, value) {
    setFilter(key, key === "kind" ? "" : filters[key].filter((v) => v !== value));
  }
  return <div className="template-catalog">
    <aside className={`tc-sidebar ${showFilters ? "open" : ""}`} id="template-filters" aria-label="Template filters">
      <div className="tc-sidebar-title"><h1>Templates</h1><button className="tc-mobile-close" aria-label="Close template filters" onClick={() => setShowFilters(false)}><X size={19} /></button></div>
      <fieldset className="tc-facet"><legend>Filter by Kind</legend><div className="tc-kind-options">
        <button className={!filters.kind ? "selected" : ""} aria-pressed={!filters.kind} onClick={() => setFilter("kind", "")}>All</button>
        {(showKinds ? kinds : kinds.slice(0, 3)).map((kind) => { const Icon = kindIcon(kind); return <button key={kind} className={filters.kind === kind ? "selected" : ""} aria-pressed={filters.kind === kind} onClick={() => setFilter("kind", filters.kind === kind ? "" : kind)}><Icon size={17} aria-hidden="true" />{kind}</button>; })}
      </div>{kinds.length > 3 && <button className="tc-view-more" onClick={() => setShowKinds(!showKinds)}>{showKinds ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{showKinds ? "View less" : `View more (${kinds.length - 3})`}</button>}</fieldset>
      {facets.map((facet) => <Facet key={facet.key} facet={facet} filters={filters} onToggle={(value) => toggle(facet.key, value)} onClear={() => setFilter(facet.key, [])} />)}
      <details className="tc-ranking-note"><summary>Journal rankings</summary><p>No dated quartile dataset is included in this catalog. Q1–Q4 rankings are not assigned to these writing starters.</p></details>
    </aside>
    <section className="tc-main" aria-label="Writing templates">
      <div className="tc-search-row"><label className="tc-search"><Search size={20} aria-hidden="true" /><span className="sr-only">Search templates</span><input value={filters.query} placeholder="Search templates, topics, or publishers" onChange={(event) => setFilter("q", event.target.value)} />{filters.query && <button aria-label="Clear template search" onClick={() => setFilter("q", "")}><X size={17} /></button>}</label><Button icon={SlidersHorizontal} className="tc-filter-toggle" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="template-filters">Filters{selected.length > 0 && ` (${selected.length})`}</Button></div>
      <div className="tc-results-heading"><p role="status" aria-live="polite">{selected.length || filters.query ? `${rows.length} of ${templates.length} templates` : `Showing all ${templates.length} templates`}</p>{(selected.length > 0 || filters.query) && <button className="tc-reset" onClick={() => setParams({}, { replace: true })}>Clear all</button>}</div>
      {selected.length > 0 && <div className="tc-applied" aria-label="Applied template filters">{selected.map(({ key, value }) => <button key={key + value} aria-label={`Remove ${value} filter`} onClick={() => remove(key, value)}>{value}<X size={13} /></button>)}</div>}
      <p className="tc-catalog-note">Editable writing starters. Publisher and university entries include original guidance to check before submission.</p>
      <div className="tc-result-list">{rows.map((item) => {
        const Icon = kindIcon(item.kind);
        return <article className="tc-result" key={item.id}>
          <div className="tc-result-copy"><h2><button onClick={() => setPreview(item)}>{item.title} Template</button></h2>
            <div className="tc-metadata"><span><Icon size={17} aria-hidden="true" />{item.kind}</span><span><Building2 size={16} aria-hidden="true" />{item.university || item.publisher}</span>{item.access === "Open Access" && <span><LockOpen size={16} aria-hidden="true" />Open Access</span>}</div>
            <p className="tc-description">{item.description}</p>
            <p className="tc-topics">{item.topics.join(" · ")}</p>
            <div className="tc-result-actions"><Link className="tc-start" to={templatePath(item)}>Start writing <ArrowRight size={17} /></Link><button className="tc-preview-link" onClick={() => setPreview(item)}>Preview structure</button>{item.guidanceUrl && <a href={item.guidanceUrl} target="_blank" rel="noopener noreferrer">Official guidance <ArrowUpRight size={14} /></a>}</div>
          </div>
          <button className="tc-preview-button" onClick={() => setPreview(item)} aria-label={`Preview ${item.title}`}><PaperPreview item={item} /></button>
        </article>;
      })}</div>
      {!rows.length && <div className="tc-no-results"><Empty icon={Search} title="No templates match these filters">Try a broader topic or remove a filter. You can start with a general Research Paper template.</Empty><Button onClick={() => setParams({}, { replace: true })}>Clear search and filters</Button></div>}
      <p className="tc-end-note">{rows.length > 0 && `${rows.length} ${rows.length === 1 ? "template" : "templates"} shown · `}Original starter content is editable and exportable in the writer.</p>
    </section>
    {preview && <Modal title="Template preview" onClose={() => setPreview(null)} wide><div className="tc-preview-dialog">
      <div className="tc-preview-intro"><span>{preview.origin}</span><h2>{preview.title}</h2><p>{preview.description}</p></div>
      <div className="tc-preview-layout"><div className="tc-preview-sections"><h3>Document structure</h3><ol>{preview.sections.map(({ heading, prompt }) => <li key={heading}><strong>{heading}</strong><p>{prompt}</p></li>)}</ol></div><div className="tc-large-preview"><PaperPreview item={preview} large />{preview.guidanceUrl && <div className="tc-guidance"><a href={preview.guidanceUrl} target="_blank" rel="noopener noreferrer">{preview.guidanceLabel}<ArrowUpRight size={15} /></a><p>{preview.guidanceNote}</p><small>Guidance checked {preview.checkedAt}</small></div>}</div></div>
      <div className="tc-preview-actions"><Link className="btn primary" to={templatePath(preview)}>Start writing <ArrowRight size={16} /></Link><Button icon={Download} onClick={() => download(preview.id + ".md", templateContent(preview), "text/markdown")}>Download starter</Button><Button onClick={() => setPreview(null)}>Close preview</Button></div>
    </div></Modal>}
  </div>;
}
