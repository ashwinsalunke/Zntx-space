# Template writing and history deletion — 18 October 2026

## Evidence and limits

The supplied screenshots show a SciSpace template choice leading to its home composer, an attached `.tex` file and a prefilled formatting request with an empty topic placeholder. Submitting that untouched request produces a chat which reports reading the template, lists its required section order and asks for the missing manuscript text. The Files panel lists one template and zero final outputs.

The supplied JEGH source specifies 210 × 279 mm pages, margins of 12/28/18/17 mm, two columns with a 6 mm gap, 10 pt Times-like text, an abstract and keywords before Introduction, Methods, Results and References, and a journal/page-number header. The example bibliography entry is explicitly placeholder data.

The reverse-engineer-anything workflow was used to separate those observed behaviors from inference. Current Chrome access is disabled in Work settings. No working CDP endpoint was supplied. The live authenticated SciSpace flow could not be executed; no claim is made about its private implementation or the output it would produce for a completed topic. Public [SciSpace templates](https://scispace.com/templates) confirms the catalog and “Start Writing” entry points. No private API, browser cookies or sign-in data were copied.

## Implemented scrapeTx sequence

1. Templates → Start writing opens Home with the selected file attached and the formatting request prefilled. Removing the attachment clears the request; the user can download the supplied `.tex` file.
2. Submitting an untouched topic placeholder opens the manuscript workspace, checks the template structure and asks for a topic or manuscript. It performs no academic search or paid AI request at that stage.
3. A topic starts source retrieval, retains up to eight available abstracts, and requests a draft with the selected headings in their exact order. The response must cite supplied evidence and pass the existing citation validator and a template-structure check. An invalid output is rejected instead of overwriting a draft.
4. Pasted manuscript text is arranged by the selected headings without an AI request. Missing sections receive editable placeholders. Formatting does not verify the manuscript's scientific claims.
5. The output opens in the existing rich-text editor, with clickable citations, source links and a Files panel. It saves as a template manuscript in My Library and reopens in the same editor. Word and LaTeX exports use actual cited references rather than the supplied template's dummy citation.
6. JEGH exports preserve the supplied page geometry, two-column body, full-width abstract/keywords, Times-like 10 pt text and journal/page header. Word is a translated layout, not a byte-identical LaTeX rendering. Exported LaTeX is source, not an in-app compiled PDF; local TeX packages/fonts and Unicode support still determine compilation.

The supplied template is marked as user-supplied. Its original source attribution remains in the file. Current journal submission requirements have not been independently certified.

## Permanent recent-search deletion

Trash controls are available beside each query in the sidebar and Literature Search. A confirmation dialog explains permanent deletion. The chosen query and all its duplicate history entries are removed from storage, including occurrences outside the visible listing. Clear all removes only the current workspace's search-history collection. Saved papers, notes, chats and documents are retained.

The implementation uses the existing workspace token and existing storage policies; no schema or permission changes were introduced. A failed delete leaves the entry visible with retry feedback. Stale history responses are ignored after deletion.

## Verification

- 233 automated tests pass, including the complete template selection, missing-content, generation, export, library reopen and history deletion UI path.
- Isolated production smoke tests pass, including duplicate-query deletion, missing-token rejection, preservation of saved papers and isolation of another workspace.
- Actual configured storage passed a disposable-record test using queries containing punctuation and quotes. All disposable history and note records were removed. No pre-existing user data was deleted.
- A live demo searched **Antibiotic resistance surveillance in bacterial infections**, retrieved eight abstracts, generated a template-valid draft using ScrapeTx AI, and exported Word and LaTeX through the app's export service.
- The two-page Word export was rendered and visually checked for margins, columns, headers, typography, references and source hyperlinks. The demo is stored locally under `artifacts/template-workflow-demo/` and is not committed.

Browser interaction, screenshots of the new application UI, and direct comparison with an authenticated SciSpace run remain pending until browser control is enabled. Automated DOM testing does not substitute for final browser visual QA.
