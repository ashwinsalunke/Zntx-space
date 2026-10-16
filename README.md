# Zntx Space

An open research workspace for literature review and pharmaceutical evidence. SciSpace-inspired layout, locally bundled Inter typography, warm backgrounds, and black primary buttons. Independent source code under the MIT license.

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

- **Research Agent:** multi-source searches with source counts, DOI/title deduplication, transparent lexical ranking, persistent conversations, source tables, Markdown exports, and optional cited AI synthesis.
- **Literature Search:** Crossref, Europe PMC, PubMed, and merged deep-search views; abstracts, date/citation filters, paper comparison, and CSV export.
- **Pharma Research:** PubChem compounds and structures, exact-identity ChEMBL mechanisms, registered ClinicalTrials.gov studies, openFDA label sections and separately labelled FAERS counts, and PubMed abstracts.
- **Research Projects:** review questions and protocols, library paper selection, inclusion/exclusion decisions, evidence notes, autosave, and screening CSV export.
- **PDF workspace:** browser-side selectable text extraction, page-linked excerpts, original PDF view, configurable AI explanations and evidence-field extraction, text/CSV exports. Supports up to 20 MB and 100 pages per PDF.
- **Writing:** editable source-based outlines and templates, optional AI drafts, cloud-saved documents, Markdown, DOCX, LaTeX, and HTML/print-PDF exports.
- **Citations:** article/book/DOI lookup, clickable original-source links, APA/MLA/IEEE starting formats, BibTeX and RIS export, linked HTML bibliographies, and saved-library sources. Verify metadata and style details before submission.
- **Diagrams and presentations:** editable research structures, optional AI concept maps, slide outlines, and real PowerPoint export.
- **Text tools:** local phrase cleanup and readability statistics, plus optional model-based revision. The detector screen does not claim to determine AI authorship.

## Models and integrations

Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in the ignored `.env.local` file to connect an OpenAI-compatible model. No model credentials are supplied or committed. The UI shows configuration status and never substitutes invented AI results when a provider is missing. See [AI setup](docs/ai-setup.md).

The Integrations page provides workspace backups, private workspace transfer, source status, optional Zotero import, and configurable Streamable HTTP MCP servers. Personal connectors require an owner workspace hash. Only explicitly requested read-only MCP calls are enabled; arbitrary write tools and OAuth onboarding are outside the current implementation.

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

Zntx Space is an independent application, not SciSpace source code or access to its proprietary services. It does not include the SciSpace private corpus, unrestricted Google Scholar scraping, commercial plagiarism or AI-detection engines, OCR, all citation styles, all languages, or a guaranteed systematic review. Public source coverage and licenses apply; paywalled full texts are not bypassed. AI model output requires source verification.

The repository is prepared for self-hosting. Public web hosting and a live paid AI provider are not preconfigured.
