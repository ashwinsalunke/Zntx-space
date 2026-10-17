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
