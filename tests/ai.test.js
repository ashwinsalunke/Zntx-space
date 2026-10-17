import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  AI_ASSISTANT_NAME,
  aiConfig,
  createAiRouter,
  validateAiRequest,
} from "../server/ai.js";

const env = { AI_API_KEY: "test-server-secret", AI_MODEL: "test-model" };
const googleEnv = {
  AI_PROVIDER: "google",
  AI_MODEL: "gemini-flash-latest",
  AI_API_KEY: "test-google-server-secret",
};
const googleFallbackEnv = {
  ...googleEnv,
  AI_FALLBACK_MODEL: "gemini-3.5-flash-lite",
};
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

test("workflow AI requests use structured output, require evidence, and reject malformed generated artifacts", async (t) => {
  let captured;
  const service = await serve(t, {
    env: googleEnv,
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"query":"cardiovascular research","title":"Evidence review","note":"Planning only."}',
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  const result = await service.post({
    task: "workflow-plan",
    prompt: "Plan a literature search",
    evidence: [],
  });
  assert.equal(result.status, 200);
  assert.equal(captured.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(captured.generationConfig.responseJsonSchema.required, [
    "query",
    "title",
    "note",
  ]);
  assert.equal(
    JSON.parse((await result.json()).text).query,
    "cardiovascular research",
  );
  assert.equal(
    (
      await service.post({
        task: "workflow-paper",
        prompt: "Draft",
        evidence: [],
      })
    ).status,
    400,
  );
  const bad = await serve(t, {
    env,
    fetchImpl: async () => completion('{"title":"Incomplete"}'),
  });
  const rejected = await bad.post({ ...input, task: "workflow-paper" });
  assert.equal(rejected.status, 502);
  assert.equal((await rejected.json()).code, "INVALID_AI_OUTPUT");
});

test("disconnecting a generation aborts upstream work and releases its concurrency slot", async (t) => {
  let started, upstreamAborted;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const stopped = new Promise((resolve) => {
    upstreamAborted = resolve;
  });
  let calls = 0;
  const service = await serve(t, {
    env,
    maxConcurrent: 1,
    fetchImpl: async (_url, options) => {
      if (++calls > 1) return completion("Evidence [[cite:10.1234/study]].");
      started();
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => {
            upstreamAborted();
            reject(options.signal.reason);
          },
          { once: true },
        ),
      );
    },
  });
  const controller = new AbortController();
  const request = fetch(
    (await service.get()).url.replace(/\/status$/, "/generate"),
    {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  await waiting;
  controller.abort();
  await assert.rejects(request, /abort/i);
  await stopped;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await service.post()).status, 200);
});
const completion = (content, extra = {}) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content }, ...extra }] }),
    { headers: { "Content-Type": "application/json" } },
  );
const nativeCompletion = (text, extra = {}) =>
  new Response(
    JSON.stringify({
      modelVersion: "gemini-private-deployment-version",
      candidates: [
        {
          content: { role: "model", parts: [{ text }] },
          finishReason: "STOP",
          ...extra,
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
const assertPublicIdentity = (body) => {
  assert.equal(body.assistant, "ScrapeTx AI");
  assert.equal(body.provider, "ScrapeTx AI");
  assert.equal(body.model, "ScrapeTx AI");
  for (const privateValue of [
    env.AI_MODEL,
    googleEnv.AI_MODEL,
    googleFallbackEnv.AI_FALLBACK_MODEL,
    env.AI_API_KEY,
    googleEnv.AI_API_KEY,
    "gemini-private-deployment-version",
  ])
    assert.equal(
      JSON.stringify(body).includes(privateValue),
      false,
      `Public response leaked ${privateValue}`,
    );
};

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
    raw: (body) =>
      fetch(`${base}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
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
  assertPublicIdentity(status);
  const response = await api.post();
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "AI_NOT_CONFIGURED");
  assertPublicIdentity(body);
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
  assertPublicIdentity(result);
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

test("native AI configuration fixes the Google origin and validates deployment identifiers", () => {
  assert.equal(AI_ASSISTANT_NAME, "ScrapeTx AI");
  const config = aiConfig({
    ...googleEnv,
    AI_BASE_URL: "http://attacker.invalid",
  });
  assert.equal(config.configured, true);
  assert.equal(config.adapter, "google");
  assert.equal(
    config.endpoint,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
  );
  assert.equal(
    aiConfig({ ...googleEnv, AI_MODEL: "models/gemini-flash-latest" }).endpoint,
    config.endpoint,
  );
  assert.deepEqual(aiConfig({ AI_PROVIDER: "google" }).missing, [
    "AI_MODEL",
    "AI_API_KEY",
  ]);
  assert.equal(
    aiConfig({
      AI_PROVIDER: "google",
      AI_BASE_URL: "http://localhost:11434/v1",
      AI_MODEL: "gemini-flash-latest",
    }).configured,
    false,
  );
  for (const model of [
    "bad/model",
    "../../secret",
    "valid:generateContent?key=key",
    "bad model",
    "a".repeat(121),
  ])
    assert.equal(
      aiConfig({ ...googleEnv, AI_MODEL: model }).configured,
      false,
      model,
    );
  assert.equal(
    aiConfig({ ...env, AI_PROVIDER: "unknown-adapter" }).configured,
    false,
  );
});

test("availability fallback configuration is validated and stays server-only", async (t) => {
  const config = aiConfig({
    ...googleFallbackEnv,
    AI_FALLBACK_MODEL: `models/${googleFallbackEnv.AI_FALLBACK_MODEL}`,
  });
  assert.equal(config.configured, true);
  assert.equal(config.fallbackModel, googleFallbackEnv.AI_FALLBACK_MODEL);
  for (const fallback of [
    "bad/model",
    "bad model",
    "../../secret",
    "x:generateContent?key=y",
    "a".repeat(121),
    googleEnv.AI_MODEL,
  ])
    assert.equal(
      aiConfig({ ...googleEnv, AI_FALLBACK_MODEL: fallback }).configured,
      false,
      fallback,
    );
  assert.equal(
    aiConfig({ ...env, AI_FALLBACK_MODEL: googleFallbackEnv.AI_FALLBACK_MODEL })
      .configured,
    false,
  );
  const api = await serve(t, { env: googleFallbackEnv });
  const status = await (await api.get()).json();
  assert.equal(status.configured, true);
  assertPublicIdentity(status);
});

test("native generateContent uses header authentication, separate system instructions, and linked evidence", async (t) => {
  let sent;
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async (url, options) => {
      sent = { url, ...options, body: JSON.parse(options.body) };
      return nativeCompletion(
        "The association remains uncertain [[cite:10.1234/study]].",
        {
          content: {
            parts: [
              { thought: true, text: "Private reasoning [[cite:unavailable]]" },
              {
                text: "The association remains uncertain [[cite:10.1234/study]].",
              },
            ],
          },
        },
      );
    },
  });
  const response = await api.post({
    ...input,
    apiKey: "client-secret",
    model: "client-model",
    baseUrl: "https://attacker.invalid",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assertPublicIdentity(body);
  assert.equal(
    sent.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
  );
  assert.equal(sent.headers["X-goog-api-key"], googleEnv.AI_API_KEY);
  assert.equal(sent.headers.Authorization, undefined);
  assert.equal(sent.redirect, "error");
  assert.ok(sent.signal instanceof AbortSignal);
  assert.equal(sent.body.model, undefined);
  assert.equal(sent.body.contents[0].role, "user");
  assert.deepEqual(
    JSON.parse(sent.body.contents[0].parts[0].text).evidence,
    evidence,
  );
  assert.match(
    sent.body.systemInstruction.parts[0].text,
    /You are ScrapeTx AI/,
  );
  assert.match(
    sent.body.systemInstruction.parts[0].text,
    /untrusted source material/,
  );
  assert.deepEqual(
    body.citations,
    evidence.map(({ id, title, url }) => ({ id, title, url })),
  );
  assert.doesNotMatch(body.text, /Private reasoning/);
  assertPublicIdentity(await (await api.get()).json());
});

test("native citations are validated using the same evidence integrity rules", async (t) => {
  let text = "Unsupported source [[cite:invented]].";
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async () => nativeCompletion(text),
  });
  for (const output of [text, "An uncited finding."]) {
    text = output;
    const response = await api.post();
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.code, "UNVERIFIED_AI_CITATION");
    assertPublicIdentity(body);
  }
});

test("native diagram requests use a JSON schema and validate the returned graph", async (t) => {
  let sent;
  const diagram = {
    title: "Evidence map",
    summary: "A hypothetical mechanism [[cite:10.1234/study]].",
    nodes: [
      { id: "a", label: "Target" },
      { id: "b", label: "Outcome" },
    ],
    edges: [{ from: "a", to: "b", label: "hypothesized" }],
  };
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async (_url, options) => {
      sent = JSON.parse(options.body);
      return nativeCompletion(JSON.stringify(diagram));
    },
  });
  const request = { ...input, task: "diagram" };
  let response = await api.post(request);
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(sent.generationConfig.responseMimeType, "application/json");
  assert.equal(sent.generationConfig.responseJsonSchema.type, "object");
  assert.deepEqual(sent.generationConfig.responseJsonSchema.required, [
    "title",
    "summary",
    "nodes",
    "edges",
  ]);
  assert.deepEqual(body.diagram, diagram);
  assertPublicIdentity(body);
  diagram.edges[0].to = "missing-node";
  response = await api.post(request);
  body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.code, "INVALID_AI_OUTPUT");
  assertPublicIdentity(body);
});

test("native blocked, truncated, quota, credential, malformed, and timeout failures stay private", async (t) => {
  let next;
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async () => {
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const cases = [
    [
      nativeCompletion("Partial text", { finishReason: "MAX_TOKENS" }),
      502,
      "AI_OUTPUT_TRUNCATED",
    ],
    [
      nativeCompletion("Hidden response", { finishReason: "SAFETY" }),
      502,
      "AI_CONTENT_BLOCKED",
    ],
    [
      new Response(
        JSON.stringify({
          promptFeedback: {
            blockReason: "SAFETY",
            blockReasonMessage: googleEnv.AI_API_KEY,
          },
        }),
      ),
      502,
      "AI_CONTENT_BLOCKED",
    ],
    [
      new Response(
        JSON.stringify({
          error: { message: `${googleEnv.AI_API_KEY} ${googleEnv.AI_MODEL}` },
        }),
        { status: 403 },
      ),
      502,
      "AI_PROVIDER_ERROR",
    ],
    [
      new Response(googleEnv.AI_MODEL, { status: 429 }),
      429,
      "AI_PROVIDER_ERROR",
    ],
    [
      new Response(`not JSON ${googleEnv.AI_API_KEY}`),
      502,
      "INVALID_AI_OUTPUT",
    ],
    [
      new DOMException(
        `${googleEnv.AI_API_KEY} ${googleEnv.AI_MODEL}`,
        "TimeoutError",
      ),
      504,
      "AI_TIMEOUT",
    ],
  ];
  for (const [result, status, code] of cases) {
    next = result;
    const response = await api.post();
    const body = await response.json();
    assert.equal(response.status, status);
    assert.equal(body.code, code);
    assertPublicIdentity(body);
  }
});

test("temporary upstream capacity gets one retry under the original timeout", async (t) => {
  const calls = [];
  const api = await serve(t, {
    env: googleEnv,
    retryDelayMs: 0,
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return calls.length === 1
        ? new Response(`Private busy response ${googleEnv.AI_MODEL}`, {
            status: 503,
          })
        : nativeCompletion("The result is uncertain [[cite:10.1234/study]].");
    },
  });
  const response = await api.post();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].signal, calls[1].signal);
  assert.equal(calls[0].body, calls[1].body);
  assertPublicIdentity(body);
});

test("persistent upstream capacity returns a branded 503 after exactly one retry", async (t) => {
  let calls = 0;
  const api = await serve(t, {
    env: googleEnv,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response(`${googleEnv.AI_API_KEY} ${googleEnv.AI_MODEL}`, {
        status: 503,
      });
    },
  });
  const response = await api.post();
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "AI_CAPACITY_UNAVAILABLE");
  assert.match(body.error, /at capacity/);
  assert.equal(calls, 2);
  assertPublicIdentity(body);
});

test("two primary capacity failures permit exactly one native fallback with identical request constraints", async (t) => {
  const calls = [];
  const api = await serve(t, {
    env: googleFallbackEnv,
    retryDelayMs: 0,
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return calls.length <= 2
        ? new Response("Temporary capacity", { status: 503 })
        : nativeCompletion(
            "The evidence remains uncertain [[cite:10.1234/study]].",
          );
    },
  });
  const response = await api.post({
    ...input,
    fallbackModel: "attacker-model",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    ],
  );
  for (const call of calls) {
    assert.equal(call.signal, calls[0].signal);
    assert.equal(call.body, calls[0].body);
    assert.equal(call.headers, calls[0].headers);
    assert.equal(call.headers["X-goog-api-key"], googleEnv.AI_API_KEY);
    assert.equal(call.redirect, "error");
  }
  assert.ok(
    body.warnings.includes(
      "ScrapeTx AI used an alternate connection because the primary service was busy.",
    ),
  );
  assert.deepEqual(
    body.citations,
    evidence.map(({ id, title, url }) => ({ id, title, url })),
  );
  assertPublicIdentity(body);
});

test("fallback remains bounded and is never activated by primary auth, quota, or evidence errors", async (t) => {
  const scenarios = [
    { statuses: [200], count: 1, status: 200 },
    { statuses: [503, 200], count: 2, status: 200 },
    {
      statuses: [503, 503, 503],
      count: 3,
      status: 503,
      code: "AI_CAPACITY_UNAVAILABLE",
    },
    {
      statuses: [503, 503, 429],
      count: 3,
      status: 429,
      code: "AI_PROVIDER_ERROR",
    },
    { statuses: [401], count: 1, status: 502, code: "AI_PROVIDER_ERROR" },
    { statuses: [429], count: 1, status: 429, code: "AI_PROVIDER_ERROR" },
    { statuses: [503, 403], count: 2, status: 502, code: "AI_PROVIDER_ERROR" },
    {
      statuses: [200, 200],
      count: 2,
      status: 502,
      code: "UNVERIFIED_AI_CITATION",
      invalidCitation: true,
    },
  ];
  for (const scenario of scenarios) {
    let calls = 0;
    const api = await serve(t, {
      env: googleFallbackEnv,
      retryDelayMs: 0,
      fetchImpl: async () => {
        const status = scenario.statuses[calls++];
        assert.ok(status, "Unexpected extra upstream request");
        return status === 200
          ? nativeCompletion(
              scenario.invalidCitation
                ? "Unverified [[cite:invented]]."
                : "Uncertain [[cite:10.1234/study]].",
            )
          : new Response(`${googleFallbackEnv.AI_FALLBACK_MODEL} unavailable`, {
              status,
            });
      },
    });
    const response = await api.post();
    const body = await response.json();
    assert.equal(response.status, scenario.status);
    assert.equal(calls, scenario.count);
    if (scenario.code) assert.equal(body.code, scenario.code);
    if (response.ok)
      assert.equal(
        body.warnings.some((warning) =>
          warning.includes("alternate connection"),
        ),
        false,
      );
    assertPublicIdentity(body);
  }
});

test("fallback holds the original concurrency slot until its request completes", async (t) => {
  let calls = 0,
    release,
    fallbackStarted;
  const started = new Promise((resolve) => {
    fallbackStarted = resolve;
  });
  const api = await serve(t, {
    env: googleFallbackEnv,
    retryDelayMs: 0,
    maxConcurrent: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) return new Response("Busy", { status: 503 });
      fallbackStarted();
      await new Promise((resolve) => {
        release = resolve;
      });
      return nativeCompletion("Uncertain [[cite:10.1234/study]].");
    },
  });
  const pending = api.post();
  await started;
  const busy = await api.post();
  assert.equal(busy.status, 429);
  assert.equal((await busy.json()).code, "AI_BUSY");
  assert.equal(calls, 3);
  release();
  assert.equal((await pending).status, 200);
});

test("provider response bounds cover chunked payloads and remove unexpected credential text", async (t) => {
  let oversized = true;
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async () =>
      oversized
        ? new Response("x".repeat(1024 * 1024 + 1))
        : nativeCompletion(
            `Unexpected credential ${googleEnv.AI_API_KEY}; uncertain result [[cite:10.1234/study]].`,
          ),
  });
  const response = await api.post();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.code, "INVALID_AI_OUTPUT");
  assertPublicIdentity(body);
  oversized = false;
  const result = await (await api.post()).json();
  assert.match(result.text, /\[redacted\]/);
  assertPublicIdentity(result);
});

test("request parser failures also identify ScrapeTx AI", async (t) => {
  const api = await serve(t, { env: googleEnv });
  for (const [raw, status] of [
    ["{broken", 400],
    [JSON.stringify({ prompt: "x".repeat(130000) }), 413],
  ]) {
    const response = await api.raw(raw);
    assert.equal(response.status, status);
    assertPublicIdentity(await response.json());
  }
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

test("citation whitespace and explicit groups normalize only when every identifier was supplied", async (t) => {
  let output =
    "Reported association [[cite: source-1, source-2 ]] and limitation [[cite:source-1]].";
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async () => nativeCompletion(output),
  });
  const request = {
    ...input,
    evidence: [
      { ...evidence[0], id: "source-1" },
      { ...evidence[0], id: "source-2", title: "A second supplied source" },
    ],
  };
  let response = await api.post(request);
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(
    body.text,
    "Reported association [[cite:source-1]] [[cite:source-2]] and limitation [[cite:source-1]].",
  );
  assert.deepEqual(
    body.citations.map((c) => c.id),
    ["source-1", "source-2"],
  );
  output = "Mixed group [[cite: source-1, invented-source ]].";
  response = await api.post(request);
  body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.code, "UNVERIFIED_AI_CITATION");
  output = "A finding [cite: 1, 2 ].";
  response = await api.post({
    ...request,
    evidence: request.evidence.map((source, index) => ({
      ...source,
      id: String(index + 1),
    })),
  });
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.text, "A finding [[cite:1]] [[cite:2]].");
  assert.deepEqual(
    body.citations.map((source) => source.id),
    ["1", "2"],
  );
});

test("single-bracket citation markers cannot hide an unknown source", async (t) => {
  const api = await serve(t, {
    env: googleEnv,
    fetchImpl: async () =>
      nativeCompletion(
        "Claim [[cite:10.1234/study]] but another [cite:invented].",
      ),
  });
  const response = await api.post();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "UNVERIFIED_AI_CITATION");
});

test("Scholar-style numeric citations regenerate once with identical evidence rather than relabelling the answer", async (t) => {
  const calls = [];
  const records = [
    {
      ...evidence[0],
      id: "1",
      abstract:
        "Search result snippet, not a full article or abstract: a trial record.",
    },
    {
      ...evidence[0],
      id: "2",
      title: "A second source",
      abstract:
        "Search result snippet, not a full article or abstract: a review record.",
    },
  ];
  const service = await serve(t, {
    env: googleEnv,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return nativeCompletion(
        calls.length === 1
          ? "Discard this unsupported claim [[cite:S1]]."
          : "These search descriptions identify a trial [[cite:1]] and a review [[cite:2]]. Their snippets do not establish study findings.",
      );
    },
  });
  const response = await service.post({ ...input, evidence: records });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.signal, calls[1].options.signal);
  const firstInput = JSON.parse(calls[0].body.contents[0].parts[0].text);
  const nextInput = JSON.parse(calls[1].body.contents[0].parts[0].text);
  assert.deepEqual(firstInput.evidence, records);
  assert.deepEqual(nextInput, firstInput);
  assert.match(
    calls[0].body.systemInstruction.parts[0].text,
    /\[\[cite:1\]\], \[\[cite:2\]\]/,
  );
  assert.match(
    calls[1].body.systemInstruction.parts[0].text,
    /previous attempt failed citation validation/,
  );
  assert.match(
    calls[1].body.systemInstruction.parts[0].text,
    /do not merely swap an invalid citation/,
  );
  assert.ok(
    !JSON.stringify(calls[1].body).includes("Discard this unsupported claim"),
  );
  assert.ok(!body.text.includes("Discard this unsupported claim"));
  assert.deepEqual(
    body.citations.map((s) => s.id),
    ["1", "2"],
  );
  assert.ok(body.warnings.some((w) => w.includes("regenerated")));
});

test("structured slide regeneration retains sparse IDs and the required output schema", async (t) => {
  const calls = [];
  const slides = (id) =>
    JSON.stringify({
      slides: [
        {
          title: "Findings",
          content: `Finding [[cite:${id}]].`,
          notes: "Available evidence only.",
          layout: "title",
        },
        {
          title: "Limits",
          content: "Uncertainty [[cite:S7]].",
          notes: "Review the source.",
          layout: "content",
        },
      ],
    });
  const records = [
    { ...evidence[0], id: "S2" },
    { ...evidence[0], id: "S7", title: "Second study" },
  ];
  const service = await serve(t, {
    env: googleEnv,
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return nativeCompletion(slides(calls.length === 1 ? "S1" : "S2"));
    },
  });
  const response = await service.post({
    task: "workflow-slides",
    prompt: "Create two evidence slides",
    evidence: records,
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].generationConfig, calls[1].generationConfig);
  assert.deepEqual(
    body.citations.map((s) => s.id),
    ["S2", "S7"],
  );
  assert.match(JSON.parse(body.text).slides[0].content, /\[\[cite:S2\]\]/);
});

test("citation recovery stays within the shared three-call capacity budget and never guesses unknown IDs", async (t) => {
  for (const statuses of [
    [503, 200, 200],
    [503, 503, 200],
  ]) {
    const calls = [];
    const service = await serve(t, {
      env: googleFallbackEnv,
      retryDelayMs: 0,
      fetchImpl: async (url, options) => {
        calls.push({ url, signal: options.signal });
        assert.ok(calls.length <= 3, "Generation exceeded its call budget");
        const status = statuses[calls.length - 1];
        if (status !== 200) return new Response("Busy", { status });
        return nativeCompletion(
          statuses[1] === 200 && calls.length === 3
            ? "Supplied evidence [[cite:10.1234/study]]."
            : "Unknown evidence [[cite:invented]].",
        );
      },
    });
    const response = await service.post();
    const body = await response.json();
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => c.signal === calls[0].signal));
    assert.equal(response.status, statuses[1] === 200 ? 200 : 502);
    if (!response.ok) assert.equal(body.code, "UNVERIFIED_AI_CITATION");
  }
  let calls = 0;
  const service = await serve(t, {
    env: googleEnv,
    fetchImpl: async () => {
      calls++;
      return nativeCompletion("Unknown [[cite:S1]].");
    },
  });
  const response = await service.post({
    ...input,
    evidence: [{ ...evidence[0], id: "1" }],
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "UNVERIFIED_AI_CITATION");
  assert.equal(
    calls,
    2,
    "An invalid regeneration must not trigger another attempt",
  );
});

test("semicolon citation groups require every explicit ID; aliases and ranges stay invalid", async (t) => {
  let output = "Finding [[cite:1; 2]].",
    calls = 0;
  const service = await serve(t, {
    env: googleEnv,
    fetchImpl: async () => {
      calls++;
      return nativeCompletion(output);
    },
  });
  const records = [
    { ...evidence[0], id: "1" },
    { ...evidence[0], id: "2", title: "Second source" },
  ];
  const response = await service.post({ ...input, evidence: records });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, "Finding [[cite:1]] [[cite:2]].");
  assert.equal(calls, 1);
  for (const marker of ["1; invented", "S1", "1-2"]) {
    output = `Finding [[cite:${marker}]].`;
    assert.equal(
      (await service.post({ ...input, evidence: records })).status,
      502,
    );
  }
});

test("citation correction times out under the original signal and releases its concurrency slot", async (t) => {
  let calls = 0,
    correctionStarted,
    upstreamAborted = false;
  const started = new Promise((resolve) => {
    correctionStarted = resolve;
  });
  const signals = [];
  const service = await serve(t, {
    env: googleEnv,
    maxConcurrent: 1,
    timeoutMs: 150,
    fetchImpl: async (_url, options) => {
      calls++;
      signals.push(options.signal);
      if (calls === 1)
        return nativeCompletion("Wrong source [[cite:invented]].");
      if (calls > 2)
        return nativeCompletion("Reported uncertainty [[cite:10.1234/study]].");
      correctionStarted();
      return new Promise((_resolve, reject) => {
        const abort = () => {
          upstreamAborted = true;
          reject(options.signal.reason);
        };
        if (options.signal.aborted) abort();
        else options.signal.addEventListener("abort", abort, { once: true });
      });
    },
  });
  const pending = service.post();
  await started;
  assert.equal(
    (await service.post()).status,
    429,
    "A correction keeps its original concurrency slot",
  );
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "AI_TIMEOUT");
  assert.equal(signals[0], signals[1]);
  assert.equal(upstreamAborted, true);
  assert.equal(
    (await service.post()).status,
    200,
    "A timed out correction releases capacity",
  );
  assert.equal(calls, 3);
});

test('research guide is grounded in app capabilities with structured actions, not evidence synthesis', async t => {
  let captured;
  const guide = { reply: 'I can help you find papers, compare their findings, and create a cited literature draft.', steps: ['Search for bacteria papers.', 'Compare the available evidence.'], topic: 'bacteria resistance', question: 'Would you like a review or slides?', suggestions: ['A literature review', 'Slides'], actions: ['papers', 'workflow'] };
  const service = await serve(t, { env: googleEnv, fetchImpl: async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(guide) }] }, finishReason: 'STOP' }] }));
  } });
  const response = await service.post({ task: 'guide', prompt: 'I want to research bacteria', evidence: [] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(JSON.parse(result.text), guide);
  assert.deepEqual(result.citations, []);
  assert.match(captured.systemInstruction.parts[0].text, /ONLY this capability catalogue/);
  assert.match(captured.systemInstruction.parts[0].text, /Do not say you searched/);
  assert.match(captured.systemInstruction.parts[0].text, /not APIs/);
  assert.equal(captured.generationConfig.responseJsonSchema.properties.actions.items.enum.includes('papers'), true);
  assert.match(result.warnings[0], /no literature search/);
  assert.equal((await service.post({ task: 'guide', prompt: 'Guide me', evidence })).status, 400);
});

test('research guide refuses invented navigation from the AI', async t => {
  const service = await serve(t, { env, fetchImpl: async () => completion(JSON.stringify({ reply: 'Click here', topic: 'bacteria', question: '', suggestions: [], actions: ['unlimited-lab-automation'] })) });
  const response = await service.post({ task: 'guide', prompt: 'Guide me' });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'INVALID_AI_OUTPUT');
});


test('guide ensures docking navigation for an explicit docking task when the model returns generic actions', async t => {
  const service = await serve(t, { env, fetchImpl: async () => completion(JSON.stringify({ reply: 'ScrapeTx can help you inspect docking predictions.', steps: ['Load the prepared example or provide prepared PDBQT files.', 'Run docking and inspect the poses and scores.'], topic: 'molecular docking', question: 'Do you have prepared files?', suggestions: ['Try the example'], actions: ['papers', 'compare', 'workflow'] })) });
  const response = await service.post({ task: 'guide', prompt: JSON.stringify({ request: 'I am working on molecular docking', conversation: [] }) });
  assert.equal(response.status, 200);
  const result = JSON.parse((await response.json()).text);
  assert.deepEqual(result.actions, ['docking', 'papers', 'compare']);
});
