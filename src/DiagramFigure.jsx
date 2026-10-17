import React, { useId, useMemo, useRef, useState } from "react";
import { Download, Maximize, ZoomIn, ZoomOut, Expand, X } from "lucide-react";
import ScientificGlyph from "./ScientificGlyph.jsx";
import { symbolFor } from "./diagram-symbols.js";
import { layoutDiagram, wrapLabel } from "./diagram-layout.js";
import "./diagram-figure.css";
const themes = [
  ["#edf5ee", "#397342"],
  ["#edf3fb", "#356fa5"],
  ["#f6effb", "#8055a5"],
  ["#fff6df", "#967022"],
];
export function DiagramSvg({
  diagram,
  direction = "LR",
  svgRef,
  markerId = "diagram-arrow",
  illustrated = true,
}) {
  const graph = useMemo(
    () => layoutDiagram(diagram, direction, illustrated),
    [diagram, direction, illustrated],
  );
  const titleLines = wrapLabel(
    diagram.title,
    Math.max(18, Math.floor((graph.width - 70) / 15)),
  );
  const header = 45 + titleLines.length * 29;
  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${graph.width} ${graph.height + header + 38}`}
      width={graph.width}
      height={graph.height + header + 38}
      role="img"
      aria-label={diagram.title}
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <title>{diagram.title}</title>
      <desc>
        {diagram.edges
          .map(
            (e) =>
              `${diagram.nodes.find((n) => n.id === e.from)?.label} → ${diagram.nodes.find((n) => n.id === e.to)?.label}: ${e.label || ""}`,
          )
          .join(". ")}
      </desc>
      <rect width="100%" height="100%" fill="#ffffff" rx="14" />
      <defs>
        <marker
          id={markerId}
          markerWidth="9"
          markerHeight="9"
          refX="8"
          refY="4.5"
          orient="auto"
        >
          <path d="M0,0 L9,4.5 L0,9 Z" fill="#587263" />
        </marker>
      </defs>
      {titleLines.map((line, i) => (
        <text
          key={i}
          x="35"
          y={39 + i * 29}
          fontSize="24"
          fontWeight="700"
          fill="#17191d"
        >
          {line}
        </text>
      ))}
      <g transform={`translate(0 ${header})`}>
        {graph.edges.map((edge, i) => (
          <g key={i}>
            <path
              d={edge.points
                .map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`)
                .join(" ")}
              fill="none"
              stroke="#587263"
              strokeWidth="2.2"
              strokeLinejoin="round"
              markerEnd={`url(#${markerId})`}
            />
            {edge.lines.length > 0 && (
              <g>
                <rect
                  x={edge.x - 76}
                  y={edge.y - edge.height / 2}
                  width="152"
                  height={edge.height}
                  rx="5"
                  fill="#fff"
                  stroke="#e5e9e6"
                />
                {edge.lines.map((line, j) => (
                  <text
                    key={j}
                    x={edge.x}
                    y={edge.y - (edge.lines.length - 1) * 9 + j * 18 + 5}
                    fontSize="13"
                    textAnchor="middle"
                    fill="#3a4d40"
                  >
                    {line}
                  </text>
                ))}
              </g>
            )}
          </g>
        ))}
        {graph.nodes.map((node, i) => {
          const [fill, ink] = themes[i % themes.length];
          const Icon = symbolFor(node.label);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x - node.width / 2} ${node.y - node.height / 2})`}
            >
              <rect
                width={node.width}
                height={node.height}
                rx="15"
                fill={fill}
                stroke={ink}
                strokeOpacity=".5"
              />
              <circle cx="29" cy="29" r="15" fill={ink} />
              <text
                x="29"
                y="34"
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#fff"
              >
                {i + 1}
              </text>
              {illustrated ? (
                <ScientificGlyph
                  label={node.label}
                  x={46}
                  y={43}
                  width={148}
                  height={94}
                />
              ) : (
                <Icon
                  x={node.width - 51}
                  y="15"
                  width="34"
                  height="34"
                  color={ink}
                  strokeWidth="1.6"
                />
              )}
              {node.lines.map((line, j) => (
                <text
                  key={j}
                  x="18"
                  y={(illustrated ? 160 : 72) + j * 23}
                  fill="#17251d"
                  fontSize="18"
                  fontWeight="600"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </g>
      <text x="35" y={graph.height + header + 18} fill="#68716b" fontSize="12">
        scrapeTx · AI-generated; verify sources
      </text>
    </svg>
  );
}
export default function DiagramFigure({ diagram }) {
  const dialog = useRef();
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(),
    id = useId().replace(/[^a-z0-9]/gi, ""),
    [direction, setDirection] = useState("LR"),
    [illustrated, setIllustrated] = useState(true),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const filename =
    diagram.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 80) ||
    "research-diagram";
  function save(blob, extension) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + "." + extension;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportImage(format) {
    setBusy(true);
    setError("");
    let url;
    try {
      const svg = new XMLSerializer().serializeToString(ref.current);
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      if (format === "svg") {
        save(blob, "svg");
        return;
      }
      url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(Error("Unable to render PNG. Download SVG instead."));
        img.src = url;
      });
      const box = ref.current.viewBox.baseVal;
      const scale = Math.min(
        2,
        8000 / Math.max(box.width, box.height),
        Math.sqrt(24000000 / (box.width * box.height)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(box.width * scale);
      canvas.height = Math.ceil(box.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!png) throw Error("Image export failed. Try SVG.");
      save(png, "png");
    } catch (e) {
      setError(e.message);
    } finally {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  return (
    <section className="diagram-figure" aria-label="Generated diagram">
      <div className="diagram-toolbar">
        <label>
          Layout{" "}
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setZoom(1);
            }}
          >
            <option value="LR">Left to right</option>
            <option value="TB">Top to bottom</option>
          </select>
        </label>
        <div>
          <label className="diagram-style">
            <input
              type="checkbox"
              checked={illustrated}
              onChange={(e) => setIllustrated(e.target.checked)}
            />
            Illustrations
          </label>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <ZoomOut size={17} />
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            <Maximize size={15} /> Fit
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          >
            <ZoomIn size={17} />
          </button>
          <button
            type="button"
            onClick={() => {
              setExpanded(true);
              dialog.current.showModal();
            }}
          >
            <Expand size={16} /> Open image
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => exportImage("svg")}
          >
            SVG
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => exportImage("png")}
          >
            <Download size={16} />
            {busy ? "Exporting…" : "Download PNG"}
          </button>
        </div>
      </div>
      <div
        className="diagram-scroll"
        tabIndex="0"
        aria-label="Diagram canvas; scroll to explore"
      >
        <div
          style={{
            width: `${zoom * 100}%`,
            minWidth: zoom > 1 ? `${zoom * 100}%` : undefined,
          }}
        >
          <DiagramSvg
            diagram={diagram}
            direction={direction}
            illustrated={illustrated}
            svgRef={ref}
            markerId={"arrow-" + id}
          />
        </div>
      </div>
      <dialog
        className="diagram-image-dialog"
        ref={dialog}
        onClose={() => setExpanded(false)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <header>
          <strong>{filename}.svg</strong>
          <div>
            <button
              type="button"
              onClick={() => exportImage("png")}
              disabled={busy}
            >
              <Download size={16} />
              Download PNG
            </button>
            <button
              type="button"
              aria-label="Close image preview"
              onClick={() => dialog.current.close()}
            >
              <X size={20} />
            </button>
          </div>
        </header>
        {expanded && (
          <div className="diagram-expanded-canvas">
            <DiagramSvg
              diagram={diagram}
              direction={direction}
              illustrated={illustrated}
              markerId={"expanded-" + id}
            />
          </div>
        )}
      </dialog>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Read diagram as text</summary>
        <ol>
          {diagram.edges.map((e, i) => (
            <li key={i}>
              {diagram.nodes.find((n) => n.id === e.from)?.label} →{" "}
              {diagram.nodes.find((n) => n.id === e.to)?.label}
              {e.label ? " — " + e.label : ""}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
