import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createLibrarySyncRouter } from "../server/library-sync.js";

const OWNER = "a".repeat(64), OTHER = "b".repeat(64), KEY = "TESTZOTEROKEY1234567890";
const json = (body, headers = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const item = (key, title = key, itemVersion = 10) => ({ key, version: itemVersion, data: { key, version: itemVersion, itemType: "journalArticle", title, publicationTitle: "Source Journal", abstractNote: "Source abstract", DOI: "10.1234/example", creators: [{ creatorType: "author", firstName: "Ada", lastName: "Researcher" }], date: "2024" } });
const zoteroAccount = { userID: 42, username: "reader", access: { user: { library: true }, groups: { 7: { library: true } } } };

async function setup(t, fetchImpl, overrides = {}) {
  const secrets = new Map(), records = new Map(), calls = [];
  const key = (token, provider) => `${token}:${provider}`;
  let failWrite = false;
  const app = express();
  app.use(createLibrarySyncRouter({
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return fetchImpl(String(url), options); },
    getSecret: async (token, provider) => structuredClone(secrets.get(key(token, provider)) || null),
    setSecret: async (token, provider, value) => { secrets.set(key(token, provider), structuredClone(value)); },
    deleteSecret: async (token, provider) => { secrets.delete(key(token, provider)); },
    listRecords: async (token) => [...records.values()].filter((entry) => entry.token === token).slice(0, 500).map((entry) => structuredClone(entry.record)),
    getRecord: async (token, _collection, id) => structuredClone(records.get(key(token, id))?.record || null),
    putRecord: async (token, collection, id, record) => { assert.equal(collection, "papers"); if (failWrite) throw new Error("Storage write failed"); records.set(key(token, id), { token, record: structuredClone(record) }); },
    timeoutMs: 5000,
    ...overrides,
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = "GET", body, token = OWNER, redirect = "follow" } = {}) => fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Workspace-Token": token }, ...(body ? { body: JSON.stringify(body) } : {}), redirect });
  return { request, secrets, records, calls, key, failWrites: (value) => { failWrite = value; } };
}

test("Zotero validates discovered permissions, isolates workspace status, and never returns credentials", async (t) => {
  const h = await setup(t, async (url, options) => {
    assert.equal(url, "https://api.zotero.org/keys/current");
    assert.equal(options.headers["Zotero-API-Key"], KEY);
    return json(zoteroAccount);
  });
  const connected = await h.request("/zotero/connect", { method: "POST", body: { apiKey: KEY } });
  assert.equal(connected.status, 200);
  assert.equal((await connected.json()).libraryId, "42");
  const status = await h.request("/status").then((response) => response.json());
  assert.equal(status.zotero.connected, true);
  assert.equal(status.mode, "read-only-pull");
  assert.equal(JSON.stringify(status).includes(KEY), false);
  assert.equal((await h.request("/status", { token: OTHER }).then((response) => response.json())).zotero.connected, false);
  const denied = await h.request("/zotero/connect", { method: "POST", body: { apiKey: KEY, libraryType: "groups", libraryId: "8" } });
  assert.equal(denied.status, 403);
  assert.equal((await h.request("/status", { token: "invalid" })).status, 401);
});

test("Zotero resumes capped pages, keeps the final version unchanged until completion, and preserves local notes", async (t) => {
  const h = await setup(t, async (url) => {
    if (url.endsWith("/keys/current")) return json(zoteroAccount);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/deleted")) return json({ items: ["BBBBBBBB"], collections: [], searches: [] }, { "Last-Modified-Version": "10" });
    assert.equal(parsed.searchParams.get("since"), "0");
    return parsed.searchParams.has("start") ? json([item("CCCCCCCC", "Third paper")], { "Last-Modified-Version": "10" }) : json([item("AAAAAAAA", "Updated source title"), item("BBBBBBBB")], { "Last-Modified-Version": "10", Link: '<https://api.zotero.org/users/42/items?format=json&limit=2&since=0&start=2>; rel="next"' });
  }, { maxRecords: 2 });
  const id = "zotero:users:42:AAAAAAAA";
  h.records.set(h.key(OWNER, id), { token: OWNER, record: { id, title: "Old title", localNotes: "Keep my notes", collectionId: "local-folder", librarySync: { provider: "zotero", libraryId: "42", remoteId: "AAAAAAAA" } } });
  h.records.set(h.key(OWNER, "unrelated"), { token: OWNER, record: { id: "unrelated", title: "Unrelated saved paper", doi: "10.1234/example" } });
  await h.request("/zotero/connect", { method: "POST", body: { apiKey: KEY } });
  const first = await h.request("/zotero/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(first.partial, true);
  assert.equal(first.version, 0);
  assert.equal(first.processed, 2);
  assert.equal(first.updated, 1);
  assert.equal(h.secrets.get(h.key(OWNER, "zotero")).version, 0);
  const second = await h.request("/zotero/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(second.partial, false);
  assert.equal(second.version, 10);
  assert.equal(second.imported, 1);
  assert.equal(second.remoteRemoved, 1);
  const copied = h.records.get(h.key(OWNER, id)).record;
  assert.equal(copied.title, "Updated source title");
  assert.equal(copied.localNotes, "Keep my notes");
  assert.equal(copied.collectionId, "local-folder");
  assert.equal(h.records.get(h.key(OWNER, "zotero:users:42:BBBBBBBB")).record.remoteRemoved, true);
  assert.equal(h.records.get(h.key(OWNER, "unrelated")).record.title, "Unrelated saved paper");
  await h.request("/zotero", { method: "DELETE" });
  assert.equal(h.secrets.has(h.key(OWNER, "zotero")), false);
  assert.equal(h.records.has(h.key(OWNER, id)), true);
});

test("Zotero does not advance checkpoints after a storage failure or inconsistent page versions", async (t) => {
  let changed = false;
  const h = await setup(t, async (url) => {
    if (url.endsWith("/keys/current")) return json(zoteroAccount);
    if (url.includes("/deleted")) return json({ items: [] }, { "Last-Modified-Version": changed ? "11" : "10" });
    return json([item("AAAAAAAA")], { "Last-Modified-Version": "10" });
  });
  await h.request("/zotero/connect", { method: "POST", body: { apiKey: KEY } });
  h.failWrites(true);
  assert.equal((await h.request("/zotero/sync", { method: "POST" })).status, 503);
  assert.equal(h.secrets.get(h.key(OWNER, "zotero")).version, 0);
  h.failWrites(false); changed = true;
  const partial = await h.request("/zotero/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(partial.partial, true);
  assert.equal(partial.version, 0);
  assert.match(partial.warnings[0], /changed during pagination/);
});

test("Zotero rejects hostile pagination before forwarding a key and honors successful-response backoff", async (t) => {
  let mode = "hostile", time = Date.now();
  const h = await setup(t, async (url) => {
    if (url.endsWith("/keys/current")) return json(zoteroAccount);
    if (mode === "hostile") return json([item("AAAAAAAA")], { "Last-Modified-Version": "10", Link: '<https://attacker.invalid/steal>; rel="next"' });
    return json([item("AAAAAAAA")], { "Last-Modified-Version": "10", Backoff: "10", Link: '<https://api.zotero.org/users/42/items?start=1&since=0>; rel="next"' });
  }, { now: () => time });
  await h.request("/zotero/connect", { method: "POST", body: { apiKey: KEY } });
  assert.equal((await h.request("/zotero/sync", { method: "POST" })).status, 502);
  assert.equal(h.calls.some((call) => call.url.includes("attacker.invalid")), false);
  mode = "backoff";
  assert.equal((await h.request("/zotero/sync", { method: "POST" }).then((response) => response.json())).partial, true);
  const paused = await h.request("/zotero/sync", { method: "POST" });
  assert.equal(paused.status, 429);
  assert.equal(paused.headers.get("retry-after"), "10");
});

test("Mendeley OAuth uses expiring one-use state, binds the grant to its initiating workspace, and hides tokens", async (t) => {
  let time = Date.now(), exchanges = 0;
  const h = await setup(t, async (url, options) => {
    if (url.endsWith("/oauth/token")) { exchanges += 1; assert.equal(new URLSearchParams(options.body).get("grant_type"), "authorization_code"); return json({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 }); }
    if (url.endsWith("/profiles/me")) return json({ id: "profile-123", display_name: "Researcher" });
    throw new Error("Unexpected provider request");
  }, { now: () => time, stateTtlMs: 1000 });
  const connect = () => h.request("/mendeley/connect", { method: "POST", body: { clientId: "123", clientSecret: "private-client-secret" } }).then((response) => response.json());
  const expired = await connect();
  const expiredState = new URL(expired.authorizationUrl).searchParams.get("state");
  time += 1001;
  assert.match((await h.request(`/mendeley/callback?state=${expiredState}&code=first`, { redirect: "manual" })).headers.get("location"), /mendeley=error$/);
  assert.equal(exchanges, 0);
  const attempt = await connect(), state = new URL(attempt.authorizationUrl).searchParams.get("state");
  assert.equal(new URL(attempt.authorizationUrl).searchParams.get("scope"), "all");
  assert.equal(attempt.authorizationUrl.includes("private-client-secret"), false);
  const callback = await h.request(`/mendeley/callback?state=${state}&code=valid-code`, { token: OTHER, redirect: "manual" });
  assert.match(callback.headers.get("location"), /mendeley=connected$/);
  const status = await h.request("/status").then((response) => response.json());
  assert.equal(status.mendeley.connected, true);
  assert.equal(status.mendeley.libraryId, "profile-123");
  assert.equal(JSON.stringify(status).includes("private-"), false);
  assert.equal((await h.request("/status", { token: OTHER }).then((response) => response.json())).mendeley.connected, false);
  assert.match((await h.request(`/mendeley/callback?state=${state}&code=replayed`, { redirect: "manual" })).headers.get("location"), /mendeley=error$/);
  assert.equal(exchanges, 1);
});

test("Mendeley refreshes a rejected access token once, follows fixed-host pages, and marks remote removals", async (t) => {
  let refreshes = 0;
  const h = await setup(t, async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/oauth/token") { refreshes += 1; assert.equal(new URLSearchParams(options.body).get("refresh_token"), "old-refresh"); return json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 }); }
    if (options.headers.Authorization === "Bearer old-access") return json({ error: "expired" }, {}, 401);
    assert.equal(options.headers.Authorization, "Bearer new-access");
    if (parsed.pathname === "/documents") {
      assert.equal(options.headers.Accept, "application/vnd.mendeley-document.1+json");
      return parsed.searchParams.has("marker") ? json([{ id: "second", title: "Second", last_modified: "2026-10-01T00:00:00Z" }]) : json([{ id: "first", title: "First", abstract: "Study evidence", year: 2024 }], { Link: '<https://api.mendeley.com/documents?marker=next>; rel="next"' });
    }
    if (parsed.pathname === "/trash") return json([{ id: "first" }]);
    if (parsed.pathname === "/deleted_documents") return json(["second"]);
    throw new Error("Unexpected path");
  });
  h.secrets.set(h.key(OWNER, "mendeley"), { clientId: "123", clientSecret: "client-secret", accessToken: "old-access", refreshToken: "old-refresh", expiresAt: Date.now() + 3600000, libraryId: "profile" });
  const result = await h.request("/mendeley/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(result.partial, false);
  assert.equal(result.imported, 2);
  assert.equal(result.remoteRemoved, 2);
  assert.equal(refreshes, 1);
  assert.equal(h.secrets.get(h.key(OWNER, "mendeley")).refreshToken, "new-refresh");
  assert.equal(h.records.get(h.key(OWNER, "mendeley:profile:first")).record.remoteRemoved, true);
  assert.equal(h.records.get(h.key(OWNER, "mendeley:profile:second")).record.remoteRemoved, true);
  assert.ok(h.secrets.get(h.key(OWNER, "mendeley")).since);
});

test("a failed replacement Mendeley authorization preserves the existing account and removes pending credentials", async (t) => {
  const h=await setup(t,async(url)=>{assert.ok(url.endsWith("/oauth/token"));return json({error:"invalid_grant"},{},400);});
  const previous={clientId:"old-app",clientSecret:"old-client-secret",accessToken:"working-access",refreshToken:"working-refresh",expiresAt:Date.now()+3600000,libraryId:"original-profile",since:"2026-10-01T00:00:00Z"};
  h.secrets.set(h.key(OWNER,"mendeley"),structuredClone(previous));
  const attempt=await h.request("/mendeley/connect",{method:"POST",body:{clientId:"new-app",clientSecret:"new-client-secret"}}).then(r=>r.json());
  assert.equal((await h.request("/status").then(r=>r.json())).mendeley.connected,true);
  const state=new URL(attempt.authorizationUrl).searchParams.get("state");
  const response=await h.request(`/mendeley/callback?state=${state}&code=bad-code`,{redirect:"manual"});
  assert.match(response.headers.get("location"),/mendeley=error$/);
  assert.deepEqual(h.secrets.get(h.key(OWNER,"mendeley")),previous);
});

test("Mendeley partial pages resume without advancing time cursor and hostile links never receive bearer tokens", async (t) => {
  let hostile = false;
  const h = await setup(t, async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/documents") return json([{ id: "one", title: "One" }, { id: "two", title: "Two" }], hostile ? { Link: '<https://attacker.invalid/documents>; rel="next"' } : {});
    if (parsed.pathname === "/trash") return json([]);
    if (parsed.pathname === "/deleted_documents") return json([]);
    throw new Error("Unexpected provider path");
  }, { maxRecords: 1 });
  h.secrets.set(h.key(OWNER, "mendeley"), { clientId: "123", clientSecret: "client-secret", accessToken: "token", refreshToken: "refresh", expiresAt: Date.now() + 3600000, libraryId: "profile" });
  const first = await h.request("/mendeley/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(first.partial, true);
  assert.equal(first.processed, 1);
  assert.equal(h.secrets.get(h.key(OWNER, "mendeley")).since, undefined);
  const second = await h.request("/mendeley/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(second.partial, true);
  assert.equal(second.imported, 1);
  const final = await h.request("/mendeley/sync", { method: "POST" }).then((response) => response.json());
  assert.equal(final.partial, false);
  assert.ok(h.secrets.get(h.key(OWNER, "mendeley")).since);
  hostile = true;
  assert.equal((await h.request("/mendeley/sync", { method: "POST" })).status, 502);
  assert.equal(h.calls.some((call) => call.url.includes("attacker.invalid")), false);
});
