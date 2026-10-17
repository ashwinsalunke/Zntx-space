import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  dockingBinaryPath,
  parseVinaEnergies,
  VINA_RELEASE,
} from "../server/docking-runtime.js";

test("Vina pose results preserve ranked energies and RMSD bounds, without scraping other numeric log lines", () => {
  const poses =
    "MODEL 1\nREMARK VINA RESULT:   -13.237   0.000   0.000\nATOM 1 1 1\nENDMDL\nMODEL 2\nREMARK VINA RESULT:   -11.229   3.018  12.424\nENDMDL\n";
  assert.deepEqual(parseVinaEnergies(poses), [
    { mode: 1, affinity: -13.237, rmsdLower: 0, rmsdUpper: 0 },
    { mode: 2, affinity: -11.229, rmsdLower: 3.018, rmsdUpper: 12.424 },
  ]);
  assert.deepEqual(
    parseVinaEnergies(
      "1 -99.5 0 0\nREMARK VINA RESULT: NaN 0 0\nREMARK VINA RESULT: -10 Infinity 2\n",
    ),
    [],
  );
});

test("Vina installer chooses only explicitly pinned project-local platform assets", () => {
  assert.match(
    dockingBinaryPath({ platform: "darwin", arch: "arm64" }),
    /[\\/]\.tools[\\/]vina[\\/]vina_1\.2\.7_mac_aarch64$/,
  );
  assert.match(
    dockingBinaryPath({ platform: "linux", arch: "x64" }),
    /vina_1\.2\.7_linux_x86_64$/,
  );
  assert.equal(dockingBinaryPath({ platform: "unknown", arch: "arm64" }), null);
  for (const asset of Object.values(VINA_RELEASE.assets))
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
});

test("official prepared tutorial inputs retain their documented source digests and binding box", async () => {
  const expected = {
    "1iep_receptor.pdbqt":
      "f13cf3b36f61d87c3b58983e0b8ecf1c3456a685eb86dfe9ccfb139c7bdc2586",
    "1iep_ligand.pdbqt":
      "15fb35648d8c18c70317842f3a0631b73a19429c710a037ab07310084d579bb8",
    "1iep_receptor.box.txt":
      "3dff08200b5b9c2ca0932c832c9dffc5823b39caec6c92f76be5f7c5ea49d8de",
  };
  for (const [name, digest] of Object.entries(expected)) {
    const contents = await readFile(
      new URL(`../fixtures/docking/${name}`, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      digest,
      name,
    );
  }
});
