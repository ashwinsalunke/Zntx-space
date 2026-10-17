import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test(
  "diagram workflow draws an image, exports SVG, saves the visual, and searches synced library PDFs",
  { timeout: 20000 },
  async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', {
      url: "http://localhost/diagrams",
      pretendToBeVisual: true,
    });
    for (const key of [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "Element",
      "Node",
      "localStorage",
      "Event",
      "MouseEvent",
      "XMLSerializer",
    ])
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: dom.window[key],
      });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    window.scrollTo = () => {};
    HTMLElement.prototype.scrollTo = () => {};
    const originalFetch = globalThis.fetch,
      calls = [],
      notes = [],
      blobs = [],
      downloads = [];
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return "blob:test";
    };
    URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = function () {
      downloads.push(this.download);
    };
    const diagram = {
      title: "Photosynthesis",
      summary: "Supplied source summary",
      nodes: [
        { id: "light", label: "Sunlight" },
        { id: "reaction", label: "Light-dependent reactions" },
        { id: "sugar", label: "G3P sugar" },
      ],
      edges: [
        { from: "light", to: "reaction", label: "powers" },
        { from: "reaction", to: "sugar", label: "supports" },
      ],
    };
    const library = [
      {
        id: "paper-1",
        title: "Photosynthesis source",
        abstract: "Reported photosynthesis processes.",
        authors: ["Reader"],
        url: "https://example.org/article",
      },
      {
        id: "mendeley:1:doc-1",
        title: "A Mendeley reference",
        abstract: "Supplied methods.",
        authors: ["Ada Researcher"],
        doi: "10.1234/mendeley",
        source: "Mendeley",
        librarySync: { provider: "mendeley", remoteId: "doc-1" },
      },
    ];
    const json = (data) =>
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    globalThis.fetch = async (url, options = {}) => {
      const path = String(url),
        body = options.body ? JSON.parse(options.body) : null;
      calls.push({ path, body });
      if (path === "/api/library") return json(library);
      if (path === "/api/history") return json([]);
      if (path === "/api/config") return json({});
      if (path === "/api/ai/status") return json({ configured: true });
      if (path === "/api/ai/generate")
        return json({
          diagram,
          text: "Summary [[cite:1]]",
          citations: [
            { id: "1", title: library[0].title, url: library[0].url },
          ],
          warnings: [],
          model: "ScrapeTx AI",
          generatedAt: new Date().toISOString(),
        });
      if (path.startsWith("/api/records/notes/") && body) {
        notes.push(body);
        return json({ ok: true });
      }
      return json([]);
    };
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    let root;
    try {
      const React = await import("react"),
        { createRoot } = await import("react-dom/client"),
        { MemoryRouter } = await import("react-router-dom");
      const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
      root = createRoot(document.getElementById("root"));
      const flush = () =>
        React.act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
        });
      const click = async (element) => {
        assert.ok(element, "Missing UI control");
        await React.act(async () => element.click());
        await flush();
      };
      const fill = async (element, value) => {
        assert.ok(element);
        await React.act(async () => {
          Object.getOwnPropertyDescriptor(
            dom.window.HTMLInputElement.prototype,
            "value",
          ).set.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
        });
      };
      await React.act(async () =>
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: ["/diagrams"], key: "diagram" },
            React.createElement(App),
          ),
        ),
      );
      await flush();
      await click(document.querySelector(".diagram-source-picker input"));
      await fill(
        document.querySelector('input[aria-label="Diagrams topic"]'),
        "Illustrate photosynthesis",
      );
      await React.act(async () =>
        document
          .querySelector(".tool-page form")
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      await flush();
      await flush();
      const request = calls.find((c) => c.path === "/api/ai/generate");
      assert.ok(request);
      assert.equal(request.body.evidence[0].abstract, library[0].abstract);
      assert.match(request.body.prompt, /actual process/);
      const svg = document.querySelector('.diagram-scroll svg[role="img"]');
      assert.ok(svg);
      assert.match(svg.outerHTML, /marker/);
      assert.ok(svg.querySelector("svg"), "Scientific illustration is present");
      const initialHeight = Number(svg.getAttribute("height"));
      await click(document.querySelector(".diagram-style input"));
      assert.ok(Number(svg.getAttribute("height")) < initialHeight);
      await click(
        [...document.querySelectorAll(".diagram-toolbar button")].find(
          (b) => b.textContent === "SVG",
        ),
      );
      assert.equal(downloads.length, 1);
      assert.match(downloads[0], /\.svg$/);
      assert.match(
        await blobs[0].text(),
        /xmlns="http:\/\/www.w3.org\/2000\/svg"/,
      );
      await click(
        [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Save to library"),
        ),
      );
      assert.deepEqual(notes[0].diagram, diagram);
      await click(document.querySelectorAll(".diagram-source-picker input")[1]);
      assert.equal(
        calls.filter((c) => c.path === "/api/ai/generate").length,
        1,
        "Changing sources does not silently spend another AI request",
      );
      await React.act(async () =>
        root.render(
          React.createElement(
            MemoryRouter,
            { initialEntries: ["/sources/mendeley?q=Ada"], key: "mendeley" },
            React.createElement(App),
          ),
        ),
      );
      await flush();
      await flush();
      assert.ok(document.querySelector(".personal-source-list"));
      assert.match(
        document.querySelector(".personal-source-list").textContent,
        /1 matching references/,
      );
      const pdf = [
        ...document.querySelectorAll(".personal-source-list a"),
      ].find((a) => a.textContent.includes("Read PDF"));
      assert.ok(pdf.href.includes("mendeley=doc-1"));
      assert.ok(
        [...document.querySelectorAll(".personal-source-list a")].some((a) =>
          a.href.includes("doi.org"),
        ),
      );
      await fill(
        document.querySelector(
          'input[aria-label="Search your Mendeley library"]',
        ),
        "No matching phrase",
      );
      await flush();
      assert.match(
        document.querySelector(".personal-source-list").textContent,
        /No matching references/,
      );
    } finally {
      if (root) {
        const { act } = await import("react");
        await act(async () => root.unmount());
      }
      await vite.close();
      globalThis.fetch = originalFetch;
      dom.window.close();
    }
  },
);
