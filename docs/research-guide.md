# Conversational research guidance

The home composer recognizes app-help and project-start requests, including “What can ScrapDX AI help me with?” and “I want to research bacteria.” These open a conversation rather than searching scholarly indexes for the literal help question. Ordinary scientific questions and keyword searches retain their literature search behavior. The home page also offers two direct guidance entry points.

Guide me helps clarify a topic and intended output, supplies a short plan, asks one follow-up question and offers suggested replies. It retains the last six turns as bounded context. Find papers switches the conversation to a direct literature search. Guidance conversations are saved through the existing workspace record system and can be reopened or downloaded as Markdown.

## Product grounding

`shared/research-guide.js` contains the app capability catalogue, intent rules, structured response contract and bounded conversation builder. `server/ai.js` supplies those capabilities as trusted system instructions using the existing private AI connection. This configures the assistant's behavior; it does not fine-tune model weights or upload a training dataset.

The guide returns an introduction, one to four next steps, the user's chosen topic, a clarifying question, up to three suggested replies and up to three action IDs. The server validates the response. Action IDs are mapped to existing routes by the app; the AI cannot invent navigation targets. Topic parameters are encoded, and generated prose is rendered as text without executing generated links or HTML.

Add catalogue entries only for implemented capabilities. Keep descriptions honest about prerequisites and limits. The guide must not claim to have performed searches, verification, file generation or experiments. It must not choose a narrower research angle before the user selects it. For example, “bacteria” remains a broad search topic while the guide asks whether the user prefers resistance, microbiomes or environmental applications.

## Sources and research

Guidance is project planning, not scientific findings. Find papers and Compare evidence lead to real search results with original source links. Create paper & slides carries the chosen topic into the existing workflow, where the user selects evidence before drafting. Source checks assess available publication information; they do not establish scientific truth. The existing evidence allowlist and citation validation remain in force for research synthesis.

## Verification

Regression coverage includes help-versus-search intent, bounded contextual follow-ups, route encoding, rejection of invented actions, provider schema and instructions, failed-request input retention, persisted conversation reload, and navigation from guidance to an actual evidence search. Live local AI checks exercise the introduction and a bacteria-to-microbiome follow-up. Browser visual inspection depends on local browser access being enabled.

## Task-aware navigation

Personal task statements such as “I am working on molecular docking” open guidance automatically. The assistant explains the task, the app's relevant capabilities, prerequisites and outputs. Recognized task requests receive the matching tool as the first button even if the AI returns generic actions. The user opens the tool deliberately after reading the guidance.

The current request determines this priority; older conversation subjects cannot override it. Explicit outputs take precedence over their subjects: “Create slides about molecular docking” opens presentation tools, while “Find papers on molecular docking” offers literature search. Bare scientific keywords and study-comparison questions retain their normal literature search behavior.

## Tool-specific examples

Every main workspace now has authored example inputs or setup questions. The reusable `PromptSuggestions` component and `src/tool-examples.js` catalogue cover home/source selection, literature search, chat, paper and presentation workflows, writing, topics, diagrams, citations, text editing, PDFs and extraction, source checks, biomedical tabs, templates, agents and individual source connectors. Docking, projects, library, watches and PDF reading provide relevant questions that open the research guide.

Selecting an input example updates React state without submitting the form, running a search, starting a calculation or generating AI output. Existing nonempty text is protected by an inline choice to replace it or keep it. Examples inside a form use `type="button"`. Catalog examples filter local listings, and setup-question links explicitly open guidance. Source/tab changes show relevant examples; disabled or running workflows keep their input examples disabled. PDF question and field examples can be selected before upload and carried into the sample/loaded document.

The examples are starting points, not research findings. Short keywords are used for sources that expect names or identifiers (such as compounds or Python packages). Longer questions are used for research planning and synthesis. Adding a new tool should include a matching catalogue entry and direct state callback, or a clearly labelled guidance link if the tool needs files or setup.
