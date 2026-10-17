import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDockingRouter } from "../server/docking.js";

const OWNER = "a".repeat(64);
const OTHER = "b".repeat(64);
const ENGINE = { name: "AutoDock Vina", version: "1.2.7" };

function atom(serial, { x = serial / 10, y = 1, z = 2, type = "C" } = {}) {
  const columns = Array(80).fill(" ");
  const field = (offset, width, value, right = true) => {
    const text = right
      ? String(value).padStart(width)
      : String(value).padEnd(width);
    [...text].forEach(
      (character, index) => (columns[offset + index] = character),
    );
  };
  field(0, 6, "ATOM", false);
  field(6, 5, serial);
  field(12, 4, "C" + serial, false);
  field(17, 3, "ALA", false);
  field(21, 1, "A");
  field(22, 4, 1);
  field(30, 8, x.toFixed(3));
  field(38, 8, y.toFixed(3));
  field(46, 8, z.toFixed(3));
  field(54, 6, "1.00");
  field(60, 6, "0.00");
  field(70, 6, "0.000");
  field(77, 2, type, false);
  return columns.join("").trimEnd();
}

const RECEPTOR =
  Array.from({ length: 10 }, (_, index) => atom(index + 1)).join("\n") + "\n";
const LIGAND = [
  "ROOT",
  atom(1),
  atom(2, { type: "OA" }),
  "ENDROOT",
  "TORSDOF 0",
  "",
].join("\n");
const input = (changes = {}) => ({
  name: "Prepared receptor and ligand",
  receptor: { name: "protein.pdbqt", text: RECEPTOR },
  ligand: { name: "compound.pdbqt", text: LIGAND },
  box: { center: { x: 0, y: 0, z: 0 }, size: { x: 16, y: 18, z: 20 } },
  exhaustiveness: 4,
  numModes: 3,
  seed: 42,
  ...changes,
});

async function completeRun({ directory, receptorPath, ligandPath, signal }) {
  assert.equal(signal.aborted, false);
  assert.equal(readFileSync(receptorPath, "utf8"), RECEPTOR);
  assert.equal(readFileSync(ligandPath, "utf8"), LIGAND);
  const outputPath = path.join(directory, "poses.pdbqt");
  const logPath = path.join(directory, "run.log");
  writeFileSync(
    outputPath,
    "MODEL 1\nREMARK VINA RESULT: -7.100 0.000 0.000\n" + LIGAND + "ENDMDL\n",
  );
  writeFileSync(logPath, "AutoDock Vina 1.2.7\n1 -7.100 0.000 0.000\n");
  return {
    energies: [{ mode: 1, affinity: -7.1, rmsdLower: 0, rmsdUpper: 0 }],
    outputPath,
    logPath,
    durationMs: 10,
    engine: ENGINE,
  };
}

async function harness(t, options = {}) {
  const root =
    options.root || mkdtempSync(path.join(tmpdir(), "scrapetx-docking-"));
  const router = createDockingRouter({
    root,
    runtime: async () => ({ configured: true, engine: ENGINE }),
    run: completeRun,
    timeoutMs: 3000,
    maxQueued: 2,
    dailyLimit: 10,
    ...options,
  });
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api/docking", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await router.close();
    await new Promise((resolve) => server.close(resolve));
    if (!options.root) rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    router,
    call: (
      route,
      { token = OWNER, body, method = body ? "POST" : "GET" } = {},
    ) =>
      fetch(`http://127.0.0.1:${server.address().port}/api/docking${route}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token === null ? {} : { "X-Workspace-Token": token }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
  };
}

async function waitFor(h, id, status, token = OWNER) {
  const deadline = Date.now() + 4000;
  let job;
  while (Date.now() < deadline) {
    const response = await h.call("/jobs/" + id, { token });
    assert.equal(response.status, 200);
    job = await response.json();
    if (job.status === status) return job;
    if (["failed", "cancelled", "completed"].includes(job.status))
      assert.fail(`Expected ${status}, got ${job.status}: ${job.error || ""}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Job did not become ${status}: ${JSON.stringify(job)}`);
}

async function submit(h, options = {}) {
  const response = await h.call("/jobs", { body: input(), ...options });
  assert.ok(
    [200, 201, 202].includes(response.status),
    await response.clone().text(),
  );
  const job = await response.json();
  assert.ok(job.id);
  return job;
}

test("docking requires a workspace and reports the real engine configuration", async (t) => {
  const h = await harness(t);
  for (const route of ["/status", "/jobs"])
    assert.equal((await h.call(route, { token: null })).status, 401);
  assert.equal(
    (await h.call("/jobs", { token: "invalid", body: input() })).status,
    401,
  );
  const response = await h.call("/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.configured, true);
  assert.equal(status.engine.name, ENGINE.name);
  assert.equal(status.engine.version, ENGINE.version);
});

test("docking completes a real runner job and provides scoped inputs, poses, scores and provenance", async (t) => {
  let calls = 0;
  const h = await harness(t, {
    run: async (options) => {
      calls++;
      assert.deepEqual(options.box, input().box);
      assert.equal(options.exhaustiveness, 4);
      assert.equal(options.numModes, 3);
      assert.equal(options.seed, 42);
      return completeRun(options);
    },
  });
  const created = await submit(h);
  const job = await waitFor(h, created.id, "completed");
  assert.equal(calls, 1);
  assert.equal(job.energies[0].affinity, -7.1);
  assert.equal(job.energies[0].mode, 1);
  assert.ok(job.inputs);
  assert.ok(job.parameters);
  assert.equal(
    (await h.call("/jobs").then((response) => response.json())).length,
    1,
  );
  assert.deepEqual(
    await h.call("/jobs", { token: OTHER }).then((response) => response.json()),
    [],
  );
  assert.equal(
    (await h.call("/jobs/" + created.id, { token: OTHER })).status,
    404,
  );
  assert.equal(
    (
      await h.call("/jobs/" + created.id + "/cancel", {
        token: OTHER,
        body: {},
      })
    ).status,
    404,
  );
  for (const name of [
    "receptor.pdbqt",
    "ligand.pdbqt",
    "poses.pdbqt",
    "run.log",
    "report.json",
    "scores.csv",
  ]) {
    const route = "/jobs/" + created.id + "/files/" + name;
    assert.equal((await h.call(route, { token: OTHER })).status, 404);
    const response = await h.call(route);
    assert.equal(response.status, 200, name);
    const text = await response.text();
    assert.ok(text.length > 0, name);
    if (name === "receptor.pdbqt") assert.equal(text, RECEPTOR);
    if (name === "ligand.pdbqt") assert.equal(text, LIGAND);
    if (name === "poses.pdbqt") assert.match(text, /VINA RESULT: -7\.100/);
    if (name === "scores.csv") {
      assert.match(text, /affinity/i);
      assert.match(text, /-7\.1/);
    }
    if (name === "report.json") {
      assert.doesNotThrow(() => JSON.parse(text));
      assert.match(text, /AutoDock Vina/);
      assert.match(text, /1\.2\.7/);
      assert.match(text, /-7\.1/);
    }
    assert.equal(
      text.includes(h.root),
      false,
      "Responses must not expose private server paths",
    );
    assert.equal(
      text.includes(OWNER),
      false,
      "Responses must not expose workspace secrets",
    );
  }
  assert.equal(
    (await h.call("/jobs/" + created.id + "/files/private.txt")).status,
    404,
  );
});

test("invalid prepared inputs and unsafe search boxes are rejected before execution", async (t) => {
  let calls = 0;
  const h = await harness(t, {
    run: async (options) => {
      calls++;
      return completeRun(options);
    },
  });
  const cases = [
    input({
      box: { center: { x: 1001, y: 0, z: 0 }, size: { x: 16, y: 16, z: 16 } },
    }),
    input({
      box: { center: { x: 0, y: 0, z: 0 }, size: { x: 5, y: 16, z: 16 } },
    }),
    input({
      box: { center: { x: 0, y: 0, z: 0 }, size: { x: 31, y: 16, z: 16 } },
    }),
    input({
      box: { center: { x: "0", y: 0, z: 0 }, size: { x: 16, y: 16, z: 16 } },
    }),
    input({
      ligand: {
        name: "bad.pdbqt",
        text: "ROOT\nnot an atom\nENDROOT\nTORSDOF 0\n",
      },
    }),
    input({ ligand: { name: "two-ligands.pdbqt", text: LIGAND + LIGAND } }),
    input({ receptor: { name: "short.pdbqt", text: atom(1) + "\n" } }),
    input({ receptor: { name: "large.pdbqt", text: "x".repeat(1100000) } }),
    input({
      ligand: {
        name: "oversized.pdbqt",
        text: [
          "ROOT",
          ...Array.from({ length: 201 }, (_, index) => atom(index + 1)),
          "ENDROOT",
          "TORSDOF 0",
        ].join("\n"),
      },
    }),
    input({ exhaustiveness: 17 }),
    input({ numModes: 10 }),
    input({ seed: -1 }),
  ];
  for (const body of cases) {
    const response = await h.call("/jobs", { body });
    assert.ok([400, 413].includes(response.status), await response.text());
  }
  assert.equal(calls, 0);
  assert.deepEqual(
    await h.call("/jobs").then((response) => response.json()),
    [],
  );
});

test("an unavailable docking runtime cannot produce placeholder results", async (t) => {
  let calls = 0;
  const h = await harness(t, {
    runtime: async () => ({
      configured: false,
      reason: "Install the local docking runtime.",
    }),
    run: async () => {
      calls++;
      throw new Error("Must not execute");
    },
  });
  assert.equal(
    (await h.call("/status").then((response) => response.json())).configured,
    false,
  );
  const response = await h.call("/jobs", { body: input() });
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
  assert.deepEqual(await h.call("/jobs").then((result) => result.json()), []);
});

test("cancelling a running job aborts the engine and never publishes successful poses", async (t) => {
  let observedSignal;
  const h = await harness(t, {
    run: async (options) => {
      observedSignal = options.signal;
      await new Promise((resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
      return completeRun(options);
    },
  });
  const created = await submit(h);
  await waitFor(h, created.id, "running");
  const response = await h.call("/jobs/" + created.id + "/cancel", {
    body: {},
  });
  assert.equal(response.status, 200);
  await waitFor(h, created.id, "cancelled");
  assert.equal(observedSignal.aborted, true);
  assert.ok(
    [404, 409].includes(
      (await h.call("/jobs/" + created.id + "/files/poses.pdbqt")).status,
    ),
  );
  const job = await h
    .call("/jobs/" + created.id)
    .then((result) => result.json());
  assert.equal((job.energies || []).length, 0);
});

test("a runner finishing after cancellation cannot restore a completed result", async (t) => {
  let release;
  let finished = false;
  const h = await harness(t, {
    run: async ({ directory }) => {
      await new Promise((resolve) => (release = resolve));
      const outputPath = path.join(directory, "poses.pdbqt");
      const logPath = path.join(directory, "run.log");
      writeFileSync(outputPath, "MODEL 1\n" + LIGAND + "ENDMDL\n");
      writeFileSync(logPath, "Finished after the user cancelled\n");
      finished = true;
      return {
        energies: [{ mode: 1, affinity: -7.1, rmsdLower: 0, rmsdUpper: 0 }],
        outputPath,
        logPath,
        durationMs: 10,
        engine: ENGINE,
      };
    },
  });
  const created = await submit(h);
  await waitFor(h, created.id, "running");
  assert.equal(
    (await h.call("/jobs/" + created.id + "/cancel", { body: {} })).status,
    200,
  );
  release();
  const deadline = Date.now() + 2000;
  while (!finished && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(finished, true);
  await waitFor(h, created.id, "cancelled");
  assert.ok(
    [404, 409].includes(
      (await h.call("/jobs/" + created.id + "/files/poses.pdbqt")).status,
    ),
  );
  const job = await h
    .call("/jobs/" + created.id)
    .then((response) => response.json());
  assert.equal((job.energies || []).length, 0);
});

test("the bounded queue enforces one active job per workspace and queued cancellations never execute", async (t) => {
  let release;
  let running = 0;
  let maximumRunning = 0;
  const executed = [];
  const h = await harness(t, {
    run: async (options) => {
      running++;
      maximumRunning = Math.max(maximumRunning, running);
      executed.push(options.directory);
      try {
        if (executed.length === 1)
          await new Promise((resolve, reject) => {
            release = resolve;
            options.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        return await completeRun(options);
      } finally {
        running--;
      }
    },
  });
  const first = await submit(h);
  await waitFor(h, first.id, "running");
  assert.equal((await h.call("/jobs", { body: input() })).status, 429);
  const second = await submit(h, { token: OTHER });
  const third = await submit(h, { token: "c".repeat(64) });
  assert.equal(
    (await h.call("/jobs", { token: "d".repeat(64), body: input() })).status,
    429,
  );
  const cancelled = await h.call("/jobs/" + second.id + "/cancel", {
    token: OTHER,
    body: {},
  });
  assert.equal(cancelled.status, 200);
  await waitFor(h, second.id, "cancelled", OTHER);
  release();
  await waitFor(h, first.id, "completed");
  await waitFor(h, third.id, "completed", "c".repeat(64));
  assert.equal(executed.length, 2);
  assert.equal(maximumRunning, 1);
});

test("daily docking job limits reject additional work without calling the engine", async (t) => {
  let calls = 0;
  const h = await harness(t, {
    dailyLimit: 1,
    run: async (options) => {
      calls++;
      return completeRun(options);
    },
  });
  const first = await submit(h);
  await waitFor(h, first.id, "completed");
  assert.equal((await h.call("/jobs", { body: input() })).status, 429);
  assert.equal(calls, 1);
  const independent = await submit(h, { token: OTHER });
  await waitFor(h, independent.id, "completed", OTHER);
  assert.equal(calls, 2);
});

test("shutdown prevents an in-flight runtime check from admitting an orphaned job", async (t) => {
  let releaseRuntime;
  let enteredRuntime;
  let engineCalls = 0;
  const entered = new Promise((resolve) => (enteredRuntime = resolve));
  const h = await harness(t, {
    runtime: async () => {
      enteredRuntime();
      await new Promise((resolve) => (releaseRuntime = resolve));
      return { configured: true, engine: ENGINE };
    },
    run: async (options) => {
      engineCalls++;
      return completeRun(options);
    },
  });
  const submitted = h.call("/jobs", { body: input() });
  await entered;
  await h.router.close();
  releaseRuntime();
  const response = await submitted;
  assert.equal(
    response.status,
    503,
    "An admitted request must recheck shutdown after asynchronous setup",
  );
  assert.equal(engineCalls, 0);
});

test("a native engine timeout reports the time limit instead of blaming prepared structures", async (t) => {
  const h = await harness(t, {
    run: async () => {
      throw Object.assign(
        new Error("The native engine reached its time limit."),
        {
          code: "ENGINE_TIMEOUT",
        },
      );
    },
  });
  const created = await submit(h);
  const job = await waitFor(h, created.id, "failed");
  assert.match(job.error, /time limit|timed out|timeout|exceeded.*time/i);
  assert.equal((job.energies || []).length, 0);
  assert.ok(
    [404, 409].includes(
      (await h.call("/jobs/" + created.id + "/files/poses.pdbqt")).status,
    ),
  );
});
