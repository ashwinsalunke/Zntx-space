# Research presentations and requested illustrations

Open **Make slides** on Home or `/presentation`. Enter a topic and choose your sources. **Create presentation** searches, collects available evidence, builds an editable deck, and saves it. It does not generate an intermediate paper. **Find sources** pauses for review instead. The existing paper-and-slides workflow remains available under Start Research.

Source choices include scholarly discovery (Crossref and Europe PMC), arXiv, Google Scholar via the configured SerpAPI connection, and saved library records. Search results are merged and deduplicated; unavailable sources are reported without discarding results from working sources. Scholar snippets remain metadata, not study abstracts. The activity panel records progress. Source selection and the coverage of abstracts or available PMC full-text excerpts remain reviewable.

The presentation editor supports slide titles, text, layout, ordering, speaker notes, citations, and individual illustrations. Export downloads a real `.pptx` containing editable text, embedded images, speaker notes, and a bibliography assembled from the cited source records, with clickable source URLs. Bibliography entries stay together when they fit on a slide. The generated material remains a research draft requiring review against the original papers.

## Cloudflare connection

The Integrations page accepts a Cloudflare Account ID and a Workers AI token scoped to that account. Connecting checks access by listing available models, without generating an image. Workspace credentials use the existing encrypted server vault. For a private server installation, the optional `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables provide a shared server connection. Keep these variables in ignored `.env.local`; they must never use a browser-visible prefix.

Image generation uses the [Workers AI REST API](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) and the server-configured [FLUX.1 schnell deployment](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/). The interface displays **AI illustration**. Client requests cannot override the host, account, token, or deployment.

- **Diagrams:** choose **AI-generated image**, then create. The default remains an editable vector flowchart. A manual illustration button is also available after creating a flowchart.
- **Presentations:** **Add AI illustrations to my slides** is off by default. Selecting it explicitly requests up to three images during deck creation. Individual slide editors also offer a manual generate/replace action.
- **Ordinary searches, paper generation, chat and evidence comparison:** no image requests.

The deck is saved before illustrations begin, then saved again after each successful image. An image service failure retains the editable deck and shows the error. Stop cancels the active operation and prevents subsequent image requests. Generated illustrations are labelled and never treated as research evidence.

## Storage and bounds

Images are stored in `.data/generated-images.db`, with a hash of the workspace token. Opening or exporting an image from another workspace returns 404. The image database, connector vault, real credentials, and local QA artifacts are excluded from Git. Back up `.data` alongside the server's other private data; image bytes do not currently synchronize to Supabase.

Requests accept only diagram or presentation contexts and bounded prompts. The server validates binary type and dimensions, limits response size, aborts slow or disconnected requests, and returns safe provider errors. There is at most one simultaneous image generation per Cloudflare account and three per server process. Persistent daily limits are 20 attempts per workspace and 60 per account, resetting at UTC midnight; failed and cancelled attempts count. Storage accepts no new images after 500 MiB. These local safeguards do not replace Cloudflare billing controls or a public deployment's access controls.

## Inspection and verification

Earlier observed SciSpace behavior for an animal-rehabilitation presentation included searches, query retries, deduplication, relevance screening, additional retrieval when evidence was weak, source extraction, an outline, and generated illustrations. A completed final PowerPoint was not observed in that earlier run. The scrapeTx implementation follows a comparable source-to-deck process; it does not claim to reproduce SciSpace's private backend, exhaustive retrieval, or paid feature set.

The fresh Chrome inspection requested on 17 October 2026 remains pending: local browser use reports disabled in Work settings. This limitation does not block direct Cloudflare API integration or local implementation tests.

The public [SciSpace Slide Creation Agent page](https://scispace.com/agents/slide-creation-5lseto3p), reviewed on the same date, describes editable slide layouts, speaker notes and PPTX exports. Its [search help page](https://www.scispace.com/help/en/articles/10706821-how-scispace-search-works) describes semantic and text matching across multiple repositories. These are published product descriptions, not evidence of the live account's exact execution or output. scrapeTx's source matching and bounded retrieval are its own implementation.

A live check with the configured account generated a 1024 × 1024 illustration. A separate live research-to-deck check retrieved real literature, prepared four available PMC full-text excerpts plus four abstract records, produced eight research slides, and exported a PowerPoint with the generated image. The deck was rendered for layout inspection. Tests also cover explicit opt-in, default no-image behavior, retention of the saved deck on image failure, workspace isolation, actual Office image embedding, provider errors, and bibliography pagination. Local QA files are ignored artifacts, not reviewed publications.
