import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, FileText, ExternalLink, Library } from "lucide-react";
import { useApp, Empty } from "./App.jsx";
import { sourceUrl, excerpt } from "./lib.js";
import { pdfReaderLink } from "./SourcePdfReader.jsx";
export default function PersonalLibrarySources({ provider }) {
  const { library } = useApp();
  const [params] = useSearchParams();
  const initialQuery = params.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => setQuery(initialQuery), [initialQuery, provider]);
  const name = provider === "mendeley" ? "Mendeley" : "Zotero";
  const imported = useMemo(
    () =>
      library.filter(
        (p) =>
          p.librarySync?.provider === provider ||
          String(p.source || "")
            .toLowerCase()
            .startsWith(provider),
      ),
    [library, provider],
  );
  const rows = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return imported.filter((p) =>
      words.every((word) =>
        [
          p.title,
          ...(p.authors || []),
          p.abstract,
          p.doi,
          ...(p.librarySync?.tags || []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(word),
      ),
    );
  }, [imported, query]);
  return (
    <section
      className="personal-source-list"
      aria-label={name + " library references"}
    >
      <div className="source-results-heading">
        <div>
          <h2>Your {name} references</h2>
          <p>{imported.length} synced or imported records in this workspace</p>
        </div>
        <Link className="btn" to="/integrations">
          Manage sync
        </Link>
      </div>
      <label className="search-form source-search">
        <Search size={19} />
        <input
          aria-label={"Search your " + name + " library"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, authors, abstracts, or DOI…"
        />
      </label>
      <p className="source-coverage">
        Searches your imported copies. Use Sync references in Integrations to
        retrieve changes from {name}.
      </p>
      {!!imported.length && (
        <p role="status">{rows.length} matching references</p>
      )}
      <div className="source-result-list">
        {rows.map((p) => {
          const url = sourceUrl(p);
          return (
            <article key={p.id}>
              <div className="source-record-top">
                <span className="tag">{p.type || "Reference"}</span>
                <span>{p.year || "Date unavailable"}</span>
              </div>
              <h3>{p.title}</h3>
              <p className="source-authors">
                {(p.authors || []).slice(0, 4).join(", ") ||
                  "Authors unavailable"}
              </p>
              <p className="source-record-description">
                {excerpt(p.abstract, 600) ||
                  "No abstract was provided. Follow the original source for details."}
              </p>
              {p.remoteRemoved && (
                <p className="source-coverage">
                  This reference was removed from the source library; your saved
                  copy remains available.
                </p>
              )}
              <div className="source-record-actions">
                {(p.pdf ||
                  (provider === "mendeley" && p.librarySync?.remoteId)) && (
                  <Link className="btn" to={pdfReaderLink(p)}>
                    <FileText size={15} />
                    Read PDF in app
                  </Link>
                )}
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Original source <ExternalLink size={14} />
                  </a>
                )}
                <Link to="/library">
                  <Library size={15} /> My Library
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <Empty
          icon={Search}
          title={
            imported.length
              ? "No matching references"
              : "Connect and sync your library"
          }
        >
          {imported.length
            ? "Try a shorter title, author name, or DOI."
            : "Authorize " +
              name +
              " in Integrations, then choose Sync references. Your records and available source links will appear here."}
        </Empty>
      )}
    </section>
  );
}
