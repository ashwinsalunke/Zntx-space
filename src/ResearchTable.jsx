import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, LoaderCircle, Plus, RefreshCw, X } from "lucide-react";
import { Modal } from "./App.jsx";
import { ResearchText } from "./AiPanel.jsx";
import { api, download, excerpt, sourceUrl } from "./lib.js";
import {
  CORE_TABLE_COLUMNS,
  OPTIONAL_TABLE_COLUMNS,
  RESEARCH_TABLE_PAGE_SIZE,
  researchTableCsv,
  runTableExtractionQueue,
  tableCellKey,
  tableExtractionRequest,
  tableMetadata,
  tablePaperKey,
  validateTableColumn,
} from "./research-table.js";
import "./research-table.css";

function ColumnDialog({ selected, customColumns, onApply, onCreate, onClose }) {
  const [draft, setDraft] = useState(selected);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title="Add columns" onClose={onClose}>
      <div className="research-columns-dialog">
        <p className="research-table-helper">Choose metadata or create a column to extract from the supplied abstracts.</p>
        <fieldset><legend>Standard columns</legend>
          {OPTIONAL_TABLE_COLUMNS.map((column) => <label key={column.id}><input type="checkbox" checked={draft.includes(column.id)} onChange={(event) => setDraft((previous) => event.target.checked ? [...previous, column.id] : previous.filter((field) => field !== column.id))} /><span><strong>{column.label}</strong><small>{column.description}</small></span></label>)}
        </fieldset>
        <button className="research-new-column" type="button" onClick={() => setCreating((previous) => !previous)} aria-expanded={creating}><Plus size={16} aria-hidden="true" />Create a new column</button>
        {creating && <form className="research-column-form" onSubmit={(event) => {
          event.preventDefault();
          const failure = validateTableColumn(name, instruction, customColumns);
          setError(failure);
          if (failure) return;
          onApply(draft);
          onCreate({ id: crypto.randomUUID(), name: name.trim(), instruction: instruction.trim() });
          onClose();
        }}>
          <label><span>Name</span><input autoFocus maxLength={70} value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. Study population" required /></label>
          <label><span>Instruction <small>Optional</small></span><textarea rows={3} maxLength={1000} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Extract the population, sample size, and eligibility criteria, where reported." /></label>
          <p className="research-table-helper">Creating a column makes no AI request. Use Generate cells when you are ready.</p>
          {error && <p className="research-table-error" role="alert">{error}</p>}
          <button className="research-table-primary" type="submit"><Plus size={15} aria-hidden="true" />Create column</button>
        </form>}
        <div className="research-columns-footer"><button type="button" className="research-table-button" onClick={onClose}>Cancel</button><button type="button" className="research-table-primary" onClick={() => { onApply(draft); onClose(); }}><Check size={15} aria-hidden="true" />Apply columns</button></div>
      </div>
    </Modal>
  );
}

function ExtractedCell({ paper, column, cell, prefix, busy, onGenerate }) {
  const cellId = useId();
  // Cache keys contain a NUL separator; keep those keys out of DOM IDs/URLs.
  const citationPrefix = `${prefix}-${cellId}`;
  const source = sourceUrl(paper);
  if (cell?.status === "loading") return <div className="research-cell-loading" role="status"><LoaderCircle size={15} className="spin" aria-hidden="true" />Extracting from abstract…</div>;
  if (cell?.status === "error") return <div className="research-cell-error"><p>{cell.error}</p><button disabled={busy} type="button" onClick={onGenerate}><RefreshCw size={13} aria-hidden="true" />Retry cell</button></div>;
  if (!cell || cell.status === "cancelled") return <div className="research-cell-empty"><span>{cell?.status === "cancelled" ? "Generation cancelled" : "Not generated"}</span><button disabled={busy} type="button" onClick={onGenerate}>Generate cell</button></div>;
  return <div className="research-extracted-cell">
    <ResearchText text={cell.text} citations={cell.citations || []} prefix={citationPrefix} />
    {!!cell.citations?.length && <ol className="research-cell-citations">{cell.citations.map((citation, index) => <li key={citation.id} id={`${citationPrefix}-source-${index}`}>
      {source ? <a href={source} target="_blank" rel="noopener noreferrer">Original source <ExternalLink size={11} aria-hidden="true" /></a> : <span>{citation.title}</span>}
    </li>)}</ol>}
    {!cell.citations?.length && source && <a className="research-cell-source" href={source} target="_blank" rel="noopener noreferrer">Original source <ExternalLink size={11} aria-hidden="true" /></a>}
    {cell.generatedAt && <small className="research-cell-provenance">ScrapeTx Ai · Abstract evidence</small>}
    {String(paper.abstract || "").trim().length > 12000 && <small className="research-cell-provenance">Used the first 12,000 characters of the abstract.</small>}
  </div>;
}

export default function ResearchTable({ papers = [], onOpen }) {
  const prefix = useId();
  const [page, setPage] = useState(0);
  const [optionalFields, setOptionalFields] = useState([]);
  const [customColumns, setCustomColumns] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [dialog, setDialog] = useState(false);
  const [cells, setCells] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ complete: 0, total: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const job = useRef(0);
  const controller = useRef(null);
  const paperIdentity = papers.map(tablePaperKey).join("\u0001");
  const maxPage = Math.max(0, Math.ceil(papers.length / RESEARCH_TABLE_PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = papers.slice(currentPage * RESEARCH_TABLE_PAGE_SIZE, (currentPage + 1) * RESEARCH_TABLE_PAGE_SIZE);
  const columns = useMemo(() => [...CORE_TABLE_COLUMNS, ...OPTIONAL_TABLE_COLUMNS.filter((column) => optionalFields.includes(column.id))], [optionalFields]);
  const activeColumn = customColumns.find((column) => column.id === selectedColumn) || customColumns[0];
  const pending = activeColumn ? visible.filter((paper) => cells[tableCellKey(paper, activeColumn)]?.status !== "done") : [];

  function cancel() {
    job.current += 1;
    controller.current?.abort();
    setBusy(false);
    setCells((previous) => Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, value.status === "loading" ? { status: "cancelled" } : value])));
  }
  useEffect(() => {
    cancel();
    setPage(0);
    setError("");
    setMessage("");
  }, [paperIdentity]);
  useEffect(() => () => { job.current += 1; controller.current?.abort(); }, []);

  async function generate(column, rows) {
    if (busy || !column || !rows.length) return;
    const next = new AbortController();
    controller.current = next;
    const id = ++job.current;
    const batch = rows.slice(0, RESEARCH_TABLE_PAGE_SIZE);
    setBusy(true);
    setError("");
    setMessage("");
    setProgress({ complete: 0, total: batch.length });
    try {
      const status = await api("/api/ai/status", { signal: next.signal });
      if (!status.configured) throw new Error(status.error || "ScrapeTx Ai is not connected. Check Integrations before generating cells.");
      let complete = 0;
      await runTableExtractionQueue(batch, async (paper) => {
        if (next.signal.aborted || id !== job.current) return;
        const key = tableCellKey(paper, column);
        if (!String(paper.abstract || "").trim()) {
          setCells((previous) => ({ ...previous, [key]: { status: "done", text: "Not reported — no abstract was supplied by this source.", citations: [] } }));
        } else {
          setCells((previous) => ({ ...previous, [key]: { status: "loading" } }));
          try {
            const result = await api("/api/ai/generate", { method: "POST", signal: next.signal, body: JSON.stringify(tableExtractionRequest(paper, column)) });
            if (id === job.current && !next.signal.aborted) {
              if (!result.text || result.text.length > 6000 || !result.citations?.some((citation) => citation.id === "1")) throw new Error("The response did not provide a concise, source-cited cell. Retry this cell.");
              setCells((previous) => ({ ...previous, [key]: { status: "done", text: result.text, citations: result.citations, generatedAt: result.generatedAt, warnings: result.warnings || [] } }));
            }
          } catch (failure) {
            if (id === job.current && !next.signal.aborted) setCells((previous) => ({ ...previous, [key]: { status: "error", error: failure.message || "Unable to generate this cell. Please retry." } }));
          }
        }
        complete += 1;
        if (id === job.current && !next.signal.aborted) setProgress({ complete, total: batch.length });
      }, next.signal);
      if (id === job.current && !next.signal.aborted) setMessage("Batch finished. Check each cell and its original source; any failed cells can be retried.");
    } catch (failure) {
      if (id === job.current && !next.signal.aborted) setError(failure.message || "Unable to connect to ScrapeTx Ai.");
    } finally {
      if (id === job.current && !next.signal.aborted) setBusy(false);
    }
  }

  const metadataCell = (paper, column) => {
    const value = tableMetadata(paper, column.id);
    const url = sourceUrl(paper);
    if (column.id === "paper") return <><button className="research-paper-title" type="button" onClick={() => onOpen?.(paper)}>{value || "Untitled paper"}</button>{url ? <a className="research-original-link" href={url} target="_blank" rel="noopener noreferrer">Original source <ExternalLink size={11} aria-hidden="true" /></a> : <small className="research-table-unknown">Source link unavailable</small>}</>;
    if (column.id === "abstract") return value ? value.length > 280 ? <details className="research-abstract"><summary>{excerpt(value, 280)}<span>Read supplied abstract</span></summary><p>{value}</p></details> : <p className="research-abstract-short">{value}</p> : <span className="research-table-unknown">No abstract supplied. Read the original source for study evidence.</span>;
    if (column.id === "doi") return value && url ? <a href={url} target="_blank" rel="noopener noreferrer">{value}</a> : value || "—";
    if (column.id === "access") return value || <span className="research-table-unknown" title="This source did not verify open access.">—</span>;
    return value || <span className="research-table-unknown">—</span>;
  };
  return (
    <section className="research-table-workspace" aria-label="Research comparison table">
      <div className="research-table-toolbar"><div><strong>Compare the evidence</strong><span>{papers.length} loaded records · Source metadata and supplied abstracts</span></div><div><button type="button" className="research-table-button" disabled={busy} onClick={() => setDialog(true)}><Plus size={15} aria-hidden="true" />Add columns</button><button type="button" className="research-table-button" onClick={() => { download("zntx-comparison-table.csv", researchTableCsv(papers, optionalFields, customColumns, cells), "text/csv;charset=utf-8"); setMessage("Exported all loaded rows, visible columns, extracted values, and source links."); }}><Download size={15} aria-hidden="true" />Export table</button></div></div>
      {customColumns.length > 0 && <div className="research-extraction-toolbar"><label><span>Extract a column</span><select disabled={busy} value={activeColumn?.id || ""} onChange={(event) => setSelectedColumn(event.target.value)}>{customColumns.map((column) => <option value={column.id} key={column.id}>{column.name}</option>)}</select></label><button type="button" className="research-table-primary" disabled={busy || !pending.length} onClick={() => generate(activeColumn, pending)}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{busy ? `${progress.complete} / ${progress.total} processed` : pending.length ? `Generate cells (${pending.length})` : "Cells generated"}</button>{busy && <button type="button" className="research-table-button" onClick={cancel}>Cancel</button>}<p>ScrapeTx Ai uses only this page’s titles and abstracts. Up to 8 cells per batch; no AI calls run until you choose Generate.</p></div>}
      {error && <p role="alert" className="research-table-error">{error}</p>}
      {message && <p role="status" className="research-table-message">{message}</p>}
      <div className="research-table-scroll" tabIndex={0} role="region" aria-label="Comparison table. Scroll horizontally to view additional columns.">
        <table className="research-comparison-table"><caption className="research-table-sr-only">Comparison of loaded research records. AI cells summarize supplied abstract evidence and require verification.</caption><thead><tr>{columns.map((column) => <th scope="col" key={column.id} className={`research-col-${column.id}`}>{column.label}</th>)}{customColumns.map((column) => <th scope="col" key={column.id} className="research-col-custom"><span title={column.instruction || "Extract this field from supplied abstracts."}>{column.name}<small>ScrapeTx Ai</small></span><button type="button" disabled={busy} onClick={() => setCustomColumns((previous) => previous.filter((item) => item.id !== column.id))} aria-label={`Remove ${column.name} column`}><X size={14} aria-hidden="true" /></button></th>)}</tr></thead><tbody>{visible.map((paper) => <tr key={tablePaperKey(paper)}>{columns.map((column) => <td key={column.id} className={`research-col-${column.id}`}>{metadataCell(paper, column)}</td>)}{customColumns.map((column) => <td key={column.id} className="research-col-custom"><ExtractedCell paper={paper} column={column} cell={cells[tableCellKey(paper, column)]} prefix={prefix} busy={busy} onGenerate={() => generate(column, [paper])} /></td>)}</tr>)}</tbody></table>
        {!papers.length && <p className="research-table-empty">No loaded records to compare. Expand your filters or run another search.</p>}
      </div>
      <div className="research-table-pagination"><span>Showing {papers.length ? currentPage * RESEARCH_TABLE_PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * RESEARCH_TABLE_PAGE_SIZE, papers.length)} of {papers.length} loaded records. “—” means the source did not supply verified metadata.</span><div><button className="research-table-button" type="button" disabled={busy || currentPage === 0} onClick={() => { setPage((previous) => previous - 1); setMessage(""); }} aria-label="Previous table page"><ChevronLeft size={16} /></button><strong>{currentPage + 1} / {maxPage + 1}</strong><button className="research-table-button" type="button" disabled={busy || currentPage >= maxPage} onClick={() => { setPage((previous) => previous + 1); setMessage(""); }} aria-label="Next table page"><ChevronRight size={16} /></button></div></div>
      {customColumns.length > 0 && <p className="research-table-helper">Generated cells are kept in this table while it remains open. Export the table to retain them. Abstract extraction does not establish full-text findings or study quality.</p>}
      {dialog && <ColumnDialog selected={optionalFields} customColumns={customColumns} onApply={setOptionalFields} onCreate={(column) => { setCustomColumns((previous) => [...previous, column]); setSelectedColumn(column.id); setMessage(`“${column.name}” is ready. Choose Generate cells to extract the current page.`); }} onClose={() => setDialog(false)} />}
    </section>
  );
}
