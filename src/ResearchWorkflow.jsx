import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Search,
  FileText,
  Presentation,
  BookOpen,
  Plus,
  LoaderCircle,
  X,
  Download,
  Save,
  Sparkles,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Trash2,
  RotateCcw,
  ShieldCheck,
  CircleHelp,
} from "lucide-react";
import { Button, useApp } from "./App.jsx";
import { api, citation, sourceUrl, wordCount } from "./lib.js";
import { exportDocument, exportSlides } from "./export-client.js";
import { ResearchText } from "./AiPanel.jsx";
import { PaperVerification } from "./SourceVerification.jsx";
const WorkflowEditor = lazy(() => import("./WorkflowEditor.jsx"));
import {
  newWorkflow,
  workflowTemplates,
  workflowTemplate,
  normalizeSources,
  selectInitialSources,
  parsePlan,
  parsePaper,
  parseSlides,
  paperDocument,
  markdownNodes,
  documentMarkdown,
  evidenceFor,
  referenceText,
  reviewWorkflow,
  planPrompt,
  paperPrompt,
  slidesPrompt,
  prepareEvidence,
  citationIds,
} from "./research-workflow.js";
import "./research-workflow.css";

const steps = ["Topic", "Sources", "Create"];
const sourceKey = (p) =>
  p.doi?.toLowerCase() || p.title.toLowerCase().replace(/[^a-z0-9]/g, "");
const selectedIds = (state) =>
  state.sources
    .filter((s) => s.selected)
    .map((s) => s.evidenceId)
    .join(",");
const timeLabel = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
// Keep writes ordered even when a saved workflow is unmounted and reopened.
const workflowSaves = new Map();
const recoveryKey = (id) =>
  `scrapetx-workflow-recovery:${localStorage.getItem("zntx-workspace-token") || "pending"}:${id}`;
function cachedWorkflow(id) {
  try {
    const value = JSON.parse(localStorage.getItem(recoveryKey(id)));
    return value?.id === id &&
      value.version === 1 &&
      Array.isArray(value.sources) &&
      Array.isArray(value.slides) &&
      value.document?.type === "doc"
      ? value
      : null;
  } catch {
    return null;
  }
}
function cacheWorkflow(value) {
  try {
    localStorage.setItem(recoveryKey(value.id), JSON.stringify(value));
  } catch {
    /* Server saving remains available when browser storage is full. */
  }
}

export default function ResearchWorkflow() {
  const { notify, navigate } = useApp();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const [state, setState] = useState(() =>
    newWorkflow({
      topic: params.get("topic") || "",
      templateId: workflowTemplate(params.get("template")).id,
    }),
  );
  const current = useRef(state),
    mounted = useRef(true),
    timer = useRef(null),
    revision = useRef(0);
  const operation = useRef(null),
    editorRef = useRef(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [recent, setRecent] = useState([]),
    [loading, setLoading] = useState(!!id),
    [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState(""),
    [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notices, setNotices] = useState([]);
  const [sourceQuery, setSourceQuery] = useState(""),
    [sourceFilter, setSourceFilter] = useState("");
  const [checkingSource, setCheckingSource] = useState(null),
    [slideIndex, setSlideIndex] = useState(0);
  const [assistQuestion, setAssistQuestion] = useState(""),
    [assist, setAssist] = useState(null),
    [aiStatus, setAiStatus] = useState(null);
  const selection = state.sources.filter((s) => s.selected);
  const paperText = documentMarkdown(state.document),
    review = reviewWorkflow(state);
  const citations = state.sources.map((s) => ({
    id: s.evidenceId,
    title: s.title,
    url: sourceUrl(s),
  }));

  function update(patch, { replaceEditor = false } = {}) {
    const next = {
      ...current.current,
      ...(typeof patch === "function" ? patch(current.current) : patch),
      updatedAt: new Date().toISOString(),
    };
    current.current = next;
    setState(next);
    revision.current++;
    if (replaceEditor) setEditorRevision((n) => n + 1);
    if (next.id) {
      cacheWorkflow(next);
      setSaveStatus("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => persist(), 700);
    }
    return next;
  }

  function persist() {
    clearTimeout(timer.current);
    const snapshot = current.current,
      version = revision.current;
    if (!snapshot.id) return Promise.resolve();
    cacheWorkflow(snapshot);
    const record = {
      id: snapshot.id,
      type: "research-workflow",
      title: snapshot.title || snapshot.topic,
      question: snapshot.topic,
      description: `${workflowTemplate(snapshot.templateId).title} · Paper and slides`,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      papers: {},
      workflow: snapshot,
    };
    if (mounted.current) {
      setSaveStatus("saving");
      setSaveError("");
    }
    const saveKey = recoveryKey(snapshot.id);
    const next = (workflowSaves.get(saveKey) || Promise.resolve())
      .catch(() => {})
      .then(() =>
        api(`/api/records/projects/${encodeURIComponent(snapshot.id)}`, {
          method: "PUT",
          body: JSON.stringify(record),
        }),
      );
    workflowSaves.set(saveKey, next);
    next
      .finally(() => {
        if (workflowSaves.get(saveKey) === next) workflowSaves.delete(saveKey);
      })
      .catch(() => {});
    next
      .then(() => {
        try {
          if (
            JSON.stringify(cachedWorkflow(snapshot.id)) ===
            JSON.stringify(snapshot)
          )
            localStorage.removeItem(recoveryKey(snapshot.id));
        } catch {
          /* Keep the saved workspace usable without browser cache access. */
        }
        if (
          mounted.current &&
          current.current.id === snapshot.id &&
          revision.current === version
        )
          setSaveStatus("saved");
      })
      .catch((failure) => {
        if (
          mounted.current &&
          current.current.id === snapshot.id &&
          revision.current === version
        ) {
          setSaveStatus("error");
          setSaveError(failure.message);
        }
      });
    return next;
  }

  useEffect(() => {
    mounted.current = true;
    api("/api/records/projects")
      .then((data) => {
        if (mounted.current)
          setRecent(
            (Array.isArray(data) ? data : data.records || [])
              .filter((p) => p.type === "research-workflow")
              .slice(0, 6),
          );
      })
      .catch(() => {});
    api("/api/ai/status")
      .then((data) => {
        if (mounted.current) setAiStatus(data);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      operation.current?.abort();
      clearTimeout(timer.current);
      if (current.current.id && revision.current) persist().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!id) {
      if (current.current.id) startNew();
      return;
    }
    if (current.current.id === id) return;
    operation.current?.abort();
    operation.current = null;
    setBusy("");
    if (current.current.id && revision.current) persist().catch(() => {});
    const control = new AbortController();
    setLoading(true);
    setLoadError("");
    (workflowSaves.get(recoveryKey(id)) || Promise.resolve())
      .catch(() => {})
      .then(() =>
        api(`/api/records/projects/${encodeURIComponent(id)}`, {
          signal: control.signal,
        }),
      )
      .then((record) => {
        if (control.signal.aborted) return;
        if (
          record?.type !== "research-workflow" ||
          record.workflow?.version !== 1 ||
          !Array.isArray(record.workflow.sources) ||
          !Array.isArray(record.workflow.slides) ||
          record.workflow.document?.type !== "doc"
        )
          throw new Error("This research workflow could not be opened.");
        const recovery = cachedWorkflow(id);
        const restore =
          recovery &&
          new Date(recovery.updatedAt) >
            new Date(record.workflow.updatedAt || 0)
            ? recovery
            : record.workflow;
        current.current = newWorkflow({ ...restore, id: record.id });
        setState(current.current);
        setSourceQuery(restore.query || "");
        setSaveStatus(restore === recovery ? "pending" : "saved");
        setEditorRevision((n) => n + 1);
        revision.current = 0;
        if (restore === recovery) {
          setNotices([
            "Recovered unsaved edits from this browser. Save to sync them with your research project.",
          ]);
          revision.current++;
        }
      })
      .catch((failure) => {
        if (control.signal.aborted) return;
        const recovery = cachedWorkflow(id);
        if (recovery) {
          current.current = newWorkflow(recovery);
          setState(current.current);
          setSaveStatus("error");
          setSaveError(
            "Your unsaved work was recovered on this browser. " +
              failure.message,
          );
          setEditorRevision((n) => n + 1);
        } else setLoadError(failure.message);
      })
      .finally(() => {
        if (!control.signal.aborted) setLoading(false);
      });
    return () => control.abort();
  }, [id]);
  useEffect(() => {
    const leave = (event) => {
      if (["pending", "saving", "error"].includes(saveStatus)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [saveStatus]);

  async function run(label, action) {
    if (operation.current) return;
    const control = new AbortController();
    operation.current = control;
    setBusy(label);
    setError("");
    setAssist(null);
    try {
      await action(control.signal);
    } catch (failure) {
      if (mounted.current && !control.signal.aborted)
        setError(
          failure.message ||
            "This step could not finish. Your completed steps are saved.",
        );
    } finally {
      if (mounted.current && operation.current === control) setBusy("");
      if (operation.current === control) operation.current = null;
    }
  }
  function progress(label, signal) {
    signal.throwIfAborted();
    if (mounted.current) setBusy(label);
  }
  async function generate(task, prompt, sources, signal) {
    const data = await api("/api/ai/generate", {
      method: "POST",
      signal,
      body: JSON.stringify({ task, prompt, evidence: evidenceFor(sources) }),
    });
    signal.throwIfAborted();
    return data;
  }
  async function ensureSession(signal) {
    if (!current.current.id) {
      const next = update({
        id: `workflow-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        title: current.current.topic.trim().slice(0, 200),
      });
      setParams({ id: next.id }, { replace: true });
      await persist();
      signal.throwIfAborted();
    }
  }
  async function findSources(signal, allIn = false) {
    if (!current.current.topic.trim())
      throw new Error("Enter a topic or research question to begin.");
    if (current.current.sources.length || current.current.generated.paper)
      throw new Error(
        "This project already has research. Use Search more sources, or start a new workflow for a different topic.",
      );
    await ensureSession(signal);
    let plan = {
      query: current.current.topic.trim().slice(0, 500),
      title: current.current.topic.trim().slice(0, 200),
      outline: workflowTemplate(current.current.templateId).sections.filter(
        (s) => s.heading !== "References",
      ),
    };
    try {
      progress("Planning your search…", signal);
      const result = await generate(
        "workflow-plan",
        planPrompt(current.current),
        [],
        signal,
      );
      plan = parsePlan(result.text, current.current);
    } catch (failure) {
      if (signal.aborted) throw failure;
      if (allIn) throw failure;
      setNotices([
        "AI search planning was unavailable. Searching your original topic with the selected template instead.",
      ]);
    }
    update({ ...plan, step: 1 });
    setSourceQuery(plan.query);
    progress("Searching scholarly sources…", signal);
    const result = await api(
      `/api/discovery/search?q=${encodeURIComponent(plan.query)}`,
      { signal },
    );
    signal.throwIfAborted();
    const sources = selectInitialSources(normalizeSources(result.papers));
    update({
      sources,
      search: {
        query: result.query,
        retrievedAt: result.retrievedAt,
        sources: result.sources,
        partial: result.partial,
        coverage: result.coverage,
      },
    });
    if (!sources.length)
      throw new Error(
        "No matching sources were returned. Edit the search terms below and try again.",
      );
    if (result.partial)
      setNotices((n) => [
        ...n,
        "One source provider was unavailable. These are partial search results; review the source status below.",
      ]);
    if (allIn) {
      await makePaper(signal);
      await makeSlides(signal);
      update({ output: "paper" });
    }
  }
  async function searchMore(signal) {
    const query = sourceQuery.trim();
    if (!query) throw new Error("Enter a search query.");
    const result = await api(
      `/api/discovery/search?q=${encodeURIComponent(query)}`,
      { signal },
    );
    signal.throwIfAborted();
    const existing = current.current.sources,
      keys = new Set(existing.map(sourceKey));
    const additions = normalizeSources(result.papers)
      .filter((s) => !keys.has(sourceKey(s)))
      .slice(0, 60 - existing.length);
    const max = Math.max(
      0,
      ...existing.map((s) => Number(s.evidenceId.slice(1))),
    );
    update({
      sources: [
        ...existing,
        ...additions.map((s, i) => ({ ...s, evidenceId: `S${max + i + 1}` })),
      ],
      search: {
        ...current.current.search,
        additionalSearches: [
          ...(current.current.search?.additionalSearches || []),
          {
            query,
            retrievedAt: result.retrievedAt,
            sources: result.sources,
            partial: result.partial,
          },
        ],
      },
    });
    setNotices((n) => [
      ...n.slice(-2),
      `${additions.length} new sources added. Select the ones you want to use.${result.partial ? " One provider was unavailable." : ""}`,
    ]);
  }
  async function readEvidence(signal) {
    if (!current.current.sources.some((s) => s.selected))
      throw new Error("Choose at least one source before generating.");
    progress("Reading available source text…", signal);
    const sources = await prepareEvidence(current.current, {
      signal,
      readFullText: (pmcid, s) =>
        api(`/api/discovery/fulltext?pmcid=${encodeURIComponent(pmcid)}`, {
          signal: s,
        }),
      onSource: (next) => {
        signal.throwIfAborted();
        update({ sources: next });
      },
    });
    signal.throwIfAborted();
    update({ sources });
    return sources;
  }
  async function makePaper(signal) {
    if (current.current.outline.some((s) => !s.heading.trim()))
      throw new Error(
        "Give each outline section a heading before generating the paper.",
      );
    const sources = await readEvidence(signal);
    progress("Writing your reference-based draft…", signal);
    const result = await generate(
      "workflow-paper",
      paperPrompt(current.current),
      sources,
      signal,
    );
    const paper = parsePaper(
      result.text,
      sources.filter((s) => s.selected),
    );
    update(
      (before) => ({
        title: paper.title,
        document: paperDocument(paper.sections),
        previousDocument: before.generated.paper
          ? before.document
          : before.previousDocument,
        generated: {
          ...before.generated,
          paper: result.generatedAt,
          paperSources: selectedIds(before),
        },
        step: 2,
        output: "paper",
      }),
      { replaceEditor: true },
    );
    await persist();
  }
  async function makeSlides(signal) {
    const sources = await readEvidence(signal);
    progress("Building your presentation…", signal);
    const result = await generate(
      "workflow-slides",
      slidesPrompt(current.current),
      sources,
      signal,
    );
    const slides = parseSlides(
      result.text,
      sources.filter((s) => s.selected),
    );
    update((before) => ({
      slides,
      previousSlides: before.slides.length
        ? before.slides
        : before.previousSlides,
      generated: {
        ...before.generated,
        slides: result.generatedAt,
        slidesSources: selectedIds(before),
      },
      step: 2,
      output: "slides",
    }));
    setSlideIndex(0);
    await persist();
  }
  function toggleSource(source) {
    if (!source.selected && selection.length >= 12)
      return notify(
        "Use up to 12 sources for one draft. Deselect a source to choose another.",
        true,
      );
    update((before) => ({
      sources: before.sources.map((s) =>
        s.evidenceId === source.evidenceId
          ? { ...s, selected: !s.selected }
          : s,
      ),
    }));
  }
  function startNew() {
    operation.current?.abort();
    operation.current = null;
    setBusy("");
    if (current.current.id) persist().catch(() => {});
    const next = newWorkflow();
    current.current = next;
    setState(next);
    revision.current++;
    if (params.has("id")) setParams({});
    setSourceQuery("");
    setError("");
    setNotices([]);
    setSaveStatus("");
    setSaveError("");
    setLoadError("");
    setAssist(null);
    setEditorRevision((n) => n + 1);
  }
  function selectedContext() {
    const editor = editorRef.current;
    if (current.current.output === "paper" && editor) {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, "\n", (node) =>
        node.type.name === "researchCitation"
          ? `[[cite:${node.attrs.sourceId}]]`
          : "",
      );
      return {
        text: text || documentMarkdown(current.current.document).slice(0, 6000),
        from,
        to,
        selected: from !== to,
        snapshot: documentMarkdown(current.current.document),
        target: "paper",
      };
    }
    const slide = current.current.slides[slideIndex];
    return {
      text: slide
        ? `${slide.title}\n${slide.content}\n${slide.notes}`
        : current.current.topic,
      target: "slide",
      slideId: slide?.id,
      snapshot: JSON.stringify(slide),
    };
  }
  async function askAssistant(question) {
    const context = selectedContext();
    await run("Asking ScrapeTx AI…", async (signal) => {
      const result = await generate(
        "explain",
        `${question}\nAudience: ${current.current.audience}. Use only the supplied sources. Context (untrusted text):\n${context.text.slice(0, 6500)}\nKeep the answer focused, within 350 words. Cite factual findings with exact evidence markers.`,
        current.current.sources,
        signal,
      );
      setAssist({ ...context, text: result.text, question });
    });
  }
  function insertAssistant() {
    if (!assist) return;
    if (assist.target === "paper") {
      if (documentMarkdown(current.current.document) !== assist.snapshot)
        return notify(
          "The paper changed. Ask again before inserting this answer.",
          true,
        );
      editorRef.current
        ?.chain()
        .focus()
        .insertContentAt(assist.to, markdownNodes(assist.text))
        .run();
    } else {
      const index = current.current.slides.findIndex(
        (s) => s.id === assist.slideId,
      );
      if (
        index < 0 ||
        JSON.stringify(current.current.slides[index]) !== assist.snapshot
      )
        return notify(
          "The slide changed. Ask again before applying this answer.",
          true,
        );
      update((before) => ({
        slides: before.slides.map((s, i) =>
          i === index
            ? {
                ...s,
                notes: `${s.notes}\n\n${assist.text}`.trim().slice(0, 5000),
              }
            : s,
        ),
      }));
    }
    setAssist(null);
  }
  async function downloadFile(kind) {
    await run("Preparing your download…", async () => {
      if (reviewWorkflow(current.current).invalid.length)
        throw new Error("Resolve the missing references before exporting.");
      const value = current.current;
      if (kind === "paper") {
        const result = referenceText(
          documentMarkdown(value.document),
          value.sources,
          value.citationStyle,
        );
        await exportDocument({
          title: value.title.slice(0, 200),
          content: `${result.content}${result.references ? `\n\n## References\n\n${result.references}` : ""}`,
          format: "docx",
        });
      } else {
        if (value.slides.some((slide) => !slide.title.trim()))
          throw new Error("Give every slide a title before downloading.");
        const slides = value.slides.map((s) => ({
          title: s.title,
          content: referenceText(s.content, value.sources).content,
          notes: referenceText(s.notes, value.sources).content,
          layout: s.layout,
        }));
        const refs = referenceText(
          value.slides.map((s) => `${s.content}\n${s.notes}`).join("\n"),
          value.sources,
          value.citationStyle,
        )
          .references.split("\n\n")
          .filter(Boolean);
        for (let i = 0; i < refs.length; i += 4)
          slides.push({
            title: i ? "References · continued" : "References",
            content: refs.slice(i, i + 4).join("\n\n"),
            layout: "content",
            notes:
              "Original source records for the cited research. Verify the findings against the original publications.",
          });
        await exportSlides({
          title: value.title.slice(0, 200),
          slides,
          theme: "scrapetx",
        });
      }
      notify(
        kind === "paper"
          ? "Word document downloaded."
          : "PowerPoint downloaded.",
      );
    });
  }
  function patchSlide(patch) {
    update((before) => ({
      slides: before.slides.map((s, i) =>
        i === slideIndex ? { ...s, ...patch } : s,
      ),
    }));
  }
  function moveSlide(direction) {
    const index = slideIndex + direction;
    if (index < 0 || index >= state.slides.length) return;
    const slides = [...state.slides];
    [slides[index], slides[slideIndex]] = [slides[slideIndex], slides[index]];
    update({ slides });
    setSlideIndex(index);
  }
  function outputKey(event) {
    const keys = ["paper", "slides", "references"],
      index = keys.indexOf(state.output);
    const next =
      event.key === "ArrowRight"
        ? keys[(index + 1) % 3]
        : event.key === "ArrowLeft"
          ? keys[(index + 2) % 3]
          : event.key === "Home"
            ? keys[0]
            : event.key === "End"
              ? keys[2]
              : null;
    if (!next) return;
    event.preventDefault();
    update({ output: next });
    setAssist(null);
    document.getElementById(`rf-tab-${next}`)?.focus();
  }

  const activeSlide = state.slides[slideIndex];
  const usedIds = new Set(
    citationIds(
      paperText +
        "\n" +
        state.slides.map((s) => `${s.content}\n${s.notes}`).join("\n"),
    ),
  );
  const visibleSources = state.sources.filter((s) =>
    `${s.title} ${s.authors.join(" ")}`
      .toLowerCase()
      .includes(sourceFilter.toLowerCase()),
  );
  if (loading)
    return (
      <section className="rf-page">
        <div className="rf-loading" role="status">
          <LoaderCircle className="spin" size={24} />
          Opening your research workflow…
        </div>
      </section>
    );
  if (loadError)
    return (
      <section className="rf-page">
        <p role="alert" className="rf-error">
          {loadError}
        </p>
        <Button onClick={startNew}>Start a new workflow</Button>
      </section>
    );
  return (
    <section className="rf-page">
      <header className="rf-heading">
        <div>
          <span className="rf-eyebrow">Research, distilled.</span>
          <h1>From a question to a paper.</h1>
          <p>Find your sources. Build your draft. Present your research.</p>
        </div>
        <div className="rf-heading-actions">
          {state.id && (
            <>
              <span
                className={`rf-save-status ${saveStatus === "error" ? "error" : ""}`}
                role="status"
              >
                {saveStatus === "saved" ? (
                  <Check size={14} />
                ) : saveStatus === "saving" ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Save size={14} />
                )}{" "}
                {
                  {
                    saved: "Saved",
                    saving: "Saving…",
                    pending: "Unsaved changes",
                    error: "Save failed",
                  }[saveStatus]
                }
              </span>
              <Button
                disabled={!!busy}
                onClick={() => persist().catch(() => {})}
                icon={Save}
              >
                Save
              </Button>
              <Button disabled={!!busy} onClick={startNew} icon={Plus}>
                New
              </Button>
            </>
          )}
        </div>
      </header>
      <nav className="rf-steps" aria-label="Research workflow steps">
        {steps.map((label, index) => (
          <button
            key={label}
            aria-current={state.step === index ? "step" : undefined}
            disabled={
              !!busy ||
              (index > 0 && !state.id) ||
              (index === 2 && !state.sources.length)
            }
            onClick={() => update({ step: index })}
          >
            <span>{state.step > index ? <Check size={15} /> : index + 1}</span>
            {label}
            {index < 2 && <ArrowRight size={16} />}
          </button>
        ))}
      </nav>
      {busy && (
        <div className="rf-progress" role="status">
          <LoaderCircle className="spin" size={19} />
          <span>
            {busy}
            <small>
              You can stop at any time. Completed steps stay in this project.
            </small>
          </span>
          <button
            onClick={() => {
              operation.current?.abort();
              setBusy("Stopping…");
            }}
            aria-label="Stop current generation"
          >
            <X size={17} />
            Stop
          </button>
        </div>
      )}
      {error && (
        <div className="rf-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}
      {saveError && (
        <div className="rf-error" role="alert">
          Your latest edits are still on this page. {saveError}
          <Button onClick={() => persist().catch(() => {})}>Retry save</Button>
        </div>
      )}
      {notices.length > 0 && (
        <div className="rf-notices">
          {notices.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
          <button onClick={() => setNotices([])} aria-label="Dismiss notices">
            <X size={15} />
          </button>
        </div>
      )}
      {aiStatus && !aiStatus.configured && (
        <p className="rf-ai-setup">
          <CircleHelp size={17} />
          You can find sources and write manually. Connect ScrapeTx AI to
          generate drafts and slides.{" "}
          <Link to="/integrations">
            Open integrations <ArrowRight size={13} />
          </Link>
        </p>
      )}

      {state.step === 0 && (
        <div className="rf-start-layout">
          <div className="rf-card rf-start-card">
            <span className="rf-eyebrow">Start with your question</span>
            <h2>What are you researching?</h2>
            <p>No files needed. We’ll search scholarly sources for you.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run("Starting research…", (signal) => findSources(signal));
              }}
            >
              <label htmlFor="rf-topic">Topic or research question</label>
              <textarea
                id="rf-topic"
                rows={3}
                maxLength={500}
                required
                value={state.topic}
                disabled={!!busy || !!state.sources.length}
                onChange={(event) => update({ topic: event.target.value })}
                placeholder="e.g. How do GLP-1 medicines affect cardiovascular outcomes?"
              />
              <fieldset
                className="rf-template-options"
                disabled={!!busy || !!state.sources.length}
              >
                <legend>Choose a starting point</legend>
                {workflowTemplates.map((template) => (
                  <label
                    className={
                      state.templateId === template.id ? "selected" : ""
                    }
                    key={template.id}
                  >
                    <input
                      type="radio"
                      name="rf-template"
                      value={template.id}
                      checked={state.templateId === template.id}
                      onChange={() => update({ templateId: template.id })}
                    />
                    <span>
                      <b>{template.title}</b>
                      <small>{template.description}</small>
                    </span>
                    {state.templateId === template.id && <Check size={16} />}
                  </label>
                ))}
              </fieldset>
              <details className="rf-options">
                <summary>Length, audience & references</summary>
                <div className="rf-options-grid">
                  <label>
                    Draft length
                    <select
                      disabled={!!busy}
                      value={state.length}
                      onChange={(e) => update({ length: e.target.value })}
                    >
                      <option value="600">Short · about 600 words</option>
                      <option value="1200">Standard · about 1,200 words</option>
                      <option value="2000">Detailed · about 2,000 words</option>
                    </select>
                  </label>
                  <label>
                    Audience
                    <input
                      value={state.audience}
                      maxLength={120}
                      disabled={!!busy}
                      onChange={(e) => update({ audience: e.target.value })}
                    />
                  </label>
                  <label>
                    Reference format
                    <select
                      value={state.citationStyle}
                      disabled={!!busy}
                      onChange={(e) =>
                        update({ citationStyle: e.target.value })
                      }
                    >
                      {["APA", "MLA", "IEEE"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Slides
                    <select
                      value={state.slideCount}
                      disabled={!!busy}
                      onChange={(e) =>
                        update({ slideCount: Number(e.target.value) })
                      }
                    >
                      {[6, 8, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} slides
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p>
                  Drafts use linked source numbers. The reference format applies
                  to the bibliography.
                </p>
              </details>
              {state.sources.length ? (
                <div className="rf-form-actions">
                  <Button
                    type="button"
                    primary
                    onClick={() => update({ step: 1 })}
                  >
                    Continue to sources <ArrowRight size={16} />
                  </Button>
                </div>
              ) : (
                <div className="rf-form-actions">
                  <Button
                    primary
                    type="submit"
                    disabled={!!busy || !state.topic.trim()}
                    icon={Search}
                  >
                    Find sources
                  </Button>
                  <Button
                    type="button"
                    disabled={
                      !!busy ||
                      !state.topic.trim() ||
                      aiStatus?.configured === false
                    }
                    icon={Sparkles}
                    onClick={() =>
                      run("Starting the complete workflow…", (signal) =>
                        findSources(signal, true),
                      )
                    }
                  >
                    Do it all
                  </Button>
                  <small>
                    “Do it all” finds sources, writes a draft, and builds
                    slides.
                  </small>
                </div>
              )}
            </form>
          </div>
          <aside className="rf-start-aside">
            <div className="rf-help-card">
              <BookOpen size={25} />
              <h3>Your research, in one place.</h3>
              <p>
                Choose the sources you trust, edit the paper in a document
                editor, and turn it into a presentation.
              </p>
              <ol>
                <li>
                  <b>Find</b>
                  <span>Search Crossref and Europe PMC.</span>
                </li>
                <li>
                  <b>Understand</b>
                  <span>Read available full-text excerpts and abstracts.</span>
                </li>
                <li>
                  <b>Create</b>
                  <span>
                    Work with an editable draft, references, and slides.
                  </span>
                </li>
              </ol>
              <p className="rf-small-note">
                AI drafts need your review. This workflow does not perform an
                experiment or an exhaustive systematic review.
              </p>
            </div>
            {recent.length > 0 && (
              <div className="rf-recent">
                <h3>Pick up where you left off</h3>
                {recent.map((p) => (
                  <Link
                    key={p.id}
                    to={`/research-workflow?id=${encodeURIComponent(p.id)}`}
                  >
                    <FileText size={17} />
                    <span>
                      {p.title}
                      <small>{timeLabel(p.updatedAt || p.createdAt)}</small>
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {state.step === 1 && (
        <div className="rf-sources-layout">
          <div>
            <div className="rf-section-heading">
              <div>
                <h2>Choose your evidence.</h2>
                <p>
                  {state.sources.length} source records · {selection.length}{" "}
                  selected · up to 12 per draft
                </p>
              </div>
              <Button
                primary
                disabled={!!busy || !selection.length}
                onClick={() => update({ step: 2 })}
              >
                Continue <ArrowRight size={15} />
              </Button>
            </div>
            <form
              className="rf-source-search"
              onSubmit={(event) => {
                event.preventDefault();
                run("Searching for more sources…", searchMore);
              }}
            >
              <Search size={18} />
              <input
                aria-label="Scholarly search terms"
                value={sourceQuery}
                maxLength={500}
                disabled={!!busy}
                onChange={(e) => setSourceQuery(e.target.value)}
                placeholder="Adjust your search terms"
              />
              <Button
                disabled={
                  !!busy || !sourceQuery.trim() || state.sources.length >= 60
                }
              >
                Search more
              </Button>
            </form>
            <div className="rf-source-tools">
              <label>
                <Search size={15} />
                <input
                  aria-label="Filter collected sources"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  placeholder="Filter these sources"
                />
              </label>
              <button
                disabled={!!busy}
                onClick={() =>
                  update({
                    sources: state.sources.map((s) => ({
                      ...s,
                      selected: false,
                    })),
                  })
                }
              >
                Clear selection
              </button>
            </div>
            {!visibleSources.length && (
              <div className="rf-card rf-source-empty">
                <BookOpen size={26} />
                <h3>No sources to show.</h3>
                <p>Try broader search terms or clear the filter.</p>
              </div>
            )}
            <div className="rf-source-list">
              {visibleSources.map((source) => (
                <article
                  key={source.evidenceId}
                  className={`rf-source-card ${source.selected ? "selected" : ""}`}
                >
                  <label className="rf-source-choice">
                    <input
                      type="checkbox"
                      aria-label={`Include ${source.title}`}
                      checked={source.selected}
                      disabled={
                        !!busy || (!source.selected && selection.length >= 12)
                      }
                      onChange={() => toggleSource(source)}
                    />
                    <span>[{source.evidenceId.slice(1)}]</span>
                  </label>
                  <div>
                    <span className="rf-source-meta">
                      {source.year || "Year unavailable"} ·{" "}
                      {source.source || "Scholarly record"}
                      <span>
                        {source.coverage === "full-text-excerpts"
                          ? "Full-text excerpts"
                          : source.abstract
                            ? "Abstract available"
                            : "Metadata only"}
                      </span>
                    </span>
                    <h3>{source.title}</h3>
                    <p className="rf-source-authors">
                      {source.authors.slice(0, 3).join(", ")}
                      {source.journal ? ` · ${source.journal}` : ""}
                    </p>
                    {source.abstract && (
                      <details>
                        <summary>Read abstract</summary>
                        <p>{source.abstract}</p>
                      </details>
                    )}
                    {source.readError && (
                      <p className="rf-small-note">{source.readError}</p>
                    )}
                    <div className="rf-source-links">
                      {sourceUrl(source) && (
                        <a
                          href={sourceUrl(source)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Original source <ExternalLink size={13} />
                        </a>
                      )}
                      <button
                        onClick={() =>
                          setCheckingSource(
                            checkingSource === source.evidenceId
                              ? null
                              : source.evidenceId,
                          )
                        }
                      >
                        <ShieldCheck size={14} />
                        Publication checks
                      </button>
                    </div>
                    {checkingSource === source.evidenceId && (
                      <PaperVerification paper={source} />
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <aside className="rf-card rf-evidence-aside">
            <h3>Your evidence set</h3>
            <strong>
              {selection.length}
              <span> selected sources</span>
            </strong>
            <p>
              AI reads up to six available open-access full texts and uses
              abstracts for the remaining selected sources. The draft labels its
              coverage.
            </p>
            {state.search?.sources?.map((s) => (
              <div className="rf-provider" key={s.id || s.name}>
                <span>{s.name}</span>
                <b>
                  {s.status === "ok" ? `${s.returned} records` : "Unavailable"}
                </b>
              </div>
            ))}
            {state.search?.retrievedAt && (
              <p className="rf-small-note">
                Searched {new Date(state.search.retrievedAt).toLocaleString()}
                <br />
                Query: {state.query}
              </p>
            )}
            <p className="rf-small-note">
              Source records and publication checks help you inspect provenance;
              they do not establish that every claim is correct.
            </p>
            <details className="rf-outline">
              <summary>Paper outline</summary>
              {state.outline.map((item, index) => (
                <label key={index}>
                  Section {index + 1}
                  <input
                    aria-label={`Outline section ${index + 1}`}
                    value={item.heading}
                    maxLength={160}
                    disabled={!!busy}
                    onChange={(e) =>
                      update({
                        outline: state.outline.map((s, i) =>
                          i === index ? { ...s, heading: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </details>
            <Button
              primary
              disabled={!!busy || !selection.length}
              onClick={() =>
                run("Creating your paper and slides…", async (signal) => {
                  await makePaper(signal);
                  await makeSlides(signal);
                  update({ output: "paper" });
                })
              }
              icon={Sparkles}
            >
              Create paper & slides
            </Button>
          </aside>
        </div>
      )}

      {state.step === 2 && (
        <>
          <div className="rf-create-heading">
            <label>
              <span className="sr-only">Working title</span>
              <input
                aria-label="Working title"
                maxLength={200}
                value={state.title}
                disabled={!!busy}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
            <Button
              disabled={!!busy}
              icon={BookOpen}
              onClick={() => update({ step: 1 })}
            >
              {selection.length} sources
            </Button>
          </div>
          <div
            className="rf-create-tabs"
            role="tablist"
            aria-label="Research outputs"
          >
            {[
              ["paper", FileText, "Paper"],
              ["slides", Presentation, "Slides"],
              ["references", BookOpen, "References & review"],
            ].map(([key, Icon, title]) => (
              <button
                role="tab"
                key={key}
                tabIndex={state.output === key ? 0 : -1}
                onKeyDown={outputKey}
                id={`rf-tab-${key}`}
                aria-controls={`rf-panel-${key}`}
                aria-selected={state.output === key}
                disabled={!!busy}
                onClick={() => {
                  update({ output: key });
                  setAssist(null);
                }}
              >
                <Icon size={17} />
                {title}
              </button>
            ))}
          </div>
          {state.generated.paperSources &&
            state.generated.paperSources !== selectedIds(state) && (
              <p className="rf-review-note">
                Your source selection changed after the paper was generated.
                Review the references or generate a fresh draft.
              </p>
            )}
          <div className="rf-create-layout">
            <div
              className="rf-output-panel"
              role="tabpanel"
              id={`rf-panel-${state.output}`}
              aria-labelledby={`rf-tab-${state.output}`}
            >
              {state.output === "paper" && (
                <>
                  <div className="rf-output-actions">
                    <span>
                      {wordCount(paperText.replace(/\[\[cite:[^\]]+\]\]/g, ""))}{" "}
                      words · editable draft
                    </span>
                    <div>
                      {state.previousDocument && (
                        <Button
                          disabled={!!busy}
                          icon={RotateCcw}
                          onClick={() =>
                            update(
                              (before) => ({
                                document: before.previousDocument,
                                previousDocument: before.document,
                              }),
                              { replaceEditor: true },
                            )
                          }
                        >
                          Previous draft
                        </Button>
                      )}
                      <Button
                        disabled={!!busy || !selection.length}
                        icon={Sparkles}
                        onClick={() => run("Generating your paper…", makePaper)}
                      >
                        {state.generated.paper
                          ? "Regenerate"
                          : "Generate draft"}
                      </Button>
                      <Button
                        primary
                        disabled={
                          !!busy ||
                          !paperText.trim() ||
                          !state.title.trim() ||
                          !!review.invalid.length
                        }
                        icon={Download}
                        onClick={() => downloadFile("paper")}
                      >
                        Word
                      </Button>
                    </div>
                  </div>
                  {!state.generated.paper && (
                    <div className="rf-draft-hint">
                      <FileText size={19} />
                      <span>
                        Start writing, or generate a draft from your selected
                        sources.
                      </span>
                      <button
                        disabled={!!busy}
                        onClick={() =>
                          update(
                            {
                              document: paperDocument(
                                (state.outline.length
                                  ? state.outline
                                  : workflowTemplate(
                                      state.templateId,
                                    ).sections.filter(
                                      (s) => s.heading !== "References",
                                    )
                                ).map((s) => ({
                                  heading: s.heading,
                                  content: "",
                                })),
                              ),
                            },
                            { replaceEditor: true },
                          )
                        }
                      >
                        Insert template
                      </button>
                    </div>
                  )}
                  <Suspense
                    fallback={
                      <div className="rf-loading" role="status">
                        Opening your document editor…
                      </div>
                    }
                  >
                    <WorkflowEditor
                      key={state.id}
                      document={state.document}
                      revision={editorRevision}
                      onChange={(document) => update({ document })}
                      onReady={(editor) => {
                        editorRef.current = editor;
                      }}
                      disabled={!!busy}
                      sources={selection}
                    />
                  </Suspense>
                  <ReferenceList
                    sources={state.sources.filter((s) =>
                      citationIds(
                        paperText + "\n" + (assist?.text || ""),
                      ).includes(s.evidenceId),
                    )}
                    allSources={state.sources}
                    style={state.citationStyle}
                  />
                </>
              )}
              {state.output === "slides" && (
                <>
                  <div className="rf-output-actions">
                    <span>
                      {state.slides.length} slides · editable presentation
                    </span>
                    <div>
                      {state.previousSlides && (
                        <Button
                          disabled={!!busy}
                          icon={RotateCcw}
                          onClick={() => {
                            update((before) => ({
                              slides: before.previousSlides,
                              previousSlides: before.slides,
                            }));
                            setSlideIndex(0);
                          }}
                        >
                          Previous deck
                        </Button>
                      )}
                      <Button
                        icon={Sparkles}
                        disabled={!!busy || !selection.length}
                        onClick={() =>
                          run("Generating your slides…", makeSlides)
                        }
                      >
                        {state.slides.length ? "Regenerate" : "Generate slides"}
                      </Button>
                      <Button
                        primary
                        icon={Download}
                        disabled={
                          !!busy ||
                          !state.slides.length ||
                          !state.title.trim() ||
                          !!review.invalid.length
                        }
                        onClick={() => downloadFile("slides")}
                      >
                        PowerPoint
                      </Button>
                    </div>
                  </div>
                  {state.slides.length ? (
                    <div className="rf-slide-workspace">
                      <nav
                        className="rf-slide-rail"
                        aria-label="Presentation slides"
                      >
                        {state.slides.map((s, i) => (
                          <button
                            className={slideIndex === i ? "selected" : ""}
                            aria-current={slideIndex === i ? "true" : undefined}
                            key={s.id}
                            onClick={() => {
                              setSlideIndex(i);
                              setAssist(null);
                            }}
                          >
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <b>{s.title}</b>
                          </button>
                        ))}
                        <button
                          disabled={!!busy || state.slides.length >= 20}
                          onClick={() => {
                            update((before) => ({
                              slides: [
                                ...before.slides,
                                {
                                  id: crypto.randomUUID(),
                                  title: "New slide",
                                  content: "",
                                  notes: "",
                                  layout: "content",
                                },
                              ],
                            }));
                            setSlideIndex(state.slides.length);
                          }}
                        >
                          <Plus size={16} />
                          Add slide
                        </button>
                      </nav>
                      <div className="rf-slide-main">
                        {activeSlide && (
                          <>
                            <div
                              className={`rf-slide-preview layout-${activeSlide.layout}`}
                            >
                              <span className="rf-slide-brand">
                                scrapeTx / Research
                              </span>
                              <h2>{activeSlide.title}</h2>
                              <div className="rf-slide-preview-content">
                                <ResearchText
                                  text={activeSlide.content}
                                  citations={citations}
                                  prefix="workflow"
                                />
                              </div>
                              <span className="rf-slide-number">
                                {slideIndex + 1}
                              </span>
                            </div>
                            <div className="rf-slide-controls">
                              <label>
                                Layout
                                <select
                                  disabled={!!busy}
                                  value={activeSlide.layout}
                                  onChange={(e) =>
                                    patchSlide({ layout: e.target.value })
                                  }
                                >
                                  <option value="title">Title</option>
                                  <option value="content">Content</option>
                                  <option value="two-column">
                                    Two columns
                                  </option>
                                </select>
                              </label>
                              <button
                                aria-label="Move slide earlier"
                                disabled={!!busy || !slideIndex}
                                onClick={() => moveSlide(-1)}
                              >
                                <ChevronUp size={17} />
                              </button>
                              <button
                                aria-label="Move slide later"
                                disabled={
                                  !!busy ||
                                  slideIndex === state.slides.length - 1
                                }
                                onClick={() => moveSlide(1)}
                              >
                                <ChevronDown size={17} />
                              </button>
                              <button
                                aria-label="Delete current slide"
                                disabled={!!busy || state.slides.length < 2}
                                onClick={() => {
                                  update({
                                    slides: state.slides.filter(
                                      (s) => s.id !== activeSlide.id,
                                    ),
                                  });
                                  setSlideIndex(Math.max(0, slideIndex - 1));
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <label className="rf-slide-field">
                              Slide title
                              <input
                                maxLength={180}
                                disabled={!!busy}
                                value={activeSlide.title}
                                onChange={(e) =>
                                  patchSlide({ title: e.target.value })
                                }
                              />
                            </label>
                            <label className="rf-slide-field">
                              Slide content
                              <textarea
                                rows={5}
                                maxLength={4000}
                                disabled={!!busy}
                                value={activeSlide.content}
                                onChange={(e) =>
                                  patchSlide({ content: e.target.value })
                                }
                              />
                            </label>
                            <label className="rf-slide-field">
                              Speaker notes
                              <textarea
                                rows={4}
                                maxLength={5000}
                                disabled={!!busy}
                                value={activeSlide.notes}
                                onChange={(e) =>
                                  patchSlide({ notes: e.target.value })
                                }
                              />
                            </label>
                            <p className="rf-small-note">
                              Keep source markers such as [[cite:S1]] to retain
                              linked references. References slides are added
                              when you download.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rf-output-empty">
                      <Presentation size={32} />
                      <h3>Present the same research.</h3>
                      <p>
                        Create slides with source references and speaker notes.
                        You can edit every slide.
                      </p>
                      <Button
                        primary
                        disabled={!!busy || !selection.length}
                        onClick={() =>
                          run("Generating your presentation…", makeSlides)
                        }
                      >
                        Generate presentation
                      </Button>
                    </div>
                  )}
                  <ReferenceList
                    sources={state.sources.filter((s) =>
                      citationIds(
                        state.slides
                          .map((slide) => `${slide.content}\n${slide.notes}`)
                          .join("\n") + (assist?.text || ""),
                      ).includes(s.evidenceId),
                    )}
                    allSources={state.sources}
                    style={state.citationStyle}
                  />
                </>
              )}
              {state.output === "references" && (
                <div className="rf-review-panel">
                  <h2>Review before you share.</h2>
                  <div className="rf-review-summary">
                    <span>
                      <b>{review.cited}</b> sources cited
                    </span>
                    <span>
                      <b>{review.uncited}</b> paragraphs to review for citations
                    </span>
                    <span>
                      <b>
                        {
                          state.sources.filter(
                            (s) =>
                              s.selected && s.coverage === "full-text-excerpts",
                          ).length
                        }
                      </b>{" "}
                      full-text excerpts
                    </span>
                  </div>
                  {review.invalid.length > 0 && (
                    <p className="rf-error">
                      Missing source IDs: {review.invalid.join(", ")}. Fix their
                      markers before exporting.
                    </p>
                  )}
                  {review.excluded.length > 0 && (
                    <p className="rf-review-note">
                      The draft still cites deselected sources:{" "}
                      {review.excluded.join(", ")}. Review these citations or
                      regenerate from your current selection.
                    </p>
                  )}
                  <p>
                    Linked citations identify the supplied records. Read the
                    original publications to check whether each claim is
                    supported. Uncited paragraphs are a review aid, not a
                    factual verification score.
                  </p>
                  <ReferenceList
                    sources={state.sources.filter((s) =>
                      usedIds.has(s.evidenceId),
                    )}
                    allSources={state.sources}
                    style={state.citationStyle}
                    checks
                  />
                  <details className="rf-methods">
                    <summary>Search and generation details</summary>
                    <p>
                      Query: {state.query}
                      <br />
                      Template: {workflowTemplate(state.templateId).title}
                      <br />
                      Searched:{" "}
                      {state.search?.retrievedAt
                        ? new Date(state.search.retrievedAt).toLocaleString()
                        : "Not yet searched"}
                      <br />
                      Generated paper:{" "}
                      {state.generated.paper
                        ? new Date(state.generated.paper).toLocaleString()
                        : "Not generated"}
                    </p>
                    <p>
                      This bounded search is based on returned Crossref and
                      Europe PMC records. Up to 12 selected sources enter each
                      generation, with up to six open-access full texts read as
                      excerpts. Other records contribute available abstracts or
                      metadata.
                    </p>
                  </details>
                </div>
              )}
            </div>
            {state.output !== "references" && (
              <aside className="rf-assistant">
                <div className="rf-assistant-title">
                  <Sparkles size={18} />
                  <h3>ScrapeTx AI</h3>
                </div>
                <p>
                  Select a passage in your paper, or work with the current
                  slide.
                </p>
                <div className="rf-assistant-prompts">
                  {[
                    "Explain this",
                    "Tell me more",
                    "How can I apply this?",
                  ].map((question) => (
                    <button
                      key={question}
                      disabled={!!busy || !selection.length}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => askAssistant(question)}
                    >
                      {question}
                      <ArrowRight size={13} />
                    </button>
                  ))}
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      const context = selectedContext();
                      setSourceQuery(
                        `${state.topic} ${context.selected ? context.text.slice(0, 140) : ""}`
                          .trim()
                          .slice(0, 500),
                      );
                      update({ step: 1 });
                    }}
                  >
                    Find supporting research <Search size={14} />
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    askAssistant(assistQuestion);
                  }}
                >
                  <label htmlFor="rf-assistant-question">
                    Ask about your research
                  </label>
                  <textarea
                    id="rf-assistant-question"
                    rows={3}
                    maxLength={1000}
                    value={assistQuestion}
                    disabled={!!busy}
                    onChange={(e) => setAssistQuestion(e.target.value)}
                    placeholder="What are the main limitations?"
                  />
                  <Button
                    primary
                    disabled={
                      !!busy || !assistQuestion.trim() || !selection.length
                    }
                  >
                    Ask AI <ArrowRight size={14} />
                  </Button>
                </form>
                {assist && (
                  <div className="rf-assistant-answer">
                    <ResearchText
                      text={assist.text}
                      citations={citations}
                      prefix="workflow"
                    />
                    <Button
                      disabled={!!busy}
                      icon={Plus}
                      onClick={insertAssistant}
                    >
                      {assist.target === "paper"
                        ? "Insert into paper"
                        : "Add to speaker notes"}
                    </Button>
                  </div>
                )}
                <p className="rf-small-note">
                  AI uses your selected evidence. Inserted text stays editable.
                  Generation uses your configured AI connection.
                </p>
              </aside>
            )}
          </div>
        </>
      )}
      <footer className="rf-footer">
        <Link to="/projects">
          <ArrowLeft size={14} />
          Research projects
        </Link>
        <span>Source-linked drafts · Word & PowerPoint exports</span>
      </footer>
    </section>
  );
}

function ReferenceList({ sources, allSources, style, checks = false }) {
  if (!sources.length)
    return (
      <div className="rf-reference-empty">
        References appear here as you cite your collected sources.
      </div>
    );
  return (
    <section className="rf-references">
      <h3>References</h3>
      <ol>
        {sources.map((s) => (
          <li
            key={s.evidenceId}
            id={`workflow-ref-${s.evidenceId}`}
            tabIndex={-1}
          >
            <span
              id={`workflow-source-${allSources.findIndex((a) => a.evidenceId === s.evidenceId)}`}
            />
            <b>[{s.evidenceId.slice(1)}]</b>
            <div>
              <p>{citation(s, style)}</p>
              {sourceUrl(s) && (
                <a
                  href={sourceUrl(s)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Original source <ExternalLink size={12} />
                </a>
              )}
              <small>
                {s.coverage === "full-text-excerpts"
                  ? "Full-text excerpts + abstract"
                  : s.abstract
                    ? "Abstract evidence"
                    : "Metadata only"}
              </small>
              {checks && <PaperVerification paper={s} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
