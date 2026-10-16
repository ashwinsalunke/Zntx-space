import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Settings2,
  CheckCircle2,
  Globe,
  Server,
  Database,
  ArrowRight,
  RefreshCw,
  Download,
  Upload,
  Copy,
  ExternalLink,
  Plug,
  Search,
  Info,
  LoaderCircle,
} from "lucide-react";
import { api, download } from "./lib.js";
import { useApp, Button, Modal } from "./App.jsx";
import "./integrations.css";
import ExternalConnections from "./ExternalConnections.jsx";
export default function Integrations() {
  const { notify } = useApp();
  const [config, setConfig] = useState(null);
  const [ai, setAi] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState(null);
  const [selected, setSelected] = useState(null);
  const [args, setArgs] = useState("{}");
  const [output, setOutput] = useState(null);
  const [restore, setRestore] = useState("");
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [c, a, s] = await Promise.all([
        api("/api/config"),
        api("/api/ai/status"),
        api("/api/integrations/status"),
      ]);
      setConfig(c);
      setAi(a);
      setStatus(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const backup = async () => {
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        collections: {},
      };
      for (const collection of [
        "papers",
        "drafts",
        "projects",
        "chats",
        "notes",
        "searches",
        "reviews",
        "agents",
      ])
        data.collections[collection] = await api("/api/records/" + collection);
      download(
        "scrapetx-workspace-backup.json",
        JSON.stringify(data, null, 2),
        "application/json",
      );
      notify("Workspace backup exported.");
    } catch (e) {
      notify(e.message, true);
    }
  };
  const restoreBackup = async (file) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024)
      return notify("Choose a workspace backup smaller than 15 MB.", true);
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !data.collections)
        throw Error("Not a scrapeTx workspace backup.");
      let count = 0;
      for (const collection of [
        "papers",
        "drafts",
        "projects",
        "chats",
        "notes",
        "searches",
        "reviews",
        "agents",
      ])
        for (const item of data.collections[collection] || []) {
          if (typeof item.id !== "string")
            throw Error("A backup record is missing its ID.");
          await api(
            `/api/records/${collection}/${encodeURIComponent(item.id)}`,
            { method: "PUT", body: JSON.stringify(item) },
          );
          count++;
        }
      notify(`Restored ${count} records. Reload to refresh your library.`);
    } catch (e) {
      notify(e.message, true);
    }
  };
  const inspect = async (server) => {
    setBusy(true);
    setOutput(null);
    try {
      const result = await api("/api/integrations/mcp/" + server.id + "/tools");
      setTools({ ...server, tools: result.tools });
      setSelected(null);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="page integrations-page">
      <div className="page-heading">
        <div>
          <h1>Integrations & workspace</h1>
          <p>Bring research sources, models, and tools into one place.</p>
        </div>
        <Button icon={RefreshCw} disabled={busy} onClick={load}>
          Refresh status
        </Button>
      </div>
      {error && (
        <p className="integration-error" role="alert">
          {error}
        </p>
      )}
      <ExternalConnections />
      <div className="integration-grid">
        <article className="integration-card">
          <span className="integration-icon">
            <Database size={23} />
          </span>
          <h2>{config?.storage || "Workspace storage"}</h2>
          <span className="integration-state">
            <CheckCircle2 size={13} />
            {config?.cloud ? "Connected cloud storage" : "Local storage"}
          </span>
          <p>
            Your library, drafts, review projects, and chats are isolated by a
            random workspace key held in this browser. No login screen is
            required.
          </p>
          <div className="integration-actions">
            <Button icon={Download} onClick={backup}>
              Export backup
            </Button>
            <label className="btn">
              <Upload size={14} /> Restore backup
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={(e) => restoreBackup(e.target.files[0])}
              />
            </label>
          </div>
          <p className="integration-hint">
            Clearing browser storage loses access unless you keep a backup or
            workspace key. Treat the key as a password.
          </p>
          <details>
            <summary>Transfer this workspace to another browser</summary>
            <Button
              icon={Copy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    localStorage.getItem("zntx-workspace-token") || "",
                  );
                  notify("Workspace key copied. Keep it private.");
                } catch {
                  notify("Clipboard is unavailable.", true);
                }
              }}
            >
              Copy private workspace key
            </Button>
            <label>
              Existing workspace key
              <input
                type="password"
                value={restore}
                onChange={(e) => setRestore(e.target.value.trim())}
                placeholder="64-character private key"
                autoComplete="off"
              />
            </label>
            <Button
              disabled={!/^[a-f0-9]{64}$/.test(restore)}
              onClick={() => {
                localStorage.setItem("zntx-workspace-token", restore);
                location.reload();
              }}
            >
              Use this workspace
            </Button>
          </details>
        </article>
        <article className="integration-card">
          <span className="integration-icon">
            <Server size={23} />
          </span>
          <h2>ScrapeTx AI</h2>
          <span
            className={`integration-state ${ai?.configured ? "" : "pending"}`}
          >
            {ai?.configured ? (
              <>Connected assistant</>
            ) : (
              "Connect your assistant"
            )}
          </span>
          <p>
            Explain papers, compare evidence, draft literature reviews, and save useful answers with linked sources.
          </p>
          <p className="integration-hint">Your assistant connection is configured privately on this server. Research text is sent only when you ask for an AI response.</p>
          <Link className="btn" to="/chat">
            Open Research Agent <ArrowRight size={14} />
          </Link>
        </article>
        <article className="integration-card">
          <span className="integration-icon">
            <Globe size={23} />
          </span>
          <h2>Research sources</h2>
          <span className="integration-state">
            <CheckCircle2 size={13} /> Public APIs integrated
          </span>
          <div className="source-status-list">
            {status?.sources.map((s) => (
              <div key={s.name}>
                <span>{s.name}</span>
                <small>{s.status}</small>
              </div>
            ))}
          </div>
          <div className="source-status-list">{["arXiv preprints", "Research datasets", "Grants.gov", "Python packages"].map(name=><div key={name}><span>{name}</span><small>Public source</small></div>)}</div>
          <Link className="btn" to="/pharma">
            Explore pharma sources <ArrowRight size={14} />
          </Link>
        </article>
        <article className="integration-card">
          <span className="integration-icon">
            <Plug size={23} />
          </span>
          <h2>MCP tool servers</h2>
          <span className="integration-state">
            {status?.mcp.length || 0} configured servers
          </span>
          <p>
            Discover and run read-only tools exposed by your own MCP servers.
            Tool calls run only when you select a tool and submit its arguments.
          </p>
          {!status?.owner && (
            <p className="integration-hint">
              Private connectors are owner-only. Copy this workspace’s hash into
              INTEGRATION_OWNER_HASH in your server environment, then restart.
            </p>
          )}
          <Button
            icon={Copy}
            onClick={async () => {
              try {
                const value =
                  localStorage.getItem("zntx-workspace-token") || "";
                const digest = await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(value),
                );
                const hash = Array.from(new Uint8Array(digest), (n) =>
                  n.toString(16).padStart(2, "0"),
                ).join("");
                await navigator.clipboard.writeText(hash);
                notify(
                  "Workspace owner hash copied. Set it in INTEGRATION_OWNER_HASH.",
                );
              } catch {
                notify("Clipboard is unavailable.", true);
              }
            }}
          >
            Copy owner workspace hash
          </Button>
          {status?.mcp.map((s) => (
            <button
              className="mcp-server-row"
              key={s.id}
              disabled={busy}
              onClick={() => inspect(s)}
            >
              <Server size={16} />
              <span>
                {s.name}
                <small>{s.host}</small>
              </span>
              <Search size={15} />
            </button>
          ))}
          <details>
            <summary>Configure a server</summary>
            <pre>
              {
                'MCP_SERVERS=[{"id":"research","name":"My Research Tools","url":"https://your-server/mcp","tokenEnv":"RESEARCH_MCP_TOKEN"}]\nRESEARCH_MCP_TOKEN=your-token'
              }
            </pre>
            <p>
              Set environment variables on the server and restart. This
              interface accepts tools marked read-only. Write actions are
              intentionally unavailable.
            </p>
          </details>
        </article>
        <article className="integration-card">
          <span className="integration-icon"><CheckCircle2 size={23}/></span><h2>Publication & approval checks</h2>
          <p>Compare DOI metadata, inspect Crossref and Retraction Watch updates, check PubMed notices and current MEDLINE indexing, and look up US FDA approval applications.</p>
          <Link className="btn" to="/verification">Check a source <ArrowRight size={14}/></Link>
          <p className="integration-hint">These services check source records. They do not certify scientific correctness or peer review.</p>
        </article>
        <article className="integration-card">
          <span className="integration-icon">
            <Info size={23} />
          </span>
          <h2>Open research, clear boundaries</h2>
          <p>
            scrapeTx uses independent implementations and public sources.
            Subscription-only source access, proprietary search indexes,
            plagiarism databases, and commercial AI detection are not included.
          </p>
          <p>
            Source APIs may enforce quotas and do not grant access to paywalled
            papers. Your AI provider sees the text you explicitly send to it.
          </p>
          <a
            className="btn"
            href="https://github.com/ashwinsalunke/Zntx-space"
            target="_blank"
            rel="noreferrer"
          >
            Source repository <ExternalLink size={13} />
          </a>
        </article>
      </div>
      {tools && (
        <Modal
          title={tools.name + " · Available tools"}
          wide
          onClose={() => setTools(null)}
        >
          <div className="modal-body">
            <p className="muted small">
              Review the tool description and arguments before running a query.
              Tool output is untrusted source material.
            </p>
            <div className="mcp-tools">
              {tools.tools.map((t) => (
                <button
                  className={selected?.name === t.name ? "active" : ""}
                  key={t.name}
                  onClick={() => {
                    setSelected(t);
                    setArgs("{}");
                    setOutput(null);
                  }}
                >
                  <b>{t.name}</b>
                  <span>{t.description}</span>
                  <small>
                    {t.readOnly ? "Read-only" : "Write-capable · unavailable"}
                  </small>
                </button>
              ))}
            </div>
            {selected && (
              <div className="mcp-tool-form">
                <h3>{selected.name}</h3>
                <details>
                  <summary>Input schema</summary>
                  <pre>{JSON.stringify(selected.inputSchema, null, 2)}</pre>
                </details>
                <label>
                  Tool arguments (JSON)
                  <textarea
                    rows={6}
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                  />
                </label>
                <Button
                  primary
                  disabled={!selected.readOnly || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const payload = JSON.parse(args);
                      setOutput(
                        await api(
                          "/api/integrations/mcp/" + tools.id + "/call",
                          {
                            method: "POST",
                            body: JSON.stringify({
                              name: selected.name,
                              arguments: payload,
                            }),
                          },
                        ),
                      );
                    } catch (e) {
                      notify(e.message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Running…" : "Run read-only tool"}
                </Button>
                {output && (
                  <pre className="mcp-output">
                    {JSON.stringify(output, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
