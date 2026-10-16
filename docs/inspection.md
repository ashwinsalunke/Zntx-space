# Inspection and verification

Reference: https://scispace.com/, inspected on 16 October 2026. This is an independent reconstruction of visible workflows, not recovered SciSpace source code.

## Reference evidence

The public interface was inspected in the in-app browser. Read-only computed styles established Inter, 14 px desktop controls, a 32 px/38 px weight-600 home heading, -0.32 px heading tracking, a 240 px expanded sidebar, warm stone surfaces, neutral borders, and a white task composer. The original primary actions were orange; Zntx Space intentionally uses black primary buttons at the user's request. The layered Z logo is original.

The signed-in application was also inspected through native Google Chrome. Observations covered the home task composer and tool menus, agent gallery, an existing research conversation with source checkpoints and files, AI Writer and its notebook editor, PDF/extraction entry flows, literature search, paraphraser controls, humanizer controls, detector input choices, and the APA citation generator. These observations establish visible controls and interaction patterns only. No claim is made that every paid workflow was executed, that paid outputs were evaluated, or that private backend implementation was recovered.

REA's initial isolated reference capture received CloudFront 403. Evidence `ev_9592361ec78a7c2718141ba76e877ec65d406a481c464332fe7d8c6397d0363b` therefore does not establish the reference layout. The successful visible browser observations above provided that evidence instead.

## Implemented scope and open gaps

| Area | Implementation | Coverage boundary |
| --- | --- | --- |
| Theme/navigation | Measured home layout, Inter, warm background, black buttons, direct dashboard access | Independent secondary screens; no login or subscription flow |
| Literature and agent | Crossref, Europe PMC, direct PubMed; deduplication, lexical ranking, source records, saved research conversations | Bounded results; no proprietary corpus, semantic reranker, or exhaustive systematic review |
| Pharma | PubChem structures, exact-identity ChEMBL mechanisms, ClinicalTrials.gov registry data, openFDA labels and separate FAERS counts | Research source retrieval; no clinical inference, causal safety estimates, or prescribing engine |
| Review projects | Question, protocol, paper selection, include/exclude decisions, reasons, notes, screening CSV | No collaborative accounts or audit-grade review management |
| PDF | Browser-side text extraction, original view, page-linked passages, optional AI explanation/extraction | One selectable-text PDF at a time, 20 MB/100 pages; no OCR |
| Writing and exports | Editable drafts, references, real DOCX/LaTeX/HTML/Markdown, editable slide templates and real PPTX | AI generation requires an operator-supplied provider key and model |
| Citations/text tools | Basic bibliography formats, BibTeX/RIS, local readability and cleanup, optional AI revision | No exhaustive style catalogue, commercial plagiarism engine, or AI-authorship verdict |
| Storage | Supabase REST and enforced RLS; SQLite fallback when cloud is not configured | Private browser capability, no identity recovery; list endpoints return up to 500 recent records per collection |
| Connectors | Owner-restricted Zotero and Streamable HTTP MCP configuration, explicit read-only tool calls | Personal credentials and MCP servers not configured; no OAuth onboarding or write tools |
| Release | MIT source, CI template, Dockerfile, self-host instructions | No public web host provisioned; Docker build not exercised on this Mac |

The AI adapter was validated with controlled HTTP provider responses, including citation checks, timeouts, error redaction, and concurrency limits. No external AI generation was claimed: the local setup currently requires `AI_API_KEY` and `AI_MODEL`.

## Verification of version 0.2.0

- 46 automated tests cover provider normalization, DOI deduplication, partial outages, metadata provenance, open full-text limits, AI validation/citation handling, real Office packages, MCP owner/read-only restrictions, PDF passage retrieval, and exports.
- Production build passed; PDF and new research screens are separately loaded chunks. Dependency audit reported zero vulnerabilities.
- Applied Supabase migration to the configured project. Direct REST checks verified own-row access, other-workspace isolation, missing-token rejection, and forged-owner rejection. Supabase security advisors returned no lints at inspection time.
- `npm run verify:cloud` passed create/read/update, cross-workspace isolation, and missing-token rejection using a disposable record that it cleaned up.
- Live merged search retrieved 80 provider records and retained 79 unique records for a cardiovascular semaglutide query. Counts describe that bounded request, not database completeness.
- Live PubChem/ChEMBL aspirin lookup, PubMed abstracts, registered metformin trials, and openFDA aspirin data returned actual provider records. Source caveats remain visible.
- Live Europe PMC open-access article text returned six sections and 67,313 characters for PMC13365446, with license/provenance and no truncation in that response.
- Browser checks passed saving a PubMed paper, creating a review project, adding an inclusion decision and reason, reloading those fields, saving/reopening a research conversation, and saving/reopening a writing document from Supabase.
- UI DOCX and PPTX downloads were valid ZIP/Office packages and preserved the entered research question. These were user-written protocol notes, not claimed model-generated findings.
- New pharma, projects, research chat, and integrations screens were loaded and checked at widths 375, 768, and 1440 without document-level horizontal overflow. Earlier PDF, search, gallery, template, writing, and citation screens also passed mobile checks.
- Earlier PDF verification extracted a real 15-page arXiv paper and retained page-linked source passages. PDF optional model actions remain disabled until provider setup.

REA's final local black-theme capture at 1440 × 1000 retained zero page-error events in its bounded window: `ev_ab0b4f85f5dec28496fbd62b9951e93e54eeab0d6e331099c2f25e5b50e4409b`. The screenshot is saved locally in ignored `artifacts/zntx-space-black-theme.png`.

Earlier local captures: desktop `ev_194672efb773e42ad6e7daef4b19fe9f5dc1bf4c9a366aad0ce3d6de0025bc87`, mobile `ev_4f859b95c4efce276107a67dd2dfd9594aadf8549a430ae4f2df15b59d7a5a52`. These predate the black-theme expansion. Bounded checks do not establish exhaustive browser or feature coverage.

GitHub’s connected OAuth token rejected workflow creation because it lacks the `workflow` scope. The same configuration is included as `docs/github-actions.example.yml`; no Actions run is claimed. A repository owner can copy it to `.github/workflows/checks.yml` using a credential that permits workflows.
