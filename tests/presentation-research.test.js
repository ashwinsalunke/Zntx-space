import test from "node:test";
import assert from "node:assert/strict";
import {
  searchPresentationSources,
  slideImagePrompt,
} from "../src/presentation-research.js";
test("presentation search combines selected sources and preserves partial failures without inventing abstracts", async () => {
  const calls = [];
  const result = await searchPresentationSources(
    "animal rehabilitation",
    ["deep", "arxiv", "scholar"],
    {
      request: async (path) => {
        calls.push(path);
        if (path.includes("google-search")) throw Error("Connect SerpAPI");
        if (path.includes("source=arxiv"))
          return {
            results: [
              {
                id: "arxiv-1",
                title: "Animal gait rehabilitation",
                doi: "10.1234/a",
                abstract: "Preprint abstract",
                pdf: "https://arxiv.org/pdf/2501.12345",
              },
            ],
          };
        return {
          papers: [
            {
              id: "a",
              title: "Animal gait rehabilitation",
              doi: "10.1234/a",
              abstract: "",
            },
          ],
          sources: [{ id: "europepmc", status: "ok", returned: 1 }],
        };
      },
    },
  );
  assert.equal(calls.length, 3);
  assert.equal(result.papers.length, 1);
  assert.equal(result.papers[0].abstract, "Preprint abstract");
  assert.ok(result.papers[0].pdf);
  assert.equal(result.partial, true);
  assert.equal(
    result.sources.find((s) => s.id === "scholar").error,
    "Connect SerpAPI",
  );
});
test("Scholar snippets remain metadata and presentation image prompts are bounded", async () => {
  const result = await searchPresentationSources(
    "rehabilitation",
    ["scholar"],
    {
      request: async () => ({
        results: [
          { id: "1", title: "A paper", snippet: "Search preview only" },
        ],
      }),
    },
  );
  assert.equal(result.papers[0].abstract, "");
  assert.equal(result.papers[0].searchSnippet, "Search preview only");
  assert.ok(
    !slideImagePrompt(
      { topic: "Animal rehabilitation" },
      { title: "Gait", content: "Text [[cite:S1]]" },
    ).includes("[[cite:"),
  );
});
