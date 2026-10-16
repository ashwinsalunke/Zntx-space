import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createDiscoveryRouter,
  mergeAndRank,
  parseOpenFullText,
} from "../server/discovery.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const crossref = (items = [], total = items.length) =>
  json({ message: { items, "total-results": total } });
const europe = (items = [], total = items.length) =>
  json({ resultList: { result: items }, hitCount: total });
const ARTICLE = `<?xml version="1.0"?><!DOCTYPE article SYSTEM "https://example.invalid/never-load.dtd"><article><front><journal-meta><journal-title>Example Journal</journal-title></journal-meta><article-meta><article-id pub-id-type="pmc">12345</article-id><article-id pub-id-type="doi">10.1234/example</article-id><title-group><article-title>A <italic>drug</italic> trial</article-title></title-group><permissions><copyright-statement>© Researchers</copyright-statement><license license-type="open-access" xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>Licensed under CC BY 4.0.</license-p></license></permissions><abstract><p>Original abstract &#x3B1; &amp; results.</p></abstract></article-meta></front><body><sec id="methods"><title>Methods</title><p>We studied 20 participants.</p><sec id="analysis"><title>Analysis</title><p>Nested analysis details.</p></sec><p>A further observation.</p></sec><sec id="results"><title>Results</title><p>Reported association.</p></sec></body><back><ref-list><ref><mixed-citation>Unrelated reference text.</mixed-citation></ref></ref-list></back></article>`;

async function withApi(fetchImpl, fn, options = {}) {
  const app = express();
  app.use("/api/discovery", createDiscoveryRouter({ fetchImpl, ...options }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/discovery`;
  try {
    await fn(async (path) => {
      const response = await fetch(base + path);
      return { status: response.status, data: await response.json() };
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("discovery merges normalized DOI duplicates and retains abstract and PMC provenance", () => {
  const papers = mergeAndRank(
    [
      {
        id: "doi",
        doi: "https://doi.org/10.1234/ABC",
        title: "A trial of metformin",
        abstract: "",
        source: "Crossref",
      },
      {
        id: "epmc",
        doi: "10.1234/abc",
        title: "A trial of metformin.",
        abstract: "Original source abstract.",
        source: "Europe PMC",
        pmcid: "PMC12345",
        openAccess: true,
      },
    ],
    "metformin trial",
  );
  assert.equal(papers.length, 1);
  assert.deepEqual(papers[0].sources, ["Crossref", "Europe PMC"]);
  assert.equal(papers[0].abstract, "Original source abstract.");
  assert.equal(papers[0].pmcid, "PMC12345");
  assert.equal(papers[0].fullTextUrl, "/api/discovery/fulltext?pmcid=PMC12345");
});
test("title deduplication handles punctuation but never merges conflicting DOI records", () => {
  const records = [
    {
      id: "1",
      title: "A Metformin Trial: Results",
      doi: "10.1/one",
      source: "Crossref",
    },
    {
      id: "2",
      title: "A metformin trial results.",
      doi: "",
      source: "Europe PMC",
    },
    {
      id: "3",
      title: "A metformin trial results",
      doi: "10.1/two",
      source: "Crossref",
    },
  ];
  const results = mergeAndRank(records, "metformin");
  assert.equal(results.length, 2);
  assert.ok(results.some((p) => p.doi === "10.1/one"));
  assert.ok(results.some((p) => p.doi === "10.1/two"));
});
test("lexical ranking is reproducible and clearly prefers title matches over abstract-only matches", () => {
  const records = [
    {
      id: "abstract",
      title: "Another investigation",
      abstract: "metformin diabetes",
      source: "X",
    },
    { id: "title", title: "Metformin diabetes", abstract: "", source: "X" },
  ];
  const ranked = mergeAndRank(records, "metformin diabetes");
  assert.equal(ranked[0].id, "title");
  assert.equal(ranked[0].relevanceScore, 15);
  assert.equal(ranked[1].relevanceScore, 5);
  assert.deepEqual(
    ranked.map((p) => p.id),
    mergeAndRank([...records].reverse(), "metformin diabetes").map((p) => p.id),
  );
});
test("JATS fulltext retains nested sections, license and source identity without loading DTD", () => {
  const result = parseOpenFullText(ARTICLE, "PMC12345");
  assert.equal(result.title, "A drug trial");
  assert.equal(result.doi, "10.1234/example");
  assert.equal(result.sections.length, 3);
  assert.match(result.sections[1].text, /Nested analysis details/);
  assert.match(result.sections[1].text, /A further observation/);
  assert.match(result.text, /Original abstract α & results/);
  assert.ok(!result.text.includes("Unrelated reference text"));
  assert.equal(
    result.license.url,
    "https://creativecommons.org/licenses/by/4.0/",
  );
  assert.match(result.license.text, /CC BY 4.0/);
  assert.equal(result.coverage.truncated, false);
});
test("fulltext source ID mismatches and abstract-only source documents fail explicitly", () => {
  assert.throws(
    () => parseOpenFullText(ARTICLE, "PMC999"),
    (error) => error.code === "SOURCE_ID_MISMATCH",
  );
  assert.throws(
    () =>
      parseOpenFullText(
        "<article><front><article-title>A title</article-title></front></article>",
        "PMC999",
      ),
    (error) => error.code === "FULLTEXT_NOT_AVAILABLE",
  );
});
test("search merges both real provider shapes and reports returned coverage separately from database totals", async () => {
  const seen = [];
  await withApi(
    async (url) => {
      seen.push(new URL(url));
      return url.includes("crossref")
        ? crossref(
            [
              {
                DOI: "10.1/shared",
                title: ["A metformin study"],
                abstract: "",
              },
            ],
            1000,
          )
        : europe(
            [
              {
                id: "1",
                source: "MED",
                pmcid: "PMC12345",
                doi: "10.1/shared",
                title: "A metformin study",
                abstractText: "A source abstract.",
                isOpenAccess: "Y",
              },
            ],
            2000,
          );
    },
    async (api) => {
      const { status, data } = await api("/search?q=metformin");
      assert.equal(status, 200);
      assert.equal(data.total, 1);
      assert.equal(data.coverage.duplicatesRemoved, 1);
      assert.equal(data.coverage.withAbstract, 1);
      assert.equal(data.sources[0].total, 1000);
      assert.equal(data.sources[1].total, 2000);
      assert.equal(data.partial, false);
      assert.ok(
        data.coverage.notes.some((note) =>
          note.includes("does not independently query PubMed"),
        ),
      );
      assert.equal(seen[0].searchParams.get("rows"), "40");
      assert.equal(seen[1].searchParams.get("resultType"), "core");
    },
  );
});
test("one source outage gives honest partial results with per-source errors and no synthetic findings", async () => {
  await withApi(
    async (url) =>
      url.includes("crossref")
        ? json({}, 403)
        : europe([
            { id: "22", source: "MED", title: "Study without an abstract" },
          ]),
    async (api) => {
      const { status, data } = await api("/search?q=metformin");
      assert.equal(status, 200);
      assert.equal(data.partial, true);
      assert.equal(data.sources[0].status, "error");
      assert.equal(data.sources[1].status, "ok");
      assert.equal(data.coverage.withoutAbstract, 1);
      assert.equal(data.papers[0].abstract, "");
    },
  );
});
test("all source failures return an error and preserve source diagnostics", async () => {
  await withApi(
    async () => json({}, 403),
    async (api) => {
      const { status, data } = await api("/search?q=metformin");
      assert.equal(status, 502);
      assert.equal(typeof data.error, "string");
      assert.equal(data.sources.length, 2);
      assert.ok(data.sources.every((source) => source.status === "error"));
      assert.ok(!("papers" in data));
    },
  );
});
test("fulltext accepts only PMC IDs and never fetches arbitrary URLs", async () => {
  const seen = [];
  await withApi(
    async (url) => {
      seen.push(url);
      return new Response(ARTICLE);
    },
    async (api) => {
      const invalid = await api(
        "/fulltext?pmcid=https%3A%2F%2Fexample.com%2Fprivate",
      );
      assert.equal(invalid.status, 400);
      assert.equal(seen.length, 0);
      const result = await api("/fulltext?pmcid=pmc12345");
      assert.equal(result.status, 200);
      assert.equal(
        seen[0],
        "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12345/fullTextXML",
      );
    },
  );
});
test("unavailable open access text returns 404 without a fabricated article body", async () => {
  await withApi(
    async () => new Response("Not found", { status: 404 }),
    async (api) => {
      const { status, data } = await api("/fulltext?pmcid=PMC999");
      assert.equal(status, 404);
      assert.equal(data.code, "FULLTEXT_NOT_AVAILABLE");
      assert.ok(!("text" in data));
    },
  );
});
test("streaming fulltext size limits reject oversized responses", async () => {
  await withApi(
    async () => new Response("x".repeat(200)),
    async (api) => {
      const { status, data } = await api("/fulltext?pmcid=PMC12345");
      assert.equal(status, 413);
      assert.equal(data.code, "SOURCE_TOO_LARGE");
    },
    { maxBytes: 100 },
  );
});
test("upstream server failures retry once and no further", async () => {
  let calls = 0;
  await withApi(
    async () => {
      calls++;
      return json({}, 503);
    },
    async (api) => {
      const { status } = await api("/search?q=retry");
      assert.equal(status, 502);
      assert.equal(calls, 4);
    },
  );
});
test("identical searches are cached and cache eviction is bounded", async () => {
  let calls = 0;
  await withApi(
    async (url) => {
      calls++;
      return url.includes("crossref") ? crossref() : europe();
    },
    async (api) => {
      await api("/search?q=one");
      await api("/search?q=one");
      assert.equal(calls, 2);
      await api("/search?q=two");
      await api("/search?q=one");
      assert.equal(calls, 6);
    },
    { maxCacheEntries: 1 },
  );
});
