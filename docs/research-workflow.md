# Guided research workflow

Open **Start Research** in the sidebar, or choose **Create paper & slides** below the home search box. A topic entered on the home page carries into the workflow. Four existing writing templates also offer **Guided research** in the Templates catalog.

## Three steps

1. **Topic:** Enter a topic or research question. Choose a literature review, pharmaceutical review, research proposal, or scoping-review starter. Optional settings control approximate word count, audience, reference format, and slide count. **Find sources** pauses for source review; **Do it all** runs search, paper generation, and slide generation with progress and a Stop control.
2. **Sources:** Review Crossref and Europe PMC records, read available abstracts, open original source links, run publication checks, and select up to 12 sources. Eight text-bearing sources are preselected where available, including up to two accessible full texts. Search more to collect additional records without changing existing source numbers. The paper outline can be edited in the side panel.
3. **Create:** Switch between **Paper**, **Slides**, and **References & review**. The paper editor supports headings, bold/italic text, lists, tables, undo/redo, and source-citation insertion. Slides support editing, title/content/two-column layouts, reordering, adding/removing slides, and speaker notes. AI prompts explain, expand, and discuss application of the current passage or slide. Answers are inserted only on request, with a stale-content check before insertion.

Word downloads contain the current edited paper and its actual cited bibliography, with clickable source URLs. PowerPoint downloads preserve edited slides, layout choices, source numbers, and custom speaker notes; actual cited references are appended as additional slides.

## Evidence and AI

The workflow uses the existing `/api/discovery/search`, `/api/discovery/fulltext`, and `/api/ai/generate` services. No upload or additional provider key is needed beyond the existing configured AI connection. It introduces three validated AI tasks: `workflow-plan`, `workflow-paper`, and `workflow-slides`. Native generation uses structural JSON schemas; compatible providers use JSON-object output. The server and client reject incomplete artifacts and unknown citation identifiers before replacing existing work.

Discovery returns bounded public metadata from Crossref and Europe PMC. Europe PMC includes PubMed-indexed records; this workflow does not independently search NCBI PubMed or private databases. It collects up to 40 initial records and 60 records across additional searches. Up to 12 selected records enter one AI request. The workflow attempts up to six selected open-access PMC articles, prioritizes results, discussion, and methods within bounded text excerpts, and retains abstract evidence when full text is unavailable. Source coverage remains visible. Source records and publication checks do not prove that generated claims are accurate.

Drafts are literature-based research support. Research-proposal methods remain proposed, and review drafts must not claim an experiment, exhaustive search, protocol registration, or quality appraisal that was not performed. Word count is an approximate generation target. Linked numeric markers are used in the draft; APA/MLA/IEEE selection controls bibliography formatting, not complete journal style compliance. Paragraph citation reminders require human review and are not factual verification scores.

## Saving and recovery

Workflows are stored as `type: research-workflow` records in the existing `projects` collection, with a versioned `workflow` object. No database migration is required. Saving uses the current browser workspace token and whichever storage backend is configured (Supabase or local SQLite). The new `GET /api/records/:collection/:id` route applies the existing workspace access checks and returns 404 for records outside that workspace.

Writes are debounced and serialized to prevent older requests from replacing newer edits. Save status and retry errors are visible. Unsaved snapshots are retained in browser storage under a workspace-specific recovery key and removed after successful synchronization. A newer local snapshot is recovered on reopening the project. The previous generated paper and deck can be restored after regeneration. Stop aborts the current request, propagates disconnection to the upstream AI request, and prevents subsequent stages or late responses from replacing current content. Closing the tab ends active generation; this is an interactive workflow, not a background scheduler.

## Verification

The test suite covers source selection, bounded full-text excerpts, malformed artifacts and citation rejection, rich document serialization, editable UI flows, autosave/reopening, failed-save recovery, late-result cancellation, upstream request cancellation, actual Office packages, hyperlinks, speaker notes, and slide layouts.

A live check used the configured AI connection and public literature services to find 40 source records, produce a six-section paper with four cited records, and create six slides. It verified save/reopen, denial of access from a different workspace, DOCX and PPTX downloads, and cleanup of the temporary test project. A separate live read confirmed open-access full-text excerpt retrieval. The live outputs are QA drafts, not reviewed research publications.

Browser control remained disabled in Work settings during implementation. The interaction tests run in a simulated DOM; live browser visual inspection was not available.
