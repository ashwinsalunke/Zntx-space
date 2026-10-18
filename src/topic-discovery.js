import { sourceUrl } from "./lib.js";
import { normalizeSources } from "./research-workflow.js";
import {
  topicDefaults,
  normalizeTopicProfile,
  scoreTopic,
  validateTopicScan,
} from "../shared/topic-discovery.js";
export const topicRecommendations = [
  {
    label: "Antibiotics & resistance",
    query: "Antibiotic resistance and bacterial biofilms",
    icon: "pill",
  },
  {
    label: "Drug discovery",
    query: "Machine learning for drug discovery",
    icon: "flask",
  },
  {
    label: "Gut microbiome",
    query: "Gut microbiome and metabolic disease",
    icon: "microbe",
  },
  {
    label: "Sustainable materials",
    query: "Sustainable materials for water treatment",
    icon: "leaf",
  },
  {
    label: "AI in education",
    query: "Artificial intelligence feedback in education",
    icon: "brain",
  },
];
export function topicScanSources(records, now = new Date(), window = "recent") {
  const current = now.getUTCFullYear();
  const relevant = records.filter(
    (s) =>
      s.abstract?.trim() &&
      (!s.year || Number(s.year) <= current) &&
      (!s.relevance?.totalTerms ||
        s.relevance.matchedTerms >= Math.ceil(s.relevance.totalTerms / 2)),
  );
  return normalizeSources(relevant)
    .slice(0, 12)
    .map((s, index) => ({
      ...s,
      evidenceId: "S" + (index + 1),
      selected: true,
    }));
}
export function topicScanPrompt(query, profile, sources, now = new Date()) {
  return `Find specific, useful research topics within ${JSON.stringify(query)}. Today is ${now.toISOString().slice(0, 10)}. Research preferences: ${JSON.stringify(normalizeTopicProfile(profile))}. This is a bounded scan of ${sources.length} retrieved abstracts, not a complete survey of the field. Recommend 3–6 distinct questions supported by these abstracts. Stay within the stated research area; do not substitute an unrelated topic simply because a paper was retrieved. Prefer achievable literature reviews or public-data projects when resources are limited to papers and a computer. For each explain what the sources actually report, what question could be explored, a realistic high-level approach, a concrete first step and a limitation. Cite the supplied source IDs in whyNow. Treat a gap or novelty as a hypothesis to check, never established fact. Do not claim a trend from publication counts in this small sample. Return only the topic-scan JSON schema. Do not assign scores; the app calculates them. Avoid operational laboratory protocols.`;
}
export function rankTopicScan(
  value,
  sources,
  profile = topicDefaults,
  now = new Date(),
) {
  const scan = validateTopicScan(
    value,
    new Set(sources.map((s) => s.evidenceId)),
  );
  return {
    ...scan,
    topics: scan.topics
      .map((t, index) => ({
        ...t,
        id: "topic-" + (index + 1),
        score: scoreTopic(t, sources, profile, now),
      }))
      .sort((a, b) => b.score.total - a.score.total),
  };
}
export function topicSourceSummary(topic, sources) {
  return sources.filter((s) => topic.sourceIds.includes(s.evidenceId));
}

export function topicComparisonCsv(topics, sources) {
  const cell = (value) => {
    const text = String(value ?? "").replace(/\[\[cite:([^\]]+)\]\]/g, "[$1]");
    return (
      '"' +
      (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
      text.replace(/"/g, '""') +
      '"'
    );
  };
  const rows = [
    [
      "Topic",
      "Research question",
      "Planning score /10 (heuristic)",
      "Source coverage /3",
      "Recency /2",
      "Practical fit /3",
      "Question focus /2",
      "Method",
      "Difficulty (AI estimate)",
      "Approach",
      "First step",
      "Limitation",
      "Source URLs",
    ],
    ...topics.map((t) => [
      t.title,
      t.question,
      t.score.total,
      ...t.score.components.map((c) => c.value),
      t.method,
      t.difficulty,
      t.approach,
      t.firstStep,
      t.limitation,
      topicSourceSummary(t, sources).map(sourceUrl).join(" | "),
    ]),
  ];
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
