import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import JSZip from "jszip";
import exportRouter, { createExportRouter } from "../server/exports.js";
async function service(run) {
  const app = express();
  app.use(exportRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await run("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
const post = (base, path, data) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
test("DOCX is a real Office package and preserves source metadata and table contents", () =>
  service(async (base) => {
    const r = await post(base, "/document", {
      title: "Evidence review",
      content:
        "# Methods\nA **source**: https://doi.org/10.1234/verified\n\n| Study | Findings |\n| --- | --- |\n| Study A | Unavailable |",
      format: "docx",
    });
    assert.equal(r.status, 200);
    const zip = await JSZip.loadAsync(await r.arrayBuffer());
    assert.ok(zip.file("[Content_Types].xml"));
    const xml = await zip.file("word/document.xml").async("string");
    assert.match(xml, /10.1234\/verified/);
    assert.match(xml, /Unavailable/);
    assert.match(xml, /<w:tbl>/);
    assert.match(xml, /w:hyperlink/);
    const relationships = await zip
      .file("word/_rels/document.xml.rels")
      .async("string");
    assert.match(relationships, /https:\/\/doi.org\/10.1234\/verified/);
  }));
test("HTML exports escape active content and LaTeX exports escape executable commands", () =>
  service(async (base) => {
    const content = "<script>alert(1)</script> \\input{secret} 50% & data";
    const html = await post(base, "/document", {
      title: "Test",
      content,
      format: "html",
    }).then((r) => r.text());
    assert.ok(!html.includes("<script>"));
    assert.match(html, /&lt;script&gt;/);
    const tex = await post(base, "/document", {
      title: "Test",
      content,
      format: "tex",
    }).then((r) => r.text());
    assert.ok(!tex.includes("\\input{secret}"));
    assert.match(tex, /50\\%/);
  }));
test("PowerPoint exports include slide text, notes, and a real package manifest", () =>
  service(async (base) => {
    const r = await post(base, "/slides", {
      title: "Research",
      slides: [
        {
          title: "Source evidence",
          content:
            "Verified DOI: 10.1234/study\nLimitations: no abstract supplied.",
        },
      ],
    });
    assert.equal(r.status, 200);
    const zip = await JSZip.loadAsync(await r.arrayBuffer());
    assert.ok(zip.file("ppt/presentation.xml"));
    assert.match(
      await zip.file("ppt/slides/slide1.xml").async("string"),
      /10.1234\/study/,
    );
    assert.ok(zip.file("ppt/notesSlides/notesSlide1.xml"));
  }));
test("exports reject oversized fields and empty slide decks", () =>
  service(async (base) => {
    assert.equal(
      (await post(base, "/slides", { title: "No slides", slides: [] })).status,
      400,
    );
    assert.equal(
      (
        await post(base, "/document", {
          title: "Test",
          content: "x".repeat(200001),
          format: "docx",
        })
      ).status,
      400,
    );
  }));

test("PowerPoint pagination keeps a bibliography entry and its DOI together", () =>
  service(async (base) => {
    const entry = (number) =>
      `[${number}] ${"Detailed publication metadata and author context. ".repeat(14)} https://doi.org/10.1234/source-${number}`;
    const result = await post(base, "/slides", {
      title: "Bibliography",
      slides: [{ title: "References", content: entry(1) + "\n\n" + entry(2) }],
    });
    assert.equal(result.status, 200);
    const zip = await JSZip.loadAsync(await result.arrayBuffer());
    const first = await zip.file("ppt/slides/slide1.xml").async("string");
    const second = await zip.file("ppt/slides/slide2.xml").async("string");
    assert.match(first, /10.1234\/source-1/);
    assert.doesNotMatch(first, /\[2\]/);
    assert.match(second, /\[2\]/);
    assert.match(second, /10.1234\/source-2/);
    assert.match(second, /a:hlinkClick/);
    assert.match(
      await zip.file("ppt/slides/_rels/slide2.xml.rels").async("string"),
      /https:\/\/doi.org\/10.1234\/source-2/,
    );
    assert.equal(zip.file("ppt/slides/slide3.xml"), null);
  }));

test("workflow PowerPoint preserves custom speaker notes, sage theme, and two-column text boxes", () =>
  service(async (base) => {
    const result = await post(base, "/slides", {
      title: "Evidence deck",
      theme: "scrapetx",
      slides: [
        {
          title: "Comparison",
          content: "Study A [1]\nFinding A\nStudy B [2]\nFinding B",
          notes: "Discuss uncertainty and population differences. Source [2].",
          layout: "two-column",
        },
      ],
    });
    assert.equal(result.status, 200);
    const zip = await JSZip.loadAsync(await result.arrayBuffer());
    const slide = await zip.file("ppt/slides/slide1.xml").async("string");
    const notes = await zip
      .file("ppt/notesSlides/notesSlide1.xml")
      .async("string");
    assert.match(slide, /718779/);
    assert.match(slide, /Study A/);
    assert.match(slide, /Study B/);
    assert.match(notes, /Discuss uncertainty and population differences/);
    assert.match(notes, /Source \[2\]/);
    assert.equal(
      (
        await post(base, "/slides", {
          title: "Invalid",
          theme: "unknown",
          slides: [{ title: "A", content: "B" }],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post(base, "/slides", {
          title: "Invalid",
          slides: [{ title: "A", content: "B", notes: "x".repeat(6001) }],
        })
      ).status,
      400,
    );
  }));

test("PowerPoint embeds a workspace illustration with editable text and provenance", async () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7O0AAAAASUVORK5CYII=",
    "base64",
  );
  const app = express();
  app.use(
    createExportRouter({
      loadImage: async (req, imageId) =>
        imageId === id && req.get("X-Workspace-Token") === "owner"
          ? {
              bytes: png,
              mime: "image/png",
              alt: "Animal rehabilitation conceptual illustration",
            }
          : null,
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/slides`;
    const body = {
      title: "Animal rehabilitation",
      slides: [
        {
          title: "Evidence and limitations",
          content: "Reported findings [1]\nPopulation: animals",
          notes: "Source: https://example.org/study",
          imageId: id,
        },
      ],
    };
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Token": "owner",
      },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, await r.clone().text());
    const zip = await JSZip.loadAsync(await r.arrayBuffer());
    assert.ok(
      Object.keys(zip.files).some(
        (p) => p.startsWith("ppt/media/") && p.endsWith(".png"),
      ),
    );
    const xml = await zip.file("ppt/slides/slide1.xml").async("string");
    assert.match(xml, /<p:pic>/);
    const picture = xml.match(/<p:pic>[\s\S]*?<\/p:pic>/)[0];
    const dimensions = picture.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    assert.equal(
      dimensions[1],
      dimensions[2],
      "A square image keeps its aspect ratio",
    );
    assert.match(xml, /Reported findings/);
    assert.match(
      await zip.file("ppt/notesSlides/notesSlide1.xml").async("string"),
      /Cloudflare Workers AI/,
    );
    const denied = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(denied.status, 404);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("supplied JEGH geometry is preserved in DOCX and LaTeX, with full-width front matter and safe user text", () =>
  service(async base => {
    const content="## Abstract\nA short abstract.\n\n## Keywords\nepidemiology; resistance\n\n## Introduction\nActual text. \\input{secret}\n\n## Methods\nSource retrieval only.\n\n## Results\nNo original data supplied.\n\n## References\nhttps://doi.org/10.1234/real";
    const r=await post(base,'/document',{title:'Working manuscript',content,format:'docx',layout:'jegh'});
    assert.equal(r.status,200);
    const zip=await JSZip.loadAsync(await r.arrayBuffer()), xml=await zip.file('word/document.xml').async('string');
    assert.match(xml,/w:w="11906"/);assert.match(xml,/w:h="15817"/);
    assert.match(xml,/w:top="680"/);assert.match(xml,/w:bottom="1587"/);
    assert.match(xml,/<w:cols[^>]*w:num="2"/);assert.match(xml,/w:space="340"/);
    const styles=await zip.file('word/styles.xml').async('string');assert.match(styles,/w:sz w:val="20"/);
    assert.match(await zip.file('word/header1.xml').async('string'),/Journal of Epidemiology and Global Health/);
    assert.match(await zip.file('word/header1.xml').async('string'),/PAGE/);
    const tex=await post(base,'/document',{title:'Working manuscript',content,format:'tex',layout:'jegh'}).then(r=>r.text());
    assert.match(tex,/10pt,twocolumn/);assert.match(tex,/paperheight=279mm/);assert.match(tex,/\\twocolumn\[/);
    assert.ok(tex.indexOf('A short abstract.') < tex.indexOf('\\end{minipage}'));
    assert.doesNotMatch(tex,/\\input\{secret\}/);assert.match(tex,/https:\/\/doi.org\/10.1234\/real/);
    for (const layout of ['../evil','__proto__','constructor',{}]) assert.equal((await post(base,'/document',{title:'T',content:'text',format:'tex',layout})).status,400);
  }));
