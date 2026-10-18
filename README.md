# scrapeTx

An open research workspace for literature review and pharmaceutical evidence. The scrapeTx identity uses ivory surfaces, charcoal text, sage accents, Satoshi typography with a locally bundled Geist fallback, and colored research-source icons. Independent source code under the MIT license.

The [brand guide](docs/brand.md) documents the supplied identity, typography, interface components, and motion behavior.

**Start Research** provides a simple **Topic → Sources → Create** workflow for source-linked papers and presentations. Choose a template, review collected literature, edit a rich document and slides, and download DOCX/PPTX files. It autosaves in Research Projects and recovers unsaved edits on the same browser. See the [workflow guide](docs/research-workflow.md).

**Make slides** opens a presentation-first workflow with selectable research sources, editable slides, speaker notes, and cited references. Cloudflare Workers AI illustrations are optional and are generated only for explicit diagram or presentation actions. See [presentations and image setup](docs/presentations-and-images.md).

**Molecular Docking** runs local AutoDock Vina calculations from prepared receptor and ligand PDBQT files, with a worked example, predicted poses, a 3D viewer, and downloadable scores and provenance. Run `npm run setup:docking` once on the server. See the [docking guide](docs/docking.md) for preparation requirements and interpretation limits.

## Start

Requires Node 24 (or Node 22.13+).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs at **http://127.0.0.1:5180**. No login screen, paid subscription, or API key is needed for public research search. Without Supabase settings, workspace data uses local SQLite.

For a built server, run `npm run build` and `npm start`, then open port 5180. See [deployment instructions](docs/deployment.md) for Supabase, Docker, and hosted settings.

## Research tools

The home search offers 13 source shortcuts in a horizontal rail, with Show all to expand it. The tool selector opens Deep Research, a systematic screening project, an evidence report, or biomedical search. Recently saved sources link back to their originals. Recent search queries can be permanently deleted individually (including duplicate history entries), or cleared together, without deleting saved sources.

- **My Library:** collections for sources, notes, and saved research; searchable/filterable records; linked original sources; Zotero/Mendeley RIS imports with duplicate detection; HTML bibliography, BibTeX, Markdown, and JSON exports. Save passages from PDFs and generated research to the same library.
- **Additional sources:** live arXiv preprints, Grants.gov opportunities, DataCite datasets, and exact Python package metadata from PyPI. Google Search, Scholar, and Patents retrieve source-linked results through your own SerpAPI connection; original-site links remain available.
- **Source Checks:** DOI metadata, Crossref/Retraction Watch publication updates, DOI-specific Crossmark links, PubMed notices, current MEDLINE journal indexing, and US FDA application/approval records. Each check identifies its source and limits; this does not certify scientific correctness. Title-only lookup offers candidates for explicit selection.
- **Research Agent:** multi-source searches with source counts, DOI/title deduplication, transparent lexical ranking, persistent conversations, source tables, Markdown exports, and optional cited AI synthesis.
- **Literature Search:** Crossref, Europe PMC, PubMed, and merged search views. More Filters stages year ranges, publication types, journals, conferences, included/excluded phrases, verified open access, and citation ranges before Apply. Filters affect loaded records, not the full provider index. Save and reopen searches with their filters; export all visible or selected sources as CSV, RIS, BibTeX, or a linked bibliography.
- **Evidence tables:** configurable metadata columns and named custom columns with extraction instructions. AI cells use one supplied abstract at a time, require an explicit Generate action, retain source links, and can be exported. Generation is bounded to eight rows per batch and two concurrent requests.
- **Agent Gallery:** 38 original workflows with task search, category/domain filters, horizontal colored tool markers, Run Task inputs, and View Output process guides. Computational tools that are not connected are described as planning or discovery workflows.
- **Research Watches:** saved PubMed, clinical-trial, and dataset queries; Run check establishes a baseline, then compares newly seen records and source metadata. Optional linked digest notes use workspace storage. Checks cover returned pages and run on demand; weekly is a recommendation, not an active background schedule.
- **Pharma Research:** PubChem compounds and structures, exact-identity ChEMBL mechanisms, registered ClinicalTrials.gov studies, openFDA label sections and separately labelled FAERS counts, and PubMed abstracts.
- **Research Projects:** review questions and protocols, library paper selection, inclusion/exclusion decisions, evidence notes, autosave, and screening CSV export.
- **PDF workspace:** browser-side selectable text extraction, page-linked excerpts, original PDF view, configurable AI explanations and evidence-field extraction, text/CSV exports. Supports up to 20 MB and 100 pages per PDF.
- **Templates:** a searchable catalog of writing starters and a user-supplied JEGH LaTeX template. Start writing attaches the file and prefills Home; the manuscript workspace checks required sections, asks for missing content, creates an editable source-based draft, saves in My Library and exports Word/LaTeX. JEGH exports retain the supplied page geometry and columns. See the [template workflow audit](docs/template-writing-audit.md).
- **Writing:** editable source-based outlines and templates, optional AI drafts, cloud-saved documents, Markdown, DOCX, LaTeX, and HTML/print-PDF exports.
- **Citations:** article/book/DOI lookup, clickable original-source links, APA/MLA/IEEE starting formats, BibTeX and RIS export, linked HTML bibliographies, and saved-library sources. Verify metadata and style details before submission.
- **Diagrams and presentations:** editable research structures, optional AI concept maps, slide outlines, and real PowerPoint export.
- **Text tools:** local phrase cleanup and readability statistics, plus optional model-based revision. The detector screen does not claim to determine AI authorship.

## ScrapeTx AI and integrations

ScrapeTx AI supports Google's native generation API and OpenAI-compatible endpoints. Set `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` in the ignored `.env.local` file; compatible endpoints also use `AI_BASE_URL`. Deployment identifiers and keys stay on the server, and the interface displays only ScrapeTx AI. The assistant cites supplied evidence and rejects unknown citation identifiers. The repository contains no working AI credential. See [AI setup](docs/ai-setup.md).

The Integrations page provides SerpAPI account-key validation, Zotero incremental reference pulls, Mendeley OAuth and reference pulls, workspace backups, private workspace transfer, source status, and configurable Streamable HTTP MCP servers. Search/library credentials are encrypted on this server and scoped to each browser workspace. Connectors require the user's provider credentials/consent and are not automatically authorized by installing this repository. MCP servers remain restricted to an owner workspace hash and explicit read-only calls. See [connection setup and research-data access](docs/connections-and-verification.md).

## Workspace storage

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` and apply the SQL migration in `supabase/migrations/`. Supabase RLS isolates browser workspaces using a random 256-bit capability token; only its SHA-256 hash is stored in the table. No service-role key is required. Keys stay out of URLs and source control.

Export backups before clearing browser storage. Possession of the private workspace key grants access; this model does not provide named-user accounts or recovery. PDFs stay in browser memory unless you explicitly send extracted passages to your configured AI provider. Saved text, papers, projects, and chats use the configured workspace database.

## Verification

```sh
npm test
npm run build
npm audit
npm run verify:cloud  # requires the local API; creates/deletes a disposable record
```

A GitHub Actions template is provided at [docs/github-actions.example.yml](docs/github-actions.example.yml). A repository owner can install it as `.github/workflows/checks.yml`; the connected token used for this release does not permit workflow creation.

Tests cover provider normalization, honest source failures, DOI deduplication, provenance, full-text restrictions, AI request/citation checks, Office export integrity, MCP permissions, and CSV quoting. [Inspection notes](docs/inspection.md) document what was observed in SciSpace and the reconstruction limits. [Public API sources](docs/api-sources.md) describes coverage and research caveats.

## Scope

scrapeTx is an independent application, not SciSpace source code or access to its proprietary services. It does not include the SciSpace private corpus, unrestricted Google Scholar scraping, commercial plagiarism or AI-detection engines, OCR, all citation styles, all languages, or a guaranteed systematic review. Public source coverage and licenses apply; paywalled full texts are not bypassed. AI model output requires source verification.

The repository is prepared for self-hosting. Public web hosting is not provisioned. Self-hosted forks need their own Supabase and AI settings; local development on this Mac has been verified with the supplied connection.
