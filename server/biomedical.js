import express from "express";

const SOURCES = {
  drugs: ["PubChem + ChEMBL", "https://pubchem.ncbi.nlm.nih.gov/"],
  trials: ["ClinicalTrials.gov", "https://clinicaltrials.gov/"],
  safety: ["openFDA / FAERS", "https://open.fda.gov/apis/drug/event/"],
  pubmed: ["PubMed / NCBI", "https://pubmed.ncbi.nlm.nih.gov/"],
};
export const SAFETY_DISCLAIMER =
  "FAERS reports describe suspected events, not proven drug effects. Counts cannot establish causation, incidence, comparative safety, or treatment recommendations. A report may include several drugs and reactions. Consult the original labels and research evidence.";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const urlWith = (base, params) => {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return url.toString();
};
class ProviderError extends Error {
  constructor(provider, code, message, status = 502) {
    super(message);
    Object.assign(this, { provider, code, status });
  }
}

// Restricted extraction of known PubMed XML fields. No DTD/entity resolution,
// external resource fetching, or execution is performed.
const xmlText = (value = "") =>
  String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
      const cp =
        n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    })
    .replace(
      /&(?:amp|lt|gt|quot|apos);/g,
      (v) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        })[v],
    )
    .replace(/\s+/g, " ")
    .trim();
const block = (xml, tag) =>
  xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`))?.[1] ||
  "";
const field = (xml, tag) => xmlText(block(xml, tag));
export function pubmedPapers(xml) {
  return [
    ...xml.matchAll(/<PubmedArticle(?:\s[^>]*)?>([\s\S]*?)<\/PubmedArticle>/g),
  ]
    .map(([, record]) => {
      const citation = block(record, "MedlineCitation");
      const article = block(citation, "Article");
      const journal = block(article, "Journal");
      const pubdate = block(journal, "PubDate");
      const pmid = field(citation, "PMID");
      const articleIds = block(
        block(record, "PubmedData").replace(
          /<ReferenceList(?:\s[^>]*)?>[\s\S]*?<\/ReferenceList>/g,
          "",
        ),
        "ArticleIdList",
      );
      const doi =
        [
          ...articleIds.matchAll(
            /<ArticleId\s+[^>]*IdType="doi"[^>]*>([\s\S]*?)<\/ArticleId>/g,
          ),
        ][0]?.[1] ||
        [
          ...article.matchAll(
            /<ELocationID\s+[^>]*EIdType="doi"[^>]*>([\s\S]*?)<\/ELocationID>/g,
          ),
        ][0]?.[1] ||
        "";
      const abstracts = [
        ...block(article, "Abstract").matchAll(
          /<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g,
        ),
      ].map(([, attrs, text]) => {
        const label = attrs.match(/\bLabel="([^"]*)"/)?.[1];
        return `${label ? xmlText(label) + ": " : ""}${xmlText(text)}`;
      });
      return {
        id: `pubmed-${pmid}`,
        pmid,
        title: field(article, "ArticleTitle"),
        authors: [
          ...block(article, "AuthorList").matchAll(
            /<Author(?:\s[^>]*)?>([\s\S]*?)<\/Author>/g,
          ),
        ]
          .map(
            ([, author]) =>
              field(author, "CollectiveName") ||
              `${field(author, "ForeName") || field(author, "Initials")} ${field(author, "LastName")}`.trim(),
          )
          .filter(Boolean),
        year:
          Number(
            field(pubdate, "Year") ||
              field(pubdate, "MedlineDate").match(/\b\d{4}\b/)?.[0],
          ) || null,
        journal: field(journal, "Title"),
        doi: xmlText(doi),
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        abstract: abstracts.join("\n"),
        citations: null,
        type:
          field(block(article, "PublicationTypeList"), "PublicationType") ||
          "Journal article",
        source: "PubMed",
        // PubMed indexing alone does not establish an open-access license.
        openAccess: false,
        volume: field(journal, "Volume"),
        issue: field(journal, "Issue"),
        pages: field(article, "MedlinePgn"),
      };
    })
    .filter((paper) => /^\d+$/.test(paper.pmid));
}

export function normalizeTrial(study) {
  const p = study.protocolSection || {};
  const status = p.statusModule || {};
  const id = p.identificationModule?.nctId || "";
  return {
    id,
    title: p.identificationModule?.briefTitle || "",
    status: status.overallStatus || "UNKNOWN",
    phases: p.designModule?.phases || [],
    conditions: p.conditionsModule?.conditions || [],
    interventions: (p.armsInterventionsModule?.interventions || []).map(
      (i) => `${i.type}: ${i.name}`,
    ),
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name || "",
    enrollment: p.designModule?.enrollmentInfo?.count ?? null,
    startDate: status.startDateStruct?.date || null,
    completionDate: status.completionDateStruct?.date || null,
    lastUpdated: status.lastUpdatePostDateStruct?.date || null,
    summary: p.descriptionModule?.briefSummary || "",
    url: `https://clinicaltrials.gov/study/${id}`,
    hasResults: study.hasResults === true,
  };
}

export function createBiomedicalRouter({
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
  cacheTtlMs = 300000,
  maxCacheEntries = 100,
  throttle = true,
} = {}) {
  const router = express.Router();
  const cache = new Map();
  const pending = new Map();
  const nextRequest = new Map();
  const intervals = {
    PubChem: 250,
    ChEMBL: 150,
    "ClinicalTrials.gov": 250,
    openFDA: 300,
    NCBI: 360,
  };

  async function request(
    provider,
    url,
    { text = false, empty404 = false } = {},
  ) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (throttle) {
        const now = Date.now();
        const reserved = Math.max(now, nextRequest.get(provider) || now);
        if (reserved - now > 10000)
          throw new ProviderError(
            provider,
            "PROVIDER_BUSY",
            `${provider} request queue is full. Try again shortly.`,
            503,
          );
        nextRequest.set(provider, reserved + intervals[provider]);
        if (reserved > now) await wait(reserved - now);
      }
      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: text ? "application/xml" : "application/json",
            "User-Agent": "ZntxSpace/0.2 (research evidence workspace)",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 404 && empty404) return null;
        if (!response.ok) {
          await response.body?.cancel();
          if (
            attempt === 0 &&
            (response.status === 429 || response.status >= 500)
          ) {
            const retrySeconds = Number(response.headers.get("retry-after"));
            if (!Number.isFinite(retrySeconds) || retrySeconds <= 2) {
              await wait(Math.max(500, (retrySeconds || 0) * 1000));
              continue;
            }
          }
          throw new ProviderError(
            provider,
            response.status === 429
              ? "PROVIDER_RATE_LIMIT"
              : "PROVIDER_HTTP_ERROR",
            `${provider} returned HTTP ${response.status}. Please try again later.`,
          );
        }
        const body = await response.text();
        if (body.length > 6000000)
          throw new ProviderError(
            provider,
            "PROVIDER_RESPONSE_TOO_LARGE",
            `${provider} returned an oversized response.`,
          );
        if (text) return body;
        try {
          return JSON.parse(body);
        } catch {
          throw new ProviderError(
            provider,
            "PROVIDER_INVALID_RESPONSE",
            `${provider} returned an unreadable response.`,
          );
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (attempt === 0) {
          await wait(500);
          continue;
        }
        throw new ProviderError(
          provider,
          error.name === "TimeoutError" || error.name === "AbortError"
            ? "PROVIDER_TIMEOUT"
            : "PROVIDER_UNAVAILABLE",
          `${provider} could not be reached. Please try again later.`,
        );
      }
    }
  }
  const envelope = (kind, query, results, total, extra = {}) => ({
    query,
    source: SOURCES[kind][0],
    sourceUrl: SOURCES[kind][1],
    retrievedAt: new Date().toISOString(),
    results,
    total,
    warnings: [],
    ...extra,
  });

  async function drugs(q) {
    const endpoint = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/Title,MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey,IUPACName/JSON`;
    const data = await request("PubChem", endpoint, { empty404: true });
    if (!data) return envelope("drugs", q, [], 0);
    if (!Array.isArray(data.PropertyTable?.Properties))
      throw new ProviderError(
        "PubChem",
        "PROVIDER_INVALID_RESPONSE",
        "PubChem did not return compound properties.",
      );
    const properties = data.PropertyTable.Properties.slice(0, 5);
    const warnings = [];
    let chembl = null;
    let mechanisms = [];
    if (properties[0]?.InChIKey) {
      try {
        const molecules = await request(
          "ChEMBL",
          urlWith("https://www.ebi.ac.uk/chembl/api/data/molecule.json", {
            molecule_structures__standard_inchi_key: properties[0].InChIKey,
            limit: 1,
          }),
        );
        if (!Array.isArray(molecules.molecules))
          throw new ProviderError(
            "ChEMBL",
            "PROVIDER_INVALID_RESPONSE",
            "ChEMBL did not return molecule records.",
          );
        chembl = molecules.molecules?.[0] || null;
        if (chembl) {
          const mechanismData = await request(
            "ChEMBL",
            urlWith("https://www.ebi.ac.uk/chembl/api/data/mechanism.json", {
              molecule_chembl_id: chembl.molecule_chembl_id,
              limit: 20,
            }),
          );
          if (!Array.isArray(mechanismData.mechanisms))
            throw new ProviderError(
              "ChEMBL",
              "PROVIDER_INVALID_RESPONSE",
              "ChEMBL did not return mechanism records.",
            );
          mechanisms = (mechanismData.mechanisms || []).map((m) => ({
            description: m.mechanism_of_action || "",
            actionType: m.action_type || "",
            targetId: m.target_chembl_id || null,
            targetUrl: m.target_chembl_id
              ? `https://www.ebi.ac.uk/chembl/explore/target/${m.target_chembl_id}`
              : null,
          }));
        }
      } catch (e) {
        warnings.push(
          `Optional ChEMBL mechanism enrichment unavailable: ${e.message}`,
        );
      }
    }
    const results = properties.map((p, index) => ({
      id: `pubchem-${p.CID}`,
      cid: p.CID,
      name: p.Title || q,
      formula: p.MolecularFormula || "",
      molecularWeight: Number(p.MolecularWeight) || null,
      smiles: p.ConnectivitySMILES || p.CanonicalSMILES || "",
      inchiKey: p.InChIKey || "",
      iupacName: p.IUPACName || "",
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
      structureUrl: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${p.CID}/PNG`,
      chemblId: index === 0 ? chembl?.molecule_chembl_id || null : null,
      mechanisms: index === 0 ? mechanisms : [],
    }));
    return envelope("drugs", q, results, data.PropertyTable.Properties.length, {
      warnings,
    });
  }
  async function trials(q) {
    const data = await request(
      "ClinicalTrials.gov",
      urlWith("https://clinicaltrials.gov/api/v2/studies", {
        "query.term": q,
        pageSize: 20,
        format: "json",
        countTotal: "true",
      }),
    );
    if (!Array.isArray(data.studies))
      throw new ProviderError(
        "ClinicalTrials.gov",
        "PROVIDER_INVALID_RESPONSE",
        "ClinicalTrials.gov did not return study records.",
      );
    return envelope(
      "trials",
      q,
      data.studies.map(normalizeTrial),
      data.totalCount ?? data.studies.length,
      { nextPageAvailable: Boolean(data.nextPageToken) },
    );
  }
  async function safety(q) {
    // Treat the drug name as a literal phrase, never as openFDA query syntax.
    const phrase = q
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!phrase)
      throw new ProviderError(
        "openFDA",
        "INVALID_QUERY",
        "Enter a drug name containing letters or numbers.",
        400,
      );
    const eventSearch = `(patient.drug.medicinalproduct:"${phrase}" OR patient.drug.openfda.generic_name:"${phrase}" OR patient.drug.openfda.brand_name:"${phrase}")`;
    const labelSearch = `(openfda.generic_name:"${phrase}" OR openfda.brand_name:"${phrase}")`;
    const settled = await Promise.allSettled([
      request(
        "openFDA",
        urlWith("https://api.fda.gov/drug/event.json", {
          search: eventSearch,
          count: "patient.reaction.reactionmeddrapt.exact",
          limit: 15,
        }),
        { empty404: true },
      ),
      request(
        "openFDA",
        urlWith("https://api.fda.gov/drug/event.json", {
          search: eventSearch,
          limit: 1,
        }),
        { empty404: true },
      ),
      request(
        "openFDA",
        urlWith("https://api.fda.gov/drug/label.json", {
          search: labelSearch,
          limit: 3,
        }),
        { empty404: true },
      ),
    ]);
    if (settled[0].status === "rejected" && settled[2].status === "rejected")
      throw settled[0].reason;
    const warnings = settled
      .filter((s) => s.status === "rejected")
      .map((s) => s.reason.message);
    const [events, counts, labels] = settled.map((s) =>
      s.status === "fulfilled" ? s.value : null,
    );
    if (
      [events, counts, labels].some(
        (data) => data && !Array.isArray(data.results),
      )
    )
      throw new ProviderError(
        "openFDA",
        "PROVIDER_INVALID_RESPONSE",
        "openFDA did not return readable records.",
      );
    const join = (values) => (values || []).join("\n\n");
    return envelope(
      "safety",
      q,
      events?.results || [],
      settled[1].status === "rejected"
        ? null
        : counts?.meta?.results?.total || 0,
      {
        warnings,
        matchedPhrase: phrase,
        disclaimer: SAFETY_DISCLAIMER,
        lastUpdated:
          events?.meta?.last_updated || labels?.meta?.last_updated || null,
        labels: (labels?.results || []).map((l) => ({
          id: l.id,
          brandNames: l.openfda?.brand_name || [],
          genericNames: l.openfda?.generic_name || [],
          manufacturers: l.openfda?.manufacturer_name || [],
          routes: l.openfda?.route || [],
          warnings: join(l.warnings_and_cautions || l.warnings),
          boxedWarning: join(l.boxed_warning),
          indications: join(l.indications_and_usage),
          url: l.set_id
            ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(l.set_id)}`
            : "https://dailymed.nlm.nih.gov/dailymed/",
        })),
      },
    );
  }
  async function pubmed(q) {
    const common = { db: "pubmed", tool: "zntx_space" };
    const data = await request(
      "NCBI",
      urlWith("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", {
        ...common,
        term: q,
        retmode: "json",
        retmax: 20,
        sort: "relevance",
      }),
    );
    if (!Array.isArray(data.esearchresult?.idlist) || data.esearchresult?.ERROR)
      throw new ProviderError(
        "NCBI",
        "PROVIDER_INVALID_RESPONSE",
        "PubMed could not interpret this search.",
      );
    const ids = data.esearchresult.idlist.filter((id) => /^\d+$/.test(id));
    if (!ids.length)
      return envelope("pubmed", q, [], Number(data.esearchresult.count) || 0);
    const xml = await request(
      "NCBI",
      urlWith("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", {
        ...common,
        id: ids.join(","),
        retmode: "xml",
      }),
      { text: true },
    );
    if (!xml.includes("<PubmedArticleSet>"))
      throw new ProviderError(
        "NCBI",
        "PROVIDER_INVALID_RESPONSE",
        "PubMed did not return readable article records.",
      );
    const results = pubmedPapers(xml);
    return envelope(
      "pubmed",
      q,
      results,
      Number(data.esearchresult.count) || 0,
      {
        warnings:
          results.length < ids.length
            ? [
                "Some PubMed records could not be normalized; consult PubMed for complete results.",
              ]
            : [],
      },
    );
  }
  for (const [kind, handler] of Object.entries({
    drugs,
    trials,
    safety,
    pubmed,
  })) {
    router.get(`/${kind}`, async (req, res) => {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (!q || q.length > 300 || /[\u0000-\u001f]/.test(q))
        return res.status(400).json({
          error: "Enter a search between 1 and 300 characters.",
          code: "INVALID_QUERY",
        });
      const key = `${kind}:${q}`;
      const cached = cache.get(key);
      if (cached && Date.now() - cached.time < cacheTtlMs)
        return res.json(cached.data);
      if (pending.size >= 40 && !pending.has(key))
        return res.status(503).json({
          error: "Too many searches are running. Please try again shortly.",
          code: "SERVER_BUSY",
        });
      if (!pending.has(key)) {
        const task = handler(q)
          .then((data) => {
            cache.delete(key);
            cache.set(key, { time: Date.now(), data });
            while (cache.size > maxCacheEntries)
              cache.delete(cache.keys().next().value);
            return data;
          })
          .finally(() => pending.delete(key));
        pending.set(key, task);
      }
      try {
        res.json(await pending.get(key));
      } catch (error) {
        res.status(error.status || 502).json({
          error: error.message || "The research provider is unavailable.",
          code: error.code || "PROVIDER_ERROR",
          provider: error.provider || SOURCES[kind][0],
        });
      }
    });
  }
  return router;
}

export default createBiomedicalRouter();
