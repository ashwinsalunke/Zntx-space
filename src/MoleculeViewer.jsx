import React, { useEffect, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

import { dockingPose, styleReceptor } from "./molecule-model.js";
export { dockingPose } from "./molecule-model.js";

export default function MoleculeViewer({ receptor, poses, mode = 1 }) {
  const container = useRef(null),
    viewer = useRef(null);
  const poseRef = useRef(mode);
  poseRef.current = mode;
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false,
      resize;
    setError("");
    setReady(false);
    async function open() {
      try {
        const probe = document.createElement("canvas");
        const probeContext =
          probe.getContext("webgl2") || probe.getContext("webgl");
        if (!probeContext)
          throw new Error(
            "3D preview needs WebGL. Scores and downloadable structures are still available below.",
          );
        probeContext.getExtension("WEBGL_lose_context")?.loseContext();
        const module = await import("3dmol/build/3Dmol.js");
        if (disposed || !container.current) return;
        const library = module.createViewer
          ? module
          : module.default?.createViewer
            ? module.default
            : window.$3Dmol;
        if (!library?.createViewer)
          throw new Error(
            "The local molecular viewer could not be loaded. You can still download the structures.",
          );
        const instance = library.createViewer(container.current, {
          backgroundColor: "#fbfaf8",
          antialias: true,
        });
        viewer.current = instance;
        const protein = instance.addModel(receptor, "pdbqt");
        styleReceptor(protein);
        const ligand = instance.addModel(
          dockingPose(poses, poseRef.current),
          "pdbqt",
        );
        ligand.setStyle(
          {},
          {
            stick: { radius: 0.22, colorscheme: "cyanCarbon" },
            sphere: { scale: 0.22, colorscheme: "cyanCarbon" },
          },
        );
        instance.zoomTo({ model: 1 });
        instance.zoom(0.7);
        instance.render();
        resize = new ResizeObserver(() => {
          if (!disposed) {
            instance.resize();
            instance.render();
          }
        });
        resize.observe(container.current);
        setReady(true);
      } catch (e) {
        if (!disposed)
          setError(
            e.message ||
              "3D preview unavailable. The docking results can still be downloaded.",
          );
      }
    }
    open();
    return () => {
      disposed = true;
      resize?.disconnect();
      const instance = viewer.current;
      instance?.clear();
      // Release the GPU context when this preview is removed. Pose changes reuse it.
      try {
        const canvas = instance?.getCanvas();
        const gl = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* The renderer may already have lost its context. */
      }
      viewer.current = null;
      if (container.current) container.current.replaceChildren();
    };
  }, [receptor, poses]);
  useEffect(() => {
    const instance = viewer.current;
    if (!ready || !instance) return;
    try {
      const previous = instance.getModel(1);
      if (previous) instance.removeModel(previous);
      const ligand = instance.addModel(dockingPose(poses, mode), "pdbqt");
      ligand.setStyle(
        {},
        {
          stick: { radius: 0.22, colorscheme: "cyanCarbon" },
          sphere: { scale: 0.22, colorscheme: "cyanCarbon" },
        },
      );
      instance.render();
    } catch {
      setError(
        "Unable to display this pose. Scores and structure downloads remain available.",
      );
      setReady(false);
    }
  }, [ready, mode, poses]);
  return (
    <div className="docking-viewer">
      <div
        ref={container}
        className="docking-viewer-canvas"
        role="img"
        aria-label={`Three dimensional receptor and predicted ligand pose ${mode}. Use the buttons to zoom or reset the view.`}
      />
      {!ready && (
        <div
          className="docking-viewer-message"
          role={error ? "alert" : "status"}
        >
          {error || "Loading molecular preview…"}
        </div>
      )}
      {ready && (
        <div className="docking-viewer-controls">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => {
              viewer.current?.zoom(1.3);
              viewer.current?.render();
            }}
          >
            <ZoomIn size={17} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => {
              viewer.current?.zoom(0.77);
              viewer.current?.render();
            }}
          >
            <ZoomOut size={17} />
          </button>
          <button
            type="button"
            aria-label="Reset molecular view"
            onClick={() => {
              viewer.current?.zoomTo({ model: 1 });
              viewer.current?.zoom(0.7);
              viewer.current?.render();
            }}
          >
            <RotateCcw size={17} />
          </button>
        </div>
      )}
      <div className="docking-viewer-legend">
        <span>Receptor: sage</span>
        <span>Ligand carbon: cyan; other atoms by element</span>
      </div>
    </div>
  );
}
