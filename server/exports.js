import express from "express";
import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import pptxgen from "pptxgenjs";
import { imageSize } from "image-size";

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  tex: "application/x-tex; charset=utf-8",
  html: "text/html; charset=utf-8",
};
const clean = (text) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g, "");
const html = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const latex = (text) =>
  String(text).replace(
    /[\\{}%$&#_^~]/g,
    (char) =>
      ({
        "\\": "\\textbackslash{}",
        "{": "\\{",
        "}": "\\}",
        "%": "\\%",
        $: "\\$",
        "&": "\\&",
        "#": "\\#",
        _: "\\_",
        "^": "\\textasciicircum{}",
        "~": "\\textasciitilde{}",
      })[char],
  );

class ExportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function field(value, label, limit, optional = false) {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    (!optional && !value.trim())
  )
    throw new ExportError(
      `${label} must be ${optional ? "a" : "a nonempty"} string of at most ${limit} characters.`,
    );
  return clean(value).trim();
}
const filename = (title, extension) =>
  `${
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 100) || "zntx-research"
  }.${extension}`;

// A deliberately small, non-executing Markdown subset: no HTML, remote assets,
// template evaluation, embedded objects, or external URL retrieval.
export function parseMarkdown(content) {
  const lines = clean(content).split("\n");
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]))
        code.push(lines[i]);
      blocks.push({ type: "code", text: code.join("\n") });
    } else if (/^#{1,6}\s/.test(line)) {
      flush();
      const [, hashes, text] = /^(#{1,6})\s+(.*)$/.exec(line);
      blocks.push({ type: "heading", level: hashes.length, text });
    } else if (/^\s*([-*+]\s+|\d+[.)]\s+)/.test(line)) {
      flush();
      const [, indent, marker, text] = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(
        line,
      );
      blocks.push({
        type: /^\d/.test(marker) ? "ordered" : "bullet",
        text,
        level: Math.min(5, Math.floor(indent.length / 2)),
        number: /^\d/.test(marker) ? marker.replace(/[.)]/, "") : null,
      });
    } else if (/^>\s?/.test(line)) {
      flush();
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
    } else if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      flush();
      const cells = (row) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim());
      const rows = [cells(line)];
      i += 1;
      while (
        i + 1 < lines.length &&
        lines[i + 1].includes("|") &&
        lines[i + 1].trim()
      )
        rows.push(cells(lines[++i]));
      if (rows.length > 300 || rows.some((row) => row.length > 20))
        throw new ExportError(
          "Markdown tables are limited to 300 rows and 20 columns.",
        );
      const width = Math.max(...rows.map((row) => row.length));
      blocks.push({
        type: "table",
        rows: rows.map((row) => [
          ...row,
          ...Array(width - row.length).fill(""),
        ]),
      });
    } else if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

function inlineParts(text) {
  const tokens = String(text).split(
    /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/g,
  );
  return tokens.filter(Boolean).map((part) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return { text: part.slice(2, -2), bold: true };
    if (part.startsWith("*") && part.endsWith("*"))
      return { text: part.slice(1, -1), italic: true };
    if (part.startsWith("`") && part.endsWith("`"))
      return { text: part.slice(1, -1), code: true };
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return { text: link ? `${link[1]} (${link[2]})` : part };
  });
}
const inlinePlain = (text) =>
  inlineParts(text)
    .map((part) => part.text)
    .join("");

function renderHtml(title, blocks) {
  const inline = (text) =>
    inlineParts(text)
      .map(
        (part) =>
          `${part.bold ? "<strong>" : part.italic ? "<em>" : part.code ? "<code>" : ""}${html(part.text).replace(/\n/g, "<br>")}${part.bold ? "</strong>" : part.italic ? "</em>" : part.code ? "</code>" : ""}`,
      )
      .join("");
  const body = blocks
    .map((block) => {
      if (block.type === "heading")
        return `<h${block.level}>${inline(block.text)}</h${block.level}>`;
      if (block.type === "bullet" || block.type === "ordered") {
        const tag = block.type === "bullet" ? "ul" : "ol";
        return `<${tag}${block.type === "ordered" ? ` start="${Number(block.number)}"` : ""}><li>${inline(block.text)}</li></${tag}>`;
      }
      if (block.type === "quote")
        return `<blockquote>${inline(block.text)}</blockquote>`;
      if (block.type === "code")
        return `<pre><code>${html(block.text)}</code></pre>`;
      if (block.type === "rule") return "<hr>";
      if (block.type === "table")
        return `<table>${block.rows.map((row, index) => `<tr>${row.map((cell) => `<${index ? "td" : "th"}>${inline(cell)}</${index ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`;
      return `<p>${inline(block.text)}</p>`;
    })
    .join("\n");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(title)}</title><style>body{font:17px/1.75 Georgia,serif;color:#171717;background:#fff;max-width:800px;padding:48px 28px;margin:auto}h1,h2,h3,h4,h5,h6{font-family:Arial,sans-serif;line-height:1.3;color:#000}h1{font-size:30px}pre,code{font-family:monospace;white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin-left:0;padding-left:20px;border-left:3px solid #ddd}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:left}p,li,td,th{overflow-wrap:anywhere}@media print{body{padding:0}}</style></head><body><h1>${html(title)}</h1>\n${body}\n</body></html>`;
}

function renderLatex(title, blocks) {
  const inline = (text) =>
    inlineParts(text)
      .map(
        (part) =>
          `${part.bold ? "\\textbf{" : part.italic ? "\\emph{" : part.code ? "\\texttt{" : ""}${latex(part.text).replace(/\n/g, " ")}${part.bold || part.italic || part.code ? "}" : ""}`,
      )
      .join("");
  const commands = [
    "section",
    "subsection",
    "subsubsection",
    "paragraph",
    "subparagraph",
    "subparagraph",
  ];
  const body = blocks
    .map((block) => {
      if (block.type === "heading")
        return `\\${commands[block.level - 1]}*{${inline(block.text)}}`;
      if (block.type === "bullet" || block.type === "ordered")
        return `\\begin{${block.type === "bullet" ? "itemize" : "enumerate"}}\n\\item ${inline(block.text)}\n\\end{${block.type === "bullet" ? "itemize" : "enumerate"}}`;
      if (block.type === "quote")
        return `\\begin{quote}${inline(block.text)}\\end{quote}`;
      if (block.type === "code")
        return `\\begin{quote}\\ttfamily\n${block.text
          .split("\n")
          .map((line) => latex(line))
          .join("\\\\\n")}\n\\end{quote}`;
      if (block.type === "rule")
        return "\\par\\noindent\\rule{\\linewidth}{0.4pt}";
      if (block.type === "table") {
        const columns = Array(block.rows[0].length)
          .fill(
            `p{\\dimexpr\\textwidth/${block.rows[0].length}-2\\tabcolsep\\relax}`,
          )
          .join("");
        return `\\begin{longtable}{${columns}}\n${block.rows.map((row, index) => `${row.map((cell) => (index ? inline(cell) : `\\textbf{${inline(cell)}}`)).join(" & ")} \\\\${index ? "" : " \\hline"}`).join("\n")}\n\\end{longtable}`;
      }
      return inline(block.text);
    })
    .join("\n\n");
  return `% Compile with XeLaTeX or LuaLaTeX for Unicode research text.\n\\documentclass[12pt]{article}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{fontspec}\n\\usepackage{longtable}\n\\setmainfont{TeX Gyre Termes}\n\\title{${latex(title)}}\n\\author{}\n\\date{}\n\\begin{document}\n\\maketitle\n${body}\n\\end{document}\n`;
}

async function renderDocx(title, blocks) {
  const runs = (text, extra = {}) =>
    inlineParts(text).flatMap((part) =>
      part.text.split("\n").flatMap((line, index) => {
        const pieces = line.split(/(https?:\/\/[^\s<>]+)/g).filter(Boolean);
        return pieces.flatMap((piece, pieceIndex) => {
          const format = {
            bold: part.bold,
            italics: part.italic,
            font: part.code ? "Courier New" : undefined,
            ...(index && !pieceIndex ? { break: 1 } : {}),
            ...extra,
          };
          let candidate = piece.replace(/[.,;]*$/, "");
          while (
            candidate.endsWith(")") &&
            (candidate.match(/\)/g) || []).length >
              (candidate.match(/\(/g) || []).length
          )
            candidate = candidate.slice(0, -1);
          let link;
          try {
            const url = new URL(candidate);
            if (
              ["http:", "https:"].includes(url.protocol) &&
              !url.username &&
              !url.password
            )
              link = url.href;
          } catch {
            /* Keep ordinary text unchanged. */
          }
          return link
            ? [
                new ExternalHyperlink({
                  link,
                  children: [
                    new TextRun({
                      ...format,
                      text: candidate,
                      style: "Hyperlink",
                    }),
                  ],
                }),
                ...(piece.length > candidate.length
                  ? [
                      new TextRun({
                        text: piece.slice(candidate.length),
                        ...extra,
                      }),
                    ]
                  : []),
              ]
            : [new TextRun({ text: piece, ...format })];
        });
      }),
    );
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];
  for (const block of blocks) {
    if (block.type === "table") {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, index) =>
              new TableRow({
                tableHeader: index === 0,
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: runs(
                            cell,
                            index === 0 ? { bold: true } : {},
                          ),
                          spacing: { after: 80 },
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
    } else if (block.type === "rule")
      children.push(
        new Paragraph({
          text: "────────────────────────",
          spacing: { after: 120 },
        }),
      );
    else if (block.type === "heading")
      children.push(
        new Paragraph({
          children: runs(block.text),
          heading: HeadingLevel[`HEADING_${block.level}`],
        }),
      );
    else if (block.type === "code")
      children.push(
        new Paragraph({
          children: block.text.split("\n").map(
            (line, index) =>
              new TextRun({
                text: line,
                font: "Courier New",
                size: 20,
                ...(index ? { break: 1 } : {}),
              }),
          ),
          spacing: { after: 160 },
        }),
      );
    else
      children.push(
        new Paragraph({
          children: [
            ...(block.type === "ordered"
              ? [new TextRun(`${block.number}. `)]
              : []),
            ...runs(block.text),
          ],
          ...(block.type === "bullet"
            ? { bullet: { level: block.level } }
            : {}),
          ...(block.type === "quote"
            ? { indent: { left: 480 }, style: "Quote" }
            : {}),
          spacing: { after: 160, line: 300 },
        }),
      );
  }
  return Packer.toBuffer(
    new Document({
      creator: "scrapeTx",
      title,
      description: "Research document exported from scrapeTx",
      styles: {
        default: {
          document: {
            run: { font: "Times New Roman", size: 24 },
            paragraph: { spacing: { after: 160, line: 300 } },
          },
          title: {
            run: { font: "Arial", size: 44, bold: true, color: "000000" },
          },
          heading1: {
            run: { font: "Arial", size: 32, bold: true, color: "000000" },
            paragraph: { spacing: { before: 280, after: 140 }, keepNext: true },
          },
          heading2: {
            run: { font: "Arial", size: 28, bold: true, color: "000000" },
          },
          heading3: {
            run: { font: "Arial", size: 26, bold: true, color: "000000" },
          },
          heading4: { run: { color: "000000" } },
          heading5: { run: { color: "000000" } },
          heading6: { run: { color: "000000" } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          children,
        },
      ],
    }),
  );
}

function wrapLines(text, width = 78) {
  return inlinePlain(text)
    .split("\n")
    .flatMap((line) => {
      if (!line) return [""];
      const lines = [];
      let current = "";
      for (const word of line.split(/\s+/)) {
        if (current && current.length + word.length + 1 > width) {
          lines.push(current);
          current = "";
        }
        // Long DOIs/URLs remain intact as text; PPTX shrink-to-fit handles them.
        current += `${current ? " " : ""}${word}`;
      }
      if (current) lines.push(current);
      return lines;
    });
}

// Preserve a source entry or bullet across pages/columns whenever it fits.
// Only a single overlong entry may continue onto the next page.
function slideColumns(content, width, maximum = 13) {
  const columns = [];
  let current = [];
  const flush = () => {
    while (current.at(-1) === "") current.pop();
    if (current.length) columns.push(current.join("\n"));
    current = [];
  };
  for (const paragraph of content.split(/\n\s*\n/)) {
    const paragraphLines = wrapLines(paragraph, width);
    if (paragraphLines.length <= maximum) {
      if (
        current.length + paragraphLines.length + (current.length ? 1 : 0) >
        maximum
      )
        flush();
      if (current.length) current.push("");
      current.push(...paragraphLines);
      continue;
    }
    // Treat each original line as a point, so a wrapped bullet stays together.
    for (const point of paragraph.split("\n")) {
      const pointLines = wrapLines(point, width);
      if (
        pointLines.length <= maximum &&
        current.length + pointLines.length > maximum
      )
        flush();
      for (const line of pointLines) {
        if (current.length >= maximum) flush();
        current.push(line);
      }
    }
  }
  flush();
  return columns.length ? columns : [""];
}

function slideTextRuns(text) {
  const runs = [];
  let offset = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"{}]+/g)) {
    const value = match[0].replace(/[.,;!?]+$/, "");
    let url;
    try {
      url = new URL(value);
      if (url.username || url.password) continue;
    } catch {
      continue;
    }
    if (match.index > offset)
      runs.push({ text: text.slice(offset, match.index) });
    runs.push({
      text: value,
      options: {
        hyperlink: { url: url.href },
        color: "355DAB",
        underline: true,
      },
    });
    offset = match.index + value.length;
  }
  if (offset < text.length) runs.push({ text: text.slice(offset) });
  return runs.length ? runs : text;
}

async function renderSlides(title, slides, theme = "neutral") {
  const deck = new pptxgen();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "scrapeTx";
  deck.subject = "Research presentation";
  deck.title = title;
  deck.company = "scrapeTx";
  deck.lang = "en-US";
  deck.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "en-US" };
  let slideNumber = 0;
  for (const item of slides) {
    const twoColumn = item.layout === "two-column" && !item.imageData;
    const columns = slideColumns(
      item.content,
      item.imageData || twoColumn ? 40 : 78,
    );
    const chunks = [];
    for (let i = 0; i < columns.length; i += twoColumn ? 2 : 1)
      chunks.push(twoColumn ? columns.slice(i, i + 2) : [columns[i]]);
    for (let i = 0; i < chunks.length; i += 1) {
      slideNumber += 1;
      if (slideNumber > 160)
        throw new ExportError(
          "This content needs more than 160 slides. Shorten the presentation.",
        );
      const slide = deck.addSlide();
      slide.background = {
        color:
          theme === "scrapetx"
            ? item.layout === "title"
              ? "EAF0E1"
              : "F1F0EC"
            : "FAFAF9",
      };
      if (theme === "scrapetx")
        slide.addShape(deck.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 0.12,
          h: 7.5,
          fill: { color: "718779" },
          line: { color: "718779" },
        });
      slide.addText(i ? `${item.title} · continued ${i + 1}` : item.title, {
        x: 0.65,
        y: item.layout === "title" ? 1.2 : 0.5,
        w: 12,
        h: 1.15,
        fontSize: item.layout === "title" ? 36 : 28,
        bold: true,
        color: "171717",
        margin: 0,
        breakLine: false,
        valign: "mid",
        fit: "shrink",
      });
      const bodyOptions = {
        x: 0.7,
        y: item.layout === "title" ? 2.8 : 1.95,
        w: 11.9,
        h: item.layout === "title" ? 3.7 : 4.7,
        fontSize: 20,
        color: "292524",
        margin: 0,
        valign: "top",
        fit: "shrink",
        paraSpaceAfterPt: 8,
        breakLine: false,
      };
      if (item.imageData) {
        const ratio = item.imageWidth / item.imageHeight;
        const imageHeight = Math.min(4.3, 5.9 / ratio);
        const imageWidth = imageHeight * ratio;
        slide.addText(slideTextRuns(chunks[i][0]), {
          ...bodyOptions,
          w: 5.4,
          h: 4.4,
        });
        slide.addImage({
          data: item.imageData,
          x: 6.7 + (5.9 - imageWidth) / 2,
          y: 1.95 + (4.3 - imageHeight) / 2,
          w: imageWidth,
          h: imageHeight,
          altText: item.imageAlt || "AI-generated research illustration",
        });
        slide.addText("AI-generated illustration · Review scientific details", {
          x: 6.7,
          y: 6.4,
          w: 5.9,
          h: 0.25,
          fontSize: 10,
          color: "666666",
          margin: 0,
        });
      } else if (twoColumn) {
        const first = chunks[i][0],
          second = chunks[i][1];
        if (second) {
          slide.addText(slideTextRuns(first), { ...bodyOptions, w: 5.6 });
          slide.addText(slideTextRuns(second), {
            ...bodyOptions,
            x: 7.0,
            w: 5.6,
          });
        } else {
          // A short slide needs no artificial mid-sentence column break.
          slide.addText(slideTextRuns(first), bodyOptions);
        }
      } else slide.addText(slideTextRuns(chunks[i][0]), bodyOptions);
      slide.addText("SCRAPETX  /  RESEARCH", {
        x: 0.7,
        y: 7.03,
        w: 8.5,
        h: 0.18,
        fontSize: 8,
        color: "57534E",
        margin: 0,
      });
      slide.addText(String(slideNumber).padStart(2, "0"), {
        x: 11.8,
        y: 7.0,
        w: 0.8,
        h: 0.23,
        align: "right",
        fontSize: 10,
        color: "57534E",
        margin: 0,
      });
      slide.addNotes(
        item.notes || `${title}\n\n${item.title}\n\n${item.content}`,
      );
    }
  }
  return deck.write({ outputType: "nodebuffer", compression: true });
}

function sendFile(res, buffer, title, format) {
  res.set({
    "Content-Type": MIME[format],
    "Content-Disposition": `attachment; filename="${filename(title, format)}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.send(buffer);
}

export function createExportRouter({ loadImage } = {}) {
  const router = express.Router();
  router.use(express.json({ limit: "260kb" }));
  let active = 0;
  const limit = (req, res, next) => {
    if (active >= 3)
      return res
        .status(429)
        .json({ error: "The export service is busy. Please retry shortly." });
    active += 1;
    let released = false;
    const release = () => {
      if (!released) {
        active -= 1;
        released = true;
      }
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
  router.post("/document", limit, async (req, res, next) => {
    try {
      const title = field(req.body?.title, "title", 200);
      const content = field(req.body?.content, "content", 200000);
      const format = req.body?.format;
      if (!["docx", "tex", "html"].includes(format))
        throw new ExportError("format must be docx, tex, or html.");
      const blocks = parseMarkdown(content);
      const output =
        format === "docx"
          ? await renderDocx(title, blocks)
          : format === "tex"
            ? renderLatex(title, blocks)
            : renderHtml(title, blocks);
      sendFile(res, output, title, format);
    } catch (error) {
      next(error);
    }
  });
  router.post("/slides", limit, async (req, res, next) => {
    try {
      const title = field(req.body?.title, "title", 200);
      if (
        !Array.isArray(req.body?.slides) ||
        !req.body.slides.length ||
        req.body.slides.length > 40
      )
        throw new ExportError("slides must contain between 1 and 40 slides.");
      const theme = req.body.theme || "neutral";
      if (!["neutral", "scrapetx"].includes(theme))
        throw new ExportError("Choose a supported presentation theme.");
      const slides = req.body.slides.map((slide, index) => {
        const layout = slide?.layout || "content";
        if (!["title", "content", "two-column"].includes(layout))
          throw new ExportError("Choose a supported slide layout.");
        return {
          title: field(slide?.title, `slides[${index}].title`, 200),
          content: field(
            slide?.content,
            `slides[${index}].content`,
            6000,
            true,
          ),
          notes:
            slide?.notes === undefined
              ? ""
              : field(slide.notes, `slides[${index}].notes`, 6000, true),
          layout,
          imageId:
            slide?.imageId === undefined
              ? ""
              : field(slide.imageId, `slides[${index}].imageId`, 80, true),
        };
      });
      for (const item of slides) {
        if (!item.imageId) continue;
        if (!/^[a-f0-9-]{36}$/i.test(item.imageId) || !loadImage)
          throw new ExportError("Choose an image generated in this workspace.");
        const image = await loadImage(req, item.imageId);
        if (
          !image?.bytes ||
          !["image/png", "image/jpeg", "image/webp"].includes(image.mime)
        )
          throw new ExportError(
            "A slide image is unavailable in this workspace. Remove it or generate a replacement.",
            404,
          );
        item.imageData = `data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}`;
        const dimensions = imageSize(image.bytes);
        item.imageWidth = dimensions.width;
        item.imageHeight = dimensions.height;
        item.imageAlt = image.alt || "AI-generated research illustration";
        item.notes =
          `${item.notes}\n\nIllustration: AI-generated using Cloudflare Workers AI. Not research evidence. ${image.alt || ""}`.trim();
      }
      if (
        slides.reduce(
          (sum, slide) =>
            sum +
            slide.title.length +
            slide.content.length +
            slide.notes.length,
          0,
        ) > 120000
      )
        throw new ExportError(
          "Total slide content must be at most 120,000 characters.",
        );
      sendFile(res, await renderSlides(title, slides, theme), title, "pptx");
    } catch (error) {
      next(error);
    }
  });
  router.use((error, _req, res, _next) => {
    const status =
      error.type === "entity.too.large"
        ? 413
        : error instanceof ExportError
          ? error.status
          : error instanceof SyntaxError && error.status === 400
            ? 400
            : 500;
    res.status(status).json({
      error:
        status === 413
          ? "The export request body is too large."
          : error instanceof ExportError
            ? error.message
            : status === 400
              ? "Send a valid JSON request body."
              : "The document could not be exported. Please try again.",
    });
  });
  return router;
}

export default createExportRouter();
