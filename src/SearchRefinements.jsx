import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import {
  defaultResearchFilters,
  filterResearchPapers,
  filterSummary,
  normalizeResearchFilters,
  removeResearchFilter,
  researchFilterOptions,
  validateResearchFilters,
} from "./research-filters.js";
import "./search-refinements.css";

function Choices({ title, values, selected, onChange, unavailable }) {
  const [search, setSearch] = useState("");
  const choices = [...new Set([...selected, ...values])];
  const shown = choices.filter((value) => value.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return (
    <fieldset className="refine-choices">
      <legend>{title}</legend>
      {choices.length > 6 && (
        <label className="refine-option-search">
          <Search size={15} aria-hidden="true" />
          <input aria-label={`Find ${title.toLowerCase()}`} placeholder={`Find ${title.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      )}
      <div className="refine-options">
        {shown.map((value) => (
          <label key={value}>
            <input type="checkbox" checked={selected.includes(value)} onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} />
            <span>{value}</span>
          </label>
        ))}
        {!choices.length && <p className="refine-unavailable">{unavailable}</p>}
        {choices.length > 0 && !shown.length && <p className="refine-unavailable">No matching options.</p>}
      </div>
    </fieldset>
  );
}

export default function SearchRefinements({ papers = [], value = defaultResearchFilters, onChange }) {
  const id = useId();
  const trigger = useRef(null);
  const panel = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizeResearchFilters(value));
  const [touched, setTouched] = useState({});
  const options = useMemo(() => researchFilterOptions(papers), [papers]);
  const active = normalizeResearchFilters(value);
  const summary = filterSummary(active);
  const errors = validateResearchFilters(draft);
  const valid = !Object.keys(errors).length;
  const preview = valid ? filterResearchPapers(papers, draft).length : null;
  const change = (field, next) => setDraft((previous) => ({ ...previous, [field]: next }));
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const show = () => {
    if (open) return close();
    setDraft(normalizeResearchFilters(value));
    setTouched({});
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("input")?.focus();
  }, [open]);
  const numberField = (field, label, placeholder, min, max) => (
    <label className="refine-field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={min} max={max} step="1" placeholder={placeholder} value={draft[field]} onChange={(event) => change(field, event.target.value)} onBlur={() => setTouched((previous) => ({ ...previous, ...(field.startsWith("year") ? { yearFrom: true, yearTo: true } : { minCitations: true, maxCitations: true }) }))} aria-invalid={Boolean(touched[field] && errors[field])} aria-describedby={touched[field] && errors[field] ? `${id}-${field}-error` : undefined} />
      {touched[field] && errors[field] && <small id={`${id}-${field}-error`} className="refine-error">{errors[field]}</small>}
    </label>
  );
  return (
    <div className="search-refinements">
      <div className="refine-toolbar">
        <button ref={trigger} className={`refine-trigger ${summary.length ? "has-filters" : ""}`} type="button" onClick={show} aria-expanded={open} aria-controls={`${id}-panel`}>
          <SlidersHorizontal size={16} aria-hidden="true" /> More filters
          {summary.length > 0 && <span className="refine-count">{summary.length}</span>}
          <ChevronDown size={15} className={open ? "is-open" : ""} aria-hidden="true" />
        </button>
        <div className="refine-active" aria-label="Applied filters">
          {summary.map((item) => (
            <button type="button" key={item.key} onClick={() => onChange(removeResearchFilter(active, item.key))} aria-label={`Remove filter: ${item.label}`} title={item.label}>
              <span>{item.label}</span><X size={13} aria-hidden="true" />
            </button>
          ))}
          {summary.length > 0 && <button className="refine-clear-inline" type="button" onClick={() => onChange({ ...defaultResearchFilters, sort: active.sort })}>Clear filters</button>}
        </div>
        <label className="refine-sort">
          <span>Sort</span>
          <select value={active.sort} onChange={(event) => onChange({ ...active, sort: event.target.value })}>
            <option value="relevance">Most relevant</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="citations">Most cited</option>
          </select>
        </label>
      </div>
      <p className="refine-scope">Filters and sorting apply to the {papers.length.toLocaleString()} loaded records. Missing metadata is excluded when its filter is active; unknown values sort last.</p>
      {open && (
        <form id={`${id}-panel`} className="refine-panel" ref={panel} aria-label="Refine loaded literature results" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }} onSubmit={(event) => {
          event.preventDefault();
          setTouched({ yearFrom: true, yearTo: true, minCitations: true, maxCitations: true });
          if (!valid) return;
          // Sort may have changed in the toolbar while the panel was open.
          onChange({ ...normalizeResearchFilters(draft), sort: active.sort });
          close();
        }}>
          <div className="refine-panel-head"><div><h2>Refine your results</h2><p>Each filter group must match. Multiple choices within one group use “or”.</p></div><button className="refine-close" type="button" onClick={close} aria-label="Close filters"><X size={19} /></button></div>
          <div className="refine-grid">
            <fieldset className="refine-range"><legend>Publication year</legend><div>{numberField("yearFrom", "From", "Any year", 1000, new Date().getUTCFullYear() + 1)}{numberField("yearTo", "To", "Any year", 1000, new Date().getUTCFullYear() + 1)}</div><p>{options.coverage.years} of {papers.length} records have a year.</p></fieldset>
            <fieldset className="refine-range"><legend>Citation count</legend><div>{numberField("minCitations", "Minimum", "0", 0)}{numberField("maxCitations", "Maximum", "Any count", 0)}</div><p>{options.coverage.citations} of {papers.length} records supply citation counts. Unknown is not zero.</p></fieldset>
            <Choices title="Publication type" values={options.publicationTypes} selected={draft.publicationTypes} onChange={(next) => change("publicationTypes", next)} unavailable="No publication types were supplied in these results." />
            <Choices title="Journals" values={options.journals} selected={draft.journals} onChange={(next) => change("journals", next)} unavailable="No journal metadata was supplied in these results." />
            <Choices title="Conferences" values={options.conferences} selected={draft.conferences} onChange={(next) => change("conferences", next)} unavailable="No conference metadata was supplied in these results." />
            <fieldset className="refine-access"><legend>Access</legend><label><input type="checkbox" checked={draft.openAccess} onChange={(event) => change("openAccess", event.target.checked)} /><span>Verified open access only</span></label><p>{options.coverage.openAccess} of {papers.length} records are marked open access by a source. Unreported access is not assumed.</p></fieldset>
            <label className="refine-field refine-keyword"><span>Include keywords or phrases</span><input type="text" value={draft.includeKeywords} maxLength={2000} onChange={(event) => change("includeKeywords", event.target.value)} placeholder="e.g. semaglutide, cardiovascular" /><small>Separate phrases with commas. Every phrase must appear in the title, abstract, or supplied keywords.</small></label>
            <label className="refine-field refine-keyword"><span>Exclude keywords or phrases</span><input type="text" value={draft.excludeKeywords} maxLength={2000} onChange={(event) => change("excludeKeywords", event.target.value)} placeholder="e.g. protocol, animal model" /><small>Separate phrases with commas. A match to any phrase removes the record. Matching ignores case.</small></label>
          </div>
          <div className="refine-panel-footer"><span role="status">{valid ? `${preview} of ${papers.length} loaded records match` : "Check the highlighted ranges before applying."}</span><div><button className="refine-reset" type="button" onClick={() => { setDraft({ ...defaultResearchFilters, sort: active.sort }); setTouched({}); }}>Clear</button><button className="refine-cancel" type="button" onClick={close}>Cancel</button><button className="refine-apply" type="submit" disabled={!valid}><Check size={15} aria-hidden="true" />Apply filters</button></div></div>
        </form>
      )}
    </div>
  );
}

export function SearchProcess({ query, source, loading = false, loadedCount = 0 }) {
  return (
    <ol className="search-process" aria-label="Research process">
      {[
        ["Search", query || "Enter a question"],
        ["Retrieve", loading ? `Searching ${source || "sources"}…` : source || "Choose a source"],
        ["Review", `${loadedCount} records loaded`],
        ["Keep", "Save sources and citations"],
      ].map(([label, detail], index) => <li key={label}><span className="search-process-number">{index + 1}</span><div><strong>{label}</strong><span title={detail}>{detail}</span></div>{index < 3 && <ArrowRight size={14} aria-hidden="true" />}</li>)}
    </ol>
  );
}
