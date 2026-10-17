import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test(
  "guided UI searches, selects evidence, edits outputs, autosaves, and rejects late cancelled AI output",
  { timeout: 30000 },
  async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', {
      url: "http://localhost/research-workflow",
      pretendToBeVisual: true,
    });
    for (const key of [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "Element",
      "Node",
      "DOMParser",
      "MutationObserver",
      "getComputedStyle",
      "localStorage",
      "Event",
      "MouseEvent",
      "KeyboardEvent",
      "FormData",
    ])
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value:
          key === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : dom.window[key],
      });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
      dom.window,
    );
    globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(
      dom.window,
    );
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    window.scrollTo = () => {};
    HTMLElement.prototype.scrollTo = () => {};
    HTMLElement.prototype.scrollIntoView = () => {};
    const records = new Map(),
      calls = [];
    let delayedAI = null,
      delayNext = false,
      failSaves = false,
      failImages = false;
    const response = (value, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const path = String(url),
        body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, body });
      if (path === "/api/config") return response({ storage: "Local SQLite" });
      if (path === "/api/library" || path === "/api/history")
        return response([]);
      if (path === "/api/ai/status") return response({ configured: true });
      if (path === "/api/images/generate") {
        if (failImages)
          return response({ error: "Cloudflare quota exhausted." }, 429);
        return response({
          asset: {
            id: crypto.randomUUID(),
            mime: "image/png",
            width: 1,
            height: 1,
            alt: body.alt,
          },
        });
      }
      if (path.startsWith("/api/images/"))
        return new Response(Uint8Array.from([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        });
      if (path === "/api/records/projects")
        return response([...records.values()]);
      if (path.startsWith("/api/records/projects/")) {
        const id = path.split("/").pop();
        if (options.method === "PUT") {
          if (failSaves)
            return response({ error: "Temporary storage outage." }, 503);
          records.set(id, body);
          return response({ ok: true });
        }
        return response(records.get(id));
      }
      if (path.startsWith("/api/discovery/search"))
        return response({
          query: "cardiovascular evidence",
          retrievedAt: "2026-10-17T12:00:00Z",
          sources: [{ name: "Crossref", status: "ok", returned: 2 }],
          papers: [
            {
              id: "a",
              title: "First cardiovascular study",
              abstract: "A reported trial result.",
              doi: "10.1234/a",
              year: 2024,
            },
            {
              id: "b",
              title: "Second cardiovascular study",
              abstract: "Another reported result.",
              doi: "10.1234/b",
              year: 2023,
            },
          ],
        });
      if (path === "/api/ai/generate") {
        if (body.task === "workflow-plan")
          return response({
            text: '{"query":"cardiovascular evidence","title":"Cardiovascular evidence review"}',
          });
        if (delayNext) {
          delayNext = false;
          return new Promise((resolve) => {
            delayedAI = () =>
              resolve(
                response({
                  text: JSON.stringify({
                    title: "LATE REPLACEMENT",
                    sections: [
                      { heading: "Late", content: "Stale [[cite:S1]]." },
                      { heading: "Late two", content: "Stale." },
                    ],
                  }),
                  generatedAt: new Date().toISOString(),
                }),
              );
          });
        }
        if (body.prompt.startsWith("Create "))
          return response({
            text: JSON.stringify({
              slides: [
                {
                  title: "Evidence overview",
                  content: "Finding [[cite:S1]].",
                  notes: "Speaker evidence [[cite:S1]].",
                  layout: "title",
                },
                {
                  title: "Limitations",
                  content: "Review the trial.",
                  notes: "Uncertainty remains.",
                  layout: "content",
                },
              ],
            }),
            generatedAt: new Date().toISOString(),
          });
        return response({
          text: JSON.stringify({
            title: "Cardiovascular evidence review",
            sections: [
              {
                heading: "Findings",
                content: "Reported evidence [[cite:S1]].",
              },
              { heading: "Limitations", content: "This is a bounded review." },
            ],
          }),
          generatedAt: new Date().toISOString(),
        });
      }
      throw new Error("Unexpected request: " + path);
    };
    const React = await import("react"),
      { createRoot } = await import("react-dom/client"),
      { MemoryRouter } = await import("react-router-dom");
    const { act } = React;
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    let root;
    const wait = async (predicate, label) => {
      for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });
      }
      assert.fail("Timed out: " + label);
    };
    const click = async (element) => {
      assert.ok(element, "Expected a clickable control");
      await act(async () =>
        element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    };
    const button = (label) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === label,
      );
    const fill = async (element, value) => {
      assert.ok(element);
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          element.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype,
          "value",
        ).set.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    try {
      const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
      root = createRoot(document.getElementById("root"));
      await act(async () =>
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: ["/research-workflow"] },
            React.createElement(App),
          ),
        ),
      );
      await wait(() => document.getElementById("rf-topic"), "topic form");
      await fill(
        document.getElementById("rf-topic"),
        "Cardiovascular evidence",
      );
      const form = document.getElementById("rf-topic").closest("form");
      await act(async () =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
      await wait(
        () => document.querySelectorAll(".rf-source-card").length === 2,
        "source results",
      );
      await click(document.querySelectorAll(".rf-source-choice input")[1]);
      assert.equal(
        document.querySelectorAll(".rf-source-choice input:checked").length,
        1,
      );
      await click(button("Continue"));
      await click(button("Generate draft"));
      await wait(
        () =>
          document
            .querySelector(".rf-prose")
            ?.textContent.includes("Reported evidence"),
        "editable paper",
      );
      assert.equal(document.querySelector(".rf-citation").textContent, "[1]");
      assert.ok(
        calls.find(
          (c) =>
            c.path === "/api/ai/generate" && c.body.task === "workflow-paper",
        ).body.evidence.length === 1,
      );
      await click(
        [...document.querySelectorAll('[role="tab"]')].find(
          (b) => b.textContent === "Slides",
        ),
      );
      await click(button("Generate slides"));
      await wait(
        () => document.querySelector(".rf-slide-preview"),
        "slide editor",
      );
      const title = [...document.querySelectorAll(".rf-slide-field input")][0];
      await fill(title, "Edited evidence overview");
      await click(button("Add slide"));
      assert.equal(
        document.querySelectorAll(".rf-slide-rail button").length,
        4,
      );
      await click(document.querySelector('[aria-label="Move slide earlier"]'));
      await click(
        [...document.querySelectorAll('[role="tab"]')].find(
          (b) => b.textContent === "Paper",
        ),
      );
      delayNext = true;
      await click(button("Regenerate"));
      await wait(() => delayedAI, "delayed generation");
      await click(
        document.querySelector('[aria-label="Stop current generation"]'),
      );
      await act(async () => delayedAI());
      await wait(
        () => !document.querySelector(".rf-progress"),
        "cancel completes",
      );
      assert.ok(!document.body.textContent.includes("LATE REPLACEMENT"));
      assert.ok(
        document
          .querySelector(".rf-prose")
          .textContent.includes("Reported evidence"),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 850));
      });
      const saved = [...records.values()][0];
      assert.equal(saved.workflow.slides.length, 3);
      assert.equal(saved.workflow.slides[0].title, "Edited evidence overview");
      assert.equal(saved.workflow.sources.filter((s) => s.selected).length, 1);
      await act(async () => root.unmount());
      root = null;
      const reopened = createRoot(document.getElementById("root"));
      root = reopened;
      await act(async () =>
        reopened.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: ["/research-workflow?id=" + saved.id] },
            React.createElement(App),
          ),
        ),
      );
      await wait(
        () =>
          document
            .querySelector(".rf-prose")
            ?.textContent.includes("Reported evidence"),
        "saved workflow resumes",
      );
      failSaves = true;
      await fill(
        document.querySelector('[aria-label="Working title"]'),
        "Recovered title after an outage",
      );
      await wait(
        () => document.body.textContent.includes("Save failed"),
        "save failure is visible",
      );
      await act(async () => root.unmount());
      root = createRoot(document.getElementById("root"));
      await act(async () =>
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: ["/research-workflow?id=" + saved.id] },
            React.createElement(App),
          ),
        ),
      );
      await wait(
        () =>
          document.querySelector('[aria-label="Working title"]')?.value ===
          "Recovered title after an outage",
        "unsaved local recovery",
      );
      failSaves = false;
      await click(button("Save"));
      await wait(
        () =>
          records.get(saved.id)?.workflow.title ===
          "Recovered title after an outage",
        "recovered edits sync",
      );
      await click(button("New"));
      await fill(
        document.getElementById("rf-topic"),
        "A new evidence question",
      );
      await click(button("Do it all"));
      await wait(
        () =>
          [...records.values()].some(
            (record) =>
              record.id !== saved.id && record.workflow.slides.length === 2,
          ),
        "one-click paper and presentation generation",
      );
      await wait(
        () =>
          document.querySelector('[role="tab"][aria-selected="true"]')
            ?.textContent === "Paper",
        "complete workflow returns to paper",
      );
      assert.equal(
        records.get(saved.id).workflow.title,
        "Recovered title after an outage",
      );
      // Presentation mode creates a deck without invoking paper generation or images by default.
      await act(async () => root.unmount());
      root = createRoot(document.getElementById("root"));
      await act(async () =>
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: ["/presentation?topic=Animal%20rehabilitation"] },
            React.createElement(App),
          ),
        ),
      );
      await wait(
        () => button("Create presentation"),
        "presentation workflow entry",
      );
      const beforePresentation = calls.length;
      await click(button("Create presentation"));
      await wait(
        () => document.querySelector(".rf-slide-preview"),
        "presentation generated directly",
      );
      const presentationCalls = calls.slice(beforePresentation);
      assert.ok(
        presentationCalls.some((c) => c.body?.task === "workflow-slides"),
      );
      assert.ok(
        !presentationCalls.some((c) => c.body?.task === "workflow-paper"),
      );
      assert.ok(
        !presentationCalls.some((c) => c.path === "/api/images/generate"),
      );
      assert.match(
        document.querySelector(".rf-activity").textContent,
        /Building your presentation/,
      );
      await wait(
        () => !document.querySelector(".rf-progress"),
        "presentation saved",
      );
      await click(button("New"));
      await fill(
        document.getElementById("rf-topic"),
        "Animal rehabilitation with illustrations",
      );
      await click(document.querySelector(".rf-image-options input"));
      const beforeImages = calls.length;
      await click(button("Create presentation"));
      await wait(
        () =>
          !document.querySelector(".rf-progress") &&
          document.querySelector(".rf-slide-preview"),
        "illustrated presentation finishes",
      );
      const imageCalls = calls
        .slice(beforeImages)
        .filter((c) => c.path === "/api/images/generate");
      assert.equal(imageCalls.length, 2);
      assert.ok(imageCalls.every((c) => c.body.context === "presentation"));
      assert.ok(
        [...records.values()].some(
          (record) =>
            record.workflow.slides.length === 2 &&
            record.workflow.slides.every((slide) => slide.image?.id),
        ),
      );

      // A provider failure must retain the editable deck that was saved first.
      await click(button("New"));
      await fill(
        document.getElementById("rf-topic"),
        "Animal rehabilitation despite image outage",
      );
      await click(document.querySelector(".rf-image-options input"));
      failImages = true;
      await click(button("Create presentation"));
      await wait(
        () =>
          document.body.textContent.includes(
            "Your deck is saved. Illustration generation stopped",
          ),
        "image failure keeps deck",
      );
      assert.ok(document.querySelector(".rf-slide-preview"));
      assert.ok(
        [...records.values()].some(
          (record) =>
            record.workflow.topic ===
              "Animal rehabilitation despite image outage" &&
            record.workflow.slides.length === 2,
        ),
      );
    } finally {
      if (root) await act(async () => root.unmount());
      await vite.close();
      globalThis.fetch = originalFetch;
      dom.window.close();
    }
  },
);
