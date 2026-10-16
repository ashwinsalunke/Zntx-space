export async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Unable to complete this request.");
  return data;
}
export function download(name, content, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function citation(p, style = "APA") {
  const authors = p.authors?.filter(Boolean) || [];
  const year = p.year || "n.d.";
  const doi = p.doi ? `https://doi.org/${p.doi}` : p.url || "";
  if (style === "BibTeX")
    return `@article{${(authors[0] || "paper").replace(/[^a-z]/gi, "")}${year},\n  title = {${p.title}},\n  author = {${authors.join(" and ")}},\n  year = {${year}},\n  journal = {${p.journal || ""}},\n  doi = {${p.doi || ""}}\n}`;
  if (style === "RIS")
    return `TY  - JOUR\nTI  - ${p.title}\n${authors.map((a) => `AU  - ${a}`).join("\n")}\nPY  - ${year}\nJO  - ${p.journal || ""}\nDO  - ${p.doi || ""}\nUR  - ${doi}\nER  - `;
  const formatted = authors.map((a) => {
    const words = a.split(" ");
    const last = words.pop();
    return `${last}, ${words.map((w) => w[0] + ".").join(" ")}`;
  });
  if (style === "MLA")
    return `${authors.join(", ")}. “${p.title}.” ${p.journal || ""}, ${year}. ${doi}`;
  if (style === "IEEE")
    return `${authors.join(", ")}, “${p.title},” ${p.journal || ""}, ${year}. doi: ${p.doi || "unavailable"}.`;
  return `${formatted.slice(0, 20).join(", ")}${authors.length > 20 ? ", et al." : ""} (${year}). ${p.title}. ${p.journal || ""}${p.volume ? ", " + p.volume : ""}${p.issue ? "(" + p.issue + ")" : ""}${p.pages ? ", " + p.pages : ""}. ${doi}`;
}
export function csv(papers) {
  const cell = (s) => '"' + String(s ?? "").replaceAll('"', '""') + '"';
  return [
    ["Title", "Authors", "Year", "Journal", "DOI", "Citations", "Abstract"],
    ...papers.map((p) => [
      p.title,
      p.authors.join("; "),
      p.year,
      p.journal,
      p.doi,
      p.citations,
      p.abstract,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\n");
}
export const excerpt = (s, n = 260) =>
  s?.length > n ? s.slice(0, n).replace(/\s\S*$/, "") + "…" : s || "";
export const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
