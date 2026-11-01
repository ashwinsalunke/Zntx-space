# Clickable claim evidence

AI answers use compact source chips and clickable cited sentences. They open a sources panel with the claim, the source title and original link, the exact supporting passage when matched, evidence coverage, and the extracted PDF page when available. Search activity lists recorded queries, providers, result counts, failures, and the actual evidence supplied to the answer.

## What is checked

Source identity and claim support are separate checks. The existing source-check tools still inspect identifiers, publication metadata and notices. The new support assessment compares one claim with up to six cited source passages. For a claim citing more than six sources, the panel checks all sources sequentially in bounded batches and shows progress. It runs on demand when the panel opens and is cached for repeated inspections of identical text within the browser session.

`POST /api/ai/evidence` uses the configured private AI connection and shares generation concurrency and the paid-operation rate limit. It accepts a claim and bounded source text. The model returns supports, partial, does-not-support, or contradicts, with an explanation and a quotation. `shared/claim-evidence.js` rejects any quotation not found contiguously in the supplied source text after whitespace normalization. Supports, partial and contradicts require a matched passage. Unknown source IDs, duplicate assessments, oversized input and invalid page metadata are rejected. Missing assessments are shown as not assessed.

This is an **AI assessment of supplied evidence**, with deterministic quote provenance checking. It is not a guarantee of entailment or scientific truth. A valid excerpt can still be misinterpreted by a model. The UI labels the assessment and retains the full supplied text for inspection. Missing passages and provider failures stay visible rather than becoming successful support checks. No source document is fetched by the support endpoint; a snippet or abstract is never represented as a full-paper read.

## Coverage and persistence

- Generated citation records now retain the actual bounded evidence text, coverage kind, PDF URL and page metadata when supplied. Existing saved citations with metadata alone remain usable but cannot claim passage support.
- PDF extraction passes the actual file page number. It is never inferred from an article title or an AI answer. Page numbering refers to extracted file pages and may differ from printed numbering.
- Public PDF links open in the in-app reader with a page fragment. Uploaded PDFs open at their page in the current PDF tool. The existing uploaded-file session limitation remains; a saved page location does not recreate a missing file.
- Research chat saves the generation's citation evidence and compact search provenance. Notes retain the same citation metadata. Workflow and notebook editors open evidence from citation nodes; edits cause fresh checks of the current cited sentence.
- Saved assessments are reused only when the claim is unchanged and the quote still matches the saved passage; Recheck support runs a fresh comparison. Save evidence check stores a `claim-evidence` note in the active shared project, including the claim, source passages, AI assessment, and recorded search activity. The existing workspace token and project-membership checks continue to apply.
- Search activity describes executed application operations and supplied evidence. It does not expose internal model reasoning or invent search activity. A supplied-document answer explicitly says that no web search is recorded.

## Validation

Unit checks cover exact excerpt matching, invented text rejection, unknown/duplicate sources, sentence-to-citation association, safe links, and non-inferred PDF page numbers. API checks cover native structured requests, passage support, failures, private credentials, and missing source text. The UI test opens a sentence, shows a matched passage and PDF page link, inspects successful and failed search activity, saves under the selected project, and checks the metadata-only legacy path.
