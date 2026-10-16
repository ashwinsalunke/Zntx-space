import test from "node:test";
import assert from "node:assert/strict";
import { applyWatchResponse, compareWatchSnapshots, createResearchWatch, makeWatchSnapshot, watchDigest, watchEndpoint, watchTemplateKind } from "../src/research-watches.js";

const firstTime = "2026-10-16T12:00:00.000Z";
const secondTime = "2026-10-23T12:00:00.000Z";
const paper = (pmid, extra = {}) => ({ id: `pubmed-${pmid}`, pmid: String(pmid), title: `Study ${pmid}`, journal: "Example journal", year: 2026, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, ...extra });
const trial = (id, extra = {}) => ({ id, title: `Trial ${id}`, status: "RECRUITING", enrollment: 0, phases: ["PHASE2"], completionDate: "2027-01", lastUpdated: "2026-10-15", hasResults: false, ...extra });
const create = (kind = "literature", extra = {}) => createResearchWatch({ id: "watch-example", title: "My evidence watch", query: "metformin AND cancer", kind, ...extra }, firstTime);

test("new watches validate input and contain no background schedule", () => {
  const watch = create();
  assert.equal(watch.type, "research-watch");
  assert.equal(watch.snapshot, null);
  assert.equal(watch.saveDigest, false);
  assert.equal("schedule" in watch, false);
  assert.throws(() => create("unsupported"), /supported/);
  assert.throws(() => create("literature", { title: " " }), /watch name/);
  assert.throws(() => create("literature", { query: "metformin\u0000cancer" }), /search query/);
  assert.throws(() => create("literature", { query: "a".repeat(301) }), /search query/);
});

test("watch endpoints encode queries without admitting extra source parameters", () => {
  const query = "metformin & source=python # dosage";
  const literature = new URL(watchEndpoint("literature", query), "https://example.test");
  const datasets = new URL(watchEndpoint("datasets", query), "https://example.test");
  assert.equal(literature.pathname, "/api/biomedical/pubmed");
  assert.equal(literature.searchParams.get("q"), query);
  assert.equal(literature.searchParams.has("source"), false);
  assert.equal(datasets.pathname, "/api/sources/search");
  assert.equal(datasets.searchParams.get("source"), "datasets");
  assert.equal(datasets.searchParams.get("q"), query);
  assert.equal(new URL(watchEndpoint("trials", "NCT01234567"), "https://example.test").pathname, "/api/biomedical/trials");
});

test("gallery links select only supported watch templates", () => {
  assert.equal(watchTemplateKind("literature-watch"), "literature");
  assert.equal(watchTemplateKind("trial-watch"), "trials");
  assert.equal(watchTemplateKind("dataset-watch"), "datasets");
  assert.equal(watchTemplateKind("reading-review"), "literature");
  assert.equal(watchTemplateKind("unknown-tool"), null);
  assert.equal(watchTemplateKind("constructor"), null);
  assert.equal(watchTemplateKind("__proto__"), null);
});

test("a first successful check establishes a baseline rather than new-paper alerts", () => {
  const watch = create();
  const checked = applyWatchResponse(watch, { results: [paper(101), paper(102)], total: 900 }, firstTime);
  assert.equal(checked.lastCheck.isBaseline, true);
  assert.equal(checked.lastCheck.baselineCount, 2);
  assert.deepEqual(checked.lastCheck.newRecords, []);
  assert.deepEqual(checked.lastCheck.changedRecords, []);
  assert.equal(watch.snapshot, null);
  assert.equal(checked.snapshot.total, 900);
  assert.equal(checked.snapshot.limit, 20);
});

test("trial checks detect explicit status and enrollment changes and preserve zero values", () => {
  const original = makeWatchSnapshot("trials", { results: [trial("NCT01234567"), trial("NCT11111111")], total: 2 }, firstTime);
  const next = makeWatchSnapshot("trials", { results: [trial("NCT01234567", { status: "COMPLETED", enrollment: 30 }), trial("NCT22222222")], total: 2 }, secondTime);
  const comparison = compareWatchSnapshots(original, next);
  assert.deepEqual(comparison.newRecords.map((record) => record.id), ["NCT22222222"]);
  assert.equal(comparison.changedRecords.length, 1);
  assert.deepEqual(comparison.changedRecords[0].changes, [
    { field: "Recruitment status", before: "RECRUITING", after: "COMPLETED" },
    { field: "Enrollment", before: "0", after: "30" },
  ]);
  assert.equal(comparison.notReturnedCount, 1);
  assert.equal("deletedRecords" in comparison, false);
  assert.equal(original.records[0].fields.Enrollment, "0");
});

test("ranking reorders and phase order do not produce false metadata changes", () => {
  const a = trial("NCT01234567", { phases: ["PHASE1", "PHASE2"] });
  const b = trial("NCT22222222");
  const before = makeWatchSnapshot("trials", { results: [a, b] }, firstTime);
  const after = makeWatchSnapshot("trials", { results: [b, { ...a, phases: ["PHASE2", "PHASE1"] }] }, secondTime);
  const comparison = compareWatchSnapshots(before, after);
  assert.equal(comparison.unchangedCount, 2);
  assert.deepEqual(comparison.changedRecords, []);
  assert.deepEqual(comparison.newRecords, []);
});

test("dataset identity uses normalized DOI and version metadata changes stay traceable", () => {
  const first = { doi: "10.1234/Research.ABC", title: "Research dataset", version: "1", url: "javascript:alert(1)" };
  const before = makeWatchSnapshot("datasets", { results: [first], total: 100 }, firstTime);
  const after = makeWatchSnapshot("datasets", { results: [{ ...first, doi: "https://doi.org/10.1234/research.abc", version: "2" }], total: 100 }, secondTime);
  const comparison = compareWatchSnapshots(before, after);
  assert.equal(before.records[0].id, "datacite-10.1234/research.abc");
  assert.equal(before.records[0].url, "https://doi.org/10.1234/research.abc");
  assert.deepEqual(comparison.newRecords, []);
  assert.deepEqual(comparison.changedRecords[0].changes, [{ field: "Version", before: "1", after: "2" }]);
});

test("snapshot coverage is bounded, deduplicated, and invalid pages cannot replace a baseline", () => {
  const watch = applyWatchResponse(create(), { results: [paper(101)], total: 5 }, firstTime);
  const saved = JSON.stringify(watch);
  assert.throws(() => applyWatchResponse(watch, { results: null }, secondTime), /previous check is unchanged/);
  assert.throws(() => applyWatchResponse(watch, { results: [{ title: "No stable identifier" }] }, secondTime), /previous check is unchanged/);
  assert.equal(JSON.stringify(watch), saved);
  const results = [paper(1), paper(1), ...Array.from({ length: 35 }, (_, index) => paper(index + 2))];
  const snapshot = makeWatchSnapshot("literature", { results, total: 1000 }, firstTime);
  assert.equal(snapshot.records.length, 19);
  assert.equal(snapshot.limit, 20);
  assert.equal(snapshot.total, 1000);
  assert.match(snapshot.warnings.join(" "), /duplicate/);
});

test("empty successful results are a valid check but never imply withdrawal", () => {
  const watch = applyWatchResponse(create(), { results: [paper(101)], total: 1 }, firstTime);
  const next = applyWatchResponse(watch, { results: [], total: 0 }, secondTime);
  assert.equal(next.snapshot.records.length, 0);
  assert.equal(next.lastCheck.notReturnedCount, 1);
  assert.match(watchDigest(next).content, /not inferred to be deleted or withdrawn/);
});

test("digests distinguish baselines and comparisons and cite only the underlying records", () => {
  const baseline = applyWatchResponse(create(), { results: [paper(101)] }, firstTime);
  const baselineNote = watchDigest(baseline);
  assert.match(baselineNote.content, /Initial baseline/);
  assert.match(baselineNote.content, /not a count of new publications/);
  assert.equal(baselineNote.citations[0].url, "https://pubmed.ncbi.nlm.nih.gov/101/");
  const next = applyWatchResponse(baseline, { results: [paper(101), paper(102)] }, secondTime);
  const note = watchDigest(next);
  assert.match(note.content, /1 newly seen records; 0 metadata changes/);
  assert.match(note.content, /No background schedule or notification service is active/);
  assert.deepEqual(note.citations, [{ title: "Study 102", url: "https://pubmed.ncbi.nlm.nih.gov/102/" }]);
});
