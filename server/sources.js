import express from "express";

// Public metadata adapters only. Provider endpoints are fixed here; a query can
// never choose a host, install a package, or run Python code.
const PROVIDERS = {
  arxiv: { name: "arXiv", docs: "https://info.arxiv.org/help/api/index.html" },
  grants: { name: "Grants.gov", docs: "https://www.grants.gov/api/common/search2" },
  datasets: { name: "DataCite", docs: "https://support.datacite.org/docs/rest-api" },
  python: { name: "PyPI", docs: "https://docs.pypi.org/api/json/" },
};
class SourceError extends Error {
  constructor(message, code = "PROVIDER_UNAVAILABLE", status = 502) {
    super(message);
    Object.assign(this, { code, status });
  }
}
const decode = (value) =>
  String(value || "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const cp = /^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, entity) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[entity],
    );
const text = (value, max = 12000) =>
  decode(
    String(value || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const year = (value) => {
  const n = Number(String(value || "").match(/^\d{4}/)?.[0]);
  return Number.isInteger(n) && n >= 1000 && n <= 3000 ? n : null;
};
const count = (value, fallback) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
};
export function safeSourceUrl(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return "";
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
const doiValue = (value) => {
  const doi = String(value || "").replace(/^https?:\/\/doi\.org\//i, "").trim();
  return /^10\.\d{4,9}\/\S+$/i.test(doi) && doi.length <= 512 ? doi : "";
};
const doiUrl = (doi) => `https://doi.org/${encodeURIComponent(doi).replaceAll("%2F", "/")}`;
const tagContent = (xml, tag) =>
  xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, "i"))?.[1] || "";

export function parseArxiv(xml) {
  if (typeof xml !== "string" || !/<feed(?:\s|>)/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new SourceError("arXiv returned unreadable Atom metadata.", "SOURCE_INVALID_RESPONSE");
  const entries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry\s*>/gi)];
  const results = [];
  for (const [, entry] of entries.slice(0, 30)) {
    const rawId = safeSourceUrl(text(tagContent(entry, "id"), 1024));
    const parsed = rawId ? new URL(rawId) : null;
    const arxivId = parsed && ["arxiv.org", "export.arxiv.org"].includes(parsed.hostname)
      ? parsed.pathname.match(/^\/abs\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)$/i)?.[1]
      : null;
    const title = text(tagContent(entry, "title"), 2000);
    if (!arxivId || !title) {
      if (rawId?.includes("/api/errors"))
        throw new SourceError("arXiv could not process this search. Try a simpler query.", "SOURCE_QUERY_ERROR", 400);
      continue;
    }
    const published = text(tagContent(entry, "published"), 50);
    results.push({
      id: `arxiv-${arxivId}`,
      arxivId,
      title,
      url: `https://arxiv.org/abs/${arxivId}`,
      pdf: `https://arxiv.org/pdf/${arxivId}`,
      authors: [...entry.matchAll(/<author(?:\s[^>]*)?>([\s\S]*?)<\/author\s*>/gi)]
        .map(([, author]) => text(tagContent(author, "name"), 500)).filter(Boolean).slice(0, 200),
      year: year(published),
      published,
      abstract: text(tagContent(entry, "summary")),
      doi: doiValue(text(tagContent(entry, "arxiv:doi"), 600)),
      categories: [...entry.matchAll(/<category\b[^>]*\bterm=["']([^"']+)["']/gi)]
        .map(([, value]) => text(value, 100)).slice(0, 20),
      source: "arXiv",
      journal: "arXiv",
      type: "preprint",
      citations: null,
      openAccess: true,
    });
  }
  return { results, total: count(tagContent(xml, "opensearch:totalResults"), results.length) };
}

export function normalizeGrants(data) {
  if (data?.errorcode !== 0 || !Array.isArray(data.data?.oppHits))
    throw new SourceError("Grants.gov returned unreadable opportunity metadata.", "SOURCE_INVALID_RESPONSE");
  const results = data.data.oppHits.slice(0, 30).flatMap((item) => {
    const id = String(item.id || "");
    const title = text(item.title, 2000);
    const agency = text(item.agencyName || item.agency, 500);
    if (!/^\d{1,12}$/.test(id) || !title) return [];
    return [{
      id: `grants-${id}`,
      opportunityId: id,
      title,
      url: `https://www.grants.gov/search-results-detail/${id}`,
      authors: agency ? [agency] : [],
      year: year(String(item.openDate || "").split("/").at(-1)),
      abstract: "",
      source: "Grants.gov",
      type: "grant",
      opportunityNumber: text(item.number, 200),
      agency,
      status: text(item.oppStatus, 100),
      openDate: text(item.openDate, 50),
      closeDate: text(item.closeDate, 50),
      citations: null,
      openAccess: false,
    }];
  });
  return { results, total: count(data.data.hitCount, results.length) };
}

export function normalizeDatasets(data) {
  if (!Array.isArray(data?.data))
    throw new SourceError("DataCite returned unreadable dataset metadata.", "SOURCE_INVALID_RESPONSE");
  const results = data.data.slice(0, 30).flatMap((item) => {
    const a = item.attributes || {};
    const doi = doiValue(a.doi || item.id);
    const title = text(a.titles?.[0]?.title, 2000);
    if (!doi || !title || a.types?.resourceTypeGeneral !== "Dataset") return [];
    return [{
      id: `datacite-${doi.toLowerCase()}`,
      doi,
      title,
      url: doiUrl(doi),
      landingPage: safeSourceUrl(a.url),
      authors: (Array.isArray(a.creators) ? a.creators : []).map((creator) =>
        text(creator.name || [creator.givenName, creator.familyName].filter(Boolean).join(" "), 500),
      ).filter(Boolean).slice(0, 200),
      year: year(a.publicationYear),
      abstract: text((Array.isArray(a.descriptions) ? a.descriptions : [])
        .filter((d) => d.descriptionType === "Abstract").map((d) => d.description).join("\n")),
      publisher: text(typeof a.publisher === "object" ? a.publisher?.name : a.publisher, 500),
      version: text(a.version, 100),
      licenses: (Array.isArray(a.rightsList) ? a.rightsList : []).slice(0, 10)
        .map((right) => ({ name: text(right.rights, 500), url: safeSourceUrl(right.rightsUri) })),
      source: "DataCite",
      type: "dataset",
      citations: null,
      // A findable DOI or license is not a guarantee that data are openly downloadable.
      openAccess: false,
    }];
  });
  return { results, total: count(data.meta?.total, results.length) };
}

const packageName = (value) => /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/i.test(value)
  ? value.toLowerCase().replace(/[-_.]+/g, "-") : "";
export function normalizePython(data, requestedName) {
  const info = data?.info;
  const name = packageName(String(info?.name || ""));
  if (!info || !name || name !== packageName(requestedName))
    throw new SourceError("PyPI returned metadata for an unexpected package.", "SOURCE_INVALID_RESPONSE");
  const releaseDates = (Array.isArray(data.urls) ? data.urls : []).map((file) =>
    String(file.upload_time_iso_8601 || file.upload_time || ""),
  ).filter((date) => /^\d{4}-\d\d-\d\dT/.test(date)).sort();
  return {
    total: 1,
    results: [{
      id: `pypi-${name}`,
      title: text(info.name, 200),
      packageName: name,
      url: `https://pypi.org/project/${encodeURIComponent(name)}/`,
      authors: info.author ? [text(info.author, 500)] : [],
      year: year(releaseDates[0]),
      abstract: text(info.summary, 2000),
      description: text(info.description),
      version: text(info.version, 100),
      requiresPython: text(info.requires_python, 200),
      license: text(info.license_expression || info.license, 1000),
      projectUrls: Object.entries(info.project_urls || {}).slice(0, 12)
        .map(([label, url]) => ({ label: text(label, 100), url: safeSourceUrl(url) })).filter((link) => link.url),
      source: "PyPI",
      type: "software",
      citations: null,
      openAccess: false,
    }],
  };
}

export function externalSearchUrl(source, query) {
  const specs = {
    scholar: ["https://scholar.google.com/scholar", "q"],
    google: ["https://www.google.com/search", "q"],
    patents: ["https://patents.google.com/", "q"],
  };
  const spec = Object.hasOwn(specs, source) ? specs[source] : null;
  if (!spec) return "";
  const url = new URL(spec[0]);
  url.searchParams.set(spec[1], String(query || "").slice(0, 300));
  return url.href;
}

export function sourceCatalog() {
  return [
    { id: "deep", name: "Deep Research", mode: "internal", supported: true, endpoint: "/api/discovery/search", reason: "Multi-source Crossref and Europe PMC discovery with source-linked synthesis when ScrapeTx AI is configured." },
    { id: "zotero", name: "Zotero Library", mode: "connector", supported: true, requiresCredential: true, statusEndpoint: "/api/library-sync/status", endpoint: "/api/library-sync/zotero/sync", reason: "Connect a permitted Zotero library key in Integrations, then pull new and updated references. RIS import is also available." },
    { id: "mendeley", name: "Mendeley Library", mode: "connector", supported: true, requiresCredential: true, statusEndpoint: "/api/library-sync/status", endpoint: "/api/library-sync/mendeley/sync", reason: "Register a Mendeley application and authorize your account in Integrations, then pull new and updated references. RIS import is also available." },
    { id: "pubmed", name: "PubMed", mode: "internal", supported: true, endpoint: "/api/biomedical/pubmed", reason: "NCBI PubMed records and available abstracts." },
    { id: "scholar", name: "Google Scholar", mode: "connector", supported: true, requiresCredential: true, provider: "SerpAPI (third-party)", statusEndpoint: "/api/connections/status", endpoint: "/api/google-search/search?source=scholar", reason: "Requires your SerpAPI key. Returns source-linked search snippets, not full abstracts or verified findings.", searchUrl: externalSearchUrl("scholar", "") },
    { id: "arxiv", name: "arXiv", mode: "api", supported: true, endpoint: "/api/sources/search?source=arxiv", reason: "Public preprint metadata. Preprints may not have undergone peer review." },
    { id: "python", name: "Python Library", mode: "api", supported: true, endpoint: "/api/sources/search?source=python", reason: "Look up one exact PyPI package name, such as rdkit or pandas. No code is executed." },
    { id: "grants", name: "Grants.gov", mode: "api", supported: true, endpoint: "/api/sources/search?source=grants", reason: "Forecasted and posted US funding opportunities from the public Grants.gov API." },
    { id: "files", name: "Uploaded Files", mode: "local", supported: true, reason: "Use Chat with PDF to read a local PDF. It is sent to the AI provider only when you request AI analysis." },
    { id: "trials", name: "ClinicalTrials.gov", mode: "internal", supported: true, endpoint: "/api/biomedical/trials", reason: "ClinicalTrials.gov study registrations; registrations are not proof of treatment effectiveness." },
    { id: "google", name: "Google Search", mode: "connector", supported: true, requiresCredential: true, provider: "SerpAPI (third-party)", statusEndpoint: "/api/connections/status", endpoint: "/api/google-search/search?source=google", reason: "Requires your SerpAPI key. Returns source-linked web search snippets.", searchUrl: externalSearchUrl("google", "") },
    { id: "patents", name: "Google Patents", mode: "connector", supported: true, requiresCredential: true, provider: "SerpAPI (third-party)", statusEndpoint: "/api/connections/status", endpoint: "/api/google-search/search?source=patents", reason: "Requires your SerpAPI key. Returns patent search metadata; patent claims are not independently evaluated.", searchUrl: externalSearchUrl("patents", "") },
    { id: "datasets", name: "Online Datasets", mode: "api", supported: true, endpoint: "/api/sources/search?source=datasets", reason: "Dataset DOI metadata from DataCite. Access conditions and data quality vary by repository." },
  ];
}

export function normalizeArxivIndex(payload) {
  if (!Array.isArray(payload?.results))
    throw new SourceError(
      "Unreadable backup index response.",
      "SOURCE_INVALID_RESPONSE",
    );
  const seen = new Set(),
    results = [];
  for (const item of payload.results) {
    const location = (item.locations || []).find((location) => {
      try {
        const u = new URL(location.landing_page_url);
        return (
          ["arxiv.org", "export.arxiv.org"].includes(u.hostname) &&
          /^\/abs\/(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(
            u.pathname,
          )
        );
      } catch {
        return false;
      }
    });
    if (!location || !item.title) continue;
    const arxivId = new URL(location.landing_page_url).pathname.slice(5);
    if (seen.has(arxivId)) continue;
    seen.add(arxivId);
    const words = [];
    for (const [word, positions] of Object.entries(
      item.abstract_inverted_index || {},
    )) {
      if (!Array.isArray(positions)) continue;
      for (const position of positions)
        if (Number.isInteger(position) && position >= 0 && position < 12000)
          words[position] = word;
    }
    results.push({
      id: `arxiv-${arxivId}`,
      arxivId,
      title: text(item.title, 3000),
      url: `https://arxiv.org/abs/${arxivId}`,
      pdf: `https://arxiv.org/pdf/${arxivId}`,
      authors: (item.authorships || [])
        .map((a) => text(a.author?.display_name, 300))
        .filter(Boolean),
      year: item.publication_year || null,
      abstract: text(words.filter(Boolean).join(" "), 30000),
      doi: "",
      type: "preprint",
      source: "arXiv via OpenAlex",
      citations: null,
      metadataSource: safeSourceUrl(item.id),
      openAccess: true,
    });
  }
  // Counts refer to the backup index, not arXiv's own result count.
  return { results, total: null, indexMatches: payload.meta?.count ?? null };
}

export function createSourcesRouter({
  fetchImpl = globalThis.fetch,
  timeoutMs = 18000,
  maxBytes = 6000000,
  cacheTtlMs = 300000,
  maxCacheEntries = 80,
  throttle = true,
  arxivFallback = true,
  maxPending = 10,
} = {}) {
  const router = express.Router();
  const cache = new Map();
  const pending = new Map();
  const lanes = new Map();
  let arxivRetryAt = 0;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function limited(source, task) {
    if (!throttle) return task();
    const lane = lanes.get(source) || {
      tail: Promise.resolve(),
      last: 0,
      queued: 0,
    };
    lanes.set(source, lane);
    if (lane.queued >= 5)
      throw new SourceError(
        "This source is busy. Please try again shortly.",
        "PROVIDER_BUSY",
        503,
      );
    lane.queued++;
    const call = lane.tail.then(async () => {
      await sleep(
        Math.max(0, lane.last + (source === "arxiv" ? 3100 : 250) - Date.now()),
      );
      lane.last = Date.now();
      return task();
    });
    lane.tail = call.catch(() => {});
    try {
      return await call;
    } finally {
      lane.queued--;
    }
  }
  async function upstream(source, url, init = {}, jsonResponse = false) {
    return limited(source, async () => {
      try {
        const response = await fetchImpl(url, {
          ...init,
          headers: {
            Accept:
              source === "arxiv" ? "application/atom+xml" : "application/json",
            "User-Agent": "scrapeTx/0.3 (public research metadata)",
            ...init.headers,
          },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
        if (source === "python" && response.status === 404) {
          await response.body?.cancel();
          return null;
        }
        if (!response.ok) {
          await response.body?.cancel();
          const error = new SourceError(
            `${PROVIDERS[source].name} returned HTTP ${response.status}. Try again later.`,
            response.status === 429
              ? "PROVIDER_RATE_LIMIT"
              : "PROVIDER_HTTP_ERROR",
            response.status === 429 ? 503 : 502,
          );
          if (response.status === 429)
            error.retryAfter = Math.max(
              1,
              Math.min(60, Number(response.headers.get("retry-after")) || 30),
            );
          throw error;
        }
        if (Number(response.headers.get("content-length")) > maxBytes) {
          await response.body?.cancel();
          throw new SourceError(
            "The provider response exceeds the metadata size limit.",
            "SOURCE_TOO_LARGE",
            413,
          );
        }
        const reader = response.body?.getReader();
        if (!reader)
          throw new SourceError(
            "The provider response was empty.",
            "SOURCE_INVALID_RESPONSE",
          );
        const decoder = new TextDecoder();
        let length = 0;
        let body = "";
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > maxBytes) {
            await reader.cancel();
            throw new SourceError(
              "The provider response exceeds the metadata size limit.",
              "SOURCE_TOO_LARGE",
              413,
            );
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
        if (source === "arxiv" && !jsonResponse) return body;
        try {
          return JSON.parse(body);
        } catch {
          throw new SourceError(
            "The provider returned unreadable JSON metadata.",
            "SOURCE_INVALID_RESPONSE",
          );
        }
      } catch (error) {
        if (error instanceof SourceError) throw error;
        const timedOut = ["AbortError", "TimeoutError"].includes(error.name);
        throw new SourceError(
          timedOut
            ? `${PROVIDERS[source].name} timed out. Try again later.`
            : `${PROVIDERS[source].name} could not be reached. Try again later.`,
          timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        );
      }
    });
  }
  async function search(source, query) {
    let data;
    let warnings = [];
    if (source === "arxiv") {
      const url = new URL("https://export.arxiv.org/api/query");
      // Treat ordinary input as words, rather than accepting arbitrary query syntax.
      const words = query.match(/[\p{L}\p{N}]+(?:[-.][\p{L}\p{N}]+)*/gu) || [];
      if (!words.length)
        throw new SourceError(
          "Enter a research topic for arXiv.",
          "INVALID_QUERY",
          400,
        );
      url.search = new URLSearchParams({
        search_query: words
          .slice(0, 35)
          .map((word) => `all:${word}`)
          .join(" AND "),
        start: "0",
        max_results: "30",
        sortBy: "relevance",
      });
      warnings = [
        "Preprints may not have undergone peer review. Metadata and available abstracts are returned; full articles are not downloaded.",
      ];
      try {
        if (arxivRetryAt > Date.now())
          throw new SourceError(
            "The arXiv API is cooling down after a transient failure.",
            "PROVIDER_UNAVAILABLE",
          );
        data = parseArxiv(await upstream(source, url.href));
      } catch (error) {
        if (
          !arxivFallback ||
          ![
            "PROVIDER_TIMEOUT",
            "PROVIDER_UNAVAILABLE",
            "PROVIDER_RATE_LIMIT",
            "PROVIDER_HTTP_ERROR",
          ].includes(error.code)
        )
          throw error;
        if (arxivRetryAt <= Date.now())
          arxivRetryAt =
            Date.now() +
            (error.code === "PROVIDER_RATE_LIMIT"
              ? (error.retryAfter || 30) * 1000
              : 30000);
        const fallback = new URL("https://api.openalex.org/works");
        fallback.search = new URLSearchParams({
          search: query,
          filter: "locations.source.id:S4306400194",
          per_page: "30",
        });
        try {
          data = normalizeArxivIndex(
            await upstream(
              source,
              fallback.href,
              { headers: { Accept: "application/json" } },
              true,
            ),
          );
        } catch {
          throw new SourceError(
            "arXiv and its backup index are unavailable. Please retry shortly or open arXiv directly.",
            "PROVIDER_UNAVAILABLE",
          );
        }
        warnings.unshift(
          "The arXiv API is temporarily unavailable. Showing arXiv-linked records retrieved from OpenAlex; index coverage, ranking, abstracts and dates may differ from arXiv. Open the original preprint to verify its version.",
        );
        data.retrievalProvider = "OpenAlex";
        data.fallback = true;
      }
    } else if (source === "grants") {
      data = normalizeGrants(
        await upstream(source, "https://api.grants.gov/v1/api/search2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: 30,
            keyword: query,
            oppStatuses: "forecasted|posted",
            startRecordNum: 0,
          }),
        }),
      );
      warnings = [
        "Only forecasted and posted US opportunities are searched. The summary API does not supply abstracts; open an opportunity for its current eligibility, funding, and deadlines.",
      ];
    } else if (source === "datasets") {
      const url = new URL("https://api.datacite.org/dois");
      url.search = new URLSearchParams({
        query,
        "resource-type-id": "dataset",
        "page[size]": "30",
      });
      data = normalizeDatasets(await upstream(source, url.href));
      warnings = [
        "DataCite returns repository-supplied dataset metadata. A findable DOI is not verification of dataset quality or unrestricted data access. Check each source and license.",
      ];
    } else {
      const name = packageName(query);
      if (!name)
        throw new SourceError(
          "Enter one exact Python package name, for example rdkit, pandas, or biopython.",
          "EXACT_PACKAGE_REQUIRED",
          400,
        );
      const raw = await upstream(
        source,
        `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
      );
      data =
        raw === null ? { results: [], total: 0 } : normalizePython(raw, name);
      warnings = [
        "Exact package lookup only. Metadata are supplied by package publishers; no package is installed or executed, and package suitability is not independently verified.",
      ];
    }
    return {
      ...data,
      query,
      source: PROVIDERS[source].name,
      sourceId: source,
      mode: "api",
      retrievedAt: new Date().toISOString(),
      warnings,
      documentation: PROVIDERS[source].docs,
    };
  }
  router.get("/status", (_req, res) =>
    res.json({
      sources: sourceCatalog(),
      retrievedAt: new Date().toISOString(),
    }),
  );
  router.get("/search", async (req, res) => {
    const { source, q } = req.query;
    if (
      typeof source !== "string" ||
      typeof q !== "string" ||
      !q.trim() ||
      q.length > 300 ||
      /[\u0000-\u001f\u007f]/.test(q)
    )
      return res
        .status(400)
        .json({
          error: "Choose a source and enter a query of 1–300 characters.",
          code: "INVALID_QUERY",
        });
    const query = q.trim();
    const external = externalSearchUrl(source, query);
    if (external)
      return res.json({
        results: [],
        total: 0,
        source: sourceCatalog().find((s) => s.id === source).name,
        sourceId: source,
        query,
        mode: "external",
        externalSearchUrl: external,
        retrievedAt: new Date().toISOString(),
        warnings: [
          "This opens an external search. No results have been retrieved, scraped, or supplied to the AI.",
        ],
      });
    if (!Object.hasOwn(PROVIDERS, source))
      return res
        .status(400)
        .json({
          error:
            "This source uses its own search or connector. Check source status for its supported pathway.",
          code: "UNSUPPORTED_SOURCE",
        });
    const key = `${source}:${query}`;
    const stored = cache.get(key);
    if (stored && stored.expires > Date.now())
      return res.json({ ...stored.value, cached: true });
    if (pending.size >= maxPending && !pending.has(key))
      return res
        .status(503)
        .json({
          error: "Research sources are busy. Try again shortly.",
          code: "PROVIDER_BUSY",
        });
    if (!pending.has(key)) {
      const task = search(source, query)
        .then((value) => {
          if (cache.size >= maxCacheEntries)
            cache.delete(cache.keys().next().value);
          cache.set(key, { value, expires: Date.now() + cacheTtlMs });
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, task);
    }
    try {
      res.json(await pending.get(key));
    } catch (error) {
      if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
      res
        .status(error.status || 502)
        .json({
          error:
            error instanceof SourceError
              ? error.message
              : "The source could not be read. Try again later.",
          code: error.code || "SOURCE_INVALID_RESPONSE",
          source: PROVIDERS[source].name,
        });
    }
  });
  return router;
}

export default createSourcesRouter();
