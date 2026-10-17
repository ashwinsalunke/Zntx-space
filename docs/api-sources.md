# Biomedical evidence APIs

`server/biomedical.js` exports an Express router as default. Mount it at `/api/biomedical`.
No API key, user account, proprietary SciSpace service, or new npm dependency is required for these lookups.

All routes are GET requests with a required `q` string (1–300 characters). Successful responses contain `query`, `source`, `sourceUrl`, `retrievedAt`, `results`, `total`, and `warnings`. Provider failures return HTTP 502 and `{ error: string, code, provider }`. Invalid queries return 400. Queue overload returns 503. A verified upstream “not found” becomes an empty result, never generated evidence. Optional provider failures are described in `warnings`.

| Route                             | Source and implementation                                                                                                                                                                                                | Returned evidence                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/drugs?q=aspirin`                | [PubChem PUG REST](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest) compound name/property lookup; [ChEMBL data services](https://chembl.gitbook.io/chembl-interface-documentation/web-services/chembl-data-web-services) | Up to five PubChem compounds: CID, molecular formula, molecular weight, connectivity SMILES, InChIKey, IUPAC name, structure image and source link. The first compound is optionally joined to ChEMBL by exact InChIKey for recorded mechanisms and target IDs.                                                                                                       |
| `/trials?q=metformin`             | [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api), `/api/v2/studies` with `query.term`, `pageSize=20`, `countTotal=true`                                                                              | Up to 20 registered studies: NCT ID, title, registered status, phase, conditions, interventions, sponsor, enrollment, study dates, brief summary, source link and whether results are posted. `total` is the provider's matching study count; `nextPageAvailable` indicates more records.                                                                             |
| `/safety?q=aspirin`               | [openFDA event](https://open.fda.gov/apis/drug/event/how-to-use-the-endpoint/), [count query syntax](https://open.fda.gov/apis/query-syntax/), and [drug labeling](https://open.fda.gov/apis/drug/label/) endpoints      | The 15 most frequently reported reaction terms within matching FAERS reports, plus up to three labels in `labels`. Labels include brand/generic names, manufacturers, routes, warning sections, boxed warning, indication text, and DailyMed source link. `total` counts matching reports, independently of reaction counts. `lastUpdated` is the source update date. |
| `/pubmed?q=semaglutide%20obesity` | [NCBI ESearch and EFetch](https://www.nlm.nih.gov/dataguide/eutilities/utilities.html)                                                                                                                                   | The first 20 relevance-ranked PubMed records with original abstracts, structured abstract section labels, PMID, authors, journal, publication year, DOI and PubMed link. `total` is the source's full matching record count.                                                                                                                                          |

## Data interpretation and coverage

These are source lookups for research, not medical recommendations or drug discovery predictions. They do not perform docking, calculate ADMET, establish efficacy, generate systematic review conclusions, or unlock SciSpace Pro services.

FAERS reports do not establish causation, event incidence, or comparative safety. A single report can include multiple drugs and multiple reactions; reaction counts must not be summed to estimate patient counts. Reporting, missing data, duplicate patients, and exposure differences affect interpretation. The response includes this limitation for display beside the counts. See [FDA's source limitations](https://open.fda.gov/apis/drug/event/).

openFDA labels reflect submissions and can differ from current approved labeling. A missing warning field or empty search result does not establish safety. Consult each original label and the source's [labeling guidance](https://open.fda.gov/apis/drug/label/).

PubMed supplies abstracts when present, not unrestricted full text. Missing abstracts remain empty; citation counts remain `null` because EFetch does not supply them. An indexed record does not establish an open-access license, so `openAccess` is conservatively false. The normalizer handles `PubmedArticle` records; book records or unsupported XML records are omitted with an explicit warning when fewer IDs normalize. DOI extraction excludes the reference list so a cited paper's DOI is never attributed to the indexed paper.

Compound name lookup is exact provider lookup, not fuzzy discovery or target prediction. ChEMBL mechanism enrichment can be absent even when PubChem finds a compound. The structure join avoids merging different salts, stereoisomers, or similarly named drugs. A registered clinical trial is not evidence of a positive outcome, and `hasResults` only describes posted registry results.

The interface currently returns bounded first result pages. Follow source links for full record collections and filtering. Different databases have different coverage and update schedules. Preserve source attribution and review provider data terms when redistributing exports; this project's software license does not relicense source publications or datasets.

## Reliability and deployment

Each upstream attempt has a 12-second timeout. Transient network failures, HTTP 429, and server failures receive at most one retry; long `Retry-After` instructions are surfaced instead of looping. Requests are throttled per provider within one Node process, with NCBI requests at least 360 ms apart and PubChem requests at least 250 ms apart. These limits do not coordinate multiple server instances or other applications sharing an outbound IP.

Successful searches are cached for five minutes with at most 100 entries. Concurrent identical searches share upstream work. At most 40 distinct searches run at a time; excessive per-provider backlog is rejected. Cache, queues, and limits are process-local. Public multi-instance deployments should add shared IP/user rate limiting and distributed request coordination to comply with provider quotas. Query terms are sent to the respective public evidence provider; do not put patient identifiers or private clinical records into searches.

## Verification

On 2026-10-16, all four router endpoints returned HTTP 200 against live upstream services: aspirin resolved to PubChem CID 2244 and ChEMBL CHEMBL25 with a recorded cyclooxygenase mechanism; metformin returned registered studies; aspirin returned FAERS reaction aggregates and three label records; semaglutide/obesity search returned PubMed abstracts with DOI and PMID provenance. Result counts are live and change over time.

`node --test tests/biomedical.test.js` covers normalization/provenance, empty and missing evidence, bounded cache eviction, query validation, concurrent deduplication, optional provider failure, retry bounds, malformed provider responses, and FAERS count interpretation. Tests use injected upstream responses and require no network access.

## Bibliography source links

Bibliography lookup uses Crossref `query.bibliographic` across registered record types, including books and chapters. A supplied DOI uses the exact `/works/{doi}` endpoint. Exact title matches in returned records are shown first; related results keep their provider metadata. This is matching, not verification that a source supports a claim. See the [official Crossref API documentation](https://www.crossref.org/documentation/retrieve-metadata/rest-api/).

Clickable references prefer a normalized DOI resolver URL, then the supplied HTTP(S) source URL, with PubMed/PMC identifier fallbacks. Missing identifiers remain unavailable. HTML bibliography downloads preserve clickable links; text, BibTeX, and RIS retain source URLs. Publisher records may still require a subscription for full text.


## Home source catalog and additional public services

`GET /api/sources/status` describes all 13 home options and distinguishes live public APIs, external searches, file tools, and personal library imports. `GET /api/sources/search?source=ID&q=QUERY` supports these additional services:

| ID | Original API | Returned records |
| --- | --- | --- |
| `arxiv` | [arXiv Atom API](https://info.arxiv.org/help/api/index.html) | Preprint titles, authors, publication dates, supplied abstracts, identifiers, and original arXiv links. Requests are serialized at least three seconds apart per process. A transient failure triggers a labelled OpenAlex backup filtered to the arXiv source and validated arXiv record links; ranking and coverage differ. Brief cooldown prevents repeatedly hitting a failing API. Preprints are labelled. |
| `grants` | [Grants.gov search2](https://www.grants.gov/api/common/search2) | Funding opportunity titles, agencies, status, dates, supplied descriptions, and original opportunity links. |
| `datasets` | [DataCite REST API](https://support.datacite.org/docs/rest-api) | Dataset records with DOI, title, creators, publication year, supplied descriptions, and source links. A DOI does not establish open-access rights. |
| `python` | [PyPI JSON API](https://docs.pypi.org/api/json/) | Exact package metadata, publisher summary, version, official links, and licence information. No package is installed or executed. |

Responses retain source, retrieval time, result counts, coverage warnings, and stable identifiers. Empty results and provider failures remain explicit. These services use fixed upstream origins, bounded responses, request timeouts, and a bounded cache; tests inject provider responses, and all four services were exercised against live sources on 16 October 2026.

Google Scholar, Google Search, and Google Patents use `/api/google-search/search` after a workspace connects its SerpAPI key in Integrations. Results identify the third-party provider and preserve snippets separately from abstracts. Original-site links and the legacy external-link route remain available. Zotero and Mendeley support authorized reference pulls through `/api/library-sync`; RIS import remains available. Uploaded Files routes to the browser PDF workspace; ClinicalTrials.gov routes directly to the registered-studies tool. See [connection and verification details](connections-and-verification.md) for API contracts, account requirements, publication/approval checks, and coverage limits.
