import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { aiConfig, createAiRouter, validateAiRequest } from "../server/ai.js";

const env = { AI_API_KEY: "test-server-secret", AI_MODEL: "test-model" };
const evidence = [
  {
    id: "10.1234/study",
    title: "A clinical study",
    url: "https://doi.org/10.1234/study",
    abstract: "The study reported an uncertain association.",
  },
];
const input = {
  task: "synthesis",
  prompt: "Review the evidence and its limitations.",
  evidence,
};
const completion = (content, extra = {}) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content }, ...extra }] }),
    { headers: { "Content-Type": "application/json" } },
  );

async function serve(t, options = {}) {
  const app = express();
  app.use("/api/ai", createAiRouter(options));
  const server = await new Promise((resolve) => {
    const current = app.listen(0, "127.0.0.1", () => resolve(current));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;
  return {
    get: () => fetch(`${base}/status`),
    post: (body = input) =>
      fetch(`${base}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}

test("AI endpoint config requires credentials and model, permits only explicit loopback HTTP", () => {
  assert.deepEqual(aiConfig({}).missing, ["AI_MODEL", "AI_API_KEY"]);
  assert.equal(
    aiConfig(env).endpoint,
    "https://api.openai.com/v1/chat/completions",
  );
  for (const base of [
    "http://example.com/v1",
    "file:///tmp/api",
    "https://key@example.com/v1",
    "https://example.com/v1?key=secret",
    "https://example.com/v1#fragment",
  ]) {
    assert.equal(
      aiConfig({ ...env, AI_BASE_URL: base }).configured,
      false,
      base,
    );
  }
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    const config = aiConfig({
      AI_BASE_URL: `http://${hostname}:11434/v1`,
      AI_MODEL: "local-model:latest",
    });
    assert.equal(config.configured, true);
    assert.equal(config.provider, "local-openai-compatible");
    assert.equal(config.apiKey, "");
  }
  assert.equal(
    aiConfig({ ...env, AI_MODEL: "bad model\nname" }).configured,
    false,
  );
});

test("request validation enforces evidence size, identity, and safe URLs", () => {
  assert.equal(validateAiRequest(input).task, "synthesis");
  assert.equal(
    validateAiRequest({ ...input, task: "academic draft" }).task,
    "draft",
  );
  const invalid = [
    null,
    [],
    {},
    { ...input, prompt: " " },
    { ...input, prompt: "a".repeat(24001) },
    { ...input, task: "not-a-task" },
    { ...input, evidence: {} },
    { ...input, evidence: [...evidence, ...evidence] },
    { ...input, evidence: [{ ...evidence[0], id: "x]] malicious" }] },
    { ...input, evidence: [{ ...evidence[0], url: "javascript:alert(1)" }] },
    { ...input, evidence: [{ ...evidence[0], abstract: "x".repeat(12001) }] },
  ];
  for (const value of invalid)
    assert.throws(() => validateAiRequest(value), { status: 400 });
  assert.equal(
    validateAiRequest({ task: "explain", prompt: "x\u0000y" }).prompt,
    "xy",
  );
});

test("unconfigured server reports setup without fabricating output or calling a provider", async (t) => {
  let called = false;
  const api = await serve(t, {
    env: {},
    fetchImpl: () => {
      called = true;
    },
  });
  const status = await (await api.get()).json();
  assert.equal(status.configured, false);
  assert.equal(status.verified, false);
  const response = await api.post();
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "AI_NOT_CONFIGURED");
  assert.match(body.setup, /docs\/ai-setup.md/);
  assert.equal(body.text, undefined);
  assert.equal(called, false);
});

test("real provider request uses server settings and keeps supplied evidence citations", async (t) => {
  let sent;
  const api = await serve(t, {
    env,
    fetchImpl: async (url, options) => {
      sent = { url, ...options, body: JSON.parse(options.body) };
      return completion(
        "The association remains uncertain [[cite:10.1234/study]].",
      );
    },
  });
  const response = await api.post({
    ...input,
    apiKey: "client-key",
    baseUrl: "http://attacker.invalid",
    model: "client-model",
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(sent.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(sent.headers.Authorization, "Bearer test-server-secret");
  assert.equal(sent.body.model, "test-model");
  assert.equal(sent.redirect, "error");
  assert.deepEqual(
    JSON.parse(sent.body.messages[1].content).evidence,
    evidence,
  );
  assert.match(sent.body.messages[0].content, /untrusted source material/);
  assert.deepEqual(
    result.citations,
    evidence.map(({ id, title, url }) => ({ id, title, url })),
  );
  assert.equal(
    JSON.stringify(await (await api.get()).json()).includes(env.AI_API_KEY),
    false,
  );
  assert.equal(JSON.stringify(result).includes(env.AI_API_KEY), false);
});

test("AI rejects unknown evidence identifiers and uncited research synthesis", async (t) => {
  let output = "An invented finding [[cite:invented]].";
  const api = await serve(t, {
    env,
    fetchImpl: async () => completion(output),
  });
  for (const next of [output, "An uncited finding."]) {
    output = next;
    const response = await api.post();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, "UNVERIFIED_AI_CITATION");
  }
});

test("no evidence output is explicitly unverified and provider errors never leak response bodies", async (t) => {
  let response = completion("This explanation is not source-verified.");
  const api = await serve(t, { env, fetchImpl: async () => response });
  const generated = await (
    await api.post({ task: "explain", prompt: "Explain a hypothesis." })
  ).json();
  assert.match(generated.warnings.join(" "), /not source-verified/);
  response = new Response(
    JSON.stringify({ error: `The secret was ${env.AI_API_KEY}` }),
    { status: 401 },
  );
  const failure = await api.post();
  assert.equal(failure.status, 502);
  const body = await failure.json();
  assert.equal(body.code, "AI_PROVIDER_ERROR");
  assert.equal(JSON.stringify(body).includes(env.AI_API_KEY), false);
});

test("timeout and truncated provider responses fail explicitly", async (t) => {
  let timedOut = true;
  const api = await serve(t, {
    env,
    fetchImpl: async () => {
      if (timedOut)
        throw new DOMException("internal upstream URL", "TimeoutError");
      return completion("Partial answer", { finish_reason: "length" });
    },
  });
  let response = await api.post();
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "AI_TIMEOUT");
  timedOut = false;
  response = await api.post();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "AI_OUTPUT_TRUNCATED");
});

test("diagram output is structured and invalid graph edges are rejected", async (t) => {
  const diagram = {
    title: "Evidence map",
    summary: "A hypothetical mechanism.",
    nodes: [
      { id: "a", label: "Target" },
      { id: "b", label: "Outcome" },
    ],
    edges: [{ from: "a", to: "b", label: "hypothesized" }],
  };
  const api = await serve(t, {
    env,
    fetchImpl: async () => completion(JSON.stringify(diagram)),
  });
  let response = await api.post({
    task: "diagram",
    prompt: "Map this hypothesis.",
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).diagram, diagram);
  diagram.edges[0].to = "invented-node";
  response = await api.post({
    task: "diagram",
    prompt: "Map this hypothesis.",
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "INVALID_AI_OUTPUT");
});

test("concurrency bound rejects extra requests and releases capacity after completion", async (t) => {
  let release;
  let signalStarted;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const api = await serve(t, {
    env,
    maxConcurrent: 1,
    fetchImpl: async () => {
      signalStarted();
      await new Promise((resolve) => {
        release = resolve;
      });
      return completion("Supported result [[cite:10.1234/study]].");
    },
  });
  const pending = api.post();
  await started;
  const busy = await api.post();
  assert.equal(busy.status, 429);
  assert.equal((await busy.json()).code, "AI_BUSY");
  release();
  assert.equal((await pending).status, 200);
});
