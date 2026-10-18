import express from "express";
import { crossrefPaper, europePaper } from "./research.js";

const stopWords = new Set(
  "a an and are as at be by for from how in is it of on or that the this to was were what which with does do study research review paper papers".split(
    " ",
  ),
);
const tokens = (s) =>
  String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
const titleKey = (s) => tokens(s).join(" ");
const doiKey = (s) =>
  String(s || "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const makeUrl = (base, params) => {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return url.toString();
};
class DiscoveryError extends Error {
  constructor(message, code = "PROVIDER_UNAVAILABLE", status = 502) {
    super(message);
    Object.assign(this, { code, status });
  }
}

export function mergeAndRank(records, query) {
  const unique = [];
  const dois = new Map();
  const titles = new Map();
  for (const record of records) {
    const dk = doiKey(record.doi);
    const tk = titleKey(record.title);
    // A short generic title cannot reliably identify the same publication.
    const usableTitle = tk.length >= 18 && tk.split(" ").length >= 3;
    const existing = (dk && dois.get(dk)) || (usableTitle && titles.get(tk));
    if (existing && (!existing.doi || !dk || doiKey(existing.doi) === dk)) {
      existing.sources = [...new Set([...existing.sources, record.source])];
      if ((record.abstract || "").length > (existing.abstract || "").length)
        existing.abstract = record.abstract;
      for (const key of [
        "pmcid",
        "pmid",
        "pdf",
        "doi",
        "journal",
        "volume",
        "issue",
        "pages",
        "year",
      ])
        if (!existing[key] && record[key]) existing[key] = record[key];
      if (!existing.authors?.length && record.authors?.length)
        existing.authors = record.authors;
      if (record.openAccess) existing.openAccess = true;
      if (record.pmcid)
        existing.fullTextUrl = `/api/discovery/fulltext?pmcid=${record.pmcid}`;
      if (dk) dois.set(dk, existing);
      if (usableTitle) titles.set(tk, existing);
    } else {
      const paper = {
        ...record,
        sources: [record.source],
        ...(record.pmcid
          ? { fullTextUrl: `/api/discovery/fulltext?pmcid=${record.pmcid}` }
          : {}),
      };
      unique.push(paper);
      if (dk) dois.set(dk, paper);
      if (usableTitle) titles.set(tk, paper);
    }
  }
  const terms = [
    ...new Set(tokens(query).filter((term) => !stopWords.has(term))),
  ];
  const phrase = titleKey(query);
  return unique
    .map((paper) => {
      const title = new Set(tokens(paper.title));
      const abstract = new Set(tokens(paper.abstract));
      const titleMatches = terms.filter((term) => title.has(term)).length;
      const abstractMatches = terms.filter((term) => abstract.has(term)).length;
      const matchedTerms = terms.filter(
        (term) => title.has(term) || abstract.has(term),
      ).length;
      const phraseBonus =
        phrase.length > 3 && titleKey(paper.title).includes(phrase) ? 4 : 0;
      const score =
        titleMatches * 4 +
        abstractMatches +
        (terms.length && matchedTerms === terms.length ? 3 : 0) +
        phraseBonus;
      return {
        ...paper,
        relevanceScore: score,
        relevance: {
          titleMatches,
          abstractMatches,
          matchedTerms,
          totalTerms: terms.length,
        },
      };
    })
    .sort(
      (a, b) =>
        b.relevanceScore - a.relevanceScore ||
        titleKey(a.title).localeCompare(titleKey(b.title)) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

const decode = (text) =>
  String(text || "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, value) => {
      const cp = /^x/i.test(value)
        ? parseInt(value.slice(1), 16)
        : Number(value);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (value) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[value],
    );
// A bounded non-validating JATS reader. It never loads a DTD or external entity.
function xmlTree(xml) {
  const root = { tag: "root", attrs: {}, children: [] };
  const stack = [root];
  const pieces =
    xml.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/g) || [];
  if (pieces.length > 200000)
    throw new DiscoveryError(
      "The source article has too many XML elements.",
      "SOURCE_TOO_LARGE",
      413,
    );
  for (const piece of pieces) {
    if (
      piece.startsWith("<!--") ||
      piece.startsWith("<?") ||
      piece.startsWith("<!DOCTYPE")
    )
      continue;
    if (piece.startsWith("<![CDATA[")) {
      stack.at(-1).children.push(piece.slice(9, -3));
      continue;
    }
    if (piece.startsWith("</")) {
      const tag = piece.match(/^<\/([^\s>]+)/)?.[1];
      if (stack.length > 1 && stack.at(-1).tag === tag) stack.pop();
      continue;
    }
    if (piece.startsWith("<")) {
      const tag = piece.match(/^<([^\s/>]+)/)?.[1];
      if (!tag || tag.startsWith("!")) continue;
      const attrs = Object.fromEntries(
        [...piece.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
          ([, key, a, b]) => [key, decode(a ?? b)],
        ),
      );
      const node = { tag, attrs, children: [] };
      stack.at(-1).children.push(node);
      if (!piece.endsWith("/>")) {
        if (stack.length > 150)
          throw new DiscoveryError(
            "The source XML nesting exceeds the reader limit.",
            "SOURCE_TOO_LARGE",
            413,
          );
        stack.push(node);
      }
    } else stack.at(-1).children.push(decode(piece));
  }
  return root;
}
const findAll = (node, tag, found = []) => {
  if (typeof node === "string") return found;
  if (node.tag === tag) found.push(node);
  for (const child of node.children || []) findAll(child, tag, found);
  return found;
};
const nodeText = (node) => {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (["script", "style", "tex-math"].includes(node.tag)) return "";
  const sep = [
    "p",
    "sec",
    "title",
    "abstract",
    "list-item",
    "caption",
    "tr",
  ].includes(node.tag)
    ? "\n"
    : "";
  return sep + node.children.map(nodeText).join("") + sep;
};
const clean = (text) =>
  text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function parseOpenFullText(xml, pmcid) {
  const root = xmlTree(xml);
  const article = findAll(root, "article")[0];
  if (!article)
    throw new DiscoveryError(
      "Europe PMC did not return a readable article.",
      "SOURCE_INVALID_RESPONSE",
    );
  const front = findAll(article, "front")[0];
  const articleMeta = findAll(front || article, "article-meta")[0];
  const articleIds = findAll(articleMeta || front || article, "article-id");
  const sourcePmc = articleIds.find((node) =>
    ["pmc", "pmcid"].includes(node.attrs["pub-id-type"]),
  );
  if (
    sourcePmc &&
    `PMC${clean(nodeText(sourcePmc)).replace(/^PMC/i, "")}` !== pmcid
  )
    throw new DiscoveryError(
      "The source article ID did not match the requested PMC record.",
      "SOURCE_ID_MISMATCH",
    );
  const title = clean(nodeText(findAll(front || article, "article-title")[0]));
  const doi = clean(
    nodeText(articleIds.find((node) => node.attrs["pub-id-type"] === "doi")),
  );
  const abstracts = findAll(articleMeta || front || article, "abstract");
  const body = findAll(article, "body")[0];
  const topSections =
    body?.children.filter(
      (node) => typeof node !== "string" && node.tag === "sec",
    ) || [];
  const sections = abstracts.map((node, i) => ({
    id: `abstract-${i + 1}`,
    title: "Abstract",
    text: clean(nodeText(node)),
  }));
  const looseBody =
    body?.children.filter((node) =>
      typeof node === "string" ? node.trim() : node.tag !== "sec",
    ) || [];
  if (looseBody.length)
    sections.push({
      id: "body-intro",
      title: "Body",
      text: clean(looseBody.map(nodeText).join("\n")),
    });
  for (const [index, node] of topSections.entries())
    sections.push({
      id: node.attrs.id || `section-${index + 1}`,
      title:
        clean(
          nodeText(
            node.children.find(
              (child) => typeof child !== "string" && child.tag === "title",
            ),
          ),
        ) || `Section ${index + 1}`,
      text: clean(nodeText(node)),
    });
  const availableSections = sections.filter((section) => section.text);
  const completeText = [
    title,
    ...availableSections.map((section) => section.text),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (!completeText || !body)
    throw new DiscoveryError(
      "The source does not provide article body text.",
      "FULLTEXT_NOT_AVAILABLE",
      404,
    );
  const permissions = findAll(
    articleMeta || front || article,
    "permissions",
  )[0];
  const license = findAll(permissions || { children: [] }, "license")[0];
  const licenseUrl =
    license?.attrs["xlink:href"] ||
    license?.attrs.href ||
    findAll(license || { children: [] }, "ext-link").find(
      (node) => node.attrs["xlink:href"],
    )?.attrs["xlink:href"] ||
    "";
  const text = completeText.slice(0, 1000000);
  const boundedSections = availableSections.slice(0, 100).map((section) => ({
    ...section,
    text: section.text.slice(0, 100000),
    truncated: section.text.length > 100000,
  }));
  const truncated =
    completeText.length > text.length ||
    availableSections.length > 100 ||
    boundedSections.some((section) => section.truncated);
  return {
    pmcid,
    title,
    doi,
    text,
    sections: boundedSections,
    license: {
      text: clean(nodeText(license)),
      url: /^https?:\/\//i.test(licenseUrl) ? licenseUrl : "",
      type: license?.attrs["license-type"] || "",
    },
    copyright: findAll(permissions || { children: [] }, "copyright-statement")
      .map((node) => clean(nodeText(node)))
      .join("\n"),
    source: "Europe PMC Open Access",
    sourceUrl: `https://europepmc.org/articles/${pmcid}`,
    retrievedAt: new Date().toISOString(),
    coverage: {
      truncated,
      originalCharacters: completeText.length,
      returnedCharacters: text.length,
      notes: [
        "Text extracted from the source JATS abstract and article body; references, supplements, and images are not included. Tables and mathematical notation may lose formatting.",
        "Check the article-specific license before redistribution.",
        ...(truncated
          ? [
              "The article exceeds the reader limits; this response is explicitly truncated.",
            ]
          : []),
      ],
    },
  };
}

export function createDiscoveryRouter({
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  maxBytes = 8000000,
  cacheTtlMs = 300000,
  maxCacheEntries = 40,
} = {}) {
  const router = express.Router();
  const cache = new Map();
  const pending = new Map();
  async function upstream(url, { xml = false } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: xml ? "application/xml" : "application/json",
            "User-Agent": "scrapeTx/0.2 (public evidence discovery)",
          },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (xml && [403, 404].includes(response.status))
            throw new DiscoveryError(
              "Open-access XML is unavailable for this PMC record.",
              "FULLTEXT_NOT_AVAILABLE",
              404,
            );
          const retryAfter = Number(response.headers.get("retry-after"));
          if (
            attempt === 0 &&
            (response.status === 429 || response.status >= 500) &&
            (!Number.isFinite(retryAfter) || retryAfter <= 2)
          ) {
            await sleep(Math.max(500, (retryAfter || 0) * 1000));
            continue;
          }
          throw new DiscoveryError(
            `The source returned HTTP ${response.status}.`,
            response.status === 429
              ? "PROVIDER_RATE_LIMIT"
              : "PROVIDER_HTTP_ERROR",
          );
        }
        if (Number(response.headers.get("content-length")) > maxBytes) {
          await response.body?.cancel();
          throw new DiscoveryError(
            "The source response exceeds the size limit.",
            "SOURCE_TOO_LARGE",
            413,
          );
        }
        const reader = response.body?.getReader();
        if (!reader)
          throw new DiscoveryError(
            "The source response was empty.",
            "SOURCE_INVALID_RESPONSE",
          );
        let length = 0;
        let body = "";
        const decoder = new TextDecoder();
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > maxBytes) {
            await reader.cancel();
            throw new DiscoveryError(
              "The source response exceeds the size limit.",
              "SOURCE_TOO_LARGE",
              413,
            );
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
        if (xml) return body;
        try {
          return JSON.parse(body);
        } catch {
          throw new DiscoveryError(
            "The source returned unreadable metadata.",
            "SOURCE_INVALID_RESPONSE",
          );
        }
      } catch (error) {
        if (error instanceof DiscoveryError) throw error;
        if (attempt === 0) {
          await sleep(500);
          continue;
        }
        throw new DiscoveryError(
          error.name === "TimeoutError" || error.name === "AbortError"
            ? "The source request timed out."
            : "The source could not be reached.",
          error.name === "TimeoutError" || error.name === "AbortError"
            ? "PROVIDER_TIMEOUT"
            : "PROVIDER_UNAVAILABLE",
        );
      }
    }
  }
  async function search(query, recent = false) {
    const today = new Date().toISOString().slice(0,10);
    const since = `${new Date().getUTCFullYear()-3}-01-01`;
    const providers = [
      {
        id: "crossref",
        name: "Crossref",
        url: "https://www.crossref.org/",
        endpoint: makeUrl("https://api.crossref.org/works", {
          query,
          filter: "type:journal-article" + (recent ? `,from-pub-date:${since},until-pub-date:${today}` : ""),
          rows: 40,
          sort: "relevance",
        }),
        normalize(data) {
          if (!Array.isArray(data.message?.items))
            throw new DiscoveryError(
              "Crossref did not return paper metadata.",
              "SOURCE_INVALID_RESPONSE",
            );
          return {
            papers: data.message.items.map(crossrefPaper),
            total: data.message["total-results"] ?? null,
          };
        },
      },
      {
        id: "europepmc",
        name: "Europe PMC",
        url: "https://europepmc.org/",
        endpoint: makeUrl(
          "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
          { query: recent ? `(${query}) AND FIRST_PDATE:[${since} TO ${today}]` : query, format: "json", resultType: "core", pageSize: 40 },
        ),
        normalize(data) {
          if (!Array.isArray(data.resultList?.result))
            throw new DiscoveryError(
              "Europe PMC did not return paper metadata.",
              "SOURCE_INVALID_RESPONSE",
            );
          return {
            papers: data.resultList.result.map((p) => ({
              ...europePaper(p),
              pmcid: /^PMC\d+$/.test(p.pmcid || "") ? p.pmcid : null,
              pmid: p.pmid || (p.source === "MED" ? p.id : null),
            })),
            total: data.hitCount ?? null,
          };
        },
      },
    ];
    const fetched = await Promise.allSettled(
      providers.map(async (provider) =>
        provider.normalize(await upstream(provider.endpoint)),
      ),
    );
    const sources = fetched.map((result, index) => ({
      id: providers[index].id,
      name: providers[index].name,
      url: providers[index].url,
      status: result.status === "fulfilled" ? "ok" : "error",
      returned: result.status === "fulfilled" ? result.value.papers.length : 0,
      total: result.status === "fulfilled" ? result.value.total : null,
      ...(result.status === "rejected"
        ? { error: result.reason.message, code: result.reason.code }
        : {}),
    }));
    const records = fetched.flatMap((result) =>
      result.status === "fulfilled" ? result.value.papers : [],
    );
    if (fetched.every((result) => result.status === "rejected")) {
      const error = new DiscoveryError(
        "All discovery sources are unavailable. Try again later.",
      );
      error.sources = sources;
      throw error;
    }
    const papers = mergeAndRank(records, query);
    return {
      papers,
      total: papers.length,
      query,
      searchWindow: recent ? {from:since,to:today} : null,
      source: "Deep search · Crossref + Europe PMC",
      retrievedAt: new Date().toISOString(),
      sources,
      partial: fetched.some((result) => result.status === "rejected"),
      coverage: {
        retrievedRecords: records.length,
        uniqueRecords: papers.length,
        duplicatesRemoved: records.length - papers.length,
        withAbstract: papers.filter((p) => p.abstract?.trim()).length,
        withoutAbstract: papers.filter((p) => !p.abstract?.trim()).length,
        openAccess: papers.filter((p) => p.openAccess).length,
        notes: [
          "Searches up to 40 journal articles from Crossref and 40 records from Europe PMC. Total is unique returned records, not the combined size of either database.",
          "Europe PMC includes PubMed-indexed records; this search does not independently query PubMed. Use the Pharma PubMed search for direct NCBI results.",
          "Deduplicates exact normalized DOI, or normalized titles of at least three words when DOI values do not conflict. Provider hit counts can overlap and must not be summed.",
          "Ranking uses query words in titles and available abstracts. Missing abstracts are not generated. This bounded lexical search is not an exhaustive systematic review or a SciSpace Pro service.",
          ...(fetched.some((r) => r.status === "rejected")
            ? [
                "Partial coverage: at least one source failed; inspect source status before using these results.",
              ]
            : []),
        ],
      },
      ranking: {
        method: "lexical-v1",
        description:
          "4 points per distinct query term in title; 1 per term in abstract; 3 for all terms present; 4 for an exact normalized query phrase in title. Stop words are ignored. Ties sort by normalized title then ID.",
      },
    };
  }
  async function cached(key, operation) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.time < cacheTtlMs) return entry.data;
    if (!pending.has(key)) {
      if (pending.size >= 15)
        throw new DiscoveryError(
          "Too many discovery requests are running. Try again shortly.",
          "SERVER_BUSY",
          503,
        );
      pending.set(
        key,
        operation()
          .then((data) => {
            // Retry partial searches on the next user request rather than caching outages.
            if (!data.partial) {
              cache.delete(key);
              cache.set(key, { time: Date.now(), data });
              while (cache.size > maxCacheEntries)
                cache.delete(cache.keys().next().value);
            }
            return data;
          })
          .finally(() => pending.delete(key)),
      );
    }
    return pending.get(key);
  }
  const fail = (res, error) =>
    res.status(error.status || 502).json({
      error: error.message || "Discovery failed.",
      code: error.code || "PROVIDER_UNAVAILABLE",
      ...(error.sources ? { sources: error.sources } : {}),
    });
  router.get("/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q || q.length > 500 || /[\u0000-\u001f]/.test(q))
      return res.status(400).json({
        error: "Enter a research query between 1 and 500 characters.",
        code: "INVALID_QUERY",
      });
    try {
      const recent = req.query.sort === "recent";
      res.json(await cached(`search:${JSON.stringify([q,recent])}`, () => search(q,recent)));
    } catch (error) {
      fail(res, error);
    }
  });
  router.get("/fulltext", async (req, res) => {
    const pmcid =
      typeof req.query.pmcid === "string"
        ? req.query.pmcid.trim().toUpperCase()
        : "";
    if (!/^PMC\d{1,12}$/.test(pmcid))
      return res.status(400).json({
        error: "Provide a PMC identifier such as PMC7110002.",
        code: "INVALID_PMCID",
      });
    try {
      res.json(
        await cached(`fulltext:${pmcid}`, async () =>
          parseOpenFullText(
            await upstream(
              `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`,
              { xml: true },
            ),
            pmcid,
          ),
        ),
      );
    } catch (error) {
      fail(res, error);
    }
  });
  return router;
}

export default createDiscoveryRouter();
