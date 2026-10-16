import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const router = express.Router();
function isOwner(req) {
  const token = req.get("X-Workspace-Token") || "";
  const expected = process.env.INTEGRATION_OWNER_HASH || "";
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(expected))
    return false;
  return timingSafeEqual(
    Buffer.from(createHash("sha256").update(token).digest("hex")),
    Buffer.from(expected),
  );
}
router.use((req, res, next) => {
  if (req.path === "/status") return next();
  if (!isOwner(req))
    return res
      .status(403)
      .json({
        error:
          "Private connectors require an owner workspace. Set INTEGRATION_OWNER_HASH to the SHA-256 hash of your private workspace key on the server.",
      });
  next();
});
function servers() {
  let values = [];
  try {
    values = JSON.parse(process.env.MCP_SERVERS || "[]");
  } catch {
    throw Object.assign(
      new Error("MCP_SERVERS must be valid JSON in the server environment."),
      { status: 503 },
    );
  }
  if (!Array.isArray(values) || values.length > 12)
    throw Object.assign(new Error("Configure at most 12 MCP servers."), {
      status: 503,
    });
  return values.map((s) => {
    const u = new URL(s.url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (
      !s.id ||
      !/^[a-z0-9_-]{1,40}$/i.test(s.id) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      (u.protocol !== "https:" &&
        !(
          local &&
          u.protocol === "http:" &&
          process.env.MCP_ALLOW_LOCAL === "true"
        ))
    )
      throw Object.assign(
        new Error(
          "MCP server configuration contains an invalid endpoint. Use HTTPS, or explicitly allow local servers.",
        ),
        { status: 503 },
      );
    return { ...s, url: u.href };
  });
}
async function withServer(id, callback) {
  const server = servers().find((s) => s.id === id);
  if (!server)
    throw Object.assign(new Error("This MCP server is not configured."), {
      status: 404,
    });
  const key = server.tokenEnv ? process.env[server.tokenEnv] : null;
  const client = new Client(
    { name: "zntx-space", version: "0.2.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(20000),
    },
  });
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close().catch(() => {});
  }
}
router.get("/status", (req, res, next) => {
  try {
    res.json({
      owner: isOwner(req),
      mcp: (isOwner(req) ? servers() : []).map((s) => ({
        id: s.id,
        name: s.name || s.id,
        host: new URL(s.url).host,
        credentialConfigured: !s.tokenEnv || !!process.env[s.tokenEnv],
      })),
      zotero: {
        configured:
          isOwner(req) &&
          !!(process.env.ZOTERO_API_KEY && process.env.ZOTERO_USER_ID),
      },
      sources: [
        { name: "Crossref", status: "Keyless" },
        { name: "Europe PMC", status: "Keyless" },
        { name: "PubMed", status: "Keyless · rate limited" },
        { name: "PubChem", status: "Keyless" },
        { name: "ChEMBL", status: "Keyless" },
        { name: "ClinicalTrials.gov", status: "Keyless" },
        { name: "openFDA", status: "Keyless · rate limited" },
      ],
    });
  } catch (e) {
    next(e);
  }
});
router.get("/mcp/:id/tools", async (req, res, next) => {
  try {
    const result = await withServer(req.params.id, (c) => c.listTools());
    res.json({
      tools: result.tools.map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: t.inputSchema,
        readOnly: t.annotations?.readOnlyHint === true,
      })),
    });
  } catch (e) {
    e.status = e.status || 502;
    e.message =
      e.status === 502
        ? "Could not connect to this MCP server. Check its endpoint and server-side credential."
        : e.message;
    next(e);
  }
});
router.post("/mcp/:id/call", async (req, res, next) => {
  try {
    const { name, arguments: args } = req.body;
    if (
      typeof name !== "string" ||
      !args ||
      typeof args !== "object" ||
      Array.isArray(args) ||
      JSON.stringify(args).length > 20000
    )
      return res.status(400).json({
        error:
          "Provide a tool name and a JSON object of arguments (up to 20 KB).",
      });
    const result = await withServer(req.params.id, async (c) => {
      const { tools } = await c.listTools();
      const tool = tools.find((t) => t.name === name);
      if (!tool || tool.annotations?.readOnlyHint !== true)
        throw Object.assign(
          new Error(
            "Only tools explicitly marked read-only can run from this research interface.",
          ),
          { status: 403 },
        );
      return c.callTool({ name, arguments: args }, undefined, {
        timeout: 30000,
      });
    });
    const output = JSON.stringify(result);
    if (output.length > 300000)
      return res.status(413).json({
        error: "Tool output exceeds 300 KB. Use more specific arguments.",
      });
    res.json(result);
  } catch (e) {
    e.status = e.status || 502;
    if (e.status === 502)
      e.message =
        "MCP tool failed. Check server logs and try a narrower query.";
    next(e);
  }
});
router.get("/zotero", async (req, res, next) => {
  try {
    if (
      !process.env.ZOTERO_API_KEY ||
      !/^\d+$/.test(process.env.ZOTERO_USER_ID || "")
    )
      return res.status(503).json({
        error:
          "Set ZOTERO_API_KEY and ZOTERO_USER_ID on your server to connect Zotero.",
      });
    const response = await fetch(
      `https://api.zotero.org/users/${process.env.ZOTERO_USER_ID}/items/top?format=json&limit=100`,
      {
        headers: {
          "Zotero-API-Key": process.env.ZOTERO_API_KEY,
          "Zotero-API-Version": "3",
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw Error("provider failed");
    const rows = await response.json();
    res.json({
      papers: rows
        .filter(
          (i) =>
            i.data?.title && !["attachment", "note"].includes(i.data.itemType),
        )
        .map((i) => ({
          id: i.data.DOI || "zotero-" + i.key,
          title: i.data.title,
          authors: (i.data.creators || []).map(
            (a) =>
              a.name || [a.firstName, a.lastName].filter(Boolean).join(" "),
          ),
          doi: i.data.DOI || "",
          url: i.data.url || i.links?.alternate?.href,
          year: Number(i.data.date?.match(/\d{4}/)?.[0]) || null,
          journal: i.data.publicationTitle || "",
          abstract: i.data.abstractNote || "",
          citations: null,
          source: "Zotero",
          type: i.data.itemType,
        })),
      source: "Zotero",
      limitedTo: 100,
    });
  } catch (e) {
    e.status = 502;
    e.message =
      "Zotero could not be loaded. Check the server-side key and library permissions.";
    next(e);
  }
});
export default router;
