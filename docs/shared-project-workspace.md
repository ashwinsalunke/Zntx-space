# Shared research projects

The header Project selector is available on every route. Choose or create a project, then use any tool. The project home at `/projects` groups saved work into Sources, Notes, Evidence, Drafts and Slides. The homepage includes Start/Continue project.

## Persistence and compatibility

Research projects use the existing `projects` collection with `type: research-project`, title, question and screening papers. Legacy screening projects remain available. `research-workflow` records are documents inside a project, not separate project choices. Existing data is not migrated or removed.

Saved records carry `projectIds`, allowing explicit attachment to more than one project. New library saves, notes, searches, drafts, chats, workflows and generic-record writes receive `X-Research-Project` from the client. `server/project-context.js` validates the project in the same browser workspace. Existing membership is preserved independently of stale editor snapshots. A per-record process queue serializes updates and attachment. `POST /api/project-items/:collection/:id` adds an existing saved item without replacing its content.

Tools that save asynchronously capture the project at mount using `useProjectApi`; selecting another project returns to the project home. New writes continue to use their original tool context. Existing records retain original membership unless explicitly attached elsewhere. The active selection is remembered in browser storage scoped by the workspace token. My Library remains the global inventory.

No SQL schema, credentials, or authentication changes are required; project metadata lives in the existing JSON record storage. All API access retains the existing workspace-token isolation.

## Handoffs

- A topic result can become the project question and a saved source-linked topic note.
- Project tool links prefill the question. Project-scoped sources appear in evidence pickers.
- Writing includes Use project sources, then explicit source selection before generation.
- Saved workflows reopen by ID. Make slides opens the same workflow's draft, evidence, references and slides tab.
- The original review/screening page remains at `/projects/screening?project=ID`.
- The hub opens notebooks, manuscripts, drafts, chats, PDFs and library item details directly.

## Limits

Only saved outputs are organized; merely opening a result does not save it. Uploaded PDF binaries retain the existing browser-session behavior; saved extracted passages and notes persist. AI is not sent the entire project automatically. Users select source evidence in the relevant tool. Provider/API keys are workspace-level, not copied into projects. Individual provider sync imports remain global until attached.

Existing record listings are capped at 500 per collection. Multi-instance concurrent writes and revision conflict handling still require a database-level merge/version operation; the queue only coordinates one API process. Existing cloud availability requirements remain unchanged. No silent cloud-to-local fallback is introduced.

## Validation

`tests/project-context.test.js`: preservation across switches/stale autosaves, concurrent attachments, workspace isolation, legacy project classification and routing.
`tests/project-workspace-ui.test.js`: create, attach a library source, carry the question and source into writing, persist the workflow, and switch projects.
`scripts/verify-production.mjs`: real isolated HTTP storage round trips, explicit attachment, isolation and deep links, without real credentials.
