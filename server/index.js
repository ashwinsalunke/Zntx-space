import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crossrefPaper, europePaper } from "./research.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(path.join(root, ".data"), { recursive: true });
const db = new DatabaseSync(path.join(root, ".data", "zntx.db"));
db.exec(
  `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY, data TEXT NOT NULL, saved_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS searches (id INTEGER PRIMARY KEY, query TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.get("origin");
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    return res
      .status(403)
      .json({ error: "Local demo accepts requests from localhost only." });
  next();
});
const cache = new Map();
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    storage: "Local SQLite",
    mode: "demo",
    providers: ["Crossref", "Europe PMC"],
  }),
);
app.get("/api/papers", async (req, res) => {
  const q = String(req.query.q || "")
    .trim()
    .slice(0, 500);
  const source = req.query.source === "europepmc" ? "europepmc" : "crossref";
  if (!q)
    return res
      .status(400)
      .json({ error: "Enter a research topic or question." });
  const key = source + ":" + q;
  if (cache.has(key) && Date.now() - cache.get(key).time < 300000)
    return res.json(cache.get(key).data);
  try {
    let url =
      source === "europepmc"
        ? `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=24&resultType=core`
        : `https://api.crossref.org/works?query=${encodeURIComponent(q)}&filter=type:journal-article&rows=24`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": "ZntxSpaceDemo/0.1 (local research workspace)",
        Accept: "application/json",
      },
    });
    if (!response.ok)
      throw new Error(
        `Research provider returned ${response.status}. Please try again.`,
      );
    const json = await response.json();
    const data = {
      papers:
        source === "europepmc"
          ? (json.resultList?.result || []).map(europePaper)
          : (json.message?.items || []).map(crossrefPaper),
      total:
        source === "europepmc"
          ? json.hitCount
          : json.message?.["total-results"],
      source: source === "europepmc" ? "Europe PMC" : "Crossref",
      query: q,
      retrievedAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO searches(query,source) VALUES(?,?)").run(q, source);
    cache.set(key, { time: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    res.json(data);
  } catch (e) {
    res.status(502).json({
      error:
        e.name === "TimeoutError"
          ? "The research database is taking longer than expected. Please try again."
          : e.message,
    });
  }
});
app.get("/api/library", (req, res) =>
  res.json(
    db
      .prepare("SELECT data,saved_at FROM papers ORDER BY saved_at DESC")
      .all()
      .map((p) => ({ ...JSON.parse(p.data), savedAt: p.saved_at })),
  ),
);
app.post("/api/library", (req, res) => {
  const p = req.body;
  if (typeof p.id !== "string" || !p.title)
    return res
      .status(400)
      .json({ error: "A paper ID and title are required." });
  db.prepare("INSERT OR REPLACE INTO papers(id,data) VALUES(?,?)").run(
    p.id,
    JSON.stringify(p),
  );
  res.status(201).json({ ok: true });
});
app.delete("/api/library/:id", (req, res) => {
  db.prepare("DELETE FROM papers WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.get("/api/history", (req, res) =>
  res.json(
    db.prepare("SELECT * FROM searches ORDER BY id DESC LIMIT 20").all(),
  ),
);
app.get("/api/drafts", (req, res) =>
  res.json(db.prepare("SELECT * FROM drafts ORDER BY updated_at DESC").all()),
);
app.put("/api/drafts/:id", (req, res) => {
  const { title, content } = req.body;
  if (typeof title !== "string" || typeof content !== "string")
    return res.status(400).json({ error: "A title and content are required." });
  db.prepare(
    "INSERT INTO drafts(id,title,content) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,updated_at=CURRENT_TIMESTAMP",
  ).run(req.params.id, title, content);
  res.json({ ok: true });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
}
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
const port = Number(process.env.PORT) || 5180;
app
  .listen(port, "127.0.0.1", () =>
    console.log(`Zntx Space API: http://127.0.0.1:${port}`),
  )
  .on("error", (error) => {
    console.error(`Unable to start Zntx Space API: ${error.message}`);
    process.exit(1);
  });
