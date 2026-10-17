import dagre from "@dagrejs/dagre";
export function wrapLabel(value, limit = 25) {
  const words = String(value || "").split(/\s+/),
    lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > limit && line) {
      lines.push(line);
      line = "";
    }
    // Long identifiers must not escape their card.
    const chunks = word.match(new RegExp(`.{1,${limit}}`, "gu")) || [""];
    for (let i = 0; i < chunks.length; i++) {
      if (i) {
        lines.push(line);
        line = "";
      }
      line += (line ? " " : "") + chunks[i];
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
export function isDiagram(value) {
  if (
    !value ||
    typeof value.title !== "string" ||
    !Array.isArray(value.nodes) ||
    !value.nodes.length ||
    value.nodes.length > 40 ||
    !Array.isArray(value.edges) ||
    value.edges.length > 100
  )
    return false;
  const ids = new Set();
  for (const n of value.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(n.id) ||
      ids.has(n.id) ||
      typeof n.label !== "string" ||
      !n.label.trim() ||
      n.label.length > 500
    )
      return false;
    ids.add(n.id);
  }
  return value.edges.every(
    (e) =>
      e &&
      ids.has(e.from) &&
      ids.has(e.to) &&
      (!e.label || (typeof e.label === "string" && e.label.length <= 500)),
  );
}
export function layoutDiagram(diagram, direction = "LR", illustrated = true) {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: direction,
    ranksep: 110,
    nodesep: 35,
    marginx: 35,
    marginy: 40,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of diagram.nodes) {
    const lines = wrapLabel(node.label);
    graph.setNode(node.id, {
      ...node,
      lines,
      width: 240,
      height: Math.max(
        illustrated ? 210 : 122,
        (illustrated ? 156 : 68) + lines.length * 23,
      ),
    });
  }
  diagram.edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) return;
    const lines = edge.label ? wrapLabel(edge.label, 20) : [];
    graph.setEdge(
      edge.from,
      edge.to,
      {
        ...edge,
        lines,
        width: lines.length ? 145 : 0,
        height: lines.length * 18 + 12,
      },
      String(index),
    );
  });
  dagre.layout(graph);
  return {
    width: graph.graph().width,
    height: graph.graph().height,
    nodes: graph.nodes().map((id) => graph.node(id)),
    edges: graph.edges().map((id) => graph.edge(id)),
  };
}
