# Inspection and verification

Reference inspected: https://scispace.com/ on 16 October 2026.

## Observed interface

The live public interface was inspected through the Codex in-app browser at mobile and desktop widths. Its visible navigation, prompt controls, and computed DOM styles established:

- Inter as the application font, 14 px for desktop controls.
- A 32 px / 38 px, weight-600 home heading with -0.32 px tracking.
- A 240 px expanded sidebar and narrow collapsed icon rail.
- Warm stone/off-white surfaces, thin neutral borders, orange primary actions, and a white prompt with a soft shadow.
- The home task composer, attachment/tool/mode/voice controls, five quick actions, expandable navigation, Literature Search entry, PDF upload entry, and agent-gallery structure.

The Zntx logo is an original layered Z mark. Authentication and commercial signup actions were replaced with direct workspace/library access. No login or signup flow exists in the demo.

## REA evidence and limits

The explicitly requested reverse-engineer-anything skill was used. REA performed a controlled launch-and-wait scenario for the supplied SciSpace URL.

Evidence ID: `ev_9592361ec78a7c2718141ba76e877ec65d406a481c464332fe7d8c6397d0363b`.

That isolated browser received a CloudFront 403 response. It does **not** establish the original application's layout or internals. A separate visible in-app-browser session successfully rendered the public interface; the observations above come from its screenshots and read-only computed styles. No claim is made about authenticated screens, source recovery, proprietary research models, private backend endpoints, or complete functional equivalence.

## Implemented design decisions

The dashboard retains the measured layout, Inter family, home prompt spacing, icon navigation, and warm theme. Secondary workflows are independently implemented with consistent controls and smaller, functional demo scope. Trust/customer claims from SciSpace were omitted because they would not apply to Zntx Space.

Public APIs: Crossref REST (`api.crossref.org/works`) and Europe PMC REST (`www.ebi.ac.uk/europepmc/webservices/rest/search`). Results are live provider records. Missing abstracts and metadata are shown as unavailable rather than fabricated. Local SQLite holds saved papers, recent searches, and drafts.

## Verification

- Production build completed successfully, with PDF code loaded in a separate route chunk.
- Automated checks cover absent source evidence, page-bound passage retrieval, missing metadata, abstract markup, citation exports, and CSV quoting.
- Live Crossref search returned 24 journal records; live Europe PMC search returned 24 records with abstracts available on 20 of them in the tested query.
- Browser checks: homepage search; save paper; select two papers and compare; library persistence after reload; bibliography format selection and a real BibTeX download; agent filtering; source-backed working draft creation, save, reload, and reopen.
- PDF checks: original sample excerpts linked to page 2; real 15-page arXiv PDF successfully extracted; document help overlap found and fixed.
- Mobile checks at 375 px passed on home, gallery, templates, search, PDF, writer, and citations without document-level horizontal overflow. Gallery layouts also passed at 768, 1024, and 1440 px. Mobile sidebar controls become inert while the sidebar is hidden.
- Working template selection, text revision, topic prompts, and diagram creation were exercised in the browser. Page transitions reset the scroll position.

REA also captured the implemented local demo with no page-error events in either bounded capture window:

- Desktop, 1440 × 900: `ev_194672efb773e42ad6e7daef4b19fe9f5dc1bf4c9a366aad0ce3d6de0025bc87`.
- Mobile, 375 × 812: `ev_4f859b95c4efce276107a67dd2dfd9594aadf8549a430ae4f2df15b59d7a5a52`.

Screenshots are saved locally in the ignored `artifacts/` folder. These bounded observations do not establish exhaustive browser or feature coverage.

The demo does not run a language model, OCR, scientific quality assessment, or AI-authorship detector. Literature matches are not a systematic review, and citation formatting should be checked against the chosen style guide.
