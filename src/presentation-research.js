import { api } from "./lib.js";
export async function searchPresentationSources(
  query,
  sourceIds = ["deep"],
  { request = api, signal, library = [] } = {},
) {
  const allowed = ["deep", "arxiv", "scholar", "library"];
  const selected = [...new Set(sourceIds)].filter((id) => allowed.includes(id));
  if (!selected.length) throw Error("Choose at least one research source.");
  const result = await Promise.allSettled(
    selected.map(async (id) => {
      if (id === "library") {
        const words = query
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3);
        const papers = library
          .filter((p) =>
            words.some((w) =>
              (p.title + " " + p.abstract).toLowerCase().includes(w),
            ),
          )
          .slice(0, 40);
        return {
          papers,
          sources: [
            { id, name: "My Library", status: "ok", returned: papers.length },
          ],
        };
      }
      if (id === "deep")
        return request("/api/discovery/search?q=" + encodeURIComponent(query), {
          signal,
        });
      const data = await request(
        (id === "scholar"
          ? "/api/google-search/search?"
          : "/api/sources/search?") +
          new URLSearchParams({ source: id, q: query.slice(0, 300) }),
        { signal },
      );
      return {
        papers: (data.results || []).map((p) => ({
          ...p,
          searchSnippet: p.snippet || "",
          abstract: p.abstract || "",
        })),
        sources: [
          {
            id,
            name: id === "arxiv" ? "arXiv" : "Google Scholar",
            status: "ok",
            returned: data.results?.length || 0,
            notes: data.warnings,
          },
        ],
        partial: !!data.fallback,
      };
    }),
  );
  signal?.throwIfAborted();
  const papers = [],
    seen = new Map(),
    sources = [];
  let raw = 0;
  result.forEach((entry, i) => {
    if (entry.status === "rejected") {
      sources.push({
        id: selected[i],
        name: {
          deep: "Scholarly sources",
          arxiv: "arXiv",
          scholar: "Google Scholar",
          library: "My Library",
        }[selected[i]],
        status: "error",
        returned: 0,
        error: entry.reason.message,
      });
      return;
    }
    sources.push(...entry.value.sources);
    for (const p of entry.value.papers || []) {
      raw++;
      const key =
        p.doi?.toLowerCase() ||
        p.title?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (!key) continue;
      if (seen.has(key)) {
        const old = seen.get(key);
        if (!old.abstract && p.abstract) old.abstract = p.abstract;
        if (!old.pdf && p.pdf) old.pdf = p.pdf;
        continue;
      }
      const copy = { ...p };
      seen.set(key, copy);
      papers.push(copy);
    }
  });
  if (result.every((r) => r.status === "rejected"))
    throw Error(
      "Selected research sources are unavailable. Check Integrations or choose another source.",
    );
  return {
    papers: papers.slice(0, 60),
    query,
    retrievedAt: new Date().toISOString(),
    sources,
    partial: result.some(
      (r) =>
        r.status === "rejected" ||
        (r.status === "fulfilled" && r.value.partial),
    ),
    coverage: {
      retrievedRecords: raw,
      uniqueRecords: papers.length,
      duplicatesRemoved: raw - papers.length,
      notes: [
        "Bounded source search. Review relevance before using these sources. Scholar snippets are not treated as study abstracts.",
      ],
    },
  };
}
export function slideImagePrompt(state, slide) {
  return `Create a clean educational scientific illustration for a research presentation about ${state.topic}. Slide topic: ${slide.title}. Concepts: ${slide.content.replace(/\[\[cite:[^\]]+\]\]/g, "").slice(0, 850)}. Use one clear composition with space around the subject. No written labels, no logos, no charts or invented data. This is an illustrative conceptual image, not a photograph of an actual study.`.slice(
    0,
    1700,
  );
}
