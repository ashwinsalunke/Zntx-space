# Official AutoDock Vina tutorial inputs

These are unmodified prepared inputs from the CCSB Scripps AutoDock Vina **v1.2.7** basic-docking tutorial. They are a reproducible teaching example, not a research validation set.

- Upstream commit: [`8eb40404f4f45608acb3b01427587ac049f27c1f`](https://github.com/ccsb-scripps/AutoDock-Vina/tree/8eb40404f4f45608acb3b01427587ac049f27c1f/example/basic_docking/solution).
- Protocol: [official basic-docking tutorial](https://autodock-vina.readthedocs.io/en/latest/docking_basic.html).
- Structure: c-Abl kinase with imatinib, [PDB 1IEP](https://www.rcsb.org/structure/1IEP), as prepared by the upstream tutorial authors.
- Files: `1iep_receptor.pdbqt`, `1iep_ligand.pdbqt`, `1iep_receptor.box.txt`.
- Provenance: `https://raw.githubusercontent.com/ccsb-scripps/AutoDock-Vina/v1.2.7/example/basic_docking/solution/<filename>`.
- License: upstream Apache License 2.0, preserved in `LICENSE-AutoDock-Vina.txt`. Preserve this notice and license when redistributing these fixtures.

SHA-256 digests measured from those official HTTPS downloads:

| File | SHA-256 |
| --- | --- |
| `1iep_receptor.pdbqt` | `f13cf3b36f61d87c3b58983e0b8ecf1c3456a685eb86dfe9ccfb139c7bdc2586` |
| `1iep_ligand.pdbqt` | `15fb35648d8c18c70317842f3a0631b73a19429c710a037ab07310084d579bb8` |
| `1iep_receptor.box.txt` | `3dff08200b5b9c2ca0932c832c9dffc5823b39caec6c92f76be5f7c5ea49d8de` |

The box uses a center of `(15.190, 53.903, 16.917)` Å and dimensions `(20, 20, 20)` Å. The sample uses the Vina scoring function; AutoDock4 grid-map files are not needed.

The tutorial asks users of this protocol to cite:

Forli S, Huey R, Pique ME, Sanner MF, Goodsell DS, Olson AJ. Computational protein–ligand docking and virtual drug screening with the AutoDock suite. *Nature Protocols*. 2016;11:905–919. https://doi.org/10.1038/nprot.2016.051
