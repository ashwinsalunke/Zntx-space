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

The initial AI adapter was validated with controlled HTTP responses. The version 0.3.0 follow-up below records live generation using a privately configured account; source control contains no working provider credential.

## Verification of version 0.2.0

- 53 automated tests cover provider normalization, DOI deduplication, partial outages, metadata provenance, open full-text limits, AI validation/citation handling, real Office packages, MCP owner/read-only restrictions, PDF passage retrieval, and exports.
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

## Bibliography follow-up

Added clickable source titles and original-source links, exact DOI lookup, all-type Crossref bibliography search, normalized DOI/publisher/PubMed/PMC URL fallbacks, book/chapter export types, and a linked HTML bibliography download. Seven added tests cover exact lookup, title matching, source fallbacks, unsafe URL rejection, URL retention across citation formats, book/chapter metadata, and escaped HTML. The complete suite now has 53 passing tests; the production build passed.

Browser verification resolved DOI 10.3389/fendo.2021.645563, added Safety of Semaglutide to the bibliography, downloaded HTML containing its DOI anchor, and followed the in-app bibliography link to the original Frontiers article. REA capture `ev_f96c6fd407c2eeed6c75eb0d8251cdb76ece06c9a8d777d66da721ca0869307c` shows the populated bibliography with zero page errors in the bounded scenario.


## Version 0.3.0: source selection, personal library, and ScrapeTx Ai

A further native Chrome review inspected SciSpace's expanded USE options and signed-in My Library. The home list exposes Deep Research, Zotero Library, Mendeley Library, PubMed, Google Scholar, arXiv, Python Library, Grants.gov, Uploaded Files, ClinicalTrials.gov, Google Search, Google Patents, and Online Datasets. Choosing PubMed built a task prompt in the composer. The reference also offered an image generator; it was not part of the requested 13 options. Its folder view included Files, Notebooks, and Chats, folder-scoped tasks, PDF upload, Zotero import, a notebook entry, and Share/Rename/Delete menus. These were read-only observations; no reference account data was deleted or submitted for generation.

Zntx Space now has all 13 requested source shortcuts, live additional public-source adapters, dedicated external-search pages, and a library with collections, notes, saved searches, original-source links, RIS imports, and linked exports. The final home follows the user's preference for practical research software: a clear query, source selection, recently saved references, and compact research-tool links. Inter remains bundled locally; text is larger, primary buttons remain black, and hover motion is restrained with reduced-motion support. Decorative hero copy and promotional feature cards were removed.

Verification on 16 October 2026:

- 85 automated checks passed, including native AI wire format, server-only credentials, citation validation, availability fallback, structured graph validation, public-source provenance, RIS parsing, and non-article citation exports.
- Production build passed and the full dependency audit reported zero vulnerabilities.
- Live ScrapeTx Ai generation returned linked evidence and a validated three-node research workflow. Public identity fields contain only ScrapeTx Ai. The originally supplied latest alias experienced capacity errors/timeouts; local private configuration uses an account-accessible deployment that successfully generated output. Optional capacity fallback remains bounded. The UI supplies numbered evidence identifiers. Explicit citation groups are normalized only when every identifier was supplied; unknown identifiers remain rejected.
- All four additional sources returned live records: arXiv preprints, Grants.gov funding notices, DataCite datasets, and PyPI package metadata.
- Supabase verification passed create/read/update, cross-workspace isolation, and missing-token rejection; its disposable record was cleaned up.
- Browser checks created a Cardiovascular evidence collection, organized a real PubMed paper, saved a source-linked reading plan, and verified the records after reload. A real RIS reference imported with its original DOI link.
- Browser PDF extraction read the 19-page Safety of Semaglutide paper, found the original limitation passage on page 13, and saved that page-linked excerpt to My Library. This is retrieved source text, not a generated scientific finding.
- Final home captures at 1440 and 375 pixels retained zero page errors: `ev_3445c91f00cdb52d523366a9fb8738ce30c46aee09952e7657be82da0f921186` and `ev_e5ae79bd4d28418ebfc65b646083a8283a2bbd761a25166d9c75e8108cd4b60f`. The desktop screenshot is saved locally in ignored `artifacts/refreshed-home.png`.
- A live PyPI source page and the ClinicalTrials.gov shortcut at 768 pixels also retained zero page errors: `ev_da0ee083a09d5705286ac5ed9696b096bdca060f561e137812ad24758339beb8` and `ev_03e779e97c38a4f18b540b9553724e7cff2ce17bdb34b72490868a1a45d1b9f0`.

These bounded checks do not establish exhaustive SciSpace Pro parity or recover any private SciSpace backend. Google searches open original sites; Mendeley synchronization, private Zotero credentials, and additional personal MCP servers still require their own setup. Public web hosting has not been provisioned.
