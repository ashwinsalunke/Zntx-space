import test from "node:test";
import assert from "node:assert/strict";
import {
  crossrefPaper,
  europePaper,
  relevantPassages,
} from "../server/research.js";
import { citation, csv } from "../src/lib.js";

test("PDF answers never invent evidence for an unmatched question", () => {
  const pages = [
    {
      page: 4,
      text: "Researchers recorded biodiversity in twelve protected woodland sites during the summer.",
    },
  ];
  assert.deepEqual(
    relevantPassages(pages, "What does it say about quantum entanglement?"),
    [],
  );
});
test("PDF matches retain the original page and sentence", () => {
  const sentence =
    "The limitation of this approach is its dependence on self-reported measurements.";
  const found = relevantPassages(
    [
      {
        page: 1,
        text: "This is a demonstration document for evaluating a research reading interface.",
      },
      { page: 7, text: sentence },
    ],
    "What limitation is reported?",
  );
  assert.equal(found[0].page, 7);
  assert.equal(found[0].text, sentence);
});
test("missing abstract stays explicitly absent and does not become generated findings", () => {
  const p = crossrefPaper({
    DOI: "10.1234/example",
    title: ["Example study"],
    author: [{ family: "Researcher" }],
    issued: { "date-parts": [[2024]] },
  });
  assert.equal(p.abstract, "");
  assert.equal(p.citations, null);
  assert.equal(p.year, 2024);
  assert.deepEqual(p.authors, ["Researcher"]);
  assert.equal(p.url, "https://doi.org/10.1234/example");
});
test("Europe PMC abstract markup is treated as text", () => {
  const p = europePaper({
    id: "123",
    source: "MED",
    title: "A study",
    pubYear: "2025",
    abstractText: "<h4>Results</h4><p>A &amp; B were studied.</p>",
    citedByCount: 12,
    pmcid: "PMC12345",
  });
  assert.equal(p.abstract, "Results A & B were studied.");
  assert.equal(p.citations, 12);
  assert.equal(p.openAccess, false);
  assert.equal(p.pmcid, "PMC12345");
  assert.equal(p.pmid, "123");
});
test("bibliography exports preserve DOI and separate multiple authors", () => {
  const p = {
    title: "A study",
    authors: ["Alex Smith", "Sam Lee"],
    year: 2024,
    journal: "Research Journal",
    doi: "10.1234/study",
  };
  assert.match(citation(p, "BibTeX"), /Alex Smith and Sam Lee/);
  assert.match(citation(p, "RIS"), /DO  - 10.1234\/study/);
  assert.match(citation(p), /Smith, A\./);
});
test("CSV exports preserve commas, quotations, and multiline abstracts", () => {
  const output = csv([
    {
      title: 'A, "quoted" study',
      authors: ["A B"],
      abstract: "Line one\nLine two",
      doi: "10.1/example",
      citations: 2,
    },
  ]);
  assert.ok(output.includes('"A, ""quoted"" study"'));
  assert.ok(output.includes('"Line one\nLine two"'));
});

test("search result exports keep snippets separate from abstracts and retain original source links", () => {
  const output=csv([{title:"  =Untrusted title",type:"webpage",abstract:"",snippet:"A search preview",url:"https://example.org/original",source:"Google Search via SerpAPI"}]);
  assert.ok(output.includes('"Abstract","Search snippet","Original source URL"'));
  assert.ok(output.includes('"\'  =Untrusted title"'));
  assert.ok(output.includes('"A search preview","https://example.org/original","Google Search via SerpAPI"'));
});
