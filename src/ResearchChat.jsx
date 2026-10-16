import React, { useEffect, useRef, useState } from "react";
import {
  useParams,
  useSearchParams,
  Link,
  useNavigate,
} from "react-router-dom";
import {
  Search,
  CheckCircle2,
  Files,
  ArrowUp,
  FileText,
  Download,
  Bookmark,
  LoaderCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { api, csv, download, excerpt, citation } from "./lib.js";
import { useApp, Button, Empty } from "./App.jsx";
import AiPanel from "./AiPanel.jsx";
import "./research-chat.css";
export default function ResearchChat() {
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { notify, savePaper, library } = useApp();
  const [id, setId] = useState(routeId || crypto.randomUUID());
  const [title, setTitle] = useState("New research");
  const [query, setQuery] = useState(params.get("q") || "");
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [saveError, setSaveError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const started = useRef(false);
  const current = useRef(null);
  useEffect(() => {
    api("/api/records/chats")
      .then(setHistory)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!routeId || (routeId === id && turns.length)) return;
    let active = true;
    setLoading(true);
    Promise.all([api("/api/records/chats"), api("/api/records/notes")])
      .then(([chats, notes]) => {
        if (!active) return;
        const chat = chats.find((c) => c.id === routeId);
        if (!chat)
          throw Error("This research chat was not found in your workspace.");
        setId(routeId);
        setTitle(chat.title);
        setTurns(
          (chat.turnIds || [])
            .map((t) => notes.find((n) => n.id === t))
            .filter(Boolean),
        );
        setHistory(chats);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [routeId]);
  useEffect(() => {
    const initial = params.get("q");
    if (initial && !started.current && !routeId) {
      started.current = true;
      search(initial);
    }
  }, []);
  useEffect(() => () => current.current?.abort(), []);
  async function persist(next, nextTitle) {
    try {
      setSaveError("");
      const manifest = {
        id,
        title: nextTitle,
        turnIds: next.map((t) => t.id),
        createdAt: new Date().toISOString(),
      };
      await api("/api/records/chats/" + id, {
        method: "PUT",
        body: JSON.stringify(manifest),
      });
      setHistory((v) => [manifest, ...v.filter((c) => c.id !== id)]);
    } catch (e) {
      setSaveError(e.message);
      notify(
        "Research results are visible, but cloud save failed. Export a backup or retry.",
        true,
      );
    }
  }
  async function search(value = query) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    setQuery("");
    const controller = new AbortController();
    current.current = controller;
    try {
      const data = await api(
        "/api/discovery/search?q=" + encodeURIComponent(value.trim()),
        { signal: controller.signal },
      );
      const turn = {
        id: crypto.randomUUID(),
        type: "research-chat-turn",
        chatId: id,
        query: value.trim(),
        result: data,
        createdAt: new Date().toISOString(),
      };
      const next = [...turns, turn];
      setTurns(next);
      const nextTitle = turns.length ? title : value.trim();
      setTitle(nextTitle);
      try {
        await api("/api/records/notes/" + turn.id, {
          method: "PUT",
          body: JSON.stringify(turn),
        });
        await persist(next, nextTitle);
      } catch (e) {
        setSaveError(e.message);
        notify("Results loaded; cloud save failed. Export a backup.", true);
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(e.message);
        setQuery(value);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function saveSynthesis(turn, result) {
    const updated = {
      ...turn,
      ai: {
        text: result.text,
        citations: result.citations,
        model: result.model,
        generatedAt: result.generatedAt,
      },
    };
    setTurns((v) => v.map((t) => (t.id === turn.id ? updated : t)));
    try {
      await api("/api/records/notes/" + turn.id, {
        method: "PUT",
        body: JSON.stringify(updated),
      });
    } catch (e) {
      setSaveError(e.message);
      notify(
        "Synthesis generated, but saving it failed. Download the response.",
        true,
      );
    }
  }
  async function retrySave() {
    setRetrying(true);
    try {
      for (const turn of turns)
        await api("/api/records/notes/" + turn.id, {
          method: "PUT",
          body: JSON.stringify(turn),
        });
      await persist(turns, title);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setRetrying(false);
    }
  }
  const notes = (turn) =>
    `# ${turn.query}\n\nRetrieved ${turn.result.retrievedAt}\n\n${turn.result.sources.map((s) => `- ${s.name}: ${s.status}, ${s.returned || 0} retrieved`).join("\n")}\n\n${turn.ai?.text || "No AI synthesis generated."}\n\n## Source notes\n${turn.result.papers.map((p, i) => `### ${i + 1}. ${p.title}\n${p.abstract || "Abstract unavailable."}\n${citation(p)}\n${p.url}`).join("\n\n")}`;
  return (
    <div className="research-chat-layout">
      <section className="research-conversation">
        <div className="research-conversation-heading">
          <img src="/logo.svg" alt="" />
          <div>
            <h1>{title}</h1>
            <p>
              Search published evidence. Follow the sources. Keep your work.
            </p>
          </div>
          {busy && <LoaderCircle className="spin" size={18} />}
        </div>
        {loading && (
          <div className="empty" role="status">
            <LoaderCircle className="spin" /> Loading your research…
          </div>
        )}
        {!turns.length && !busy && !loading && (
          <Empty
            icon={MessageSquare}
            title="Your research starts with a question"
          >
            Try “semaglutide cardiovascular outcomes” or “CRISPR delivery
            methods”. Deep search retrieves and deduplicates records from
            Crossref and Europe PMC.
          </Empty>
        )}
        {turns.map((turn) => (
          <article className="research-turn" key={turn.id}>
            <h2>{turn.query}</h2>
            <div className="research-phase">
              <CheckCircle2 size={16} />
              <strong>Completed literature search</strong>
              <small>{new Date(turn.createdAt).toLocaleString()}</small>
            </div>
            <div className="research-source-grid">
              {turn.result.sources.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                  <Search size={17} />
                  <div>
                    <b>{s.name}</b>
                    <span>
                      {s.status === "ok"
                        ? `${s.returned} records retrieved`
                        : "Source unavailable"}
                    </span>
                  </div>
                  {s.status === "ok" ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <AlertCircle size={14} />
                  )}
                </a>
              ))}
            </div>
            <div className="research-checkpoint">
              <b>Search checkpoint</b>
              <p>
                {turn.result.coverage.retrievedRecords} records retrieved,{" "}
                {turn.result.coverage.duplicatesRemoved} duplicates removed,{" "}
                {turn.result.papers.length} unique records retained.{" "}
                {turn.result.coverage.withAbstract} include abstracts.
              </p>
              <small>
                {turn.result.ranking.description} This bounded search is a
                starting point for a review.
              </small>
            </div>
            {turn.ai ? (
              <div className="saved-synthesis">
                <div className="section-heading">
                  <h3>Saved synthesis</h3>
                  <Button
                    icon={Download}
                    onClick={() =>
                      download(
                        "research-synthesis.md",
                        notes(turn),
                        "text/markdown",
                      )
                    }
                  >
                    Download
                  </Button>
                </div>
                <pre>{turn.ai.text}</pre>
                <ol>
                  {turn.ai.citations.map((s) => (
                    <li key={s.id}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title} <ExternalLink size={11} />
                      </a>
                    </li>
                  ))}
                </ol>
                <small>
                  {turn.ai.model} ·{" "}
                  {new Date(turn.ai.generatedAt).toLocaleString()}
                </small>
              </div>
            ) : (
              <AiPanel
                task="synthesis"
                prompt={`Answer this research question using only the supplied evidence: ${turn.query}. Compare study approaches, findings, limitations and open questions. Cite claims and explicitly identify missing evidence.`}
                evidence={turn.result.papers
                  .filter((p) => p.abstract)
                  .slice(0, 20)}
                label="Synthesize the evidence"
                onResult={(r) => saveSynthesis(turn, r)}
              />
            )}
            <div className="section-heading">
              <h3>References · {turn.result.papers.length}</h3>
              <button
                className="text-btn"
                onClick={() =>
                  setExpanded((v) => ({ ...v, [turn.id]: !v[turn.id] }))
                }
              >
                {expanded[turn.id] ? "Show fewer" : "Show all"}{" "}
                {expanded[turn.id] ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
            </div>
            <div className="research-reference-list">
              {turn.result.papers
                .slice(0, expanded[turn.id] ? 80 : 5)
                .map((p, i) => (
                  <div key={p.id}>
                    <span>{i + 1}</span>
                    <div>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        <b>{p.title}</b>
                        <ExternalLink size={11} />
                      </a>
                      <small>
                        {p.authors?.slice(0, 2).join(", ")} · {p.year || "n.d."}{" "}
                        · {p.sources.join(" + ")}
                      </small>
                      <p>
                        {p.abstract
                          ? excerpt(p.abstract, 250)
                          : "Abstract unavailable. Read the original source."}
                      </p>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label={"Save " + p.title}
                      onClick={() => savePaper(p)}
                    >
                      <Bookmark
                        size={16}
                        fill={
                          library.some((s) => s.id === p.id)
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>
                  </div>
                ))}
            </div>
            <Link
              className="btn"
              to={
                "/search?q=" +
                encodeURIComponent(turn.query) +
                "&source=deep&view=table"
              }
            >
              Open evidence table <ArrowUp size={13} />
            </Link>
          </article>
        ))}
        {busy && (
          <div className="research-working" role="status">
            <LoaderCircle size={18} className="spin" />
            <div>
              <b>Searching scholarly databases</b>
              <p>
                Retrieving Crossref and Europe PMC records, removing duplicates,
                and ranking title and abstract matches.
              </p>
            </div>
            <button
              className="text-btn"
              onClick={() => {
                current.current?.abort();
                setBusy(false);
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {error && (
          <p className="research-error" role="alert">
            {error}
          </p>
        )}
        {saveError && (
          <div className="notice" role="alert">
            <AlertCircle size={16} />
            <span>
              Cloud save failed: {saveError}. Keep this page open and export the
              source notes.
            </span>
            <Button disabled={retrying || busy} onClick={retrySave}>
              {retrying ? "Saving…" : "Retry save"}
            </Button>
          </div>
        )}
        <form
          className="research-follow-up"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <textarea
            aria-label="Research question"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a research question or explore a follow-up…"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                search();
              }
            }}
          />
          <button
            className="submit-btn"
            disabled={!query.trim() || busy}
            aria-label="Search research question"
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowUp size={18} />
            )}
          </button>
        </form>
        <p className="research-chat-note">
          Evidence discovery and optional AI synthesis. Verify findings against
          full texts.
        </p>
      </section>
      <aside className="research-files">
        <h2>
          <Files size={17} /> Research files
        </h2>
        {turns.map((turn, i) => (
          <div className="research-file-group" key={turn.id}>
            <small>SEARCH {i + 1}</small>
            <h3>{excerpt(turn.query, 70)}</h3>
            <button
              onClick={() =>
                download(
                  "research-sources.csv",
                  csv(turn.result.papers),
                  "text/csv",
                )
              }
            >
              <FileText size={17} />
              <span>
                Sources table
                <small>CSV · {turn.result.papers.length} records</small>
              </span>
              <Download size={14} />
            </button>
            <button
              onClick={() =>
                download(
                  "research-source-notes.md",
                  notes(turn),
                  "text/markdown",
                )
              }
            >
              <FileText size={17} />
              <span>
                Source notes
                <small>
                  Markdown · {turn.ai ? "With synthesis" : "Evidence only"}
                </small>
              </span>
              <Download size={14} />
            </button>
          </div>
        ))}
        <div className="section-label">Recent research</div>
        {history.slice(0, 10).map((chat) => (
          <Link key={chat.id} to={"/chat/" + chat.id}>
            <MessageSquare size={13} />
            <span>{chat.title}</span>
          </Link>
        ))}
      </aside>
    </div>
  );
}
