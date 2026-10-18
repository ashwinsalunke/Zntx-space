import test from "node:test";
import assert from "node:assert/strict";
import {
  validateTopicScan,
  scoreTopic,
  normalizeTopicProfile,
  topicDefaults,
} from "../shared/topic-discovery.js";
import {
  topicScanSources,
  rankTopicScan,
  topicScanPrompt,
  topicComparisonCsv,
} from "../src/topic-discovery.js";
import {
  blankNotebook,
  appendTopicToNotebook,
  documentMarkdown,
  notebookExport,
} from "../src/notebooks.js";
import { validateWorkflowOutput } from "../server/workflow-output.js";
const now = new Date("2026-10-18T00:00:00Z");
const sources = Array.from({ length: 5 }, (_, i) => ({
  id: "p" + i,
  evidenceId: "S" + (i + 1),
  title: "Source " + i,
  abstract: "Actual source abstract",
  year: 2025,
  url: "https://example.com/source/" + i,
  selected: true,
}));
const topic = (i = 0) => ({
  title: "Topic " + i,
  question: "Which factors are associated with treatment outcomes?",
  whyNow: "The abstract reports an association [[cite:S1]].",
  approach: "Compare how the studies define outcomes.",
  firstStep: "Create a table of the populations and study methods.",
  limitation: "Abstracts alone cannot establish validity or novelty.",
  method: "review",
  difficulty: "introductory",
});
const scan = () => ({
  summary: "Bounded source-based topic scan [[cite:S1]].",
  topics: [topic(1), topic(2), topic(3)],
});
test("topic scans require specific structured directions and known source identities", () => {
  const available = new Set(sources.map((s) => s.evidenceId));
  assert.equal(validateTopicScan(scan(), available).topics.length, 3);
  const missing = scan();
  missing.topics[0].whyNow = "Uncited claim";
  assert.throws(() => validateTopicScan(missing, available));
  const unknown = scan();
  unknown.topics[0].whyNow = "Claim [[cite:S99]]";
  assert.throws(() => validateTopicScan(unknown, available));
  const duplicate = scan();
  duplicate.topics[1].title = duplicate.topics[0].title;
  assert.throws(() => validateTopicScan(duplicate, available));
  assert.throws(() =>
    validateTopicScan({ ...scan(), topics: [topic()] }, available),
  );
  assert.throws(() =>
    validateTopicScan(
      {
        ...scan(),
        topics: [
          { ...topic(), method: "clinical-treatment" },
          topic(1),
          topic(2),
        ],
      },
      available,
    ),
  );
  assert.equal(
    JSON.parse(validateWorkflowOutput("topic-scan", JSON.stringify(scan())))
      .topics.length,
    3,
  );
});
test("scores are bounded and explain actual coverage, date availability, and selected practical fit", () => {
  const t = { ...topic(), sourceIds: ["S1", "S2", "S3", "S4", "S5"] };
  const good = scoreTopic(t, sources, topicDefaults, now);
  assert.equal(good.total, 10);
  assert.equal(
    good.components.reduce((a, c) => a + c.value, 0),
    good.total,
  );
  const weak = scoreTopic(
    t,
    sources.map((s) => ({ ...s, year: undefined })),
    topicDefaults,
    now,
  );
  assert.equal(weak.components[1].value, 0);
  assert.ok(weak.total < good.total);
  assert.equal(
    scoreTopic(
      t,
      sources.map((s) => ({ ...s, year: 2027 })),
      topicDefaults,
      now,
    ).components[1].value,
    0,
  );
  const experiment = { ...t, method: "experiment", difficulty: "advanced" };
  const mismatch = scoreTopic(experiment, sources, topicDefaults, now),
    match = scoreTopic(
      experiment,
      sources,
      {
        goal: "experiment",
        resources: "lab",
        experience: "advanced",
        time: "year",
      },
      now,
    );
  assert.equal(mismatch.resourceOk, false);
  assert.ok(match.total > mismatch.total);
  assert.equal(match.total, 10);
  assert.match(good.note, /not a scientific quality rating/);
  assert.deepEqual(
    normalizeTopicProfile({ resources: "magic" }),
    topicDefaults,
  );
});
test("scanning excludes missing abstracts and future dates, limits evidence, and retains source URLs", () => {
  const papers = [
    ...sources,
    ...sources.map((s, i) => ({
      ...s,
      id: "old" + i,
      title: "Old source " + i,
      url: "https://example.com/old/" + i,
      year: 2020,
    })),
    {
      id: "future",
      title: "Future",
      abstract: "text",
      year: 2028,
      url: "https://example.com/future",
    },
    { id: "empty", title: "No abstract", url: "https://example.com/empty" },
  ];
  const selected = topicScanSources(papers, now);
  assert.equal(selected.length, 10);
  assert.ok(selected.every((s) => s.abstract && Number(s.year) <= 2026));
  assert.deepEqual(
    selected.map((s) => s.evidenceId),
    selected.map((_, i) => "S" + (i + 1)),
  );
  const ranked = rankTopicScan(scan(), selected, topicDefaults, now);
  assert.equal(ranked.topics.length, 3);
  assert.match(
    topicScanPrompt("antibiotics", {}, selected, now),
    /not a complete survey/,
  );
});
test("appending topics merges sources and remaps every citation without overwriting notebook content", () => {
  const original = {
    ...blankNotebook("Existing"),
    sources: [{ ...sources[0], evidenceId: "S7" }],
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Existing writing" }],
        },
      ],
    },
  };
  const t = {
    ...topic(),
    question: "A sourced question [[cite:S2]]?",
    approach: "Approach [[cite:S1]].",
    sourceIds: ["S1", "S2"],
    score: { total: 8.5 },
  };
  const next = appendTopicToNotebook(original, t, sources);
  assert.equal(original.sources.length, 1);
  assert.equal(next.sources.length, 2);
  assert.equal(next.sources[1].evidenceId, "S8");
  const text = documentMarkdown(next.document);
  assert.match(text, /Existing writing/);
  assert.match(text, /\[\[cite:S7\]\]/);
  assert.match(text, /\[\[cite:S8\]\]/);
  assert.doesNotMatch(text, /\[\[cite:S2\]\]/);
  assert.match(
    notebookExport(next.document, next.sources),
    /https:\/\/example.com\/source\/1/,
  );
  assert.throws(() => appendTopicToNotebook(original, t, []), /missing/);
});

test("topic CSV keeps score factors and source URLs while neutralizing spreadsheet formulas", () => {
  const t = {
    ...topic(),
    title: '=HYPERLINK("https://example.invalid")',
    sourceIds: ["S1"],
  };
  t.score = scoreTopic(t, sources, topicDefaults, now);
  const csv = topicComparisonCsv([t], sources);
  assert.match(csv, /Practical fit \/3/);
  assert.ok(csv.includes('"\'=HYPERLINK(""'));
  assert.ok(csv.includes("https://example.com/source/0"));
  assert.ok(csv.startsWith("\uFEFF"));
});
