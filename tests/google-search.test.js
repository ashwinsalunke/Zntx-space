import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createGoogleSearchRouter, normalizeGoogleResults } from "../server/google-search.js";

const KEY = "test-private-provider-key-alpha";
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
const web = () => ({ search_metadata: { status: "Success" }, search_information: { total_results: 1530 }, organic_results: [{ title: "A source page", link: "https://example.org/research", date: "May 2, 2022", snippet: "A search snippet, not a full abstract." }] });
async function withApi(fetchImpl, callback, options = {}) {
  const app = express();
  app.use("/api/google-search", createGoogleSearchRouter({ fetchImpl, getCredential: () => KEY, ...options }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api/google-search`;
  try {
    await callback(async (path, workspace = "workspace-alpha") => {
      const response = await fetch(base + path, { headers: { "X-Workspace-Token": workspace } });
      return { status: response.status, headers: response.headers, data: await response.json() };
    });
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test("web results carry third-party provenance and snippets never become abstracts", async () => {
  await withApi(async () => json(web()), async (api) => {
    const { status, data } = await api("/search?source=google&q=research");
    assert.equal(status, 200);
    assert.equal(data.mode, "api");
    assert.equal(data.provider, "SerpAPI");
    assert.equal(data.providerType, "third-party");
    assert.equal(data.source, "Google Search");
    assert.equal(data.sourceId, "google");
    assert.equal(data.total, 1530);
    assert.ok(data.retrievedAt);
    assert.match(data.warnings.join(" "), /not full abstracts/);
    const record = data.results[0];
    assert.equal(record.abstract, "");
    assert.equal(record.contentType, "search-snippet");
    assert.equal(record.snippet, "A search snippet, not a full abstract.");
    assert.equal(record.year, 2022);
    assert.deepEqual(record.authors, []);
    assert.equal(record.openAccess, false);
  });
});

test("Scholar preserves supplied authors, citation counts, PDF links, and only explicit DOI identifiers", () => {
  const data = { search_metadata: { status: "Success" }, organic_results: [
    { title: "First scholarly work", link: "https://example.org/paper", snippet: "A snippet mentions 10.1234/not-an-explicit-doi.", publication_info: { summary: "A Author - Journal, 2023 - example.org", authors: [{ name: "A Author" }] }, inline_links: { cited_by: { total: 17 } }, resources: [{ file_format: "PDF", link: "https://example.org/paper.pdf" }] },
    { title: "DOI-linked work", link: "https://doi.org/10.1234%2Fwork", publication_info: { summary: "2020" } },
    { title: "Explicit DOI field", link: "https://example.org/another", doi: "10.1234/another" },
  ] };
  const { results } = normalizeGoogleResults("scholar", data);
  assert.deepEqual(results[0].authors, ["A Author"]);
  assert.equal(results[0].year, 2023);
  assert.equal(results[0].citations, 17);
  assert.equal(results[0].pdf, "https://example.org/paper.pdf");
  assert.equal(results[0].abstract, "");
  assert.equal(results[0].doi, undefined);
  assert.equal(results[1].doi, "10.1234/work");
  assert.equal(results[2].doi, "10.1234/another");
});

test("patent normalization preserves explicit publication numbers, inventor, assignee, and dates", () => {
  const data = { organic_results: [
    { title: "A patent", patent_link: "https://patents.google.com/patent/US1234567A/en", publication_number: "US1234567A", inventor: "Example Inventor", assignee: "Example Assignee", publication_date: "2021-06-02", priority_date: "2018-07-01", filing_date: "2019-04-02", grant_date: "2021-06-02", snippet: "Patent search snippet.", pdf: "https://patentimages.storage.googleapis.com/example.pdf" },
    { is_scholar: true, title: "A mixed-in paper", scholar_link: "https://example.org/paper" },
  ] };
  const { results } = normalizeGoogleResults("patents", data);
  assert.equal(results.length, 1);
  assert.equal(results[0].type, "patent");
  assert.equal(results[0].publicationNumber, "US1234567A");
  assert.equal(results[0].inventor, "Example Inventor");
  assert.equal(results[0].assignee, "Example Assignee");
  assert.equal(results[0].publicationDate, "2021-06-02");
  assert.equal(results[0].filingDate, "2019-04-02");
  assert.equal(results[0].priorityDate, "2018-07-01");
  assert.equal(results[0].year, 2021);
  assert.equal(results[0].abstract, "");
  assert.equal(results[0].doi, undefined);
});

test("adapter fixes the host and engine, encodes queries, and maps only supported year parameters", async () => {
  const calls = [];
  await withApi(async (input, init) => { calls.push({ url: new URL(input), init }); return json(web()); }, async (api) => {
    const query = "metformin & insulin #trial? 日本";
    assert.equal((await api(`/search?source=google&q=${encodeURIComponent(query)}`)).status, 200);
    assert.equal((await api("/search?source=scholar&q=metformin&yearFrom=2020&yearTo=2025")).status, 200);
    assert.equal((await api("/search?source=patents&q=metformin&yearFrom=2020&yearTo=2025")).status, 200);
    for (const { url, init } of calls) {
      assert.equal(url.origin + url.pathname, "https://serpapi.com/search.json");
      assert.equal(url.searchParams.get("api_key"), KEY);
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Accept, "application/json");
    }
    assert.equal(calls[0].url.searchParams.get("q"), query);
    assert.equal(calls[0].url.searchParams.get("engine"), "google");
    assert.equal(calls[1].url.searchParams.get("engine"), "google_scholar");
    assert.equal(calls[1].url.searchParams.get("as_ylo"), "2020");
    assert.equal(calls[1].url.searchParams.get("as_yhi"), "2025");
    assert.equal(calls[2].url.searchParams.get("engine"), "google_patents");
    assert.equal(calls[2].url.searchParams.get("after"), "publication:20200101");
    assert.equal(calls[2].url.searchParams.get("before"), "publication:20251231");
    assert.equal(calls[2].url.searchParams.get("scholar"), "false");
  });
});

test("invalid, duplicate, injected, and unsupported arguments fail before credential lookup or upstream calls", async () => {
  let credentialCalls = 0;
  await withApi(() => { throw Error("must not fetch"); }, async (api) => {
    for (const path of [
      "/search", "/search?source=__proto__&q=test", "/search?source=https://evil.example&q=test",
      "/search?source=google&source=scholar&q=test", "/search?source=scholar&q=a&q=b",
      "/search?source=google&q=%00", `/search?source=google&q=${"a".repeat(301)}`,
      "/search?source=google&q=test&url=https://evil.example", "/search?source=google&q=test&api_key=attacker",
      "/search?source=google&q=test&yearFrom=2020", "/search?source=scholar&q=test&yearFrom=20",
      "/search?source=scholar&q=test&yearFrom=2025&yearTo=2020", "/search?source=patents&q=test&yearTo=9999",
      "/search?source=patents&q=test&yearFrom=2020&yearFrom=2021",
    ]) assert.equal((await api(path)).status, 400, path);
    assert.equal(credentialCalls, 0);
  }, { getCredential: () => { credentialCalls++; return KEY; } });
});

test("an injected missing credential never falls back to a server environment key", async () => {
  const previous = process.env.SERPAPI_API_KEY;
  process.env.SERPAPI_API_KEY = "test-server-environment-private-key";
  try {
    await withApi(() => { throw Error("must not fetch"); }, async (api) => {
      const response = await api("/search?source=scholar&q=test");
      assert.equal(response.status, 503);
      assert.equal(response.data.code, "CONNECTION_REQUIRED");
      assert.equal(response.data.sourceId, "scholar");
      assert.equal(new URL(response.data.externalSearchUrl).hostname, "scholar.google.com");
      assert.ok(!JSON.stringify(response.data).includes(process.env.SERPAPI_API_KEY));
    }, { getCredential: () => null });
  } finally {
    if (previous === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = previous;
  }
});

test("raw upstream messages, archive URLs, and echoed keys never reach the browser", async () => {
  const data = web();
  data.search_parameters = { api_key: KEY };
  data.search_metadata.json_endpoint = `https://serpapi.com/search.json?api_key=${KEY}`;
  data.organic_results[0].title = `Echoed ${KEY}`;
  data.organic_results[0].snippet = `Provider echoed ${KEY}`;
  data.organic_results.push({ title: "Provider archive", link: `https://serpapi.com/search.json?api_key=${KEY}` });
  await withApi(async () => json(data), async (api) => {
    const response = await api("/search?source=google&q=test");
    assert.equal(response.status, 200);
    assert.equal(response.data.results.length, 1);
    assert.ok(!JSON.stringify(response.data).includes(KEY));
    assert.match(response.data.results[0].snippet, /\[redacted\]/);
    assert.equal(response.data.search_parameters, undefined);
  });
  await withApi(async () => { throw Error(`Network failure https://serpapi.com?api_key=${KEY}`); }, async (api) => {
    const response = await api("/search?source=google&q=test");
    assert.equal(response.status, 502);
    assert.ok(!JSON.stringify(response.data).includes(KEY));
  });
});

test("cache and in-flight requests are isolated by workspace and credential fingerprint", async () => {
  let calls = 0, key = KEY;
  await withApi(async () => { calls++; return json(web()); }, async (api) => {
    const first = await api("/search?source=google&q=test", "workspace-a");
    const cached = await api("/search?source=google&q=test", "workspace-a");
    assert.equal(first.data.retrievedAt, cached.data.retrievedAt);
    assert.equal(cached.data.cached, true);
    assert.equal(calls, 1);
    await api("/search?source=google&q=test", "workspace-b");
    assert.equal(calls, 2);
    key = "test-private-provider-key-beta";
    await api("/search?source=google&q=test", "workspace-a");
    assert.equal(calls, 3);
    key = null;
    assert.equal((await api("/search?source=google&q=test", "workspace-a")).data.code, "CONNECTION_REQUIRED");
  }, { getCredential: () => key });
});

test("identical simultaneous searches coalesce while account concurrency is bounded", async () => {
  let calls = 0, release;
  const ready = new Promise((resolve) => { release = resolve; });
  await withApi(async () => { calls++; await ready; return json(web()); }, async (api) => {
    const first = api("/search?source=google&q=one");
    const same = api("/search?source=google&q=one");
    while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 2));
    const blocked = await api("/search?source=google&q=two");
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, "PROVIDER_BUSY");
    assert.equal(blocked.headers.get("retry-after"), "2");
    release();
    const results = await Promise.all([first, same]);
    assert.equal(calls, 1);
    assert.equal(results[0].status, 200);
    assert.equal(results[1].status, 200);
  }, { maxConcurrentPerCredential: 1 });
});

test("auth, quota, rate limits, request rejection, and upstream outages are explicit uncached failures", async () => {
  for (const [status, error, expected] of [
    [401, `Invalid API key ${KEY}`, "CONNECTION_AUTH_FAILED"],
    [403, `Permission denied ${KEY}`, "CONNECTION_AUTH_FAILED"],
    [429, `Your account has run out of searches ${KEY}`, "PROVIDER_QUOTA_EXCEEDED"],
    [429, "Hourly throughput limit reached", "PROVIDER_RATE_LIMIT"],
    [400, `Rejected https://serpapi.com?api_key=${KEY}`, "PROVIDER_REQUEST_REJECTED"],
    [503, `Unavailable ${KEY}`, "PROVIDER_UNAVAILABLE"],
  ]) {
    let calls = 0;
    await withApi(async () => { calls++; return json({ error }, status, { "Retry-After": "9000" }); }, async (api) => {
      for (let index = 0; index < 2; index++) {
        const response = await api("/search?source=google&q=test");
        assert.equal(response.data.code, expected, `${status} ${expected}`);
        assert.ok(!JSON.stringify(response.data).includes(KEY));
        if (status === 429) assert.equal(response.headers.get("retry-after"), "300");
      }
      assert.equal(calls, 2);
    });
  }
});

test("empty successful searches are preserved and processing/error responses are not fake successes", async () => {
  await withApi(async () => json({ search_metadata: { status: "Success" }, search_information: { organic_results_state: "Fully empty", total_results: 0 }, error: "Google hasn't returned any results for this query." }), async (api) => {
    const response = await api("/search?source=google&q=unmatchable");
    assert.equal(response.status, 200);
    assert.equal(response.data.total, 0);
    assert.deepEqual(response.data.results, []);
  });
  for (const data of [{ search_metadata: { status: "Processing" } }, { search_metadata: { status: "Error" }, error: `Proxy failed ${KEY}` }]) {
    await withApi(async () => json(data), async (api) => {
      const response = await api("/search?source=google&q=test");
      assert.equal(response.status, 502);
      assert.equal(response.data.code, "PROVIDER_SEARCH_FAILED");
      assert.ok(!JSON.stringify(response.data).includes(KEY));
    });
  }
});

test("invalid schemas, executable links, missing titles, duplicates, and guessed authors are rejected", () => {
  assert.throws(() => normalizeGoogleResults("google", {}), /unreadable/);
  assert.throws(() => normalizeGoogleResults("google", { organic_results: {} }), /unreadable/);
  const { results } = normalizeGoogleResults("scholar", { organic_results: [
    { title: "Unsafe", link: "javascript:alert(1)" },
    { title: "Credentials", link: "https://user:password@example.org/" },
    { title: "", link: "https://example.org/empty" },
    { title: "Only actual record", link: "https://example.org/source", publication_info: { summary: "Names are not structured authors, 2021" } },
    { title: "Duplicate", link: "https://example.org/source" },
  ] });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].authors, []);
});

test("response size, malformed JSON, fetch timeout, and stalled body reads are bounded", async () => {
  await withApi(async () => new Response("x".repeat(70)), async (api) => {
    assert.equal((await api("/search?source=google&q=test")).data.code, "SOURCE_TOO_LARGE");
  }, { maxBytes: 64 });
  await withApi(async () => new Response("not json"), async (api) => {
    assert.equal((await api("/search?source=google&q=test")).data.code, "SOURCE_INVALID_RESPONSE");
  });
  await withApi(async () => new Promise(() => {}), async (api) => {
    const response = await api("/search?source=google&q=test");
    assert.equal(response.status, 504);
    assert.equal(response.data.code, "PROVIDER_TIMEOUT");
  }, { timeoutMs: 15 });
  await withApi(async () => new Response(new ReadableStream({ start() {} })), async (api) => {
    assert.equal((await api("/search?source=google&q=test")).data.code, "PROVIDER_TIMEOUT");
  }, { timeoutMs: 15 });
});
