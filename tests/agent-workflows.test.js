import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_WORKFLOWS, WORKFLOW_CATEGORIES, WORKFLOW_DOMAINS,
  filterWorkflows, workflowPrompt, workflowRoute, RESEARCH_ROUTINES,
} from "../src/agent-workflows.js";

test("workflow catalog has unique complete runnable tasks and truthful output guides", () => {
  assert.ok(AGENT_WORKFLOWS.length >= 30);
  assert.equal(new Set(AGENT_WORKFLOWS.map((item) => item.id)).size, AGENT_WORKFLOWS.length);
  for (const item of AGENT_WORKFLOWS) {
    assert.ok(WORKFLOW_CATEGORIES.includes(item.category), item.id);
    assert.ok(WORKFLOW_DOMAINS.includes(item.domain), item.id);
    assert.ok(item.output.length >= 3, item.id);
    assert.ok(item.steps.length >= 3, item.id);
    if (item.route === "ai") {
      assert.ok(["draft", "topics", "explain"].includes(item.aiTask), item.id);
      assert.ok(item.instruction.length > 50, item.id);
    } else assert.ok(workflowRoute(item, item.example).startsWith("/"), item.id);
  }
});

test("workflow filtering intersects category, domain, and all query terms", () => {
  const matches = filterWorkflows({ category: "Deep Search", domain: "Biomedical", query: "PubMed life" });
  assert.deepEqual(matches.map((item) => item.id), ["biomedical-evidence"]);
  assert.equal(filterWorkflows({ query: "unmatchable-zz1122" }).length, 0);
  assert.equal(filterWorkflows().length, AGENT_WORKFLOWS.length);
});

test("workflow routing preserves literal user queries in local workspace URLs", () => {
  const input = "metformin & insulin # outcomes? 日本";
  for (const item of AGENT_WORKFLOWS.filter((item) => !["projects", "citations", "ai"].includes(item.route))) {
    const parsed = new URL(workflowRoute(item, input), "https://example.test");
    assert.equal(parsed.origin, "https://example.test");
    assert.equal(parsed.searchParams.get(["writer", "diagrams", "presentation"].includes(item.route) ? "topic" : "q"), input, item.id);
  }
  const pubmed = new URL(workflowRoute(AGENT_WORKFLOWS.find((item) => item.id === "biomedical-evidence"), input), "https://example.test");
  assert.equal(pubmed.searchParams.get("source"), "pubmed");
});

test("draft workflows preserve supplied material and explicitly reject invented research", () => {
  for (const item of AGENT_WORKFLOWS.filter((item) => item.route === "ai")) {
    const prompt = workflowPrompt(item, "  Supplied methods and results.  ");
    assert.ok(prompt.includes("Supplied methods and results."));
    assert.ok(prompt.includes("Never invent findings, people, citations"));
    assert.ok(prompt.includes(item.instruction));
  }
  const mapper = AGENT_WORKFLOWS.find((item) => item.id === "subject-headings");
  assert.match(mapper.instruction, /unverified candidate/);
  assert.match(AGENT_WORKFLOWS.find((item) => item.id === "reviewer-finder").caution, /does not verify/);
});

test("automation recommendations refer to implemented workflows", () => {
  for (const item of RESEARCH_ROUTINES) assert.ok(AGENT_WORKFLOWS.some((workflow) => workflow.id === item.workflowId));
});
