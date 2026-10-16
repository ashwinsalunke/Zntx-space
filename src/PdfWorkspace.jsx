import React, { useState, useRef } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  FileText,
  Upload,
  MessageSquare,
  ArrowUp,
  ArrowLeft,
  BookOpen,
  Quote,
  Download,
  LoaderCircle,
  Files,
  CheckCircle2,
  Search,
  Info,
  Table2,
  Plus,
} from "lucide-react";
import { Button, Empty, useApp } from "./App.jsx";
import { download, wordCount } from "./lib.js";
import { relevantPassages } from "../server/research.js";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const samplePages = [
  {
    page: 1,
    text: "A practical guide to reading research. This is an original demonstration document for Zntx Space, not a published scientific study. A focused research question helps define the scope of a literature search. Begin by identifying the population, concept, and context that matter to the question. Search terms should include the main concepts and their synonyms. Keep a record of each database, query, date, and number of results so that the search can be understood and repeated. Screening begins with the title and abstract. Papers that match the question can then be reviewed in full.",
  },
  {
    page: 2,
    text: "Comparing methods and findings. Study design affects the conclusions a paper can support. A cross-sectional observation can identify an association but does not by itself establish causation. When comparing papers, record the study design, sample, measurements, and limitations. Read the methods and results rather than relying on the title alone. An evidence table can help organize these details consistently. Abstracts are useful for initial screening but may leave out important methodological details. Missing information should be recorded as unavailable rather than guessed.",
  },
  {
    page: 3,
    text: "Writing with sources. A literature review brings sources into conversation around a question or theme. Group related findings, explain disagreements, and identify open questions. Separate the authors’ reported results from your own interpretation. Cite a source whenever a claim depends on its ideas or evidence. Verify citation metadata against the original publication before submitting your work. A good conclusion describes what the reviewed evidence supports, acknowledges its limits, and explains the next step. This sample illustrates document search and page references only; it provides no new experimental results.",
  },
];
export default function PdfWorkspace({ extract = false }) {
  const { notify } = useApp();
  const input = useRef();
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [view, setView] = useState("text");
  const [page, setPage] = useState(1);
  const [answering, setAnswering] = useState(false);
  const left = useRef();
  const read = async (file) => {
    if (!file) return;
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Please choose a PDF document.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a PDF smaller than 20 MB for this local demo.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      }).promise;
      if (pdf.numPages > 100)
        throw new Error(
          "This demo supports up to 100 pages. Please choose a shorter PDF.",
        );
      const pages = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const p = await pdf.getPage(n);
        const c = await p.getTextContent();
        pages.push({
          page: n,
          text: c.items
            .map((i) => i.str || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        });
      }
      if (!pages.some((p) => p.text.trim()))
        throw new Error(
          "This PDF has no selectable text. Scanned documents need OCR, which is not connected in this demo.",
        );
      if (doc?.url) URL.revokeObjectURL(doc.url);
      setDoc({
        name: file.name,
        pages,
        url: URL.createObjectURL(file),
        size: file.size,
      });
      setMessages([]);
      setView("text");
      setPage(1);
      await pdf.destroy();
      notify("PDF ready. Ask a question or explore the extracted text.");
    } catch (e) {
      setError(
        e.message ||
          "This PDF could not be read. Try an unlocked PDF with selectable text.",
      );
    } finally {
      setBusy(false);
    }
  };
  const sample = () => {
    if (doc?.url) URL.revokeObjectURL(doc.url);
    setDoc({
      name: "A practical guide to reading research · Sample",
      pages: samplePages,
      sample: true,
    });
    setMessages([]);
    setPage(1);
    setView("text");
    setError("");
  };
  const ask = (q = question) => {
    if (!q.trim() || !doc || answering) return;
    setQuestion("");
    setMessages((v) => [...v, { role: "user", text: q }]);
    setAnswering(true);
    setTimeout(() => {
      const passages = relevantPassages(doc.pages, q);
      setMessages((v) => [
        ...v,
        {
          role: "assistant",
          passages,
          text: passages.length
            ? "Here are matching passages from your document:"
            : "I couldn’t locate a matching passage in this document. Try a more specific term, or review the page text.",
        },
      ]);
      setAnswering(false);
    }, 250);
  };
  const jump = (n) => {
    setView("text");
    setPage(n);
    requestAnimationFrame(() =>
      left.current
        ?.querySelector(`[data-page="${n}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const exportPages = () => {
    const c = (s) => '"' + String(s).replaceAll('"', '""') + '"';
    download(
      "zntx-document-extract.csv",
      "Page,Words,Extracted text\n" +
        doc.pages
          .map((p) => [p.page, wordCount(p.text), p.text].map(c).join(","))
          .join("\n"),
      "text/csv",
    );
  };
  if (!doc)
    return (
      <section className="page pdf-landing">
        <div className="center-heading">
          <h1>{extract ? "Extract Data" : "Chat with PDF"}</h1>
          <p>
            {extract
              ? "Turn the text in your research documents into a structured, exportable table."
              : "Upload a paper. Ask a question. Find the passages that matter."}
          </p>
        </div>
        <div
          className={`upload-zone ${drag ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            read(e.dataTransfer.files[0]);
          }}
        >
          <span className="upload-icon">
            {busy ? (
              <LoaderCircle size={27} className="spin" />
            ) : (
              <Upload size={27} />
            )}
          </span>
          <h2>
            {busy
              ? "Reading your document…"
              : "Drag and drop or click here to browse"}
          </h2>
          <p>PDF up to 20 MB · 100 pages · Selectable text</p>
          <Button
            primary
            icon={Plus}
            disabled={busy}
            onClick={() => input.current.click()}
          >
            Upload PDF
          </Button>
          <input
            ref={input}
            className="sr-only"
            tabIndex={-1}
            type="file"
            accept="application/pdf"
            aria-label="Choose PDF file"
            onChange={(e) => read(e.target.files[0])}
          />
        </div>
        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        <div className="sample-pdf">
          <span>Or</span>
          <button onClick={sample}>
            Try a sample document <ArrowUp size={13} />
          </button>
        </div>
        <div className="pdf-features">
          {[
            [
              Quote,
              "Answers you can trace",
              "Find matching source excerpts, linked to the page they came from.",
            ],
            [
              BookOpen,
              "A closer read",
              "Explore all extracted page text alongside your questions.",
            ],
            [
              Download,
              "Your work, ready to use",
              "Export the document text or structured page data.",
            ],
          ].map(([I, t, d]) => (
            <div key={t}>
              <I size={22} />
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
        <div className="privacy-note">
          <CheckCircle2 size={15} />
          <span>
            Your PDF is processed in this browser. It is never uploaded to a
            server.
          </span>
        </div>
      </section>
    );
  return (
    <div className="pdf-workspace">
      <div className="pdf-topbar">
        <button
          className="icon-btn"
          aria-label="Close document"
          onClick={() => {
            if (doc.url) URL.revokeObjectURL(doc.url);
            setDoc(null);
            setMessages([]);
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <FileText size={18} />
        <div>
          <b>{doc.name}</b>
          <span>
            {doc.pages.length} pages ·{" "}
            {doc.pages
              .reduce((n, p) => n + wordCount(p.text), 0)
              .toLocaleString()}{" "}
            words{doc.sample ? " · Demo document" : ""}
          </span>
        </div>
        <Button
          icon={Download}
          onClick={
            extract
              ? exportPages
              : () =>
                  download(
                    "document-text.txt",
                    doc.pages
                      .map((p) => `Page ${p.page}\n${p.text}`)
                      .join("\n\n"),
                  )
          }
        >
          Export {extract ? "CSV" : "text"}
        </Button>
      </div>
      <div className="pdf-panels">
        <section className="document-panel">
          <div className="document-tabs tabs">
            <button
              className={view === "text" ? "active" : ""}
              onClick={() => setView("text")}
            >
              <FileText size={14} /> Extracted text
            </button>
            {doc.url && (
              <button
                className={view === "pdf" ? "active" : ""}
                onClick={() => setView("pdf")}
              >
                <BookOpen size={14} /> Original PDF
              </button>
            )}
            <span className="page-indicator">
              Page {page} of {doc.pages.length}
            </span>
          </div>
          {view === "pdf" ? (
            <iframe title="Original PDF document" src={doc.url} />
          ) : (
            <div className="document-pages" ref={left}>
              {doc.pages.map((p) => (
                <article
                  className={`document-page ${page === p.page ? "current-page" : ""}`}
                  key={p.page}
                  data-page={p.page}
                  onClick={() => setPage(p.page)}
                >
                  <div className="document-page-label">
                    {doc.sample
                      ? "ZNTX SPACE / SAMPLE DOCUMENT"
                      : "EXTRACTED DOCUMENT TEXT"}
                    <span>{p.page}</span>
                  </div>
                  {p.page === 1 && (
                    <h2>
                      {doc.sample
                        ? "A practical guide to reading research"
                        : doc.name.replace(/\.pdf$/i, "")}
                    </h2>
                  )}
                  <p>{p.text || "No selectable text found on this page."}</p>
                  <footer>Page {p.page}</footer>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="pdf-chat">
          <div className="pdf-chat-heading">
            <MessageSquare size={18} />
            <h2>{extract ? "Document data" : "Ask your document"}</h2>
            <span className="tag">Source excerpts</span>
          </div>
          {extract ? (
            <div className="extract-panel">
              <div className="notice">
                <Info size={15} />
                <span>
                  Extracted text by page. Tables and figure structure are not
                  reconstructed.
                </span>
              </div>
              <div className="status-row">
                <span>Document</span>
                <b>{doc.name}</b>
              </div>
              <div className="status-row">
                <span>Pages</span>
                <b>{doc.pages.length}</b>
              </div>
              <div className="status-row">
                <span>Total words</span>
                <b>{doc.pages.reduce((n, p) => n + wordCount(p.text), 0)}</b>
              </div>
              <h3>Page overview</h3>
              {doc.pages.map((p) => (
                <button
                  className="extract-row"
                  key={p.page}
                  onClick={() => jump(p.page)}
                >
                  <FileText size={16} />
                  <span>Page {p.page}</span>
                  <small>{wordCount(p.text)} words</small>
                  <Search size={14} />
                </button>
              ))}
              <Button primary icon={Download} onClick={exportPages}>
                Export structured CSV
              </Button>
            </div>
          ) : (
            <>
              <div className="chat-messages" aria-live="polite">
                {!messages.length && (
                  <div className="chat-welcome">
                    <span className="soft-icon">
                      <MessageSquare size={25} />
                    </span>
                    <h3>Let’s make sense of this paper.</h3>
                    <p>
                      Ask a question to find matching passages, or start with a
                      prompt below.
                    </p>
                    {[
                      "Summarize this document",
                      "What are the main findings?",
                      "What are the limitations?",
                    ].map((q) => (
                      <button key={q} onClick={() => ask(q)}>
                        {q}
                        <ArrowUp size={14} />
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div className={`chat-message ${m.role}`} key={i}>
                    {m.role === "assistant" && (
                      <img src="/logo.svg" alt="Zntx Space" />
                    )}
                    <div>
                      <p>{m.text}</p>
                      {m.passages?.map((p, j) => (
                        <blockquote key={j}>
                          {p.text}
                          <button onClick={() => jump(p.page)}>
                            <FileText size={12} /> Page {p.page}
                          </button>
                        </blockquote>
                      ))}
                    </div>
                  </div>
                ))}
                {answering && (
                  <div className="chat-thinking">
                    <LoaderCircle size={16} className="spin" /> Finding relevant
                    passages…
                  </div>
                )}
              </div>
              <form
                className="pdf-question"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <input
                  aria-label="Ask a question about this PDF"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about your document…"
                />
                <button
                  className="submit-btn"
                  disabled={!question.trim() || answering}
                  aria-label="Send document question"
                >
                  <ArrowUp size={17} />
                </button>
              </form>
              <p className="chat-disclaimer">
                Keyword-matched excerpts with page references. No AI model
                connected.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
