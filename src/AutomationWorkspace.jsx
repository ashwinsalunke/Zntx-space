import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Bookmark, BookOpen, CheckCircle2, Clock3, Database, ExternalLink, FlaskConical, LoaderCircle, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Modal, useApp } from "./App.jsx";
import { api } from "./lib.js";
import { applyWatchResponse, createResearchWatch, watchDefinition, watchDigest, watchEndpoint, watchKinds, watchTemplateKind } from "./research-watches.js";
import "./research-watches.css";

const icons = { literature: BookOpen, trials: FlaskConical, datasets: Database };
const formatTime = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never checked";
const validWatch = (value) => value?.type === "research-watch" && typeof value.id === "string" && watchKinds.some((kind) => kind.id === value.kind);

function SourceIcon({ kind, size = 20 }) {
  const Icon = icons[kind] || BookOpen;
  return <span className={`rw-source-icon ${watchDefinition(kind).color}`}><Icon size={size} aria-hidden="true" /></span>;
}

function NewWatch({ initialKind, onClose, onCreate }) {
  const initial = watchDefinition(initialKind || "literature");
  const [kind, setKind] = useState(initial.id);
  const [title, setTitle] = useState(initial.suggestedTitle);
  const [query, setQuery] = useState(initial.example);
  const [saveDigest, setSaveDigest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      const record = createResearchWatch({ id: `watch-${crypto.randomUUID()}`, title, kind, query, saveDigest });
      await onCreate(record);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return <Modal title="Create a research watch" onClose={busy ? () => {} : onClose}>
    <form className="rw-form" onSubmit={submit}>
      <p>Save a repeatable query. Each check compares the source’s returned page with your previous successful check.</p>
      <label htmlFor="rw-kind">Research source</label>
      <select id="rw-kind" value={kind} disabled={busy} onChange={(event) => {
        const definition = watchDefinition(event.target.value);
        setKind(definition.id); setTitle(definition.suggestedTitle); setQuery(definition.example);
      }}>{watchKinds.map((definition) => <option key={definition.id} value={definition.id}>{definition.label} · {definition.source}</option>)}</select>
      <label htmlFor="rw-title">Watch name</label>
      <input id="rw-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required autoFocus disabled={busy} />
      <label htmlFor="rw-query">Search query</label>
      <textarea id="rw-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={300} rows={3} required disabled={busy} aria-describedby="rw-query-help" />
      <small id="rw-query-help">{kind === "literature" ? "PubMed query syntax is supported, including AND, OR, and date fields." : "Use a topic, drug, condition, or source identifier."}</small>
      <label className="rw-checkbox"><input type="checkbox" checked={saveDigest} onChange={(event) => setSaveDigest(event.target.checked)} disabled={busy} /><span>Save each completed check as a linked note in My Library</span></label>
      <div className="rw-form-note"><Clock3 size={16} aria-hidden="true" /><span>Suggested cadence: weekly. Checks run only when you click Run check.</span></div>
      {error && <p className="rw-error" role="alert">{error}</p>}
      <div className="rw-form-actions"><Button type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button primary disabled={busy} icon={busy ? LoaderCircle : Plus}>{busy ? "Saving…" : "Create watch"}</Button></div>
    </form>
  </Modal>;
}

function RecordList({ records, changed = false }) {
  return <ul className="rw-record-list">{records.map((record) => <li key={record.id}>
    <div><a href={record.url} target="_blank" rel="noopener noreferrer">{record.title}<ExternalLink size={14} aria-hidden="true" /></a><p>{record.id}{record.year ? ` · ${record.year}` : ""}{record.fields?.["Recruitment status"] ? ` · ${record.fields["Recruitment status"].replaceAll("_", " ")}` : ""}</p></div>
    {changed && <dl className="rw-field-changes">{record.changes.map((change) => <div key={change.field}><dt>{change.field}</dt><dd><span>{change.before}</span><span aria-hidden="true">→</span><strong>{change.after}</strong></dd></div>)}</dl>}
  </li>)}</ul>;
}

export default function AutomationWorkspace() {
  const { saveNote, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const [watches, setWatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [createKind, setCreateKind] = useState(null);
  const [deleteWatch, setDeleteWatch] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [savingDigestId, setSavingDigestId] = useState(null);
  const [errors, setErrors] = useState({});
  const [digestSaved, setDigestSaved] = useState({});
  const mounted = useRef(true);
  const runLock = useRef(false);
  const runController = useRef(null);
  const loadController = useRef(null);
  useEffect(() => { mounted.current = true; load(); return () => { mounted.current = false; runController.current?.abort(); loadController.current?.abort(); }; }, []);
  const template = params.get("template");
  useEffect(() => {
    const kind = watchTemplateKind(template);
    if (!kind || loading || loadError) return;
    setCreateKind(kind);
    setParams((previous) => { const next = new URLSearchParams(previous); next.delete("template"); return next; }, { replace: true });
  }, [template, loading, loadError, setParams]);
  const active = watches.find((watch) => watch.id === selectedId) || watches[0];

  async function load() {
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setLoadError("");
    try {
      const records = await api("/api/records/agents", { signal: controller.signal });
      if (!Array.isArray(records)) throw new Error("Your saved watches could not be read. Please retry.");
      if (!controller.signal.aborted && mounted.current) setWatches(records.filter(validWatch));
    } catch (e) { if (e.name !== "AbortError" && mounted.current) setLoadError(e.message); }
    finally { if (!controller.signal.aborted && mounted.current) setLoading(false); }
  }

  async function create(record) {
    await api(`/api/records/agents/${encodeURIComponent(record.id)}`, { method: "PUT", body: JSON.stringify(record) });
    setWatches((previous) => [record, ...previous]); setSelectedId(record.id); setCreateKind(null);
    notify("Watch saved. Run its first check to establish a baseline.");
  }

  async function saveDigest(watch) {
    setSavingDigestId(watch.id);
    try {
      const note = watchDigest(watch);
      await saveNote({ ...note, id: `watch-digest-${watch.id}-${Date.parse(watch.snapshot.checkedAt)}` });
      if (mounted.current) setDigestSaved((previous) => ({ ...previous, [watch.id]: watch.snapshot.checkedAt }));
    } finally { if (mounted.current) setSavingDigestId(null); }
  }

  async function run(watch) {
    if (runLock.current) return;
    runLock.current = true;
    const controller = new AbortController(); runController.current = controller;
    setRunningId(watch.id); setErrors((previous) => ({ ...previous, [watch.id]: "" }));
    let savedCheck = false;
    try {
      const response = await api(watchEndpoint(watch.kind, watch.query), { signal: controller.signal });
      if (controller.signal.aborted) return;
      const next = applyWatchResponse(watch, response);
      await api(`/api/records/agents/${encodeURIComponent(watch.id)}`, { method: "PUT", body: JSON.stringify(next), signal: controller.signal });
      savedCheck = true;
      if (!mounted.current) return;
      setWatches((previous) => previous.map((item) => item.id === watch.id ? next : item));
      if (next.saveDigest) await saveDigest(next);
      notify(next.lastCheck.isBaseline ? "Baseline saved. Future checks will compare with this page." : "Research check saved.");
    } catch (e) {
      if (e.name !== "AbortError" && mounted.current) setErrors((previous) => ({ ...previous, [watch.id]: savedCheck ? `The check was saved, but its library note could not be saved: ${e.message}` : `Check failed. Your last successful snapshot is unchanged. ${e.message}` }));
    } finally { runLock.current = false; if (mounted.current) setRunningId(null); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/records/agents/${encodeURIComponent(deleteWatch.id)}`, { method: "DELETE" });
      setWatches((previous) => previous.filter((item) => item.id !== deleteWatch.id));
      setDeleteWatch(null); notify("Research watch deleted. Saved library notes remain available.");
    } catch (e) { notify(e.message, true); }
    finally { setDeleting(false); }
  }

  const snapshot = active?.snapshot;
  const check = active?.lastCheck;
  const busy = Boolean(runningId || savingDigestId);
  return <section className="rw-page">
    <header className="rw-heading"><div><p className="rw-kicker">REPEATABLE RESEARCH</p><h1>Automations</h1><p>Save a watch. Check the source. Review what changed.</p></div><Button primary icon={Plus} onClick={() => setCreateKind("literature")} disabled={busy || loading}>New research watch</Button></header>
    <div className="rw-demand-note"><Clock3 size={18} aria-hidden="true" /><p><strong>Runs on demand.</strong> Weekly is a suggested cadence. Background checks and notifications are not scheduled.</p></div>
    <section className="rw-recommendations" aria-labelledby="rw-recommended-heading"><div className="rw-section-heading"><h2 id="rw-recommended-heading">Recommended watches</h2><span>Choose a starting point</span></div><div className="rw-recommendation-grid">{watchKinds.map((kind) => <article key={kind.id}><SourceIcon kind={kind.id} /><h3>{kind.label}</h3><p>{kind.description}</p><button type="button" onClick={() => setCreateKind(kind.id)} disabled={busy || loading}>Set up watch <Plus size={15} aria-hidden="true" /></button></article>)}</div></section>
    <div className="rw-section-heading rw-saved-heading"><h2>Your watches <span>{watches.length}</span></h2><Button icon={RefreshCw} disabled={busy || loading} onClick={load}>Refresh</Button></div>
    {loadError && <div className="rw-error-block" role="alert"><AlertCircle size={19} aria-hidden="true" /><div><strong>Couldn’t load saved watches</strong><p>{loadError}</p><Button onClick={load}>Try again</Button></div></div>}
    {loading ? <div className="rw-loading" role="status"><LoaderCircle size={22} className="spin" aria-hidden="true" /> Loading research watches…</div> : !watches.length ? <div className="rw-empty"><Clock3 size={28} aria-hidden="true" /><h3>Keep your next search ready</h3><p>Create a watch for a research question you revisit. Its first check saves a baseline for comparison.</p><Button onClick={() => setCreateKind("literature")} icon={Plus} disabled={Boolean(loadError)}>Create your first watch</Button></div> : <div className="rw-layout">
      <nav className="rw-watch-list" aria-label="Saved research watches">{watches.map((watch) => <button type="button" key={watch.id} onClick={() => setSelectedId(watch.id)} aria-current={active?.id === watch.id ? "true" : undefined} className={active?.id === watch.id ? "active" : ""}><SourceIcon kind={watch.kind} size={17} /><span><strong>{watch.title}</strong><small>{watchDefinition(watch.kind).source}</small></span></button>)}</nav>
      {active && <article className="rw-detail" aria-labelledby="rw-active-title">
        <div className="rw-detail-heading"><div><p className="rw-detail-source">{watchDefinition(active.kind).source} · on demand</p><h2 id="rw-active-title">{active.title}</h2></div><Button primary icon={runningId === active.id ? LoaderCircle : Play} disabled={busy || Boolean(loadError)} onClick={() => run(active)}>{runningId === active.id ? "Checking source…" : "Run check"}</Button></div>
        <div className="rw-query"><span>SEARCH QUERY</span><p>{active.query}</p></div>
        <div className="rw-check-meta"><span>Last successful check: <strong>{formatTime(snapshot?.checkedAt)}</strong></span><button type="button" onClick={() => setDeleteWatch(active)} disabled={busy}><Trash2 size={14} aria-hidden="true" />Delete watch</button></div>
        {errors[active.id] && <p className="rw-error" role="alert">{errors[active.id]}</p>}
        {runningId === active.id && <p className="rw-run-status" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" /> Retrieving one result page and comparing source identifiers and metadata…</p>}
        {!snapshot || !check ? <div className="rw-awaiting"><BookOpen size={25} aria-hidden="true" /><h3>Start with a baseline</h3><p>The first check records up to {watchDefinition(active.kind).limit} source results. Later checks show newly seen records and metadata changes within the compared pages.</p></div> : <>
          <div className="rw-result-heading"><div><h3>{check.isBaseline ? "Baseline established" : "Latest comparison"}</h3><p>{check.isBaseline ? "These are your starting records, not new-publication alerts." : `Compared with ${formatTime(check.comparedAt)}.`}</p></div><Button icon={digestSaved[active.id] === snapshot.checkedAt ? CheckCircle2 : Bookmark} disabled={busy} onClick={async () => { try { await saveDigest(active); } catch (e) { setErrors((previous) => ({ ...previous, [active.id]: `Couldn’t save the library note: ${e.message}` })); } }}>{savingDigestId === active.id ? "Saving…" : digestSaved[active.id] === snapshot.checkedAt ? "Digest saved" : "Save digest"}</Button></div>
          <div className="rw-summary-counts">{check.isBaseline ? <div><strong>{snapshot.records.length}</strong><span>Baseline records</span></div> : <><div><strong>{check.newRecords.length}</strong><span>Newly seen</span></div><div><strong>{check.changedRecords.length}</strong><span>Metadata changes</span></div><div><strong>{check.unchangedCount}</strong><span>Unchanged</span></div></>}</div>
          <p className="rw-coverage"><strong>Returned-page coverage:</strong> {snapshot.records.length} records, up to {snapshot.limit}, from {Number(snapshot.total).toLocaleString()} reported matches. This does not monitor every match. Ranking changes can surface older records. Source response retrieved {formatTime(snapshot.retrievedAt)}; short-lived API caches may be reused.{!check.isBaseline && check.notReturnedCount > 0 ? ` ${check.notReturnedCount} previously returned ${check.notReturnedCount === 1 ? "record is" : "records are"} outside the current page; this does not establish deletion or withdrawal.` : ""}</p>
          {snapshot.warnings.map((warning, index) => <p className="rw-provider-note" key={index}>{warning}</p>)}
          {check.isBaseline ? <><h4 className="rw-list-heading">Starting records</h4><RecordList records={snapshot.records} />{!snapshot.records.length && <p className="rw-no-changes">No records matched this query on the first check.</p>}</> : <>
            {check.newRecords.length > 0 && <><h4 className="rw-list-heading">Newly seen on this page</h4><RecordList records={check.newRecords} /></>}
            {check.changedRecords.length > 0 && <><h4 className="rw-list-heading">Changed source metadata</h4><RecordList records={check.changedRecords} changed /></>}
            {!check.newRecords.length && !check.changedRecords.length && <div className="rw-no-changes"><CheckCircle2 size={20} aria-hidden="true" /><p>No newly seen or changed records in the compared pages.</p></div>}
            <details className="rw-current-records"><summary>View all {snapshot.records.length} records in this check</summary><RecordList records={snapshot.records} /></details>
          </>}
          <div className="rw-library-link"><Bookmark size={16} aria-hidden="true" /><span>{active.saveDigest ? "Each successful check also saves a linked library note." : "Save a digest to keep this comparison with your research notes."} <Link to="/library?tab=notes">Open My Library</Link></span></div>
        </>}
      </article>}
    </div>}
    {createKind && <NewWatch initialKind={createKind} onClose={() => setCreateKind(null)} onCreate={create} />}
    {deleteWatch && <Modal title="Delete research watch?" onClose={deleting ? () => {} : () => setDeleteWatch(null)}><div className="rw-delete-confirm"><p>Delete <strong>{deleteWatch.title}</strong> and its comparison snapshot? Notes already saved to My Library will remain.</p><div className="rw-form-actions"><Button onClick={() => setDeleteWatch(null)} disabled={deleting}>Keep watch</Button><Button primary icon={Trash2} onClick={remove} disabled={deleting}>{deleting ? "Deleting…" : "Delete watch"}</Button></div></div></Modal>}
  </section>;
}
