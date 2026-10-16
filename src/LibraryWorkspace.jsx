import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowDownToLine, ArrowUpRight, BookOpen, Check, ChevronDown,
  ExternalLink, FileText, Folder, FolderOpen, FolderPlus, Library, LoaderCircle,
  MessageSquare, Pencil, Plus, RefreshCw, Search, StickyNote, Upload, X,
} from "lucide-react";
import { Button, Empty, Modal, useApp } from "./App.jsx";
import { api, bibliographyHtml, citation, download, excerpt, sourceUrl } from "./lib.js";
import { ResearchText } from "./AiPanel.jsx";
import "./library-workspace.css";
import { PaperVerification } from "./SourceVerification.jsx";

const asArray = (value) => Array.isArray(value) ? value : value?.records || [];
const itemKey = (item) => `${item.kind}:${item.id}`;
const dateValue = (item) => new Date(item.updatedAt || item.savedAt || item.createdAt || 0).getTime() || 0;
const dateLabel = (item) => dateValue(item) ? new Date(dateValue(item)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Saved to your workspace";
const titleOf = (item) => item.title || item.query || "Untitled research note";
const isResearch = (note) => ["research-chat-turn", "literature-search"].includes(note.type);
const cleanAuthors = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : [];
const recordLabel = (item) => ({ compound: "Compound", "clinical-trial": "Clinical trial", "drug-label": "Drug label", dataset: "Dataset", grant: "Grant notice", software: "Software", book: "Book", "book-chapter": "Book chapter", preprint: "Preprint" }[item.type] || "Paper");
function noteSource(note) {
  return {
    ...note,
    title: note.sourceTitle || note.title || "Saved source",
    authors: cleanAuthors(note.authors),
    journal: note.publication || "",
  };
}
function sourcePapers(items) {
  const unique = new Map();
  for (const item of items) {
    const sources = item.kind === "paper" ? [item] : isResearch(item) ? item.result?.papers || [] : [...(sourceUrl(item) ? [noteSource(item)] : []), ...(item.citations || []).filter((p) => sourceUrl(p)).map((p) => ({ ...p, authors: cleanAuthors(p.authors) }))];
    for (const paper of sources) {
      const key = paper.doi?.toLowerCase() || sourceUrl(paper) || paper.id || paper.title;
      if (key && !unique.has(key)) unique.set(key, paper);
    }
  }
  return [...unique.values()];
}
function noteMarkdown(item) {
  if (item.kind === "paper") return `# ${item.title}\n\n${citation(item)}\n\n${item.abstract || "Abstract unavailable."}`;
  const sources = isResearch(item) ? item.result?.papers || [] : [];
  return `# ${titleOf(item)}\n\n${sourceUrl(item) ? `Source: ${sourceUrl(item)}\n\n` : ""}${item.content || item.ai?.text || (isResearch(item) ? "Saved research search; no AI synthesis was generated." : "")}\n\n${sources.length ? `## Sources\n\n${sources.map((p) => `### ${p.title}\n${citation(p)}\n\n${p.abstract || "Abstract unavailable."}`).join("\n\n")}` : (item.citations || []).length ? `## Sources\n\n${item.citations.map((p) => `${p.title || "Source"}${sourceUrl(p) ? `\n${sourceUrl(p)}` : ""}`).join("\n\n")}` : ""}`;
}
function FolderForm({ folder, onClose, onSave }) {
  const [name, setName] = useState(folder?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title={folder ? "Rename collection" : "Create a collection"} onClose={onClose}>
    <form className="lw-form" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try { await onSave(name.trim()); onClose(); } catch (e) { setError(e.message); setBusy(false); }
    }}>
      <p>Bring papers, research searches, and your own notes together around a topic.</p>
      <label htmlFor="lw-folder-name">Collection name</label>
      <input id="lw-folder-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cardiovascular evidence" maxLength={160} required autoFocus />
      {error && <p className="lw-error" role="alert">{error}</p>}
      <div className="lw-form-actions"><Button type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button primary type="submit" icon={busy ? LoaderCircle : Check} disabled={busy || !name.trim()}>{busy ? "Saving…" : folder ? "Save name" : "Create collection"}</Button></div>
    </form>
  </Modal>;
}
function NoteEditor({ note, onClose, onSave }) {
  const [form, setForm] = useState({
    title: note?.title || "", content: note?.content || "", url: note?.url || note?.sourceUrl || "",
    sourceTitle: note?.sourceTitle || "", authors: cleanAuthors(note?.authors).join("; "),
    year: String(note?.year || ""), publication: note?.publication || "", doi: note?.doi || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = (field) => (e) => setForm((v) => ({ ...v, [field]: e.target.value }));
  return <Modal title={note ? "Edit research note" : "Save a research note"} onClose={onClose} wide>
    <form className="lw-form" onSubmit={async (event) => {
      event.preventDefault(); setError("");
      if (form.url.trim() && !sourceUrl({ url: form.url.trim() })) { setError("Use a complete http or https source URL."); return; }
      if (form.doi.trim() && !/^10\.\d{4,9}\/\S+$/i.test(form.doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ""))) { setError("Use a valid DOI such as 10.1234/article, or leave the field empty."); return; }
      setBusy(true);
      try {
        await onSave({ ...note, ...form, title: form.title.trim(), url: form.url.trim(), sourceUrl: form.url.trim(), doi: form.doi.trim(), year: form.year.trim(), authors: form.authors.split(";").map((a) => a.trim()).filter(Boolean), type: "research-note", createdAt: note?.createdAt || new Date().toISOString() });
        onClose();
      } catch (e) { setError(e.message); setBusy(false); }
    }}>
      <p>Keep findings, extracted data, or reading notes with a link back to the evidence.</p>
      <label htmlFor="lw-note-title">Note title</label>
      <input id="lw-note-title" value={form.title} onChange={change("title")} maxLength={300} placeholder="What would you like to remember?" required autoFocus />
      <label htmlFor="lw-note-content">Notes or extracted data</label>
      <textarea id="lw-note-content" value={form.content} onChange={change("content")} rows={7} maxLength={150000} placeholder="Record study findings, methods, tables, or questions. Include page or section references when available." />
      <label htmlFor="lw-note-url">Original source URL <span>Optional</span></label>
      <input id="lw-note-url" type="url" value={form.url} onChange={change("url")} maxLength={3000} placeholder="https://…" />
      <details className="lw-source-fields" open={!!(note?.doi || note?.sourceTitle)}>
        <summary>Source details for your bibliography <ChevronDown size={15} aria-hidden="true" /></summary>
        <div className="lw-form-grid">
          <label className="lw-full-field" htmlFor="lw-source-title">Article or book title<input id="lw-source-title" value={form.sourceTitle} onChange={change("sourceTitle")} maxLength={700} placeholder="Use the original publication title" /></label>
          <label className="lw-full-field" htmlFor="lw-source-authors">Authors <span>Separate with semicolons</span><input id="lw-source-authors" value={form.authors} onChange={change("authors")} maxLength={4000} placeholder="Jane Smith; Alex Lee" /></label>
          <label htmlFor="lw-source-year">Publication year<input id="lw-source-year" value={form.year} onChange={change("year")} maxLength={4} inputMode="numeric" pattern="[0-9]{4}" placeholder="2026" /></label>
          <label htmlFor="lw-source-publication">Journal or publisher<input id="lw-source-publication" value={form.publication} onChange={change("publication")} maxLength={400} /></label>
          <label className="lw-full-field" htmlFor="lw-source-doi">DOI<input id="lw-source-doi" value={form.doi} onChange={change("doi")} maxLength={700} placeholder="10.1234/article" /></label>
        </div>
      </details>
      {error && <p className="lw-error" role="alert">{error}</p>}
      <div className="lw-form-actions"><Button type="button" onClick={onClose} disabled={busy}>Cancel</Button><Button primary type="submit" icon={busy ? LoaderCircle : Check} disabled={busy || !form.title.trim()}>{busy ? "Saving…" : "Save note"}</Button></div>
    </form>
  </Modal>;
}
function FolderPicker({ item, folders, onClose, onSave, onCreate }) {
  const [selected, setSelected] = useState(() => new Set(folders.filter((f) => f.itemKeys?.includes(itemKey(item))).map((f) => f.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title="Organize in collections" onClose={onClose}>
    <div className="lw-form">
      <p className="lw-picker-title">{titleOf(item)}</p>
      {!folders.length ? <Empty icon={FolderPlus} title="Create your first collection">Organize a reading list by topic, project, or course.<br /><Button icon={Plus} onClick={onCreate}>Create collection</Button></Empty> : <div className="lw-folder-picker">{folders.map((folder) => <label key={folder.id}>
        <input type="checkbox" checked={selected.has(folder.id)} onChange={(e) => setSelected((v) => { const next = new Set(v); e.target.checked ? next.add(folder.id) : next.delete(folder.id); return next; })} />
        <Folder size={18} aria-hidden="true" /><span>{folder.name}</span>
      </label>)}</div>}
      <p className="lw-helper">Removing an item from a collection keeps the original in your library.</p>
      {error && <p className="lw-error" role="alert">{error}</p>}
      <div className="lw-form-actions"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button primary disabled={busy || !folders.length} icon={busy ? LoaderCircle : Check} onClick={async () => { setBusy(true); setError(""); try { await onSave(selected); onClose(); } catch (e) { setError(e.message); setBusy(false); } }}>{busy ? "Saving…" : "Save collections"}</Button></div>
    </div>
  </Modal>;
}
function ItemDetail({ item, onClose, onEdit, onOrganize }) {
  const paper = item.kind === "paper";
  const research = isResearch(item);
  const sources = research ? item.result?.papers || [] : (item.citations || []).filter((p) => sourceUrl(p));
  const url = sourceUrl(item);
  const citations = item.ai?.citations || item.citations || [];
  const prefix = `library-${item.id}`;
  return <Modal title={paper ? "Saved source" : research ? "Saved research" : "Research note"} onClose={onClose} wide>
    <div className="lw-detail">
      <span className="lw-kind">{paper ? recordLabel(item) : research ? "Research search" : "Personal note"}</span>
      <h2>{titleOf(item)}</h2>
      {paper && <p className="lw-detail-meta">{cleanAuthors(item.authors).join(", ") || "Authors unavailable"}{item.year ? ` · ${item.year}` : ""}{item.journal ? ` · ${item.journal}` : ""}</p>}
      <div className="lw-detail-actions">
        {url && <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />Open original source</a>}
        {item.type === "literature-search" && <Link className="btn primary" to={"/search?"+new URLSearchParams({q:item.query,source:item.source || "crossref",filters:JSON.stringify(item.filters || {})})} onClick={onClose}><Search size={15}/>Run saved search</Link>}
        {research && item.chatId && <Link className="btn primary" to={`/chat/${encodeURIComponent(item.chatId)}`} onClick={onClose}><MessageSquare size={15} />Open research conversation</Link>}
        {!paper && !research && <Button icon={Pencil} onClick={onEdit}>Edit note</Button>}
        <Button icon={FolderPlus} onClick={onOrganize}>Collections</Button>
        <Button icon={ArrowDownToLine} onClick={() => download("research-note.md", noteMarkdown(item), "text/markdown")}>Export notes</Button>
      </div>
      {paper && !["webpage","patent","compound","clinical-trial","drug-label","dataset","grant","software"].includes(item.type) && <PaperVerification paper={item}/>}
      {paper && item.snippet && <section><h3>Search result snippet</h3><p className="lw-prewrap">{item.snippet}</p><p className="lw-helper">This is a search preview, not a full article abstract or verified finding.</p></section>}
      {paper && item.librarySync && <p className="lw-helper">Synced from {item.source}{item.remoteRemoved ? ". This reference was marked removed in the source library; your local copy remains available." : ". Re-sync from Integrations to retrieve source changes."}</p>}
      {paper ? <section><h3>Abstract</h3><p className="lw-prewrap">{item.abstract || "No abstract or description was supplied. Open the original source for its full details."}</p><h3>Reference</h3><p>{citation(item)}</p>{!url && <p className="lw-helper">No verified DOI or source URL is stored for this item.</p>}</section> : <section><h3>{research ? "Saved synthesis" : "Your notes"}</h3><ResearchText text={item.content || item.ai?.text || (research ? "This search was saved without an AI synthesis. Its retrieved source records remain available below." : "No note text added yet.")} citations={citations} prefix={prefix} />{citations.length > 0 && <ol className="lw-cited-sources">{citations.map((source, index) => <li key={source.id || index} id={`${prefix}-source-${index}`}>{sourceUrl(source) ? <a href={sourceUrl(source)} target="_blank" rel="noopener noreferrer">{source.title} <ArrowUpRight size={13} /></a> : source.title}</li>)}</ol>}{!research && (item.sourceTitle || url) && <><h3>Source reference</h3><p>{citation(noteSource(item))}</p></>}</section>}
      {sources.length > 0 && <section><h3>{research ? "Retrieved sources" : "Linked evidence"} <span>{sources.length}</span></h3>{research && <p className="lw-helper">These records were retrieved for this search; assess their relevance and quality before citing them.</p>}<div className="lw-source-list">{sources.map((source, index) => <div key={source.id || index}><strong>{index + 1}. {source.title}</strong>{(source.year || source.journal) && <p>{source.year || "Year unavailable"}{source.journal ? ` · ${source.journal}` : ""}</p>}{sourceUrl(source) && <a href={sourceUrl(source)} target="_blank" rel="noopener noreferrer">Open original source <ArrowUpRight size={14} /></a>}</div>)}</div></section>}
    </div>
  </Modal>;
}
export default function LibraryWorkspace() {
  const { library, notify, navigate, refreshLibrary } = useApp();
  const [params, setParams] = useSearchParams();
  const [papers, setPapers] = useState(library || []);
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(["papers", "notes", "research"].includes(params.get("tab")) ? params.get("tab") : "all");
  const [activeFolder, setActiveFolder] = useState("");
  const [sort, setSort] = useState("recent");
  const [folderForm, setFolderForm] = useState(null);
  const [noteEditor, setNoteEditor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [organize, setOrganize] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importDialog, setImportDialog] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const importInput = useRef(null);
  const importCancelled = useRef(false);
  useEffect(() => { if (library?.length) setPapers(library); }, [library]);
  useEffect(() => { setFilter(["papers", "notes", "research"].includes(params.get("tab")) ? params.get("tab") : "all"); }, [params]);
  useEffect(() => {
    if (params.get("new") === "note") setNoteEditor({});
    if (params.get("import") === "ris") setImportDialog({ name: "", records: [], reading: false, error: "" });
  }, [params]);
  async function load() {
    setLoading(true); setError("");
    try {
      const [savedPapers, savedNotes, collections] = await Promise.all([api("/api/library"), api("/api/records/notes"), api("/api/records/reviews")]);
      setPapers(asArray(savedPapers)); setNotes(asArray(savedNotes));
      setFolders(asArray(collections).filter((f) => f.type === "library-collection"));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (!exportOpen) return; const close = (e) => { if (e.key === "Escape") setExportOpen(false); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [exportOpen]);
  const items = useMemo(() => [...papers.map((p) => ({ ...p, kind: "paper" })), ...notes.map((n) => ({ ...n, kind: "note" }))], [papers, notes]);
  const counts = { all: items.length, papers: papers.length, notes: notes.filter((n) => !isResearch(n)).length, research: notes.filter(isResearch).length };
  const folder = folders.find((f) => f.id === activeFolder);
  const visible = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => (!folder || folder.itemKeys?.includes(itemKey(item))) && (filter === "all" || filter === "papers" && item.kind === "paper" || filter === "notes" && item.kind !== "paper" && !isResearch(item) || filter === "research" && isResearch(item)) && words.every((word) => `${titleOf(item)} ${cleanAuthors(item.authors).join(" ")} ${item.abstract || ""} ${item.content || ""} ${item.journal || item.publication || ""}`.toLowerCase().includes(word))).sort((a, b) => sort === "title" ? titleOf(a).localeCompare(titleOf(b)) : dateValue(b) - dateValue(a));
  }, [items, folder, filter, query, sort]);
  async function putFolder(next) {
    const result = await api(`/api/records/reviews/${encodeURIComponent(next.id)}`, { method: "PUT", body: JSON.stringify(next) });
    const saved = { ...next, updatedAt: result.updatedAt };
    setFolders((v) => [saved, ...v.filter((f) => f.id !== saved.id)]);
    return saved;
  }
  async function saveFolder(name) {
    const existing = folderForm?.id ? folderForm : null;
    const next = { ...existing, id: existing?.id || crypto.randomUUID(), type: "library-collection", name, itemKeys: existing?.itemKeys || [], createdAt: existing?.createdAt || new Date().toISOString() };
    await putFolder(next); setActiveFolder(next.id); notify(existing ? "Collection renamed." : "Collection created.");
  }
  async function saveNote(note) {
    const next = { ...note, id: note.id || crypto.randomUUID() };
    const result = await api(`/api/records/notes/${encodeURIComponent(next.id)}`, { method: "PUT", body: JSON.stringify(next) });
    const saved = { ...next, updatedAt: result.updatedAt };
    setNotes((v) => [saved, ...v.filter((n) => n.id !== saved.id)]);
    notify("Research note saved.");
    if (activeFolder && !note.id) {
      try { await putFolder({ ...folder, itemKeys: [...new Set([...(folder.itemKeys || []), itemKey({ ...saved, kind: "note" })])] }); }
      catch (e) { notify(`The note is saved in All research. Adding it to the collection failed: ${e.message}`, true); }
    }
  }
  async function saveMembership(selected) {
    const key = itemKey(organize);
    for (const currentFolder of folders) {
      const has = currentFolder.itemKeys?.includes(key);
      if (has === selected.has(currentFolder.id)) continue;
      await putFolder({ ...currentFolder, itemKeys: selected.has(currentFolder.id) ? [...new Set([...(currentFolder.itemKeys || []), key])] : currentFolder.itemKeys.filter((k) => k !== key) });
    }
    notify("Collections updated.");
  }
  async function readReferences(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportProgress(null);
    setImportDialog({ name: file.name, records: [], reading: true, error: "" });
    try {
      if (file.size > 5 * 1024 * 1024) throw Error("Choose a RIS file smaller than 5 MB.");
      const { parseRis } = await import("./library-import.js");
      const records = parseRis(await file.text());
      if (!Array.isArray(records) || !records.length) throw Error("No references were found. Export your references as a RIS file from Zotero or Mendeley.");
      if (records.length > 500) throw Error("Import up to 500 references at a time. Split this RIS export into smaller files.");
      setImportDialog({ name: file.name, records, reading: false, error: "" });
    } catch (e) { setImportDialog({ name: file.name, records: [], reading: false, error: e.message }); }
  }
  async function importReferences() {
    setImportBusy(true); importCancelled.current = false;
    const known = new Set(papers.map((p) => p.id));
    let imported = 0, skipped = 0;
    const added = [];
    setImportProgress({ imported, skipped, processed: 0, total: importDialog.records.length });
    try {
      for (const paper of importDialog.records) {
        if (importCancelled.current) break;
        if (known.has(paper.id)) skipped++;
        else {
          const result = await api("/api/library", { method: "POST", body: JSON.stringify(paper) });
          added.push({ ...paper, savedAt: result.updatedAt }); known.add(paper.id); imported++;
        }
        setImportProgress({ imported, skipped, processed: imported + skipped, total: importDialog.records.length });
      }
      if (added.length) { setPapers((v) => [...added, ...v]); setActiveFolder(""); setParams({ tab: "papers" }, { replace: true }); }
      await refreshLibrary?.();
      setImportDialog((v) => ({ ...v, complete: true, cancelled: importCancelled.current }));
      notify(`${imported} references imported${skipped ? `; ${skipped} already saved` : ""}.`);
    } catch (e) {
      if (added.length) { setPapers((v) => [...added, ...v]); setActiveFolder(""); setParams({ tab: "papers" }, { replace: true }); }
      setImportDialog((v) => ({ ...v, error: `Import stopped: ${e.message} ${imported} references have been saved. Retry to continue; existing IDs will be skipped.` }));
    } finally { setImportBusy(false); }
  }
  function exportItems(format) {
    const references = sourcePapers(visible);
    const name = (folder?.name || "zntx-library").replace(/[^a-z0-9-]/gi, "-");
    if (format === "json") download(`${name}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), collection: folder?.name || "All research", items: visible }, null, 2), "application/json");
    else if (format === "markdown") download(`${name}.md`, visible.map(noteMarkdown).join("\n\n---\n\n"), "text/markdown");
    else if (format === "html") download(`${name}-bibliography.html`, bibliographyHtml(references), "text/html");
    else download(`${name}.bib`, references.map((p) => citation(p, "BibTeX")).join("\n\n"), "application/x-bibtex");
    setExportOpen(false); notify(`Exported ${format === "html" || format === "bib" ? `${references.length} source references` : `${visible.length} library items`}.`);
  }
  return <section className="lw-page">
    <header className="lw-heading"><div><span className="lw-eyebrow"><Library size={15} />MY LIBRARY</span><h1>My Library</h1><p>Saved sources, reading notes, and research searches.</p></div><Button primary icon={Plus} onClick={() => setNoteEditor({})}>New note</Button></header>
    <div className="lw-layout">
      <aside className="lw-collections" aria-label="Library collections">
        <button className={`lw-collection ${!activeFolder ? "active" : ""}`} aria-pressed={!activeFolder} onClick={() => setActiveFolder("")}><Library size={17} /><span>All research</span><small>{items.length}</small></button>
        <div className="lw-collections-heading"><span>Collections</span><button aria-label="Create a collection" onClick={() => setFolderForm({})}><Plus size={17} /></button></div>
        {folders.map((f) => <button key={f.id} className={`lw-collection ${activeFolder === f.id ? "active" : ""}`} aria-pressed={activeFolder === f.id} onClick={() => setActiveFolder(f.id)}><Folder size={17} /><span>{f.name}</span><small>{items.filter((i) => f.itemKeys?.includes(itemKey(i))).length}</small></button>)}
        {!folders.length && <p className="lw-collections-hint">Create a collection for a topic, course, or literature review.</p>}
        <button className="lw-add-collection" onClick={() => setFolderForm({})}><FolderPlus size={16} />New collection</button>
        <div className="lw-keep-note"><BookOpen size={19} /><strong>Keep the context.</strong><p>Save source links and your own notes so every finding has a way back to the evidence.</p></div>
      </aside>
      <div className="lw-content">
        <div className="lw-content-heading"><div><h2>{folder?.name || "All research"}</h2><p>{folder ? "A focused collection from your research library." : `${counts.papers} saved ${counts.papers === 1 ? "source" : "sources"} · ${counts.notes} ${counts.notes === 1 ? "note" : "notes"} · ${counts.research} saved ${counts.research === 1 ? "search" : "searches"}`}</p></div><div className="lw-toolbar-actions">{folder && <Button icon={Pencil} onClick={() => setFolderForm(folder)} aria-label="Rename collection">Rename</Button>}<button className="lw-icon-button" aria-label="Refresh library" title="Refresh library" onClick={load} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /></button><Button icon={Upload} onClick={() => importInput.current?.click()} disabled={importBusy}>Import RIS</Button><input type="file" accept=".ris,text/plain,application/x-research-info-systems" ref={importInput} onChange={readReferences} hidden aria-label="Import RIS references" /><div className="lw-export"><Button icon={ArrowDownToLine} disabled={!visible.length || loading} aria-expanded={exportOpen} aria-controls="lw-export-options" onClick={() => setExportOpen((v) => !v)}>Export<ChevronDown size={13} /></Button>{exportOpen && <div id="lw-export-options" className="lw-export-options"><button onClick={() => exportItems("html")}>Linked bibliography <span>HTML · original sources</span></button><button onClick={() => exportItems("bib")}>Citation manager <span>BibTeX references</span></button><button onClick={() => exportItems("markdown")}>Research notes <span>Markdown · notes and evidence</span></button><button onClick={() => exportItems("json")}>Library backup <span>JSON · full records</span></button><button className="lw-export-close" onClick={() => setExportOpen(false)}>Close export options</button></div>}</div></div></div>
        <div className="lw-search-row"><label className="lw-search"><Search size={18} /><span className="sr-only">Search saved research</span><input placeholder="Search titles, authors, or your notes" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button aria-label="Clear library search" onClick={() => setQuery("")}><X size={16} /></button>}</label><label className="lw-sort"><span className="sr-only">Sort saved research</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Recently saved</option><option value="title">Title A–Z</option></select></label></div>
        <nav className="lw-tabs" aria-label="Library item type">{[["all", "Everything"], ["papers", "Papers & sources"], ["notes", "Notes"], ["research", "Research searches"]].map(([key, name]) => <button key={key} onClick={() => { setFilter(key); setParams(key === "all" ? {} : { tab: key }, { replace: true }); }} className={filter === key ? "active" : ""} aria-pressed={filter === key}>{name}<span>{folder ? items.filter((i) => folder.itemKeys?.includes(itemKey(i)) && (key === "all" || key === "papers" && i.kind === "paper" || key === "notes" && i.kind !== "paper" && !isResearch(i) || key === "research" && isResearch(i))).length : counts[key]}</span></button>)}</nav>
        {error && <div className="lw-load-error" role="alert"><AlertCircle size={18} /><div><strong>Your library could not refresh.</strong><p>{error}</p></div><Button onClick={load}>Retry</Button></div>}
        {loading ? <div className="lw-loading" role="status"><LoaderCircle className="spin" size={24} /><p>Opening your research library…</p></div> : !visible.length ? <div className="lw-empty"><Empty icon={folder ? FolderOpen : query ? Search : Library} title={query ? "No matching research" : folder ? "Make room for your next idea" : filter !== "all" ? `No ${filter === "research" ? "saved research searches" : filter} yet` : "Your discoveries belong here"}>{query ? "Try another title, author, or phrase from your notes." : folder ? "Open any saved item and choose Collections to organize it here, or start a new note." : "Save papers as you explore, add your own notes, and keep the source behind every finding."}</Empty><div className="lw-empty-actions"><Button icon={Search} onClick={() => navigate("/search")}>Find research papers</Button><Button primary icon={Plus} onClick={() => setNoteEditor({})}>Create a note</Button></div></div> : <div className="lw-item-list">{visible.map((item) => {
          const research = isResearch(item), paper = item.kind === "paper";
          const Icon = paper ? FileText : research ? MessageSquare : StickyNote;
          const memberships = folders.filter((f) => f.itemKeys?.includes(itemKey(item)));
          const original = sourceUrl(item);
          return <article key={itemKey(item)} className="lw-item"><span className={`lw-item-icon ${paper ? "paper" : research ? "research" : "note"}`}><Icon size={20} aria-hidden="true" /></span><div className="lw-item-body"><div className="lw-item-meta"><span>{paper ? recordLabel(item) : research ? "Research search" : "Note"}</span><span>{paper && item.year ? item.year : dateLabel(item)}</span>{research && <span>{item.result?.papers?.length || 0} sources</span>}</div><h3><button onClick={() => setDetail(item)}>{titleOf(item)}</button></h3>{paper && <p className="lw-authors">{cleanAuthors(item.authors).slice(0, 3).join(", ") || "Authors unavailable"}{cleanAuthors(item.authors).length > 3 ? " et al." : ""}{item.journal ? ` · ${item.journal}` : ""}</p>}<p className="lw-item-excerpt">{excerpt(paper ? item.abstract : item.content || item.ai?.text || (research ? "Saved source records and research context. Open the search to continue exploring." : "Open this note to add findings and evidence."), 190) || "Abstract unavailable. Follow the source to read the publication."}</p>{memberships.length > 0 && <div className="lw-item-folders">{memberships.map((f) => <button key={f.id} onClick={() => setActiveFolder(f.id)}><Folder size={12} />{f.name}</button>)}</div>}<div className="lw-item-links"><button onClick={() => setDetail(item)}>{paper ? "Read details" : research ? "View saved research" : "Read note"}<ArrowUpRight size={14} /></button>{original && <a href={original} target="_blank" rel="noopener noreferrer">Original source<ExternalLink size={13} /></a>}</div></div><button className="lw-organize-button" aria-label={`Organize ${titleOf(item)} in collections`} title="Organize in collections" onClick={() => setOrganize(item)}><FolderPlus size={18} /></button></article>;
        })}</div>}
        {!loading && visible.length > 0 && <p className="lw-list-footer">{visible.length} {visible.length === 1 ? "item" : "items"}{query ? " matching your search" : folder ? " in this collection" : " in your library"} · Source metadata is retained as supplied.</p>}
      </div>
    </div>
    {folderForm && <FolderForm folder={folderForm.id ? folderForm : null} onClose={() => setFolderForm(null)} onSave={saveFolder} />}
    {noteEditor && <NoteEditor note={noteEditor.id ? noteEditor : null} onClose={() => setNoteEditor(null)} onSave={saveNote} />}
    {detail && <ItemDetail item={detail} onClose={() => setDetail(null)} onEdit={() => { setNoteEditor(detail); setDetail(null); }} onOrganize={() => { setOrganize(detail); setDetail(null); }} />}
    {organize && <FolderPicker item={organize} folders={folders} onClose={() => setOrganize(null)} onSave={saveMembership} onCreate={() => { setOrganize(null); setFolderForm({}); }} />}
    {importDialog && <Modal title="Import references" onClose={() => { if (!importBusy) setImportDialog(null); }}>
      <div className="lw-form lw-import"><p>Bring your Zotero or Mendeley library into Zntx Space with a RIS export. Up to 500 references per file, 5 MB maximum.</p>{importDialog.name ? <div className="lw-import-file"><FileText size={23} /><span>{importDialog.name}</span></div> : <Button icon={Upload} onClick={() => importInput.current?.click()}>Choose RIS file</Button>}
        {importDialog.reading ? <p role="status"><LoaderCircle className="spin" size={16} /> Reading references…</p> : importDialog.records.length > 0 && !importProgress && <><strong>{importDialog.records.length} references ready to import</strong><ul>{importDialog.records.slice(0, 3).map((p) => <li key={p.id}>{p.title}</li>)}</ul>{importDialog.records.length > 3 && <p className="lw-helper">And {importDialog.records.length - 3} more references.</p>}</>}
        {importProgress && <div className="lw-import-progress" role="status" aria-live="polite"><progress max={importProgress.total} value={importProgress.processed} /><strong>{importBusy ? `Importing ${importProgress.processed} of ${importProgress.total}` : importDialog.cancelled ? "Import stopped" : importDialog.complete ? "Import complete" : "Import paused"}</strong><p>{importProgress.imported} imported · {importProgress.skipped} already saved</p></div>}
        {importDialog.error && <p className="lw-error" role="alert">{importDialog.error}</p>}
        <p className="lw-helper">Metadata and original source links are imported. RIS files do not include PDF attachments.</p><div className="lw-form-actions">{importBusy ? <Button onClick={() => { importCancelled.current = true; }}>Stop after current reference</Button> : <><Button onClick={() => setImportDialog(null)}>{importDialog.complete ? "Done" : "Cancel"}</Button>{!importDialog.complete && <Button primary icon={Upload} disabled={importDialog.reading || !importDialog.records.length} onClick={importReferences}>{importDialog.error ? "Retry import" : "Import to library"}</Button>}</>}</div>
      </div>
    </Modal>}
  </section>;
}
