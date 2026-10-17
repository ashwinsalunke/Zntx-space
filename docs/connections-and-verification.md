# Search connections, source checks, and research data access

Open **Integrations** in scrapeTx to connect personal accounts. Open **Source Checks** to inspect publication and US drug-approval records. Public verification services require no new account. Personal search and reference-library services require your own credentials or consent.

## Google Search, Scholar, and Patents

The app uses [SerpAPI](https://serpapi.com/search-api), a third-party provider, for all three searches. [Google's Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) is closed to new customers and is scheduled to end for existing customers on January 1, 2027. Your generative AI key is not a SerpAPI search credential.

1. Create a SerpAPI account and obtain its API key from [your account](https://serpapi.com/manage-api-key).
2. Enter the key in **Integrations → Google Search, Scholar & Patents**. The server validates it against SerpAPI's account endpoint before saving it.
3. Open any of the three source shortcuts and search. Scholar supports publication-year bounds; Patents supports publication-date bounds. General web search does not silently accept unsupported year filters.

These calls retrieve result metadata and snippets, not unrestricted full papers. Snippets remain separate from article abstracts in the UI, storage, AI prompts, and CSV exports. Records retain original links, and optional AI analysis runs only when requested. Provider account quotas and pricing apply; no provider plan was purchased or key created automatically.

API: `GET /api/google-search/search?source=scholar&q=...&yearFrom=2020&yearTo=2026`. Connection management is at `/api/connections/status` and `/api/connections/serpapi`. Credentials are scoped to the browser workspace; another workspace cannot use that stored key. The older `/api/sources/search` external-link response remains available for backward compatibility.

## Publication verification

`POST /api/verification/paper` accepts DOI, PMID, title, and optional ISSN. Exact identifiers are preferred. Title-only search returns up to five candidates for explicit selection and never automatically verifies a similar title.

| Check | Primary service | Meaning and boundary |
| --- | --- | --- |
| DOI metadata | [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) | Compare registered DOI/title metadata. DOI registration does not certify scientific accuracy or peer review. |
| Publication updates | [Crossref/Retraction Watch](https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/) | Inspect incoming updates and reverse-linked notices. Distinguish a retracted original from the notice that retracts it. Coverage depends on deposited/collected updates; no notice returned is not a clean bill of health. |
| Crossmark | [Crossmark](https://www.crossref.org/services/crossmark/) | Open the DOI-specific status page. Availability and completeness depend on publisher participation. The app also reads deposited update metadata through Crossref. |
| PubMed notices | [PubMed](https://pubmed.ncbi.nlm.nih.gov/help/) | Inspect the identified article's publication types and linked correction/retraction/concern notices. PubMed inclusion is not endorsement or proof of correctness. |
| MEDLINE indexing | [NLM Catalog](https://www.ncbi.nlm.nih.gov/nlmcatalog/) | Match journal ISSN and check the current indexing subset. Catalog existence alone does not establish MEDLINE inclusion; current journal indexing does not prove that a particular article was indexed or peer reviewed. |

The same checks are accessible from paper details, saved publication records, Pharma PubMed results, and the report's explicit **Check report sources** action. Reports inspect at most the eight abstract sources supplied to that report. Each check includes its source, timestamp, notices, and coverage. Provider failures remain unavailable rather than becoming false negative findings. Successful complete checks are cached for five minutes with their original check time retained.

`GET /api/verification/drug?q=semaglutide` uses the [Drugs@FDA API](https://open.fda.gov/apis/drug/drugsfda/) and application links. It distinguishes original approval submissions from supplements and tentative approvals. Historical approval is not a guarantee of current marketing status or approval for every indication. It does not infer approval from labels, NDC registration, trial registration, or adverse-event reports. Missing matches do not establish that a drug is unapproved, including outside the US.

## Zotero synchronization

1. Create a [Zotero library key](https://www.zotero.org/settings/keys/new) with library read access. Write access is unnecessary.
2. In Integrations, choose your personal library or an authorized group. A personal user ID can be discovered from the key; group libraries require the group ID.
3. Connect, then choose **Sync references**. Continue a partial sync until the remaining batches finish.

The connector uses [Zotero API version checkpoints](https://www.zotero.org/support/dev/web_api/v3/syncing), pagination, permission validation, and deletion logs. It copies and updates reference metadata in this workspace. Local notes and unrelated references are preserved. Source removals mark the local copy as removed at source rather than deleting it. It does not upload changes, download attachments, or write to Zotero. A batch handles up to 500 records and does not advance the final checkpoint until all pages and local writes succeed.

## Mendeley synchronization

1. Register an application in the [Mendeley developer portal](https://dev.mendeley.com/reference/topics/application_registration.html).
2. Register the exact callback displayed in Integrations. For the default local preview it is `http://127.0.0.1:5173/api/library-sync/mendeley/callback`.
3. Enter the application ID and secret in Integrations and choose **Authorize on Mendeley**. Sign in and grant consent on Mendeley's page, then sync references after returning.

Mendeley's documented [authorization code flow](https://dev.mendeley.com/reference/topics/authorization_auth_code.html) requires scope `all`; this connector nevertheless uses only reference/profile read APIs and explicitly requested attachment downloads. The app never collects a Mendeley password. OAuth state expires and is single use, tokens refresh server-side, and pagination is restricted to the provider host. A failed replacement authorization preserves the previous working connection. Sync is a read-only pull; it does not upload library edits or run a background schedule. The Mendeley source tool searches imported copies by title, author, abstract, DOI and tags. Available PDF attachments can be opened on demand from the source tool or My Library; PDFs are not copied by the metadata sync.

Disconnecting removes the stored credentials and leaves imported references available. RIS import remains an alternative that needs no account connector.

## PDF reading and downloads

Source results with a supplied PDF link offer **Read PDF**, opening `/read-pdf` with an embedded document viewer, an original-source link and a download button. Public PDFs are loaded through `/api/source-pdf` to support sources without browser CORS headers. The loader permits HTTPS, resolves and pins public DNS addresses for every redirect, rejects private networks and credentials, caps responses at 20 MB, and verifies PDF magic bytes. It does not forward browser cookies or unlock subscription content. A blocked or non-PDF source returns a visible error with an original-source action.

Mendeley attachments use `/api/library-sync/mendeley/documents/:id/pdf`. The server reads the authorized account's attachment list and requests a temporary signed download URL using the documented Files API. The bearer token stays on `api.mendeley.com`; the signed URL is retrieved without bearer credentials and is never exposed in the app URL or API output. Access requires that browser workspace's Mendeley connection. Private attachments are not made public for other users. Account tokens refresh when needed. References without PDF attachments still retain their supplied source links.

## Scientific diagrams

The Diagrams tool sends the user's requested process to the assistant, then draws its validated node/edge output as an illustrated SVG. It supports left-to-right or top-to-bottom layout, optional scientific illustrations, zoom, an accessible text description, and SVG/PNG downloads. Choose up to six saved sources with abstracts before generating to supply evidence. Changing that selection does not silently start a new generation. Without evidence, the output is marked as unverified. **Save to library** stores both its text and diagram data so the visual can be reopened and exported from the saved note. Labels and relationships remain AI-generated and require scientific review.

## Credential storage and deployment

Personal credentials are encrypted with AES-256-GCM in the ignored server-local `.data/connector-vault.db`. The local key is `.data/connector-vault.key`; both files are restricted to the server user. Workspace/provider scope is authenticated as part of encryption. Credentials never enter the Supabase research-record table, model prompts, normal status responses, Git, or workspace JSON exports. This protects stored values but is not encryption against an administrator who controls the server and key.

Preserve the vault database and key together in secure operator backups. Container deployments need a persistent `.data/` volume even when research records use Supabase. Losing the key requires reconnecting accounts. Set `APP_ORIGIN` to the actual public HTTPS origin and register the matching Mendeley callback before hosting. Pending OAuth state is in process memory; a server restart requires starting that authorization again. Multiple server instances require shared state/storage design before offering these personal connectors across instances.

## Accessing private research data

There is no universal credential that unlocks a research firm's private data. Choose the material needed before buying access:

- **Subscription papers/databases:** ask your college librarian what access already exists. Reading access and API/text-mining permissions can differ. [Elsevier](https://dev.elsevier.com/) explicitly explains that an API key alone does not grant content access.
- **Controlled clinical-trial data:** identify a study and submit a research proposal through a data-sharing service such as [Vivli](https://vivli.org/resources/requestdata/). Approval and a data-use agreement may be required; analysis may have to remain in an approved secure environment.
- **A company's unpublished experiments or commercial datasets:** obtain access from that organization under its collaboration or licensing process. Its owner must approve the dataset, allowed uses, and integration method before a connector can be configured.

scrapeTx currently has public-source search, local PDF reading, and user-authorized reference imports. No private firm subscription, controlled participant-data approval, or proprietary SciSpace corpus has been obtained. Do not assume that a library subscription or reference-manager connection permits sending licensed or restricted material to an external AI service.

## How Hugging Face could help

[Sentence Transformers](https://huggingface.co/docs/hub/en/sentence-transformers) can provide embeddings for semantic retrieval across permitted research text. [Text Embeddings Inference](https://huggingface.co/docs/text-embeddings-inference/quick_tour) can serve embedding and reranking models, helping rank relevant passages before a source-linked answer. Other models can support extraction, biomedical entity recognition, or local inference; suitability and output accuracy require evaluation on the intended task.

Hugging Face hosts models and datasets; it does not certify paper findings or automatically unlock private research. [Gated datasets](https://huggingface.co/docs/hub/en/datasets-gated) require the owner's access process and appropriate credentials. Model/dataset licenses still apply. Downloadable weights may be free to use under their licenses, while local compute, hosted inference, and dedicated endpoints have costs; see [Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing).

Hugging Face is not configured in this app yet. A sensible next use is to evaluate local embeddings/reranking for your permitted papers while keeping the current ScrapeTx Ai generation connection. No new model downloads, GPU infrastructure, hosted inference subscription, or private dataset access was provisioned in this revision.
