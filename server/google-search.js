import express from "express";
import { createHash } from "node:crypto";
import { externalSearchUrl, safeSourceUrl } from "./sources.js";

// SerpAPI is a third-party provider. This adapter does not call a Google API or
// download original pages, abstracts, full articles, or patent documents.
const PROVIDER = "SerpAPI";
const ENDPOINT = "https://serpapi.com/search.json";
const SOURCES = Object.freeze({
  google: { name: "Google Search", engine: "google", docs: "https://serpapi.com/search-api" },
  scholar: { name: "Google Scholar", engine: "google_scholar", docs: "https://serpapi.com/google-scholar-api" },
  patents: { name: "Google Patents", engine: "google_patents", docs: "https://serpapi.com/google-patents-api" },
});
const digest = (value) => createHash("sha256").update(value).digest("hex");
const plain = (value, max = 3000) => typeof value === "string" || typeof value === "number"
  ? String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  : "";
const numeric = (value, fallback = null) => {
  const number = typeof value === "number" || typeof value === "string" ? Number(String(value).replaceAll(",", "")) : NaN;
  return String(value ?? "").trim() && Number.isSafeInteger(number) && number >= 0 ? number : fallback;
};
const sourceYear = (value) => {
  const match = String(value || "").match(/\b((?:1[5-9]|20)\d{2})\b/);
  return match ? Number(match[1]) : null;
};
const date = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
const doiValue = (value) => {
  const doi = plain(value, 512).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : "";
};
function originalLink(value) {
  const link = safeSourceUrl(value);
  if (!link) return "";
  const parsed = new URL(link);
  return parsed.hostname === "serpapi.com" || parsed.hostname.endsWith(".serpapi.com") ? "" : link;
}
function suppliedDoi(record, url) {
  const explicit = doiValue(record.doi);
  if (explicit) return explicit;
  const parsed = new URL(url);
  if (!["doi.org", "dx.doi.org"].includes(parsed.hostname.toLowerCase())) return "";
  try { return doiValue(decodeURIComponent(parsed.pathname.slice(1))); } catch { return ""; }
}

export class GoogleSearchError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    Object.assign(this, { status, code, retryAfter });
  }
}

export function normalizeGoogleResults(source, data) {
  if (!Object.hasOwn(SOURCES, source) || !data || typeof data !== "object" || Array.isArray(data) ||
      (data.organic_results !== undefined && !Array.isArray(data.organic_results)) ||
      (!Array.isArray(data.organic_results) && data.search_metadata?.status !== "Success"))
    throw new GoogleSearchError(502, "SOURCE_INVALID_RESPONSE", "SerpAPI returned an unreadable search result.");
  const seen = new Set();
  const results = (data.organic_results || []).slice(0, 20).flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    // A patent search is deliberately restricted to patents, not mixed-in
    // Scholar records; each source keeps its own interpretation and fields.
    if (source === "patents" && record.is_scholar) return [];
    const title = plain(record.title, 1200);
    const url = originalLink(source === "patents" ? record.patent_link : record.link);
    if (!title || !url || seen.has(url)) return [];
    seen.add(url);
    const snippet = plain(record.snippet, 6000);
    const summary = source === "scholar" ? plain(record.publication_info?.summary, 2000) : "";
    const publicationDate = source === "patents" ? date(record.publication_date) : "";
    const authors = source === "scholar"
      ? (Array.isArray(record.publication_info?.authors) ? record.publication_info.authors : []).slice(0, 60).map((author) => plain(author?.name, 250)).filter(Boolean)
      : source === "patents" && plain(record.inventor, 1000) ? [plain(record.inventor, 1000)] : [];
    const result = {
      id: `serpapi-${source}-${digest(url).slice(0, 24)}`,
      title, url, authors,
      year: source === "patents" ? sourceYear(publicationDate) : source === "scholar" ? sourceYear(record.publication_info?.year || summary) : sourceYear(record.date),
      // Keep snippets separate: they must never masquerade as full abstracts.
      abstract: "", snippet, description: snippet, contentType: "search-snippet",
      source: SOURCES[source].name, provider: PROVIDER,
      type: source === "patents" ? "patent" : source === "scholar" ? "scholarly-result" : "webpage",
      citations: source === "scholar" ? numeric(record.inline_links?.cited_by?.total) : null,
      openAccess: false,
    };
    if (source === "scholar") {
      result.publicationInfo = summary;
      const doi = suppliedDoi(record, url);
      if (doi) result.doi = doi;
      const resource = (Array.isArray(record.resources) ? record.resources : []).find((item) => item?.file_format === "PDF" && originalLink(item.link));
      if (resource) result.pdf = originalLink(resource.link);
    } else if (source === "patents") {
      result.publicationNumber = plain(record.publication_number, 100);
      result.inventor = plain(record.inventor, 1000);
      result.assignee = plain(record.assignee, 1000);
      result.publicationDate = publicationDate;
      result.priorityDate = date(record.priority_date);
      result.filingDate = date(record.filing_date);
      result.grantDate = date(record.grant_date);
      const pdf = originalLink(record.pdf);
      if (pdf) result.pdf = pdf;
    } else result.searchDateLabel = plain(record.date, 100);
    return [result];
  });
  return { results, total: numeric(data.search_information?.total_results, results.length) };
}

function queryArguments(query) {
  const allowed = new Set(["source", "q", "yearFrom", "yearTo"]);
  if (Object.keys(query).some((key) => !allowed.has(key)))
    throw new GoogleSearchError(400, "INVALID_QUERY", "Only source, q, yearFrom, and yearTo search parameters are supported.");
  if (typeof query.source !== "string" || !Object.hasOwn(SOURCES, query.source))
    throw new GoogleSearchError(400, "UNSUPPORTED_SOURCE", "Choose Google Search, Google Scholar, or Google Patents.");
  if (typeof query.q !== "string" || !query.q.trim() || query.q.length > 300 || /[\u0000-\u001f\u007f]/.test(query.q))
    throw new GoogleSearchError(400, "INVALID_QUERY", "Enter a search query of 1–300 characters.");
  const parseYear = (value) => {
    if (value === undefined || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}$/.test(value) || Number(value) < 1000 || Number(value) > new Date().getUTCFullYear() + 1)
      throw new GoogleSearchError(400, "INVALID_YEAR", "Use a four-digit year no later than next year.");
    return Number(value);
  };
  const yearFrom = parseYear(query.yearFrom), yearTo = parseYear(query.yearTo);
  if (yearFrom && yearTo && yearFrom > yearTo)
    throw new GoogleSearchError(400, "INVALID_YEAR_RANGE", "The starting year must not be after the ending year.");
  if (query.source === "google" && (yearFrom || yearTo))
    throw new GoogleSearchError(400, "UNSUPPORTED_FILTER", "Year filters are available for Scholar and patent searches in this connection. Remove the year filters for Google Search.");
  return { source: query.source, query: query.q.trim(), yearFrom, yearTo };
}

const limitedRetryAfter = (response) => Math.min(300, Math.max(1, Number(response.headers.get("retry-after")) || 30));
function providerFailure(status, data, response) {
  const message = typeof data?.error === "string" ? data.error : "";
  if (status === 401 || status === 403 || /invalid api key|unauthorized|api key.*(?:invalid|permission)/i.test(message))
    return new GoogleSearchError(503, "CONNECTION_AUTH_FAILED", "SerpAPI could not authenticate this connection. Update the key in Integrations.");
  if (status === 429 || /run out of searches|quota|searches.*(?:exhausted|remaining)|too many requests|rate limit/i.test(message)) {
    const exhausted = /run out of searches|quota|exhausted|no searches|monthly|credits/i.test(message);
    return new GoogleSearchError(503, exhausted ? "PROVIDER_QUOTA_EXCEEDED" : "PROVIDER_RATE_LIMIT", exhausted ? "The SerpAPI search allowance is exhausted. Check the provider account or try after its allowance resets." : "SerpAPI is limiting requests. Wait before trying again.", limitedRetryAfter(response));
  }
  if ([408, 504].includes(status)) return new GoogleSearchError(504, "PROVIDER_TIMEOUT", "The search provider timed out. Try again later.", 30);
  if (status >= 500) return new GoogleSearchError(502, "PROVIDER_UNAVAILABLE", "SerpAPI is temporarily unavailable. Try again later.", 30);
  return new GoogleSearchError(502, status >= 400 ? "PROVIDER_REQUEST_REJECTED" : "PROVIDER_SEARCH_FAILED", "SerpAPI could not complete this search. Check the query or try again later.");
}

async function boundedJson(response, maxBytes, signal) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new GoogleSearchError(413, "SOURCE_TOO_LARGE", "The search response exceeds the metadata size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GoogleSearchError(502, "SOURCE_INVALID_RESPONSE", "The search provider returned an empty response.");
  const cancelOnAbort = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", cancelOnAbort, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0, body = "";
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new GoogleSearchError(413, "SOURCE_TOO_LARGE", "The search response exceeds the metadata size limit.");
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    try { return JSON.parse(body); } catch {
      if (!response.ok) return {};
      throw new GoogleSearchError(502, "SOURCE_INVALID_RESPONSE", "SerpAPI returned unreadable JSON metadata.");
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
    reader.releaseLock();
  }
}

// Defense in depth: upstream fields (including original URLs) cannot echo the
// account key into API output. Provider search/archive URLs are never forwarded.
function redactOutput(value, credential) {
  if (typeof value === "string") {
    const variants = [...new Set([credential, encodeURIComponent(credential)])];
    return variants.reduce((text, secret) => secret ? text.split(secret).join("[redacted]") : text, value);
  }
  if (Array.isArray(value)) return value.map((item) => redactOutput(item, credential));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactOutput(item, credential)]));
  return value;
}

export function createGoogleSearchRouter({
  fetchImpl = globalThis.fetch,
  getCredential = () => process.env.SERPAPI_API_KEY || null,
  getCacheScope = (req) => req.get("X-Workspace-Token") || "server",
  timeoutMs = 20000,
  maxBytes = 2000000,
  cacheTtlMs = 120000,
  maxCacheEntries = 80,
  maxConcurrent = 4,
  maxConcurrentPerCredential = 2,
} = {}) {
  const router = express.Router();
  const cache = new Map(), pending = new Map(), accountCounts = new Map();
  async function search(args, credential) {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ engine: SOURCES[args.source].engine, q: args.query, api_key: credential, hl: "en", num: "20" });
    if (args.source === "scholar") {
      if (args.yearFrom) url.searchParams.set("as_ylo", String(args.yearFrom));
      if (args.yearTo) url.searchParams.set("as_yhi", String(args.yearTo));
    } else if (args.source === "patents") {
      url.searchParams.set("patents", "true");
      url.searchParams.set("scholar", "false");
      if (args.yearFrom) url.searchParams.set("after", `publication:${args.yearFrom}0101`);
      if (args.yearTo) url.searchParams.set("before", `publication:${args.yearTo}1231`);
    }
    const controller = new AbortController();
    let timer;
    const expired = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new GoogleSearchError(504, "PROVIDER_TIMEOUT", "The search provider timed out. Try again later.", 30));
      }, timeoutMs);
    });
    const request = (async () => {
      const response = await fetchImpl(url.href, { headers: { Accept: "application/json" }, redirect: "error", signal: controller.signal });
      const data = await boundedJson(response, maxBytes, controller.signal);
      if (!response.ok) throw providerFailure(response.status, data, response);
      const emptySuccess = data?.search_metadata?.status === "Success" &&
        (/fully empty/i.test(data.search_information?.organic_results_state || "") || /(?:hasn.t returned|no|has not returned) any results|hasn.t returned any results|no results/i.test(String(data.error || "")));
      if ((data?.error && !emptySuccess) || ["Error", "Processing", "Queued"].includes(data?.search_metadata?.status))
        throw providerFailure(200, data, response);
      const normalized = normalizeGoogleResults(args.source, data);
      const warnings = [
        "Retrieved through SerpAPI, a third-party search provider; this is not an official Google API connection.",
        "Descriptions are search snippets, not full abstracts or complete documents. Open each original source to verify its content.",
        "Search result totals are estimates supplied by the provider. Only the first page (up to 20 records) is returned.",
      ];
      if (args.source === "scholar") warnings.push("Scholar may return articles, books, preprints, or other scholarly works. A PDF link does not establish open access or permission to reuse.");
      if (args.source === "patents") warnings.push("Patent publication metadata are returned. Legal status, claim scope, novelty, and clinical effectiveness have not been assessed.");
      return redactOutput({ ...normalized, ...args, source: SOURCES[args.source].name, sourceId: args.source, provider: PROVIDER, providerType: "third-party", mode: "api", retrievedAt: new Date().toISOString(), warnings, documentation: SOURCES[args.source].docs, externalSearchUrl: externalSearchUrl(args.source, args.query) }, credential);
    })();
    try { return await Promise.race([request, expired]); }
    catch (error) {
      if (error instanceof GoogleSearchError) throw error;
      if (controller.signal.aborted || ["AbortError", "TimeoutError"].includes(error?.name)) throw new GoogleSearchError(504, "PROVIDER_TIMEOUT", "The search provider timed out. Try again later.", 30);
      throw new GoogleSearchError(502, "PROVIDER_UNAVAILABLE", "SerpAPI could not be reached. Try again later.");
    } finally { clearTimeout(timer); }
  }

  router.get("/search", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let args, credential;
    try {
      args = queryArguments(req.query);
      try { credential = await getCredential(req, "serpapi"); }
      catch (error) {
        if (error?.status === 401) throw new GoogleSearchError(401, "INVALID_WORKSPACE", "A valid browser workspace is required. Refresh the application.");
        throw new GoogleSearchError(503, "CONNECTION_UNAVAILABLE", "The private SerpAPI connection could not be read. Check Integrations.");
      }
      if (typeof credential !== "string" || !credential.trim()) throw new GoogleSearchError(503, "CONNECTION_REQUIRED", "Connect a SerpAPI key in Integrations to retrieve Google, Scholar, and patent results inside the app.");
      credential = credential.trim();
      if (credential.length > 512 || /[\u0000-\u0020\u007f]/.test(credential)) throw new GoogleSearchError(503, "CONNECTION_AUTH_FAILED", "The saved SerpAPI key is invalid. Update it in Integrations.");
      const account = digest(credential);
      const key = digest(`${String(await getCacheScope(req))}\n${account}\n${JSON.stringify(args)}`);
      const now = Date.now();
      const stored = cache.get(key);
      if (stored && stored.expires > now) return res.json({ ...stored.value, cached: true });
      if (stored) cache.delete(key);
      if (!pending.has(key)) {
        if (pending.size >= maxConcurrent || (accountCounts.get(account) || 0) >= maxConcurrentPerCredential)
          throw new GoogleSearchError(503, "PROVIDER_BUSY", "The search connection is busy. Try again shortly.", 2);
        accountCounts.set(account, (accountCounts.get(account) || 0) + 1);
        const task = search(args, credential).then((value) => {
          if (maxCacheEntries > 0 && cacheTtlMs > 0) {
            if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value);
            cache.set(key, { value, expires: Date.now() + cacheTtlMs });
          }
          return value;
        }).finally(() => {
          pending.delete(key);
          const left = (accountCounts.get(account) || 1) - 1;
          if (left) accountCounts.set(account, left); else accountCounts.delete(account);
        });
        pending.set(key, task);
      }
      res.json(await pending.get(key));
    } catch (error) {
      const known = error instanceof GoogleSearchError;
      if (known && error.retryAfter) res.set("Retry-After", String(error.retryAfter));
      const payload = { error: known ? error.message : "The search could not be completed. Try again later.", code: known ? error.code : "PROVIDER_UNAVAILABLE", provider: PROVIDER, ...(args ? { source: SOURCES[args.source].name, sourceId: args.source, externalSearchUrl: externalSearchUrl(args.source, args.query) } : {}) };
      res.status(known ? error.status : 502).json(typeof credential === "string" ? redactOutput(payload, credential.trim()) : payload);
    }
  });
  return router;
}

export default createGoogleSearchRouter;
