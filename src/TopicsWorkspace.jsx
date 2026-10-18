import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  Download,
  FlaskConical,
  Leaf,
  LoaderCircle,
  Microscope,
  Pill,
  ScanSearch,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button, useApp } from "./App.jsx";
import { api, download, sourceUrl } from "./lib.js";
import { ResearchText } from "./AiPanel.jsx";
import PromptSuggestions from "./PromptSuggestions.jsx";
import NotebookPicker from "./NotebookPicker.jsx";
import { toolExamples } from "./tool-examples.js";
import { topicDefaults, topicChoices } from "../shared/topic-discovery.js";
import {
  topicRecommendations,
  topicScanSources,
  topicScanPrompt,
  rankTopicScan,
  topicSourceSummary,
  topicComparisonCsv,
} from "./topic-discovery.js";
import "./topics-workspace.css";
import "./notebooks.css";
const icons = {
  pill: Pill,
  flask: FlaskConical,
  microbe: Microscope,
  leaf: Leaf,
  brain: Brain,
};
const scanCacheKey = () =>
  "scrapetx-topic-scan:" + localStorage.getItem("zntx-workspace-token");
function cachedScan(params) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(scanCacheKey()));
    if (
      !cached ||
      !Number.isFinite(Date.parse(cached.scan?.scannedAt)) ||
      Date.now() - Date.parse(cached.scan.scannedAt) > 86400000 ||
      ((params.get("q") || params.get("topic")) &&
        (params.get("q") || params.get("topic")) !== cached.scan.query)
    )
      return null;
    const validated = rankTopicScan(
      cached.scan,
      cached.sources,
      cached.scan.profile,
      new Date(cached.scan.scannedAt),
    );
    return { ...cached, scan: { ...cached.scan, ...validated } };
  } catch {
    return null;
  }
}
const labels = {
  goal: "I want to",
  experience: "Research experience",
  time: "Time available",
  resources: "Resources I have",
  focus: "What matters most",
};
export default function TopicsWorkspace() {
  const [params, setParams] = useSearchParams(),
    { navigate } = useApp();
  const [cached] = useState(() => cachedScan(params));
  const [query, setQuery] = useState(
      params.get("topic") || params.get("q") || cached?.scan.query || "",
    ),
    [profile, setProfile] = useState(
      cached?.scan.profile || { ...topicDefaults },
    );
  const [personalize, setPersonalize] = useState(false),
    [window, setWindow] = useState(cached?.scan.sourceWindow || "recent"),
    [sort, setSort] = useState("fit"),
    [view, setView] = useState("cards");
  const [phase, setPhase] = useState(0),
    [scan, setScan] = useState(cached?.scan || null),
    [sources, setSources] = useState(cached?.sources || []),
    [coverage, setCoverage] = useState(cached?.coverage || null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(null);
  const operation = useRef(null);
  useEffect(() => () => operation.current?.abort(), []);
  function cancel() {
    operation.current?.abort();
    operation.current = null;
    setPhase(0);
  }
  async function discover(e) {
    e.preventDefault();
    if (!query.trim() || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    const q = query.trim(),
      preferences = { ...profile };
    setError("");
    setPhase(1);
    try {
      const retrieved = await api(
        "/api/discovery/search?" + new URLSearchParams({ q, sort: window }),
        { signal: controller.signal },
      );
      controller.signal.throwIfAborted();
      const evidence = topicScanSources(
        retrieved.papers || [],
        new Date(),
        window,
      );
      if (!evidence.length)
        throw Error(
          "No readable source abstracts were returned. Try a more specific topic or choose all years.",
        );
      setPhase(2);
      const result = await api("/api/ai/generate", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          task: "topic-scan",
          prompt: topicScanPrompt(q, preferences, evidence),
          evidence: evidence.map((s) => ({
            id: s.evidenceId,
            title: s.title,
            url: sourceUrl(s),
            abstract: s.abstract.slice(0, 6000),
          })),
        }),
      });
      controller.signal.throwIfAborted();
      const ranked = rankTopicScan(
        JSON.parse(result.text),
        evidence,
        preferences,
      );
      const next = {
        ...ranked,
        query: q,
        profile: preferences,
        sourceWindow: window,
        scannedAt: new Date().toISOString(),
      };
      const provenance = {
        coverage: retrieved.coverage,
        sources: retrieved.sources,
        searchWindow: retrieved.searchWindow,
        partial: retrieved.partial,
      };
      setSources(evidence);
      setScan(next);
      setCoverage(provenance);
      setParams({ q }, { replace: true });
      try {
        sessionStorage.setItem(
          scanCacheKey(),
          JSON.stringify({
            scan: next,
            sources: evidence,
            coverage: provenance,
          }),
        );
      } catch {
        /* A scan remains usable when browser storage is unavailable. */
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setPhase(0);
      }
    }
  }
  const topics = scan
    ? [...scan.topics].sort((a, b) =>
        sort === "evidence"
          ? b.sourceIds.length - a.sourceIds.length
          : sort === "recent"
            ? Math.max(
                0,
                ...topicSourceSummary(b, sources).map(
                  (s) => Number(s.year) || 0,
                ),
              ) -
              Math.max(
                0,
                ...topicSourceSummary(a, sources).map(
                  (s) => Number(s.year) || 0,
                ),
              )
            : b.score.total - a.score.total,
      )
    : [];
  const citations = sources.map((s) => ({
    id: s.evidenceId,
    title: s.title,
    url: sourceUrl(s),
  }));
  function exportCsv() {
    download(
      "research-topics.csv",
      topicComparisonCsv(topics, sources),
      "text/csv;charset=utf-8",
    );
  }
  return (
    <section className={"tf-page " + (scan ? "has-results" : "")}>
      <header className="tf-header">
        <div>
          <span className="tf-eyebrow">DISCOVER YOUR DIRECTION</span>
          <h1>
            Find a topic. <em>Make it yours.</em>
          </h1>
          <p>
            Turn an interest into a research question you can actually work on.
          </p>
        </div>
        <Link className="btn" to="/notebooks">
          <BookOpen size={16} />
          My notebooks
        </Link>
      </header>
      <div className={"tf-search-panel " + (phase ? "is-scanning" : "")}>
        <form onSubmit={discover} className="tf-search">
          <ScanSearch size={24} />
          <label className="sr-only" htmlFor="topic-area">
            Research area
          </label>
          <input
            id="topic-area"
            aria-label="Research area"
            value={query}
            disabled={!!phase}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={300}
            placeholder="What are you curious about? e.g. antibiotics"
          />
          <Button
            primary
            type="submit"
            disabled={!!phase || !query.trim()}
            icon={phase ? LoaderCircle : ArrowRight}
          >
            {phase ? "Scanning…" : "Find topics"}
          </Button>
        </form>
        <div className="tf-search-options">
          <button
            className={personalize ? "active" : ""}
            aria-expanded={personalize}
            aria-controls="topic-fit"
            onClick={() => setPersonalize(!personalize)}
          >
            <SlidersHorizontal size={16} />
            What topics are best for me?
            <ChevronDown size={14} />
          </button>
          <label>
            Source window
            <select
              aria-label="Topic source window"
              value={window}
              disabled={!!phase}
              onChange={(e) => setWindow(e.target.value)}
            >
              <option value="recent">Last 3 years + current year</option>
              <option value="relevance">All years</option>
            </select>
          </label>
        </div>
        {personalize && (
          <div className="tf-profile" id="topic-fit">
            <div>
              <h2>A little about your project</h2>
              <p>
                Optional. We’ll use these answers to suggest practical ideas and
                explain their fit.
              </p>
            </div>
            {Object.entries(topicChoices).map(([key, choices]) => (
              <label key={key}>
                {labels[key]}
                <select
                  aria-label={labels[key]}
                  disabled={!!phase}
                  value={profile[key]}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, [key]: e.target.value }))
                  }
                >
                  {choices.map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>
      {phase > 0 && (
        <div className="tf-progress" role="status">
          <div className="tf-radar">
            <ScanSearch size={25} />
          </div>
          <div>
            <strong>
              {phase === 1
                ? "Scanning research sources"
                : "Finding focused research questions"}
            </strong>
            <p>
              {phase === 1
                ? "Retrieving article records and available abstracts."
                : "Reading the retrieved abstracts and matching ideas to your project."}
            </p>
            <ol>
              <li className={phase === 1 ? "current" : "complete"}>
                {phase > 1 ? (
                  <Check size={13} />
                ) : (
                  <LoaderCircle size={13} className="spin" />
                )}
                Find sources
              </li>
              <li className={phase === 2 ? "current" : ""}>
                Analyze topics & calculate fit
              </li>
            </ol>
          </div>
          <Button onClick={cancel} icon={X}>
            Cancel
          </Button>
        </div>
      )}
      {!scan && !phase && (
        <>
          <div className="tf-recommendations">
            <span>EXPLORE AN INTEREST</span>
            <div>
              {topicRecommendations.map(({ label, query: q, icon }, i) => {
                const Icon = icons[icon];
                return (
                  <button
                    key={label}
                    disabled={!!phase}
                    onClick={() => {
                      setQuery(q);
                      document.getElementById("topic-area")?.focus();
                    }}
                  >
                    <span className={"tf-topic-icon tone-" + i}>
                      <Icon size={19} />
                    </span>
                    {label}
                    <ArrowRight size={14} />
                  </button>
                );
              })}
            </div>
          </div>
          <PromptSuggestions
            examples={toolExamples.topics}
            value={query}
            disabled={!!phase}
            onChoose={setQuery}
            inputId="topic-area"
            title="Try a research question"
            hint="Choose an example, then scan the literature."
          />
          <div className="tf-how">
            <h2>A clearer place to start</h2>
            {[
              [
                Search,
                "Scan the literature",
                "We retrieve real paper records and read the available abstracts.",
              ],
              [
                SlidersHorizontal,
                "Compare possibilities",
                "See specific questions, practical methods, and an explained score.",
              ],
              [
                BookOpen,
                "Keep building",
                "Save an idea with its sources, then start writing in your notebook.",
              ],
            ].map(([Icon, title, text], i) => (
              <div key={title}>
                <span>0{i + 1}</span>
                <Icon size={19} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error} {scan && "Your previous scan is still available below."}
        </div>
      )}
      {scan && (
        <div className="tf-results">
          {(JSON.stringify(profile) !== JSON.stringify(scan.profile) ||
            window !== (scan.sourceWindow || "recent")) && (
            <p className="notice">
              Your preferences changed. Run Find topics again to update these
              suggestions and scores.
            </p>
          )}
          <section className="tf-overview">
            <span className="tf-eyebrow">YOUR TOPIC SCAN</span>
            <h2>Research directions in {scan.query}</h2>
            <ResearchText
              text={scan.summary}
              citations={citations}
              prefix="topic"
            />
            <p className="tf-scan-meta">
              {sources.length} abstracts analyzed ·{" "}
              {coverage?.coverage?.uniqueRecords ??
                coverage?.papers?.length ??
                0}{" "}
              records retrieved ·{" "}
              {new Date(scan.scannedAt).toLocaleDateString()}
              {coverage?.searchWindow
                ? ` · ${coverage.searchWindow.from} to ${coverage.searchWindow.to}`
                : ""}
            </p>
            {coverage?.partial && (
              <p className="notice">
                Some sources could not respond. These suggestions use the
                available source results.
              </p>
            )}
          </section>
          <div className="tf-result-toolbar">
            <div>
              <h2>{topics.length} directions to explore</h2>
              <p>
                The highest planning score is a starting point for discussion
                with your supervisor.
              </p>
            </div>
            <div>
              <select
                aria-label="Sort research topics"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="fit">Best planning fit</option>
                <option value="evidence">Most linked sources</option>
                <option value="recent">Newest linked evidence</option>
              </select>
              <button
                className="btn"
                onClick={() => setView(view === "cards" ? "table" : "cards")}
              >
                {view === "cards" ? "Compare table" : "Detailed cards"}
              </button>
              <Button icon={Download} onClick={exportCsv}>
                Export CSV
              </Button>
            </div>
          </div>
          <p className="tf-score-note">
            <strong>About your score:</strong> up to 3 points for cited
            abstracts, 2 for recent sources, 3 for practical fit, and 2 for
            question focus. This heuristic helps compare ideas in this scan; it
            is not a scientific quality rating, proof of novelty, or a guarantee
            of success. Method and difficulty are AI suggestions to confirm with
            your supervisor.
          </p>
          {view === "table" ? (
            <div className="tf-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Topic & question</th>
                    <th>Planning score</th>
                    <th>Method / level</th>
                    <th>Sources</th>
                    <th>Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.title}</strong>
                        <p>{t.question.replace(/\[\[cite:[^\]]+\]\]/g, "")}</p>
                      </td>
                      <td>
                        <strong>{t.score.total}/10</strong>
                      </td>
                      <td>
                        {t.method === "secondary"
                          ? "Public-data analysis"
                          : t.method === "experiment"
                            ? "Experiment planning"
                            : "Literature review"}
                        <br />
                        {t.difficulty}
                      </td>
                      <td>
                        {topicSourceSummary(t, sources).map((s) => (
                          <a
                            key={s.evidenceId}
                            href={sourceUrl(s)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            [{s.evidenceId.slice(1)}]{" "}
                            {s.year || "Year unavailable"}
                            <br />
                          </a>
                        ))}
                      </td>
                      <td>
                        <Button icon={BookOpen} onClick={() => setSaving(t)}>
                          Save topic
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tf-topic-list">
              {topics.map((t, index) => (
                <article className="tf-topic-card" key={t.id}>
                  <div className="tf-card-heading">
                    <div>
                      <span className="tf-direction">
                        DIRECTION {String(index + 1).padStart(2, "0")} ·{" "}
                        {t.difficulty}
                      </span>
                      <h3>{t.title}</h3>
                    </div>
                    <div className="tf-score">
                      <strong>
                        {t.score.total}
                        <small>/10</small>
                      </strong>
                      <span>Planning score</span>
                    </div>
                  </div>
                  <div className="tf-question">
                    <ResearchText
                      text={t.question}
                      citations={citations}
                      prefix="topic"
                    />
                  </div>
                  <div className="tf-card-columns">
                    <section>
                      <h4>Why explore this?</h4>
                      <ResearchText
                        text={t.whyNow}
                        citations={citations}
                        prefix="topic"
                      />
                    </section>
                    <section>
                      <h4>A way to approach it</h4>
                      <ResearchText
                        text={t.approach}
                        citations={citations}
                        prefix="topic"
                      />
                    </section>
                  </div>
                  <div className="tf-first-step">
                    <strong>Start here</strong>
                    <ResearchText
                      text={t.firstStep}
                      citations={citations}
                      prefix="topic"
                    />
                  </div>
                  <details className="tf-score-details">
                    <summary>
                      Why this score? · Scope & limitations{" "}
                      <ChevronDown size={14} />
                    </summary>
                    <div className="tf-score-breakdown">
                      {t.score.components.map((c) => (
                        <div key={c.label}>
                          <span>
                            {c.label}
                            <strong>
                              {c.value}/{c.max}
                            </strong>
                          </span>
                          <progress value={c.value} max={c.max} />
                          <p>{c.reason}</p>
                        </div>
                      ))}
                    </div>
                    <ResearchText
                      text={t.limitation}
                      citations={citations}
                      prefix="topic"
                    />
                  </details>
                  <div className="tf-card-sources">
                    {topicSourceSummary(t, sources).map((s) => (
                      <a
                        href={sourceUrl(s)}
                        target="_blank"
                        rel="noreferrer"
                        key={s.evidenceId}
                        title={s.title}
                      >
                        [{s.evidenceId.slice(1)}]{" "}
                        {s.journal || s.source || "Source"} ·{" "}
                        {s.year || "Year unavailable"} ↗
                      </a>
                    ))}
                  </div>
                  <footer>
                    <Button
                      primary
                      icon={BookOpen}
                      onClick={() => setSaving(t)}
                    >
                      Save to notebook
                    </Button>
                    <Link
                      className="btn"
                      to={
                        "/research-workflow?" +
                        new URLSearchParams({
                          topic: t.question.replace(/\[\[cite:[^\]]+\]\]/g, ""),
                        })
                      }
                    >
                      Start research
                      <ArrowRight size={15} />
                    </Link>
                    <Link
                      to={
                        "/search?" +
                        new URLSearchParams({ q: t.title, source: "deep" })
                      }
                    >
                      Find papers ↗
                    </Link>
                  </footer>
                </article>
              ))}
            </div>
          )}
          <details className="tf-source-list" open>
            <summary>Explore the {sources.length} source abstracts</summary>
            <p>
              Suggestions use abstracts, not full articles. Read the original
              study to assess methods, relevance, and limitations. The scan is a
              bounded sample, not an exhaustive review.
            </p>
            {sources.map((s, i) => (
              <article key={s.evidenceId} id={"topic-source-" + i}>
                <span>
                  [{i + 1}] {s.year || "Year unavailable"} · {s.source}
                </span>
                <h3>
                  <a href={sourceUrl(s)} target="_blank" rel="noreferrer">
                    {s.title} ↗
                  </a>
                </h3>
                <details>
                  <summary>Read abstract</summary>
                  <p>{s.abstract}</p>
                </details>
              </article>
            ))}
          </details>
        </div>
      )}
      {saving && (
        <NotebookPicker
          topic={saving}
          sources={sources}
          onClose={() => setSaving(null)}
          onSaved={(n) => navigate("/notebooks/" + encodeURIComponent(n.id))}
        />
      )}
    </section>
  );
}
