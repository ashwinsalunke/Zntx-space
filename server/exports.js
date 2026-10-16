import express from "express";
import {
  Document,
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
      part.text.split("\n").map(
        (line, index) =>
          new TextRun({
            text: line,
            bold: part.bold,
            italics: part.italic,
            font: part.code ? "Courier New" : undefined,
            ...(index ? { break: 1 } : {}),
            ...extra,
          }),
      ),
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
      creator: "Zntx Space",
      title,
      description: "Research document exported from Zntx Space",
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

async function renderSlides(title, slides) {
  const deck = new pptxgen();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "Zntx Space";
  deck.subject = "Research presentation";
  deck.title = title;
  deck.company = "Zntx Space";
  deck.lang = "en-US";
  deck.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "en-US" };
  let slideNumber = 0;
  for (const item of slides) {
    const lines = wrapLines(item.content);
    const chunks = [];
    for (let i = 0; i < lines.length; i += 13)
      chunks.push(lines.slice(i, i + 13).join("\n"));
    if (!chunks.length) chunks.push("");
    for (let i = 0; i < chunks.length; i += 1) {
      slideNumber += 1;
      if (slideNumber > 160)
        throw new ExportError(
          "This content needs more than 160 slides. Shorten the presentation.",
        );
      const slide = deck.addSlide();
      slide.background = { color: "FAFAF9" };
      slide.addText(i ? `${item.title} · continued ${i + 1}` : item.title, {
        x: 0.65,
        y: 0.5,
        w: 12,
        h: 1.15,
        fontSize: 28,
        bold: true,
        color: "171717",
        margin: 0,
        breakLine: false,
        valign: "mid",
        fit: "shrink",
      });
      slide.addText(chunks[i], {
        x: 0.7,
        y: 1.95,
        w: 11.9,
        h: 4.7,
        fontSize: 20,
        color: "292524",
        margin: 0,
        valign: "top",
        fit: "shrink",
        paraSpaceAfterPt: 8,
        breakLine: false,
      });
      slide.addText("ZNTX SPACE  /  RESEARCH", {
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
      slide.addNotes(`${title}\n\n${item.title}\n\n${item.content}`);
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

export function createExportRouter() {
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
      const slides = req.body.slides.map((slide, index) => ({
        title: field(slide?.title, `slides[${index}].title`, 200),
        content: field(slide?.content, `slides[${index}].content`, 6000, true),
      }));
      if (
        slides.reduce(
          (sum, slide) => sum + slide.title.length + slide.content.length,
          0,
        ) > 120000
      )
        throw new ExportError(
          "Total slide content must be at most 120,000 characters.",
        );
      sendFile(res, await renderSlides(title, slides), title, "pptx");
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
