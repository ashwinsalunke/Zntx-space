import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createVerificationRouter, crossrefCandidates, crossrefNotices, normalizeFdaApplication, parsePubmedVerification, verificationDoi, verificationIssn } from "../server/verification.js";

const DOI = "10.1234/example";
const NOTICE = "10.1234/notice";
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
const work = (extra = {}) => ({ DOI, title: ["A drug study"], type: "journal-article", "container-title": ["Example Journal"], ...extra });
const searchResult = (ids) => ({ esearchresult: { idlist: ids, count: String(ids.length) } });
const article = ({ pmid = "123", doi = DOI, title = "A drug study", types = [], links = [] } = {}) => `<PubmedArticleSet><PubmedArticle><MedlineCitation Status="MEDLINE"><PMID>${pmid}</PMID><Article><ArticleTitle>${title}</ArticleTitle><Journal><Title>Example journal</Title><ISSN>0140-6736</ISSN></Journal><PublicationTypeList>${types.map((type) => `<PublicationType>${type}</PublicationType>`).join("")}</PublicationTypeList></Article><CommentsCorrectionsList>${links.map(([type, id]) => `<CommentsCorrections RefType="${type}"><RefSource>Source notice</RefSource><PMID>${id}</PMID></CommentsCorrections>`).join("")}</CommentsCorrectionsList></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">${doi}</ArticleId></ArticleIdList><ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9999/unrelated-reference</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle></PubmedArticleSet>`;

function mockProvider({ metadata = work(), updates = [], pubmedIds = [], xml = article(), catalogIds = ["446079"], indexedIds = ["446079"], fda = null, intercept = null } = {}) {
  return async (url, options) => {
    const parsed = new URL(url);
    const intercepted = await intercept?.(parsed, options);
    if (intercepted) return intercepted;
    if (parsed.hostname === "api.crossref.org") {
      if (parsed.pathname === "/works") return json({ message: { items: updates } });
      return metadata === null ? json({ error: "not found" }, 404) : json({ message: metadata });
    }
    if (parsed.hostname === "eutils.ncbi.nlm.nih.gov") {
      if (parsed.pathname.endsWith("esearch.fcgi")) return json(searchResult(parsed.searchParams.get("db") === "pubmed" ? pubmedIds : parsed.searchParams.get("term").includes("currentlyindexed") ? indexedIds : catalogIds));
      return new Response(xml, { headers: { "Content-Type": "application/xml" } });
    }
    if (parsed.hostname === "api.fda.gov") return fda === null ? json({ error: { code: "NOT_FOUND" } }, 404) : json(fda);
    throw new Error(`Unexpected endpoint: ${parsed.origin}`);
  };
}

async function withApi(fetchImpl, fn, options = {}) {
  const app = express();
  app.use("/api/verification", createVerificationRouter({ fetchImpl, throttle: false, ...options }));
  const server = await new Promise((resolve) => { const current = app.listen(0, "127.0.0.1", () => resolve(current)); });
  const base = `http://127.0.0.1:${server.address().port}/api/verification`;
  const request = async (path, body) => { const response = await fetch(base + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: response.status, headers: response.headers, data: await response.json() }; };
  try { await fn(request); } finally { await new Promise((resolve) => server.close(resolve)); }
}
const findCheck = (data, id) => data.checks.find((item) => item.id === id);

test("identifier validation accepts DOI resolvers and real ISSN checksums but rejects unsafe identifiers", async () => {
  assert.equal(verificationDoi("https://doi.org/10.1234/EXAMPLE"), DOI);
  assert.equal(verificationIssn("01406736"), "0140-6736");
  assert.equal(verificationIssn("1234-5678"), "");
  assert.equal(verificationDoi("https://example.test/10.1234/example"), "");
  let calls = 0;
  await withApi(() => { calls++; throw new Error("must not call"); }, async (api) => {
    for (const body of [{ doi: "http://127.0.0.1/private" }, { doi: "10.1234/test\nsecret" }, { pmid: "123&db=secrets" }, { issn: "1234-5678" }, { title: "\u0000" }, { doi: [DOI] }, {}]) assert.equal((await api("/paper", body)).status, 400);
    for (const path of ["/drug?q=a&q=b", "/drug?q=http%3A%2F%2F127.0.0.1", "/drug?q=x%22%20OR%20*", `/drug?q=${"a".repeat(101)}`]) assert.equal((await api(path)).status, 400);
  });
  assert.equal(calls, 0);
});

test("Crossref retracted original and update notice preserve opposite relationship directions", () => {
  const update = { DOI: NOTICE, type: "retraction", source: "retraction-watch" };
  const original = crossrefNotices(work({ "updated-by": [update] }), [{ DOI: NOTICE, "update-to": [{ ...update, DOI }] }]);
  assert.equal(original.length, 1);
  assert.equal(original[0].direction, "applies-to-this-record");
  assert.equal(original[0].sourceCode, "retraction-watch");
  assert.equal(original[0].url, `https://doi.org/${NOTICE}`);
  const notice = crossrefNotices({ DOI: NOTICE, "update-to": [{ DOI, type: "retraction", source: "publisher" }] });
  assert.equal(notice[0].direction, "this-record-updates-another");
  assert.equal(notice[0].targetDoi, DOI);
  assert.equal(notice[0].url, `https://doi.org/${NOTICE}`);
});

test("paper API flags a retracted original using Retraction Watch and PubMed evidence", async () => {
  await withApi(mockProvider({ metadata: work({ "updated-by": [{ DOI: NOTICE, type: "retraction", source: "retraction-watch" }] }), xml: article({ types: ["Retracted Publication"], links: [["RetractionIn", "456"]] }) }), async (api) => {
    const { status, data } = await api("/paper", { doi: DOI, pmid: "123", title: "A drug study" });
    assert.equal(status, 200);
    assert.equal(findCheck(data, "publication-updates").publicationStatus, "retracted");
    assert.equal(findCheck(data, "pubmed-status").publicationStatus, "retracted");
    assert.equal(findCheck(data, "pubmed-status").notices[0].url, "https://pubmed.ncbi.nlm.nih.gov/456/");
    assert.equal(data.metadataMatch.title.status, "match");
    assert.match(data.limitation, /do not verify scientific accuracy/i);
    assert.equal(findCheck(data, "medline-indexing").status, "indexed");
    const crossmark=new URL(data.crossmark.recordUrl);
    assert.equal(crossmark.origin,"https://crossmark.crossref.org");
    assert.equal(crossmark.searchParams.get("doi"),DOI);
  });
});

test("retraction notices are not misclassified as retracted original articles", async () => {
  await withApi(mockProvider({ metadata: work({ DOI: NOTICE, "update-to": [{ DOI, type: "retraction", source: "retraction-watch" }] }), xml: article({ doi: NOTICE, types: ["Retraction of Publication"], links: [["RetractionOf", "456"]] }) }), async (api) => {
    const { data } = await api("/paper", { doi: NOTICE, pmid: "123" });
    assert.equal(findCheck(data, "publication-updates").publicationStatus, "update-notice");
    assert.equal(findCheck(data, "pubmed-status").publicationStatus, "update-notice");
    assert.match(findCheck(data, "pubmed-status").detail, /not itself a retracted original/);
  });
});

test("mismatched title or PMID/DOI metadata remains an explicit mismatch", async () => {
  await withApi(mockProvider({ xml: article({ doi: "10.1234/different" }) }), async (api) => {
    const { data } = await api("/paper", { doi: DOI, title: "An unrelated biology paper", pmid: "123" });
    assert.equal(findCheck(data, "doi-metadata").status, "mismatch");
    assert.equal(data.metadataMatch.title.status, "mismatch");
    assert.equal(findCheck(data, "pubmed-status").metadataMatch.doi, "mismatch");
    assert.equal(findCheck(data, "pubmed-status").status, "mismatch");
  });
});

test("no-notice evidence and missing registry records are distinct from unavailable services", async () => {
  await withApi(mockProvider(), async (api) => {
    const { data } = await api("/paper", { doi: DOI });
    assert.equal(findCheck(data, "publication-updates").status, "no-notice-returned");
    assert.match(findCheck(data, "publication-updates").detail, /not a guarantee/);
    assert.equal(findCheck(data, "pubmed-status").status, "not-found");
  });
  await withApi(mockProvider({ metadata: null }), async (api) => {
    const { data } = await api("/paper", { doi: DOI });
    assert.equal(findCheck(data, "doi-metadata").status, "not-found");
    assert.equal(findCheck(data, "publication-updates").status, "not-found");
  });
});

test("partial outages preserve successful checks and are not cached as complete negative findings", async () => {
  let failedCalls = 0;
  await withApi(mockProvider({ metadata: work({ ISSN: ["0140-6736"] }), intercept: (url) => {
    if (url.hostname === "api.crossref.org" && url.pathname === "/works") { failedCalls++; return json({ error: "busy" }, 503); }
    if (url.searchParams.get("db") === "pubmed") return json({ error: "busy" }, 429);
  } }), async (api) => {
    for (let i = 0; i < 2; i++) {
      const { data } = await api("/paper", { doi: DOI });
      assert.equal(findCheck(data, "doi-metadata").status, "match");
      assert.equal(findCheck(data, "publication-updates").status, "unavailable");
      assert.equal(findCheck(data, "pubmed-status").status, "unavailable");
      assert.equal(findCheck(data, "medline-indexing").status, "indexed");
      assert.equal(data.cached, false);
    }
  });
  assert.equal(failedCalls, 2);
});

test("NLM catalog existence alone does not establish current MEDLINE indexing", async () => {
  await withApi(mockProvider({ indexedIds: [] }), async (api) => {
    const { data } = await api("/paper", { issn: "0140-6736" });
    assert.equal(findCheck(data, "medline-indexing").status, "not-currently-indexed");
    assert.equal(findCheck(data, "doi-metadata").status, "not-checked");
  });
  await withApi(mockProvider({ catalogIds: [] }), async (api) => {
    const { data } = await api("/paper", { issn: "0140-6736" });
    assert.equal(findCheck(data, "medline-indexing").status, "not-found");
  });
});

test("PubMed extraction ignores reference DOI IDs and distinguishes correction/concern direction", () => {
  const [record] = parsePubmedVerification(article({ links: [["ErratumIn", "456"], ["ExpressionOfConcernIn", "789"]] }));
  assert.equal(record.doi, DOI);
  assert.equal(record.publicationStatus, "expression-of-concern");
  assert.deepEqual(record.notices.map((notice) => notice.direction), ["applies-to-this-record", "applies-to-this-record"]);
  assert.equal(parsePubmedVerification(article({ types: ["Retraction of Publication"] }))[0].publicationStatus, "update-notice");
});

const application = (submissions) => ({ application_number: "NDA209637", sponsor_name: "Example sponsor", products: [{ product_number: "001", brand_name: "EXAMPLE", marketing_status: "Prescription", dosage_form: "INJECTION", route: "SUBCUTANEOUS", active_ingredients: [{ name: "SEMAGLUTIDE", strength: "1MG" }] }], submissions });

test("FDA approval evidence is tied to original AP submissions, not tentative approval or supplements", async () => {
  const original = { submission_type: "ORIG", submission_number: "1", submission_status: "AP", submission_status_date: "20171205", application_docs: [{ type: "Letter", url: "https://www.accessdata.fda.gov/drugsatfda_docs/appletter/example.pdf" }, { type: "Label", url: "javascript:alert(1)" }, { type: "Label", url: "https://example.test/label.pdf" }] };
  const normalized = normalizeFdaApplication(application([original]));
  assert.equal(normalized.hasOriginalApproval, true);
  assert.equal(normalized.originalApprovals[0].documents.length, 1);
  assert.equal(normalized.originalApprovals[0].statusDate, "2017-12-05");
  assert.equal(normalizeFdaApplication(application([{ ...original, submission_type: "SUPPL" }])).hasOriginalApproval, false);
  assert.equal(normalizeFdaApplication(application([{ ...original, submission_status: "TA" }])).hasOriginalApproval, false);
  await withApi(mockProvider({ fda: { results: [application([original])], meta: { results: { total: 1 }, last_updated: "2026-10-15" } } }), async (api) => {
    const { data } = await api("/drug?q=semaglutide");
    assert.equal(findCheck(data, "fda-approval").status, "approval-record-found");
    assert.match(findCheck(data, "fda-approval").detail, /not approve every proposed use/);
  });
  await withApi(mockProvider({ fda: { results: [application([{ ...original, submission_type: "SUPPL" }])] } }), async (api) => assert.equal(findCheck((await api("/drug?q=semaglutide")).data, "fda-approval").status, "application-record-found"));
});

test("FDA no matching records and provider failure remain distinguishable", async () => {
  await withApi(mockProvider(), async (api) => {
    const { data } = await api("/drug?q=unknowncompound");
    assert.equal(findCheck(data, "fda-approval").status, "not-found");
    assert.match(findCheck(data, "fda-approval").detail, /not a finding that the drug is unapproved/);
  });
  await withApi(mockProvider({ intercept: (url) => url.hostname === "api.fda.gov" ? json({}, 500) : null }), async (api) => assert.equal(findCheck((await api("/drug?q=metformin")).data, "fda-approval").status, "unavailable"));
});

test("only fixed primary endpoints are fetched and cached checks keep the original check time", async () => {
  const urls = [];
  await withApi(mockProvider({ intercept: (url) => { urls.push(url); } }), async (api) => {
    const one = await api("/paper", { doi: DOI, title: "A drug study", url: "http://127.0.0.1/private" });
    const calls = urls.length;
    const two = await api("/paper", { doi: DOI, title: "A drug study", url: "http://127.0.0.1/private" });
    assert.equal(two.data.cached, true);
    assert.equal(two.data.checkedAt, one.data.checkedAt);
    assert.equal(urls.length, calls);
    assert.ok(urls.every((url) => ["api.crossref.org", "eutils.ncbi.nlm.nih.gov"].includes(url.hostname)));
  });
});

test("oversized responses and invalid JSON become unavailable checks instead of false no-notice states", async () => {
  await withApi(mockProvider({ intercept: (url) => url.hostname === "api.crossref.org" ? new Response("x".repeat(500)) : null }), async (api) => {
    const { data } = await api("/paper", { doi: DOI });
    assert.equal(findCheck(data, "doi-metadata").code, "RESPONSE_TOO_LARGE");
    assert.equal(findCheck(data, "publication-updates").status, "unavailable");
  }, { maxResponseBytes: 150 });
  await withApi(mockProvider({ intercept: (url) => url.hostname === "api.fda.gov" ? new Response("not-json") : null }), async (api) => assert.equal(findCheck((await api("/drug?q=metformin")).data, "fda-approval").code, "INVALID_RESPONSE"));
});

test("request concurrency is bounded and duplicate in-flight checks share upstream work", async () => {
  let release; let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  await withApi(async () => { calls++; await gate; return json({ results: [] }); }, async (api) => {
    const first = api("/drug?q=metformin");
    while (!calls) await new Promise((resolve) => setTimeout(resolve, 5));
    const duplicate = api("/drug?q=metformin");
    const busy = await api("/drug?q=semaglutide");
    assert.equal(busy.status, 429);
    assert.equal(busy.headers.get("retry-after"), "2");
    release();
    assert.equal((await first).status, 200);
    assert.equal((await duplicate).status, 200);
  }, { maxConcurrent: 1 });
  assert.equal(calls, 1);
});

test("provider timeouts and oversized request bodies return bounded explicit errors", async () => {
  await withApi((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true })), async (api) => {
    const { data } = await api("/drug?q=metformin");
    assert.equal(findCheck(data, "fda-approval").status, "unavailable");
    assert.equal(findCheck(data, "fda-approval").code, "PROVIDER_TIMEOUT");
    assert.equal((await api("/paper", { title: "a".repeat(9000) })).status, 413);
  }, { timeoutMs: 5 });
});

test("title-only discovery offers ambiguous candidates without automatic identity verification", async () => {
  const items = [work(), work({ DOI: "10.1234/second", author: [{ given: "Alex", family: "Researcher" }], published: { "date-parts": [[2024]] } }), work({ DOI: "10.1234/EXAMPLE" })];
  assert.equal(crossrefCandidates(items).length, 2);
  const urls = [];
  await withApi(mockProvider({ updates: items, intercept: (url) => { urls.push(url); } }), async (api) => {
    const { data } = await api("/paper", { title: "A drug study" });
    assert.equal(data.candidates.length, 2);
    assert.equal(data.candidates[1].doi, "10.1234/second");
    assert.deepEqual(data.candidates[1].authors, ["Alex Researcher"]);
    assert.equal(data.candidates[1].year, 2024);
    assert.equal(data.metadataMatch, null);
    assert.ok(data.checks.every((item) => item.status === "not-checked"));
    assert.match(findCheck(data, "reference-discovery").detail, /duplicate or similar titles/);
  });
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get("query.bibliographic"), "A drug study");
  assert.equal(urls[0].searchParams.get("rows"), "5");
});

test("title candidates are bounded, DOI-linked, and invalid identifiers are discarded", () => {
  const candidates = crossrefCandidates([work({ DOI: "https://evil.test/private" }), work({ DOI: "10.1234/second", URL: "javascript:alert(1)" }), ...Array.from({ length: 10 }, (_, index) => work({ DOI: `10.1234/item${index}` }))]);
  assert.equal(candidates.length, 4);
  assert.ok(candidates.every((candidate) => candidate.url.startsWith("https://doi.org/")));
  assert.equal(candidates[0].url, "https://doi.org/10.1234/second");
});
