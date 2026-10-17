import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

test(
  "docking UI runs prepared example, polls scores, preserves downloads without WebGL, and requires an engine",
  { timeout: 30000 },
  async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', {
      url: "http://localhost/docking",
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
    ]) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value:
          key === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : dom.window[key],
      });
    }
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
    // Deliberately exercise the text/download fallback rather than pretending to render molecules.
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
    const downloads = [];
    dom.window.HTMLAnchorElement.prototype.click = function () {
      downloads.push({ href: this.href, name: this.download });
    };
    const originalFetch = globalThis.fetch,
      calls = [],
      notes = [];
    let configured = true,
      pollCount = 0,
      cancelled = false,
      slowJob = false,
      failNextPoll = true;
    const id = "a1234567-1234-4321-8123-123456789abc";
    const parameters = {
      box: {
        center: { x: 15.19, y: 53.903, z: 16.917 },
        size: { x: 20, y: 20, z: 20 },
      },
      exhaustiveness: 8,
      numModes: 5,
      seed: 42,
    };
    const example = {
      name: "Imatinib and c-Abl tutorial",
      description: "Prepared structures from the official tutorial.",
      sourceUrl:
        "https://autodock-vina.readthedocs.io/en/latest/docking_basic.html",
      receptor: {
        name: "receptor.pdbqt",
        text: "ATOM      1  C   ALA A   1      15.000  53.000  16.000  1.00  0.00     0.000 C\n",
      },
      ligand: {
        name: "ligand.pdbqt",
        text: "ROOT\nATOM      1  C   UNL A   1      15.000  53.000  16.000  1.00  0.00     0.000 C\nENDROOT\nTORSDOF 0\n",
      },
      box: parameters.box,
    };
    const job = (status) => ({
      id,
      name: example.name,
      status,
      createdAt: "2026-10-17T12:00:00Z",
      parameters,
      engine: { name: "AutoDock Vina", version: "1.2.7" },
      inputs: {
        receptor: { name: example.receptor.name },
        ligand: { name: example.ligand.name },
      },
      limitations: [
        "Scores are predictions, not evidence of clinical efficacy.",
      ],
      ...(status === "completed"
        ? {
            energies: [
              { mode: 1, affinity: -10.2, rmsdLower: 0, rmsdUpper: 0 },
              { mode: 2, affinity: -9.1, rmsdLower: 1.2, rmsdUpper: 2.4 },
            ],
          }
        : {}),
    });
    const response = (value, status = 200) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    globalThis.fetch = async (url, options = {}) => {
      const path = String(url),
        body = options.body ? JSON.parse(options.body) : null;
      calls.push({
        path,
        body,
        headers: options.headers,
        method: options.method,
      });
      if (path === "/api/config") return response({ storage: "Local SQLite" });
      if (["/api/library", "/api/history"].includes(path)) return response([]);
      if (path === "/api/ai/status") return response({ configured: false });
      if (path === "/api/docking/status")
        return response({
          configured,
          engine: { name: "AutoDock Vina", version: "1.2.7" },
          limits: {
            receptorBytes: 1200000,
            ligandBytes: 200000,
            boxMinimum: 6,
            boxMaximum: 30,
          },
        });
      if (path === "/api/docking/example") return response(example);
      if (path === "/api/docking/jobs") {
        if (options.method === "POST") {
          pollCount = 0;
          return response(job("queued"), 202);
        }
        return response([]);
      }
      if (path === `/api/docking/jobs/${id}`) {
        pollCount++;
        if (failNextPoll && pollCount === 2) {
          failNextPoll = false;
          return response({ error: "Temporary docking status outage." }, 503);
        }
        return response(
          job(
            cancelled
              ? "cancelled"
              : slowJob || pollCount === 1
                ? "running"
                : "completed",
          ),
        );
      }
      if (path === `/api/docking/jobs/${id}/cancel`) {
        cancelled = true;
        return response(job("cancelled"));
      }
      if (path.startsWith(`/api/docking/jobs/${id}/files/`))
        return new Response(
          path.endsWith("scores.csv")
            ? "mode,affinity_kcal_mol\n1,-10.2\n"
            : example.receptor.text,
        );
      if (path.startsWith("/api/records/notes/") && options.method === "PUT") {
        notes.push(body);
        return response({ ok: true });
      }
      throw Error("Unexpected request: " + path);
    };
    const React = await import("react"),
      { createRoot } = await import("react-dom/client"),
      { MemoryRouter } = await import("react-router-dom"),
      { act } = React;
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    let root;
    const wait = async (predicate, label) => {
      for (let i = 0; i < 160; i++) {
        if (predicate()) return;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 25));
        });
      }
      assert.fail("Timed out: " + label);
    };
    const button = (label) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === label,
      );
    const click = async (element) => {
      assert.ok(element, "Expected clickable control");
      await act(async () =>
        element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    };
    const submit = async () => {
      await act(async () =>
        document
          .querySelector(".docking-setup form")
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
    };
    try {
      const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
      async function mount() {
        root = createRoot(document.getElementById("root"));
        await act(async () =>
          root.render(
            React.createElement(
              MemoryRouter,
              { initialEntries: ["/docking"] },
              React.createElement(App),
            ),
          ),
        );
        await wait(
          () => document.querySelector(".docking-engine"),
          "engine status",
        );
      }
      await mount();
      assert.equal(button("Run docking").disabled, true);
      assert.ok(
        !document.querySelector(".docking-table-wrap"),
        "Never invent scores before a run",
      );
      await click(button("Load example"));
      await wait(
        () => document.getElementById("docking-name")?.value === example.name,
        "example inputs",
      );
      assert.equal(
        document.querySelector('[aria-label="Box center x"]').value,
        "15.19",
      );
      assert.equal(button("Run docking").disabled, false);
      assert.equal(
        calls.filter(
          (c) => c.path === "/api/docking/jobs" && c.method === "POST",
        ).length,
        0,
        "Example loading never starts computation",
      );
      await submit();
      await wait(
        () => document.querySelector(".docking-progress"),
        "running job",
      );
      const sent = calls.find(
        (c) => c.path === "/api/docking/jobs" && c.method === "POST",
      );
      assert.deepEqual(sent.body.box, parameters.box);
      assert.equal(sent.body.seed, 42);
      assert.equal(sent.body.receptor.text, example.receptor.text);
      assert.ok(
        sent.headers["X-Workspace-Token"],
        "Workspace identity accompanies job creation",
      );
      await wait(
        () =>
          document.body.textContent.includes("Temporary docking status outage"),
        "transient poll failure is visible",
      );
      assert.equal(
        document.getElementById("docking-name").value,
        example.name,
        "Connection errors retain the uploaded setup",
      );
      assert.equal(pollCount, 2);
      await click(button("Refresh"));
      await wait(
        () =>
          document.querySelectorAll(".docking-table-wrap tbody tr").length ===
          2,
        "manual refresh resumes the selected run after a polling error",
      );
      assert.ok(
        pollCount >= 3,
        "Refresh fetches the selected job even when its URL has not changed",
      );
      assert.ok(
        !document.body.textContent.includes("Temporary docking status outage"),
      );
      await wait(
        () => document.body.textContent.includes("3D preview needs WebGL"),
        "visible fallback when WebGL is unavailable",
      );
      assert.ok(document.body.textContent.includes("-10.20"));
      assert.ok(
        document.body.textContent.includes(
          "not RMSD against an experimentally measured structure",
        ),
      );
      await click(
        document.querySelectorAll(".docking-table-wrap tbody button")[1],
      );
      assert.equal(document.getElementById("docking-pose").value, "2");
      await click(button("Scores CSV"));
      await wait(() => downloads.length === 1, "authenticated score download");
      assert.ok(downloads[0].name.endsWith("scores.csv"));
      assert.ok(
        calls.find((c) => c.path.endsWith("/files/scores.csv")).headers[
          "X-Workspace-Token"
        ],
      );
      await click(button("Save to library"));
      await wait(() => notes.length === 1, "saved research note");
      assert.ok(notes[0].content.includes("not measured binding affinity"));
      assert.ok(notes[0].content.includes("/docking?job=" + id));
      assert.ok(notes[0].content.includes("Pose 2: -9.1"));
      assert.ok(
        !calls.some(
          (c) =>
            c.path.includes("/api/ai/generate") ||
            c.path.includes("/api/images/generate"),
        ),
        "Docking is not an AI-generated score",
      );
      await act(async () => root.unmount());
      root = null;
      configured = false;
      await mount();
      await click(button("Load example"));
      await wait(
        () => document.getElementById("docking-name")?.value === example.name,
        "example available without engine",
      );
      assert.equal(button("Run docking").disabled, true);
      assert.ok(
        document.body.textContent.includes("Docking engine is not configured"),
      );
      assert.ok(!document.querySelector(".docking-table-wrap"));
      await act(async () => root.unmount());
      root = null;
      configured = true;
      slowJob = true;
      await mount();
      await click(button("Load example"));
      await wait(
        () => !button("Run docking").disabled,
        "example ready for cancellation check",
      );
      await submit();
      await wait(() => button("Cancel run"), "cancel control");
      await click(button("Cancel run"));
      await wait(
        () => document.body.textContent.includes("This run was cancelled"),
        "cancelled state",
      );
      assert.ok(
        document.getElementById("docking-name").value === example.name,
        "Cancellation keeps input setup",
      );
      assert.ok(
        !button("Scores CSV"),
        "Unavailable result artifacts are hidden after cancellation",
      );
      assert.ok(!button("Engine log"));
      assert.ok(button("Receptor"));
    } finally {
      if (root) await act(async () => root.unmount());
      await vite.close();
      globalThis.fetch = originalFetch;
      dom.window.close();
    }
  },
);
