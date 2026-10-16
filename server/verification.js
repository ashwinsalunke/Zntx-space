import express from "express";

const DOCS = {
  crossref: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/",
  updates: "https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/",
  crossmark: "https://www.crossref.org/services/crossmark/",
  pubmed: "https://pubmed.ncbi.nlm.nih.gov/",
  nlm: "https://www.ncbi.nlm.nih.gov/nlmcatalog/",
  fda: "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm",
};
export const VERIFICATION_LIMITATION = "These checks compare bibliographic metadata, indexed publication notices, journal indexing, and regulatory records. They do not verify scientific accuracy, peer review, clinical usefulness, or safety for an individual.";
const asText = (value, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values)];
const dateValue = (value) => /^\d{8}$/.test(value || "") ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : null;
const urlWith = (url, params) => { const parsed = new URL(url); parsed.search = new URLSearchParams(params); return parsed.href; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class VerificationError extends Error {
  constructor(message, code = "PROVIDER_UNAVAILABLE", status = 502) { super(message); Object.assign(this, { code, status }); }
}

export function verificationDoi(value) {
  if (typeof value !== "string" || value.length > 512 || /[\u0000-\u0020\u007f<>"?#\\]/.test(value.trim())) return "";
  const doi = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:/i, "").toLowerCase();
  return /^10\.\d{4,9}\/\S{1,450}$/i.test(doi) ? doi : "";
}
const doiUrl = (doi) => verificationDoi(doi) ? "https://doi.org/" + verificationDoi(doi).split("/").map(encodeURIComponent).join("/") : null;
const validPmid = (value) => typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? value : "";
export function verificationIssn(value) {
  if (typeof value !== "string") return "";
  const compact = value.trim().replace("-", "").toUpperCase();
  if (!/^\d{7}[\dX]$/.test(compact)) return "";
  const sum = [...compact].reduce((total, character, index) => total + (character === "X" ? 10 : Number(character)) * (8 - index), 0);
  return sum % 11 === 0 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : "";
}
const pubmedUrl = (pmid) => validPmid(pmid) ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : DOCS.pubmed;
const nlmSearch = (issn) => urlWith(DOCS.nlm, { term: `${issn}[ISSN]` });
const textContent = (value) => String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => { const cp = /^x/i.test(code) ? parseInt(code.slice(1), 16) : Number(code); return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""; })
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity]).replace(/\s+/g, " ").trim();
const xmlBlock = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`))?.[1] || "";
const xmlField = (xml, name) => textContent(xmlBlock(xml, name));
const titleKey = (value) => textContent(value).replace(/^retracted\s*:\s*/i, "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function titleMatch(supplied, registered) {
  return { status: !supplied ? "not-provided" : !registered ? "not-returned" : titleKey(supplied) === titleKey(registered) ? "match" : "mismatch", method: "Normalized title comparison; inspect differences manually.", suppliedTitle: supplied || null, registeredTitle: registered || null };
}
function check(id, label, status, source, url, detail, extra = {}) { return { id, label, status, source, url, detail, ...extra }; }
function unavailable(id, label, source, url, error, coverage) { return check(id, label, "unavailable", source, url, error.message, { code: error.code || "PROVIDER_UNAVAILABLE", coverage }); }
const normalizeUpdateType = (value) => asText(value, 100).toLowerCase().replace(/[ _]+/g, "-");
const statusForNotices = (notices) => {
  const incoming = notices.filter((notice) => notice.direction === "applies-to-this-record");
  if (incoming.some((notice) => notice.type === "retraction")) return "retracted";
  if (incoming.some((notice) => ["withdrawal", "withdrawn"].includes(notice.type))) return "withdrawn";
  if (incoming.some((notice) => notice.type === "partial-retraction")) return "partially-retracted";
  if (incoming.some((notice) => notice.type === "expression-of-concern")) return "expression-of-concern";
  if (incoming.length) return "updated";
  return notices.length ? "update-notice" : "no-notice-returned";
};

export function crossrefNotices(work, reverseWorks = []) {
  const currentDoi = verificationDoi(work?.DOI || "");
  const notices = [];
  function add(update, noticeDoi, targetDoi, direction) {
    const type = normalizeUpdateType(update.type);
    if (!type || !targetDoi) return;
    notices.push({ type, label: asText(update.label, 160) || type, direction, noticeDoi: noticeDoi || null, targetDoi, url: doiUrl(noticeDoi), targetUrl: doiUrl(targetDoi), source: update.source === "retraction-watch" ? "Retraction Watch via Crossref" : update.source === "publisher" ? "Publisher via Crossref" : "Crossref deposited update metadata", sourceCode: asText(update.source, 100) || null, date: asText(update.updated?.["date-time"], 40) || null, recordId: asText(update["record-id"], 100) || null });
  }
  for (const update of list(work?.["updated-by"]).slice(0, 30)) add(update, verificationDoi(update.DOI), currentDoi, "applies-to-this-record");
  for (const update of list(work?.["update-to"]).slice(0, 30)) add(update, currentDoi, verificationDoi(update.DOI), "this-record-updates-another");
  for (const notice of reverseWorks.slice(0, 20)) {
    for (const update of list(notice?.["update-to"]).slice(0, 30)) {
      const target = verificationDoi(update.DOI);
      if (target === currentDoi) add(update, verificationDoi(notice.DOI), target, "applies-to-this-record");
    }
  }
  const seen = new Set();
  return notices.filter((notice) => { const key = [notice.type, notice.direction, notice.noticeDoi, notice.targetDoi, notice.sourceCode].join("|"); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 50);
}

export function crossrefCandidates(items) {
  const seen = new Set();
  return list(items).slice(0, 5).flatMap((work) => {
    const doi = verificationDoi(work?.DOI);
    const title = textContent(list(work?.title)[0] || "").slice(0, 1000);
    if (!doi || !title || seen.has(doi)) return [];
    seen.add(doi);
    const year = Number(work.published?.["date-parts"]?.[0]?.[0] || work["published-print"]?.["date-parts"]?.[0]?.[0] || work["published-online"]?.["date-parts"]?.[0]?.[0]);
    return [{ doi, title, authors: list(work.author).slice(0, 6).map((author) => asText(author.name, 300) || `${asText(author.given, 150)} ${asText(author.family, 150)}`.trim()).filter(Boolean), year: Number.isInteger(year) && year >= 1000 && year <= 3000 ? year : null, url: doiUrl(doi) }];
  });
}

export function parsePubmedVerification(xml) {
  return [...String(xml).matchAll(/<PubmedArticle(?:\s[^>]*)?>([\s\S]*?)<\/PubmedArticle>/g)].slice(0, 3).map(([, record]) => {
    const citation = xmlBlock(record, "MedlineCitation");
    const article = xmlBlock(citation, "Article");
    const articleIds = xmlBlock(xmlBlock(record, "PubmedData").replace(/<ReferenceList(?:\s[^>]*)?>[\s\S]*?<\/ReferenceList>/g, ""), "ArticleIdList");
    const doi = verificationDoi(textContent(articleIds.match(/<ArticleId\b[^>]*\bIdType=["']doi["'][^>]*>([\s\S]*?)<\/ArticleId>/i)?.[1] || article.match(/<ELocationID\b[^>]*\bEIdType=["']doi["'][^>]*>([\s\S]*?)<\/ELocationID>/i)?.[1] || ""));
    const publicationTypes = [...xmlBlock(article, "PublicationTypeList").matchAll(/<PublicationType(?:\s[^>]*)?>([\s\S]*?)<\/PublicationType>/g)].map((match) => textContent(match[1])).slice(0, 30);
    const pmid = validPmid(xmlField(citation, "PMID"));
    const notices = [];
    const types = { RetractionIn: ["retraction", "applies-to-this-record"], RetractionOf: ["retraction", "this-record-updates-another"], ErratumIn: ["correction", "applies-to-this-record"], ErratumFor: ["correction", "this-record-updates-another"], ExpressionOfConcernIn: ["expression-of-concern", "applies-to-this-record"], ExpressionOfConcernFor: ["expression-of-concern", "this-record-updates-another"], UpdateIn: ["update", "applies-to-this-record"], UpdateOf: ["update", "this-record-updates-another"] };
    for (const [, relation, body] of citation.matchAll(/<CommentsCorrections\b[^>]*\bRefType=["']([^"']+)["'][^>]*>([\s\S]*?)<\/CommentsCorrections>/g)) {
      if (!Object.hasOwn(types, relation)) continue;
      const relatedPmid = validPmid(xmlField(body, "PMID"));
      notices.push({ type: types[relation][0], direction: types[relation][1], relation, pmid: relatedPmid || null, url: relatedPmid ? pubmedUrl(relatedPmid) : null, citation: xmlField(body, "RefSource").slice(0, 500), source: "PubMed / NLM" });
      if (notices.length === 30) break;
    }
    if (publicationTypes.includes("Retracted Publication") && !notices.some((notice) => notice.type === "retraction" && notice.direction === "applies-to-this-record")) notices.push({ type: "retraction", direction: "applies-to-this-record", source: "PubMed publication type", url: pubmedUrl(pmid), relation: "Retracted Publication" });
    if (publicationTypes.includes("Retraction of Publication") && !notices.some((notice) => notice.direction === "this-record-updates-another")) notices.push({ type: "retraction", direction: "this-record-updates-another", source: "PubMed publication type", url: pubmedUrl(pmid), relation: "Retraction of Publication" });
    return { pmid, doi, title: xmlField(article, "ArticleTitle").slice(0, 1000), journal: xmlField(xmlBlock(article, "Journal"), "Title").slice(0, 500), issn: verificationIssn(xmlField(xmlBlock(article, "Journal"), "ISSN")), publicationTypes, notices, publicationStatus: statusForNotices(notices) };
  }).filter((record) => record.pmid);
}

function fdaDocumentUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && url.hostname === "www.accessdata.fda.gov" && !url.username && !url.password ? `https://${url.host}${url.pathname}${url.search}${url.hash}` : null; } catch { return null; }
}
export function normalizeFdaApplication(record) {
  const applicationNumber = asText(record?.application_number, 30);
  if (!/^(?:NDA|ANDA|BLA)\d{5,6}$/.test(applicationNumber)) return null;
  const submissions = list(record.submissions).slice(0, 1000).map((submission) => ({ type: asText(submission.submission_type, 30), number: asText(submission.submission_number, 20), statusCode: asText(submission.submission_status, 20), statusDate: dateValue(submission.submission_status_date), classification: asText(submission.submission_class_code_description, 300), documents: list(submission.application_docs).slice(0, 6).flatMap((doc) => { const url = fdaDocumentUrl(doc.url); return url ? [{ type: asText(doc.type, 80), url, date: dateValue(doc.date) }] : []; }) }));
  const originalApprovals = submissions.filter((submission) => submission.type === "ORIG" && submission.statusCode === "AP").slice(0, 10);
  const latestSubmissions = [...submissions].sort((a, b) => (b.statusDate || "").localeCompare(a.statusDate || "")).slice(0, 8);
  return { applicationNumber, sponsor: asText(record.sponsor_name, 300), url: `${DOCS.fda}?event=overview.process&ApplNo=${applicationNumber.replace(/\D/g, "")}`, hasOriginalApproval: originalApprovals.length > 0, originalApprovals, latestSubmissions, products: list(record.products).slice(0, 20).map((product) => ({ productNumber: asText(product.product_number, 20), brandName: asText(product.brand_name, 300), dosageForm: asText(product.dosage_form, 300), route: asText(product.route, 300), marketingStatus: asText(product.marketing_status, 100), activeIngredients: list(product.active_ingredients).slice(0, 10).map((ingredient) => ({ name: asText(ingredient.name, 300), strength: asText(ingredient.strength, 300) })) })) };
}

export function createVerificationRouter({ fetchImpl = globalThis.fetch, timeoutMs = 12000, cacheTtlMs = 300000, maxCacheEntries = 100, maxConcurrent = 4, maxResponseBytes = 1500000, throttle = true } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: "8kb" }));
  const cache = new Map(); const pending = new Map(); const lanes = new Map(); let active = 0;
  async function upstream(provider, url, { xml = false } = {}) {
    const run = async () => {
      try {
        const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(30000, timeoutMs))), headers: { Accept: xml ? "application/xml,text/xml" : "application/json", "User-Agent": "scrapeTx/0.3 (primary-source metadata checks)" } });
        if (response.status === 404) { await response.body?.cancel(); return null; }
        if (!response.ok) { await response.body?.cancel(); throw new VerificationError(`${provider} is unavailable (HTTP ${response.status}).`, response.status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_HTTP_ERROR"); }
        if (Number(response.headers.get("content-length")) > maxResponseBytes) { await response.body?.cancel(); throw new VerificationError(`${provider} returned an oversized response.`, "RESPONSE_TOO_LARGE"); }
        const reader = response.body?.getReader();
        if (!reader) throw new VerificationError(`${provider} returned an empty response.`, "INVALID_RESPONSE");
        const decoder = new TextDecoder(); let body = ""; let bytes = 0;
        while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > maxResponseBytes) { await reader.cancel(); throw new VerificationError(`${provider} returned an oversized response.`, "RESPONSE_TOO_LARGE"); } body += decoder.decode(next.value, { stream: true }); }
        body += decoder.decode();
        if (xml) return body;
        try { return JSON.parse(body); } catch { throw new VerificationError(`${provider} returned unreadable metadata.`, "INVALID_RESPONSE"); }
      } catch (error) { if (error instanceof VerificationError) throw error; throw new VerificationError(["AbortError", "TimeoutError"].includes(error.name) ? `${provider} timed out. This check remains unavailable.` : `${provider} could not be reached. This check remains unavailable.`, ["AbortError", "TimeoutError"].includes(error.name) ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE"); }
    };
    if (!throttle) return run();
    const lane = lanes.get(provider) || { tail: Promise.resolve(), last: 0 };
    lanes.set(provider, lane);
    const task = lane.tail.then(async () => { await delay(Math.max(0, lane.last + (provider === "NCBI" ? 360 : 150) - Date.now())); lane.last = Date.now(); return run(); });
    lane.tail = task.catch(() => {}); return task;
  }
  const ncbiSearch = async (db, term, retmax = 5) => {
    const data = await upstream("NCBI", urlWith("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", { db, term, retmode: "json", retmax: String(retmax), tool: "zntx_space_verification" }));
    if (!data || !Array.isArray(data.esearchresult?.idlist) || data.esearchresult.ERROR || data.error) throw new VerificationError("NCBI did not return readable identifier matches.", "INVALID_RESPONSE");
    return { ids: data.esearchresult.idlist.filter((id) => /^\d{1,10}$/.test(id)).slice(0, retmax), count: Number(data.esearchresult.count) || 0 };
  };

  async function crossrefPaper(doi, title) {
    const coverage = "Crossref deposited DOI metadata and up to 20 reverse-linked update notices, including available publisher and Retraction Watch assertions. Absence of a notice does not prove a work is current or correct.";
    const checks = []; let work = null; let reverse = null;
    const [metadataResult, updateResult] = await Promise.allSettled([
      upstream("Crossref", `https://api.crossref.org/works/${encodeURIComponent(doi)}`),
      upstream("Crossref", urlWith("https://api.crossref.org/works", { filter: `updates:${doi}`, rows: "20" })),
    ]);
    if (metadataResult.status === "rejected") checks.push(unavailable("doi-metadata", "DOI metadata", "Crossref", doiUrl(doi), metadataResult.reason, coverage));
    else if (!metadataResult.value) checks.push(check("doi-metadata", "DOI metadata", "not-found", "Crossref", doiUrl(doi), "No Crossref record was returned for this DOI. Other DOI registration agencies are not checked.", { coverage }));
    else {
      const candidate = metadataResult.value.message;
      if (!candidate || !verificationDoi(candidate.DOI)) checks.push(unavailable("doi-metadata", "DOI metadata", "Crossref", doiUrl(doi), new VerificationError("Crossref returned an incomplete DOI record.", "INVALID_RESPONSE"), coverage));
      else {
        work = candidate;
        const registeredTitle = textContent(list(work.title)[0] || "").slice(0, 1000);
        const metadataMatch = { doi: verificationDoi(work.DOI) === doi ? "match" : "mismatch", title: titleMatch(title, registeredTitle) };
        checks.push(check("doi-metadata", "DOI metadata", metadataMatch.doi === "mismatch" || metadataMatch.title.status === "mismatch" ? "mismatch" : "match", "Crossref", doiUrl(doi), metadataMatch.title.status === "mismatch" ? "The supplied title differs from the DOI’s registered title. Inspect the record before citing it." : "A DOI metadata record was returned. This confirms a registry record, not scientific accuracy or peer review.", { coverage, metadataMatch, metadata: { doi: verificationDoi(work.DOI), title: registeredTitle, journal: textContent(list(work["container-title"])[0] || "").slice(0, 500), publisher: asText(work.publisher, 500), type: asText(work.type, 100), issn: unique(list(work.ISSN).map(verificationIssn).filter(Boolean)).slice(0, 5) } }));
      }
    }
    if (updateResult.status === "fulfilled" && updateResult.value && Array.isArray(updateResult.value.message?.items)) reverse = updateResult.value.message.items;
    const notices = crossrefNotices(work || { DOI: doi }, reverse || []);
    const publicationStatus = statusForNotices(notices);
    const metadataMissing = metadataResult.status === "fulfilled" && metadataResult.value === null;
    const incomplete = updateResult.status === "rejected" || reverse === null || (!work && !metadataMissing);
    if (!notices.length && incomplete) checks.push(unavailable("publication-updates", "Publication updates", "Crossref / Retraction Watch", DOCS.updates, updateResult.status === "rejected" ? updateResult.reason : new VerificationError("One or more Crossref update lookups could not be completed.", "INCOMPLETE_COVERAGE"), coverage));
    else checks.push(check("publication-updates", "Publication updates", notices.length ? "notice" : metadataMissing ? "not-found" : "no-notice-returned", "Crossref / Retraction Watch", notices.find((notice) => notice.url)?.url || doiUrl(doi), notices.length ? publicationStatus === "update-notice" ? "This DOI is an update notice concerning another work; it is not marked retracted solely because it retracts another article." : `Indexed publication status: ${publicationStatus}. Review the linked notice and its direction.` : metadataMissing ? "No Crossref DOI record or reverse-linked update notice was returned. This does not establish that the DOI is invalid or that no notice exists elsewhere." : "No publication update notice was returned by these lookups. This is not a guarantee that no correction, concern, or retraction exists.", { coverage, publicationStatus, notices, partial: incomplete, returnedNoticeLimit: 20 }));
    return { checks, work };
  }

  async function pubmedPaper({ doi, pmid, title }) {
    const coverage = "PubMed exact PMID lookup or DOI identifier search (up to three candidates), publication types, and linked correction/retraction/concern notices. PubMed does not cover all research publications.";
    try {
      const ids = pmid ? [pmid] : (await ncbiSearch("pubmed", `"${doi}"[AID]`, 3)).ids;
      if (!ids.length) return { checks: [check("pubmed-status", "PubMed record and notices", "not-found", "PubMed / NLM", doi ? urlWith(DOCS.pubmed, { term: `${doi}[AID]` }) : DOCS.pubmed, "No PubMed identifier match was returned. This does not determine the paper’s scientific quality.", { coverage })] };
      const xml = await upstream("NCBI", urlWith("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", { db: "pubmed", id: ids.join(","), retmode: "xml", tool: "zntx_space_verification" }), { xml: true });
      if (xml === null) return { checks: [check("pubmed-status", "PubMed record and notices", "not-found", "PubMed / NLM", pubmedUrl(pmid), "No record was returned for the supplied PubMed identifier.", { coverage })] };
      if (!xml.includes("<PubmedArticleSet")) throw new VerificationError("PubMed did not return a readable article record.", "INVALID_RESPONSE");
      const candidates = parsePubmedVerification(xml);
      const record = pmid ? candidates.find((candidate) => candidate.pmid === pmid) : candidates.find((candidate) => candidate.doi === doi) || (candidates.length === 1 && !candidates[0].doi ? candidates[0] : null);
      if (!record) return { checks: [check("pubmed-status", "PubMed record and notices", "not-found", "PubMed / NLM", pubmedUrl(pmid), "No PubMed record with the supplied identifier was returned. Other search candidates were not treated as an exact match.", { coverage })] };
      const metadataMatch = { pmid: pmid ? record.pmid === pmid ? "match" : "mismatch" : "not-provided", doi: doi ? !record.doi ? "not-returned" : record.doi === doi ? "match" : "mismatch" : "not-provided", title: titleMatch(title, record.title) };
      const mismatch = metadataMatch.doi === "mismatch" || metadataMatch.title.status === "mismatch";
      return { record, checks: [check("pubmed-status", "PubMed record and notices", mismatch ? "mismatch" : record.notices.length ? "notice" : "no-notice-returned", "PubMed / NLM", pubmedUrl(record.pmid), mismatch ? "The returned PubMed record differs from supplied metadata. Notice flags below belong to this PMID; do not assume they apply to a different DOI." : record.notices.length ? record.publicationStatus === "update-notice" ? "This PubMed record is an update notice about another publication, not itself a retracted original solely for that reason." : `PubMed reports publication status: ${record.publicationStatus}. Inspect the linked source notices.` : "A PubMed record was found with no indexed correction/retraction/concern notice returned. Absence of an indexed notice is not proof of scientific accuracy.", { coverage, metadataMatch, publicationStatus: record.publicationStatus, publicationTypes: record.publicationTypes, notices: record.notices, metadata: { pmid: record.pmid, doi: record.doi || null, title: record.title, journal: record.journal, issn: record.issn || null } })] };
    } catch (error) { return { checks: [unavailable("pubmed-status", "PubMed record and notices", "PubMed / NLM", pubmedUrl(pmid), error, coverage)] }; }
  }

  async function nlmJournal(issn) {
    const coverage = "NLM Catalog ISSN search (up to five matching records) plus the documented currentlyindexed search term. Journal-level current MEDLINE indexing is not an article-level peer-review or quality assessment.";
    try {
      const all = await ncbiSearch("nlmcatalog", `${issn}[ISSN]`);
      if (!all.ids.length) return check("medline-indexing", "Current MEDLINE journal indexing", "not-found", "NLM Catalog", nlmSearch(issn), "No NLM Catalog journal record was returned for this ISSN. A catalog entry alone would not establish MEDLINE inclusion.", { coverage, issn });
      const current = await ncbiSearch("nlmcatalog", `${issn}[ISSN] AND currentlyindexed[All Fields]`);
      const indexed = current.ids.length > 0;
      return check("medline-indexing", "Current MEDLINE journal indexing", indexed ? "indexed" : "not-currently-indexed", "NLM Catalog", indexed ? `https://www.ncbi.nlm.nih.gov/nlmcatalog/${current.ids[0]}` : nlmSearch(issn), indexed ? "A matching journal catalog record is currently indexed for MEDLINE. This does not establish that this particular article was indexed, peer reviewed, or correct." : "Matching catalog records were returned, but none was returned by the current MEDLINE indexing query. Historical indexing, title changes, and article-level status require source review.", { coverage, issn, catalogIds: all.ids, currentlyIndexedIds: current.ids, partial: all.count > 5 });
    } catch (error) { return unavailable("medline-indexing", "Current MEDLINE journal indexing", "NLM Catalog", nlmSearch(issn), error, coverage); }
  }

  async function paper(input) {
    let crossref = null; let pubmed = null; let candidates = []; let discovery = null;
    if (input.doi) [crossref, pubmed] = await Promise.all([crossrefPaper(input.doi, input.title), pubmedPaper(input)]);
    else if (input.pmid) { pubmed = await pubmedPaper(input); if (pubmed.record?.doi) crossref = await crossrefPaper(pubmed.record.doi, input.title); }
    else if (input.title) {
      const coverage = "Crossref bibliographic title discovery, limited to five candidate records. Similar or identical titles can identify different works; a candidate must be chosen explicitly before DOI status checks.";
      try {
        const response = await upstream("Crossref", urlWith("https://api.crossref.org/works", { "query.bibliographic": input.title, rows: "5", select: "DOI,title,author,published,published-print,published-online" }));
        if (!Array.isArray(response?.message?.items)) throw new VerificationError("Crossref did not return readable title candidates.", "INVALID_RESPONSE");
        candidates = crossrefCandidates(response.message.items);
        discovery = check("reference-discovery", "Choose a reference", candidates.length ? "not-checked" : "not-found", "Crossref", urlWith("https://search.crossref.org/", { q: input.title }), candidates.length ? "Choose the matching reference below to check its DOI. Title search provides candidates, not verified identity; duplicate or similar titles can refer to different works." : "No usable DOI candidate was returned for this title. Try a distinctive title phrase or supply the DOI or PMID directly.", { coverage, candidateCount: candidates.length });
      } catch (error) { discovery = unavailable("reference-discovery", "Choose a reference", "Crossref", DOCS.crossref, error, coverage); }
    }
    const checks = [
      ...(discovery ? [discovery] : []),
      ...(crossref?.checks || [check("doi-metadata", "DOI metadata", "not-checked", "Crossref", DOCS.crossref, candidates.length ? "Choose a matching reference to check its DOI. No candidate has been selected or automatically verified." : "A DOI is required for a Crossref record check. Titles alone are not treated as unique identifiers.")]),
      ...(pubmed?.checks || [check("pubmed-status", "PubMed record and notices", "not-checked", "PubMed / NLM", DOCS.pubmed, "Provide a DOI or PMID to inspect PubMed’s linked publication notices.")]),
    ];
    const derivedIssn = list(crossref?.work?.ISSN).map(verificationIssn).find(Boolean) || pubmed?.record?.issn;
    const issn = input.issn || derivedIssn;
    checks.push(issn ? await nlmJournal(issn) : check("medline-indexing", "Current MEDLINE journal indexing", "not-checked", "NLM Catalog", DOCS.nlm, "No valid journal ISSN was supplied or returned. Current MEDLINE indexing was not inferred from a PubMed record."));
    const recordDoi = verificationDoi(crossref?.work?.DOI || "");
    return { kind: "paper", input, checkedAt: new Date().toISOString(), checks, candidates, metadataMatch: checks.find((item) => item.id === "doi-metadata")?.metadataMatch || checks.find((item) => item.id === "pubmed-status")?.metadataMatch || null, limitation: VERIFICATION_LIMITATION, crossmark: { url: DOCS.crossmark, recordUrl: recordDoi ? urlWith("https://crossmark.crossref.org/dialog",{doi:recordDoi,domain:"html"}) : null, detail: "Crossmark provides update information when deposited. Its presence is not a guarantee of accuracy, peer review, or complete update coverage." } };
  }

  async function drug(query) {
    const coverage = "Up to five matching Drugs@FDA applications and bounded product/submission history through openFDA. Most US-approved human drugs since 1939 are covered; not all products, biologics, jurisdictions, formulations, or indications are covered. NDC registration and drug labeling are not used as approval evidence.";
    const search = /^(?:NDA|ANDA|BLA)\d{5,6}$/i.test(query) ? `application_number:"${query.toUpperCase()}"` : `(products.brand_name:"${query}" OR products.active_ingredients.name:"${query}" OR openfda.substance_name:"${query}")`;
    try {
      const response = await upstream("FDA", urlWith("https://api.fda.gov/drug/drugsfda.json", { search, limit: "5" }));
      if (!response) return { kind: "drug", query, checkedAt: new Date().toISOString(), checks: [check("fda-approval", "FDA application and approval records", "not-found", "Drugs@FDA / openFDA", DOCS.fda, "No matching application record was returned. This is not a finding that the drug is unapproved; check names, formulations, and FDA source coverage.", { coverage })], applications: [], limitation: VERIFICATION_LIMITATION };
      if (!Array.isArray(response.results)) throw new VerificationError("FDA returned unreadable application metadata.", "INVALID_RESPONSE");
      const applications = response.results.slice(0, 5).map(normalizeFdaApplication).filter(Boolean);
      if (response.results.length && !applications.length) throw new VerificationError("FDA application identifiers could not be read.", "INVALID_RESPONSE");
      const approved = applications.filter((application) => application.hasOriginalApproval);
      return { kind: "drug", query, checkedAt: new Date().toISOString(), checks: [check("fda-approval", "FDA application and approval records", approved.length ? "approval-record-found" : applications.length ? "application-record-found" : "not-found", "Drugs@FDA / openFDA", applications[0]?.url || DOCS.fda, approved.length ? `${approved.length} returned application record(s) contain an original submission with FDA status AP (approval). This is historical approval evidence; inspect current product marketing status and later actions. Approval scope is specific to the application, product, and indication; this does not approve every proposed use.` : applications.length ? "Application records were returned, but no original AP approval submission was present in the inspected data. Supplement approvals, tentative approvals, labels, and registration are not treated as original approval evidence." : "No matching application record was returned.", { coverage, totalMatches: Number(response.meta?.results?.total) || applications.length, returnedApplications: applications.length, sourceLastUpdated: asText(response.meta?.last_updated, 40) || null })], applications, limitation: VERIFICATION_LIMITATION };
    } catch (error) { return { kind: "drug", query, checkedAt: new Date().toISOString(), checks: [unavailable("fda-approval", "FDA application and approval records", "Drugs@FDA / openFDA", DOCS.fda, error, coverage)], applications: [], limitation: VERIFICATION_LIMITATION }; }
  }

  async function respond(res, key, task) {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return res.json({ ...cached.data, cached: true, cacheExpiresAt: new Date(cached.expires).toISOString() });
    if (pending.has(key)) return res.json({ ...await pending.get(key), cached: false });
    if (active >= Math.max(1, maxConcurrent)) return res.status(429).set("Retry-After", "2").json({ error: "Verification is busy. Please retry shortly.", code: "VERIFICATION_BUSY" });
    active++;
    const promise = task(); pending.set(key, promise);
    try {
      const data = await promise;
      if (!data.checks.some((item) => item.status === "unavailable" || item.partial)) { cache.delete(key); cache.set(key, { data, expires: Date.now() + Math.max(0, cacheTtlMs) }); while (cache.size > Math.max(1, maxCacheEntries)) cache.delete(cache.keys().next().value); }
      return res.json({ ...data, cached: false });
    } finally { active--; pending.delete(key); }
  }

  router.post("/paper", async (req, res, next) => {
    try {
      const body = req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 8192) return res.status(400).json({ error: "Provide a bounded paper metadata object.", code: "INVALID_INPUT" });
      for (const field of ["doi", "pmid", "issn", "title"]) if (body[field] != null && typeof body[field] !== "string") return res.status(400).json({ error: `${field} must be a text identifier.`, code: "INVALID_INPUT" });
      const input = { doi: body.doi?.trim() ? verificationDoi(body.doi) : "", pmid: body.pmid?.trim() ? validPmid(body.pmid.trim()) : "", issn: body.issn?.trim() ? verificationIssn(body.issn) : "", title: body.title?.trim() || "" };
      if ((body.doi?.trim() && !input.doi) || (body.pmid?.trim() && !input.pmid) || (body.issn?.trim() && !input.issn) || input.title.length > 1000 || /[\u0000-\u001f\u007f]/.test(input.title) || !Object.values(input).some(Boolean)) return res.status(400).json({ error: "Use a valid DOI, PMID, journal ISSN, or a title up to 1,000 characters. Identifiers must not contain URLs to other sites or control characters.", code: "INVALID_INPUT" });
      await respond(res, "paper:" + JSON.stringify(input), () => paper(input));
    } catch (error) { next(error); }
  });
  router.get("/drug", async (req, res, next) => {
    try {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!query || query.length > 100 || !/^[\p{L}\p{N}][\p{L}\p{N} .'’()\-]*$/u.test(query)) return res.status(400).json({ error: "Enter a drug, ingredient, or FDA application number up to 100 characters.", code: "INVALID_QUERY" });
      await respond(res, "drug:" + query.toLowerCase(), () => drug(query));
    } catch (error) { next(error); }
  });
  router.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : error.status === 400 ? 400 : 500).json({ error: error.status === 413 ? "Verification input exceeds the 8 KB limit." : error.status === 400 ? "Verification input must be valid JSON." : "Verification could not complete. Please retry.", code: error.status === 413 ? "INPUT_TOO_LARGE" : "VERIFICATION_ERROR" }));
  return router;
}

export default createVerificationRouter();
