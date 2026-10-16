const string = { type: "string" };
export const WORKFLOW_SCHEMAS = {
  "workflow-plan": {
    type: "object",
    properties: { query: string, title: string, note: string },
    required: ["query", "title", "note"],
  },
  "workflow-paper": {
    type: "object",
    properties: {
      title: string,
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: { heading: string, content: string },
          required: ["heading", "content"],
        },
      },
    },
    required: ["title", "sections"],
  },
  "workflow-slides": {
    type: "object",
    properties: {
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: string,
            content: string,
            notes: string,
            layout: string,
          },
          required: ["title", "content", "notes", "layout"],
        },
      },
    },
    required: ["slides"],
  },
};

export function validateWorkflowOutput(task, text) {
  const fail = () => {
    throw Object.assign(
      new Error(
        "ScrapeTx AI returned an incomplete research structure. Your existing draft is safe; please retry.",
      ),
      { status: 502, code: "INVALID_AI_OUTPUT" },
    );
  };
  const valid = (value, max, required = true) =>
    typeof value === "string" &&
    value.length <= max &&
    (!required || !!value.trim());
  let data;
  try {
    data = JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    fail();
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) fail();
  if (task === "workflow-plan") {
    if (!valid(data.query, 500) || !valid(data.title, 200)) fail();
    return JSON.stringify({
      query: data.query.trim(),
      title: data.title.trim(),
      note: "Search planning; not source-verified findings.",
    });
  }
  if (task === "workflow-paper") {
    if (
      !valid(data.title, 200) ||
      !Array.isArray(data.sections) ||
      data.sections.length < 2 ||
      data.sections.length > 12
    )
      fail();
    const sections = data.sections.map((s) => {
      if (
        !s ||
        !valid(s.heading, 200) ||
        !valid(s.content, 25000) ||
        /^(references|bibliography)$/i.test(s.heading.trim())
      )
        fail();
      return { heading: s.heading.trim(), content: s.content.trim() };
    });
    if (JSON.stringify(sections).length > 80000) fail();
    return JSON.stringify({ title: data.title.trim(), sections });
  }
  if (
    !Array.isArray(data.slides) ||
    data.slides.length < 2 ||
    data.slides.length > 20
  )
    fail();
  return JSON.stringify({
    slides: data.slides.map((s) => {
      if (
        !s ||
        !valid(s.title, 180) ||
        !valid(s.content, 4000, false) ||
        !valid(s.notes, 5000, false) ||
        !["title", "content", "two-column"].includes(s.layout)
      )
        fail();
      return {
        title: s.title.trim(),
        content: s.content.trim(),
        notes: s.notes.trim(),
        layout: s.layout,
      };
    }),
  });
}
