import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Code2, Check, ArrowUp, Download, Save, LoaderCircle, X, ExternalLink } from "lucide-react";
import { Button, Empty, useApp } from "./App.jsx";
import { api, download, sourceUrl } from "./lib.js";
import { exportDocument } from "./export-client.js";
import { templateById } from "./templates.js";
import { templateRequest, templateFilename, templateLatex, topicFromRequest, inspectTemplate, manuscriptDocument, templateEvidence, manuscriptPrompt, validateTemplatePaper, evidenceFor, paperDocument, documentMarkdown, manuscriptExport } from "./template-writing.js";
import "./research-workflow.css";
import "./template-writing.css";
const WorkflowEditor = lazy(() => import("./WorkflowEditor.jsx"));

export default function TemplateWritingWorkspace() {
  const [params] = useSearchParams(), location = useLocation(), navigate = useNavigate();
  const template = templateById(params.get("template")), recordId = params.get("id");
  const { notify } = useApp();
  const [request, setRequest] = useState(location.state?.request || (template ? templateRequest(template) : ""));
  const [topic, setTopic] = useState(() => recordId ? "" : topicFromRequest(request));
  const [manuscript, setManuscript] = useState("");
  const [title, setTitle] = useState(""), [document, setDocument] = useState(null), [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [revision, setRevision] = useState(0), [fileView, setFileView] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false), [savedAt, setSavedAt] = useState(""), [loading, setLoading] = useState(!!recordId), [loadFailed, setLoadFailed] = useState(false);
  const [id] = useState(recordId || crypto.randomUUID());
  const operation = useRef(null), started = useRef(false);
  const current = useRef({title,document,sources,topic,request});
  current.current = {title,document,sources,topic,request};
  useEffect(() => {
    const controller = new AbortController();
    if (recordId) api("/api/records/notes/" + encodeURIComponent(recordId), {signal:controller.signal}).then(d => {
      if (controller.signal.aborted) return;
      if (d.type !== "template-manuscript" || d.templateId !== template?.id) throw Error("This document does not match the selected template.");
      setRequest(d.request || templateRequest(template)); setTitle(d.title); setDocument(d.document); setSources(d.sources || []); setTopic(d.topic || ""); setSavedAt(d.updatedAt); setRevision(v=>v+1);
    }).catch(e => {if (!controller.signal.aborted) {setLoadFailed(true);setError(e.message);}}).finally(()=>!controller.signal.aborted && setLoading(false));
    return () => {controller.abort();operation.current?.abort();};
  }, [recordId, template?.id]);
  useEffect(() => {
    const warn = event => {if (dirty) {event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn);
  }, [dirty]);
  useEffect(() => {
    // A submitted topic is an explicit request to draft. An untouched placeholder
    // only inspects the template and asks for the missing content.
    if (template && !recordId && topicFromRequest(request) && !started.current) {started.current=true;create();}
  }, []);
  if (!template) return <section className="page"><Empty title="Choose a writing template"><Link to="/templates">Browse templates</Link></Empty></section>;
  const inspection = inspectTemplate(template);
  async function save(snapshot = current.current) {
    if (!snapshot.document) return;
    const content = manuscriptExport(snapshot.document, snapshot.sources);
    setSaving(true);
    try {
    await api("/api/records/notes/" + id, {method:"PUT",body:JSON.stringify({id,type:"template-manuscript",templateId:template.id,title:snapshot.title,content,document:snapshot.document,sources:snapshot.sources,topic:snapshot.topic,request:snapshot.request,citations:snapshot.sources.map(s=>({id:s.evidenceId,title:s.title,url:sourceUrl(s)}))})});
    setDirty(false); setSavedAt(new Date().toISOString());
    if (!recordId) navigate("/template-writing?" + new URLSearchParams({template:template.id,id}),{replace:true});
    } finally {setSaving(false);}
  }
  async function create() {
    if (operation.current || loading || loadFailed) return;
    if (!topic.trim() && !manuscript.trim()) {setError("Add your topic or paste a manuscript to continue.");return;}
    if (manuscript.length > 80000) {setError("Keep the manuscript below 80,000 characters.");return;}
    const controller = new AbortController(); operation.current=controller;
    setError(""); setBusy("Checking the supplied template…");
    try {
      let nextDocument, nextTitle=topic.trim() || template.title, nextSources=[];
      if (manuscript.trim()) {
        nextDocument=manuscriptDocument(template,manuscript);
      } else {
        setBusy("Finding sources for your topic…");
        const result = await api("/api/discovery/search?q=" + encodeURIComponent(topic.trim()),{signal:controller.signal});
        controller.signal.throwIfAborted();
        nextSources=templateEvidence(result.papers || result.results || []);
        if (!nextSources.length) throw Error("No source abstracts were available for this topic. Try a more specific question or paste your own manuscript.");
        setBusy("Writing in your template’s section order…");
        const generated=await api("/api/ai/generate",{method:"POST",body:JSON.stringify({task:"workflow-paper",prompt:manuscriptPrompt(template,topic.trim(),nextSources),evidence:evidenceFor(nextSources)}),signal:controller.signal});
        controller.signal.throwIfAborted();
        const paper=validateTemplatePaper(generated.text,template,nextSources);
        nextDocument=paperDocument(paper.sections);nextTitle=paper.title;
      }
      controller.signal.throwIfAborted();
      setDocument(nextDocument);setSources(nextSources);setTitle(nextTitle);setRevision(v=>v+1);setDirty(true);
      // Preserve the visible output even if persistence fails.
      await save({title:nextTitle,document:nextDocument,sources:nextSources,topic,request});
    } catch(e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (operation.current===controller) {operation.current=null;setBusy("");} }
  }
  async function exportFile(format) {
    setError("");
    try {
      const text = manuscriptExport(document,sources);
      await exportDocument({title,content:text,format,layout:template.layoutId || undefined});
    } catch(e) {setError(e.message);}
  }
  return <div className={`template-writing-workspace ${document ? "has-output" : ""}`}>
    <section className="tw-conversation" aria-label="Template writing conversation">
      <div className="tw-heading"><Link to="/templates">Templates</Link><h1>{document ? "Your manuscript" : "Prepare your manuscript"}</h1><p>{template.title}</p></div>
      <div className="tw-request"><span className="template-attachment"><Code2 size={17}/><span>{templateFilename(template)}</span></span><p>{request}</p></div>
      <article className="tw-template-check">
        <h2><Check size={19} aria-hidden="true"/>Checking the supplied template</h2>
        <p>The attached file uses this section order:</p><ol>{inspection.sections.map(h=><li key={h}>{h}</li>)}</ol>
        {inspection.layout && <p className="tw-specs">210 × 279 mm · two columns · 10 pt Times-like · 12 / 28 / 18 / 17 mm margins</p>}
        <p className="small muted">{inspection.note}</p>
      </article>
      {!document && !loading && !loadFailed && <section className="tw-missing">
        <h2>{topic ? "Build a source-based draft" : "Add the missing manuscript content"}</h2><p>Choose a topic to find sources and create a working draft, or paste your manuscript to arrange it in this template.</p>
        <form onSubmit={e=>{e.preventDefault();create();}}>
          <label className="field-label">Research topic<input aria-label="Manuscript research topic" maxLength={300} value={topic} disabled={!!busy} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Antibiotic resistance in bacteria"/></label>
          <label className="field-label">Your manuscript (optional)<textarea aria-label="Existing manuscript" value={manuscript} disabled={!!busy} onChange={e=>setManuscript(e.target.value)} maxLength={80000} rows={5} placeholder="Paste your text with headings such as Introduction, Methods, and Results."/></label>
          <Button type="submit" primary disabled={!!busy || (!topic.trim()&&!manuscript.trim())} icon={ArrowUp}>{manuscript.trim() ? "Format my manuscript" : "Find sources & write"}</Button>
        </form>
      </section>}
      {busy && <div className="tw-progress" role="status"><LoaderCircle size={18} className="spin"/><span>{busy}</span><Button onClick={()=>{operation.current?.abort();operation.current=null;setBusy("");}}>Cancel</Button></div>}
      {loading && <p role="status">Opening saved manuscript…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {document && <p className="tw-review-note">Your draft is editable. Review its claims, citations, and missing study details before using it. <Link to={"/?" + new URLSearchParams({template:template.id})}>Start another manuscript</Link></p>}
      {sources.length>0 && <details className="tw-sources"><summary>{sources.length} source abstracts used</summary>{sources.map(s=><p key={s.evidenceId}><a href={sourceUrl(s)} target="_blank" rel="noopener noreferrer">{s.title}<ExternalLink size={12}/></a></p>)}</details>}
    </section>
    {document && <section className="tw-output" aria-label="Manuscript output">
      <div className="tw-output-toolbar"><label>Document title<input aria-label="Manuscript title" disabled={!!busy || saving} value={title} onChange={e=>{setTitle(e.target.value);setDirty(true);}} maxLength={200}/></label><span>{dirty ? "Unsaved changes" : savedAt ? "Saved to your workspace" : "Working draft"}</span><Button icon={Save} disabled={saving || !!busy} onClick={()=>save().catch(e=>setError(e.message))}>Save</Button></div>
      <div className={template.layoutId ? "tw-paper tw-journal-paper" : "tw-paper"}><Suspense fallback={<p>Opening editor…</p>}><WorkflowEditor document={document} revision={revision} sources={sources} disabled={!!busy || saving} onChange={next=>{setDocument(next);setDirty(true);}}/></Suspense></div>
      {sources.length>0 && <div className="tw-reference-list"><h2>References</h2>{sources.filter(s=>documentMarkdown(document).includes(`[[cite:${s.evidenceId}]]`)).map(s=><p key={s.evidenceId} id={`workflow-ref-${s.evidenceId}`}><a href={sourceUrl(s)} target="_blank" rel="noopener noreferrer">[{s.evidenceId.slice(1)}] {s.title}<ExternalLink size={12}/></a></p>)}</div>}
    </section>}
    <aside className="tw-files" aria-label="Manuscript files"><h2>Files</h2><h3>Final outputs <span>{document ? 2 : 0}</span></h3>{document ? <><button onClick={()=>exportFile("docx")}><FileText size={18}/>Manuscript.docx<Download size={15}/></button><button onClick={()=>exportFile("tex")}><Code2 size={18}/>Manuscript.tex<Download size={15}/></button></> : <p>Your formatted manuscript files will appear here.</p>}<h3>Template <span>1</span></h3><button onClick={()=>setFileView(!fileView)}><Code2 size={18}/><span>{templateFilename(template)}</span></button><button onClick={()=>download(templateFilename(template),templateLatex(template),"application/x-tex")}><Download size={16}/>Download template</button>{fileView && <div className="tw-template-code"><button aria-label="Close template source" onClick={()=>setFileView(false)}><X size={16}/></button><pre>{templateLatex(template)}</pre></div>}</aside>
    </div>;
}
