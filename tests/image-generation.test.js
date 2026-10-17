import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createImageRouter,
  createImageStore,
  decodeGeneratedImage,
} from "../server/image-generation.js";
const OWNER = "a".repeat(64),
  OTHER = "b".repeat(64),
  ACCOUNT = "c".repeat(32),
  SECRET = "test-token-" + "x".repeat(32);
export const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7O0AAAAASUVORK5CYII=";
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function harness(t, fetchImpl, storeOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "scrapetx-images-")),
    store = createImageStore({ root, ...storeOptions }),
    values = new Map();
  const vault = {
    get: (token, p) => values.get(token + ":" + p),
    set: (token, p, v) => values.set(token + ":" + p, v),
    remove: (token, p) => values.delete(token + ":" + p),
  };
  const app = express();
  app.use(express.json());
  app.use(
    createImageRouter({
      vault,
      store,
      fetchImpl,
      environment: {},
      timeoutMs: 1000,
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    store,
    vault,
    call: (
      route,
      { token = OWNER, body, method = body ? "POST" : "GET" } = {},
    ) =>
      fetch(`http://127.0.0.1:${server.address().port}` + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Workspace-Token": token,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
}
test("image connection validates privately without invoking generation; status excludes secrets", async (t) => {
  let calls = 0;
  const h = await harness(t, async (url, init) => {
    calls++;
    assert.match(url, /accounts\/c{32}\/ai\/models\/search/);
    assert.equal(init.headers.Authorization, "Bearer " + SECRET);
    return json({ success: true, result: [{ name: "image-model" }] });
  });
  const connected = await h.call("/connect", {
    body: { accountId: ACCOUNT, apiToken: SECRET },
  });
  assert.equal(connected.status, 200);
  assert.equal(calls, 1);
  const status = await h.call("/status").then((r) => r.json());
  assert.equal(status.configured, true);
  assert.equal(JSON.stringify(status).includes(SECRET), false);
  assert.equal(
    (await h.call("/status", { token: OTHER }).then((r) => r.json()))
      .configured,
    false,
  );
});
test("only diagram/presentation actions generate images, and files are workspace scoped", async (t) => {
  let calls = 0;
  const h = await harness(t, async (url, init) => {
    calls++;
    assert.ok(url.endsWith("/ai/run/@cf/black-forest-labs/flux-1-schnell"));
    assert.equal(JSON.parse(init.body).steps, 4);
    return json({ success: true, result: { image: PNG } });
  });
  h.vault.set(OWNER, "cloudflare", { accountId: ACCOUNT, apiToken: SECRET });
  for (const context of ["search", "chat", "synthesis", "", null])
    assert.equal(
      (
        await h.call("/generate", {
          body: { context, prompt: "An illustration" },
        })
      ).status,
      400,
    );
  assert.equal(calls, 0);
  const response = await h.call("/generate", {
    body: {
      context: "presentation",
      prompt: "Veterinary rehabilitation illustration",
    },
  });
  assert.equal(response.status, 200);
  const { asset } = await response.json();
  assert.equal(asset.mime, "image/png");
  assert.equal(asset.width, 1);
  assert.equal(calls, 1);
  assert.equal((await h.call("/" + asset.id, { token: OTHER })).status, 404);
  const file = await h.call("/" + asset.id);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.equal(Buffer.from(await file.arrayBuffer()).toString("base64"), PNG);
  assert.equal(
    (
      await h.call("/generate", {
        token: OTHER,
        body: { context: "diagram", prompt: "Sunlight" },
      })
    ).status,
    503,
  );
});
test("image limits persist and failed reservations release the concurrency slot", async (t) => {
  let calls = 0;
  const h = await harness(
    t,
    async () => {
      calls++;
      return json({ success: true, result: { image: PNG } });
    },
    { workspaceDailyLimit: 1 },
  );
  h.vault.set(OWNER, "cloudflare", { accountId: ACCOUNT, apiToken: SECRET });
  assert.equal(
    (await h.call("/generate", { body: { context: "diagram", prompt: "One" } }))
      .status,
    200,
  );
  assert.equal(
    (await h.call("/generate", { body: { context: "diagram", prompt: "Two" } }))
      .status,
    429,
  );
  h.vault.set(OTHER, "cloudflare", { accountId: ACCOUNT, apiToken: SECRET });
  assert.equal(
    (
      await h.call("/generate", {
        token: OTHER,
        body: { context: "presentation", prompt: "Another workspace" },
      })
    ).status,
    200,
  );
  assert.equal(calls, 2);
});
test("invalid images and upstream quota errors do not become successful assets", async (t) => {
  assert.throws(
    () =>
      decodeGeneratedImage({
        result: {
          image: Buffer.from('<svg onload="alert(1)"/>').toString("base64"),
        },
      }),
    /format/,
  );
  let count = 0;
  const h = await harness(t, async () =>
    ++count === 1
      ? json({ error: "private error " + SECRET }, 429)
      : json({ success: true, result: { image: PNG } }),
  );
  h.vault.set(OWNER, "cloudflare", { accountId: ACCOUNT, apiToken: SECRET });
  const failure = await h.call("/generate", {
    body: { context: "diagram", prompt: "Test" },
  });
  assert.equal(failure.status, 429);
  assert.equal((await failure.text()).includes(SECRET), false);
  assert.equal(
    (
      await h.call("/generate", {
        body: { context: "diagram", prompt: "Retry" },
      })
    ).status,
    200,
  );
});
