import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Download, ExternalLink, LoaderCircle, ArrowLeft } from "lucide-react";
export function pdfReaderLink(record) {
  const params = new URLSearchParams({
    title: record.title || "Research paper",
  });
  if (record.librarySync?.provider === "mendeley")
    params.set("mendeley", record.librarySync.remoteId);
  else if (record.pdf) params.set("url", record.pdf);
  if (record.url) params.set("source", record.url);
  return "/read-pdf?" + params;
}
function safe(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export default function SourcePdfReader() {
  const [params] = useSearchParams(),
    title = params.get("title") || "Research paper",
    url = safe(params.get("url")),
    source = safe(params.get("source")) || url,
    mendeley = params.get("mendeley");
  const [blob, setBlob] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setBlob("");
    setError("");
    setBusy(true);
    (async () => {
      try {
        if (!url && !mendeley)
          throw Error("No PDF link was supplied for this record.");
        const endpoint = mendeley
          ? "/api/library-sync/mendeley/documents/" +
            encodeURIComponent(mendeley) +
            "/pdf"
          : "/api/source-pdf?" + new URLSearchParams({ url });
        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            "X-Workspace-Token":
              localStorage.getItem("zntx-workspace-token") || "",
          },
        });
        if (!response.ok) {
          const data = await response.json();
          throw Error(data.error || "PDF is unavailable.");
        }
        objectUrl = URL.createObjectURL(await response.blob());
        if (!controller.signal.aborted) setBlob(objectUrl);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, mendeley, retry]);
  return (
    <section className="page source-pdf-page">
      <Link to="/library" className="source-back">
        <ArrowLeft size={15} /> My Library
      </Link>
      <div className="section-heading">
        <div>
          <span className="section-label">SOURCE DOCUMENT</span>
          <h1 style={{ fontSize: 26 }}>{title}</h1>
        </div>
        <div className="inline-actions">
          {source && (
            <a
              className="btn"
              href={source}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original source <ExternalLink size={15} />
            </a>
          )}
          {blob && (
            <a
              className="btn primary"
              href={blob}
              download={
                (title.replace(/[^a-z0-9 -]/gi, "").slice(0, 100) ||
                  "research-paper") + ".pdf"
              }
            >
              <Download size={15} /> Download PDF
            </a>
          )}
        </div>
      </div>
      {busy && (
        <div className="source-loading" role="status">
          <LoaderCircle className="spin" />
          <p>Opening source PDF…</p>
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          <button className="btn" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {blob && (
        <iframe
          src={blob}
          title={title + " PDF"}
          style={{
            width: "100%",
            height: "76vh",
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "#fff",
          }}
        />
      )}
      <p className="small muted">
        PDF availability depends on the source. Private library attachments are
        available only in the connected workspace.
      </p>
    </section>
  );
}
