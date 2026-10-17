import test from "node:test";
import assert from "node:assert/strict";
import { isDiagram, layoutDiagram, wrapLabel } from "../src/diagram-layout.js";
const diagram = {
  title: "A process",
  nodes: [
    { id: "a", label: "Light energy" },
    { id: "b", label: "Reaction with a long readable description" },
    { id: "c", label: "Product" },
  ],
  edges: [
    { from: "a", to: "b", label: "powers" },
    { from: "b", to: "c", label: "produces" },
    { from: "c", to: "b", label: "feedback" },
  ],
};
test("diagram draws directed connections, feedback loops and non-overlapping nodes in both layouts", () => {
  for (const direction of ["LR", "TB"]) {
    const out = layoutDiagram(diagram, direction);
    assert.equal(out.nodes.length, 3);
    assert.equal(out.edges.length, 3);
    assert.ok(out.width > 0 && out.height > 0);
    for (const edge of out.edges)
      assert.ok(
        edge.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      );
    for (let i = 0; i < out.nodes.length; i++)
      for (let j = i + 1; j < out.nodes.length; j++) {
        const a = out.nodes[i],
          b = out.nodes[j];
        assert.ok(
          Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
            Math.abs(a.y - b.y) >= (a.height + b.height) / 2,
        );
      }
  }
});
test("labels preserve words and bound long identifiers", () => {
  assert.ok(wrapLabel("x".repeat(200)).every((l) => l.length <= 25));
  assert.equal(wrapLabel("Water and light").join(" "), "Water and light");
});

test('malformed imported diagram notes cannot reach the renderer',()=>{assert.equal(isDiagram(diagram),true);for(const invalid of [{},{nodes:[null],edges:[]},{...diagram,nodes:[{id:'a',label:3}]},{...diagram,edges:[{from:'missing',to:'a'}]},{...diagram,nodes:[{id:'a',label:'One'},{id:'a',label:'Duplicate'}]}])assert.equal(isDiagram(invalid),false);});
