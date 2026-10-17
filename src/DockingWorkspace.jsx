import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolQuestions } from "./tool-examples.js";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Atom,
  Bookmark,
  Check,
  Download,
  ExternalLink,
  FileUp,
  FlaskConical,
  LoaderCircle,
  Play,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, useApp } from "./App.jsx";
import { api } from "./lib.js";
import "./docking.css";

const MoleculeViewer = lazy(() => import("./MoleculeViewer.jsx"));
const initialBox = {
  center: { x: 0, y: 0, z: 0 },
  size: { x: 20, y: 20, z: 20 },
};
const terminal = (status) =>
  ["completed", "failed", "cancelled"].includes(status);
const active = (job) => job && !terminal(job.status);
const unwrap = (value) => value?.job || value;
const files = [
  ["poses.pdbqt", "Predicted poses"],
  ["receptor.pdbqt", "Receptor"],
  ["ligand.pdbqt", "Ligand"],
  ["scores.csv", "Scores CSV"],
  ["report.json", "Run report"],
  ["run.log", "Engine log"],
];
const number = (value, digits = 2) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const stamp = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "";

export default function DockingWorkspace() {
  const { saveNote } = useApp();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null),
    [jobs, setJobs] = useState([]),
    [job, setJob] = useState(null),
    [pollEpoch, setPollEpoch] = useState(0);
  const [name, setName] = useState(""),
    [receptor, setReceptor] = useState(null),
    [ligand, setLigand] = useState(null);
  const [box, setBox] = useState(initialBox),
    [exhaustiveness, setExhaustiveness] = useState(8),
    [numModes, setNumModes] = useState(5),
    [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [example, setExample] = useState(null),
    [pose, setPose] = useState(1),
    [structures, setStructures] = useState(null),
    [structureError, setStructureError] = useState("");
  const mounted = useRef(false),
    controllers = useRef(new Set()),
    fileVersion = useRef({ receptor: 0, ligand: 0 }),
    selected = useRef("");
  const selectedId = params.get("job") || "";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const c of controllers.current) c.abort();
      controllers.current.clear();
    };
  }, []);
  async function request(url, options = {}) {
    const control = new AbortController();
    controllers.current.add(control);
    try {
      return await api(url, { ...options, signal: control.signal });
    } finally {
      controllers.current.delete(control);
    }
  }
  async function refresh(restartSelected = true) {
    setError("");
    if (restartSelected && selectedId) setPollEpoch((value) => value + 1);
    const results = await Promise.allSettled([
      request("/api/docking/status"),
      request("/api/docking/jobs"),
    ]);
    if (!mounted.current) return;
    if (results[0].status === "fulfilled") setStatus(results[0].value);
    if (results[1].status === "fulfilled")
      setJobs(results[1].value.jobs || results[1].value);
    const failure = results.find(
      (r) => r.status === "rejected" && r.reason.name !== "AbortError",
    );
    if (failure) setError(failure.reason.message);
  }
  useEffect(() => {
    refresh(false);
  }, []);
  useEffect(() => {
    selected.current = selectedId;
    setJob(null);
    setPose(1);
    setStructures(null);
    setStructureError("");
    if (!selectedId) return;
    const control = new AbortController();
    controllers.current.add(control);
    let timer;
    async function poll() {
      try {
        const next = unwrap(
          await api("/api/docking/jobs/" + encodeURIComponent(selectedId), {
            signal: control.signal,
          }),
        );
        if (control.signal.aborted) return;
        setJob(next);
        setJobs((previous) => [
          next,
          ...previous.filter((item) => item.id !== next.id),
        ]);
        if (!terminal(next.status)) timer = setTimeout(poll, 1600);
      } catch (e) {
        if (!control.signal.aborted)
          setError(
            `${e.message} Use Refresh below to reconnect to this run. The server may still be computing.`,
          );
      }
    }
    poll();
    return () => {
      clearTimeout(timer);
      control.abort();
      controllers.current.delete(control);
    };
  }, [selectedId, pollEpoch]);
  async function getFile(id, filename, signal) {
    const response = await fetch(
      `/api/docking/jobs/${encodeURIComponent(id)}/files/${encodeURIComponent(filename)}`,
      {
        headers: {
          "X-Workspace-Token":
            localStorage.getItem("zntx-workspace-token") || "",
        },
        signal,
      },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Error(
        data.error || "This docking file is unavailable in your workspace.",
      );
    }
    return response;
  }
  useEffect(() => {
    if (job?.status !== "completed") return;
    const control = new AbortController();
    controllers.current.add(control);
    setStructures(null);
    setStructureError("");
    Promise.all([
      getFile(job.id, "receptor.pdbqt", control.signal).then((r) => r.text()),
      getFile(job.id, "poses.pdbqt", control.signal).then((r) => r.text()),
    ])
      .then(([receptor, poses]) => {
        if (!control.signal.aborted) setStructures({ receptor, poses });
      })
      .catch((e) => {
        if (!control.signal.aborted) setStructureError(e.message);
      });
    return () => {
      control.abort();
      controllers.current.delete(control);
    };
  }, [job?.id, job?.status]);
  function selectJob(id) {
    setError("");
    setParams({ job: id }, { replace: true });
  }
  async function readFile(event, kind) {
    const file = event.target.files?.[0],
      version = ++fileVersion.current[kind];
    event.target.value = "";
    if (!file) return;
    try {
      const limit =
        status?.limits?.[
          kind === "receptor" ? "receptorBytes" : "ligandBytes"
        ] || (kind === "receptor" ? 1200000 : 200000);
      if (!/\.pdbqt$/i.test(file.name))
        throw Error(
          "Choose a prepared .pdbqt file. PDB and SDF files need preparation first.",
        );
      if (file.size > limit)
        throw Error(
          `This file is too large. The upload limit is ${Math.floor(limit / 1000)} KB.`,
        );
      const text = await file.text();
      if (!/^(?:ATOM  |HETATM)/m.test(text) || text.includes("\0"))
        throw Error("This file does not contain readable PDBQT atom records.");
      if (!mounted.current || fileVersion.current[kind] !== version) return;
      (kind === "receptor" ? setReceptor : setLigand)({
        name: file.name,
        text,
      });
      setExample(null);
      setError("");
    } catch (e) {
      if (mounted.current) setError(e.message);
    }
  }
  async function loadExample() {
    setBusy("example");
    setError("");
    try {
      const result = await request("/api/docking/example");
      if (!mounted.current) return;
      fileVersion.current.receptor++;
      fileVersion.current.ligand++;
      setReceptor(result.receptor);
      setLigand(result.ligand);
      setBox(result.box);
      setName(result.name);
      setExample(result);
    } catch (e) {
      if (mounted.current && e.name !== "AbortError") setError(e.message);
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  async function run(event) {
    event.preventDefault();
    setError("");
    if (!receptor || !ligand) {
      setError(
        "Add both a prepared receptor and ligand, or load the official example.",
      );
      return;
    }
    const value = { center: {}, size: {} };
    for (const kind of ["center", "size"])
      for (const axis of ["x", "y", "z"]) {
        if (
          String(box[kind][axis]).trim() === "" ||
          !Number.isFinite(Number(box[kind][axis])) ||
          (kind === "center" && Math.abs(Number(box[kind][axis])) > 1000) ||
          (kind === "size" &&
            (Number(box[kind][axis]) < (status?.limits?.boxMinimum || 6) ||
              Number(box[kind][axis]) > (status?.limits?.boxMaximum || 30)))
        ) {
          setError(
            "Enter valid coordinates and box dimensions between 6 and 30 Å on every axis.",
          );
          return;
        }
        value[kind][axis] = Number(box[kind][axis]);
      }
    if (
      ![exhaustiveness, numModes, seed].every(
        (v) => String(v).trim() !== "" && Number.isInteger(Number(v)),
      ) ||
      exhaustiveness < 1 ||
      exhaustiveness > 16 ||
      numModes < 1 ||
      numModes > 9 ||
      seed < 1 ||
      seed > 2147483647
    ) {
      setError(
        "Check the search settings: exhaustiveness 1–16, poses 1–9, and seed 1–2,147,483,647.",
      );
      return;
    }
    setBusy("run");
    try {
      const result = unwrap(
        await request("/api/docking/jobs", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim() || "Molecular docking",
            receptor,
            ligand,
            box: value,
            exhaustiveness: Number(exhaustiveness),
            numModes: Number(numModes),
            seed: Number(seed),
          }),
        }),
      );
      if (mounted.current) {
        setJob(result);
        setJobs((previous) => [
          result,
          ...previous.filter((j) => j.id !== result.id),
        ]);
        selectJob(result.id);
      }
    } catch (e) {
      if (mounted.current && e.name !== "AbortError") setError(e.message);
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  async function cancel() {
    if (!job) return;
    setBusy("cancel");
    setError("");
    try {
      const result = unwrap(
        await request(
          `/api/docking/jobs/${encodeURIComponent(job.id)}/cancel`,
          { method: "POST" },
        ),
      );
      if (mounted.current && selected.current === result.id) setJob(result);
    } catch (e) {
      if (mounted.current && e.name !== "AbortError") setError(e.message);
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  async function downloadFile(filename) {
    if (!job) return;
    setBusy(filename);
    setError("");
    const control = new AbortController();
    controllers.current.add(control);
    try {
      const response = await getFile(job.id, filename, control.signal),
        blob = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `scrapetx-${job.id.slice(0, 8)}-${filename}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (mounted.current && e.name !== "AbortError") setError(e.message);
    } finally {
      controllers.current.delete(control);
      if (mounted.current) setBusy("");
    }
  }
  async function save() {
    setBusy("save");
    setError("");
    try {
      const p = job.parameters,
        rows = job.energies
          .map(
            (e) =>
              `Pose ${e.mode}: ${e.affinity} kcal/mol; RMSD lower ${e.rmsdLower} Å, upper ${e.rmsdUpper} Å`,
          )
          .join("\n");
      await saveNote({
        title: `${job.name} · Docking results`,
        content: `Computational docking predictions, not measured binding affinity, efficacy, or clinical proof.\n\n${job.engine?.name || "AutoDock Vina"} ${job.engine?.version || ""}\n${stamp(job.createdAt)}\n\nReceptor: ${job.inputs?.receptor?.name || "prepared receptor"}\nLigand: ${job.inputs?.ligand?.name || "prepared ligand"}\n\nBinding box (Å): ${JSON.stringify(p.box)}\nExhaustiveness: ${p.exhaustiveness}; poses requested: ${p.numModes}; seed: ${p.seed}\n\n${rows}\n\nRMSD bounds are relative to the best predicted pose, not an experimental structure.\n\nOpen saved run: ${window.location.origin}/docking?job=${encodeURIComponent(job.id)}\n\n${(job.limitations || []).join("\n")}`,
        dockingJobId: job.id,
      });
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  const running = active(job),
    formDisabled = Boolean(busy) || running;
  return (
    <div className="page docking-page">
      <header className="docking-header">
        <div>
          <div className="docking-eyebrow">
            <Atom size={15} aria-hidden="true" /> BIOMEDICAL WORKSPACE
          </div>
          <h1>Molecular docking</h1>
          <p>Explore how a prepared molecule may fit a protein binding site.</p>
        </div>
        <Link to="/pharma" className="docking-back">
          Pharma research <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </header>
      <PromptSuggestions examples={toolQuestions.docking} title="New to molecular docking?" hint="Choose a question to get setup guidance. No calculation starts." />
      <div className="docking-intro">
        <FlaskConical size={22} aria-hidden="true" />
        <p>
          <strong>Real computation, with a defined search box.</strong> Upload
          prepared structures or start with the official AutoDock Vina example.
          Scores are computational predictions and need scientific review.
        </p>
      </div>
      {error && (
        <div className="docking-alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <div className="docking-layout">
        <section
          className="docking-setup docking-panel"
          aria-labelledby="docking-setup-title"
        >
          <div className="docking-panel-heading">
            <div>
              <span className="docking-step">01 / PREPARE</span>
              <h2 id="docking-setup-title">Set up your run</h2>
            </div>
            <Button
              icon={busy === "example" ? LoaderCircle : FlaskConical}
              onClick={loadExample}
              disabled={formDisabled}
            >
              {busy === "example" ? "Loading…" : "Load example"}
            </Button>
          </div>
          {status && (
            <p
              className={`docking-engine ${status.configured ? "ready" : ""}`}
              role="status"
            >
              {status.configured ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Square size={14} aria-hidden="true" />
              )}
              {status.configured
                ? `${status.engine?.name || "AutoDock Vina"}${status.engine?.version ? " " + status.engine.version : ""} · Ready`
                : "Docking engine is not configured on this server. Ask the project owner to complete its setup."}
            </p>
          )}
          {!status && (
            <p className="docking-help">
              Checking docking engine availability…
            </p>
          )}
          {example && (
            <p className="docking-example-note">
              {example.description}{" "}
              {example.sourceUrl && (
                <a href={example.sourceUrl} target="_blank" rel="noreferrer">
                  Official example <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </p>
          )}
          <form onSubmit={run}>
            <label className="docking-label" htmlFor="docking-name">
              Run name
            </label>
            <input
              id="docking-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Target protein + candidate ligand"
              disabled={formDisabled}
            />
            <div className="docking-upload-grid">
              {[
                ["receptor", receptor, "Prepared receptor"],
                ["ligand", ligand, "Prepared ligand"],
              ].map(([kind, file, label]) => (
                <div className="docking-upload" key={kind}>
                  <div>
                    <FileUp size={20} aria-hidden="true" />
                    <strong>{label}</strong>
                    <span>{file ? file.name : ".pdbqt format"}</span>
                  </div>
                  <label
                    className={`docking-file-button ${formDisabled ? "disabled" : ""}`}
                  >
                    {file ? "Replace file" : "Choose file"}
                    <input
                      aria-label={`Upload ${label.toLowerCase()}`}
                      type="file"
                      accept=".pdbqt"
                      disabled={formDisabled}
                      onChange={(e) => readFile(e, kind)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="docking-help">
              Use a rigid receptor and a ligand prepared with hydrogens, atom
              types, charges, and rotatable bonds. File upload does not perform
              structure preparation.
            </p>
            <fieldset className="docking-box" disabled={formDisabled}>
              <legend>
                Binding box <span>Ångströms (Å)</span>
              </legend>
              <p className="docking-help">
                Use dimensions of 6–30 Å around a known binding site. The
                example includes its published box coordinates.
              </p>
              {["center", "size"].map((kind) => (
                <div className="docking-coordinate-row" key={kind}>
                  <strong>{kind === "center" ? "Center" : "Dimensions"}</strong>
                  {["x", "y", "z"].map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        type="number"
                        step="any"
                        required
                        min={
                          kind === "size"
                            ? status?.limits?.boxMinimum || 6
                            : -1000
                        }
                        max={
                          kind === "size"
                            ? status?.limits?.boxMaximum || 30
                            : 1000
                        }
                        aria-label={`Box ${kind} ${axis}`}
                        value={box[kind][axis]}
                        onChange={(e) =>
                          setBox((prev) => ({
                            ...prev,
                            [kind]: { ...prev[kind], [axis]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
            <details className="docking-advanced">
              <summary>Search settings</summary>
              <div className="docking-search-settings">
                <label>
                  Exhaustiveness
                  <input
                    type="number"
                    min="1"
                    max="16"
                    step="1"
                    required
                    value={exhaustiveness}
                    disabled={formDisabled}
                    onChange={(e) => setExhaustiveness(e.target.value)}
                  />
                  <small>Search effort · 1–16</small>
                </label>
                <label>
                  Requested poses
                  <input
                    type="number"
                    min="1"
                    max="9"
                    step="1"
                    required
                    value={numModes}
                    disabled={formDisabled}
                    onChange={(e) => setNumModes(e.target.value)}
                  />
                  <small>Up to 9 predictions</small>
                </label>
                <label>
                  Random seed
                  <input
                    type="number"
                    min="1"
                    max="2147483647"
                    step="1"
                    required
                    value={seed}
                    disabled={formDisabled}
                    onChange={(e) => setSeed(e.target.value)}
                  />
                  <small>Recorded for reproducibility</small>
                </label>
              </div>
            </details>
            <Button
              type="submit"
              primary
              icon={busy === "run" ? LoaderCircle : Play}
              disabled={
                formDisabled || !status?.configured || !receptor || !ligand
              }
              className="docking-run-button"
            >
              {busy === "run"
                ? "Starting docking…"
                : running
                  ? "A run is in progress"
                  : "Run docking"}
            </Button>
            <p className="docking-help docking-footnote">
              Runs continue on the local server if you leave this page. Use
              Cancel run to stop computation.
            </p>
          </form>
        </section>
        <div className="docking-results-column">
          <section
            className="docking-panel docking-results"
            aria-labelledby="docking-results-title"
          >
            <div className="docking-panel-heading">
              <div>
                <span className="docking-step">02 / INSPECT</span>
                <h2 id="docking-results-title">Docking results</h2>
              </div>
              {job && (
                <span className={`docking-status status-${job.status}`}>
                  {running && (
                    <LoaderCircle
                      className="spin"
                      size={13}
                      aria-hidden="true"
                    />
                  )}
                  {job.status}
                </span>
              )}
            </div>
            {!job ? (
              <div className="docking-empty">
                <Atom size={34} aria-hidden="true" />
                <h3>
                  {selectedId
                    ? "Opening saved run…"
                    : "Your results will appear here"}
                </h3>
                <p>
                  Run the example to explore predicted poses, scores, and
                  downloadable structures.
                </p>
              </div>
            ) : (
              <>
                <div className="docking-run-title">
                  <h3>{job.name}</h3>
                  <span>{stamp(job.createdAt)}</span>
                </div>
                {running && (
                  <div className="docking-progress" role="status">
                    <LoaderCircle
                      className="spin"
                      size={22}
                      aria-hidden="true"
                    />
                    <div>
                      <strong>
                        {job.status === "queued"
                          ? "Waiting to start"
                          : "Searching the binding box"}
                      </strong>
                      <p>
                        AutoDock Vina is calculating candidate poses. Run time
                        depends on the structures and search effort.
                      </p>
                    </div>
                    <Button
                      icon={Square}
                      onClick={cancel}
                      disabled={Boolean(busy)}
                    >
                      {busy === "cancel" ? "Stopping…" : "Cancel run"}
                    </Button>
                  </div>
                )}
                {job.status === "failed" && (
                  <div className="docking-alert" role="alert">
                    {job.error ||
                      "The docking engine could not complete this run. Inspect the engine log and input structures."}
                  </div>
                )}
                {job.status === "cancelled" && (
                  <p className="docking-help">
                    This run was cancelled. Your uploaded files and settings are
                    still available.
                  </p>
                )}
                {job.status === "completed" && (
                  <>
                    <div className="docking-score-summary">
                      <div>
                        <span>Best predicted affinity</span>
                        <strong>
                          {job.energies?.length
                            ? number(job.energies[0].affinity)
                            : "—"}{" "}
                          <small>kcal/mol</small>
                        </strong>
                      </div>
                      <p>
                        More negative scores indicate more favorable predicted
                        binding within this scoring model. They do not establish
                        biological activity.
                      </p>
                    </div>
                    <div className="docking-pose-toolbar">
                      <label htmlFor="docking-pose">
                        Inspect pose
                        <select
                          id="docking-pose"
                          value={pose}
                          onChange={(e) => setPose(Number(e.target.value))}
                        >
                          {(job.energies || []).map((e) => (
                            <option key={e.mode} value={e.mode}>
                              Pose {e.mode} · {number(e.affinity)} kcal/mol
                            </option>
                          ))}
                        </select>
                      </label>
                      <Button
                        icon={Bookmark}
                        disabled={Boolean(busy)}
                        onClick={save}
                      >
                        {busy === "save" ? "Saving…" : "Save to library"}
                      </Button>
                    </div>
                    {structures ? (
                      <Suspense
                        fallback={
                          <p
                            role="status"
                            className="docking-viewer-placeholder"
                          >
                            Opening molecular preview…
                          </p>
                        }
                      >
                        <MoleculeViewer {...structures} mode={pose} />
                      </Suspense>
                    ) : (
                      <p
                        className="docking-viewer-placeholder"
                        role={structureError ? "alert" : "status"}
                      >
                        {structureError || "Loading predicted structures…"}
                      </p>
                    )}
                    <div className="docking-table-wrap">
                      <table>
                        <caption>
                          Predicted poses · select a row to inspect it
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Pose</th>
                            <th scope="col">
                              Affinity
                              <br />
                              <small>kcal/mol</small>
                            </th>
                            <th scope="col">
                              RMSD lower
                              <br />
                              <small>Å</small>
                            </th>
                            <th scope="col">
                              RMSD upper
                              <br />
                              <small>Å</small>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(job.energies || []).map((e) => (
                            <tr
                              key={e.mode}
                              className={pose === e.mode ? "selected" : ""}
                            >
                              <th scope="row">
                                <button
                                  type="button"
                                  aria-pressed={pose === e.mode}
                                  onClick={() => setPose(e.mode)}
                                >
                                  Pose {e.mode}
                                </button>
                              </th>
                              <td>{number(e.affinity)}</td>
                              <td>{number(e.rmsdLower, 3)}</td>
                              <td>{number(e.rmsdUpper, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="docking-help">
                      RMSD bounds compare each pose with the best predicted
                      pose. They are not RMSD against an experimentally measured
                      structure.
                    </p>
                  </>
                )}
                {terminal(job.status) && (
                  <>
                    <details className="docking-run-details">
                      <summary>Parameters and input provenance</summary>
                      <dl>
                        {[
                          [
                            "Engine",
                            `${job.engine?.name || "AutoDock Vina"} ${job.engine?.version || ""}`,
                          ],
                          ["Receptor", job.inputs?.receptor?.name],
                          ["Ligand", job.inputs?.ligand?.name],
                          ["Exhaustiveness", job.parameters?.exhaustiveness],
                          ["Requested poses", job.parameters?.numModes],
                          ["Seed", job.parameters?.seed],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value ?? "—"}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="docking-help">
                        Binding box (Å): center{" "}
                        {JSON.stringify(job.parameters?.box?.center)},
                        dimensions {JSON.stringify(job.parameters?.box?.size)}.
                        SHA-256 input fingerprints are included in the run
                        report.
                      </p>
                    </details>
                    <div className="docking-downloads">
                      {files
                        .filter(
                          ([filename]) =>
                            job.status === "completed" ||
                            ["receptor.pdbqt", "ligand.pdbqt"].includes(
                              filename,
                            ),
                        )
                        .map(([filename, label]) => (
                          <Button
                            key={filename}
                            icon={Download}
                            onClick={() => downloadFile(filename)}
                            disabled={Boolean(busy)}
                          >
                            {busy === filename ? "Downloading…" : label}
                          </Button>
                        ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
          <section className="docking-panel docking-history">
            <div className="docking-panel-heading">
              <h2>Recent runs</h2>
              <Button
                icon={RefreshCw}
                onClick={() => refresh(true)}
                disabled={Boolean(busy)}
              >
                Refresh
              </Button>
            </div>
            {jobs.length ? (
              <ul>
                {jobs.slice(0, 12).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={selectedId === item.id ? "true" : undefined}
                      onClick={() => selectJob(item.id)}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{stamp(item.createdAt)}</small>
                      </span>
                      <span className={`docking-status status-${item.status}`}>
                        {item.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="docking-help">
                No docking runs saved in this workspace yet.
              </p>
            )}
          </section>
        </div>
      </div>
      <section className="docking-method-note">
        <h2>Interpret the result in context</h2>
        <p>
          This workflow uses a rigid receptor and a prepared ligand.
          Protonation, tautomer choice, receptor preparation, search-box
          placement, and random sampling affect the result. Docking scores
          cannot establish efficacy, safety, a binding constant, or clinical
          benefit. Validate a protocol with an appropriate reference ligand
          before comparing candidates.
        </p>
        {job?.limitations?.length > 0 && (
          <ul>
            {job.limitations.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
        <a
          href="https://autodock-vina.readthedocs.io/en/latest/"
          target="_blank"
          rel="noreferrer"
        >
          AutoDock Vina documentation{" "}
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
