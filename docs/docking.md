# Molecular docking in scrapeTx

scrapeTx runs a real, project-local **AutoDock Vina 1.2.7** process. It docks one prepared ligand into a rigid prepared receptor within a user-defined binding box. The scientific engine produces the poses and scores; the app does not ask a language model to invent them.

## Set up the engine

From the project directory:

```sh
npm run setup:docking
```

The installer selects the pinned official release for macOS Apple Silicon/Intel, Linux ARM64/x64, or Windows x64. It downloads to the ignored `.tools/vina/` directory, checks the project's SHA-256 pin, gives the file local executable permissions, then checks `--version`. It installs no global packages and changes no shell configuration. The binary and generated job files are excluded from Git.

For a separately managed server installation, set `DOCKING_VINA_PATH` to the absolute path of an AutoDock Vina 1.2.7 executable. Only the server administrator can configure this path; the request body never chooses a command or executable. The version is checked, but the project's official-release checksum is applied only to the default project-local binary.

Official downloads: [CCSB Scripps v1.2.7 release](https://github.com/ccsb-scripps/AutoDock-Vina/releases/tag/v1.2.7). The upstream release API currently publishes `digest: null` and no checksum asset. The SHA-256 pins in `server/docking-runtime.js` were measured from those official HTTPS release downloads; they detect subsequent changes but are **not independently published upstream checksums**. Review official release provenance before intentionally changing a pin/version.

## Inputs and outputs

- **Example:** load the bundled official imatinib / c-Abl tutorial pair. Its prepared files and source/license information are in `fixtures/docking/`.
- **Own structures:** supply a prepared receptor PDBQT and ligand PDBQT. PDB, SMILES, or a drug name alone is not a dockable input in this first version. Prepare protonation, charges, atom types, ligand torsions and receptor composition with an appropriate scientific workflow, such as the Meeko preparation described in the official tutorial.
- **Binding box:** enter the center and dimensions in Ångströms. This must describe a defensible binding site; the first version does not infer a pocket.
- **Results:** ranked poses with Vina affinity scores in kcal/mol and lower/upper RMSD bounds relative to the best predicted pose, plus downloadable `poses.pdbqt` and `run.log`. These RMSD values are not agreement with an experimental structure.

The official tutorial box is centered at `15.190, 53.903, 16.917` Å and is `20 × 20 × 20` Å. [Tutorial and preparation instructions](https://autodock-vina.readthedocs.io/en/latest/docking_basic.html).

## Execution and reproducibility

Every execution uses explicit argument arrays with `shell: false`, the Vina scoring function, two CPU threads, a recorded seed, and bounded parameters. The runtime helper accepts sizes from 4–30 Å, exhaustiveness 1–16 and 1–9 poses. The API may impose tighter limits. Jobs are bounded to two minutes and 1 MB of process output. Cancellation/timeout terminates the child, escalating to a forced kill, and waits for process exit before returning. Partial results are not published as completed jobs.

Inputs must be files inside the job directory and each be smaller than 5 MB. The app's job manager additionally validates prepared structure text, isolates workspace records and handles concurrency. The runtime itself makes no external network calls; installing the executable is a separate explicit setup step. The native worker receives only basic execution environment settings, without the server's research-provider API credentials.

The web workflow accepts a receptor up to 1.2 MB/10,000 atoms and a ligand up to 200 KB/200 atoms. Box dimensions are 6–30 Å per axis, with centers from −1000 to 1000 Å, and the box must overlap receptor atoms. It runs one job at a time, queues at most two more, and allows one active job per workspace and ten attempts per workspace per UTC day. It retains at most 250 runs on this server. Queued and completed records and their fixed-name files are kept privately in `.data/docking/`; they are scoped by a hashed workspace token. These local structure files do not synchronize to Supabase. Reopening `/docking?job=<id>` in the same workspace resumes viewing the saved job. A server restart stops active calculations; it does not silently resume a partial calculation.

Download a completed run's input files, predicted poses, engine log, score CSV and JSON report. The report records the engine version, scoring function, random seed, CPU setting, binding box, input SHA-256 hashes, timestamps and limitations. Save to My Library stores a summary with a link to the local run. Failed or cancelled calculations never expose partial poses as a successful result.

Each result should retain the structures, box, seed, exhaustiveness, engine version, scoring function and log. Random-search results can vary between environments despite a fixed seed, so do not promise identical scores across every OS/CPU or compare results from different scoring protocols as if they were equivalent.

## What a score means

A more negative Vina score ranks a predicted pose favorably within this scoring model. It does not establish experimental affinity, efficacy, safety, selectivity or a successful drug candidate. Study protonation, receptor conformations, co-factors/metals, known ligands and experimental controls before using docking in a research conclusion. This MVP uses a rigid receptor and does not include automated preparation, flexible receptor docking, batch virtual screening, dynamics or experimental validation.

For a research program, first reproduce a known ligand pose and evaluate the protocol against relevant experimental structures or reference ligands. Keep the original data and processing decisions alongside exported reports.

## Local smoke check

The bundled example was run with the actual native macOS ARM64 Vina binary using the official tutorial structures/box, seed `42`, exhaustiveness `8`, two threads and up to nine modes. The full generated poses and log are in ignored local development artifacts when the check is run. These are actual calculated results rather than fixture scores copied from the tutorial. The app's test suite also exercises parsing, input rejection, job state and workspace access; routine tests should not require an engine download or a costly docking run.

A live app-API check also submitted the official example through `/api/docking/jobs`, waited for completion, downloaded all result artifacts, and confirmed that a different workspace receives 404. It returned four poses with a best predicted Vina score of −13.237 kcal/mol in about 15 seconds on the development Mac. This is an execution check, not scientific validation of a drug candidate. Automated UI tests cover the example, explicit run, polling, cancellation, downloads, library saving and the WebGL-unavailable fallback. Local browser use remained disabled during implementation, so interactive visual inspection of the 3D viewer is still pending.
