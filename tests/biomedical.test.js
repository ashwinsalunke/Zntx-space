import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createBiomedicalRouter,
  pubmedPapers,
  normalizeTrial,
  SAFETY_DISCLAIMER,
} from "../server/biomedical.js";

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function withApi(fetchImpl, fn, options = {}) {
  const app = express();
  app.use(
    "/api/biomedical",
    createBiomedicalRouter({ fetchImpl, throttle: false, ...options }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/biomedical`;
  try {
    await fn(async (path) => {
      const r = await fetch(base + path);
      return { status: r.status, data: await r.json() };
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const ARTICLE = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">123</PMID><DateCompleted><Year>2025</Year></DateCompleted><Article><Journal><JournalIssue><Volume>7</Volume><Issue>2</Issue><PubDate><MedlineDate>2023 Jan-Feb</MedlineDate></PubDate></JournalIssue><Title>Research &amp; Medicine</Title></Journal><ArticleTitle>A <i>drug</i> study &#x3B1;</ArticleTitle><Abstract><AbstractText Label="RESULTS">A &lt; B; association is not causation.</AbstractText><AbstractText Label="LIMITATIONS">Small sample.</AbstractText></Abstract><AuthorList><Author><LastName>Smith</LastName><ForeName>Alex</ForeName></Author><Author><CollectiveName>Trial Group</CollectiveName></Author></AuthorList><PublicationTypeList><PublicationType>Clinical Trial</PublicationType></PublicationTypeList></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1234/trial</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>`;

test("PubMed normalization preserves abstract labels, authors, DOI and publication year rather than indexing year", () => {
  const [p] = pubmedPapers(ARTICLE);
  assert.equal(p.title, "A drug study α");
  assert.equal(p.year, 2023);
  assert.equal(p.journal, "Research & Medicine");
  assert.deepEqual(p.authors, ["Alex Smith", "Trial Group"]);
  assert.equal(
    p.abstract,
    "RESULTS: A < B; association is not causation.\nLIMITATIONS: Small sample.",
  );
  assert.equal(p.doi, "10.1234/trial");
  assert.equal(p.citations, null);
  assert.equal(p.openAccess, false);
});
test("PubMed missing abstracts remain missing and reference PMIDs do not become article IDs", () => {
  const [p] = pubmedPapers(
    `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>999</PMID><Article><ArticleTitle>A study</ArticleTitle><Journal><JournalIssue><PubDate><Year>2020</Year></PubDate></JournalIssue></Journal></Article></MedlineCitation><PubmedData><ReferenceList><Reference><ArticleIdList><ArticleId IdType="pubmed">888</ArticleId><ArticleId IdType="doi">10.1/unrelated-reference</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle></PubmedArticleSet>`,
  );
  assert.equal(p.abstract, "");
  assert.equal(p.id, "pubmed-999");
  assert.equal(p.year, 2020);
  assert.equal(p.doi, "");
});
test("ClinicalTrials data preserves source status, registration ID, phase, enrollment and dates", () => {
  const trial = normalizeTrial({
    protocolSection: {
      identificationModule: {
        nctId: "NCT01234567",
        briefTitle: "Example trial",
      },
      statusModule: {
        overallStatus: "RECRUITING",
        startDateStruct: { date: "2025-01" },
      },
      designModule: { phases: ["PHASE2"], enrollmentInfo: { count: 0 } },
    },
    hasResults: false,
  });
  assert.equal(trial.enrollment, 0);
  assert.equal(trial.status, "RECRUITING");
  assert.deepEqual(trial.phases, ["PHASE2"]);
  assert.equal(trial.url, "https://clinicaltrials.gov/study/NCT01234567");
  assert.equal(trial.completionDate, null);
});
test("invalid, repeated, and oversized query arguments never reach upstream providers", async () => {
  await withApi(
    () => {
      throw new Error("must not fetch");
    },
    async (api) => {
      for (const path of [
        "/drugs",
        "/pubmed?q=a&q=b",
        `/trials?q=${"a".repeat(301)}`,
        "/safety?q=%00",
      ]) {
        const r = await api(path);
        assert.equal(r.status, 400);
        assert.equal(r.data.code, "INVALID_QUERY");
      }
    },
  );
});
test("PubChem 404 is an honest empty result, with no synthetic compounds", async () => {
  await withApi(
    async () => json({ Fault: { Code: "PUGREST.NotFound" } }, 404),
    async (api) => {
      const r = await api("/drugs?q=unknown-compound");
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.results, []);
      assert.equal(r.data.total, 0);
    },
  );
});
test("compound structures join ChEMBL by exact InChIKey and retain real mechanism targets", async () => {
  const seen = [];
  await withApi(
    async (url) => {
      seen.push(url);
      if (url.includes("pubchem"))
        return json({
          PropertyTable: {
            Properties: [
              {
                CID: 2244,
                Title: "Aspirin",
                MolecularFormula: "C9H8O4",
                MolecularWeight: "180.16",
                ConnectivitySMILES: "example",
                InChIKey: "EXACT-KEY",
              },
            ],
          },
        });
      if (url.includes("molecule.json"))
        return json({ molecules: [{ molecule_chembl_id: "CHEMBL25" }] });
      return json({
        mechanisms: [
          {
            mechanism_of_action: "Cyclooxygenase inhibitor",
            action_type: "INHIBITOR",
            target_chembl_id: "CHEMBL2094253",
          },
        ],
      });
    },
    async (api) => {
      const { data } = await api("/drugs?q=aspirin");
      assert.equal(data.results[0].molecularWeight, 180.16);
      assert.equal(data.results[0].chemblId, "CHEMBL25");
      assert.equal(data.results[0].mechanisms[0].targetId, "CHEMBL2094253");
      assert.ok(
        seen[1].includes("molecule_structures__standard_inchi_key=EXACT-KEY"),
      );
    },
  );
});
test("optional mechanism outage retains PubChem evidence with an explicit warning", async () => {
  await withApi(
    async (url) =>
      url.includes("pubchem")
        ? json({ PropertyTable: { Properties: [{ CID: 1, InChIKey: "key" }] } })
        : json({}, 403),
    async (api) => {
      const { status, data } = await api("/drugs?q=test");
      assert.equal(status, 200);
      assert.equal(data.results.length, 1);
      assert.equal(data.results[0].chemblId, null);
      assert.match(data.warnings[0], /ChEMBL/);
    },
  );
});
test("safety returns report total separately from reaction counts, label sources and causal limitations", async () => {
  const seen = [];
  await withApi(
    async (url) => {
      seen.push(new URL(url));
      if (url.includes("label.json"))
        return json({
          results: [
            {
              id: "label",
              set_id: "example-id",
              openfda: { generic_name: ["ASPIRIN"] },
              warnings: ["Read label"],
            },
          ],
        });
      if (new URL(url).searchParams.has("count"))
        return json({
          results: [{ term: "HEADACHE", count: 42 }],
          meta: { last_updated: "2026-01-01" },
        });
      return json({ results: [{}], meta: { results: { total: 100 } } });
    },
    async (api) => {
      const { data } = await api("/safety?q=aspirin%22%20OR%20*");
      assert.equal(data.total, 100);
      assert.equal(data.results[0].count, 42);
      assert.equal(data.disclaimer, SAFETY_DISCLAIMER);
      assert.match(data.disclaimer, /cannot establish causation/);
      assert.match(data.labels[0].url, /dailymed/);
      assert.equal(data.labels[0].warnings, "Read label");
      assert.ok(!seen[0].searchParams.get("search").includes("*"));
    },
  );
});
test("PubMed search IDs are followed by EFetch abstracts, never invented summaries", async () => {
  await withApi(
    async (url) =>
      url.includes("esearch")
        ? json({ esearchresult: { count: "33", idlist: ["123"] } })
        : new Response(ARTICLE),
    async (api) => {
      const { data } = await api("/pubmed?q=metformin");
      assert.equal(data.total, 33);
      assert.equal(data.results[0].pmid, "123");
      assert.match(data.results[0].abstract, /Small sample/);
    },
  );
});
test("successful requests use bounded cache; a different query evicts the oldest entry", async () => {
  let requests = 0;
  await withApi(
    async () => {
      requests++;
      return json({ studies: [], totalCount: 0 });
    },
    async (api) => {
      await api("/trials?q=one");
      await api("/trials?q=one");
      assert.equal(requests, 1);
      await api("/trials?q=two");
      await api("/trials?q=one");
      assert.equal(requests, 3);
    },
    { maxCacheEntries: 1 },
  );
});
test("concurrent identical queries share one upstream request", async () => {
  let calls = 0;
  await withApi(
    async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return json({ studies: [], totalCount: 0 });
    },
    async (api) => {
      await Promise.all([api("/trials?q=same"), api("/trials?q=same")]);
      assert.equal(calls, 1);
    },
  );
});
test("provider outages retry once then return a structured error without fake results", async () => {
  let calls = 0;
  await withApi(
    async () => {
      calls++;
      return json({}, 503);
    },
    async (api) => {
      const { status, data } = await api("/trials?q=example");
      assert.equal(status, 502);
      assert.equal(calls, 2);
      assert.equal(data.code, "PROVIDER_HTTP_ERROR");
      assert.equal(data.provider, "ClinicalTrials.gov");
      assert.equal(typeof data.error, "string");
      assert.ok(!("results" in data));
    },
  );
});
test("malformed provider JSON produces an explicit response error", async () => {
  await withApi(
    async () => new Response("not-json"),
    async (api) => {
      const r = await api("/trials?q=example");
      assert.equal(r.status, 502);
      assert.equal(r.data.code, "PROVIDER_INVALID_RESPONSE");
    },
  );
});
