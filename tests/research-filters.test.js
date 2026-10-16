import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultResearchFilters,
  filterResearchPapers,
  filterSummary,
  keywordPhrases,
  normalizeResearchFilters,
  removeResearchFilter,
  researchFilterOptions,
  validateResearchFilters,
} from "../src/research-filters.js";

const papers = [
  { id: "trial", title: "Semaglutide cardiovascular outcomes", abstract: "A randomized clinical trial in adults.", year: 2024, type: "Clinical Trial", journal: "Evidence Journal", citations: 0, openAccess: true },
  { id: "review", title: "Cardiovascular evidence review", abstract: "Semaglutide treatment and safety", year: 2022, type: "review", journal: "Research Reviews", citations: 21 },
  { id: "unknown", title: "Semaglutide cardiovascular trial protocol", year: null, type: "Research paper", journal: "", citations: null },
  { id: "conference", title: "Drug discovery poster", year: 2025, type: "proceedings-article", journal: "Annual Discovery Conference", citations: 4, openAccess: false },
  { id: "journal", title: "Metformin mechanism", year: 2019, type: "journal-article", journal: "Evidence Journal", citations: 100, openAccess: true },
];

test("unfiltered relevance preserves source order, references and metadata without mutating the input", () => {
  const before = structuredClone(papers);
  const result = filterResearchPapers(papers, defaultResearchFilters);
  assert.deepEqual(result, papers);
  assert.notEqual(result, papers);
  assert.equal(result[0], papers[0]);
  assert.deepEqual(papers, before);
  filterResearchPapers(papers, { sort: "newest" });
  assert.deepEqual(papers, before);
});

test("year and citation bounds are inclusive and missing counts are distinct from zero", () => {
  assert.deepEqual(filterResearchPapers(papers, { yearFrom: "2022", yearTo: "2024" }).map((paper) => paper.id), ["trial", "review"]);
  assert.deepEqual(filterResearchPapers(papers, { minCitations: "0", maxCitations: "0" }).map((paper) => paper.id), ["trial"]);
  assert.deepEqual(filterResearchPapers(papers, { minCitations: "4", maxCitations: "21" }).map((paper) => paper.id), ["review", "conference"]);
  assert.deepEqual(filterResearchPapers(papers, { maxCitations: "0" }).map((paper) => paper.id), ["trial"]);
});

test("publication type aliases, venues and OA filters use only supplied metadata", () => {
  assert.deepEqual(filterResearchPapers(papers, { publicationTypes: ["Journal article"] }).map((paper) => paper.id), ["journal"]);
  assert.deepEqual(filterResearchPapers(papers, { publicationTypes: ["Clinical trial", "Review"] }).map((paper) => paper.id), ["trial", "review"]);
  assert.deepEqual(filterResearchPapers(papers, { journals: ["Evidence Journal"] }).map((paper) => paper.id), ["trial", "journal"]);
  assert.deepEqual(filterResearchPapers(papers, { conferences: ["Annual Discovery Conference"] }).map((paper) => paper.id), ["conference"]);
  assert.deepEqual(filterResearchPapers(papers, { journals: ["Annual Discovery Conference"] }), []);
  assert.deepEqual(filterResearchPapers(papers, { openAccess: true }).map((paper) => paper.id), ["trial", "journal"]);
});

test("comma-separated keyword phrases are case insensitive, includes use AND and excludes use OR", () => {
  assert.deepEqual(keywordPhrases(" Semaglutide, semaglutide, cardiovascular outcomes, ,"), ["Semaglutide", "cardiovascular outcomes"]);
  assert.deepEqual(filterResearchPapers(papers, { includeKeywords: "SEMAGLUTIDE, cardiovascular", excludeKeywords: "protocol, poster" }).map((paper) => paper.id), ["trial", "review"]);
  assert.deepEqual(filterResearchPapers(papers, { includeKeywords: "randomized clinical" }).map((paper) => paper.id), ["trial"]);
  assert.deepEqual(filterResearchPapers([{ id: "keywords", keywords: ["Drug Safety"] }], { includeKeywords: "drug safety" }).map((paper) => paper.id), ["keywords"]);
});

test("sort keeps unknown values last in every direction, respects zero and is stable on ties", () => {
  assert.deepEqual(filterResearchPapers(papers, { sort: "newest" }).map((paper) => paper.id), ["conference", "trial", "review", "journal", "unknown"]);
  assert.deepEqual(filterResearchPapers(papers, { sort: "oldest" }).map((paper) => paper.id), ["journal", "review", "trial", "conference", "unknown"]);
  assert.deepEqual(filterResearchPapers(papers, { sort: "citations" }).map((paper) => paper.id), ["journal", "review", "conference", "trial", "unknown"]);
  assert.deepEqual(filterResearchPapers([{ id: "a", citations: 0 }, { id: "b", citations: 0 }, { id: "c", citations: "" }], { sort: "citations" }).map((paper) => paper.id), ["a", "b", "c"]);
});

test("range validation rejects reversed, fractional, negative and invalid values", () => {
  assert.equal(Object.keys(validateResearchFilters({ yearFrom: "2020", yearTo: "2024", minCitations: "0", maxCitations: "0" })).length, 0);
  assert.ok(validateResearchFilters({ yearFrom: "2025", yearTo: "2024" }).yearTo);
  assert.ok(validateResearchFilters({ yearFrom: "999" }).yearFrom);
  assert.ok(validateResearchFilters({ yearTo: String(new Date().getUTCFullYear() + 2) }).yearTo);
  assert.ok(validateResearchFilters({ minCitations: "-1" }).minCitations);
  assert.ok(validateResearchFilters({ maxCitations: "1.5" }).maxCitations);
  assert.ok(validateResearchFilters({ minCitations: "5", maxCitations: "4" }).maxCitations);
  assert.deepEqual(filterResearchPapers(papers, { minCitations: "-1" }), []);
});

test("filter options report real coverage, distinct venues and never invent unknown labels", () => {
  const options = researchFilterOptions(papers);
  assert.deepEqual(options.journals, ["Evidence Journal", "Research Reviews"]);
  assert.deepEqual(options.conferences, ["Annual Discovery Conference"]);
  assert.deepEqual(options.publicationTypes, ["Clinical trial", "Conference paper", "Journal article", "Review"]);
  assert.deepEqual(options.coverage, { total: 5, years: 4, citations: 4, openAccess: 2 });
});

test("summary and removal clear paired fields while preserving other filters and sort", () => {
  const filters = normalizeResearchFilters({ yearFrom: "2020", journals: ["Evidence Journal"], minCitations: "0", sort: "newest", openAccess: true });
  assert.deepEqual(filterSummary(filters).map((item) => item.key), ["years", "journals", "openAccess", "citations"]);
  const removed = removeResearchFilter(filters, "citations");
  assert.equal(removed.minCitations, "");
  assert.equal(removed.maxCitations, "");
  assert.equal(removed.sort, "newest");
  assert.equal(removed.yearFrom, "2020");
  assert.deepEqual(removeResearchFilter(filters, "journals").journals, []);
});
