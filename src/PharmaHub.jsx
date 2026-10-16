import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  Microscope,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TestTubeDiagonal,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button, Empty, Modal, useApp } from "./App.jsx";
import { api, download, excerpt } from "./lib.js";
import "./pharma.css";

const tools = [
  {
    id: "drugs",
    label: "Drug discovery",
    icon: FlaskConical,
    source: "PubChem",
    url: "https://pubchem.ncbi.nlm.nih.gov/",
    title: "Start with a molecule",
    description:
      "Find compound identifiers, structures, properties, and links to primary chemical records.",
    placeholder: "Search a compound name, e.g. metformin",
    examples: ["Metformin", "Semaglutide", "Ibuprofen"],
    noun: "compounds",
  },
  {
    id: "trials",
    label: "Clinical trials",
    icon: TestTubeDiagonal,
    source: "ClinicalTrials.gov",
    url: "https://clinicaltrials.gov/",
    title: "Follow the clinical evidence",
    description:
      "Explore registered studies, recruitment status, interventions, and study designs.",
    placeholder: "Search a condition, intervention, or trial ID",
    examples: ["GLP-1 obesity", "Breast cancer", "Alzheimer disease"],
    noun: "studies",
  },
  {
    id: "safety",
    label: "Safety labels",
    icon: ShieldCheck,
    source: "openFDA",
    url: "https://open.fda.gov/apis/drug/label/",
    title: "Read the source label",
    description:
      "Search US drug labeling and inspect indications, warnings, and adverse reaction text.",
    placeholder: "Search a generic or brand drug name",
    examples: ["Metformin", "Atorvastatin", "Ozempic"],
    noun: "labels",
  },
  {
    id: "pubmed",
    label: "PubMed literature",
    icon: BookOpen,
    source: "PubMed / NCBI",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
    title: "Build a biomedical reading list",
    description:
      "Search biomedical literature, review abstracts, and save papers to your research library.",
    placeholder: "Search a research question, drug, or disease",
    examples: [
      "GLP-1 cardiovascular outcomes",
      "Drug repurposing",
      "CRISPR delivery",
    ],
    noun: "papers",
  },
];
const asText = (value) =>
  Array.isArray(value)
    ? value.filter(Boolean).join("; ")
    : value == null
      ? ""
      : String(value);
const safeURL = (value) => {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
const keyOf = (r, index) =>
  r.id || r.cid || r.nctId || r.pmid || `record-${index}`;
function SourceLink({
  href,
  children = "View source record",
  className = "pharma-source-link",
}) {
  const url = safeURL(href);
  return url ? (
    <a className={className} href={url} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  ) : null;
}
function Field({ label, value }) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length))
    return null;
  return (
    <div className="pharma-field">
      <dt>{label}</dt>
      <dd>{asText(value)}</dd>
    </div>
  );
}
function recordTitle(r, tab) {
  return (
    r.title ||
    r.name ||
    r.preferredName ||
    asText(r.brandNames || r.genericNames) ||
    r.genericName ||
    r.brandName ||
    r.briefTitle ||
    (tab === "drugs"
      ? `Compound ${r.cid || r.id || "record"}`
      : "Source record")
  );
}
function recordURL(r, tab) {
  return (
    r.url ||
    r.sourceUrl ||
    (tab === "drugs" && r.cid
      ? `https://pubchem.ncbi.nlm.nih.gov/compound/${r.cid}`
      : null)
  );
}
function toLibraryRecord(record, tab) {
  if (tab === "pubmed") return record;
  return { ...record, id: `${tab}-${keyOf(record, 0)}`, title: recordTitle(record, tab),
    authors: record.authors || [], year: record.year || null, url: recordURL(record, tab) || "",
    abstract: record.summary || record.description || [record.indications, record.warnings].flat().filter(Boolean).join("\n").slice(0,12000),
    type: {drugs:"compound",trials:"clinical-trial",safety:"drug-label"}[tab],
    source: tools.find(t=>t.id===tab).source, citations: null, retrievedAt: new Date().toISOString() };
}
function Details({ record: r, tab, onClose }) {
  return (
    <Modal title={recordTitle(r, tab)} onClose={onClose} wide>
      <div className="pharma-detail">
        <div className="pharma-card-meta">
          <span>{r.source || tools.find((t) => t.id === tab).source}</span>
          <span>{asText(r.id || r.cid || r.nctId || r.pmid)}</span>
        </div>
        {tab === "drugs" && (
          <>
            <dl className="pharma-properties">
              <Field
                label="Molecular formula"
                value={r.molecularFormula || r.formula}
              />
              <Field
                label="Molecular weight"
                value={r.molecularWeight ? `${r.molecularWeight} g/mol` : null}
              />
              <Field label="PubChem CID" value={r.cid} />
              <Field label="XLogP" value={r.xlogp ?? r.xLogP} />
              <Field
                label="Hydrogen bond donors"
                value={r.hBondDonors ?? r.hBondDonorCount}
              />
              <Field
                label="Hydrogen bond acceptors"
                value={r.hBondAcceptors ?? r.hBondAcceptorCount}
              />
              <Field label="IUPAC name" value={r.iupacName} />
              <Field
                label="Canonical SMILES"
                value={r.canonicalSmiles || r.smiles}
              />
              <Field label="InChIKey" value={r.inchiKey} />
            </dl>
            {r.description && <p>{r.description}</p>}
            {r.mechanisms?.length > 0 && (
              <section className="pharma-label-section">
                <h3>Reported mechanisms · ChEMBL</h3>
                {r.mechanisms.map((mechanism, i) => (
                  <div className="pharma-mechanism" key={i}>
                    <p>{mechanism.description || mechanism.actionType}</p>
                    <SourceLink href={mechanism.targetUrl}>
                      {mechanism.targetId || "Target record"}
                    </SourceLink>
                  </div>
                ))}
                <p className="pharma-footnote">
                  Reported database annotations are shown as supplied. They are
                  not predictions of clinical effect.
                </p>
              </section>
            )}
          </>
        )}
        {tab === "trials" && (
          <>
            <dl className="pharma-properties">
              <Field label="Registry ID" value={r.nctId || r.id} />
              <Field label="Study status" value={r.status} />
              <Field label="Phase" value={r.phases || r.phase} />
              <Field label="Study type" value={r.studyType} />
              <Field label="Enrollment" value={r.enrollment} />
              <Field label="Sponsor" value={r.sponsor} />
              <Field label="Conditions" value={r.conditions} />
              <Field label="Interventions" value={r.interventions} />
              <Field label="Start date" value={r.startDate} />
              <Field label="Completion date" value={r.completionDate} />
            </dl>
            <h3>Registry summary</h3>
            <p>
              {r.summary ||
                r.description ||
                "A summary was not provided in this registry response. Open the registry record for the complete study details."}
            </p>
            {r.eligibility && (
              <>
                <h3>Eligibility criteria</h3>
                <p className="pharma-preserve">{r.eligibility}</p>
              </>
            )}
          </>
        )}
        {tab === "safety" && (
          <>
            <dl className="pharma-properties">
              <Field
                label="Generic name"
                value={r.genericNames || r.genericName}
              />
              <Field label="Brand name" value={r.brandNames || r.brandName} />
              <Field
                label="Manufacturer"
                value={r.manufacturers || r.manufacturer}
              />
              <Field label="Route" value={r.routes || r.route} />
              <Field label="Label updated" value={r.effectiveDate} />
            </dl>
            {[
              ["Indications and usage", r.indications || r.indicationsAndUsage],
              ["Boxed warning", r.boxedWarning],
              [
                "Warnings and precautions",
                r.warnings || r.warningsAndPrecautions,
              ],
              ["Adverse reactions", r.adverseReactions],
              ["Drug interactions", r.drugInteractions],
              ["Contraindications", r.contraindications],
            ]
              .filter(([, value]) => value?.length)
              .map(([label, value]) => (
                <section className="pharma-label-section" key={label}>
                  <h3>{label}</h3>
                  <p className="pharma-preserve">{asText(value)}</p>
                </section>
              ))}
            <p className="pharma-footnote">
              This is source label text. Verify the current complete label and
              its applicability in the source record.
            </p>
          </>
        )}
        {tab === "pubmed" && (
          <>
            <p className="pharma-detail-authors">{asText(r.authors)}</p>
            <dl className="pharma-properties">
              <Field label="Journal" value={r.journal} />
              <Field label="Year" value={r.year} />
              <Field label="DOI" value={r.doi} />
              <Field label="PubMed ID" value={r.pmid} />
            </dl>
            <h3>Abstract</h3>
            <p className="pharma-preserve">
              {r.abstract ||
                "No abstract was supplied for this record. Follow the source link to inspect the publication."}
            </p>
          </>
        )}
        <SourceLink href={recordURL(r, tab)} />
      </div>
    </Modal>
  );
}
function ResultCard({ record: r, tab, onOpen, saved, onSave }) {
  const title = recordTitle(r, tab);
  const status = asText(r.status || r.phases || r.phase).replaceAll("_", " ");
  return (
    <article className={`pharma-result pharma-result-${tab}`}>
      {tab === "drugs" && (
        <div className="pharma-molecule">
          {safeURL(r.structureUrl || r.image || r.imageUrl) ? (
            <img
              src={safeURL(r.structureUrl || r.image || r.imageUrl)}
              alt={`2D chemical structure of ${title}`}
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <FlaskConical size={34} aria-hidden="true" />
          )}
        </div>
      )}
      <div className="pharma-result-body">
        <div className="pharma-card-meta">
          <span>{r.source || tools.find((t) => t.id === tab).source}</span>
          {r.year && <span>{r.year}</span>}
          {status && <span className="pharma-status">{status}</span>}
          {r.openAccess && <span>Open access</span>}
        </div>
        <button className="pharma-result-title" onClick={onOpen}>
          {title}
        </button>
        {tab === "drugs" && (
          <>
            <div className="pharma-inline-properties">
              <span>
                {r.molecularFormula || r.formula || "Formula unavailable"}
              </span>
              {r.molecularWeight && <span>{r.molecularWeight} g/mol</span>}
              {r.cid && <span>CID {r.cid}</span>}
            </div>
            {r.iupacName && (
              <p className="pharma-result-description">
                {excerpt(r.iupacName, 180)}
              </p>
            )}
          </>
        )}
        {tab === "trials" && (
          <>
            <p className="pharma-result-description">
              {excerpt(r.summary || r.description || asText(r.conditions), 260)}
            </p>
            <div className="pharma-inline-properties">
              {r.sponsor && <span>{asText(r.sponsor)}</span>}
              {r.enrollment != null && (
                <span>{asText(r.enrollment)} participants</span>
              )}
              {(r.nctId || r.id) && <span>{r.nctId || r.id}</span>}
            </div>
          </>
        )}
        {tab === "safety" && (
          <>
            <p className="pharma-result-description">
              {excerpt(
                asText(r.indications || r.indicationsAndUsage) ||
                  "Open this label to review the sections returned by openFDA.",
                260,
              )}
            </p>
            <div className="pharma-inline-properties">
              {(r.manufacturers?.length || r.manufacturer) && (
                <span>{asText(r.manufacturers || r.manufacturer)}</span>
              )}
              {(r.routes?.length || r.route) && (
                <span>{asText(r.routes || r.route)}</span>
              )}
              {r.boxedWarning?.length > 0 && (
                <span>Boxed warning in label</span>
              )}
            </div>
          </>
        )}
        {tab === "pubmed" && (
          <>
            <p className="pharma-result-authors">
              {r.authors?.slice(0, 3).join(", ") || "Authors unavailable"}
              {r.authors?.length > 3 && " et al."}
              {r.journal && ` · ${r.journal}`}
            </p>
            <p className="pharma-result-description">
              {excerpt(r.abstract, 300) ||
                "Abstract unavailable for this record."}
            </p>
          </>
        )}
        <div className="pharma-result-actions">
          <button onClick={onOpen}>
            {tab === "safety"
              ? "Read label"
              : tab === "pubmed"
                ? "Read abstract"
                : "View details"}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          <SourceLink href={recordURL(r, tab)} />
          {(
            <button onClick={onSave} aria-pressed={saved}>
              {saved ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Bookmark size={14} aria-hidden="true" />
              )}
              {saved ? "Saved to library" : "Save source"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
function exportCSV(rows) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter(
    (k) => !["image", "imageUrl", "structureUrl"].includes(k),
  );
  const quote = (value) => {
    let text = asText(
      typeof value === "object" && !Array.isArray(value) && value !== null
        ? JSON.stringify(value)
        : value,
    );
    if (/^[=+\-@\t\r]/.test(text)) text = "\'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    keys.map(quote).join(","),
    ...rows.map((row) => keys.map((k) => quote(row[k])).join(",")),
  ].join("\n");
}

export default function PharmaHub() {
  const { library = [], savePaper, notify } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(tools.some(t => t.id === params.get("tool")) ? params.get("tool") : "drugs");
  const [input, setInput] = useState(params.get("q") || "");
  const [sessions, setSessions] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState("all");
  const [exportsOpen, setExportsOpen] = useState(false);
  const request = useRef(null);
  const searchInput = useRef(null);
  const tool = tools.find((t) => t.id === tab);
  const session = sessions[tab];
  const allResults = session?.results || [];
  const results =
    tab === "trials" && filter !== "all"
      ? allResults.filter(
          (r) => asText(r.status).toUpperCase().replaceAll(" ", "_") === filter,
        )
      : tab === "pubmed" && filter === "open"
        ? allResults.filter((r) => r.openAccess)
        : allResults;
  const Icon = tool.icon;
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!exportsOpen) return;
    const close = (event) => {
      if (!event.target.closest(".pharma-export")) setExportsOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setExportsOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, [exportsOpen]);
  useEffect(() => {
    const initialTab = tools.some(t => t.id === params.get("tool")) ? params.get("tool") : "drugs";
    const initialQuery = params.get("q") || "";
    setTab(initialTab);
    setInput(initialQuery);
    if (initialQuery) search(initialQuery, initialTab);
  }, [params]);
  function changeTab(id) {
    request.current?.abort();
    setBusy(false);
    setError("");
    setFilter("all");
    setDetail(null);
    setExportsOpen(false);
    setInput(sessions[id]?.query || "");
    setTab(id);
  }
  async function search(value = input, selectedTab = tab) {
    const query = value.trim();
    if (!query) {
      searchInput.current?.focus();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setInput(query);
    setBusy(true);
    setError("");
    setFilter("all");
    setExportsOpen(false);
    try {
      const response = await api(
        `/api/biomedical/${selectedTab}?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted)
        setSessions((previous) => ({
          ...previous,
          [selectedTab]: {
            ...response,
            query,
            results:
              selectedTab === "safety"
                ? response.labels || []
                : response.results || response.papers || response.studies || [],
            events: selectedTab === "safety" ? response.results || [] : [],
            total:
              selectedTab === "safety" ? response.labels?.length || 0 : response.total,
            totalReports: selectedTab === "safety" ? response.total : null,
            fetchedAt: response.retrievedAt || new Date().toISOString(),
          },
        }));
    } catch (e) {
      if (e.name !== "AbortError")
        setError(
          e.message ||
            "The source could not be reached. Try again in a moment.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function exportResults(format) {
    const filename = `zntx-${tab}-${(session?.query || "results").replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}`;
    download(
      `${filename}.${format}`,
      format === "json"
        ? JSON.stringify(
            {
              source: session?.source || tool.source,
              sourceUrl: session?.sourceUrl || tool.url,
              query: session?.query,
              retrievedAt: session?.fetchedAt,
              results,
            },
            null,
            2,
          )
        : exportCSV(results),
      format === "json" ? "application/json" : "text/csv;charset=utf-8",
    );
    setExportsOpen(false);
    notify(`${results.length} ${tool.noun} exported.`);
  }
  return (
    <section className="page pharma-page">
      <div className="pharma-heading">
        <div>
          <div className="pharma-eyebrow">
            <Microscope size={15} aria-hidden="true" /> BIOMEDICAL WORKSPACE
          </div>
          <h1>Pharma research</h1>
          <p>From molecule to literature. Explore the evidence in one place.</p>
        </div>
        <span className="pharma-header-note">
          <span /> Public research sources
        </span>
      </div>
      <div
        className="pharma-tabs"
        role="tablist"
        aria-label="Biomedical research tools"
      >
        {tools.map((t) => {
          const TabIcon = t.icon;
          return (
            <button
              key={t.id}
              id={`pharma-tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="pharma-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => changeTab(t.id)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const index = tools.findIndex((x) => x.id === tab);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tools.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            tools.length) %
                          tools.length;
                  changeTab(tools[next].id);
                  document
                    .getElementById(`pharma-tab-${tools[next].id}`)
                    ?.focus();
                }
              }}
            >
              <TabIcon size={17} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        id="pharma-panel"
        role="tabpanel"
        aria-labelledby={`pharma-tab-${tab}`}
      >
        <div className="pharma-search-panel">
          <div className="pharma-search-intro">
            <span className="pharma-tool-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <div>
              <h2>{tool.title}</h2>
              <p>{tool.description}</p>
            </div>
          </div>
          <form
            className="pharma-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              search();
            }}
          >
            <label className="sr-only" htmlFor="pharma-query">
              {tool.placeholder}
            </label>
            <div className="pharma-search-input">
              <Search size={19} aria-hidden="true" />
              <input
                id="pharma-query"
                ref={searchInput}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={tool.placeholder}
                maxLength={300}
                autoComplete="off"
              />
              {input && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setInput("");
                    searchInput.current?.focus();
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <Button
              primary
              className="pharma-primary"
              type="submit"
              disabled={busy || !input.trim()}
              icon={busy ? LoaderCircle : Search}
            >
              {busy ? "Searching…" : "Search"}
            </Button>
          </form>
          <div className="pharma-search-examples">
            <span>Try a search</span>
            {tool.examples.map((example) => (
              <button
                key={example}
                onClick={() => search(example)}
                disabled={busy}
              >
                {example}
                <ArrowRight size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div role="alert" className="pharma-error">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <strong>Unable to search {tool.source}</strong>
              <p>{error}</p>
            </div>
            <button onClick={() => search()}>Try again</button>
          </div>
        )}
        <div className="pharma-source-note">
          <ShieldCheck size={15} aria-hidden="true" />
          <p>
            {tab === "safety"
              ? "US label text is provided for source review. It is not a complete assessment of drug safety."
              : tab === "trials"
                ? "Registration describes a study. It does not establish that an intervention is safe or effective."
                : "Source records support research and evidence review; they do not provide medical advice."}{" "}
            <SourceLink href={session?.sourceUrl || tool.url}>
              About {tool.source}
            </SourceLink>
          </p>
        </div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {busy
            ? `Searching ${tool.source}`
            : error
              ? "Search failed"
              : session
                ? `${results.length} ${tool.noun} shown for ${session.query}`
                : "Ready to search"}
        </div>
        {busy ? (
          <div className="pharma-loading" role="status">
            <LoaderCircle size={25} className="spin" aria-hidden="true" />
            <h3>Searching {tool.source}</h3>
            <p>Retrieving source records for “{input}”</p>
            <div className="pharma-skeleton" />
            <div className="pharma-skeleton" />
          </div>
        ) : session ? (
          <>
            <div className="pharma-results-toolbar">
              <div>
                <h2>
                  {results.length} {tool.noun} shown
                  {Number.isFinite(session.total) &&
                  session.total > allResults.length ? (
                    <span> of {session.total.toLocaleString()} matches</span>
                  ) : null}
                </h2>
                <p>
                  Results for <strong>“{session.query}”</strong> · Retrieved{" "}
                  {new Date(session.fetchedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="pharma-toolbar-actions">
                {["trials", "pubmed"].includes(tab) && (
                  <label className="pharma-filter">
                    <SlidersHorizontal size={14} aria-hidden="true" />
                    <span className="sr-only">Filter displayed results</span>
                    <select
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    >
                      <option value="all">All {tool.noun}</option>
                      {tab === "trials" ? (
                        <>
                          <option value="RECRUITING">Recruiting</option>
                          <option value="COMPLETED">Completed</option>
                        </>
                      ) : (
                        <option value="open">Open access</option>
                      )}
                    </select>
                  </label>
                )}
                <div className="pharma-export">
                  <Button
                    icon={Download}
                    disabled={!results.length}
                    aria-expanded={exportsOpen}
                    aria-haspopup="true"
                    onClick={() => setExportsOpen(!exportsOpen)}
                  >
                    Export
                    <ChevronDown size={13} aria-hidden="true" />
                  </Button>
                  {exportsOpen && (
                    <div className="pharma-export-menu">
                      <button onClick={() => exportResults("csv")}>
                        Download CSV<span>Spreadsheet</span>
                      </button>
                      <button onClick={() => exportResults("json")}>
                        Download JSON<span>Source records</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {results.length ? (
              <div className="pharma-results">
                {results.map((record, index) => (
                  <ResultCard
                    key={keyOf(record, index)}
                    record={record}
                    tab={tab}
                    onOpen={() => setDetail(record)}
                    saved={library.some((p) => p.id === toLibraryRecord(record, tab).id)}
                    onSave={() => savePaper(toLibraryRecord(record, tab))}
                  />
                ))}
              </div>
            ) : (
              <Empty
                icon={Search}
                title={
                  allResults.length
                    ? "No records match this filter"
                    : "No records found"
                }
              >
                {allResults.length
                  ? "Choose a different filter to see more of the returned records."
                  : "Try a generic drug name, a broader research term, or a different spelling."}
              </Empty>
            )}
            {tab === "safety" && session.events?.length > 0 && (
              <section className="pharma-events">
                <div>
                  <h2>Reported adverse events</h2>
                  <p>
                    FAERS report counts for “{session.query}”. Reports can be
                    duplicated or incomplete and do not establish causation or
                    the likelihood of an event.
                  </p>
                </div>
                <div className="pharma-event-list">
                  {session.events.slice(0, 10).map((event, i) => (
                    <div key={`${event.term}-${i}`}>
                      <span>{event.term}</span>
                      <strong>
                        {Number(event.count).toLocaleString()}
                        <small> reports</small>
                      </strong>
                    </div>
                  ))}
                </div>
                {Number.isFinite(session.totalReports) && (
                  <p className="pharma-footnote">
                    {session.totalReports.toLocaleString()} matching reports in
                    this query. Counts are source search results, not a risk
                    comparison.
                  </p>
                )}
                <SourceLink href="https://open.fda.gov/apis/drug/event/">
                  About FDA adverse event data
                </SourceLink>
              </section>
            )}
            <div className="pharma-results-footnote">
              {session.warnings?.length
                ? session.warnings
                    .map((warning) =>
                      typeof warning === "string"
                        ? warning
                        : warning.message ||
                          "Some source records could not be retrieved.",
                    )
                    .join(" ")
                : session.note ||
                  session.warning ||
                  `Showing the records returned by ${tool.source}. Search the source directly for the full dataset.`}
              <SourceLink href={session.sourceUrl || tool.url}>
                Open {tool.source}
              </SourceLink>
            </div>
          </>
        ) : (
          !error && (
            <div className="pharma-start">
              <div className="pharma-start-icon">
                <Icon size={30} aria-hidden="true" />
              </div>
              <h3>Your next research question starts here</h3>
              <p>
                {tab === "drugs"
                  ? "Look up a compound to inspect its structure and physicochemical properties."
                  : tab === "trials"
                    ? "Find registered trials for a condition or intervention, then read the original study record."
                    : tab === "safety"
                      ? "Search a drug to review labeling supplied through the FDA’s public data API."
                      : "Search the biomedical literature, read source abstracts, and collect relevant papers."}
              </p>
              <span>Live source data · No generated results</span>
            </div>
          )
        )}
      </div>
      {detail && (
        <Details record={detail} tab={tab} onClose={() => setDetail(null)} />
      )}
    </section>
  );
}
