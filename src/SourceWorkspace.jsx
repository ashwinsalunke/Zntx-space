import PersonalLibrarySources from "./PersonalLibrarySources.jsx";
import { pdfReaderLink } from "./SourcePdfReader.jsx";
import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Search,
  ArrowUpRight,
  ArrowRight,
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Globe,
  Library,
  Upload,
  FileText,
  LoaderCircle,
  Database,
  AlertCircle,
} from "lucide-react";
import { useApp, Button, Empty } from "./App.jsx";
import { api, csv, download, sourceUrl, excerpt } from "./lib.js";
import { researchSources } from "./research-sources.js";
import AiPanel from "./AiPanel.jsx";
const externalBase = {
  scholar: "https://scholar.google.com/scholar?q=",
  google: "https://www.google.com/search?q=",
  patents: "https://patents.google.com/?q=",
};
export default function SourceWorkspace() {
  const { sourceId } = useParams();
  const [params, setParams] = useSearchParams();
  const definition = researchSources.find((s) => s.id === sourceId);
  const { library, savePaper, saveNote, notify } = useApp();
  const [query, setQuery] = useState(params.get("q") || "");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [yearFrom, setYearFrom] = useState(params.get("yearFrom") || "");
  const [yearTo, setYearTo] = useState(params.get("yearTo") || "");
  const request = useRef(null);
  const personal = ["zotero", "mendeley"].includes(sourceId);
  const googleSource = !!externalBase[sourceId];
  const queryParam = params.get("q") || "";
  const yearFromParam = params.get("yearFrom") || "",
    yearToParam = params.get("yearTo") || "";
  useEffect(() => {
    setQuery(queryParam);
    setYearFrom(yearFromParam);
    setYearTo(yearToParam);
    setResult(null);
    setError("");
    if (queryParam && !personal) search(queryParam, yearFromParam, yearToParam);
    return () => request.current?.abort();
  }, [sourceId, queryParam, yearFromParam, yearToParam]);
  async function search(text = query, from = yearFrom, to = yearTo) {
    if (!text.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const filterParams = new URLSearchParams({
        source: sourceId,
        q: text.trim(),
      });
      if (["scholar", "patents"].includes(sourceId)) {
        if (from) filterParams.set("yearFrom", from);
        if (to) filterParams.set("yearTo", to);
      }
      const data = await api(
        (googleSource ? "/api/google-search/search?" : "/api/sources/search?") +
          filterParams,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) setResult(data);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (!definition)
    return (
      <section className="page">
        <Empty title="Choose a research source">
          <Link className="btn" to="/">
            Return home
          </Link>
        </Empty>
      </section>
    );
  const rows = (result?.results || []).map((r) => ({
    ...r,
    authors: r.authors || [],
    citations: r.citations ?? null,
    abstract: r.abstract || "",
    source: r.source || definition.label,
  }));
  const externalUrl = externalBase[sourceId] + encodeURIComponent(query.trim());
  const submit = (e) => {
    e.preventDefault();
    if (
      query.trim() === queryParam &&
      yearFrom === yearFromParam &&
      yearTo === yearToParam
    )
      search();
    else {
      const next = { q: query.trim() };
      if (["scholar", "patents"].includes(sourceId)) {
        if (yearFrom) next.yearFrom = yearFrom;
        if (yearTo) next.yearTo = yearTo;
      }
      setParams(next);
    }
  };
  const saveAsNote = async (r) => {
    try {
      await saveNote({
        title: r.title,
        content:
          r.abstract ||
          (r.snippet
            ? "Search result snippet (not a full article abstract): " +
              r.snippet
            : r.description) ||
          "Source record saved for review.",
        sourceUrl: sourceUrl(r) || "",
        sourceTitle: r.title,
        citations: [{ title: r.title, url: sourceUrl(r) || "" }],
      });
    } catch (e) {
      notify(e.message, true);
    }
  };
  return (
    <section className="page source-workspace">
      <Link className="source-back" to="/">
        <ArrowRight size={14} style={{ transform: "rotate(180deg)" }} /> All
        research sources
      </Link>
      <div className="source-page-heading">
        <span className="source-page-icon">
          {personal ? (
            <Library size={26} />
          ) : googleSource ? (
            <Globe size={26} />
          ) : (
            <Database size={26} />
          )}
        </span>
        <div>
          <span className="section-label">YOUR RESEARCH TOOLKIT</span>
          <h1>{definition.label}</h1>
          <p>{definition.description}</p>
        </div>
        <span className="source-mode">
          {personal
            ? "Your references"
            : googleSource
              ? "SerpAPI connector"
              : "Live source records"}
        </span>
      </div>
      {personal ? (
        <>
          <PersonalLibrarySources provider={sourceId} />
          <details className="source-library-guide">
            <summary>Connect a library or import an RIS file</summary>
            <div className="source-personal-grid">
              <article className="source-guide-card">
                <Upload size={26} />
                <h2>Bring your references with you</h2>
                <p>
                  Export a bibliography as an RIS file from{" "}
                  {definition.label.replace(" Library", "")}, then import it
                  into My Library. Titles, authors, abstracts, and source links
                  stay with your references.
                </p>
                <Link className="btn primary" to="/library?import=ris">
                  Import references <ArrowRight size={15} />
                </Link>
              </article>
              <article className="source-guide-card">
                <Library size={26} />
                <h2>
                  Connect your {sourceId === "zotero" ? "Zotero" : "Mendeley"}{" "}
                  library
                </h2>
                <p>
                  Authorize your account in Integrations, then sync new and
                  updated reference metadata into My Library. Your source
                  library stays under your control, and local notes remain with
                  imported references.
                </p>
                <Link className="btn" to="/integrations">
                  Connect and sync <ArrowUpRight size={15} />
                </Link>
              </article>
            </div>
          </details>
        </>
      ) : (
        <>
          <form className="search-form source-search" onSubmit={submit}>
            <Search size={19} />
            <input
              aria-label={"Search " + definition.label}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={definition.placeholder}
            />
            <Button
              primary
              disabled={!query.trim() || busy}
              aria-label={"Search " + definition.label}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <>
                  Search <ArrowRight size={16} />
                </>
              )}
            </Button>
          </form>
          {["scholar", "patents"].includes(sourceId) && (
            <div className="source-year-controls">
              <label>
                From year
                <input
                  aria-label="Search from year"
                  type="number"
                  min="1500"
                  max={new Date().getFullYear() + 1}
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  placeholder="Any"
                />
              </label>
              <label>
                To year
                <input
                  aria-label="Search through year"
                  type="number"
                  min="1500"
                  max={new Date().getFullYear() + 1}
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  placeholder="Any"
                />
              </label>
              <Button disabled={!query.trim() || busy} onClick={submit}>
                Apply years
              </Button>
            </div>
          )}
          {googleSource && (
            <p className="source-coverage">
              Results are retrieved through SerpAPI, a third-party provider.
              Search snippets are not article abstracts or verified findings.{" "}
              <Link to="/integrations">Manage connection</Link>
              {query.trim() && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open original search <ExternalLink size={11} />
                  </a>
                </>
              )}
            </p>
          )}
          <>
            {busy && (
              <div className="source-loading" role="status">
                <LoaderCircle className="spin" size={24} />
                <p>Finding source records…</p>
                <span>Every result links back to its original record.</span>
              </div>
            )}
            {error && (
              <div className="notice source-error" role="alert">
                <AlertCircle size={19} />
                <div>
                  <strong>Source connection needs attention</strong>
                  <p>{error}</p>
                  <div className="source-connection-actions">
                    <Button onClick={() => search()}>Try again</Button>
                    {googleSource && (
                      <Link className="btn primary" to="/integrations">
                        Connect SerpAPI
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
            {result && (
              <>
                <div className="source-results-heading">
                  <div>
                    <h2>
                      {rows.length} source{" "}
                      {rows.length === 1 ? "record" : "records"}
                    </h2>
                    <p>
                      {result.total != null
                        ? `${Number(result.total).toLocaleString()} source matches · `
                        : ""}
                      {result.source} ·{" "}
                      {new Date(result.retrievedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    icon={Download}
                    disabled={!rows.length}
                    onClick={() =>
                      download(
                        "zntx-" + sourceId + ".csv",
                        csv(rows),
                        "text/csv",
                      )
                    }
                  >
                    Export results
                  </Button>
                </div>
                {(result.warnings || []).map((w) => (
                  <p className="source-coverage" key={w}>
                    {w}
                  </p>
                ))}
                {!!rows.length && (
                  <AiPanel
                    task="synthesis"
                    prompt={`Help me understand these ${definition.label} records for the question: ${queryParam || query}. Clearly distinguish datasets, preprints, search snippets, patent records, grant notices and software metadata from clinical study findings. Search snippets cannot substantiate a paper's methods or results. Summarize only supplied descriptions, cite sources, and state what remains unknown.`}
                    evidence={rows
                      .filter((r) => r.abstract || r.snippet)
                      .slice(0, 12)
                      .map((r) => ({
                        ...r,
                        abstract:
                          r.abstract ||
                          "Search result snippet, not a full article or abstract: " +
                            r.snippet,
                      }))}
                    label="Explore these sources with ScrapeTx AI"
                  />
                )}
                <div className="source-result-list">
                  {rows.map((r) => {
                    const url = sourceUrl(r);
                    const saved = library.some((p) => p.id === r.id);
                    return (
                      <article key={r.id}>
                        <div className="source-record-top">
                          <span className="tag">
                            {r.type || definition.label}
                          </span>
                          <span>{r.year || "Date unavailable"}</span>
                        </div>
                        <h3>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {r.title}
                              <ArrowUpRight size={15} />
                            </a>
                          ) : (
                            r.title
                          )}
                        </h3>
                        <p className="source-authors">
                          {r.authors.slice(0, 4).join(", ") ||
                            r.publisher ||
                            r.source}
                        </p>
                        <p className="source-record-description">
                          {excerpt(
                            r.abstract || r.snippet || r.description,
                            650,
                          ) ||
                            "No description was supplied. Read the original record for details."}
                        </p>
                        <div className="source-record-actions">
                          <Button
                            icon={saved ? Check : Bookmark}
                            onClick={() => savePaper(r)}
                          >
                            {saved ? "Saved to library" : "Save source"}
                          </Button>
                          <button
                            className="text-btn"
                            onClick={() => saveAsNote(r)}
                          >
                            <FileText size={14} />
                            Save source note
                          </button>
                          {r.pdf && (
                            <Link className="btn" to={pdfReaderLink(r)}>
                              <FileText size={14} /> Read PDF
                            </Link>
                          )}
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Original record <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!rows.length && (
                  <Empty icon={Search} title="No matching records">
                    Try a broader topic or a different spelling.
                  </Empty>
                )}
              </>
            )}
            {!result && !busy && !error && (
              <div className="source-external-panel">
                <Search size={28} />
                <h2>Follow your next question</h2>
                <p>
                  {sourceId === "python"
                    ? "Enter an exact package name, such as pandas, rdkit, or biopython."
                    : "Search a topic to discover records from " +
                      definition.label +
                      "."}
                </p>
              </div>
            )}
          </>
        </>
      )}
    </section>
  );
}
