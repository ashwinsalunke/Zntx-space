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
  assert.equal(body.assistant, "ScrapeTx Ai");
  assert.equal(body.provider, "ScrapeTx Ai");
  assert.equal(body.model, "ScrapeTx Ai");
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
  assert.equal(AI_ASSISTANT_NAME, "ScrapeTx Ai");
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
    /You are ScrapeTx Ai/,
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
      "ScrapeTx Ai used an alternate connection because the primary service was busy.",
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
      statuses: [200],
      count: 1,
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

test("request parser failures also identify ScrapeTx Ai", async (t) => {
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
  let output = "Reported association [[cite: source-1, source-2 ]] and limitation [[cite:source-1]].";
  const api = await serve(t, { env: googleEnv, fetchImpl: async () => nativeCompletion(output) });
  const request = { ...input, evidence: [
    { ...evidence[0], id: "source-1" }, { ...evidence[0], id: "source-2", title: "A second supplied source" },
  ] };
  let response = await api.post(request);
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.text, "Reported association [[cite:source-1]] [[cite:source-2]] and limitation [[cite:source-1]].");
  assert.deepEqual(body.citations.map((c) => c.id), ["source-1", "source-2"]);
  output = "Mixed group [[cite: source-1, invented-source ]].";
  response = await api.post(request); body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.code, "UNVERIFIED_AI_CITATION");
  output = "A finding [cite: 1, 2 ].";
  response = await api.post({ ...request, evidence: request.evidence.map((source, index) => ({ ...source, id: String(index + 1) })) });
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.text, "A finding [[cite:1]] [[cite:2]].");
  assert.deepEqual(body.citations.map((source) => source.id), ["1", "2"]);
});


test("single-bracket citation markers cannot hide an unknown source", async (t) => {
  const api = await serve(t, { env: googleEnv, fetchImpl: async () => nativeCompletion("Claim [[cite:10.1234/study]] but another [cite:invented].") });
  const response = await api.post();
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "UNVERIFIED_AI_CITATION");
});
