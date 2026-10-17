import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  rename,
  chmod,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  VINA_RELEASE,
  dockingBinaryPath,
  dockingRuntime,
} from "../server/docking-runtime.js";

const platform = `${process.platform}-${process.arch}`;
const asset = VINA_RELEASE.assets[platform];
if (!asset)
  throw new Error(
    `No pinned AutoDock Vina release is configured for ${platform}. Install AutoDock Vina ${VINA_RELEASE.version} separately and set DOCKING_VINA_PATH.`,
  );
const binary = dockingBinaryPath();
const directory = path.dirname(binary);
await mkdir(directory, { recursive: true, mode: 0o700 });
const digest = (data) => createHash("sha256").update(data).digest("hex");
let current;
try {
  current = await readFile(binary);
} catch {
  /* First project-local install. */
}
if (!current || digest(current) !== asset.sha256) {
  const url = `${VINA_RELEASE.repository}/releases/download/${VINA_RELEASE.tag}/${asset.name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok)
    throw new Error(`Official Vina download failed (HTTP ${response.status}).`);
  const host = new URL(response.url).hostname;
  if (
    ![
      "github.com",
      "release-assets.githubusercontent.com",
      "objects.githubusercontent.com",
    ].includes(host)
  )
    throw new Error("The release download redirected to an unexpected host.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20_000_000)
      throw new Error("The Vina release exceeded the download size limit.");
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  if (digest(data) !== asset.sha256)
    throw new Error(
      "Vina release SHA-256 differs from the project pin. No executable was installed.",
    );
  const temporary = `${binary}.${randomUUID()}.download`;
  try {
    await writeFile(temporary, data, { mode: 0o700, flag: "wx" });
    await rename(temporary, binary);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
await chmod(binary, 0o700);
const status = await dockingRuntime();
if (!status.available) throw new Error(status.reason);
await writeFile(
  path.join(directory, "installation.json"),
  JSON.stringify(
    {
      engine: status.engine,
      version: status.version,
      platform,
      source: `${VINA_RELEASE.repository}/releases/tag/${VINA_RELEASE.tag}`,
      asset: asset.name,
      sha256: asset.sha256,
      checksumProvenance:
        "Measured from the official release asset over HTTPS; upstream release metadata supplies no independent digest.",
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  `AutoDock Vina ${status.version} is ready (${platform}). Project-local install only; no global packages or shell settings changed.`,
);
