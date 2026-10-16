export async function api(url, options = {}) {
  let token = localStorage.getItem("zntx-workspace-token");
  if (!/^[a-f0-9]{64}$/.test(token || "")) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem("zntx-workspace-token", token);
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Token": token,
      ...options.headers,
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an incomplete response. Please retry.");
  }
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
function normalizedDoi(value) {
  const doi = String(value || "").trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : "";
}
export function sourceUrl(record) {
  const doi = normalizedDoi(record.doi);
  if (doi) return "https://doi.org/" + doi.split("/").map(encodeURIComponent).join("/");
  for (const value of [record.url, record.sourceUrl]) {
    try {
      if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) continue;
      const url = new URL(value);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password)
        return url.href;
    } catch { /* Try the next supplied source identifier. */ }
  }
  if (/^\d+$/.test(record.pmid || "")) return `https://pubmed.ncbi.nlm.nih.gov/${record.pmid}/`;
  if (/^PMC\d+$/.test(record.pmcid || "")) return `https://europepmc.org/articles/${record.pmcid}`;
  return null;
}
export function citation(p, style = "APA") {
  const authors = p.authors?.filter(Boolean) || [];
  const year = p.year || "n.d.";
  const doi = normalizedDoi(p.doi);
  const url = sourceUrl(p) || "";
  const book = ["book", "monograph", "edited-book", "reference-book"].includes(p.type);
  const chapter = ["book-chapter", "reference-entry", "book-part"].includes(p.type);
  const webRecord = ["compound", "clinical-trial", "drug-label", "dataset", "grant", "software", "webpage", "patent", "scholarly-result"].includes(p.type);
  if (style === "BibTeX") {
    const field = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/[{}]/g, "\\$&").replace(/[\r\n]+/g, " ");
    const fields = { title: p.title, author: authors.join(" and "), year,
      ...(book ? { publisher: p.publisher || p.journal, isbn: p.isbn?.join("; ") }
        : chapter ? { booktitle: p.journal, publisher: p.publisher } : { journal: p.journal }),
      doi, url };
    return `@${book ? "book" : chapter ? "incollection" : webRecord ? "misc" : "article"}{${(authors[0] || "paper").replace(/[^a-z]/gi, "")}${year},\n${Object.entries(fields).filter(([,v]) => v).map(([k,v]) => `  ${k} = {${field(v)}}`).join(",\n")}\n}`;
  }
  if (style === "RIS")
    return `TY  - ${book ? "BOOK" : chapter ? "CHAP" : webRecord ? "GEN" : "JOUR"}\nTI  - ${p.title}\n${authors.map((a) => `AU  - ${a}`).join("\n")}\nPY  - ${year}\nJO  - ${p.journal || ""}\nDO  - ${doi}\nUR  - ${url}\nER  - `;
  const formatted = authors.map((a) => {
    const words = a.split(" ");
    const last = words.pop();
    return `${last}, ${words.map((w) => w[0] + ".").join(" ")}`;
  });
  if (style === "MLA")
    return `${authors.join(", ")}. “${p.title}.” ${p.journal || ""}, ${year}. ${url}`;
  if (style === "IEEE")
    return `${authors.join(", ")}, “${p.title},” ${p.journal || ""}, ${year}.${doi ? ` doi: ${doi}.` : ""}${url ? ` ${url}` : ""}`;
  const lead = formatted.length
    ? `${formatted.slice(0, 20).join(", ")}${authors.length > 20 ? ", et al." : ""} (${year}). ${p.title}.`
    : `${p.title}. (${year}).`;
  return `${lead} ${p.journal || ""}${p.volume ? ", " + p.volume : ""}${p.issue ? "(" + p.issue + ")" : ""}${p.pages ? ", " + p.pages : ""}. ${url}`;
}
export function bibliographyHtml(papers, style = "APA") {
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const entries = papers.map((p) => {
    const url = sourceUrl(p);
    return `<li><p>${escape(citation(p, style))}</p>${url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Open original source — ${escape(p.title)}</a>` : '<span>Source link unavailable</span>'}</li>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zntx Space bibliography</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:850px;margin:48px auto;padding:0 24px;color:#171717}li{margin-bottom:28px;overflow-wrap:anywhere}p{white-space:pre-wrap}a{color:#171717;text-underline-offset:3px}</style></head><body><h1>Bibliography</h1><p>${escape(style)} · Exported from Zntx Space</p><ol>${entries}</ol></body></html>`;
}
export function csv(papers) {
  const cell = (s) => {
    const value = String(s ?? "");
    return (
      '"' +
      (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" : "") +
      value.replaceAll('"', '""') +
      '"'
    );
  };
  return [
    ["Title", "Authors", "Year", "Journal", "DOI", "Citations", "Abstract", "Search snippet", "Original source URL", "Source"],
    ...papers.map((p) => [
      p.title,
      (p.authors || []).join("; "),
      p.year,
      p.journal,
      p.doi,
      p.citations,
      p.abstract,
      p.snippet || "",
      sourceUrl(p) || "",
      p.source || "",
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\n");
}
export const excerpt = (s, n = 260) =>
  s?.length > n ? s.slice(0, n).replace(/\s\S*$/, "") + "…" : s || "";
export const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;
