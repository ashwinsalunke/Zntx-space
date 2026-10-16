# Zntx Space

A local, no-login research workspace inspired by the current SciSpace interface. Built with React, Vite, Express, and SQLite, with locally bundled Inter fonts and an original Zntx logo.

## Run the demo

Requires Node.js 22.13 or newer (Node 24 recommended).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The local API runs on **127.0.0.1:5180**. Neither server binds to the public network. No authentication, API keys, subscriptions, or Supabase setup are needed.

For a built version:

```sh
npm run build
npm start
```

Then open **http://127.0.0.1:5180**. Set `PORT` to change the built server's port.

## What works

- Research search against live **Crossref** journal records and **Europe PMC** life-science records.
- Paper details, source links, year filters, relevance/date/citation sorting, a comparison matrix, and CSV exports.
- A persistent local library, recent search history, and editable saved drafts.
- APA, MLA, IEEE, BibTeX, and RIS citation starting points and downloads.
- Local PDF text extraction (up to 20 MB / 100 pages), keyword-matched document excerpts with page references, original PDF viewing, and text/CSV exports.
- Agent gallery filtering and working routes into curated research workflows.
- Document templates, research-topic prompts, editable workflow diagrams, and presentation outlines.
- Phrase-rule text revision and readability metrics.
- Responsive desktop/mobile layouts and a collapsible sidebar.

## Demo scope

This is an independent reconstruction, not SciSpace source code or access to its private APIs. The home layout, navigation, typography, and theme were inspected in the live public interface. Some secondary screens use the same design language with a reduced demo scope.

**No language model is connected.** Research overviews show source excerpts. PDF answers retrieve sentences rather than generating explanations. Writing and presentation tools create editable structures; text tools use deterministic phrase rules. The detector screen reports text statistics and explicitly does not predict AI authorship.

Data is saved in `.data/zntx.db` on this Mac, outside version control. PDFs remain in browser memory and are never sent to the API. Closing a PDF or leaving its screen clears the active document. The included sample document is original demonstration text, not a research publication.

Supabase was intentionally left unused after the local-storage preference was confirmed. `.env.example` records the optional project URL for a future integration; no Supabase or GitHub credentials are committed.

## Validation

```sh
npm test
npm run build
npm audit
```

See [inspection and verification notes](docs/inspection.md) for reference evidence, tested flows, and remaining limits.
