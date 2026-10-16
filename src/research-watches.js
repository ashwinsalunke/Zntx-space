export const watchKinds = [
  { id: "literature", label: "Literature watch", source: "PubMed", limit: 20, description: "Revisit a PubMed query and compare the returned papers.", example: "semaglutide cardiovascular outcomes", suggestedTitle: "Cardiovascular literature", color: "blue" },
  { id: "trials", label: "Trial status watch", source: "ClinicalTrials.gov", limit: 20, description: "Check recruitment, enrollment, dates, and registry updates.", example: "semaglutide obesity", suggestedTitle: "Semaglutide trial updates", color: "violet" },
  { id: "datasets", label: "Dataset watch", source: "DataCite", limit: 30, description: "Compare dataset DOI records and version metadata.", example: "drug discovery", suggestedTitle: "Drug discovery datasets", color: "amber" },
];

export function watchDefinition(kind) {
  const definition = watchKinds.find((item) => item.id === kind);
  if (!definition) throw new Error("Choose a supported research watch.");
  return definition;
}

export function watchTemplateKind(template) {
  const templates = { "literature-watch": "literature", "trial-watch": "trials", "dataset-watch": "datasets", "reading-review": "literature" };
  return Object.hasOwn(templates, template) ? templates[template] : null;
}

const text = (value, limit = 2000) => String(value ?? "").trim().slice(0, limit);
const timestamp = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A valid check time is required.");
  return date.toISOString();
};
const safeUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
};
const doiValue = (value) => text(value, 512).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").toLowerCase();
const validDoi = (value) => /^10\.\d{4,9}\/\S+$/i.test(value);

export function createResearchWatch(input, now = new Date().toISOString()) {
  watchDefinition(input.kind);
  const title = text(input.title, 121);
  const query = text(input.query, 301);
  if (!title || title.length > 120) throw new Error("Use a watch name between 1 and 120 characters.");
  if (!query || query.length > 300 || /[\u0000-\u001f\u007f]/.test(query)) throw new Error("Use a search query between 1 and 300 characters, without control characters.");
  if (!input.id || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)) throw new Error("A valid watch ID is required.");
  return { id: input.id, type: "research-watch", title, kind: input.kind, query, saveDigest: input.saveDigest === true, createdAt: timestamp(now), snapshot: null, lastCheck: null };
}

export function watchEndpoint(kind, query) {
  watchDefinition(kind);
  const params = new URLSearchParams({ q: query });
  return kind === "datasets" ? `/api/sources/search?source=datasets&${params}` : `/api/biomedical/${kind === "literature" ? "pubmed" : "trials"}?${params}`;
}

function normalizeRecord(kind, record) {
  if (!record || typeof record !== "object") return null;
  let id;
  const doi = doiValue(record.doi);
  if (kind === "literature") {
    const pmid = text(record.pmid || text(record.id).replace(/^pubmed-/, ""), 100);
    if (!/^\d+$/.test(pmid)) return null;
    id = `pubmed-${pmid}`;
  } else if (kind === "trials") {
    id = text(record.id || record.nctId, 100).toUpperCase();
    if (!/^NCT\d{8}$/.test(id)) return null;
  } else {
    if (!validDoi(doi)) return null;
    id = `datacite-${doi}`;
  }
  const title = text(record.title, 1000);
  if (!title) return null;
  const fallback = kind === "literature" ? `https://pubmed.ncbi.nlm.nih.gov/${id.replace("pubmed-", "")}/` : kind === "trials" ? `https://clinicaltrials.gov/study/${id}` : `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`;
  const fields = kind === "trials" ? {
    "Recruitment status": text(record.status, 100) || "UNKNOWN",
    "Enrollment": record.enrollment == null ? "Not reported" : text(record.enrollment, 100),
    "Completion date": text(record.completionDate, 100) || "Not reported",
    "Last registry update": text(record.lastUpdated, 100) || "Not reported",
    "Results posted": record.hasResults === true ? "Yes" : "No",
    "Phase": (Array.isArray(record.phases) ? record.phases : []).map((p) => text(p, 100)).sort().join(", ") || "Not reported",
  } : kind === "datasets" ? {
    "Title": title, "Year": text(record.year, 20), "Version": text(record.version, 100), "Publisher": text(record.publisher, 500),
  } : { "Title": title, "Year": text(record.year, 20), "Journal": text(record.journal, 500), "DOI": validDoi(doi) ? doi : "" };
  return { id, title, url: safeUrl(record.url) || fallback, source: watchDefinition(kind).source, year: record.year || null, fields };
}

export function makeWatchSnapshot(kind, response, now = new Date().toISOString()) {
  const definition = watchDefinition(kind);
  if (!Array.isArray(response?.results)) throw new Error("The source did not return a readable result page. Your previous check is unchanged.");
  const unique = new Map();
  const supplied = response.results.slice(0, definition.limit);
  for (const record of supplied) {
    const normalized = normalizeRecord(kind, record);
    if (normalized && !unique.has(normalized.id)) unique.set(normalized.id, normalized);
  }
  if (supplied.length && !unique.size) throw new Error("The source returned no usable record identifiers. Your previous check is unchanged.");
  const records = [...unique.values()];
  const total = Number(response.total);
  const warnings = (Array.isArray(response.warnings) ? response.warnings : []).map((warning) => text(warning, 1000)).filter(Boolean).slice(0, 5);
  if (supplied.length > records.length) warnings.push("Some records were duplicate or lacked usable identifiers and were not tracked.");
  return { checkedAt: timestamp(now), retrievedAt: Number.isFinite(Date.parse(response.retrievedAt)) ? new Date(response.retrievedAt).toISOString() : timestamp(now), source: definition.source, total: Number.isFinite(total) && total >= 0 ? total : records.length, limit: definition.limit, records, warnings };
}

export function compareWatchSnapshots(previous, next) {
  if (!next || !Array.isArray(next.records)) throw new Error("A successful result page is required before comparison.");
  if (!previous) return { isBaseline: true, newRecords: [], changedRecords: [], unchangedCount: 0, notReturnedCount: 0, baselineCount: next.records.length };
  const before = new Map(previous.records.map((record) => [record.id, record]));
  const after = new Set(next.records.map((record) => record.id));
  const newRecords = [];
  const changedRecords = [];
  let unchangedCount = 0;
  for (const record of next.records) {
    const old = before.get(record.id);
    if (!old) { newRecords.push(record); continue; }
    const changes = Object.keys(record.fields).filter((field) => record.fields[field] !== old.fields?.[field]).map((field) => ({ field, before: old.fields?.[field] || "Not reported", after: record.fields[field] || "Not reported" }));
    if (changes.length) changedRecords.push({ ...record, changes });
    else unchangedCount++;
  }
  return { isBaseline: false, newRecords, changedRecords, unchangedCount, notReturnedCount: previous.records.filter((record) => !after.has(record.id)).length, baselineCount: 0, comparedAt: previous.checkedAt };
}

export function applyWatchResponse(watch, response, now = new Date().toISOString()) {
  const snapshot = makeWatchSnapshot(watch.kind, response, now);
  return { ...watch, snapshot, lastCheck: compareWatchSnapshots(watch.snapshot, snapshot) };
}

export function watchDigest(watch) {
  const snapshot = watch.snapshot;
  const check = watch.lastCheck;
  if (!snapshot || !check) throw new Error("Run a successful check before saving a digest.");
  const records = check.isBaseline ? snapshot.records : [...check.newRecords, ...check.changedRecords];
  const lines = [
    watch.title,
    `Query: ${watch.query}`,
    `Source: ${snapshot.source}`,
    `Checked: ${snapshot.checkedAt}`,
    check.isBaseline ? `Initial baseline: ${snapshot.records.length} returned records. This is not a count of new publications.` : `Compared with ${check.comparedAt}: ${check.newRecords.length} newly seen records; ${check.changedRecords.length} metadata changes.`,
    `Coverage: only the returned page, up to ${snapshot.limit} records, of ${snapshot.total} reported source matches. Ranking changes can make older records appear newly seen. Records outside the page are not inferred to be deleted or withdrawn.`,
    "Runs on demand. No background schedule or notification service is active.",
    "",
    ...records.flatMap((record, index) => [
      `[${index + 1}] ${record.title}`,
      record.url,
      ...(record.changes || []).map((change) => `${change.field}: ${change.before} → ${change.after}`),
      "",
    ]),
    ...snapshot.warnings,
  ];
  if (!records.length && !check.isBaseline) lines.push("No newly seen or changed records were found within the compared pages.");
  return { title: `${watch.title} — ${check.isBaseline ? "baseline" : "check"} ${snapshot.checkedAt.slice(0, 10)}`, content: lines.join("\n"), citations: records.map((record) => ({ title: record.title, url: record.url })), sourceTitle: snapshot.source, watchId: watch.id };
}
