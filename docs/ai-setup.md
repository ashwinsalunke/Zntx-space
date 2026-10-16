# ScrapeTx Ai setup

ScrapeTx Ai is the research assistant in Zntx Space. The server supports Google's native `generateContent` API and OpenAI-compatible Chat Completions endpoints. The app displays the assistant name, while deployment identifiers and credentials stay on the server. No output is synthesized by local templates when the provider is missing. A configured provider has **not** been verified merely because environment variables are present: `/api/ai/status` reports `verified: false`, and each generation request checks the actual provider response.

## Server configuration

Set these in your server environment or local ignored `.env.local` file and restart the API server. The API entry point loads `.env.local`; this module reads `process.env` and does not load environment files itself.

For Google's native API:

```dotenv
AI_PROVIDER=google
AI_MODEL=gemini-flash-latest
AI_API_KEY=your-private-provider-key
AI_FALLBACK_MODEL=
```

The server calls `POST https://generativelanguage.googleapis.com/v1beta/models/{AI_MODEL}:generateContent` using `X-goog-api-key` authentication. `AI_BASE_URL` is ignored in this mode: the origin and API version are fixed in the adapter. System instructions are separate from the user's request and source records. Diagram requests additionally set `generationConfig.responseMimeType` to `application/json` and provide a structural JSON schema with graph bounds enforced on the server. Candidate text is extracted without thought parts; blocked, truncated, malformed, empty, and oversized responses fail explicitly. See the [official generateContent reference](https://ai.google.dev/api/generate-content?hl=en) and [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output). The `latest` alias can change over time; the operator can instead configure an account-accessible versioned deployment identifier.

`AI_FALLBACK_MODEL` is optional and private. Set it to a different account-accessible native deployment to allow an availability fallback. Its identifier uses the same validation as the primary; an optional `models/` prefix is normalized. An invalid identifier, a duplicate primary identifier, or a fallback set for another adapter makes configuration fail clearly. Clear this setting when switching to a compatible adapter. The configured primary is always tried first. Only two consecutive primary `503` capacity responses permit one alternate request, with the same evidence, instructions, timeout, and concurrency slot. At most three upstream requests are made for one user action. Authentication, quota, timeouts, safety blocks, and citation failures do not trigger fallback. A successful fallback adds only this public warning: “ScrapeTx Ai used an alternate connection because the primary service was busy.” The alternate identifier is never returned in API metadata.

For an OpenAI-compatible API:

```dotenv
AI_PROVIDER=openai-compatible
AI_API_KEY=your-provider-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=your-account-accessible-chat-model
```

`AI_PROVIDER` defaults to `openai-compatible`; `openai` is also accepted for this adapter. `AI_BASE_URL` defaults to `https://api.openai.com/v1`. `AI_MODEL` is deliberately required for every adapter: choose an available deployment in your own provider account. Compatible requests use `POST {AI_BASE_URL}/chat/completions`, bearer authentication, system/user messages, and non-streaming text responses. Diagram generation additionally requests JSON object output. These follow the [official OpenAI Chat Completions documentation](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create). Your chosen compatible provider must support these fields; support and costs vary by provider. Never use `VITE_` or `NEXT_PUBLIC_` for AI secrets, never commit a real key, and never send it from browser code.

For a local Ollama installation exposing its OpenAI-compatible API, explicitly configure the loopback base URL and an installed model:

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=your-installed-model
```

Keyless inference is permitted only for explicitly configured compatible endpoints at `localhost`, `127.0.0.1`, or `::1`. Google-native mode always requires `AI_API_KEY`. Other API endpoints require HTTPS and `AI_API_KEY`. URLs with embedded credentials, a query, or a fragment are rejected. Provider redirects are rejected. Clients cannot override the adapter, provider URL, model, or key through request payloads. The server does not fetch evidence URLs; titles/abstracts are supplied in the request.

## Router integration and contract

```js
import aiRouter from "./ai.js";
app.use("/api/ai", aiRouter);
```

`GET /api/ai/status` returns `{assistant, configured, verified, provider, model, missing, error, tasks, limits, setup}`. `assistant`, `provider`, and the legacy display field `model` all contain `ScrapeTx Ai`. No actual deployment identifier, key, endpoint, or raw upstream metadata is returned. `configured` describes server settings, not the provider account's current quota, availability, or successful connectivity.

`POST /api/ai/generate` accepts:

```json
{
  "task": "synthesis",
  "prompt": "Compare the findings, limitations, and evidence gaps.",
  "evidence": [
    {
      "id": "10.1234/example",
      "title": "Supplied paper title",
      "url": "https://doi.org/10.1234/example",
      "abstract": "The actual abstract from the literature search."
    }
  ]
}
```

Tasks: `synthesis`, `draft`, `paraphrase`, `explain`, `topics`, and `diagram`. Aliases `research`, `research synthesis`, `academic draft`, and `literature-review` are also accepted. The prompt is limited to 24,000 characters, evidence to 24 records, each abstract to 12,000 characters, and the combined normalized input to 100,000 characters. Evidence IDs must be unique stable identifiers containing only letters, digits, periods, underscores, colons, slashes, parentheses, or hyphens. Missing evidence is allowed but results explicitly carry an unverified-source warning.

Success returns `{assistant, task, text, provider, model, citations, generatedAt, warnings}` with the same public assistant name in all identity fields. Citations contain only supplied `{id, title, url}` records referenced by `[[cite:ID]]` markers in the output. The UI supplies numbered source identifiers. Whitespace, single-bracket cite markers, and explicit comma-separated citation groups normalize only when every identifier appears in the supplied evidence. Unknown citation IDs fail with `502 UNVERIFIED_AI_CITATION`; synthesis, draft, and explanation outputs with supplied evidence must cite at least one record. This detects identifier mistakes, **not** whether a cited source truly supports every claim. Users must read the original sources. Evidence prompts explicitly preserve uncertainty and distinguish preclinical, clinical, correlational, and causal findings.

For `diagram`, the response also includes `{diagram: {title, summary, nodes: [{id, label}], edges: [{from, to, label}]}}`. The graph is validated for sizes, unique IDs, and valid endpoints. Render this structure in application code; do not execute model-generated diagram code. Treat every generated string as untrusted plain text (React text nodes or a Markdown renderer with raw HTML disabled); never use `dangerouslySetInnerHTML`. Do not automatically navigate or fetch generated links.

Errors use `{assistant, provider, model, code, error}` and setup fields when relevant; the identity fields again contain only `ScrapeTx Ai`. Missing configuration is `503 AI_NOT_CONFIGURED`; request validation is `400`; request size is `413`; provider, blocked-content, malformed-output, and citation errors are `502`; timeout is `504`; provider quota or concurrent-request saturation is `429`. An upstream `503` gets one retry after 600 ms under the original timeout and concurrency slot, followed by the optional single native fallback described above. Continued saturation returns `503 AI_CAPACITY_UNAVAILABLE` with a clear capacity message. Authentication, quota, and other failures are not retried. Error messages never echo provider response bodies, private deployment details, or credentials. A credential unexpectedly present in generated text is redacted as well. Both adapters reject response bodies above 1 MiB, including chunked responses, and generated content above 80,000 characters. The default timeout is 60 seconds, with at most three concurrent generations per server process. `createAiRouter({env, fetchImpl, timeoutMs, maxConcurrent, retryDelayMs})` is exported for controlled integration tests or alternate server configuration.

Research prompts and selected source abstracts leave your server for the configured AI provider. Check the provider's data-handling policy before submitting confidential research. Keep an openly accessible instance's paid provider behind an operator-controlled gateway, quotas, and abuse protection before public deployment; the process concurrency limit is not a billing cap. This module is intended for literature and pharmaceutical research support, not individualized diagnosis, prescribing, or treatment instructions.

## Validation

Run `node --test tests/ai.test.js`. Tests use stubbed responses and a real local HTTP router; they verify both wire formats, header authentication, fixed native origin, public name masking, no fake output without configuration, server-only credentials and provider selection, input bounds, evidence citations, structured graph validation, blocked/truncated output handling, bounded response reads, timeout/error redaction, and concurrency. Availability tests cover primary retry recovery, optional fallback URLs and identical request constraints, a maximum of three attempts, no fallback for auth/quota/evidence failures, public warning masking, and the original concurrency slot remaining held during fallback. A passing suite does not claim that an external provider is connected. To verify a configured account, generate a small explanation through the running UI and inspect the response.

`src/AiPanel.jsx` is a reusable React integration: `<AiPanel task="synthesis" prompt={question} evidence={papers} onResult={optionalCallback} label="Synthesize evidence" />`. It checks configuration, links to `/integrations` when setup is missing, displays loading/cancel/error states, renders generated strings without HTML interpretation, links citation markers to supplied sources, and exports text with references. `onResult` receives the full response object. Changing the task, prompt, or evidence clears stale output and cancels the pending browser request. The API's provider request may continue until its timeout if the browser cancels.
