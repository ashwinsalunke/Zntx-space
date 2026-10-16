import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import router from "../server/integrations.js";
test("MCP integration executes a real read-only protocol call and rejects write tools and non-owner access", async () => {
  const upstream = express();
  upstream.use(express.json());
  let writes = 0;
  upstream.post("/mcp", async (req, res) => {
    const server = new McpServer({ name: "test-research", version: "1.0.0" });
    server.registerTool(
      "lookup",
      {
        description: "Return a source record",
        annotations: { readOnlyHint: true },
      },
      async () => ({
        content: [{ type: "text", text: "Verified source record" }],
      }),
    );
    server.registerTool(
      "write",
      { description: "Must not execute", annotations: { readOnlyHint: false } },
      async () => {
        writes++;
        return { content: [] };
      },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await transport.handleRequest(req, res, req.body);
  });
  const source = upstream.listen(0, "127.0.0.1");
  await new Promise((r) => source.once("listening", r));
  const owner = randomBytes(32).toString("hex");
  const old = { ...process.env };
  process.env.MCP_ALLOW_LOCAL = "true";
  process.env.MCP_SERVERS = JSON.stringify([
    { id: "test", url: `http://127.0.0.1:${source.address().port}/mcp` },
  ]);
  process.env.INTEGRATION_OWNER_HASH = createHash("sha256")
    .update(owner)
    .digest("hex");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  const local = app.listen(0, "127.0.0.1");
  await new Promise((r) => local.once("listening", r));
  const base = "http://127.0.0.1:" + local.address().port;
  const headers = {
    "Content-Type": "application/json",
    "X-Workspace-Token": owner,
  };
  try {
    assert.equal((await fetch(base + "/mcp/test/tools")).status, 403);
    const list = await fetch(base + "/mcp/test/tools", { headers }).then((r) =>
      r.json(),
    );
    assert.equal(list.tools.length, 2);
    const read = await fetch(base + "/mcp/test/call", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "lookup", arguments: {} }),
    });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).content[0].text, "Verified source record");
    const write = await fetch(base + "/mcp/test/call", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "write", arguments: {} }),
    });
    assert.equal(write.status, 403);
    assert.equal(writes, 0);
    const anonymous = await fetch(base + "/status").then((r) => r.json());
    assert.deepEqual(anonymous.mcp, []);
  } finally {
    for (const key of [
      "MCP_SERVERS",
      "MCP_ALLOW_LOCAL",
      "INTEGRATION_OWNER_HASH",
    ])
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    await Promise.all([
      new Promise((r) => local.close(r)),
      new Promise((r) => source.close(r)),
    ]);
  }
});
