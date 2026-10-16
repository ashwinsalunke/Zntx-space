// These refinements operate on returned records, never on unseen database matches.
export const defaultResearchFilters = Object.freeze({
  yearFrom: "",
  yearTo: "",
  publicationTypes: Object.freeze([]),
  journals: Object.freeze([]),
  conferences: Object.freeze([]),
  includeKeywords: "",
  excludeKeywords: "",
  openAccess: false,
  minCitations: "",
  maxCitations: "",
  sort: "relevance",
});

const text = (value) => String(value ?? "").normalize("NFKC").trim();
const key = (value) => text(value).toLocaleLowerCase("en");
const unique = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};
const list = (value) => unique((Array.isArray(value) ? value : []).map(text).filter(Boolean));
const numericValue = (value) => {
  if (value == null || text(value) === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
const paperYear = (value) => {
  const year = numericValue(value);
  return year != null && year >= 1000 && year <= 9999 ? year : null;
};

export function normalizeResearchFilters(value = {}) {
  return {
    yearFrom: text(value.yearFrom),
    yearTo: text(value.yearTo),
    publicationTypes: list(value.publicationTypes),
    journals: list(value.journals),
    conferences: list(value.conferences),
    includeKeywords: text(value.includeKeywords),
    excludeKeywords: text(value.excludeKeywords),
    openAccess: value.openAccess === true,
    minCitations: text(value.minCitations),
    maxCitations: text(value.maxCitations),
    sort: ["relevance", "newest", "oldest", "citations"].includes(value.sort) ? value.sort : "relevance",
  };
}

export function keywordPhrases(value) {
  return unique(text(value).split(",").map((part) => part.trim()).filter(Boolean));
}

export function validateResearchFilters(value = {}) {
  const filters = normalizeResearchFilters(value);
  const errors = {};
  const lastYear = new Date().getUTCFullYear() + 1;
  for (const field of ["yearFrom", "yearTo"]) {
    if (filters[field] && (!/^\d{4}$/.test(filters[field]) || Number(filters[field]) < 1000 || Number(filters[field]) > lastYear)) {
      errors[field] = `Enter a year between 1000 and ${lastYear}.`;
    }
  }
  if (!errors.yearFrom && !errors.yearTo && filters.yearFrom && filters.yearTo && Number(filters.yearFrom) > Number(filters.yearTo)) {
    errors.yearTo = "The end year must be the same as or later than the start year.";
  }
  for (const field of ["minCitations", "maxCitations"]) {
    if (filters[field] && (!/^\d+$/.test(filters[field]) || numericValue(filters[field]) == null)) {
      errors[field] = "Enter a whole number of zero or more.";
    }
  }
  if (!errors.minCitations && !errors.maxCitations && filters.minCitations && filters.maxCitations && Number(filters.minCitations) > Number(filters.maxCitations)) {
    errors.maxCitations = "The maximum must be the same as or greater than the minimum.";
  }
  return errors;
}

export function publicationTypesForPaper(paper) {
  const types = Array.isArray(paper.publicationTypes) ? paper.publicationTypes : [paper.type];
  return unique(types.map((value) => {
    const normalized = key(value).replace(/[-_]+/g, " ").replace(/\s+/g, " ");
    if (!normalized || ["research paper", "paper", "unknown"].includes(normalized)) return "";
    if (["journal article", "article"].includes(normalized)) return "Journal article";
    if (["proceedings article", "conference paper", "conference proceeding", "conference proceedings"].includes(normalized)) return "Conference paper";
    if (["review", "review article"].includes(normalized)) return "Review";
    return normalized[0].toLocaleUpperCase("en") + normalized.slice(1);
  }));
}

export function conferenceForPaper(paper) {
  const explicit = paper.conference?.name || (typeof paper.conference === "string" ? paper.conference : "") || paper.event?.name;
  return text(explicit || (publicationTypesForPaper(paper).includes("Conference paper") ? paper.journal : ""));
}

export function journalForPaper(paper) {
  return publicationTypesForPaper(paper).includes("Conference paper") ? "" : text(paper.journal);
}

export function researchFilterOptions(papers = []) {
  const records = Array.isArray(papers) ? papers : [];
  const options = (values) => unique(values).sort((a, b) => a.localeCompare(b));
  return {
    publicationTypes: options(records.flatMap(publicationTypesForPaper)),
    journals: options(records.map(journalForPaper)),
    conferences: options(records.map(conferenceForPaper)),
    coverage: {
      total: records.length,
      years: records.filter((paper) => paperYear(paper.year) != null).length,
      citations: records.filter((paper) => numericValue(paper.citations) != null).length,
      openAccess: records.filter((paper) => paper.openAccess === true).length,
    },
  };
}

export function filterResearchPapers(papers = [], value = {}) {
  const filters = normalizeResearchFilters(value);
  if (Object.keys(validateResearchFilters(filters)).length) return [];
  const include = keywordPhrases(filters.includeKeywords).map(key);
  const exclude = keywordPhrases(filters.excludeKeywords).map(key);
  const selectedTypes = filters.publicationTypes.map(key);
  const journals = filters.journals.map(key);
  const conferences = filters.conferences.map(key);
  const filtered = (Array.isArray(papers) ? papers : []).filter((paper) => {
    const year = paperYear(paper.year);
    if ((filters.yearFrom || filters.yearTo) && year == null) return false;
    if (filters.yearFrom && year < Number(filters.yearFrom)) return false;
    if (filters.yearTo && year > Number(filters.yearTo)) return false;
    if (selectedTypes.length && !publicationTypesForPaper(paper).some((type) => selectedTypes.includes(key(type)))) return false;
    if (journals.length && !journals.includes(key(journalForPaper(paper)))) return false;
    if (conferences.length && !conferences.includes(key(conferenceForPaper(paper)))) return false;
    if (filters.openAccess && paper.openAccess !== true) return false;
    const citations = numericValue(paper.citations);
    if ((filters.minCitations || filters.maxCitations) && citations == null) return false;
    if (filters.minCitations && citations < Number(filters.minCitations)) return false;
    if (filters.maxCitations && citations > Number(filters.maxCitations)) return false;
    if (include.length || exclude.length) {
      const searchable = key([paper.title, paper.abstract, ...(Array.isArray(paper.keywords) ? paper.keywords : [])].filter(Boolean).join(" "));
      if (!include.every((phrase) => searchable.includes(phrase)) || exclude.some((phrase) => searchable.includes(phrase))) return false;
    }
    return true;
  });
  const field = filters.sort === "citations" ? "citations" : "year";
  return filters.sort === "relevance" ? filtered : filtered.sort((a, b) => {
    const left = field === "year" ? paperYear(a[field]) : numericValue(a[field]);
    const right = field === "year" ? paperYear(b[field]) : numericValue(b[field]);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return filters.sort === "oldest" ? left - right : right - left;
  });
}

export function filterSummary(value = {}) {
  const filters = normalizeResearchFilters(value);
  const summary = [];
  if (filters.yearFrom || filters.yearTo) summary.push({ key: "years", label: filters.yearFrom && filters.yearTo ? `${filters.yearFrom} – ${filters.yearTo}` : filters.yearFrom ? `${filters.yearFrom} onward` : `Through ${filters.yearTo}` });
  for (const [field, singular] of [["publicationTypes", "type"], ["journals", "journal"], ["conferences", "conference"]]) {
    if (filters[field].length) summary.push({ key: field, label: filters[field].length === 1 ? filters[field][0] : `${filters[field].length} ${singular}s` });
  }
  if (filters.includeKeywords) summary.push({ key: "includeKeywords", label: `Includes: ${keywordPhrases(filters.includeKeywords).join(", ")}` });
  if (filters.excludeKeywords) summary.push({ key: "excludeKeywords", label: `Excludes: ${keywordPhrases(filters.excludeKeywords).join(", ")}` });
  if (filters.openAccess) summary.push({ key: "openAccess", label: "Verified open access" });
  if (filters.minCitations || filters.maxCitations) summary.push({ key: "citations", label: `Citations: ${filters.minCitations || "0"} – ${filters.maxCitations || "any"}` });
  return summary;
}

export function removeResearchFilter(value, field) {
  const filters = normalizeResearchFilters(value);
  if (field === "years") return { ...filters, yearFrom: "", yearTo: "" };
  if (field === "citations") return { ...filters, minCitations: "", maxCitations: "" };
  return Object.hasOwn(defaultResearchFilters, field) ? { ...filters, [field]: defaultResearchFilters[field] } : filters;
}
