import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceToken } from "./storage.js";
import { dockingRuntime, runVina } from "./docking-runtime.js";

const defaultRoot = fileURLToPath(
  new URL("../.data/docking/", import.meta.url),
);
const fixtureRoot = fileURLToPath(
  new URL("../fixtures/docking/", import.meta.url),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const LIMITS = Object.freeze({
  receptorBytes: 1200000,
  ligandBytes: 200000,
  receptorAtoms: 10000,
  ligandAtoms: 200,
  boxMinimum: 6,
  boxMaximum: 30,
  exhaustiveness: 16,
  numModes: 9,
  savedRuns: 250,
  cpu: 2,
});
const LIMITATIONS = [
  "AutoDock Vina scores are computational predictions, not measured binding affinities or evidence of clinical efficacy or safety.",
  "This workflow uses one prepared ligand and a rigid receptor. Protonation, atom types, charges and the selected binding site affect results.",
  "RMSD lower and upper bounds are distances from the best predicted pose, not from an experimental reference structure.",
  "Compare scores cautiously within a consistent preparation, target and scoring protocol. Review poses and validate experimentally.",
];
const FILES = new Set([
  "receptor.pdbqt",
  "ligand.pdbqt",
  "poses.pdbqt",
  "run.log",
  "report.json",
  "scores.csv",
]);
class DockingError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function finite(value, label, min, max) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new DockingError(
      400,
      `${label} must be a number from ${min} to ${max}.`,
    );
  return value;
}
function integer(value, fallback, label, max) {
  const number = value === undefined ? fallback : finite(value, label, 1, max);
  if (!Number.isInteger(number))
    throw new DockingError(400, `${label} must be a whole number.`);
  return number;
}
function preparedFile(value, kind) {
  const receptor = kind === "receptor";
  const maximum = receptor ? LIMITS.receptorBytes : LIMITS.ligandBytes;
  if (
    !value ||
    typeof value.text !== "string" ||
    !value.text.trim() ||
    Buffer.byteLength(value.text) > maximum
  )
    throw new DockingError(
      400,
      `Provide a prepared ${kind} PDBQT file of at most ${maximum} bytes.`,
    );
  const text = value.text.replace(/\r\n?/g, "\n");
  if (/[^\x09\x0a\x20-\x7e]/.test(text))
    throw new DockingError(400, `${kind} must be a plain-text PDBQT file.`);
  const name = value.name || `${kind}.pdbqt`;
  if (
    typeof name !== "string" ||
    name.length > 150 ||
    /[\/\\\x00-\x1f]/.test(name) ||
    !/\.pdbqt$/i.test(name)
  )
    throw new DockingError(
      400,
      `Choose a ${kind} file with a .pdbqt extension.`,
    );
  const lines = text.split("\n"),
    atoms = [];
  if (lines.length > 20000 || lines.some((line) => line.length > 1000))
    throw new DockingError(
      400,
      `${kind} has too many or excessively long records.`,
    );
  const records = new Set([
    "ATOM",
    "HETATM",
    "REMARK",
    "TER",
    "END",
    "ROOT",
    "ENDROOT",
    "BRANCH",
    "ENDBRANCH",
    "TORSDOF",
    "TITLE",
    "COMPND",
    "HEADER",
    "AUTHOR",
  ]);
  for (const line of lines) {
    if (!line.trim()) continue;
    const record = line.trim().split(/\s+/)[0];
    if (!records.has(record))
      throw new DockingError(
        400,
        `${kind} contains unsupported PDBQT records. Supply one prepared structure.`,
      );
    if (
      receptor &&
      ["ROOT", "ENDROOT", "BRANCH", "ENDBRANCH", "TORSDOF"].includes(record)
    )
      throw new DockingError(
        400,
        "This workflow requires a rigid receptor PDBQT file.",
      );
    if (record !== "ATOM" && record !== "HETATM") continue;
    const coordinates = [
      line.slice(30, 38),
      line.slice(38, 46),
      line.slice(46, 54),
    ];
    const charge = /\s([-+]?\d*\.?\d+)\s+[A-Za-z][A-Za-z0-9]*\s*$/.exec(line);
    if (
      coordinates.some(
        (value) =>
          !value.trim() ||
          !Number.isFinite(Number(value)) ||
          Math.abs(Number(value)) > 10000,
      ) ||
      !charge ||
      !Number.isFinite(Number(charge[1])) ||
      Math.abs(Number(charge[1])) > 10
    )
      throw new DockingError(
        400,
        `${kind} must contain numeric coordinates, charges and AutoDock atom types in PDBQT format.`,
      );
    atoms.push(coordinates.map(Number));
  }
  if (
    atoms.length < (receptor ? 10 : 1) ||
    atoms.length > (receptor ? LIMITS.receptorAtoms : LIMITS.ligandAtoms)
  )
    throw new DockingError(
      400,
      `${kind} must contain ${receptor ? "10–10000" : "1–200"} atoms.`,
    );
  if (receptor && /^(?:ROOT|ENDROOT|BRANCH|ENDBRANCH|TORSDOF)\b/m.test(text))
    throw new DockingError(
      400,
      "This workflow requires a rigid receptor PDBQT file.",
    );
  if (!receptor) {
    if (
      (text.match(/^ROOT\s*$/gm) || []).length !== 1 ||
      (text.match(/^ENDROOT\s*$/gm) || []).length !== 1 ||
      (text.match(/^TORSDOF\s+\d+\s*$/gm) || []).length !== 1
    )
      throw new DockingError(
        400,
        "Ligand PDBQT must contain one ROOT, ENDROOT and TORSDOF definition.",
      );
    const torsions = Number(/^TORSDOF\s+(\d+)/m.exec(text)?.[1]);
    if (torsions > 32)
      throw new DockingError(
        400,
        "Use a ligand with at most 32 torsional degrees of freedom.",
      );
  }
  return {
    text: text.endsWith("\n") ? text : text + "\n",
    name,
    atomCount: atoms.length,
    atoms,
  };
}
export function validateDockingRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new DockingError(400, "Provide a docking request.");
  const receptor = preparedFile(body.receptor, "receptor"),
    ligand = preparedFile(body.ligand, "ligand");
  const center = {},
    size = {};
  for (const axis of ["x", "y", "z"]) {
    center[axis] = finite(
      body.box?.center?.[axis],
      `Box center ${axis}`,
      -1000,
      1000,
    );
    size[axis] = finite(
      body.box?.size?.[axis],
      `Box size ${axis}`,
      LIMITS.boxMinimum,
      LIMITS.boxMaximum,
    );
  }
  if (
    !receptor.atoms.some((atom) =>
      ["x", "y", "z"].every(
        (axis, i) => Math.abs(atom[i] - center[axis]) <= size[axis] / 2,
      ),
    )
  )
    throw new DockingError(
      400,
      "The binding-site box does not overlap any receptor atoms. Check its coordinates.",
    );
  const name =
    body.name === undefined || body.name === ""
      ? "Molecular docking"
      : body.name;
  if (typeof name !== "string" || name.length > 160 || /[\x00-\x1f]/.test(name))
    throw new DockingError(400, "Use a run name of at most 160 characters.");
  return {
    name: name.trim(),
    receptor,
    ligand,
    parameters: {
      box: { center, size },
      exhaustiveness: integer(body.exhaustiveness, 8, "Exhaustiveness", 16),
      numModes: integer(body.numModes, 5, "Number of poses", 9),
      seed: integer(body.seed, 42, "Random seed", 2147483647),
    },
  };
}
function publicEngine(value) {
  return {
    name:
      typeof value.engine === "string"
        ? value.engine
        : value.engine?.name || "AutoDock Vina",
    version: value.version || value.engine?.version || "unknown",
    scoring: value.scoring || value.engine?.scoring || "vina",
  };
}
function csv(energies) {
  return (
    "mode,affinity_kcal_mol,rmsd_lower_angstrom,rmsd_upper_angstrom\n" +
    energies
      .map((e) => [e.mode, e.affinity, e.rmsdLower, e.rmsdUpper].join(","))
      .join("\n") +
    "\n"
  );
}

export function createDockingRouter({
  root = defaultRoot,
  runtime = dockingRuntime,
  run = runVina,
  timeoutMs = 120000,
  maxQueued = 2,
  dailyLimit = 10,
} = {}) {
  const router = express.Router(),
    pending = [],
    operations = new Map();
  let db,
    running = false,
    closed = false;
  const open = () => {
    if (db) return;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const filename = path.join(root, "jobs.sqlite");
    db = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    db.exec(
      "CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,scope TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL,manifest TEXT NOT NULL); CREATE INDEX IF NOT EXISTS docking_scope ON jobs(scope,created_at)",
    );
    const stale = db
      .prepare("SELECT manifest FROM jobs WHERE status IN ('queued','running')")
      .all();
    for (const row of stale) {
      const job = JSON.parse(row.manifest);
      job.status = "failed";
      job.error =
        "The docking server restarted before this run completed. Start a new run.";
      job.completedAt = new Date().toISOString();
      save(job);
    }
  };
  const get = (scope, id) => {
    open();
    if (!uuid(id)) return null;
    const row = db
      .prepare("SELECT manifest FROM jobs WHERE id=? AND scope=?")
      .get(id, scope);
    return row ? JSON.parse(row.manifest) : null;
  };
  const save = (job) =>
    db
      .prepare("UPDATE jobs SET status=?,manifest=? WHERE id=?")
      .run(job.status, JSON.stringify(job), job.id);
  const directory = (id) => path.join(root, "runs", id);
  async function execute(entry) {
    let job = get(entry.scope, entry.id);
    if (!job || job.status !== "queued" || entry.control.signal.aborted) {
      operations.delete(entry.id);
      queueMicrotask(pump);
      return;
    }
    running = true;
    job.status = "running";
    job.startedAt = new Date().toISOString();
    save(job);
    const timer = setTimeout(
      () => entry.control.abort(new Error("timeout")),
      timeoutMs,
    );
    try {
      const result = await run({
        directory: directory(job.id),
        receptorPath: path.join(directory(job.id), "receptor.pdbqt"),
        ligandPath: path.join(directory(job.id), "ligand.pdbqt"),
        ...job.parameters,
        signal: entry.control.signal,
      });
      entry.control.signal.throwIfAborted();
      if (
        !Array.isArray(result.energies) ||
        !result.energies.length ||
        result.energies.length > job.parameters.numModes ||
        result.energies.some(
          (e, i) =>
            e.mode !== i + 1 ||
            ![e.affinity, e.rmsdLower, e.rmsdUpper].every(Number.isFinite) ||
            e.rmsdLower < 0 ||
            e.rmsdUpper < e.rmsdLower,
        )
      )
        throw new Error("Invalid engine scores");
      // Read only fixed files under this job directory, never a result-supplied path.
      const poses = await readFile(path.join(directory(job.id), "poses.pdbqt"));
      if (
        !poses.length ||
        poses.length > 2000000 ||
        !poses.toString("utf8").includes("VINA RESULT")
      )
        throw new Error("Missing docked poses");
      const log = await readFile(path.join(directory(job.id), "run.log"));
      if (log.length > 2000000) throw new Error("Oversized run log");
      job = {
        ...job,
        energies: result.energies,
        durationMs: Math.max(0, Date.now() - Date.parse(job.startedAt)),
        completedAt: new Date().toISOString(),
      };
      const report = { ...job, status: "completed" };
      await writeFile(
        path.join(directory(job.id), "report.json"),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
      await writeFile(
        path.join(directory(job.id), "scores.csv"),
        csv(job.energies),
        { mode: 0o600 },
      );
      entry.control.signal.throwIfAborted();
      job.status = "completed";
      save(job);
    } catch (error) {
      const latest = get(entry.scope, entry.id);
      job = { ...latest, completedAt: new Date().toISOString() };
      if (latest.status === "cancelled" || entry.cancelled || closed) {
        job.status = "cancelled";
        job.error = "Docking was cancelled.";
      } else {
        job.status = "failed";
        job.error =
          entry.control.signal.aborted || error.code === "ENGINE_TIMEOUT"
            ? "Docking exceeded its time limit. Use a smaller ligand or search box and try again."
            : "AutoDock Vina could not complete this run. Check the prepared structures, atom types and binding-site box.";
      }
      delete job.energies;
      save(job);
    } finally {
      clearTimeout(timer);
      operations.delete(entry.id);
      running = false;
      pump();
    }
  }
  function pump() {
    if (running || closed) return;
    const entry = pending.shift();
    if (entry) {
      entry.promise = execute(entry);
      entry.promise.catch(() => {});
    }
  }
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      req.dockingScope = hash(workspaceToken(req));
      if (closed)
        throw new DockingError(
          503,
          "Docking is shutting down. Try again shortly.",
        );
      next();
    } catch (error) {
      res.status(error.status || 401).json({ error: error.message });
    }
  });
  const safe = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next);
  router.get(
    "/status",
    safe(async (_req, res) => {
      const info = await runtime();
      res.json({
        configured: !!info.configured,
        engine: publicEngine(info),
        limits: {
          ...LIMITS,
          maxQueued,
          dailyLimit,
          timeoutSeconds: Math.floor(timeoutMs / 1000),
        },
        ...(!info.configured
          ? {
              setup:
                "Run npm run setup:docking on the server, then refresh this page.",
            }
          : {}),
      });
    }),
  );
  router.get(
    "/example",
    safe(async (_req, res) => {
      const [receptor, ligand] = await Promise.all([
        readFile(path.join(fixtureRoot, "1iep_receptor.pdbqt"), "utf8"),
        readFile(path.join(fixtureRoot, "1iep_ligand.pdbqt"), "utf8"),
      ]);
      res.json({
        name: "Imatinib and c-Abl · 1IEP tutorial",
        description:
          "Prepared structures and binding-site box from the official AutoDock Vina basic docking tutorial. Re-run the calculation to explore predicted poses.",
        sourceUrl:
          "https://autodock-vina.readthedocs.io/en/latest/docking_basic.html",
        receptor: { name: "1iep_receptor.pdbqt", text: receptor },
        ligand: { name: "1iep_ligand.pdbqt", text: ligand },
        box: {
          center: { x: 15.19, y: 53.903, z: 16.917 },
          size: { x: 20, y: 20, z: 20 },
        },
      });
    }),
  );
  router.get(
    "/jobs",
    safe(async (req, res) => {
      open();
      res.json(
        db
          .prepare(
            "SELECT manifest FROM jobs WHERE scope=? ORDER BY created_at DESC LIMIT 30",
          )
          .all(req.dockingScope)
          .map((row) => JSON.parse(row.manifest)),
      );
    }),
  );
  router.post(
    "/jobs",
    safe(async (req, res) => {
      const input = validateDockingRequest(req.body),
        info = await runtime();
      if (closed)
        throw new DockingError(
          503,
          "Docking is shutting down. Try again shortly.",
        );
      if (!info.configured)
        throw new DockingError(
          503,
          "AutoDock Vina is not installed on this server. Run npm run setup:docking first.",
        );
      open();
      if (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM jobs WHERE scope=? AND status IN ('queued','running')",
          )
          .get(req.dockingScope).count
      )
        throw new DockingError(
          429,
          "You already have an active docking run. Wait or cancel it before starting another.",
        );
      // Count reservations too: concurrent uploads may still be writing their files.
      if (
        db
          .prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='queued'")
          .get().count >= maxQueued
      )
        throw new DockingError(
          429,
          "The docking queue is full. Try again after a run finishes.",
        );
      if (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM jobs WHERE scope=? AND created_at>=?",
          )
          .get(req.dockingScope, new Date().toISOString().slice(0, 10)).count >=
        dailyLimit
      )
        throw new DockingError(
          429,
          "The daily docking limit has been reached. Try again tomorrow.",
        );
      if (
        db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count >=
        LIMITS.savedRuns
      )
        throw new DockingError(
          503,
          "Docking storage has reached its run limit. Export your results and contact the server owner.",
        );
      const job = {
        id: randomUUID(),
        name: input.name,
        status: "queued",
        createdAt: new Date().toISOString(),
        parameters: { ...input.parameters, cpu: 2 },
        inputs: {},
        engine: publicEngine(info),
        limitations: LIMITATIONS,
      };
      for (const kind of ["receptor", "ligand"])
        job.inputs[kind] = {
          name: input[kind].name,
          atomCount: input[kind].atomCount,
          sha256: hash(input[kind].text),
        };
      db.prepare(
        "INSERT INTO jobs(id,scope,created_at,status,manifest) VALUES(?,?,?,?,?)",
      ).run(
        job.id,
        req.dockingScope,
        job.createdAt,
        job.status,
        JSON.stringify(job),
      );
      // Track preparation before its first await, so shutdown/cancellation also
      // covers a reservation whose input files are still being written.
      const entry = {
        id: job.id,
        scope: req.dockingScope,
        control: new AbortController(),
      };
      operations.set(job.id, entry);
      entry.promise = (async () => {
        await mkdir(directory(job.id), { recursive: true, mode: 0o700 });
        await Promise.all(
          ["receptor", "ligand"].map((kind) =>
            writeFile(
              path.join(directory(job.id), `${kind}.pdbqt`),
              input[kind].text,
              { mode: 0o600, flag: "wx" },
            ),
          ),
        );
      })();
      try {
        await entry.promise;
      } catch {
        operations.delete(job.id);
        if (closed)
          throw new DockingError(
            503,
            "Docking is shutting down. Try again shortly.",
          );
        if (entry.cancelled) {
          res.status(202).json(get(entry.scope, job.id));
          return;
        }
        job.status = "failed";
        job.error = "The server could not save docking inputs.";
        save(job);
        throw new DockingError(503, job.error);
      }
      if (closed) {
        operations.delete(job.id);
        throw new DockingError(
          503,
          "Docking is shutting down. Try again shortly.",
        );
      }
      if (entry.cancelled || entry.control.signal.aborted) {
        operations.delete(job.id);
        res.status(202).json(get(entry.scope, job.id));
        return;
      }
      pending.push(entry);
      res.status(202).json(job);
      queueMicrotask(pump);
    }),
  );
  router.get(
    "/jobs/:id",
    safe(async (req, res) => {
      const job = get(req.dockingScope, req.params.id);
      if (!job)
        throw new DockingError(404, "Docking run not found in this workspace.");
      res.json(job);
    }),
  );
  router.post(
    "/jobs/:id/cancel",
    safe(async (req, res) => {
      const job = get(req.dockingScope, req.params.id);
      if (!job)
        throw new DockingError(404, "Docking run not found in this workspace.");
      if (["queued", "running"].includes(job.status)) {
        job.status = "cancelled";
        job.completedAt = new Date().toISOString();
        job.error = "Docking was cancelled.";
        save(job);
        const entry = operations.get(job.id);
        if (entry) {
          entry.cancelled = true;
          entry.control.abort();
          const index = pending.indexOf(entry);
          if (index >= 0) {
            pending.splice(index, 1);
            operations.delete(job.id);
          }
        }
      }
      res.json(job);
    }),
  );
  router.get(
    "/jobs/:id/files/:filename",
    safe(async (req, res) => {
      const job = get(req.dockingScope, req.params.id),
        filename = req.params.filename;
      if (!job || !FILES.has(filename))
        throw new DockingError(
          404,
          "Docking file not found in this workspace.",
        );
      if (
        !["receptor.pdbqt", "ligand.pdbqt"].includes(filename) &&
        job.status !== "completed"
      )
        throw new DockingError(
          409,
          "Results are available after docking completes successfully.",
        );
      const content = await readFile(path.join(directory(job.id), filename));
      res
        .set({
          "Content-Type": filename.endsWith("json")
            ? "application/json"
            : filename.endsWith("csv")
              ? "text/csv; charset=utf-8"
              : "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        })
        .send(content);
    }),
  );
  router.use((error, _req, res, _next) => {
    const status =
      error instanceof DockingError
        ? error.status
        : error.type === "entity.too.large"
          ? 413
          : 500;
    res.status(status).json({
      error:
        error instanceof DockingError
          ? error.message
          : "Docking could not complete this operation. Please try again.",
      code: "DOCKING_ERROR",
    });
  });
  router.close = async () => {
    closed = true;
    for (const entry of operations.values()) {
      entry.cancelled = true;
      entry.control.abort();
      const job = get(entry.scope, entry.id);
      if (job && ["queued", "running"].includes(job.status)) {
        job.status = "cancelled";
        job.error = "Docking was cancelled when the server stopped.";
        job.completedAt = new Date().toISOString();
        save(job);
      }
    }
    pending.splice(0);
    await Promise.allSettled(
      [...operations.values()].map((entry) => entry.promise).filter(Boolean),
    );
    operations.clear();
    db?.close();
    db = undefined;
  };
  return router;
}
