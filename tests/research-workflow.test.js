import test from "node:test";
import assert from "node:assert/strict";
import {
  newWorkflow,
  normalizeSources,
  selectInitialSources,
  parsePlan,
  parsePaper,
  parseSlides,
  paperDocument,
  documentMarkdown,
  referenceText,
  reviewWorkflow,
  prepareEvidence,
  evidenceFor,
  markdownNodes,
  citationIds,
  paperPrompt,
  slidesPrompt,
} from "../src/research-workflow.js";

const sources = () =>
  normalizeSources([
    {
      id: "study-a",
      title: "A cardiovascular study",
      abstract:
        "The trial reported a difference in its cardiovascular endpoint, with uncertainty.",
      doi: "10.1234/study-a",
      authors: ["J Smith"],
      year: 2024,
    },
    {
      id: "study-b",
      title: "A contrasting study",
      abstract: "A population difference limits comparison.",
      pmcid: "PMC123",
      openAccess: true,
    },
  ]).map((s) => ({ ...s, selected: true }));

test("workflow sources retain provenance, deduplicate DOI records, and do not invent abstracts", () => {
  const result = normalizeSources([
    { id: "1", title: "Original", doi: "10.1234/same" },
    { id: "2", title: "Duplicate", doi: "10.1234/same" },
    { id: "3", title: "Metadata record", url: "javascript:alert(1)" },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[1].evidenceId, "S2");
  assert.equal(result[1].abstract, "");
  assert.equal(result[1].coverage, "metadata");
  assert.equal(result[1].url, "");
});

test("AI paper parsing rejects missing, fabricated, malformed, or unbounded citations before replacing a draft", () => {
  const paper = {
    title: "Review",
    sections: [
      { heading: "Findings", content: "One reported finding [[cite:S1]]." },
      { heading: "Limitations", content: "Further work is needed." },
    ],
  };
  assert.equal(parsePaper(JSON.stringify(paper), sources()).sections.length, 2);
  assert.throws(
    () =>
      parsePaper(JSON.stringify(paper).replace("S1", "invented"), sources()),
    /outside/,
  );
  assert.throws(
    () =>
      parsePaper(JSON.stringify(paper).replace("[[cite:S1]]", ""), sources()),
    /did not cite/,
  );
  assert.throws(
    () => parsePaper('{"title":"Truncated', sources()),
    /incomplete/,
  );
  assert.throws(
    () =>
      parsePaper(
        JSON.stringify({
          ...paper,
          sections: [
            { heading: "References", content: "Invented bibliography" },
            ...paper.sections,
          ],
        }),
        sources(),
      ),
    /invalid section/,
  );
});

test("automatic selection includes accessible full texts without changing stable source numbers", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({
    title: `Study ${i}`,
    evidenceId: `S${i + 1}`,
    abstract: "Available abstract",
    ...(i > 9 ? { openAccess: true, pmcid: `PMC${i}` } : {}),
  }));
  const selected = selectInitialSources(items);
  assert.equal(selected.filter((s) => s.selected).length, 8);
  assert.equal(selected.filter((s) => s.selected && s.pmcid).length, 2);
  assert.equal(selected[10].evidenceId, "S11");
});

test("generation prompts use the exact sparse evidence IDs without inventing a first source", () => {
  const records = normalizeSources(
    Array.from({ length: 7 }, (_, index) => ({
      title: `Source ${index + 1}`,
      ...(index === 0
        ? { snippet: "A Scholar search description, not a study abstract." }
        : { abstract: "A supplied study abstract." }),
    })),
  ).map((source) => ({
    ...source,
    selected: ["S2", "S7"].includes(source.evidenceId),
  }));
  const state = newWorkflow({ topic: "Research evidence", sources: records });
  assert.deepEqual(
    evidenceFor(records).map((source) => source.id),
    ["S2", "S7"],
  );
  assert.equal(records[0].abstract, "");
  assert.equal(records[0].coverage, "metadata");
  for (const prompt of [paperPrompt(state), slidesPrompt(state)]) {
    assert.match(
      prompt,
      /Allowed source identifiers for this request: S2, S7\./,
    );
    assert.deepEqual(citationIds(prompt), ["S2"]);
    assert.ok(!prompt.includes("[[cite:S1]]"));
    const example = JSON.parse(
      prompt.match(/Return only JSON (\{.+?\})\./s)[1],
    );
    assert.ok(example.sections || example.slides);
    assert.ok(
      citationIds(JSON.stringify(example)).every((id) =>
        ["S2", "S7"].includes(id),
      ),
    );
  }
  assert.deepEqual(
    records.map((source) => source.evidenceId),
    ["S1", "S2", "S3", "S4", "S5", "S6", "S7"],
  );
});

test("slide context omits entire paragraphs containing deselected or unsent source citations", () => {
  const records = normalizeSources(
    Array.from({ length: 14 }, (_, index) => ({
      title: `Study ${index + 1}`,
      abstract: "A supplied study abstract.",
    })),
  ).map((source) => ({ ...source, selected: source.evidenceId !== "S1" }));
  const state = newWorkflow({
    sources: records,
    document: paperDocument([
      {
        heading: "Current draft",
        content:
          "Current evidence [[cite:S2]].\n\nDeselected evidence must disappear [[cite:S1]].\n\nA mixed paragraph must disappear [[cite:S2]] and [[cite:S1]].\n\nAn unsent source must disappear [[cite:S14]].\n\nA single-bracket stale citation must disappear [cite:S1].\n\nAnother supported finding [[cite:S7]].",
      },
    ]),
  });
  const prompt = slidesPrompt(state);
  assert.equal(evidenceFor(records).length, 12);
  assert.match(prompt, /Current evidence \[\[cite:S2\]\]/);
  assert.match(prompt, /Another supported finding \[\[cite:S7\]\]/);
  assert.ok(!prompt.includes("must disappear"));
  assert.deepEqual(citationIds(prompt), ["S2", "S7"]);
  assert.ok(!paperPrompt(state).includes('"id":"S14"'));
});

test("generation prompt examples contain no citation placeholders without supplied evidence", () => {
  const state = newWorkflow();
  for (const prompt of [paperPrompt(state), slidesPrompt(state)]) {
    assert.match(prompt, /No source identifiers are available/);
    assert.deepEqual(citationIds(prompt), []);
  }
});

test("planning does not masquerade as evidence and keeps the chosen template structure", () => {
  const state = newWorkflow({
    topic: "Clinical evidence",
    templateId: "research-proposal",
  });
  const result = parsePlan(
    '```json\n{"query":"clinical evidence","title":"Proposed review"}\n```',
    state,
  );
  assert.ok(result.outline.some((s) => s.heading === "Proposed methods"));
  assert.throws(() => parsePlan('{"query":""}', state), /valid query/);
});

test("document editing round-trips headings, lists, tables, bold text, and stable citation nodes", () => {
  const doc = paperDocument([
    {
      heading: "Findings",
      content:
        "A **reported result** [[cite:S2]].\n\n- One\n- Two\n\n| Study | Outcome |\n| --- | --- |\n| A | Uncertain |",
    },
  ]);
  const output = documentMarkdown(doc);
  assert.match(output, /## Findings/);
  assert.match(output, /\*\*reported result\*\*/);
  assert.match(output, /\[\[cite:S2\]\]/);
  assert.match(output, /- One\n- Two/);
  assert.match(output, /\| A \| Uncertain \|/);
  assert.ok(doc.content.some((n) => n.type === "table"));
  assert.equal(
    markdownNodes("<script>unsafe()</script>")[0].content[0].type,
    "text",
  );
});

test("exports preserve nonconsecutive citation numbers and include only actual cited records", () => {
  const records = sources();
  records[1].evidenceId = "S9";
  const result = referenceText("Evidence [[cite:S9]].", records);
  assert.equal(result.content, "Evidence [9].");
  assert.match(result.references, /\[9\]/);
  assert.equal(result.used.length, 1);
  assert.ok(!result.references.includes("cardiovascular"));
});

test("review catches orphaned citations and citations to deselected evidence", () => {
  const records = sources();
  records[1].selected = false;
  const state = newWorkflow({
    sources: records,
    document: paperDocument([
      { heading: "Review", content: "Finding [[cite:S2]] and [[cite:S99]]." },
    ]),
  });
  const review = reviewWorkflow(state);
  assert.deepEqual(review.invalid, ["S99"]);
  assert.deepEqual(review.excluded, ["S2", "S99"]);
});

test("full-text reading preserves abstracts on failures and prioritizes findings over a long introduction", async () => {
  const state = newWorkflow({ sources: sources() });
  const full = await prepareEvidence(state, {
    readFullText: async () => ({
      text: "Raw full text",
      sections: [
        { title: "Introduction", text: "intro ".repeat(2000) },
        { title: "Results", text: "Actual reported findings." },
        { title: "Methods", text: "Observed methods." },
      ],
      license: { text: "Example license" },
    }),
  });
  assert.equal(full[1].coverage, "full-text-excerpts");
  assert.ok(
    full[1].evidenceText.indexOf("Actual reported findings") <
      full[1].evidenceText.indexOf("intro "),
  );
  assert.equal(full[0].coverage, "abstract");
  assert.ok(evidenceFor(full)[1].abstract.length <= 6500);
  const failed = await prepareEvidence(state, {
    readFullText: async () => {
      throw new Error("Unavailable");
    },
  });
  assert.equal(failed[1].coverage, "abstract");
  assert.match(failed[1].readError, /unavailable/);
  assert.equal(failed[1].abstract, state.sources[1].abstract);
});

test("cancelled source reads cannot update project evidence, and metadata-only generation stops", async () => {
  const control = new AbortController();
  let updates = 0;
  await assert.rejects(
    prepareEvidence(newWorkflow({ sources: sources() }), {
      signal: control.signal,
      readFullText: async () => {
        control.abort();
        return { text: "Late output" };
      },
      onSource: () => updates++,
    }),
    /abort/i,
  );
  assert.equal(updates, 0);
  await assert.rejects(
    prepareEvidence(
      newWorkflow({
        sources: normalizeSources([{ title: "Only metadata" }]).map((s) => ({
          ...s,
          selected: true,
        })),
      }),
      { readFullText: async () => ({}) },
    ),
    /metadata only/,
  );
});

test("slide parser preserves notes and layouts and rejects invented source identifiers", () => {
  const slides = {
    slides: [
      {
        title: "Question",
        content: "Study evidence [[cite:S1]].",
        notes: "Caveat [[cite:S2]].",
        layout: "title",
      },
      {
        title: "Comparison",
        content: "More evidence.",
        notes: "Review the source.",
        layout: "two-column",
      },
    ],
  };
  const value = parseSlides(JSON.stringify(slides), sources());
  assert.equal(value[1].layout, "two-column");
  assert.match(value[0].notes, /S2/);
  assert.throws(
    () => parseSlides(JSON.stringify(slides).replace("S2", "S77"), sources()),
    /outside/,
  );
});
