import test from "node:test";
import assert from "node:assert/strict";
import { researchTableCsv, runTableExtractionQueue, tableCellKey, tableExtractionRequest, tableMetadata, tablePaperKey, validateTableColumn } from "../src/research-table.js";
import { validateAiRequest } from "../server/ai.js";

test("custom cell requests fit the live AI contract and are restricted to one supplied source", () => {
  const request = tableExtractionRequest({ id: "paper", title: "A trial", abstract: "Results ".repeat(2500), doi: "10.1234/example" }, { id: "column", name: "Sample size", instruction: "Extract the number enrolled." });
  assert.equal(request.task, "explain");
  assert.equal(request.evidence.length, 1);
  assert.equal(request.evidence[0].id, "1");
  assert.equal(request.evidence[0].abstract.length, 12000);
  assert.match(request.prompt, /Not reported in the supplied abstract/);
  assert.match(request.prompt, /Do not use outside knowledge/);
  assert.doesNotThrow(() => validateAiRequest(request));
});

test("cell caching separates columns, stable paper identifiers and changed source text", () => {
  const paper = { id: "stable", title: "Source", abstract: "Evidence" };
  assert.equal(tablePaperKey(paper), tablePaperKey({ ...paper }));
  assert.notEqual(tablePaperKey(paper), tablePaperKey({ ...paper, abstract: "New evidence" }));
  assert.notEqual(tableCellKey(paper, { id: "a" }), tableCellKey(paper, { id: "b" }));
});

test("metadata preserves zero citations and never treats unverified access as closed", () => {
  assert.equal(tableMetadata({ citations: 0 }, "citations"), "0");
  assert.equal(tableMetadata({ citations: null }, "citations"), "");
  assert.equal(tableMetadata({ citations: false }, "citations"), "");
  assert.equal(tableMetadata({ year: 0 }, "year"), "");
  assert.equal(tableMetadata({ openAccess: false }, "access"), "");
  assert.equal(tableMetadata({ openAccess: true }, "access"), "Open access");
  assert.equal(tableMetadata({ authors: ["A", "B"] }, "authors"), "A; B");
});

test("column creation rejects duplicate names, oversized instructions and excess columns", () => {
  assert.match(validateTableColumn("", ""), /name/);
  assert.match(validateTableColumn("  DOI  ", ""), /already used/);
  assert.match(validateTableColumn("population", "", [{ name: "Population" }]), /already used/);
  assert.match(validateTableColumn("Population", "x".repeat(1001)), /1,000/);
  assert.match(validateTableColumn("Next", "", Array.from({ length: 6 }, (_, index) => ({ name: `Field ${index}` }))), /six/);
  assert.equal(validateTableColumn("Study population", "Extract only the stated population."), "");
});

test("CSV includes extracted values and original links while escaping quotes and formula prefixes", () => {
  const paper = { id: "source", title: "  =HYPERLINK(\"unsafe\")", abstract: "An abstract", doi: "10.1234/source", citations: 0 };
  const column = { id: "column", name: "=Custom header" };
  const cells = { [tableCellKey(paper, column)]: { status: "done", text: "24 adults [[cite:1]]", citations: [{ id: "1", title: "Source", url: "https://doi.org/10.1234/source" }] } };
  const output = researchTableCsv([paper], ["doi"], [column], cells);
  assert.match(output, /"'=Custom header"/);
  assert.match(output, /"'=HYPERLINK\(""unsafe""\)"/);
  assert.match(output, /24 adults \[1\]/);
  assert.match(output, /Sources: \[1\] Source — https:\/\/doi.org\/10.1234\/source/);
  assert.match(output, /Original source URL/);
  assert.match(output, /"0"/);
  assert.doesNotMatch(output, /\[\[cite:/);
});

test("extraction queue runs at most two workers and stops scheduling after cancellation", async () => {
  let active = 0, peak = 0;
  const completed = [];
  await runTableExtractionQueue([1, 2, 3, 4, 5], async (item) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    completed.push(item); active -= 1;
  });
  assert.equal(peak, 2);
  assert.deepEqual(completed.sort(), [1, 2, 3, 4, 5]);
  const controller = new AbortController();
  const started = [];
  await runTableExtractionQueue([1, 2, 3, 4], async (item) => { started.push(item); controller.abort(); }, controller.signal);
  assert.deepEqual(started, [1]);
});
