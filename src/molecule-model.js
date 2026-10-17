// Poses are separate MODEL records; keep the chosen pose independent of receptor coordinates.
export function dockingPose(text, mode) {
  const models = String(text || "").match(/\bMODEL\s+\d+[\s\S]*?\bENDMDL\b/g);
  return models?.length
    ? models[Math.max(0, Math.min(models.length - 1, mode - 1))]
    : text;
}

// GLModel exposes setStyle(selection, style, additive), unlike GLViewer.addStyle.
export function styleReceptor(protein) {
  protein.setStyle({}, { cartoon: { color: "#a5b6ac", opacity: 0.85 } });
  protein.setStyle({ hetflag: true }, { stick: { radius: 0.12, colorscheme: "grayCarbon" } }, true);
}
