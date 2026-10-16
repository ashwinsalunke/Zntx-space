export const stripTags = (s = "") =>
  String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
export function crossrefPaper(p) {
  return {
    id: p.DOI,
    title: stripTags(p.title?.[0] || "Untitled work"),
    authors: (p.author || []).map((a) =>
      `${a.given || ""} ${a.family || a.name || ""}`.trim(),
    ),
    year:
      (p.published?.["date-parts"] || p.issued?.["date-parts"])?.[0]?.[0] ||
      null,
    journal: stripTags(p["container-title"]?.[0] || p.publisher || ""),
    doi: p.DOI,
    url: p.DOI ? `https://doi.org/${p.DOI}` : p.URL,
    abstract: stripTags(p.abstract || ""),
    citations: p["is-referenced-by-count"] || 0,
    type: p.type || "Research paper",
    source: "Crossref",
    volume: p.volume || "",
    issue: p.issue || "",
    pages: p.page || "",
  };
}
export function europePaper(p) {
  return {
    id: p.doi || `epmc-${p.source}-${p.id}`,
    title: stripTags(p.title),
    authors: p.authorList?.author?.map((a) => a.fullName) || [
      p.authorString || "",
    ],
    year: Number(p.pubYear) || null,
    journal: p.journalInfo?.journal?.title || "",
    doi: p.doi || "",
    url: p.doi
      ? `https://doi.org/${p.doi}`
      : `https://europepmc.org/article/${p.source}/${p.id}`,
    abstract: stripTags(p.abstractText || ""),
    citations: Number(p.citedByCount) || 0,
    type: p.pubTypeList?.pubType?.[0] || "Journal article",
    source: "Europe PMC",
    pmcid: /^PMC\d+$/.test(p.pmcid || "") ? p.pmcid : null,
    pmid: p.pmid || (p.source === "MED" ? p.id : null),
    openAccess: p.isOpenAccess === "Y",
    pdf:
      p.isOpenAccess === "Y" && p.pmcid
        ? `https://europepmc.org/articles/${p.pmcid}?pdf=render`
        : null,
  };
}
const stop = new Set(
  "the a an and or in of to for is are was were be with what how does do this that from on as by it can about summarize summary explain main findings".split(
    " ",
  ),
);
export function relevantPassages(pages, question, count = 4) {
  const terms =
    question
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.filter((w) => !stop.has(w)) || [];
  const passages = pages
    .flatMap((p) =>
      (p.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map((text, index) => ({
        text: text.trim(),
        page: p.page,
        index,
        score: terms.reduce(
          (s, w) => s + (text.toLowerCase().includes(w) ? 1 : 0),
          0,
        ),
      })),
    )
    .filter((p) => p.text.length > 45);
  const matched = passages
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  return (
    terms.length && matched.length
      ? matched
      : terms.length &&
          !/summari|overview|main|finding|explain/.test(question.toLowerCase())
        ? []
        : passages
  ).slice(0, count);
}
