import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test(
  "topics scan real evidence shapes, save to notebooks, serialize edits, recover failed saves, and organize in folder tabs",
  { timeout: 30000 },
  async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', {
      url: "http://localhost/",
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
    dom.window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    dom.window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    dom.window.HTMLAnchorElement.prototype.click = function () {};
    const beforeFetch = globalThis.fetch,
      beforeCreate = URL.createObjectURL,
      beforeRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => "blob:export";
    URL.revokeObjectURL = () => {};
    const notes = new Map(),
      folders = new Map(),
      calls = [],
      exports = [];
    let delayAi = false,
      releaseAi,
      delaySave = false,
      releaseSave,
      failSave = false;
    const json = (v, status = 200) =>
      new Response(JSON.stringify(v), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const topic = (i) => ({
      title: "Biofilm research direction " + i,
      question: "How do bacterial biofilms influence antibiotic resistance?",
      whyNow: "Reported abstract findings [[cite:S1]].",
      approach: "Compare reported study definitions.",
      firstStep: "Build an evidence table from the cited papers.",
      limitation: "Abstract-level evidence only; verify full studies.",
      method: "review",
      difficulty: "introductory",
    });
    const scan = {
      summary: "Possible research directions [[cite:S1]].",
      topics: [topic(1), topic(2), topic(3)],
    };
    globalThis.fetch = async (url, options = {}) => {
      const path = String(url),
        method = options.method || "GET",
        body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, method, body });
      if (path === "/api/config") return json({ storage: "Local SQLite" });
      if (path === "/api/library")
        return json([
          {
            id: "saved-source",
            title: "A saved research paper",
            abstract: "Saved source abstract.",
            url: "https://example.com/saved",
          },
        ]);
      if (path === "/api/history") return json([]);
      if (path === "/api/ai/status") return json({ configured: true });
      if (path.startsWith("/api/discovery/search?"))
        return json({
          papers: [
            {
              id: "source1",
              title: "Bacterial biofilm evidence",
              abstract:
                "An actual supplied abstract about antibiotic resistance.",
              year: 2025,
              url: "https://example.com/paper1",
            },
          ],
          coverage: { uniqueRecords: 1 },
          sources: [{ name: "Europe PMC", status: "ok" }],
        });
      if (path === "/api/ai/generate") {
        if (delayAi) {
          delayAi = false;
          return new Promise((r) => {
            releaseAi = () =>
              r(
                json({
                  text: JSON.stringify({
                    ...scan,
                    summary: "LATE OUTPUT [[cite:S1]].",
                  }),
                }),
              );
          });
        }
        return json({
          text:
            body.task === "topic-scan"
              ? JSON.stringify(scan)
              : "Proposed outline [[cite:S1]].",
          citations: [
            {
              id: "S1",
              title: "Bacterial biofilm evidence",
              url: "https://example.com/paper1",
            },
          ],
        });
      }
      for (const [collection, records] of [
        ["notes", notes],
        ["reviews", folders],
      ]) {
        if (path === "/api/records/" + collection)
          return json([...records.values()]);
        if (path.startsWith("/api/records/" + collection + "/")) {
          const id = decodeURIComponent(path.split("/").at(-1));
          if (method === "PUT") {
            if (failSave)
              return json({ error: "Temporary storage outage" }, 503);
            if (delaySave) {
              delaySave = false;
              return new Promise((r) => {
                releaseSave = () => {
                  records.set(id, body);
                  r(json({ ok: true, updatedAt: new Date().toISOString() }));
                };
              });
            }
            records.set(id, body);
            return json({ ok: true, updatedAt: new Date().toISOString() });
          }
          return json(records.get(id));
        }
      }
      if (path.startsWith("/api/records/")) return json([]);
      if (path === "/api/export/document") {
        exports.push(body);
        return new Response("test-docx");
      }
      throw Error("Unexpected request " + path);
    };
    const React = await import("react"),
      { act } = React,
      { createRoot } = await import("react-dom/client"),
      { MemoryRouter } = await import("react-router-dom");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    let root;
    const wait = async (predicate, label) => {
      for (let i = 0; i < 300; i++) {
        if (predicate()) return;
        await act(async () => new Promise((r) => setTimeout(r, 15)));
      }
      assert.fail("Timed out " + label);
    };
    const click = async (el) => {
      assert.ok(el);
      await act(async () =>
        el.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        ),
      );
    };
    const button = (text) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === text,
      );
    const fill = async (el, value) => {
      assert.ok(el);
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const select = async (el, value) => {
      await act(async () => {
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    try {
      const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
      async function mount(path) {
        if (root) await act(async () => root.unmount());
        root = createRoot(document.getElementById("root"));
        await act(async () =>
          root.render(
            React.createElement(
              MemoryRouter,
              { initialEntries: [path] },
              React.createElement(App),
            ),
          ),
        );
      }
      await mount("/concepts");
      await wait(() => button("Antibiotics & resistance"), "topic landing");
      await click(button("Antibiotics & resistance"));
      assert.match(
        document.querySelector('[aria-label="Research area"]').value,
        /Antibiotic/,
      );
      assert.ok(
        !calls.some((c) => c.path.startsWith("/api/discovery/")),
        "recommendation does not trigger a paid call",
      );
      await click(button("What topics are best for me?"));
      await select(
        document.querySelector('[aria-label="Time available"]'),
        "term",
      );
      await click(button("Find topics"));
      await wait(
        () => document.querySelectorAll(".tf-topic-card").length === 3,
        "ranked topics",
      );
      const generation = calls.find((c) => c.path === "/api/ai/generate").body;
      assert.equal(generation.task, "topic-scan");
      assert.equal(generation.evidence[0].id, "S1");
      assert.match(generation.prompt, /"time":"term"/);
      assert.ok(!calls.some((c) => c.path === "/api/images/generate"));
      await click(button("Compare table"));
      assert.equal(
        document.querySelectorAll(".tf-table-wrap tbody tr").length,
        3,
      );
      await click(button("Export CSV"));
      await click(button("Detailed cards"));
      delayAi = true;
      await click(button("Find topics"));
      await wait(() => releaseAi, "pending scan");
      await click(button("Cancel"));
      await act(async () => releaseAi());
      assert.doesNotMatch(document.body.textContent, /LATE OUTPUT/);
      assert.equal(document.querySelectorAll(".tf-topic-card").length, 3);
      await click(button("Save to notebook"));
      await wait(
        () => document.querySelector('[aria-label="Notebook name"]'),
        "notebook name",
      );
      await fill(
        document.querySelector('[aria-label="Notebook name"]'),
        "Biofilm notebook",
      );
      await click(button("Save & open notebook"));
      await wait(
        () => document.querySelector('[aria-label="Research paper editor"]'),
        "notebook editor",
      );
      assert.equal(notes.size, 1);
      const id = [...notes.keys()][0];
      assert.equal(notes.get(id).type, "research-notebook");
      assert.match(notes.get(id).content, /https:\/\/example.com\/paper1/);
      // Edits made during an in-flight save must become a second write, never disappear.
      delaySave = true;
      await fill(
        document.querySelector('[aria-label="Notebook title"]'),
        "First edit",
      );
      await click(button("Save"));
      await wait(() => releaseSave, "delayed save");
      await fill(
        document.querySelector('[aria-label="Notebook title"]'),
        "Latest edit",
      );
      await act(async () => releaseSave());
      await wait(
        () => notes.get(id)?.title === "Latest edit",
        "queued latest edit",
      );
      await click(button("Save"));
      await fill(
        document.querySelector('[aria-label="Notebook title"]'),
        "Edit after clean save",
      );
      await click(button("Save"));
      await wait(
        () => notes.get(id)?.title === "Edit after clean save",
        "clean Save does not block future saves",
      );
      failSave = true;
      await fill(
        document.querySelector('[aria-label="Notebook title"]'),
        "Recovery draft",
      );
      await click(button("Save"));
      await wait(
        () => document.body.textContent.includes("Temporary storage outage"),
        "save error",
      );
      assert.ok(
        localStorage.getItem(
          "scrapetx-notebook-recovery:" +
            localStorage.getItem("zntx-workspace-token") +
            ":" +
            id,
        ),
      );
      // Reopening recovers the local draft, then persists it once storage is healthy.
      failSave = false;
      await mount("/notebooks/" + id);
      await wait(
        () =>
          document.querySelector('[aria-label="Notebook title"]')?.value ===
          "Recovery draft",
        "local recovery",
      );
      await click(button("Save"));
      await wait(() => notes.get(id)?.title === "Recovery draft", "retry save");
      await click(button("Ask AI"));
      await fill(document.querySelector("#notebook-ai"), "Suggest an outline");
      await click(button("Ask ScrapeTx AI"));
      await wait(() => button("Append to notebook"), "AI preview");
      assert.doesNotMatch(notes.get(id).content, /Proposed outline/);
      await click(button("Append to notebook"));
      await click(button("Save"));
      await wait(
        () => notes.get(id).content.includes("Proposed outline"),
        "explicit append",
      );
      await click(button("Export .docx"));
      assert.equal(exports[0].format, "docx");
      assert.match(exports[0].content, /References/);
      assert.match(exports[0].content, /https:\/\/example.com\/paper1/);
      await mount("/library");
      await wait(() => button("Recovery draft"), "library notebook");
      await click(document.querySelector('[aria-label="Create a folder"]'));
      await fill(
        document.querySelector("#lw-folder-name"),
        "Antibiotic project",
      );
      await click(button("Create folder"));
      await wait(() => folders.size === 1, "folder persisted");
      assert.deepEqual(
        [...document.querySelectorAll(".lw-tabs button")].map((b) =>
          b.textContent.replace(/\d/g, "").trim(),
        ),
        ["Files", "Notebooks", "Chats"],
      );
      await click(button("New notebook"));
      await wait(
        () => document.querySelector('[aria-label="Notebook name"]'),
        "folder notebook",
      );
      await fill(
        document.querySelector('[aria-label="Notebook name"]'),
        "Folder notebook",
      );
      await click(button("Create notebook"));
      await wait(
        () =>
          document.querySelector('[aria-label="Notebook title"]')?.value ===
          "Folder notebook",
        "folder notebook opened",
      );
      const folder = [...folders.values()][0],
        newId = [...notes.values()].find(
          (n) => n.title === "Folder notebook",
        ).id;
      assert.ok(folder.itemKeys.includes("note:" + newId));
      await mount(
        "/library?" +
          new URLSearchParams({ folder: folder.id, tab: "notebooks" }),
      );
      await wait(() => button("Folder notebook"), "folder notebook tab");
      assert.ok(!button("Recovery draft"), "other folder content excluded");
      await click(button("Folder notebook"));
      await wait(
        () => document.querySelector('[aria-label="Research paper editor"]'),
        "reopen from folder",
      );
    } finally {
      if (root) await act(async () => root.unmount());
      await vite.close();
      globalThis.fetch = beforeFetch;
      URL.createObjectURL = beforeCreate;
      URL.revokeObjectURL = beforeRevoke;
      dom.window.close();
    }
  },
);
