import React from "react";
import { symbolFor } from "./diagram-symbols.js";
// Code-native illustrations remain editable and export sharply with the diagram.
export default function ScientificGlyph({
  label,
  x = 0,
  y = 0,
  width = 140,
  height = 92,
}) {
  const value = String(label || "");
  let drawing;
  const atom = (cx, cy, r, color, key) => (
    <g key={key}>
      <circle cx={cx + 1} cy={cy + 3} r={r} fill="#000" opacity=".08" />
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle
        cx={cx - r * 0.28}
        cy={cy - r * 0.3}
        r={r * 0.26}
        fill="#fff"
        opacity=".55"
      />
    </g>
  );
  const molecule = (cx, cy, kind, key) => (
    <g key={key} transform={`translate(${cx} ${cy})`}>
      <path
        d={kind === "water" ? "M-17,-9 L0,0 L17,-9" : "M-22,0 L22,0"}
        stroke="#9ca5ac"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {kind === "water" ? (
        <>
          {atom(0, 0, 12, "#cf4d4d", "o")}
          {atom(-17, -9, 8, "#ecf0f2", "h1")}
          {atom(17, -9, 8, "#ecf0f2", "h2")}
        </>
      ) : (
        <>
          {atom(-22, 0, 11, "#cf4d4d", "o1")}
          {atom(0, 0, 12, "#4b535d", "c")}
          {atom(22, 0, 11, "#cf4d4d", "o2")}
        </>
      )}
    </g>
  );
  if (/chloroplast|thylakoid|light[- ]dependent|light reactions/i.test(value)) {
    drawing = (
      <>
        <ellipse
          cx="80"
          cy="50"
          rx="67"
          ry="37"
          fill="#dcecc6"
          stroke="#629152"
          strokeWidth="2"
        />
        <ellipse
          cx="80"
          cy="50"
          rx="60"
          ry="30"
          fill="#e8f2d8"
          stroke="#9eb981"
        />
        {[45, 80, 113].map((cx, i) => (
          <g key={cx}>
            {[0, 1, 2, 3].map((j) => (
              <g key={j}>
                <path
                  d={`M${cx - 15} ${58 - j * 7}v5c0 8 30 8 30 0v-5`}
                  fill="#679d3d"
                  stroke="#3c742d"
                />
                <ellipse
                  cx={cx}
                  cy={58 - j * 7}
                  rx="15"
                  ry="5"
                  fill="#97be58"
                  stroke="#4c812c"
                />
              </g>
            ))}
          </g>
        ))}
        <path
          d="M20 8l10 12-10 2 12 15"
          fill="none"
          stroke="#e7ba3d"
          strokeWidth="4"
        />
      </>
    );
  } else if (/sun|solar|photon|light energy/i.test(value)) {
    drawing = (
      <>
        <g stroke="#e8b52e" strokeWidth="3">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            return (
              <path
                key={i}
                d={`M${58 + 27 * Math.cos(a)},${44 + 27 * Math.sin(a)} L${58 + 36 * Math.cos(a)},${44 + 36 * Math.sin(a)}`}
              />
            );
          })}
        </g>
        <circle
          cx="58"
          cy="44"
          r="22"
          fill="#f5d462"
          stroke="#dfb229"
          strokeWidth="2"
        />
        <path
          d="M96 30l10-5 5 10 10-5 5 10 10-5M94 53l10-5 5 10 10-5 5 10 10-5"
          fill="none"
          stroke="#e5bd3a"
          strokeWidth="3"
        />
      </>
    );
  } else if (/water|h2o|h₂o/i.test(value)) {
    drawing = (
      <>
        {molecule(54, 39, "water", "m1")}
        {molecule(110, 65, "water", "m2")}
        <path d="M23 67q-14 18 0 18t0-18" fill="#83bde6" stroke="#4589b7" />
      </>
    );
  } else if (/carbon dioxide|co2|co₂/i.test(value)) {
    drawing = (
      <>
        {molecule(54, 32, "co2", "m1")}
        {molecule(108, 69, "co2", "m2")}
      </>
    );
  } else if (/oxygen|o2|o₂/i.test(value)) {
    drawing = (
      <>
        {[40, 108].map((cx, i) => (
          <g key={cx} transform={`translate(${cx} ${i ? 62 : 33})`}>
            <path d="M-9 0H9" stroke="#a63636" strokeWidth="9" />
            {atom(-9, 0, 14, "#d65353", "a")}
            {atom(9, 0, 14, "#d65353", "b")}
          </g>
        ))}
      </>
    );
  } else if (/calvin|carbon fixation|regeneration|cycle/i.test(value)) {
    drawing = (
      <>
        <path
          d="M79 15a32 32 0 0 1 30 50M110 65a32 32 0 0 1-60-1M50 64a32 32 0 0 1 29-49"
          fill="none"
          stroke="#4f8752"
          strokeWidth="4"
        />
        <path
          d="M106 54l5 14 10-9M60 66l-12-3-2 13M73 9l10 6-7 11"
          fill="none"
          stroke="#4f8752"
          strokeWidth="3"
        />
        <circle cx="80" cy="46" r="15" fill="#e0edd7" />
        <text
          x="80"
          y="51"
          textAnchor="middle"
          fill="#356437"
          fontSize="13"
          fontWeight="700"
        >
          C
        </text>
      </>
    );
  } else if (/glucose|sugar|carbohydrate|c6h12o6|g3p/i.test(value)) {
    drawing = (
      <>
        <path
          d="M80 13l34 20v39L80 91 46 72V33Z"
          fill="#91b955"
          stroke="#4b802f"
          strokeWidth="2"
        />
        <path
          d="M80 13v39l34-19M80 52L46 33M80 52v39"
          fill="none"
          stroke="#c5dfa1"
          strokeWidth="2"
        />
        <text
          x="80"
          y="58"
          textAnchor="middle"
          fontWeight="700"
          fontSize="18"
          fill="#fff"
        >
          {/g3p/i.test(value)
            ? "C₃"
            : /glucose|c6h12o6/i.test(value)
              ? "C₆"
              : "C"}
        </text>
      </>
    );
  } else if (/atp|nadph|electron|energy carrier/i.test(value)) {
    drawing = (
      <>
        <rect
          x="23"
          y="20"
          width="70"
          height="26"
          rx="8"
          fill="#eee2f6"
          stroke="#9366b0"
        />
        <text
          x="58"
          y="38"
          textAnchor="middle"
          fontWeight="700"
          fontSize="15"
          fill="#774392"
        >
          ATP
        </text>
        <rect
          x="65"
          y="56"
          width="76"
          height="26"
          rx="8"
          fill="#eee2f6"
          stroke="#9366b0"
        />
        <text
          x="103"
          y="74"
          textAnchor="middle"
          fontWeight="700"
          fontSize="14"
          fill="#774392"
        >
          NADPH
        </text>
        <path
          d="M110 17l-9 17 12-1-9 19"
          fill="none"
          stroke="#b79237"
          strokeWidth="3"
        />
      </>
    );
  } else if (/leaf|plant|photosynth/i.test(value)) {
    drawing = (
      <>
        <path
          d="M80 89V46M80 62Q30 66 32 18q49 0 48 44M80 48q42 0 46-35-40-3-46 35"
          fill="#8bb56c"
          stroke="#4f7944"
          strokeWidth="2"
        />
        <path
          d="M80 61L41 28M80 48l36-26"
          stroke="#527c46"
          fill="none"
          strokeWidth="2"
        />
        <path d="M65 91q15-11 30 0" fill="#9b7656" />
      </>
    );
  } else {
    const Icon = symbolFor(value);
    drawing = (
      <>
        <circle cx="80" cy="49" r="34" fill="#eaf0eb" />
        <Icon
          x="58"
          y="27"
          width="44"
          height="44"
          stroke="#587968"
          strokeWidth="1.5"
        />
      </>
    );
  }
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox="0 0 160 104"
      aria-hidden="true"
    >
      {drawing}
    </svg>
  );
}
