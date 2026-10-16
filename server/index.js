import "./env.js";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crossrefPaper, europePaper, crossrefRequest, rankBibliography } from "./research.js";
import {
  storageInfo,
  workspaceToken,
  listRecords,
  getRecord,
  putRecord,
  removeRecord,
} from "./storage.js";
import biomedicalRouter from "./biomedical.js";
import aiRouter from "./ai.js";
import discoveryRouter from "./discovery.js";
import exportRouter from "./exports.js";
import integrationsRouter from "./integrations.js";
import sourcesRouter from "./sources.js";
import verificationRouter from "./verification.js";
import { createConnectorVault } from "./connector-vault.js";
import { createConnectionsRouter } from "./connections.js";
import { createGoogleSearchRouter } from "./google-search.js";
import { createLibrarySyncRouter } from "./library-sync.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), geolocation=()",
  });
  next();
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.get("origin");
  const sameOrigin =
    process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
  const localOrigin =
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
  if (origin && origin !== sameOrigin && !localOrigin)
    return res
      .status(403)
      .json({ error: "Requests must come from this application’s origin." });
  next();
});
// Bound anonymous public traffic. Keys/models are never exposed to clients.
const rates = new Map();
app.use("/api", (req, res, next) => {
  const paid = req.path === "/ai/generate";
  const key = (req.ip || "local") + (paid ? ":ai-generate" : ":research");
  const max = paid ? 30 : 300;
  const windowMs = paid ? 3600000 : 60000;
  const now = Date.now();
  let rate = rates.get(key);
  if (!rate || now - rate.start > windowMs) {
    rate = { start: now, count: 0 };
    rates.set(key, rate);
  }
  if (++rate.count > max)
    return res.status(429).json({
      error: "Request limit reached. Please wait before trying again.",
    });
  if (rates.size > 10000)
    for (const [k, v] of rates) if (now - v.start > 3600000) rates.delete(k);
  next();
});
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    storage: storageInfo.provider,
    cloud: storageInfo.cloud,
    mode: "research",
    providers: [
      "Crossref",
      "Europe PMC",
      "PubMed",
      "PubChem",
      "ChEMBL",
      "ClinicalTrials.gov",
      "openFDA",
    ],
  }),
);
app.get("/api/config", (req, res) =>
  res.json({
    storage: storageInfo.provider,
    cloud: storageInfo.cloud,
    projectUrl: storageInfo.projectUrl,
    workspaceMode: "private browser workspace",
    version: "0.3.0",
  }),
);
app.use("/api/biomedical", biomedicalRouter);
app.use("/api/ai", aiRouter);
app.use("/api/discovery", discoveryRouter);
app.use("/api/export", exportRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/verification", verificationRouter);
const connectorVault = createConnectorVault();
app.use("/api/connections", createConnectionsRouter({ vault: connectorVault }));
app.use("/api/google-search", createGoogleSearchRouter({ getCredential: (req) => connectorVault.get(workspaceToken(req), "serpapi")?.apiKey || null }));
app.use("/api/library-sync", createLibrarySyncRouter({
  getSecret: (token, provider) => connectorVault.get(token, provider),
  setSecret: (token, provider, value) => connectorVault.set(token, provider, value),
  deleteSecret: (token, provider) => connectorVault.remove(token, provider),
  listRecords, getRecord, putRecord,
  appOrigin: process.env.APP_ORIGIN || "http://127.0.0.1:5173",
}));
const cache = new Map();
app.get("/api/papers", async (req, res, next) => {
  const q = String(req.query.q || "")
    .trim()
    .slice(0, 500);
  const source = req.query.source === "europepmc" ? "europepmc" : "crossref";
  const allTypes = req.query.scope === "all";
  if (!q)
    return res
      .status(400)
      .json({ error: "Enter a research topic or question." });
  try {
    const token = workspaceToken(req);
    const key = source + (allTypes ? ":all:" : ":articles:") + q;
    let data;
    if (cache.has(key) && Date.now() - cache.get(key).time < 300000)
      data = cache.get(key).data;
    else {
      const lookup = crossrefRequest(q, allTypes);
      const url =
        source === "europepmc"
          ? `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=40&resultType=core`
          : lookup.url;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: {
          "User-Agent": "ZntxSpace/0.2 (open-source research workspace)",
          Accept: "application/json",
        },
      });
      if (!response.ok)
        throw Object.assign(
          new Error(
            source === "crossref" && lookup.exact && response.status === 404
              ? "This DOI was not found in Crossref. It may use another registry; try searching by title."
              : `Research provider returned ${response.status}. Please try again.`,
          ),
          { status: 502 },
        );
      const json = await response.json();
      data = {
        papers:
          source === "europepmc"
            ? (json.resultList?.result || []).map(europePaper)
            : (lookup.exact ? [json.message] : json.message?.items || []).map(crossrefPaper),
        total:
          source === "europepmc"
            ? json.hitCount
            : lookup.exact ? 1 : json.message?.["total-results"],
        source: source === "europepmc" ? "Europe PMC" : "Crossref",
        query: q,
        retrievedAt: new Date().toISOString(),
      };
      if (source === "crossref" && allTypes) data.papers = rankBibliography(data.papers, q);
      cache.set(key, { time: Date.now(), data });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
    }
    await putRecord(token, "searches", randomUUID(), {
      query: q,
      source,
      created_at: new Date().toISOString(),
    }).catch(() => {});
    res.json(data);
  } catch (e) {
    if (e.name === "TimeoutError")
      e = Object.assign(
        new Error(
          "The research database took too long to respond. Please retry.",
        ),
        { status: 504 },
      );
    next(e);
  }
});
app.get("/api/library", async (req, res, next) => {
  try {
    res.json(
      (await listRecords(workspaceToken(req), "papers")).map((p) => ({
        ...p,
        savedAt: p.createdAt,
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.post("/api/library", async (req, res, next) => {
  try {
    const p = req.body;
    if (typeof p?.id !== "string" || typeof p?.title !== "string")
      return res
        .status(400)
        .json({ error: "A paper ID and title are required." });
    res
      .status(201)
      .json(await putRecord(workspaceToken(req), "papers", p.id, p));
  } catch (e) {
    next(e);
  }
});
app.delete("/api/library/:id", async (req, res, next) => {
  try {
    res.json(await removeRecord(workspaceToken(req), "papers", req.params.id));
  } catch (e) {
    next(e);
  }
});
app.get("/api/history", async (req, res, next) => {
  try {
    res.json((await listRecords(workspaceToken(req), "searches")).slice(0, 30));
  } catch (e) {
    next(e);
  }
});
app.get("/api/drafts", async (req, res, next) => {
  try {
    res.json(
      (await listRecords(workspaceToken(req), "drafts")).map((d) => ({
        ...d,
        updated_at: d.updatedAt,
      })),
    );
  } catch (e) {
    next(e);
  }
});
app.put("/api/drafts/:id", async (req, res, next) => {
  try {
    const d = req.body;
    if (typeof d?.title !== "string" || typeof d?.content !== "string")
      return res
        .status(400)
        .json({ error: "A title and content are required." });
    res.json(await putRecord(workspaceToken(req), "drafts", req.params.id, d));
  } catch (e) {
    next(e);
  }
});
app.get("/api/records/:collection", async (req, res, next) => {
  try {
    res.json(await listRecords(workspaceToken(req), req.params.collection));
  } catch (e) {
    next(e);
  }
});
app.put("/api/records/:collection/:id", async (req, res, next) => {
  try {
    res.json(
      await putRecord(
        workspaceToken(req),
        req.params.collection,
        req.params.id,
        req.body,
      ),
    );
  } catch (e) {
    next(e);
  }
});
app.delete("/api/records/:collection/:id", async (req, res, next) => {
  try {
    res.json(
      await removeRecord(
        workspaceToken(req),
        req.params.collection,
        req.params.id,
      ),
    );
  } catch (e) {
    next(e);
  }
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
}
app.use((err, req, res, next) => {
  console.error("Request failed:", err.code || err.name);
  res.status(err.status || 500).json({
    error: err.status
      ? err.message
      : "Unable to complete this request. Please retry.",
  });
});
const port = Number(process.env.PORT) || 5180;
const host = process.env.HOST || "127.0.0.1";
app
  .listen(port, host, () =>
    console.log(`Zntx Space: http://${host}:${port} · ${storageInfo.provider}`),
  )
  .on("error", (e) => {
    console.error(`Unable to start server: ${e.message}`);
    process.exit(1);
  });
