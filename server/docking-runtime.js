import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// These are SHA-256 pins measured from the official v1.2.7 release assets over HTTPS.
// GitHub's metadata for this release has no independently published asset digest.
export const VINA_RELEASE = Object.freeze({
  version: "1.2.7",
  tag: "v1.2.7",
  repository: "https://github.com/ccsb-scripps/AutoDock-Vina",
  assets: Object.freeze({
    "darwin-arm64": {
      name: "vina_1.2.7_mac_aarch64",
      sha256:
        "823c2bbacf26d72183861322345f0a89736aca66c8e81054c66f93af5ad623f1",
    },
    "darwin-x64": {
      name: "vina_1.2.7_mac_x86_64",
      sha256:
        "9f44ccbb163223613283a75d0be53235d9e63f4da08292cb7196144f9838b7f9",
    },
    "linux-arm64": {
      name: "vina_1.2.7_linux_aarch64",
      sha256:
        "d30c18a7d5f6f8ea9146e1cbc0aa7ade0bbb105b54ece08b4e5a7fa53edb6c62",
    },
    "linux-x64": {
      name: "vina_1.2.7_linux_x86_64",
      sha256:
        "f31f774f723bba7bbe6e9d1c47577020eea9a8da16424284c043d22593570644",
    },
    "win32-x64": {
      name: "vina_1.2.7_win.exe",
      sha256:
        "e0c4b2715e0c1a74f6e92d0f3be0328ac97542eafbc111e6b1efad897a73cce5",
    },
  }),
});

export function dockingBinaryPath({
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const asset = VINA_RELEASE.assets[`${platform}-${arch}`];
  return asset ? path.join(projectRoot, ".tools", "vina", asset.name) : null;
}

function processError(message, code, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

async function boundedProcess(
  binary,
  args,
  { directory, signal, timeoutMs = 120_000, maxOutputBytes = 1_048_576 } = {},
) {
  if (signal?.aborted)
    throw processError("Docking was cancelled.", "ABORT_ERR");
  return new Promise((resolve, reject) => {
    let child;
    let output = "";
    let totalBytes = 0;
    let failure;
    let killTimer;
    let timer;
    let settled = false;
    const stop = (error) => {
      if (failure) return;
      failure = error;
      child?.kill("SIGTERM");
      killTimer = setTimeout(() => child?.kill("SIGKILL"), 1500);
      killTimer.unref?.();
    };
    const onAbort = () =>
      stop(processError("Docking was cancelled.", "ABORT_ERR"));
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    try {
      child = spawn(binary, args, {
        cwd: directory,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        // Scientific workers do not need the server's API credentials.
        env: {
          PATH: process.env.PATH,
          TMPDIR: process.env.TMPDIR,
          LANG: process.env.LANG || "C",
          ...(process.platform === "win32"
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
          OMP_NUM_THREADS: "2",
        },
      });
    } catch {
      finish(
        processError(
          "The local docking engine could not start.",
          "ENGINE_START_FAILED",
        ),
      );
      return;
    }
    const collect = (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxOutputBytes) {
        stop(
          processError(
            "The docking engine exceeded its output limit.",
            "ENGINE_OUTPUT_LIMIT",
          ),
        );
        return;
      }
      output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", () =>
      finish(
        processError(
          "The local docking engine could not start.",
          "ENGINE_START_FAILED",
        ),
      ),
    );
    child.on("close", (code) => {
      if (failure) return finish(failure);
      if (code !== 0)
        return finish(
          processError(
            "The docking engine rejected the inputs or failed. Review the prepared PDBQT structures and binding box.",
            "ENGINE_FAILED",
            { engineOutput: output },
          ),
        );
      finish(null, output);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(
      () =>
        stop(
          processError(
            "Docking exceeded the two-minute local runtime limit. Use a smaller box or lower exhaustiveness.",
            "ENGINE_TIMEOUT",
          ),
        ),
      timeoutMs,
    );
    timer.unref?.();
    if (signal?.aborted) onAbort();
  });
}

export async function dockingRuntime() {
  const platform = `${process.platform}-${process.arch}`;
  const base = {
    configured: false,
    available: false,
    installed: false,
    engine: "AutoDock Vina",
    version: VINA_RELEASE.version,
    scoring: "vina",
    platform,
  };
  const configuredPath = process.env.DOCKING_VINA_PATH?.trim();
  const binary = configuredPath
    ? path.resolve(configuredPath)
    : dockingBinaryPath();
  if (!binary)
    return {
      ...base,
      reason:
        "No bundled engine is available for this platform. Configure DOCKING_VINA_PATH with a local AutoDock Vina 1.2.7 executable.",
    };
  try {
    await access(binary, constants.X_OK);
    const info = await stat(binary);
    if (!info.isFile() || info.size > 20_000_000)
      throw new Error("Invalid executable.");
    if (!configuredPath) {
      const expected = VINA_RELEASE.assets[platform].sha256;
      const actual = createHash("sha256")
        .update(await readFile(binary))
        .digest("hex");
      if (actual !== expected)
        return {
          ...base,
          reason:
            "The local docking engine failed its SHA-256 integrity check. Run npm run setup:docking to reinstall.",
        };
    }
    const output = await boundedProcess(binary, ["--version"], {
      timeoutMs: 5000,
      maxOutputBytes: 4096,
    });
    if (!/AutoDock Vina v1\.2\.7\b/.test(output))
      return {
        ...base,
        reason: "AutoDock Vina 1.2.7 is required for reproducible jobs.",
      };
    return {
      ...base,
      configured: true,
      available: true,
      installed: true,
      path: binary,
      source: configuredPath ? "configured" : "project-local",
    };
  } catch {
    return {
      ...base,
      reason:
        "The local docking engine is not installed or cannot run. Run npm run setup:docking on the server.",
    };
  }
}

async function containedInput(file, directory, label) {
  const resolved = await realpath(file);
  const relative = path.relative(directory, resolved);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  )
    throw processError(
      `${label} must be inside the job directory.`,
      "INVALID_DOCKING_INPUT",
    );
  const info = await stat(resolved);
  if (!info.isFile() || info.size < 1 || info.size > 5_000_000)
    throw processError(
      `${label} must be a prepared PDBQT file smaller than 5 MB.`,
      "INVALID_DOCKING_INPUT",
    );
  return resolved;
}

export function parseVinaEnergies(pdbqt) {
  const energies = [];
  for (const match of String(pdbqt).matchAll(
    /^REMARK VINA RESULT:\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gm,
  )) {
    energies.push({
      mode: energies.length + 1,
      affinity: Number(match[1]),
      rmsdLower: Number(match[2]),
      rmsdUpper: Number(match[3]),
    });
  }
  return energies;
}

export async function runVina({
  directory,
  receptorPath,
  ligandPath,
  box,
  exhaustiveness = 8,
  numModes = 9,
  seed = 42,
  signal,
} = {}) {
  const runtime = await dockingRuntime();
  if (!runtime.available)
    throw processError(runtime.reason, "ENGINE_NOT_AVAILABLE");
  const jobDirectory = await realpath(directory);
  const receptor = await containedInput(receptorPath, jobDirectory, "Receptor");
  const ligand = await containedInput(ligandPath, jobDirectory, "Ligand");
  if (
    !Number.isInteger(exhaustiveness) ||
    exhaustiveness < 1 ||
    exhaustiveness > 16 ||
    !Number.isInteger(numModes) ||
    numModes < 1 ||
    numModes > 9 ||
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 2_147_483_647
  )
    throw processError("Invalid docking parameters.", "INVALID_DOCKING_INPUT");
  for (const axis of ["x", "y", "z"]) {
    if (
      !Number.isFinite(box?.center?.[axis]) ||
      Math.abs(box.center[axis]) > 10_000 ||
      !Number.isFinite(box?.size?.[axis]) ||
      box.size[axis] < 4 ||
      box.size[axis] > 30
    )
      throw processError(
        "Invalid binding box. Use finite centers and sizes from 4 to 30 Å.",
        "INVALID_DOCKING_INPUT",
      );
  }
  const outputPath = path.join(jobDirectory, "poses.pdbqt");
  const logPath = path.join(jobDirectory, "run.log");
  const args = [
    "--receptor",
    receptor,
    "--ligand",
    ligand,
    "--out",
    outputPath,
    "--scoring",
    "vina",
    "--cpu",
    "2",
    "--exhaustiveness",
    String(exhaustiveness),
    "--num_modes",
    String(numModes),
    "--seed",
    String(seed),
    "--verbosity",
    "1",
  ];
  for (const axis of ["x", "y", "z"])
    args.push(
      `--center_${axis}`,
      String(box.center[axis]),
      `--size_${axis}`,
      String(box.size[axis]),
    );
  const started = Date.now();
  const stdout = await boundedProcess(runtime.path, args, {
    directory: jobDirectory,
    signal,
  });
  await writeFile(logPath, stdout, { mode: 0o600 });
  const outputInfo = await stat(outputPath);
  if (
    !outputInfo.isFile() ||
    outputInfo.size < 1 ||
    outputInfo.size > 50_000_000
  )
    throw processError(
      "The docking engine returned an invalid pose file.",
      "ENGINE_NO_POSES",
    );
  const output = await readFile(outputPath, "utf8");
  await chmod(outputPath, 0o600);
  const energies = parseVinaEnergies(output);
  const modelCount = [...output.matchAll(/^MODEL\s+\d+\s*$/gm)].length;
  if (
    !energies.length ||
    energies.length > numModes ||
    energies.length !== modelCount ||
    energies.some(
      (row) =>
        ![row.affinity, row.rmsdLower, row.rmsdUpper].every(Number.isFinite),
    )
  )
    throw processError(
      "The docking engine returned no valid poses.",
      "ENGINE_NO_POSES",
    );
  return {
    energies,
    outputPath,
    logPath,
    stdout,
    durationMs: Date.now() - started,
    engine: {
      name: runtime.engine,
      version: runtime.version,
      scoring: runtime.scoring,
      cpu: 2,
      seed,
    },
    outputBytes: Buffer.byteLength(output),
  };
}
