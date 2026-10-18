import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileText,
  Folder,
  Plus,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { Button, Empty, Modal, useApp } from "./App.jsx";
import { api, sourceUrl } from "./lib.js";
import { exportDocument } from "./export-client.js";
import {
  documentMarkdown,
  markdownNodes,
  notebookExport,
  isNotebook,
} from "./notebooks.js";
import { ResearchText } from "./AiPanel.jsx";
import NotebookPicker from "./NotebookPicker.jsx";
import "./research-workflow.css";
import "./notebooks.css";
const WorkflowEditor = lazy(() => import("./WorkflowEditor.jsx"));
export default function NotebookWorkspace() {
  const { id } = useParams();
  return id ? <NotebookDocument key={id} id={id} /> : <NotebookList />;
}
function NotebookList() {
  const [records, setRecords] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    navigate = useNavigate();
  useEffect(() => {
    const c = new AbortController();
    api("/api/records/notes", { signal: c.signal })
      .then((n) => setRecords(n.filter(isNotebook)))
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, []);
  const visible = records.filter((n) =>
    (n.title + " " + (n.content || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="nb-page">
      <header className="nb-heading">
        <div>
          <span className="tf-eyebrow">YOUR RESEARCH, TOGETHER</span>
          <h1>Notebooks</h1>
          <p>Develop an idea into writing, with the sources close by.</p>
        </div>
        <Button primary icon={Plus} onClick={() => setCreating(true)}>
          New notebook
        </Button>
      </header>
      <div className="nb-list-toolbar">
        <label>
          <Search size={17} />
          <input
            aria-label="Search notebooks"
            placeholder="Search your notebooks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <Link to="/library">
          <Folder size={16} />
          Organize in My Library <ArrowRight size={14} />
        </Link>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Opening your notebooks…</p>
      ) : !visible.length ? (
        <Empty
          icon={BookOpen}
          title={query ? "No matching notebooks" : "A place for your next idea"}
        >
          Start with a blank notebook or{" "}
          <Link to="/concepts">find a research topic</Link> and save it here.
        </Empty>
      ) : (
        <div className="nb-grid">
          {visible.map((n) => (
            <Link
              className="nb-card"
              key={n.id}
              to={"/notebooks/" + encodeURIComponent(n.id)}
            >
              <BookOpen size={25} />
              <h2>{n.title}</h2>
              <p>
                {(n.content || "A blank page, ready for your ideas.")
                  .replace(/[#*]/g, "")
                  .slice(0, 150)}
              </p>
              <span>
                {n.sources?.length || 0} sources ·{" "}
                {new Date(n.updatedAt || n.createdAt).toLocaleDateString()}
                <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
      {creating && (
        <NotebookPicker
          onClose={() => setCreating(false)}
          onSaved={(n) => navigate("/notebooks/" + encodeURIComponent(n.id))}
        />
      )}
    </section>
  );
}
function NotebookDocument({ id }) {
  const { library = [] } = useApp();
  const [record, setRecord] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Saved"),
    [revision, setRevision] = useState(0),
    [sourcePicker, setSourcePicker] = useState(false);
  const [askOpen, setAskOpen] = useState(false),
    [prompt, setPrompt] = useState(""),
    [ai, setAi] = useState(null),
    [aiBusy, setAiBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0);
  const latest = useRef(null),
    version = useRef(0),
    savedVersion = useRef(0),
    flight = useRef(null),
    mounted = useRef(true),
    operation = useRef(null),
    editor = useRef(null),
    [recovered, setRecovered] = useState(false);
  const recoveryKey =
    "scrapetx-notebook-recovery:" +
    localStorage.getItem("zntx-workspace-token") +
    ":" +
    id;
  useEffect(() => {
    mounted.current = true;
    const c = new AbortController();
    api("/api/records/notes/" + encodeURIComponent(id), { signal: c.signal })
      .then((n) => {
        if (c.signal.aborted) return;
        if (!isNotebook(n) || !n.document)
          throw Error(
            "This notebook is unavailable. Open My Library to choose another document.",
          );
        let recovery;
        try {
          recovery = JSON.parse(localStorage.getItem(recoveryKey));
        } catch {}
        if (
          recovery &&
          isNotebook(recovery) &&
          recovery.id === id &&
          recovery.document &&
          Date.parse(recovery.updatedAt) >
            Date.parse(n.updatedAt || n.createdAt || 0)
        ) {
          n = recovery;
          version.current++;
          setStatus("Recovered changes — saving…");
          setRecovered(true);
        }
        latest.current = n;
        setRecord(n);
        setRevision((v) => v + 1);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => {
      mounted.current = false;
      c.abort();
      operation.current?.abort();
      if (latest.current && version.current !== savedVersion.current) persist();
    };
  }, [id, loadAttempt]);
  function change(update) {
    const next = {
      ...latest.current,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    latest.current = next;
    version.current++;
    setRecord(next);
    setStatus("Unsaved changes");
    setError("");
    try {
      localStorage.setItem(recoveryKey, JSON.stringify(next));
    } catch {
      /* Server autosave remains available if browser storage is full. */
    }
  }
  async function persist() {
    if (flight.current) return flight.current;
    if (!latest.current || version.current === savedVersion.current) return;
    const operation = (async () => {
      try {
        while (latest.current && version.current !== savedVersion.current) {
          const snapshot = { ...latest.current },
            savingVersion = version.current;
          snapshot.content = notebookExport(
            snapshot.document,
            snapshot.sources || [],
          );
          snapshot.citations = (snapshot.sources || []).map((s) => ({
            id: s.evidenceId,
            title: s.title,
            url: sourceUrl(s),
          }));
          if (mounted.current) setStatus("Saving…");
          await api("/api/records/notes/" + encodeURIComponent(id), {
            method: "PUT",
            body: JSON.stringify(snapshot),
          });
          savedVersion.current = savingVersion;
          if (savingVersion === version.current) {
            try {
              localStorage.removeItem(recoveryKey);
            } catch {}
            if (mounted.current) {
              setStatus("Saved to your workspace");
              setError("");
            }
          }
        }
      } catch (e) {
        if (mounted.current) {
          setError("Your changes could not save: " + e.message);
          setStatus("Unsaved — retry Save");
        }
      } finally {
        flight.current = null;
      }
    })();
    flight.current = operation;
    return operation;
  }
  useEffect(() => {
    if (!record || version.current === savedVersion.current) return;
    const timer = setTimeout(persist, 800);
    return () => clearTimeout(timer);
  }, [record]);
  useEffect(() => {
    const warn = (e) => {
      if (version.current !== savedVersion.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function generate(e) {
    e.preventDefault();
    if (!prompt.trim() || aiBusy) return;
    const c = new AbortController();
    operation.current = c;
    setAiBusy(true);
    setAi(null);
    setError("");
    try {
      const snapshot = latest.current;
      const result = await api("/api/ai/generate", {
        method: "POST",
        signal: c.signal,
        body: JSON.stringify({
          task: "draft",
          prompt: `Help develop this research notebook. User request: ${prompt}\n\nCurrent writing (excerpt):\n${documentMarkdown(snapshot.document).slice(0, 16000)}\n\nUse only supplied abstracts for factual source claims. Never invent experiments, results or references. Provide text the user can review and append. If evidence is insufficient, state what they need to find next.`,
          evidence: (snapshot.sources || []).slice(0, 12).map((s) => ({
            id: s.evidenceId,
            title: s.title,
            url: sourceUrl(s),
            abstract: (s.abstract || "").slice(0, 5000),
          })),
        }),
      });
      if (!c.signal.aborted) setAi(result);
    } catch (e) {
      if (!c.signal.aborted) setError(e.message);
    } finally {
      if (operation.current === c) {
        operation.current = null;
        setAiBusy(false);
      }
    }
  }
  async function exportWord() {
    setExporting(true);
    setError("");
    try {
      await exportDocument({
        title: record.title,
        content: notebookExport(record.document, record.sources || []),
        format: "docx",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }
  if (loading)
    return (
      <p className="nb-page" role="status">
        Opening your notebook…
      </p>
    );
  if (!record)
    return (
      <section className="nb-page">
        <Link to="/notebooks">Back to notebooks</Link>
        <p role="alert" className="notice error">
          {error}
        </p>
        <Button
          onClick={() => {
            setLoading(true);
            setError("");
            setLoadAttempt((v) => v + 1);
          }}
        >
          Retry opening notebook
        </Button>
      </section>
    );
  const used = documentMarkdown(record.document),
    words = used.trim() ? used.trim().split(/\s+/).length : 0;
  return (
    <section className="nb-document">
      <header className="nb-document-heading">
        <Link to="/notebooks" aria-label="Back to notebooks">
          <ArrowLeft size={18} />
        </Link>
        <label className="sr-only" htmlFor="notebook-title">
          Notebook title
        </label>
        <input
          id="notebook-title"
          aria-label="Notebook title"
          value={record.title}
          maxLength={200}
          onChange={(e) => change({ title: e.target.value })}
        />
        <span role="status">{status}</span>
        <Button icon={Save} onClick={persist}>
          Save
        </Button>
        <Button icon={Download} disabled={exporting} onClick={exportWord}>
          {exporting ? "Exporting…" : "Export .docx"}
        </Button>
      </header>
      <nav className="nb-menu" aria-label="Notebook tools">
        <Button
          icon={FileText}
          onClick={() =>
            editor.current
              ?.chain()
              .focus()
              .insertContent({ type: "paragraph" })
              .run()
          }
        >
          Add paragraph
        </Button>
        <Button icon={BookOpen} onClick={() => setSourcePicker(true)}>
          Add sources
        </Button>
        <Button
          icon={Sparkles}
          aria-expanded={askOpen}
          onClick={() => setAskOpen(!askOpen)}
        >
          Ask AI
        </Button>
        <Link to="/library">
          <Folder size={16} />
          My Library
        </Link>
      </nav>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {recovered && (
        <p className="notice">
          Recovered unsaved changes from this browser.{" "}
          <button onClick={() => setRecovered(false)}>Dismiss</button>
        </p>
      )}
      {askOpen && (
        <section className="nb-ai">
          <form onSubmit={generate}>
            <label htmlFor="notebook-ai">
              How can I help with this notebook?
            </label>
            <div>
              <input
                id="notebook-ai"
                value={prompt}
                maxLength={2000}
                disabled={aiBusy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Suggest an outline, explain a finding, or improve this draft…"
              />
              <Button primary type="submit" disabled={aiBusy || !prompt.trim()}>
                {aiBusy ? "Working…" : "Ask ScrapeTx AI"}
              </Button>
              {aiBusy && (
                <Button
                  type="button"
                  onClick={() => {
                    operation.current?.abort();
                    operation.current = null;
                    setAiBusy(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
          <div className="nb-ai-examples">
            {[
              "Help me turn this topic into a focused research question",
              "Suggest an outline using these sources",
              "What evidence is missing from my draft?",
            ].map((q) => (
              <button key={q} disabled={aiBusy} onClick={() => setPrompt(q)}>
                {q}
              </button>
            ))}
          </div>
          {ai && (
            <>
              <ResearchText
                text={ai.text}
                citations={ai.citations || []}
                prefix="notebook-ai"
              />
              <Button
                icon={Plus}
                onClick={() => {
                  change({
                    document: {
                      type: "doc",
                      content: [
                        ...(latest.current.document.content || []),
                        ...markdownNodes(ai.text),
                      ],
                    },
                  });
                  setRevision((v) => v + 1);
                  setAi(null);
                }}
              >
                Append to notebook
              </Button>
              <p className="small muted">
                Review generated text and its source claims before appending it.
              </p>
            </>
          )}
        </section>
      )}
      <div className="nb-canvas">
        <div className="nb-paper">
          <Suspense fallback={<p>Opening editor…</p>}>
            <WorkflowEditor
              document={record.document}
              revision={revision}
              sources={record.sources || []}
              onReady={(e) => (editor.current = e)}
              onChange={(next) => change({ document: next })}
            />
          </Suspense>
          <section className="nb-references">
            <h2>References</h2>
            {!(record.sources || []).length ? (
              <p>
                Add sources from your library, or save a topic from Find Topics.
                Then use “Cite a source” in the toolbar.
              </p>
            ) : (
              (record.sources || []).map((s) => (
                <article id={"workflow-ref-" + s.evidenceId} key={s.evidenceId}>
                  <span>
                    [{s.evidenceId.slice(1)}]{" "}
                    {used.includes(`[[cite:${s.evidenceId}]]`)
                      ? "Cited"
                      : "Available to cite"}
                  </span>
                  <a href={sourceUrl(s)} target="_blank" rel="noreferrer">
                    {s.title} ↗
                  </a>
                  <p>
                    {s.year || "Year unavailable"} ·{" "}
                    {s.journal || s.source || "Publication details unavailable"}
                  </p>
                </article>
              ))
            )}
          </section>
        </div>
      </div>
      <footer className="nb-document-footer">
        <span>{words} words</span>
        <span>
          {(record.sources || []).length}{" "}
          {(record.sources || []).length === 1 ? "source" : "sources"} ·
          Autosaves after editing
        </span>
      </footer>
      {sourcePicker && (
        <Modal
          title="Add sources from My Library"
          onClose={() => setSourcePicker(false)}
        >
          <div className="nb-source-picker">
            {!library.length ? (
              <Empty title="Save a paper first">
                Find papers in <Link to="/search">literature search</Link>, save
                them to your library, then add them here.
              </Empty>
            ) : (
              library.map((s) => {
                const exists = record.sources.some(
                  (p) => (sourceUrl(p) || p.id) === (sourceUrl(s) || s.id),
                );
                return (
                  <div key={s.id}>
                    <span>{s.title}</span>
                    <Button
                      disabled={exists}
                      icon={exists ? Check : Plus}
                      onClick={() => {
                        const next =
                          "S" +
                          (Math.max(
                            0,
                            ...latest.current.sources.map(
                              (p) => Number(p.evidenceId?.slice(1)) || 0,
                            ),
                          ) +
                            1);
                        change({
                          sources: [
                            ...latest.current.sources,
                            { ...s, evidenceId: next },
                          ],
                        });
                      }}
                    >
                      {exists ? "Added" : "Add"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
