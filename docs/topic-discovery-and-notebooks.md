# Topic discovery and notebooks

## Product flow

Find Topics (`/concepts`) replaces the former generic question generator. Users enter an interest, optionally choose their goal, experience, time, resources, and preferred focus, then explicitly run a scan. Selecting a recommendation fills the input without making an AI request. The search animates only while work is in progress and respects reduced-motion settings.

Discovery retrieves up to 40 Crossref journal-article records and 40 Europe PMC records, merges duplicates, and ranks title/abstract query matches. The recent window restricts publication dates to January 1 three years before the current year through today; all-years search remains available. Recent retrieval favors relevance within that window rather than newest publications regardless of relevance. Provider failures are reported as partial coverage. See the official [Crossref filters](https://www.crossref.org/documentation/retrieve-metadata/rest-api/rest-api-filters/) and [Europe PMC REST documentation](https://europepmc.org/RestfulWebService).

The client filters out missing abstracts, future years, and records matching fewer than half of the non-stopword query terms when relevance metadata is present. It sends up to 12 deduplicated abstracts to the existing server-side AI service. This is a bounded sample, not a systematic review or a comprehensive trend analysis. It does not call image generation, Google scraping, or private databases.

The `topic-scan` task returns 3–6 structured directions: title, question, evidence-based motivation, proposed method, first step, limitation, method category, and estimated difficulty. Each motivation must cite supplied evidence. The server rejects malformed artifacts and unknown citations; the client checks the structure and source identities again. Citation validity establishes which supplied source is linked; it does not verify that every claim is entailed by the source.

Users can compare detailed cards or a table, sort by planning score, number of cited sources, or newest cited year, export a CSV, save to a new/existing notebook, open a paper search, or carry the research question to Start Research. The last successful scan is retained in browser session storage for up to 24 hours, scoped to the workspace token, with its original scan date. A cancelled or failed scan cannot replace previous results.

## Score out of 10

Scores are computed by application code, not requested from the model:

| Component | Maximum | Rule |
| --- | ---: | --- |
| Source coverage | 3 | 0.75 per distinct cited abstract, capped at four abstracts. |
| Recent evidence | 2 | Fraction of cited abstracts dated within the current year or previous three calendar years, multiplied by two. Unknown/future dates do not count as recent. |
| Practical fit | 3 | Resource compatibility: 1.25; estimated difficulty within selected experience: 1 (otherwise 0.4); method matches selected goal: 0.25; timeframe fits a basic review or exceeds one month: 0.5. |
| Question focus | 2 | Basic completeness: question at least 25 characters and first step at least 20 characters earns 2, otherwise 1. This is not semantic scientific evaluation. |

The sum is rounded to one decimal. Method and difficulty are AI suggestions, not validated assessments. Scores do not establish scientific merit, originality, clinical relevance, publication prospects, or project success. In particular, a high score supported by one paper remains thin evidence. Review the linked full articles and confirm the project with a supervisor.

## Library and writing

Notebooks (`/notebooks`, `/notebooks/:id`) are `research-notebook` records in the existing workspace-scoped `notes` collection. Existing collections remain `library-collection` records in `reviews`; folder membership uses `note:<id>`. This works with the existing Supabase backend and local SQLite fallback without a schema migration or a new login.

Folders have Files, Notebooks, and Chats views. Files contain saved sources and ordinary notes/documents; Chats contains saved research searches/conversations. All-research views also separate notebooks from ordinary notes. Users can create a notebook inside a folder or organize an existing notebook through the library's folder picker.

Saving a topic appends content without replacing existing writing. Sources are deduplicated by source URL (or title when no URL exists). Citation IDs are remapped across every appended field to avoid collisions with existing notebook references.

The editor supports headings, bold, italic, underline, strikethrough, lists, tables, citations, undo, and redo. Add Sources imports a reference already saved in My Library. Ask AI shows a preview; appending is an explicit action. Requests use at most 12 notebook abstracts. Existing writing is not automatically replaced. DOCX export contains the notebook content and used references with original links.

Edits autosave after 800 ms. Writes are serialized, and edits made during a save trigger a subsequent write. A failed save preserves the visible draft and a browser-local recovery copy scoped to the workspace and notebook. Save retries explicitly; successful persistence clears the recovery copy. A browser-unload warning protects unsaved edits. Multi-window simultaneous editing is not collaborative and remains last-write-wins.

## Validation

- Unit tests: topic schema/source validation; bounded score arithmetic; missing/future dates; preference fit; abstract filtering; source deduplication and citation remapping.
- Discovery tests: both providers receive date filters, and recent/all-years cache entries remain separate.
- UI integration: recommendations never submit automatically; optional survey reaches generation; cards/table/CSV; cancelled late generation; new notebook; edits during save; save failure and browser recovery; AI preview/explicit append; Word payload; folder creation/membership/tabs/reopening.
- Live browser: antibiotics/biofilms scan returned six directions from 12 abstracts out of 78 retrieved records; saving and editing a notebook persisted through the Supabase-backed workspace. A downloaded DOCX retained the edited text and clickable DOI reference.
- Responsive checks: 390 px result cards and 1440 px desktop layouts; no document-level horizontal overflow. Comparison tables use their own horizontal scroller.

The reference interaction design was inferred from the user's SciSpace screenshots: centered topic search, examples, source-linked results, save-to-notebook, a document editor, and folder tabs. No claim is made about SciSpace's private backend, ranking formula, or proprietary data coverage.
