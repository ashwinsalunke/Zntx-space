import express from "express";
import { fetchPublicPdf } from "./public-pdf.js";
import { createHash, randomBytes } from "node:crypto";
import { workspaceToken } from "./storage.js";
import { stripTags } from "./research.js";

const ZOTERO = "https://api.zotero.org";
const MENDELEY = "https://api.mendeley.com";
const DOCUMENT_MEDIA = "application/vnd.mendeley-document.1+json";
const MODE = "read-only-pull";
class SyncError extends Error {
  constructor(status, message, code = "LIBRARY_SYNC_FAILED", retryAfter = 0) { super(message); Object.assign(this, { status, code, retryAfter }); }
}
const clean = (value, limit = 100000) => stripTags(typeof value === "string" || typeof value === "number" ? String(value) : "").slice(0, limit);
const numericId = (value) => /^\d{1,20}$/.test(String(value || "")) ? String(value) : null;
const remoteId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value) ? value : null;
const safeUrl = (value) => {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : ""; } catch { return ""; }
};
const year = (value) => { const found = String(value || "").match(/\b(1\d{3}|2\d{3})\b/); return found ? Number(found[0]) : null; };
const version = (value) => /^\d+$/.test(String(value ?? "")) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sameLibrary = (record, provider, libraryId) => record?.librarySync?.provider === provider && record.librarySync.libraryId === libraryId;

function fixedUrl(value, origin, pathname) {
  let url;
  try { url = new URL(value, origin); } catch { throw new SyncError(502, "The library service returned an invalid pagination link."); }
  if (url.origin !== origin || url.pathname !== pathname || url.username || url.password || url.hash) throw new SyncError(502, "The library service returned an untrusted pagination link.", "UNSAFE_PAGINATION");
  return url.href;
}
function nextLink(response, origin, pathname) {
  const header = response.headers.get("link") || "";
  for (const match of header.matchAll(/<([^>]+)>\s*;\s*rel\s*=\s*"?([^",;]+)"?/gi)) {
    if (match[2].trim().split(/\s+/).includes("next")) return fixedUrl(match[1], origin, pathname);
  }
  return null;
}
async function boundedJson(response) {
  const maximum = 5 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > maximum) throw new SyncError(502, "The library service returned an oversized response.");
  try {
    if (!response.body?.getReader) {
      const text = await response.text();
      if (Buffer.byteLength(text) > maximum) throw new SyncError(502, "The library service returned an oversized response.");
      return JSON.parse(text);
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) { await reader.cancel(); throw new SyncError(502, "The library service returned an oversized response."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError(502, "The library service returned an invalid response.");
  }
}
const zoteroTypes = { journalArticle: "journal-article", conferencePaper: "proceedings-article", bookSection: "book-chapter", book: "book", thesis: "dissertation", report: "report", preprint: "posted-content" };
function zoteroReference(item, secret) {
  const data = item?.data || item;
  const key = remoteId(item?.key || data?.key);
  if (!key || !data || ["note", "attachment", "annotation"].includes(data.itemType) || !clean(data.title)) return null;
  const doi = clean(data.DOI, 500);
  const doiUrl = /^10\.\d{4,9}\/\S+$/i.test(doi) ? `https://doi.org/${doi}` : "";
  return {
    id: `zotero:${secret.libraryType}:${secret.libraryId}:${key}`,
    title: clean(data.title, 3000),
    authors: (Array.isArray(data.creators) ? data.creators : []).filter((creator) => !creator.creatorType || creator.creatorType === "author").map((creator) => clean(creator.name || `${creator.firstName || ""} ${creator.lastName || ""}`, 300)).filter(Boolean).slice(0, 300),
    year: year(data.date), journal: clean(data.publicationTitle || data.proceedingsTitle || data.bookTitle),
    doi, url: safeUrl(doiUrl || data.url || item.links?.alternate?.href),
    abstract: clean(data.abstractNote), type: zoteroTypes[data.itemType] || clean(data.itemType) || "Research paper",
    publisher: clean(data.publisher), isbn: clean(data.ISBN).split(/[;,\s]+/).filter(Boolean), volume: clean(data.volume), issue: clean(data.issue), pages: clean(data.pages),
    source: "Zotero", citations: null, remoteRemoved: data.deleted === 1 || data.deleted === true,
    librarySync: { provider: "zotero", libraryId: secret.libraryId, libraryType: secret.libraryType, remoteId: key, remoteVersion: version(item.version ?? data.version), tags: (Array.isArray(data.tags) ? data.tags : []).map((tag) => clean(tag.tag, 200)).filter(Boolean).slice(0, 200) },
  };
}
function mendeleyReference(item, secret) {
  const id = remoteId(item?.id);
  if (!id || !clean(item.title)) return null;
  const doi = clean(item.identifiers?.doi, 500);
  const doiUrl = /^10\.\d{4,9}\/\S+$/i.test(doi) ? `https://doi.org/${doi}` : "";
  const urls = Array.isArray(item.websites) ? item.websites : [];
  return {
    id: `mendeley:${secret.libraryId}:${id}`, title: clean(item.title, 3000),
    authors: (Array.isArray(item.authors) ? item.authors : []).map((author) => clean(`${author.first_name || ""} ${author.last_name || ""}`, 300)).filter(Boolean).slice(0, 300),
    year: year(item.year), journal: clean(item.source), doi, url: safeUrl(doiUrl || urls[0] || item.link),
    abstract: clean(item.abstract), type: item.type === "journal" ? "journal-article" : clean(item.type) || "Research paper", publisher: clean(item.publisher),
    isbn: item.identifiers?.isbn ? [clean(item.identifiers.isbn, 100)] : [], volume: clean(item.volume), issue: clean(item.issue), pages: clean(item.pages),
    source: "Mendeley", citations: null, remoteRemoved: false,
    librarySync: { provider: "mendeley", libraryId: secret.libraryId, remoteId: id, remoteVersion: clean(item.last_modified, 100), tags: (Array.isArray(item.tags) ? item.tags : []).map((tag) => clean(tag, 200)).slice(0, 200) },
  };
}

/** Source libraries are read only. Only copies in this workspace are written. */
export function createLibrarySyncRouter({ fetchImpl = fetch, loadPdf = fetchPublicPdf, getSecret, setSecret, deleteSecret, listRecords, putRecord, getRecord, tokenFor = workspaceToken, appOrigin = process.env.APP_ORIGIN || "http://127.0.0.1:5173", timeoutMs = 60000, maxRecords = 500, stateTtlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
  for (const fn of [getSecret, setSecret, deleteSecret, listRecords, putRecord]) if (typeof fn !== "function") throw new TypeError("Library sync requires vault and workspace storage functions.");
  const origin = new URL(appOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (origin.protocol === "http:" && !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname))) throw new TypeError("APP_ORIGIN must be a public HTTPS origin or an explicit local HTTP origin.");
  const callbackUrl = `${origin.origin}/api/library-sync/mendeley/callback`;
  const limit = Math.min(500, Math.max(1, Math.floor(Number(maxRecords) || 500)));
  const locks = new Set(), states = new Map();
  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const lockKey = (token, provider) => fingerprint([token, provider]);
  const freshCounts = (provider) => ({ provider, mode: MODE, imported: 0, updated: 0, remoteRemoved: 0, skipped: 0, processed: 0, partial: false, continuationAvailable: false, warnings: [], limit });
  const fail = (res, error) => {
    const known = error instanceof SyncError;
    if (known && error.retryAfter) res.set("Retry-After", String(error.retryAfter));
    res.status(known ? error.status : error.status === 401 ? 401 : 503).json({ error: known || error.status === 401 ? error.message : "Library storage or connection is unavailable. Some references may already be copied; retry to finish. No sync checkpoint was advanced.", code: known ? error.code : "LIBRARY_SYNC_UNAVAILABLE" });
  };
  const route = (fn, provider) => async (req, res) => {
    let key;
    try {
      const token = tokenFor(req);
      const service = provider || req.params.provider;
      if (service && !["zotero", "mendeley"].includes(service)) throw new SyncError(404, "Unknown library provider.");
      if (service) {
        key = lockKey(token, service);
        if (locks.has(key)) { key = null; throw new SyncError(409, "This library already has an operation in progress.", "LIBRARY_SYNC_BUSY"); }
        locks.add(key);
      }
      await fn(req, res, token, service);
    } catch (error) { fail(res, error); } finally { if (key) locks.delete(key); }
  };
  async function request(url, options = {}) {
    let response;
    try { response = await fetchImpl(url, { ...options, redirect: "error", signal: options.signal || AbortSignal.timeout(timeoutMs) }); }
    catch { throw new SyncError(502, "The library service could not be reached. Please retry.", "LIBRARY_UPSTREAM_UNAVAILABLE"); }
    if (!response.ok && response.status !== 304) {
      await response.body?.cancel().catch(() => {});
      const delay = Math.min(3600, Math.max(1, Number(response.headers.get("retry-after")) || 30));
      throw new SyncError(response.status === 429 ? 429 : [401, 403].includes(response.status) ? 403 : 502, response.status === 429 ? "The library service requested a pause. Retry after the indicated delay." : [401, 403].includes(response.status) ? "The library service rejected this connection or its permissions. Reconnect the account." : "The library service could not complete the request. Retry later.", response.status === 429 ? "LIBRARY_RATE_LIMITED" : "LIBRARY_UPSTREAM_ERROR", response.status === 429 ? delay : 0);
    }
    return response;
  }
  async function lookup(token, id, cache) {
    if (cache.has(id)) return cache.get(id);
    if (getRecord) { const value = await getRecord(token, "papers", id); if (value) cache.set(id, value); return value; }
    return null;
  }
  async function saveReference(token, incoming, counts, cache) {
    const existing = await lookup(token, incoming.id, cache);
    if (existing && !sameLibrary(existing, incoming.librarySync.provider, incoming.librarySync.libraryId)) throw new SyncError(409, "A copied reference conflicts with an existing local record. No local record was overwritten.");
    const digest = fingerprint(incoming);
    if (existing?.librarySync?.fingerprint === digest) { counts.skipped += 1; return; }
    const saved = { ...existing, ...incoming, citations: incoming.citations ?? existing?.citations ?? null, createdAt: existing?.createdAt || new Date(now()).toISOString(), librarySync: { ...existing?.librarySync, ...incoming.librarySync, fingerprint: digest, lastSyncedAt: new Date(now()).toISOString() } };
    await putRecord(token, "papers", incoming.id, saved);
    cache.set(saved.id, saved);
    if (incoming.remoteRemoved) counts.remoteRemoved += 1;
    else counts[existing ? "updated" : "imported"] += 1;
  }
  async function markRemoved(token, provider, secret, id, counts, cache) {
    if (!remoteId(id)) { counts.skipped += 1; return; }
    const localId = provider === "zotero" ? `zotero:${secret.libraryType}:${secret.libraryId}:${id}` : `mendeley:${secret.libraryId}:${id}`;
    const existing = await lookup(token, localId, cache);
    if (!existing || !sameLibrary(existing, provider, secret.libraryId) || existing.remoteRemoved) { counts.skipped += 1; return; }
    const saved = { ...existing, remoteRemoved: true, librarySync: { ...existing.librarySync, remoteRemovedAt: new Date(now()).toISOString(), fingerprint: null } };
    await putRecord(token, "papers", localId, saved); cache.set(localId, saved); counts.remoteRemoved += 1;
  }
  async function persistProgress(token, provider, secret, counts, continuation, finished) {
    secret.partial = !finished;
    secret.continuation = continuation;
    if (finished) secret.lastSyncAt = new Date(now()).toISOString();
    await setSecret(token, provider, secret);
    return { ...counts, partial: !finished, continuationAvailable: !finished, lastSyncAt: secret.lastSyncAt || null, ...(provider === "zotero" ? { version: secret.version || 0 } : {}) };
  }
  async function zoteroRead(token, secret, url, signal, conditional = false) {
    const headers = { "Zotero-API-Key": secret.apiKey, "Zotero-API-Version": "3", Accept: "application/json" };
    if (conditional && secret.version > 0) headers["If-Modified-Since-Version"] = String(secret.version);
    let response;
    try { response = await request(url, { headers, signal }); }
    catch (error) { if (error.retryAfter) { secret.backoffUntil = now() + error.retryAfter * 1000; await setSecret(token, "zotero", secret); } throw error; }
    const backoff = Number(response.headers.get("backoff"));
    if (backoff > 0) secret.backoffUntil = now() + Math.min(3600, backoff) * 1000;
    return response;
  }
  async function syncZotero(token, secret) {
    if (secret.backoffUntil > now()) throw new SyncError(429, "Zotero requested a pause before the next request.", "LIBRARY_RATE_LIMITED", Math.ceil((secret.backoffUntil - now()) / 1000));
    const signal = AbortSignal.timeout(timeoutMs), counts = freshCounts("zotero");
    const cache = new Map((await listRecords(token, "papers")).map((paper) => [paper.id, paper]));
    const prefix = `/${secret.libraryType}/${secret.libraryId}`;
    const base = secret.version || 0;
    let continuation = secret.continuation?.base === base ? secret.continuation : null;
    let target = continuation?.target ?? null;
    let phase = continuation?.phase || "items";
    let url = continuation?.nextUrl || `${ZOTERO}${prefix}/items?format=json&includeTrashed=1&limit=${Math.min(100, limit)}&since=${base}`;
    let deletedOffset = continuation?.deletedOffset || 0;
    const changed = async () => {
      counts.warnings.push("The Zotero library changed during pagination. Its final version was not advanced; continue to safely recheck changes.");
      return persistProgress(token, "zotero", secret, counts, null, false);
    };
    const checkVersion = (response) => {
      const current = version(response.headers.get("last-modified-version"));
      if (current == null) throw new SyncError(502, "Zotero did not supply a safe library version. Retry without advancing the sync checkpoint.");
      if (target == null) target = current;
      return current === target;
    };
    if (phase === "items") {
      const visited = new Set();
      while (url) {
        fixedUrl(url, ZOTERO, `${prefix}/items`);
        if (counts.processed > 0 && limit - counts.processed < Math.min(100, limit)) return persistProgress(token, "zotero", secret, counts, { phase: "items", nextUrl: url, base, target }, false);
        if (visited.has(url)) throw new SyncError(502, "Zotero returned a repeated pagination link.");
        visited.add(url);
        const response = await zoteroRead(token, secret, url, signal, !continuation && counts.processed === 0);
        if (response.status === 304) return persistProgress(token, "zotero", secret, counts, null, true);
        if (!checkVersion(response)) return changed();
        const items = await boundedJson(response);
        if (!Array.isArray(items) || items.length > Math.min(100, limit)) throw new SyncError(502, "Zotero returned an invalid reference page.");
        const next = nextLink(response, ZOTERO, `${prefix}/items`);
        for (const item of items) {
          const incoming = zoteroReference(item, secret);
          if (incoming) await saveReference(token, incoming, counts, cache); else counts.skipped += 1;
          counts.processed += 1;
        }
        url = next;
        if (url && (counts.processed >= limit || secret.backoffUntil > now())) return persistProgress(token, "zotero", secret, counts, { phase: "items", nextUrl: url, base, target }, false);
      }
      phase = "deleted";
    }
    if (secret.backoffUntil > now()) return persistProgress(token, "zotero", secret, counts, { phase: "deleted", base, target, deletedOffset }, false);
    const deleted = await zoteroRead(token, secret, `${ZOTERO}${prefix}/deleted?since=${base}`, signal);
    if (!checkVersion(deleted)) return changed();
    const payload = await boundedJson(deleted);
    if (!Array.isArray(payload.items)) throw new SyncError(502, "Zotero returned an invalid deletion list.");
    while (deletedOffset < payload.items.length && counts.processed < limit) {
      await markRemoved(token, "zotero", secret, payload.items[deletedOffset++], counts, cache); counts.processed += 1;
    }
    if (deletedOffset < payload.items.length) return persistProgress(token, "zotero", secret, counts, { phase: "deleted", base, target, deletedOffset }, false);
    secret.version = target;
    return persistProgress(token, "zotero", secret, counts, null, true);
  }
  async function tokenExchange(secret, fields, signal) {
    const response = await request(`${MENDELEY}/oauth/token`, { method: "POST", signal, headers: { Authorization: `Basic ${Buffer.from(`${secret.clientId}:${secret.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ ...fields, redirect_uri: callbackUrl }).toString() });
    const payload = await boundedJson(response);
    const validToken = (value) => typeof value === "string" && value.length > 0 && value.length <= 16384 && !/[\u0000-\u0020\u007f]/.test(value);
    if (!validToken(payload.access_token) || (payload.refresh_token != null && !validToken(payload.refresh_token)) || !Number.isFinite(Number(payload.expires_in)) || Number(payload.expires_in) <= 0) throw new SyncError(502, "Mendeley returned an invalid authorization response.");
    return { ...secret, accessToken: payload.access_token, refreshToken: payload.refresh_token || secret.refreshToken || "", expiresAt: now() + Math.min(31536000, Number(payload.expires_in)) * 1000, pendingAuthorization: false };
  }
  async function syncMendeley(token, secret) {
    const signal = AbortSignal.timeout(timeoutMs), counts = freshCounts("mendeley");
    const cache = new Map((await listRecords(token, "papers")).map((paper) => [paper.id, paper]));
    let refreshed = false;
    const refresh = async () => {
      if (refreshed || !secret.refreshToken) throw new SyncError(403, "Reconnect Mendeley to renew permission for this library.");
      secret = await tokenExchange(secret, { grant_type: "refresh_token", refresh_token: secret.refreshToken }, signal);
      await setSecret(token, "mendeley", secret); refreshed = true;
    };
    if (!secret.accessToken || secret.expiresAt <= now() + 30000) await refresh();
    const read = async (url, media) => {
      const options = () => ({ headers: { Authorization: `Bearer ${secret.accessToken}`, Accept: media }, signal, redirect: "error" });
      let response;
      try { response = await fetchImpl(url, options()); } catch { throw new SyncError(502, "Mendeley could not be reached. Please retry."); }
      if (response.status === 401) { await response.body?.cancel().catch(() => {}); await refresh(); try { response = await fetchImpl(url, options()); } catch { throw new SyncError(502, "Mendeley could not be reached. Please retry."); } }
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new SyncError(response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 403 : 502, response.status === 429 ? "Mendeley requested a pause. Retry later." : "Mendeley could not read this library. Reconnect or retry later.", "LIBRARY_UPSTREAM_ERROR", response.status === 429 ? Math.min(3600, Number(response.headers.get("retry-after")) || 30) : 0); }
      return response;
    };
    const base = secret.since || "";
    const continuation = secret.continuation?.base === base ? secret.continuation : null;
    const target = continuation?.target || new Date(now() - 60000).toISOString();
    const phases = ["documents", "trash", "deleted_documents"];
    let phaseIndex = Math.max(0, phases.indexOf(continuation?.phase || "documents"));
    let next = continuation?.nextUrl || null;
    let itemOffset = continuation?.itemOffset || 0;
    let pageFingerprint = continuation?.pageFingerprint || null;
    for (; phaseIndex < phases.length; phaseIndex++) {
      const phase = phases[phaseIndex], path = `/${phase}`;
      const params = new URLSearchParams({ limit: String(Math.min(100, limit)) });
      if (phase !== "deleted_documents") params.set("view", "all");
      if (base) params.set(phase === "documents" ? "modified_since" : phase === "trash" ? "deleted_since" : "since", base);
      if (phase === "documents") { params.set("sort", "last_modified"); params.set("order", "asc"); }
      let url = next || `${MENDELEY}${path}?${params}`;
      const visited = new Set();
      while (url) {
        fixedUrl(url, MENDELEY, path);
        if (visited.has(url)) throw new SyncError(502, "Mendeley returned a repeated pagination link.");
        visited.add(url);
        const response = await read(url, phase === "deleted_documents" ? "application/vnd.mendeley-deleted-document.1+json" : DOCUMENT_MEDIA);
        const items = await boundedJson(response);
        if (!Array.isArray(items) || items.length > 20000 || (phase !== "deleted_documents" && items.length > 500)) throw new SyncError(502, "Mendeley returned an invalid reference page.");
        const following = nextLink(response, MENDELEY, path);
        const digest = fingerprint(items);
        if (pageFingerprint && digest !== pageFingerprint) { itemOffset = 0; counts.warnings.push("The source page changed while a batch was paused. It is being rechecked before advancing the checkpoint."); }
        let offset = itemOffset;
        while (offset < items.length && counts.processed < limit) {
          const item = items[offset++];
          if (phase === "documents") { const incoming = mendeleyReference(item, secret); if (incoming) await saveReference(token, incoming, counts, cache); else counts.skipped += 1; }
          else await markRemoved(token, "mendeley", secret, typeof item === "string" ? item : item.document_id || item.id, counts, cache);
          counts.processed += 1;
        }
        if (offset < items.length) return persistProgress(token, "mendeley", secret, counts, { phase, nextUrl: url, itemOffset: offset, pageFingerprint: digest, base, target }, false);
        itemOffset = 0; pageFingerprint = null;
        url = following;
        if (counts.processed >= limit && (url || phaseIndex < phases.length - 1)) return persistProgress(token, "mendeley", secret, counts, { phase: url ? phase : phases[phaseIndex + 1], nextUrl: url, base, target }, false);
      }
      next = null;
    }
    secret.since = target;
    return persistProgress(token, "mendeley", secret, counts, null, true);
  }
  router.get("/status", route(async (_req, res, token) => {
    const [zotero, mendeley] = await Promise.all([getSecret(token, "zotero"), getSecret(token, "mendeley")]);
    const safeStatus = (secret) => ({ connected: !!(secret?.apiKey || secret?.accessToken), pendingAuthorization: !!secret?.pendingAuthorization, libraryId: secret?.libraryId || null, libraryType: secret?.libraryType || null, username: secret?.username || null, lastSyncAt: secret?.lastSyncAt || null, partial: !!secret?.partial, continuationAvailable: !!secret?.partial });
    res.json({ mode: MODE, callbackUrl, limit, zotero: { ...safeStatus(zotero), version: zotero?.version || 0 }, mendeley: safeStatus(mendeley) });
  }));
  router.post("/zotero/connect", route(async (req, res, token) => {
    const apiKey = req.body?.apiKey;
    if (typeof apiKey !== "string" || !/^[A-Za-z0-9]{16,128}$/.test(apiKey)) throw new SyncError(400, "Enter a valid Zotero API key.", "INVALID_INPUT");
    const libraryType = req.body.libraryType || "users";
    if (!["users", "groups"].includes(libraryType)) throw new SyncError(400, "Choose a user or group Zotero library.", "INVALID_INPUT");
    const response = await request(`${ZOTERO}/keys/current`, { headers: { "Zotero-API-Key": apiKey, "Zotero-API-Version": "3", Accept: "application/json" } });
    const account = await boundedJson(response);
    const libraryId = numericId(req.body.libraryId || (libraryType === "users" ? account.userID : null));
    if (!libraryId) throw new SyncError(400, "A numeric library ID is required for this Zotero library.", "INVALID_INPUT");
    const allowed = libraryType === "users" ? account.access?.user?.library === true && libraryId === String(account.userID) : account.access?.groups?.[libraryId]?.library === true || account.access?.groups?.all?.library === true;
    if (!allowed) throw new SyncError(403, "This key does not grant read access to the selected Zotero library.", "LIBRARY_PERMISSION_DENIED");
    const previous = await getSecret(token, "zotero");
    const same = previous?.libraryId === libraryId && previous?.libraryType === libraryType;
    const secret = { ...(same ? previous : {}), apiKey, libraryId, libraryType, username: clean(account.username, 200), version: same ? previous.version || 0 : 0 };
    const backoff = Number(response.headers.get("backoff")); if (backoff > 0) secret.backoffUntil = now() + Math.min(3600, backoff) * 1000;
    await setSecret(token, "zotero", secret);
    res.json({ connected: true, provider: "zotero", mode: MODE, libraryId, libraryType, username: secret.username });
  }, "zotero"));
  router.get(
    "/mendeley/documents/:id/pdf",
    route(async (req, res, token) => {
      const documentId = remoteId(req.params.id);
      if (!documentId)
        throw new SyncError(400, "Choose a valid Mendeley document.");
      let secret = await getSecret(token, "mendeley");
      if (!secret?.accessToken)
        throw new SyncError(
          403,
          "Connect Mendeley in Integrations before opening its attachments.",
        );
      const signal = AbortSignal.timeout(timeoutMs);
      let refreshed = false;
      const refresh = async () => {
        if (refreshed || !secret.refreshToken)
          throw new SyncError(
            403,
            "Reconnect Mendeley to read its attachments.",
          );
        secret = await tokenExchange(
          secret,
          { grant_type: "refresh_token", refresh_token: secret.refreshToken },
          signal,
        );
        await setSecret(token, "mendeley", secret);
        refreshed = true;
      };
      if (secret.expiresAt <= now() + 30000) await refresh();
      const read = async (url, manual = false) => {
        const options = () => ({
          redirect: manual ? "manual" : "error",
          signal,
          headers: {
            Authorization: `Bearer ${secret.accessToken}`,
            Accept: "application/vnd.mendeley-file.1+json",
          },
        });
        let response = await fetchImpl(url, options());
        if (response.status === 401) {
          await response.body?.cancel();
          await refresh();
          response = await fetchImpl(url, options());
        }
        if (!response.ok && !(manual && response.status === 303)) {
          await response.body?.cancel();
          throw new SyncError(
            502,
            "Mendeley could not provide this attachment. Reconnect or check access in your library.",
          );
        }
        return response;
      };
      let next = `${MENDELEY}/files?${new URLSearchParams({ document_id: documentId, limit: "100" })}`,
        file;
      for (let page = 0; next && page < 5; page++) {
        const response = await read(next);
        const files = await boundedJson(response);
        if (!Array.isArray(files))
          throw new SyncError(
            502,
            "Mendeley returned an unreadable attachment list.",
          );
        file = files.find(
          (f) =>
            f.document_id === documentId &&
            f.mime_type === "application/pdf" &&
            remoteId(f.id),
        );
        if (file) break;
        next = nextLink(response, MENDELEY, "/files");
        if (
          next &&
          new URL(next).searchParams.get("document_id") !== documentId
        )
          throw new SyncError(
            502,
            "Mendeley returned an unexpected attachment page.",
          );
      }
      if (!file)
        throw new SyncError(
          404,
          "No PDF attachment was found for this Mendeley reference. Open the original source to check availability.",
        );
      if (Number(file.size) > 20 * 1024 * 1024)
        throw new SyncError(
          413,
          "This attachment exceeds the 20 MB reader limit.",
        );
      const response = await read(`${MENDELEY}/files/${file.id}`, true);
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (response.status !== 303 || !location)
        throw new SyncError(
          502,
          "Mendeley did not provide its signed PDF download link.",
        );
      // Never forward the bearer token to the signed storage location or expose that URL.
      let bytes;
      try {
        bytes = await loadPdf(location);
      } catch {
        throw new SyncError(
          502,
          "The Mendeley PDF download failed. Retry or download it from Mendeley directly.",
        );
      }
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="mendeley-paper.pdf"',
          "Cache-Control": "no-store",
        })
        .send(bytes);
    }, "mendeley"),
  );
  router.post("/mendeley/connect", route(async (req, res, token) => {
    const clientId = req.body?.clientId, clientSecret = req.body?.clientSecret;
    if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId) || typeof clientSecret !== "string" || !/^[\x21-\x7e]{8,512}$/.test(clientSecret)) throw new SyncError(400, "Enter the client ID and secret from your registered Mendeley application.", "INVALID_INPUT");
    for (const [state, value] of states) if (value.expiresAt <= now() || value.token === token) states.delete(state);
    if (states.size >= 1000) throw new SyncError(429, "Too many authorization attempts are pending. Retry later.");
    const state = randomBytes(32).toString("base64url"), attemptId = randomBytes(16).toString("hex");
    const previous = await getSecret(token, "mendeley");
    await setSecret(token, "mendeley", { ...previous, pendingAuthorization: true, attemptId, pendingClient: {clientId, clientSecret} });
    states.set(state, { token, expiresAt: now() + stateTtlMs, attemptId });
    const url = new URL(`${MENDELEY}/oauth/authorize`);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl, response_type: "code", scope: "all", state }).toString();
    res.json({ provider: "mendeley", authorizationUrl: url.href, callbackUrl, expiresAt: new Date(now() + stateTtlMs).toISOString(), mode: MODE, note: "Mendeley requires account consent with its all scope. scrapeTx only reads references; it does not write to your Mendeley library." });
  }, "mendeley"));
  router.get("/mendeley/callback", async (req, res) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const pending = states.get(state);
    states.delete(state); // Every callback consumes the attempt, including failures.
    const redirect = (status) => res.redirect(303, `${origin.origin}/integrations?mendeley=${status}`);
    if (!pending || pending.expiresAt <= now() || req.query.error || typeof req.query.code !== "string" || !req.query.code || req.query.code.length > 2048) return redirect("error");
    const key = lockKey(pending.token, "mendeley");
    if (locks.has(key)) return redirect("error");
    locks.add(key);
    try {
      const saved = await getSecret(pending.token, "mendeley");
      if (!saved || saved.attemptId !== pending.attemptId) return redirect("error");
      const credentials = saved.pendingClient || saved;
      let secret = await tokenExchange({clientId:credentials.clientId,clientSecret:credentials.clientSecret}, { grant_type: "authorization_code", code: req.query.code }, AbortSignal.timeout(timeoutMs));
      const profileResponse = await request(`${MENDELEY}/profiles/me`, { headers: { Authorization: `Bearer ${secret.accessToken}`, Accept: "application/vnd.mendeley-profiles.1+json" } });
      const profile = await boundedJson(profileResponse), libraryId = remoteId(profile.id);
      if (!libraryId) throw new SyncError(502, "Mendeley did not identify the authorized library.");
      secret = { ...secret, libraryId, username: clean(profile.display_name || `${profile.first_name || ""} ${profile.last_name || ""}`, 200) };
      delete secret.attemptId;
      await setSecret(pending.token, "mendeley", secret);
      return redirect("connected");
    } catch { return redirect("error"); } finally {
      // A failed replacement authorization must not destroy a working account.
      try {
        const current=await getSecret(pending.token,"mendeley");
        if(current?.attemptId === pending.attemptId) {
          delete current.attemptId;delete current.pendingClient;delete current.pendingAuthorization;
          if(current.accessToken) await setSecret(pending.token,"mendeley",current);
          else await deleteSecret(pending.token,"mendeley");
        }
      } catch { /* Existing credentials remain available if cleanup storage is temporarily unavailable. */ }
      locks.delete(key);
    }
  });
  const sync = route(async (_req, res, token, provider) => {
    const secret = await getSecret(token, provider);
    if (!secret || (provider === "zotero" ? !secret.apiKey : !secret.accessToken || !secret.libraryId)) throw new SyncError(409, `Connect ${provider === "zotero" ? "Zotero" : "Mendeley"} before syncing.`, "LIBRARY_NOT_CONNECTED");
    res.json(await (provider === "zotero" ? syncZotero(token, secret) : syncMendeley(token, secret)));
  });
  router.post("/:provider/sync", sync);
  router.get("/:provider/sync", sync);
  router.delete("/:provider", route(async (_req, res, token, provider) => {
    await deleteSecret(token, provider);
    if (provider === "mendeley") for (const [state, pending] of states) if (pending.token === token) states.delete(state);
    res.json({ provider, connected: false, copiesPreserved: true });
  }));
  router.use((error, _req, res, next) => {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") return res.status(error.status === 413 ? 413 : 400).json({ error: "Send a valid JSON connection request smaller than 16 KB.", code: "INVALID_INPUT" });
    next(error);
  });
  return router;
}

export default createLibrarySyncRouter;
