import React, { useEffect, useState } from "react";
import { Cloud, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "./lib.js";
export default function CloudflareConnection() {
  const [status, setStatus] = useState(null),
    [accountId, setAccountId] = useState(""),
    [apiToken, setApiToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () => api("/api/images/status").then(setStatus);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function connect(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/images/connect", {
        method: "POST",
        body: JSON.stringify({
          accountId: accountId.trim(),
          apiToken: apiToken.trim(),
        }),
      });
      setApiToken("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="ec-card">
      <span className="ec-icon orange">
        <Cloud size={21} />
      </span>
      <h3>Cloudflare Workers AI</h3>
      <span className="ec-status">
        {status?.configured
          ? "Connected for image generation"
          : "Image connection required"}
      </span>
      <p>
        Create illustrations for diagrams and presentations. Regular searches
        never generate images.
      </p>
      {error && (
        <p role="alert" className="ec-error">
          {error}
        </p>
      )}
      <form onSubmit={connect}>
        <label htmlFor="cf-account-id">Cloudflare Account ID</label>
        <input
          id="cf-account-id"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          maxLength={32}
          autoComplete="off"
          required
        />
        <label htmlFor="cf-api-token">Workers AI API token</label>
        <input
          id="cf-api-token"
          type="password"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          maxLength={256}
          autoComplete="off"
          required
        />
        <div className="ec-actions">
          <button
            className="btn primary"
            disabled={busy || !accountId.trim() || !apiToken.trim()}
          >
            {busy
              ? "Checking access…"
              : status?.configured
                ? "Replace connection"
                : "Connect image generation"}
          </button>
          <a
            href="https://dash.cloudflare.com/?to=/:account/ai/workers-ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Workers AI dashboard <ExternalLink size={12} />
          </a>
        </div>
      </form>
      <p className="ec-footnote">
        Use a token scoped to Workers AI Read and Edit for this account.
        Connecting checks access without generating an image. Image requests use
        your Cloudflare allocation.
      </p>
      {status?.configured && (
        <div className="ec-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => load().catch((e) => setError(e.message))}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {status.source === "workspace" && (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/api/images/connection", { method: "DELETE" });
                  await load();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </article>
  );
}
