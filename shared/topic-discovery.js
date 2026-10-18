// Scores compare planning options within a bounded source scan. They are not
// probabilities, validated scientific-quality ratings, or proof of novelty.
export const topicDefaults = Object.freeze({
  goal: "review",
  experience: "beginner",
  time: "month",
  resources: "literature",
  focus: "balanced",
});
export const topicChoices = {
  goal: [
    ["review", "Literature review"],
    ["secondary", "Analyze existing data"],
    ["experiment", "Plan an experiment"],
  ],
  experience: [
    ["beginner", "Getting started"],
    ["intermediate", "Some research experience"],
    ["advanced", "Experienced researcher"],
  ],
  time: [
    ["month", "Up to a month"],
    ["term", "One semester"],
    ["year", "Six months or more"],
  ],
  resources: [
    ["literature", "Papers and a computer"],
    ["data", "Public datasets and coding"],
    ["lab", "Access to a supervised lab"],
  ],
  focus: [
    ["balanced", "A practical starting point"],
    ["recent", "Recent work"],
    ["gaps", "Questions worth investigating"],
  ],
};
export const normalizeTopicProfile = (value) =>
  Object.fromEntries(
    Object.entries(topicDefaults).map(([key, fallback]) => [
      key,
      topicChoices[key].some(([id]) => id === value?.[key])
        ? value[key]
        : fallback,
    ]),
  );
const text = { type: "string" };
export const TOPIC_SCAN_SCHEMA = {
  type: "object",
  properties: {
    summary: text,
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: text,
          question: text,
          whyNow: text,
          approach: text,
          firstStep: text,
          limitation: text,
          method: {
            type: "string",
            enum: ["review", "secondary", "experiment"],
          },
          difficulty: {
            type: "string",
            enum: ["introductory", "intermediate", "advanced"],
          },
        },
        required: [
          "title",
          "question",
          "whyNow",
          "approach",
          "firstStep",
          "limitation",
          "method",
          "difficulty",
        ],
      },
    },
  },
  required: ["summary", "topics"],
};
export const sourceMarkers = (value) => [
  ...new Set(
    [...String(value).matchAll(/\[\[cite:([^\]\r\n]+)\]\]/g)].map((m) => m[1]),
  ),
];
export function validateTopicScan(value, available) {
  const fail = () => {
    throw Error(
      "The topic scan was incomplete or used an unavailable source. Please try again.",
    );
  };
  const valid = (s, max) =>
    typeof s === "string" && s.trim().length > 0 && s.length <= max;
  if (
    !value ||
    !valid(value.summary, 5000) ||
    !Array.isArray(value.topics) ||
    value.topics.length < 3 ||
    value.topics.length > 6
  )
    fail();
  const titles = new Set();
  const topics = value.topics.map((t) => {
    if (
      !t ||
      !["review", "secondary", "experiment"].includes(t.method) ||
      !["introductory", "intermediate", "advanced"].includes(t.difficulty)
    )
      fail();
    const item = {};
    for (const [key, max] of [
      ["title", 180],
      ["question", 600],
      ["whyNow", 1800],
      ["approach", 1400],
      ["firstStep", 800],
      ["limitation", 900],
    ]) {
      if (!valid(t[key], max)) fail();
      item[key] = t[key].trim();
    }
    if (titles.has(item.title.toLowerCase())) fail();
    titles.add(item.title.toLowerCase());
    const sourceIds = sourceMarkers(JSON.stringify(item));
    if (
      !sourceMarkers(item.whyNow).length ||
      !sourceIds.length ||
      (available && sourceIds.some((id) => !available.has(id)))
    )
      fail();
    return { ...item, method: t.method, difficulty: t.difficulty, sourceIds };
  });
  if (
    available &&
    sourceMarkers(value.summary).some((id) => !available.has(id))
  )
    fail();
  return { summary: value.summary.trim(), topics };
}
export function scoreTopic(
  topic,
  sources,
  profile = topicDefaults,
  now = new Date(),
) {
  const p = normalizeTopicProfile(profile),
    ids = new Set(topic.sourceIds),
    linked = sources.filter((s) => ids.has(s.evidenceId));
  const supported = linked.filter(
    (s) => s.abstract?.trim() || s.evidenceText?.trim(),
  );
  const currentYear = now.getUTCFullYear(),
    recent = supported.filter(
      (s) => Number(s.year) >= currentYear - 3 && Number(s.year) <= currentYear,
    );
  const evidence = Math.min(3, supported.length * 0.75);
  const recency = supported.length
    ? Math.round(((2 * recent.length) / supported.length) * 10) / 10
    : 0;
  const resourceOk =
    topic.method === "review" ||
    (topic.method === "secondary" && ["data", "lab"].includes(p.resources)) ||
    (topic.method === "experiment" && p.resources === "lab");
  const difficulty = { introductory: 0, intermediate: 1, advanced: 2 }[
      topic.difficulty
    ],
    skill = { beginner: 0, intermediate: 1, advanced: 2 }[p.experience];
  const goalMatches = topic.method === p.goal;
  let feasibility =
    (resourceOk ? 1.25 : 0) +
    (difficulty <= skill ? 1 : 0.4) +
    (goalMatches ? 0.25 : 0) +
    (p.time !== "month" || (topic.method === "review" && difficulty < 2)
      ? 0.5
      : 0);
  const clarity =
    topic.question.trim().length >= 25 && topic.firstStep.trim().length >= 20
      ? 2
      : 1;
  const components = [
    {
      label: "Source coverage",
      value: evidence,
      max: 3,
      reason: `${supported.length} cited ${supported.length === 1 ? "abstract" : "abstracts"} available.`,
    },
    {
      label: "Recent evidence",
      value: recency,
      max: 2,
      reason: `${recent.length} of ${supported.length} cited sources dated ${currentYear - 3}–${currentYear}. Missing years do not count as recent.`,
    },
    {
      label: "Practical fit",
      value: feasibility,
      max: 3,
      reason: resourceOk
        ? "The proposed method fits your selected resources; your goal, experience, and timeframe also affect the score."
        : "The proposed method needs resources beyond your selection.",
    },
    {
      label: "Question focus",
      value: clarity,
      max: 2,
      reason:
        "Basic completeness check: the question has at least 25 characters and the first step at least 20. This does not judge scientific merit.",
    },
  ];
  const total =
    Math.round(
      Math.min(
        10,
        components.reduce((sum, c) => sum + c.value, 0),
      ) * 10,
    ) / 10;
  return {
    total,
    components,
    resourceOk,
    label: "Planning score",
    note: "A transparent heuristic for this scan, not a scientific quality rating or proof of novelty.",
  };
}
