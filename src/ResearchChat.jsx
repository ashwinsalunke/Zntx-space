import { loadSavedChat } from "./saved-chat.js";
import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolExamples } from "./tool-examples.js";
import { wantsResearchGuide, guidePrompt, validateGuide } from "../shared/research-guide.js";
import ResearchGuideReply from "./ResearchGuideReply.jsx";
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
import { api, csv, download, excerpt, citation, sourceUrl } from "./lib.js";
import { useApp, Button, Empty } from "./App.jsx";
import AiPanel, { ResearchText } from "./AiPanel.jsx";
import "./research-chat.css";
import { EvidenceVerification } from "./SourceVerification.jsx";
function reportPrompt(query, verified) {
  return `Answer this research question using only the supplied evidence: ${query}. Compare study approaches, findings, limitations and open questions. Cite claims and explicitly identify missing evidence.${verified ? " Structure the report as Research question, Evidence summary, Claim-to-source checks, Conflicting findings, Evidence gaps, and Limitations. Identify whether each claim is directly reported in a supplied abstract or is an interpretation. Do not claim a full-text, risk-of-bias, peer-review, or external citation audit was performed. Never infer missing effect sizes or results." : ""}`;
}
export default function ResearchChat() {
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const verified = params.get("mode") === "verified";
  const navigate = useNavigate();
  const { notify, savePaper, library } = useApp();
  const [id, setId] = useState(routeId || crypto.randomUUID());
  const [title, setTitle] = useState("New research");
  const [query, setQuery] = useState(params.get("q") || "");
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [guiding, setGuiding] = useState(false);
  const [conversationMode, setConversationMode] = useState(params.get("guide") === "1" ? "guide" : "auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [saveError, setSaveError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const started = useRef(false);
  const current = useRef(null);
  const pendingQuery = useRef("");
  useEffect(() => {
    api("/api/records/chats")
      .then(setHistory)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!routeId || (routeId === id && turns.length)) return;
    const controller = new AbortController();
    setLoading(true);
    loadSavedChat(routeId, api, controller.signal)
      .then(({ chat, turns: savedTurns }) => {
        if (controller.signal.aborted) return;
        setId(routeId);
        setTitle(chat.title);
        setTurns(savedTurns);
        setConversationMode(savedTurns.at(-1)?.guide ? "guide" : "auto");
      })
      .catch((e) => !controller.signal.aborted && setError(e.message))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
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
        mode: verified ? "verified" : "deep",
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
  async function search(value = query, modeOverride) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    setQuery("");
    pendingQuery.current = value;
    const controller = new AbortController();
    current.current = controller;
    const selectedMode = modeOverride || conversationMode;
    const isGuide = selectedMode === "guide" || (selectedMode === "auto" && wantsResearchGuide(value));
    setGuiding(isGuide);
    try {
      const data = isGuide
        ? await api("/api/ai/generate", { method: "POST", body: JSON.stringify({ task: "guide", prompt: guidePrompt(value.trim(), turns), evidence: [] }), signal: controller.signal })
        : await api("/api/discovery/search?q=" + encodeURIComponent(value.trim()), { signal: controller.signal });
      if (controller.signal.aborted) return;
      const guide = isGuide ? validateGuide(JSON.parse(data.text)) : null;
      if (isGuide) setConversationMode("guide");
      const turn = {
        id: crypto.randomUUID(),
        type: "research-chat-turn",
        chatId: id,
        query: value.trim(),
        mode: verified ? "verified" : "deep",
        ...(guide ? { guide } : { result: data }),
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
        setError(isGuide ? "Your research guide could not reply just now. Your message is kept below; please try again, or switch to Find papers to search directly." : e.message);
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
        warnings: result.warnings,
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
  const notes = (turn) => turn.guide ? `# ${turn.query}\n\n${turn.guide.reply}\n\n${(turn.guide.steps || []).map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\n${turn.guide.question}\n\nResearch planning; no sources retrieved for this reply.` :
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
        {verified && <div className="report-mode-note"><CheckCircle2 size={18}/><div><strong>Verified Report</strong><p>Generation checks citations against supplied evidence identifiers. Use Check report sources for external publication and indexing checks. The report uses retrieved abstracts; review scientific claims against the original papers.</p></div></div>}
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
            Tell me what you want to achieve, or ask “How can scrapeTx help me?”
            I can help you choose a topic, find papers, compare evidence and build a cited draft.
          </Empty>
        )}
        {turns.map((turn) => (
          <article className="research-turn" key={turn.id}>
            <h2>{turn.query}</h2>
            {turn.guide ? <ResearchGuideReply guide={turn.guide} onReply={(reply) => search(reply, "guide")} busy={busy}/> : <>
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
              <details className="research-method"><summary>Search method and coverage</summary><small>
                {turn.result.ranking.description} This bounded search is a starting point for a review.
              </small></details>
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
                <div className="saved-synthesis-text"><ResearchText text={turn.ai.text} citations={turn.ai.citations || []} prefix={`chat-${turn.id}`} /></div>
                <ol>
                  {(turn.ai.citations || []).map((s, index) => (
                    <li key={s.id} id={`chat-${turn.id}-source-${index}`}>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title} <ExternalLink size={11} />
                      </a>
                    </li>
                  ))}
                </ol>
                <small>
                  ScrapeTx AI ·{" "}
                  {new Date(turn.ai.generatedAt).toLocaleString()}
                </small>
              </div>
            ) : (
              <AiPanel
                autoGenerate={params.get("auto") === "1"}
                task="synthesis"
                prompt={reportPrompt(turn.query, verified || turn.mode === "verified")}
                evidence={turn.result.papers
                  .filter((p) => p.abstract)
                  .slice(0, 8)}
                label={verified || turn.mode === "verified" ? "Build evidence report" : "Synthesize the evidence"}
                onResult={(r) => saveSynthesis(turn, r)}
              />
            )}
            {(verified || turn.mode === "verified") && <EvidenceVerification papers={turn.result.papers}/>}
            {(verified || turn.mode === "verified") && <div className="report-source-checks"><span><CheckCircle2 size={15}/>{turn.result.papers.filter((p) => sourceUrl(p)).length} source links available</span><span>{turn.result.papers.filter((p) => p.abstract).length} abstracts available</span><span>Generated citations must match supplied IDs</span></div>}
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
            </>}
          </article>
        ))}
        {busy && (
          <div className="research-working" role="status">
            <LoaderCircle size={18} className="spin" />
            <div>
              <b>{guiding ? "Planning your next step" : "Searching scholarly literature"}</b>
              <p>
                {guiding ? "Connecting your goal with the research tools you can use next." : "Finding relevant papers and bringing their source links together."}
              </p>
            </div>
            <button
              className="text-btn"
              onClick={() => {
                current.current?.abort();
                setQuery(pendingQuery.current);
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
        <PromptSuggestions examples={conversationMode === "search" ? toolExamples.search : toolExamples.chat} value={query} onChoose={setQuery} disabled={busy || loading} />
        <div className="research-conversation-mode" role="group" aria-label="Conversation mode">
          <button type="button" aria-pressed={conversationMode === "guide"} onClick={() => setConversationMode("guide")} disabled={busy}>Guide me</button>
          <button type="button" aria-pressed={conversationMode === "search"} onClick={() => setConversationMode("search")} disabled={busy}>Find papers</button>
        </div>
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
          {conversationMode === "guide" ? "Tell me your topic, goal, or where you are stuck. We’ll work out the next step together." : "Search published evidence or switch to Guide me to plan your project."}
        </p>
      </section>
      <aside className="research-files">
        <h2>
          <Files size={17} /> Research files
        </h2>
        {turns.filter(turn => turn.guide).map(turn => <div className="research-file-group" key={turn.id}>
          <h3>{excerpt(turn.query, 70)}</h3>
          <button onClick={() => download("research-plan.md", notes(turn), "text/markdown")}>
            <FileText size={17}/><span>Research plan<small>Markdown · Guidance</small></span><Download size={14}/>
          </button>
        </div>)}
        {turns.filter(turn => turn.result).map((turn, i) => (
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
