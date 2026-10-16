import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { Button, Empty, Modal, useApp } from "./App.jsx";
import { api, download, excerpt } from "./lib.js";
import "./projects.css";

const freshPaper = () => ({ decision: "unscreened", reason: "", notes: "" });
const counts = (project) =>
  Object.values(project.papers || {}).reduce(
    (value, paper) => {
      value.total++;
      value[paper.decision || "unscreened"] =
        (value[paper.decision || "unscreened"] || 0) + 1;
      return value;
    },
    { total: 0, include: 0, exclude: 0, unscreened: 0 },
  );
const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};
const sourceURL = (value) => {
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};
function CreateProject({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Create research project" onClose={onClose}>
      <form
        className="projects-create"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onCreate({
              title: title.trim(),
              question: question.trim(),
              description: description.trim(),
            });
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        <p>
          Keep a research question, reading list, and screening decisions
          together.
        </p>
        <label htmlFor="project-new-title">
          Project name <span>Required</span>
        </label>
        <input
          id="project-new-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. GLP-1 cardiovascular evidence"
          required
          maxLength={200}
          autoFocus
        />
        <label htmlFor="project-new-question">Research question</label>
        <textarea
          id="project-new-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="What question will this review answer?"
          maxLength={5000}
        />
        <label htmlFor="project-new-description">Project notes</label>
        <textarea
          id="project-new-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Scope, inclusion criteria, protocol, or team notes"
          maxLength={20000}
        />
        {error && (
          <p role="alert" className="projects-form-error">
            {error}
          </p>
        )}
        <div className="projects-modal-actions">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            primary
            className="projects-primary"
            type="submit"
            disabled={busy || !title.trim()}
            icon={busy ? LoaderCircle : Plus}
          >
            {busy ? "Creating…" : "Create project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function AddPapers({ library, project, onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(new Set());
  const available = library.filter((paper) => !project.papers?.[paper.id]);
  const filtered = available.filter((paper) =>
    `${paper.title} ${paper.authors?.join(" ") || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Modal title="Add papers from your library" onClose={onClose} wide>
      <div className="projects-add">
        <p>
          Save papers from Literature Review or Pharma research first, then add
          them to this project.
        </p>
        <label className="projects-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search saved papers</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your saved library"
          />
        </label>
        <div className="projects-add-list">
          {filtered.map((paper) => (
            <label className="projects-add-paper" key={paper.id}>
              <input
                type="checkbox"
                checked={selected.has(paper.id)}
                onChange={(event) =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    event.target.checked
                      ? next.add(paper.id)
                      : next.delete(paper.id);
                    return next;
                  })
                }
              />
              <span>
                <strong>{paper.title}</strong>
                <small>
                  {paper.year || "Year unavailable"}
                  {paper.journal ? ` · ${paper.journal}` : ""}
                </small>
              </span>
            </label>
          ))}
          {!filtered.length && (
            <Empty
              icon={BookOpen}
              title={
                available.length
                  ? "No matching saved papers"
                  : "No papers to add"
              }
            >
              {available.length
                ? "Try a different title or author."
                : library.length
                  ? "Every paper in your library is already in this project."
                  : "Save papers to your library to begin screening evidence."}
            </Empty>
          )}
        </div>
        <div className="projects-modal-actions">
          <span>{selected.size} selected</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            primary
            className="projects-primary"
            icon={Plus}
            disabled={!selected.size}
            onClick={() => {
              onAdd([...selected]);
              onClose();
            }}
          >
            Add selected papers
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function ScreeningCard({ id, paper, screening, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const decision = screening.decision || "unscreened";
  const source = sourceURL(paper?.url);
  return (
    <article className={`projects-screen-card projects-decision-${decision}`}>
      <div className="projects-paper-heading">
        <span className="projects-paper-icon">
          <FileText size={18} aria-hidden="true" />
        </span>
        <div>
          <span className="projects-paper-meta">
            {paper?.year || "Year unavailable"}
            {paper?.journal ? ` · ${paper.journal}` : ""}
          </span>
          <h3>{paper?.title || `Paper ${id}`}</h3>
          <p>
            {paper?.authors?.slice(0, 4).join(", ") ||
              "This paper is no longer in the saved library. Your screening notes are retained."}
          </p>
        </div>
        <span className={`projects-decision-label ${decision}`}>
          {decision === "include"
            ? "Included"
            : decision === "exclude"
              ? "Excluded"
              : "Unscreened"}
        </span>
      </div>
      {paper?.abstract && (
        <>
          <p className="projects-paper-abstract">
            {expanded ? paper.abstract : excerpt(paper.abstract, 320)}
          </p>
          {paper.abstract.length > 320 && (
            <button
              className="projects-text-button"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Collapse abstract" : "Read full abstract"}
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          )}
        </>
      )}
      <div className="projects-screen-controls">
        <span>Screening decision</span>
        <div
          className="projects-decision-buttons"
          role="group"
          aria-label={`Screening decision for ${paper?.title || id}`}
        >
          {[
            ["include", "Include", CheckCircle2],
            ["exclude", "Exclude", XCircle],
            ["unscreened", "Unscreened", Circle],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              className={decision === value ? "selected" : ""}
              aria-pressed={decision === value}
              onClick={() => onChange({ decision: value })}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {source && (
          <a href={source} target="_blank" rel="noreferrer">
            Source record
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="projects-screen-notes">
        <label>
          Decision reason
          <input
            value={screening.reason || ""}
            onChange={(event) => onChange({ reason: event.target.value })}
            placeholder={
              decision === "exclude"
                ? "e.g. Wrong population or study design"
                : "Why does this paper fit your review?"
            }
            maxLength={2000}
          />
        </label>
        <label>
          Evidence notes
          <textarea
            value={screening.notes || ""}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Record key findings, limitations, and evidence relevant to your question"
            rows={2}
            maxLength={20000}
          />
        </label>
      </div>
    </article>
  );
}
export default function ResearchProjects() {
  const { library = [], notify } = useApp();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("project");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState({});
  const current = useRef([]);
  const timers = useRef(new Map());
  const pending = useRef(new Map());
  const queues = useRef(new Map());
  const revision = useRef(new Map());
  const selected = projects.find((project) => project.id === selectedId);
  const selectedCounts = selected ? counts(selected) : null;
  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api("/api/records/projects");
      const values = Array.isArray(data) ? data : data.records || [];
      current.current = values;
      setProjects(values);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      for (const id of pending.current.keys()) saveNow(id);
    };
  }, []);
  useEffect(() => {
    setFilter("all");
    setQuery("");
  }, [selectedId]);
  function saveNow(id) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const snapshot = pending.current.get(id);
    if (!snapshot) return queues.current.get(id) || Promise.resolve();
    pending.current.delete(id);
    const version = revision.current.get(id);
    setStatuses((previous) => ({ ...previous, [id]: "saving" }));
    const queued = (queues.current.get(id) || Promise.resolve())
      .catch(() => {})
      .then(() =>
        api(`/api/records/projects/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(snapshot),
        }),
      );
    queues.current.set(id, queued);
    queued
      .then(() => {
        if (revision.current.get(id) === version)
          setStatuses((previous) => ({ ...previous, [id]: "saved" }));
      })
      .catch((e) => {
        if (revision.current.get(id) === version) {
          pending.current.set(id, snapshot);
          setStatuses((previous) => ({ ...previous, [id]: "error" }));
          notify(`Project could not be saved: ${e.message}`, true);
        }
      });
    return queued;
  }
  function updateProject(id, patch) {
    const before = current.current.find((project) => project.id === id);
    if (!before) return;
    const next = { ...before, ...patch, updatedAt: new Date().toISOString() };
    current.current = current.current.map((project) =>
      project.id === id ? next : project,
    );
    setProjects(current.current);
    revision.current.set(id, (revision.current.get(id) || 0) + 1);
    pending.current.set(id, next);
    setStatuses((previous) => ({ ...previous, [id]: "pending" }));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => saveNow(id), 650),
    );
  }
  function updatePaper(id, patch) {
    const latest = current.current.find((project) => project.id === selectedId);
    if (!latest) return;
    updateProject(selectedId, {
      papers: {
        ...latest.papers,
        [id]: { ...freshPaper(), ...latest.papers?.[id], ...patch },
      },
    });
  }
  async function createProject(fields) {
    const id = crypto.randomUUID();
    const project = {
      id,
      ...fields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      papers: {},
    };
    await api(`/api/records/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(project),
    });
    current.current = [project, ...current.current];
    setProjects(current.current);
    setStatuses((previous) => ({ ...previous, [id]: "saved" }));
    setCreating(false);
    setParams({ project: id });
    notify("Research project created.");
  }
  function addPapers(ids) {
    const latest = current.current.find((project) => project.id === selectedId);
    if (!latest) return;
    updateProject(selectedId, {
      papers: {
        ...latest.papers,
        ...Object.fromEntries(ids.map((id) => [id, freshPaper()])),
      },
    });
    notify(
      `${ids.length} ${ids.length === 1 ? "paper" : "papers"} added to this project.`,
    );
  }
  function exportScreening() {
    const header = [
      "Project",
      "Research question",
      "Paper ID",
      "Title",
      "Authors",
      "Year",
      "DOI",
      "Source URL",
      "Decision",
      "Decision reason",
      "Evidence notes",
    ];
    const rows = Object.entries(selected.papers || {}).map(
      ([id, screening]) => {
        const paper = library.find((p) => p.id === id);
        return [
          selected.title,
          selected.question,
          id,
          paper?.title || "",
          paper?.authors?.join("; ") || "",
          paper?.year || "",
          paper?.doi || "",
          paper?.url || "",
          screening.decision || "unscreened",
          screening.reason || "",
          screening.notes || "",
        ];
      },
    );
    download(
      `zntx-${selected.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}-screening.csv`,
      [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"),
      "text/csv;charset=utf-8",
    );
    notify("Screening decisions exported.");
  }
  const displayedProjects = projects.filter((project) =>
    `${project.title} ${project.question}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const papers = selected
    ? Object.entries(selected.papers || {}).filter(([id, screening]) => {
        const paper = library.find((p) => p.id === id);
        return (
          (filter === "all" ||
            (screening.decision || "unscreened") === filter) &&
          `${paper?.title || id} ${screening.notes || ""}`
            .toLowerCase()
            .includes(query.toLowerCase())
        );
      })
    : [];
  const state = statuses[selectedId];
  return (
    <section className="page projects-page">
      {loading ? (
        <div className="projects-loading" role="status">
          <LoaderCircle size={24} className="spin" aria-hidden="true" />
          <p>Opening your research projects…</p>
        </div>
      ) : loadError ? (
        <div className="projects-load-error" role="alert">
          <h2>Projects could not be loaded</h2>
          <p>{loadError}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      ) : selected ? (
        <>
          <div className="projects-detail-top">
            <button
              className="projects-back"
              onClick={() => {
                saveNow(selected.id);
                setParams({});
              }}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              All projects
            </button>
            <div
              className={`projects-save-state ${state === "error" ? "error" : ""}`}
              role="status"
            >
              {state === "saving" ? (
                <LoaderCircle size={13} className="spin" aria-hidden="true" />
              ) : state === "error" ? (
                <XCircle size={13} aria-hidden="true" />
              ) : (
                <Check size={13} aria-hidden="true" />
              )}
              {state === "pending"
                ? "Changes waiting to save"
                : state === "saving"
                  ? "Saving changes…"
                  : state === "error"
                    ? "Changes not saved"
                    : "All changes saved"}
              {state === "error" && (
                <button onClick={() => saveNow(selected.id)}>Retry save</button>
              )}
            </div>
          </div>
          <div className="projects-detail-heading">
            <div className="projects-title-editor">
              <label className="sr-only" htmlFor="project-title">
                Project name
              </label>
              <input
                id="project-title"
                value={selected.title}
                onChange={(event) =>
                  updateProject(selected.id, { title: event.target.value })
                }
                onBlur={() => {
                  if (!selected.title.trim())
                    updateProject(selected.id, {
                      title: "Untitled research project",
                    });
                }}
                maxLength={200}
              />
              <p>
                Research workspace · Created{" "}
                {new Date(selected.createdAt).toLocaleDateString([], {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <Button
              icon={Download}
              onClick={exportScreening}
              disabled={!selectedCounts.total}
            >
              Export screening
            </Button>
          </div>
          <div className="projects-protocol">
            <label htmlFor="project-question">
              <ClipboardList size={15} aria-hidden="true" />
              Research question
            </label>
            <textarea
              id="project-question"
              value={selected.question || ""}
              onChange={(event) =>
                updateProject(selected.id, { question: event.target.value })
              }
              placeholder="Define the question this review will answer…"
              rows={2}
              maxLength={5000}
            />
            <label htmlFor="project-description">
              Protocol & project notes
            </label>
            <textarea
              id="project-description"
              value={selected.description || ""}
              onChange={(event) =>
                updateProject(selected.id, { description: event.target.value })
              }
              placeholder="Scope, inclusion criteria, exclusion criteria, and notes for the review…"
              rows={3}
              maxLength={20000}
            />
          </div>
          <div className="projects-counts">
            {[
              ["total", "Papers in project"],
              ["unscreened", "Awaiting screening"],
              ["include", "Included"],
              ["exclude", "Excluded"],
            ].map(([key, label]) => (
              <div key={key}>
                <strong>{selectedCounts[key]}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="projects-screen-header">
            <div>
              <h2>Evidence screening</h2>
              <p>Review each source and document your inclusion decisions.</p>
            </div>
            <Button
              primary
              className="projects-primary"
              icon={Plus}
              onClick={() => setAdding(true)}
            >
              Add papers
            </Button>
          </div>
          <div className="projects-screen-toolbar">
            <div role="group" aria-label="Filter screening decisions">
              {[
                ["all", "All papers"],
                ["unscreened", "Unscreened"],
                ["include", "Included"],
                ["exclude", "Excluded"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  <span>
                    {value === "all"
                      ? selectedCounts.total
                      : selectedCounts[value]}
                  </span>
                </button>
              ))}
            </div>
            <label className="projects-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search project papers</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a paper or note"
              />
            </label>
          </div>
          {papers.length ? (
            <div className="projects-screen-list">
              {papers.map(([id, screening]) => (
                <ScreeningCard
                  key={id}
                  id={id}
                  paper={library.find((paper) => paper.id === id)}
                  screening={screening}
                  onChange={(patch) => updatePaper(id, patch)}
                />
              ))}
            </div>
          ) : (
            <Empty
              icon={ClipboardList}
              title={
                selectedCounts.total
                  ? "No papers match this view"
                  : "Start your evidence review"
              }
            >
              {selectedCounts.total
                ? "Choose another screening filter or search term."
                : "Add saved library papers to track decisions, reasons, and evidence notes."}
            </Empty>
          )}
        </>
      ) : selectedId ? (
        <Empty icon={FolderOpen} title="Project not found">
          <button
            className="projects-text-button"
            onClick={() => setParams({})}
          >
            Return to your projects
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </Empty>
      ) : (
        <>
          <div className="projects-heading">
            <div>
              <div className="projects-eyebrow">
                <FolderOpen size={14} aria-hidden="true" />
                YOUR RESEARCH, ORGANIZED
              </div>
              <h1>Research projects</h1>
              <p>
                Bring your question, papers, and screening decisions into one
                workspace.
              </p>
            </div>
            <Button
              primary
              className="projects-primary"
              icon={Plus}
              onClick={() => setCreating(true)}
            >
              New project
            </Button>
          </div>
          <div className="projects-overview">
            <div className="projects-overview-icon">
              <ClipboardList size={27} aria-hidden="true" />
            </div>
            <div>
              <h2>A clear trail from question to evidence</h2>
              <p>
                Define your review, collect saved papers, and record why each
                source belongs. Export a screening table whenever you need it.
              </p>
            </div>
            <span>
              {projects.length} {projects.length === 1 ? "project" : "projects"}
            </span>
          </div>
          {projects.length > 0 && (
            <div className="projects-list-toolbar">
              <h2>Your workspaces</h2>
              <label className="projects-search">
                <Search size={15} aria-hidden="true" />
                <span className="sr-only">Search research projects</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a project"
                />
              </label>
            </div>
          )}
          {displayedProjects.length ? (
            <div className="projects-grid">
              {displayedProjects.map((project) => {
                const stats = counts(project);
                const screened = stats.include + stats.exclude;
                return (
                  <button
                    className="projects-project-card"
                    key={project.id}
                    onClick={() => setParams({ project: project.id })}
                  >
                    <span className="projects-card-top">
                      <span className="projects-folder">
                        <FolderOpen size={20} aria-hidden="true" />
                      </span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </span>
                    <h2>{project.title}</h2>
                    <p>
                      {excerpt(
                        project.question ||
                          project.description ||
                          "Add a research question to define the scope of this project.",
                        140,
                      )}
                    </p>
                    <div className="projects-card-stats">
                      <span>
                        {stats.total} {stats.total === 1 ? "paper" : "papers"}
                      </span>
                      <span>{screened} screened</span>
                    </div>
                    <span
                      className="projects-progress"
                      role="progressbar"
                      aria-label={`Papers screened in ${project.title}`}
                      aria-valuemin={0}
                      aria-valuemax={stats.total || 1}
                      aria-valuenow={screened}
                    >
                      <span
                        style={{
                          width: `${stats.total ? (screened / stats.total) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className="projects-card-date">
                      Updated{" "}
                      {new Date(
                        project.updatedAt || project.createdAt,
                      ).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="projects-empty-wrap">
              <Empty
                icon={FolderOpen}
                title={
                  projects.length
                    ? "No matching projects"
                    : "Make space for your next review"
                }
              >
                {projects.length
                  ? "Try a different project name or research question."
                  : "Create a project to organize a literature review, pharma research question, or evidence synthesis."}
              </Empty>
              {!projects.length && (
                <Button
                  primary
                  className="projects-primary"
                  icon={Plus}
                  onClick={() => setCreating(true)}
                >
                  Create your first project
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {creating && (
        <CreateProject
          onClose={() => setCreating(false)}
          onCreate={createProject}
        />
      )}
      {adding && selected && (
        <AddPapers
          library={library}
          project={selected}
          onAdd={addPapers}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
