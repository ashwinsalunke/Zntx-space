# Run and deploy Zntx Space

## Local setup

Use Node 24. Run `npm ci`, copy `.env.example` to `.env.local`, fill in your own settings, and run `npm run dev`. The web interface opens at http://127.0.0.1:5173 and the API at http://127.0.0.1:5180. For a built server, use `npm run build && npm start` and open port 5180.

## Supabase

Create a project and apply the tracked SQL migration in `supabase/migrations/`. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` on the server. Never use a service-role key in the browser or commit credentials.

The supplied Zntx Space project was configured and verified during development. For your own fork, use your own project. With empty Supabase settings, the same API uses SQLite in `.data/`.

No login UI is required: a cryptographically random 256-bit workspace key is stored in each browser. The API passes it in `X-Workspace-Token`; Postgres stores its hash and enforces row isolation with RLS. Possession of that key grants access to that workspace. Losing it loses access. Use the Integrations page to export backups or securely transfer the workspace key.

The capability model is suitable for simple personal research workspaces. It does not provide account recovery, named collaborators, audit-grade identity, or controlled study-data sharing. Do not treat it as a clinical records system.

Run `npm run verify:cloud` against the running API to check create/read/update, isolation, and token rejection. It creates and deletes only its own disposable verification record. The table also passed direct RLS tests for a missing token and a forged owner hash.

## AI

Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in the server environment. See [AI setup](ai-setup.md). The user chooses the provider and model; no key or model is preconfigured in source. Optional AI sends the supplied research text to that provider only when requested.

## MCP and Zotero

Personal connectors are restricted to one owner workspace. Compute the SHA-256 hash of your private workspace key locally and set it as `INTEGRATION_OWNER_HASH` on the server. Other browser workspaces cannot call those connectors. Never share the raw workspace key publicly.

For Zotero, set `ZOTERO_USER_ID` and a read-only `ZOTERO_API_KEY`. For remote MCP, set `MCP_SERVERS` to an array of `{id,name,url,tokenEnv}` entries and place bearer credentials in the named server environment variable. HTTPS Streamable HTTP servers are supported. Local HTTP requires `MCP_ALLOW_LOCAL=true`. Discovery lists declared tools; the UI permits explicit calls only for tools marked read-only. OAuth flows and write tools are not implemented.

These personal connectors are owner-only. To offer per-user Zotero/MCP credentials to friends, a separate identity and credential-storage design is needed; do not put your personal keys into a shared connector endpoint without this ownership gate.

## Container deployment

```sh
docker build -t zntx-space .
docker run --env-file .env.local -e HOST=0.0.0.0 -e PORT=5180 -p 5180:5180 zntx-space
```

Deploy the Dockerfile to a Node/container host. Configure `APP_ORIGIN` to the public HTTPS origin. Set `TRUST_PROXY=1` only behind a trusted proxy that sets the forwarding headers, and use the host's secret manager. Supabase keeps workspace data durable across container replacements. SQLite needs a persistent writable `/app/.data` volume.

This repository includes the deployment artifact, but no public web hosting was provisioned. A running local server is reachable only from this Mac until you deploy it.

Public endpoints have basic in-process request and concurrency limits. A multi-instance public deployment needs a shared rate limiter and monitoring appropriate to its traffic, especially before enabling a paid AI key for visitors. Source databases enforce their own usage policies and quotas.

## External source terms

Source API access does not grant rights to redistribute all full texts. Open-access full text is fetched only through the fixed Europe PMC endpoint, with license metadata retained. Crossref and PubMed results may have missing abstracts. See [source documentation](api-sources.md).
