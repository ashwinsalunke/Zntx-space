import {
  documentMarkdown,
  markdownNodes,
  paperDocument,
  referenceText,
} from "./research-workflow.js";
import { sourceUrl } from "./lib.js";
export const isNotebook = (record) => record?.type === "research-notebook";
export const blankNotebook = (title = "Untitled notebook") => ({
  id: crypto.randomUUID(),
  type: "research-notebook",
  title,
  document: { type: "doc", content: [{ type: "paragraph" }] },
  sources: [],
  createdAt: new Date().toISOString(),
});
export function appendTopicToNotebook(notebook, topic, scanSources) {
  const sources = [...(notebook.sources || [])],
    mapping = new Map();
  for (const source of scanSources.filter((s) =>
    topic.sourceIds.includes(s.evidenceId),
  )) {
    const key = sourceUrl(source) || source.title;
    let found = sources.find((s) => (sourceUrl(s) || s.title) === key);
    if (!found) {
      found = {
        ...source,
        evidenceId:
          "S" +
          (Math.max(
            0,
            ...sources.map((s) => Number(s.evidenceId?.slice(1)) || 0),
          ) +
            1),
      };
      sources.push(found);
    }
    mapping.set(source.evidenceId, found.evidenceId);
  }
  const rewrite = (text) =>
    String(text).replace(/\[\[cite:([^\]]+)\]\]/g, (_, id) => {
      if (!mapping.has(id))
        throw Error("A topic source is missing. Run the scan again.");
      return `[[cite:${mapping.get(id)}]]`;
    });
  const addition = paperDocument([
    {
      heading: topic.title.replace(/\[\[cite:[^\]]+\]\]/g, "").trim(),
      content: `**Research question**\n${rewrite(topic.question)}\n\n**Why explore it**\n${rewrite(topic.whyNow)}\n\n**Possible approach**\n${rewrite(topic.approach)}\n\n**First step**\n${rewrite(topic.firstStep)}\n\n**Limitations**\n${rewrite(topic.limitation)}\n\nPlanning score: ${topic.score.total}/10. This heuristic is not a scientific quality rating.`,
    },
  ]);
  const document = {
    type: "doc",
    content: [...(notebook.document?.content || []), ...addition.content],
  };
  return {
    ...notebook,
    document,
    sources,
    content: notebookExport(document, sources),
    updatedAt: new Date().toISOString(),
  };
}
export function notebookExport(document, sources) {
  const { content, references } = referenceText(
    documentMarkdown(document),
    sources,
  );
  return content + (references ? "\n\n## References\n" + references : "");
}
export { documentMarkdown, markdownNodes };
