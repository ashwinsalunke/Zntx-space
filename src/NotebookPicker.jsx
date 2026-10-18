import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button, Modal } from "./App.jsx";
import { api, sourceUrl } from "./lib.js";
import {
  appendTopicToNotebook,
  blankNotebook,
  isNotebook,
} from "./notebooks.js";

export default function NotebookPicker({
  topic,
  sources = [],
  folderId = "",
  onClose,
  onSaved,
}) {
  const [notebooks, setNotebooks] = useState([]),
    [folders, setFolders] = useState([]),
    [choice, setChoice] = useState("new");
  const [title, setTitle] = useState(topic?.title || "My research notebook"),
    [folder, setFolder] = useState(folderId);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadFailed, setLoadFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const newRecord = useRef(null),
    savedRecord = useRef(null);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    setError("");
    Promise.all([
      api("/api/records/notes", { signal: c.signal }),
      api("/api/records/reviews", { signal: c.signal }),
    ])
      .then(([n, f]) => {
        setNotebooks(n.filter(isNotebook));
        setFolders(f.filter((r) => r.type === "library-collection"));
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [attempt]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let next = savedRecord.current;
      if (!next) {
        const base =
          choice === "new"
            ? (newRecord.current ||= blankNotebook(title.trim()))
            : await api("/api/records/notes/" + encodeURIComponent(choice));
        if (!isNotebook(base))
          throw Error(
            "This notebook is no longer available. Choose another notebook.",
          );
        next = topic ? appendTopicToNotebook(base, topic, sources) : base;
        if (choice === "new") next = { ...next, title: title.trim() };
        const result = await api(
          "/api/records/notes/" + encodeURIComponent(next.id),
          {
            method: "PUT",
            body: JSON.stringify({
              ...next,
              citations: next.sources.map((s) => ({
                id: s.evidenceId,
                title: s.title,
                url: sourceUrl(s),
              })),
            }),
          },
        );
        next = { ...next, updatedAt: result.updatedAt };
        savedRecord.current = next;
      }
      if (folder) {
        const f = await api(
          "/api/records/reviews/" + encodeURIComponent(folder),
        );
        if (f.type !== "library-collection")
          throw Error("The selected folder is unavailable.");
        await api("/api/records/reviews/" + encodeURIComponent(folder), {
          method: "PUT",
          body: JSON.stringify({
            ...f,
            itemKeys: [...new Set([...(f.itemKeys || []), "note:" + next.id])],
          }),
        });
      }
      onSaved(next);
    } catch (e) {
      setError(
        (savedRecord.current
          ? "Your notebook was saved, but its folder could not update. Retry or choose no folder. "
          : "") + e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={topic ? "Save topic to notebook" : "New notebook"}
      onClose={() => !busy && onClose()}
    >
      <form className="nb-picker" onSubmit={save}>
        <p>
          {topic
            ? "Keep this research question, its planning score, and the linked sources together."
            : "A place to collect ideas, write, and cite your sources."}
        </p>
        {loading ? (
          <p role="status">Opening your notebooks…</p>
        ) : (
          <>
            {topic && (
              <label>
                Save to
                <select
                  aria-label="Choose notebook"
                  value={choice}
                  disabled={busy || !!savedRecord.current}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  <option value="new">Create a new notebook</option>
                  {notebooks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {choice === "new" && (
              <label>
                Notebook name
                <input
                  aria-label="Notebook name"
                  value={title}
                  maxLength={200}
                  required
                  disabled={busy || !!savedRecord.current}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            <label>
              Folder (optional)
              <select
                aria-label="Notebook folder"
                value={folder}
                disabled={busy}
                onChange={(e) => setFolder(e.target.value)}
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="small muted">
              You can create and manage folders in My Library.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {loadFailed && (
          <Button type="button" onClick={() => setAttempt((v) => v + 1)}>
            Retry loading notebooks
          </Button>
        )}
        <div className="nb-actions">
          <Button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            primary
            type="submit"
            icon={topic ? BookOpen : Plus}
            disabled={
              loading ||
              loadFailed ||
              busy ||
              (choice === "new" && !title.trim())
            }
          >
            {busy
              ? "Saving…"
              : topic
                ? "Save & open notebook"
                : "Create notebook"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
