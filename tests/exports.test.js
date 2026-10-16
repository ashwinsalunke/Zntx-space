import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import JSZip from "jszip";
import exportRouter from "../server/exports.js";
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
    const relationships = await zip.file("word/_rels/document.xml.rels").async("string");
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

test("workflow PowerPoint preserves custom speaker notes, sage theme, and two-column text boxes", () =>
  service(async (base) => {
    const result = await post(base, "/slides", { title: "Evidence deck", theme: "scrapetx", slides: [{ title: "Comparison", content: "Study A [1]\nFinding A\nStudy B [2]\nFinding B", notes: "Discuss uncertainty and population differences. Source [2].", layout: "two-column" }] });
    assert.equal(result.status, 200);
    const zip = await JSZip.loadAsync(await result.arrayBuffer());
    const slide = await zip.file("ppt/slides/slide1.xml").async("string");
    const notes = await zip.file("ppt/notesSlides/notesSlide1.xml").async("string");
    assert.match(slide, /718779/); assert.match(slide, /Study A/); assert.match(slide, /Study B/);
    assert.match(notes, /Discuss uncertainty and population differences/);
    assert.match(notes, /Source \[2\]/);
    assert.equal((await post(base, "/slides", { title: "Invalid", theme: "unknown", slides: [{ title: "A", content: "B" }] })).status, 400);
    assert.equal((await post(base, "/slides", { title: "Invalid", slides: [{ title: "A", content: "B", notes: "x".repeat(6001) }] })).status, 400);
  }));
