import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Trash2, LoaderCircle } from "lucide-react";
import { useApp, Modal, Button } from "./App.jsx";
import "./recent-searches.css";

export default function RecentSearches({ compact = false, limit = 5 }) {
  const { history, deleteHistory } = useApp();
  const [selection, setSelection] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const rows = history.filter((h, i, all) => h.query && all.findIndex(x => x.query === h.query) === i).slice(0, limit);
  if (!rows.length) return null;
  async function remove() {
    setBusy(true); setError("");
    try { await deleteHistory(selection.id); setSelection(null); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className={`recent-searches ${compact ? "compact" : ""}`} aria-label="Recent searches">
    <div className="recent-searches-heading"><span className="section-label">Recent searches</span><button type="button" title="Clear all recent searches" aria-label="Clear all recent searches" onClick={() => {setError("");setSelection({ all: true });}}><Trash2 size={14} aria-hidden="true"/></button></div>
    {rows.map(h => <div className="recent-search-row" key={h.id}>
      <Link to={"/search?" + new URLSearchParams({q:h.query,source:h.source || "crossref"})}><Search size={14} aria-hidden="true"/><span>{h.query}</span></Link>
      <button type="button" aria-label={`Delete search: ${h.query}`} title="Delete search" onClick={() => {setError("");setSelection(h);}}><Trash2 size={14} aria-hidden="true"/></button>
    </div>)}
    {selection && <Modal title={selection.all ? "Clear recent searches?" : "Delete this search?"} onClose={() => !busy && setSelection(null)}>
      <div className="recent-delete-dialog"><p>{selection.all ? "Permanently delete all recent search history in this workspace?" : `Permanently delete “${selection.query}” and all its duplicate history entries?`}</p><p>Saved sources, notes, research chats, and documents stay in your library.</p>
        {error && <p role="alert">{error}</p>}
        <div className="recent-delete-actions"><Button disabled={busy} onClick={() => setSelection(null)}>Cancel</Button><Button primary disabled={busy} icon={busy ? LoaderCircle : Trash2} onClick={remove}>{busy ? "Deleting…" : selection.all ? "Delete all searches" : "Delete search"}</Button></div>
      </div>
    </Modal>}
  </section>;
}
