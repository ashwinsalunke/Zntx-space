import express from "express";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { imageSize } from "image-size";
import { workspaceToken } from "./storage.js";
const BASE = "https://api.cloudflare.com/client/v4";
const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const directory = fileURLToPath(new URL("../.data/", import.meta.url));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const contexts = new Set(["diagram", "presentation"]);
class ImageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function imageCredentials(value) {
  if (
    !value ||
    !/^\w{32}$/.test(value.accountId || "") ||
    !/^[a-zA-Z0-9_-]{20,256}$/.test(value.apiToken || "")
  )
    throw new ImageError(
      400,
      "Enter your 32-character Cloudflare Account ID and Workers AI API token.",
    );
  if (!/^[a-f0-9]{32}$/i.test(value.accountId))
    throw new ImageError(
      400,
      "Cloudflare Account ID must contain 32 hexadecimal characters.",
    );
  return { accountId: value.accountId, apiToken: value.apiToken };
}
async function jsonBody(response, maximum = 9000000) {
  const reader = response.body?.getReader();
  if (!reader)
    throw new ImageError(502, "Cloudflare returned an empty response.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel();
        throw new ImageError(
          502,
          "The image response exceeds the download limit.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } catch {
    throw new ImageError(502, "Cloudflare returned an unreadable response.");
  }
}
export async function verifyImageConnection(
  credentials,
  { fetchImpl = fetch } = {},
) {
  const { accountId, apiToken } = imageCredentials(credentials);
  const response = await fetchImpl(
    `${BASE}/accounts/${accountId}/ai/models/search?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await jsonBody(response, 2000000);
  if (!response.ok || data.success !== true || !Array.isArray(data.result))
    throw new ImageError(
      [401, 403].includes(response.status) ? 403 : 502,
      "Cloudflare could not validate Workers AI access for this account. Check the Account ID and Workers AI Read/Edit token permissions.",
    );
  return { checkedAt: new Date().toISOString() };
}
export function decodeGeneratedImage(data) {
  const encoded = data?.result?.image || data?.image;
  if (
    typeof encoded !== "string" ||
    encoded.length > 8500000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new ImageError(
      502,
      "Cloudflare did not return a valid generated image.",
    );
  const bytes = Buffer.from(encoded, "base64");
  const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    webp =
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP";
  if ((!png && !jpeg && !webp) || bytes.length > 6000000)
    throw new ImageError(502, "The image format or size is unsupported.");
  let size;
  try {
    size = imageSize(bytes);
  } catch {
    throw new ImageError(502, "The generated image could not be decoded.");
  }
  if (
    !size.width ||
    !size.height ||
    size.width > 4096 ||
    size.height > 4096 ||
    size.width * size.height > 16777216
  )
    throw new ImageError(
      502,
      "The generated image dimensions are unsupported.",
    );
  return {
    bytes,
    width: size.width,
    height: size.height,
    mime: png ? "image/png" : jpeg ? "image/jpeg" : "image/webp",
  };
}
export function createImageStore({
  root = directory,
  workspaceDailyLimit = 20,
  accountDailyLimit = 60,
} = {}) {
  let db;
  function open() {
    if (db) return;
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const filename = path.join(root, "generated-images.db");
    db = new DatabaseSync(filename);
    chmodSync(filename, 0o600);
    db.exec(
      "CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, workspace TEXT NOT NULL, account TEXT NOT NULL, created_at TEXT NOT NULL, context TEXT NOT NULL, prompt TEXT NOT NULL, alt TEXT NOT NULL, status TEXT NOT NULL, mime TEXT, width INTEGER, height INTEGER, bytes BLOB); CREATE INDEX IF NOT EXISTS image_scope ON images(workspace,id); CREATE INDEX IF NOT EXISTS image_usage ON images(account,created_at)",
    );
  }
  return {
    reserve(token, credential, context, prompt, alt) {
      open();
      const now = new Date().toISOString(),
        day = now.slice(0, 10),
        scope = digest(token),
        account = digest(credential);
      const rows = db
        .prepare(
          "SELECT COUNT(*) AS amount FROM images WHERE workspace=? AND created_at>=?",
        )
        .get(scope, day);
      const total = db
        .prepare(
          "SELECT COUNT(*) AS amount FROM images WHERE account=? AND created_at>=?",
        )
        .get(account, day);
      if (
        rows.amount >= workspaceDailyLimit ||
        total.amount >= accountDailyLimit
      )
        throw new ImageError(
          429,
          "The daily image generation limit has been reached. Try again tomorrow.",
        );
      if (
        db
          .prepare(
            "SELECT COALESCE(SUM(length(bytes)),0) AS amount FROM images",
          )
          .get().amount >
        500 * 1024 * 1024
      )
        throw new ImageError(
          503,
          "Image storage is full. Ask the server owner to increase its storage capacity.",
        );
      const id = randomUUID();
      db.prepare(
        "INSERT INTO images(id,workspace,account,created_at,context,prompt,alt,status) VALUES(?,?,?,?,?,?,?,?)",
      ).run(id, scope, account, now, context, prompt, alt, "pending");
      return { id, createdAt: now };
    },
    finish(token, id, image) {
      open();
      db.prepare(
        "UPDATE images SET status='complete',mime=?,width=?,height=?,bytes=? WHERE id=? AND workspace=?",
      ).run(
        image.mime,
        image.width,
        image.height,
        image.bytes,
        id,
        digest(token),
      );
    },
    fail(token, id) {
      open();
      db.prepare(
        "UPDATE images SET status='failed' WHERE id=? AND workspace=?",
      ).run(id, digest(token));
    },
    get(token, id) {
      open();
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/i.test(id)) return null;
      const row = db
        .prepare(
          "SELECT id,created_at,context,prompt,alt,mime,width,height,bytes FROM images WHERE id=? AND workspace=? AND status='complete'",
        )
        .get(id, digest(token));
      return row ? { ...row, bytes: Buffer.from(row.bytes) } : null;
    },
    close() {
      db?.close();
      db = undefined;
    },
  };
}
export function createImageRouter({
  vault,
  store = createImageStore(),
  fetchImpl = fetch,
  timeoutMs = 90000,
  tokenFor = workspaceToken,
  environment = process.env,
} = {}) {
  const router = express.Router(),
    active = new Set();
  let globalActive = 0;
  const credentials = (token) =>
    vault.get(token, "cloudflare") ||
    (environment.CLOUDFLARE_ACCOUNT_ID && environment.CLOUDFLARE_API_TOKEN
      ? {
          accountId: environment.CLOUDFLARE_ACCOUNT_ID,
          apiToken: environment.CLOUDFLARE_API_TOKEN,
        }
      : null);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      req.imageWorkspace = tokenFor(req);
      next();
    } catch (e) {
      res.status(401).json({ error: e.message });
    }
  });
  const failure = (res, e) =>
    res.status(e instanceof ImageError ? e.status : 502).json({
      error:
        e instanceof ImageError
          ? e.message
          : "The image service could not complete this request. Check the connection or try again.",
    });
  router.get("/status", (req, res) => {
    try {
      const value = credentials(req.imageWorkspace);
      res.json({
        configured: !!value,
        provider: "Cloudflare Workers AI",
        contexts: [...contexts],
        checkedAt: value?.checkedAt || null,
        source: value
          ? vault.get(req.imageWorkspace, "cloudflare")
            ? "workspace"
            : "server"
          : null,
      });
    } catch (e) {
      failure(res, e);
    }
  });
  router.post("/connect", async (req, res) => {
    try {
      const value = imageCredentials(req.body);
      const verified = await verifyImageConnection(value, { fetchImpl });
      vault.set(req.imageWorkspace, "cloudflare", { ...value, ...verified });
      res.json({
        connected: true,
        ...verified,
        provider: "Cloudflare Workers AI",
      });
    } catch (e) {
      failure(res, e);
    }
  });
  router.delete("/connection", (req, res) => {
    try {
      vault.remove(req.imageWorkspace, "cloudflare");
      res.json({ disconnected: true });
    } catch (e) {
      failure(res, e);
    }
  });
  router.post("/generate", async (req, res) => {
    let reserved,
      credentialKey,
      slotOwned = false;
    const token = req.imageWorkspace;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeoutMs);
    const disconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.once("close", disconnect);
    try {
      if (!contexts.has(req.body?.context))
        throw new ImageError(
          400,
          "Image generation is available only for an explicitly requested diagram or presentation.",
        );
      const prompt = req.body?.prompt,
        alt = req.body?.alt || "AI-generated research illustration";
      if (
        typeof prompt !== "string" ||
        !prompt.trim() ||
        prompt.length > 1800 ||
        /[\u0000-\u0008]/.test(prompt) ||
        typeof alt !== "string" ||
        alt.length > 500
      )
        throw new ImageError(
          400,
          "Describe the image using 1–1800 characters.",
        );
      const value = credentials(token);
      if (!value)
        throw new ImageError(
          503,
          "Connect Cloudflare Workers AI in Integrations before generating images.",
        );
      imageCredentials(value);
      credentialKey = digest(value.accountId);
      if (active.has(credentialKey) || globalActive >= 3)
        throw new ImageError(
          429,
          "An image is already being generated. Wait for it to finish.",
        );
      active.add(credentialKey);
      globalActive++;
      slotOwned = true;
      reserved = store.reserve(
        token,
        credentialKey,
        req.body.context,
        prompt.trim(),
        alt,
      );
      const response = await fetchImpl(
        `${BASE}/accounts/${value.accountId}/ai/run/${MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${value.apiToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            prompt: (
              prompt.trim() +
              "\nClean scientific educational illustration. Do not fabricate research data, numerical results, or evidence."
            ).slice(0, 2048),
            steps: 4,
          }),
          signal: controller.signal,
          redirect: "error",
        },
      );
      const data = await jsonBody(response);
      if (!response.ok || data.success === false)
        throw new ImageError(
          response.status === 429
            ? 429
            : [401, 403].includes(response.status)
              ? 403
              : 502,
          response.status === 429
            ? "Cloudflare requested a pause or its image quota is exhausted. Try again later."
            : [401, 403].includes(response.status)
              ? "Cloudflare rejected image generation. Check Workers AI Edit permission and account access."
              : "Cloudflare could not generate this image. Try a shorter prompt or retry later.",
        );
      controller.signal.throwIfAborted();
      const image = decodeGeneratedImage(data);
      store.finish(token, reserved.id, image);
      res.json({
        asset: {
          ...reserved,
          context: req.body.context,
          alt,
          width: image.width,
          height: image.height,
          mime: image.mime,
          provider: "Cloudflare Workers AI",
        },
        note: "AI-generated illustration. Review scientific details before use; this image is not research evidence.",
      });
    } catch (e) {
      if (reserved) store.fail(token, reserved.id);
      if (!res.destroyed)
        failure(
          res,
          controller.signal.aborted
            ? new ImageError(
                504,
                "Image generation timed out or was cancelled. Try again.",
              )
            : e,
        );
    } finally {
      clearTimeout(timer);
      res.off("close", disconnect);
      if (slotOwned) {
        active.delete(credentialKey);
        globalActive--;
      }
    }
  });
  router.get("/:id", (req, res) => {
    try {
      const image = store.get(req.imageWorkspace, req.params.id);
      if (!image)
        return res
          .status(404)
          .json({ error: "This image is unavailable in this workspace." });
      res
        .set({
          "Content-Type": image.mime,
          "Content-Disposition":
            'inline; filename="scrapetx-illustration.' +
            (image.mime === "image/png"
              ? "png"
              : image.mime === "image/webp"
                ? "webp"
                : "jpg") +
            '"',
        })
        .send(image.bytes);
    } catch (e) {
      failure(res, e);
    }
  });
  return router;
}
