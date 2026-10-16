import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createSourcesRouter,
  parseArxiv,
  normalizeGrants,
  normalizeDatasets,
  normalizePython,
  externalSearchUrl,
  safeSourceUrl,
  sourceCatalog,
} from "../server/sources.js";

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json", ...headers },
});
async function withApi(fetchImpl, fn, options = {}) {
  const app = express();
  app.use("/api/sources", createSourcesRouter({ fetchImpl, throttle: false, ...options }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/sources`;
  try {
    await fn(async (path) => {
      const response = await fetch(base + path);
      return { status: response.status, headers: response.headers, data: await response.json() };
    });
  } finally { await new Promise((resolve) => server.close(resolve)); }
}
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom"><opensearch:totalResults>42</opensearch:totalResults><entry><id>http://arxiv.org/abs/2404.14353v2</id><title>A &amp; B: A preprint</title><published>2024-04-22T17:05:06Z</published><updated>2026-10-01T00:00:00Z</updated><summary>Source-supplied summary. &lt; 10 samples.</summary><author><name>Alice Smith</name></author><author><name>Study Group</name></author><arxiv:doi>10.1234/abc</arxiv:doi><category term="q-bio.BM"/></entry></feed>`;
const GRANTS = { errorcode: 0, data: { hitCount: 9, oppHits: [
  { id: "123456", title: "Cancer research funding", number: "TEST-01", agencyName: "Example Agency", openDate: "09/24/2026", closeDate: "11/01/2026", oppStatus: "posted" },
] } };
const DATASETS = { meta: { total: 6 }, data: [{ id: "10.1234/data-1", attributes: {
  doi: "10.1234/data-1", titles: [{ title: "Source dataset" }], types: { resourceTypeGeneral: "Dataset" }, creators: [{ name: "Study Team" }], publicationYear: 2025, url: "https://example.org/datasets/1", publisher: "Repository", descriptions: [{ descriptionType: "Abstract", description: "<p>Measured observations.</p>" }], rightsList: [{ rights: "CC BY 4.0", rightsUri: "https://creativecommons.org/licenses/by/4.0/" }],
} }] };
const PYTHON = { info: { name: "test_package", summary: "Source package summary", version: "1.2.3", author: "Package Authors", description: "Project description", requires_python: ">=3.10", license: "MIT", project_urls: { Source: "https://example.org/source", Malicious: "javascript:alert(1)" } }, urls: [{ upload_time_iso_8601: "2025-06-12T09:00:00Z" }] };

test("arXiv parsing preserves source authors, published year, DOI and preprint provenance", () => {
  const { results: [record], total } = parseArxiv(ATOM);
  assert.equal(total, 42);
  assert.equal(record.title, "A & B: A preprint");
  assert.equal(record.year, 2024);
  assert.deepEqual(record.authors, ["Alice Smith", "Study Group"]);
  assert.equal(record.abstract, "Source-supplied summary. < 10 samples.");
  assert.equal(record.url, "https://arxiv.org/abs/2404.14353v2");
  assert.equal(record.pdf, "https://arxiv.org/pdf/2404.14353v2");
  assert.equal(record.doi, "10.1234/abc");
  assert.equal(record.type, "preprint");
  assert.equal(record.citations, null);
});
test("arXiv excludes untrusted IDs and rejects DTD/entity documents and API errors", () => {
  assert.deepEqual(parseArxiv(ATOM.replace("http://arxiv.org/abs/2404.14353v2", "https://evil.example/abs/2404.14353v2")).results, []);
  assert.throws(() => parseArxiv('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + ATOM), /unreadable/);
  assert.throws(() => parseArxiv('<feed><entry><id>http://arxiv.org/api/errors#bad</id><title>Error</title></entry></feed>'), /simpler query/);
  assert.throws(() => parseArxiv("<html>upstream failure</html>"), /unreadable/);
});
test("grant records retain source dates and status without inventing abstracts or funding", () => {
  const { results: [record], total } = normalizeGrants(GRANTS);
  assert.equal(total, 9);
  assert.equal(record.year, 2026);
  assert.equal(record.status, "posted");
  assert.equal(record.closeDate, "11/01/2026");
  assert.equal(record.url, "https://www.grants.gov/search-results-detail/123456");
  assert.equal(record.abstract, "");
  assert.equal(record.type, "grant");
  assert.equal(normalizeGrants({ errorcode: 0, data: { oppHits: [{ id: "1", title: "Opportunity", agency: "National Institutes of Health" }] } }).results[0].agency, "National Institutes of Health");
  assert.equal(normalizeGrants({ errorcode: 0, data: { oppHits: [{ id: "../../evil", title: "bad" }] } }).results.length, 0);
});
test("dataset normalization filters other resource types and does not infer open access from a DOI", () => {
  const { results: [record], total } = normalizeDatasets(DATASETS);
  assert.equal(total, 6);
  assert.equal(record.url, "https://doi.org/10.1234/data-1");
  assert.deepEqual(record.authors, ["Study Team"]);
  assert.equal(record.abstract, "Measured observations.");
  assert.equal(record.openAccess, false);
  assert.equal(record.licenses[0].name, "CC BY 4.0");
  const changed = structuredClone(DATASETS);
  changed.data[0].attributes.types.resourceTypeGeneral = "JournalArticle";
  assert.deepEqual(normalizeDatasets(changed).results, []);
});
test("PyPI verifies the requested normalized name and removes unsafe publisher links", () => {
  const record = normalizePython(PYTHON, "test.package").results[0];
  assert.equal(record.id, "pypi-test-package");
  assert.equal(record.version, "1.2.3");
  assert.equal(record.year, 2025);
  assert.deepEqual(record.projectUrls, [{ label: "Source", url: "https://example.org/source" }]);
  assert.throws(() => normalizePython(PYTHON, "another-package"), /unexpected package/);
});
test("metadata links allow HTTP(S) only and external search query text remains encoded", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,hello", "https://user:secret@example.org/", "https://example.org/\nattack", "/relative/path"]) assert.equal(safeSourceUrl(value), "");
  assert.equal(safeSourceUrl("https://example.org/paper"), "https://example.org/paper");
  for (const source of ["scholar", "google", "patents"]) {
    const url = new URL(externalSearchUrl(source, "aspirin & metformin? #trial"));
    assert.equal(url.searchParams.get("q"), "aspirin & metformin? #trial");
    assert.equal(url.hash, "");
  }
  assert.equal(externalSearchUrl("constructor", "query"), "");
});
test("source catalog identifies credential-required search and library connectors without claiming they are connected", async () => {
  assert.equal(sourceCatalog().length, 13);
  assert.equal(sourceCatalog().find((s) => s.id === "mendeley").supported, true);
  for (const id of ["mendeley","zotero","scholar","google","patents"]) {
    const source=sourceCatalog().find(s=>s.id===id);
    assert.equal(source.mode,"connector");assert.equal(source.requiresCredential,true);assert.ok(source.statusEndpoint);
  }
  await withApi(() => { throw new Error("must not fetch"); }, async (api) => {
    const { status, data } = await api("/status");
    assert.equal(status, 200);
    assert.equal(data.sources.find((s) => s.id === "zotero").statusEndpoint, "/api/library-sync/status");
  });
});
test("invalid and duplicate arguments cannot select a URL or reach upstream services", async () => {
  await withApi(() => { throw new Error("must not fetch"); }, async (api) => {
    for (const path of ["/search", "/search?source=arxiv&q=a&q=b", "/search?source=arxiv&source=grants&q=hello", "/search?source=__proto__&q=hello", "/search?source=https://evil.example&q=hello", "/search?source=python&q=../../package", "/search?source=python&q=research%20topic", "/search?source=arxiv&q=%00", `/search?source=grants&q=${"a".repeat(301)}`]) {
      assert.equal((await api(path)).status, 400, path);
    }
  });
});
test("public search adapters use fixed endpoints, source-specific parameters, and provenance", async () => {
  const seen = [];
  await withApi(async (url, init) => {
    seen.push({ url: new URL(url), init });
    if (url.includes("arxiv")) return new Response(ATOM);
    if (url.includes("grants")) return json(GRANTS);
    if (url.includes("datacite")) return json(DATASETS);
    return json(PYTHON);
  }, async (api) => {
    for (const [source, query, expected] of [["arxiv", "metformin cancer", "arXiv"], ["grants", "cancer", "Grants.gov"], ["datasets", "cancer", "DataCite"], ["python", "test-package", "PyPI"]]) {
      const { status, data } = await api(`/search?source=${source}&q=${encodeURIComponent(query)}`);
      assert.equal(status, 200);
      assert.equal(data.source, expected);
      assert.equal(data.results.length, 1);
      assert.ok(data.retrievedAt);
      assert.ok(data.warnings.length);
    }
    assert.equal(seen[0].url.hostname, "export.arxiv.org");
    assert.equal(seen[0].url.searchParams.get("search_query"), "all:metformin AND all:cancer");
    assert.equal(seen[1].init.method, "POST");
    assert.equal(JSON.parse(seen[1].init.body).oppStatuses, "forecasted|posted");
    assert.equal(seen[2].url.searchParams.get("resource-type-id"), "dataset");
    assert.equal(seen[3].url.href, "https://pypi.org/pypi/test-package/json");
  });
});
test("identical successful searches are cached while external search never pretends to retrieve results", async () => {
  let calls = 0;
  await withApi(async () => { calls++; return json(DATASETS); }, async (api) => {
    const first = await api("/search?source=datasets&q=drug");
    const second = await api("/search?source=datasets&q=drug");
    assert.equal(first.data.retrievedAt, second.data.retrievedAt);
    assert.equal(second.data.cached, true);
    assert.equal(calls, 1);
    const external = await api("/search?source=scholar&q=drug");
    assert.equal(external.status, 200);
    assert.equal(external.data.mode, "external");
    assert.deepEqual(external.data.results, []);
    assert.equal(new URL(external.data.externalSearchUrl).hostname, "scholar.google.com");
    assert.equal(calls, 1);
  });
});
test("a missing exact PyPI package yields a genuine empty result", async () => {
  await withApi(async () => json({ message: "Not Found" }, 404), async (api) => {
    const { status, data } = await api("/search?source=python&q=package-does-not-exist");
    assert.equal(status, 200);
    assert.equal(data.total, 0);
    assert.deepEqual(data.results, []);
  });
});
test("provider HTTP errors, rate limits, and malformed metadata are explicit and never cached as success", async () => {
  let calls = 0;
  await withApi(async () => { calls++; return json({}, 429, { "Retry-After": "1000" }); }, async (api) => {
    for (let i = 0; i < 2; i++) {
      const response = await api("/search?source=grants&q=cancer");
      assert.equal(response.status, 503);
      assert.equal(response.data.code, "PROVIDER_RATE_LIMIT");
      assert.equal(response.headers.get("retry-after"), "60");
    }
    assert.equal(calls, 2);
  });
  await withApi(async () => new Response("not json"), async (api) => {
    assert.equal((await api("/search?source=datasets&q=cancer")).data.code, "SOURCE_INVALID_RESPONSE");
  });
  await withApi(async () => json({}, 403), async (api) => {
    const response = await api("/search?source=grants&q=cancer");
    assert.equal(response.status, 502);
    assert.equal(response.data.code, "PROVIDER_HTTP_ERROR");
  });
});
test("oversized bodies and provider timeouts are bounded failures", async () => {
  await withApi(async () => new Response("x".repeat(65)), async (api) => {
    const response = await api("/search?source=arxiv&q=cancer");
    assert.equal(response.status, 413);
    assert.equal(response.data.code, "SOURCE_TOO_LARGE");
  }, { maxBytes: 64 });
  await withApi(async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }), async (api) => {
    const response = await api("/search?source=arxiv&q=cancer");
    assert.equal(response.status, 502);
    assert.equal(response.data.code, "PROVIDER_TIMEOUT");
  }, { timeoutMs: 20 });
});
