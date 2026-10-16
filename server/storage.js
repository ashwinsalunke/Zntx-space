import "./env.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collections = new Set([
  "papers",
  "searches",
  "drafts",
  "projects",
  "chats",
  "notes",
  "reviews",
  "agents",
]);
const cloudUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const cloudKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
export const storageInfo = {
  provider: cloudUrl && cloudKey ? "Supabase" : "Local SQLite",
  cloud: !!(cloudUrl && cloudKey),
  projectUrl: cloudUrl || null,
};
let localDb;
function local() {
  if (!localDb) {
    mkdirSync(path.join(root, ".data"), { recursive: true });
    localDb = new DatabaseSync(path.join(root, ".data", "zntx.db"));
    localDb.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace_records(workspace_hash TEXT NOT NULL,collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_hash,collection,id)); CREATE INDEX IF NOT EXISTS workspace_records_recent ON workspace_records(workspace_hash,collection,updated_at DESC);`,
    );
  }
  return localDb;
}
export function workspaceToken(req) {
  const token = req.get("X-Workspace-Token") || "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    const e = new Error(
      "A valid browser workspace token is required. Refresh the application.",
    );
    e.status = 401;
    throw e;
  }
  return token;
}
function validate(collection, id, data) {
  if (!collections.has(collection))
    throw Object.assign(new Error("Unknown workspace collection."), {
      status: 400,
    });
  if (
    id !== undefined &&
    (typeof id !== "string" || !id.length || id.length > 512)
  )
    throw Object.assign(new Error("Invalid record ID."), { status: 400 });
  if (
    data !== undefined &&
    (!data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      Buffer.byteLength(JSON.stringify(data)) > 1048576)
  )
    throw Object.assign(
      new Error("Record must be a JSON object smaller than 1 MB."),
      { status: 400 },
    );
}
async function cloud(token, method, query, body) {
  let response;
  try {
    response = await fetch(`${cloudUrl}/rest/v1/zntx_records?${query}`, {
      method,
      headers: {
        apikey: cloudKey,
        "X-Workspace-Token": token,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(18000),
    });
  } catch {
    throw Object.assign(
      new Error(
        "Cloud workspace is unavailable. Your changes have not been saved. Please retry.",
      ),
      { status: 503 },
    );
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("Supabase storage error:", response.status, err.code || "");
    throw Object.assign(
      new Error(
        response.status === 404
          ? "Supabase workspace table is missing. Apply the included migration."
          : "Supabase could not save or load your workspace. Please retry.",
      ),
      { status: 503 },
    );
  }
  return response.status === 204 ? [] : response.json();
}
const hash = (token) => createHash("sha256").update(token).digest("hex");
export async function listRecords(token, collection) {
  validate(collection);
  const rows = storageInfo.cloud
    ? await cloud(
        token,
        "GET",
        new URLSearchParams({
          collection: `eq.${collection}`,
          select: "id,data,created_at,updated_at",
          order: "updated_at.desc",
          limit: "500",
        }),
      )
    : local()
        .prepare(
          "SELECT id,data,created_at,updated_at FROM workspace_records WHERE workspace_hash=? AND collection=? ORDER BY updated_at DESC LIMIT 500",
        )
        .all(hash(token), collection)
        .map((r) => ({ ...r, data: JSON.parse(r.data) }));
  return rows.map((r) => ({
    ...r.data,
    id: r.id,
    createdAt: r.data.createdAt || r.created_at,
    updatedAt: r.updated_at,
  }));
}
export async function putRecord(token, collection, id, data) {
  validate(collection, id, data);
  const now = new Date().toISOString();
  if (storageInfo.cloud)
    await cloud(token, "POST", "on_conflict=workspace_hash,collection,id", {
      collection,
      id,
      data: { ...data, id },
      updated_at: now,
    });
  else
    local()
      .prepare(
        "INSERT INTO workspace_records(workspace_hash,collection,id,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_hash,collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
      )
      .run(
        hash(token),
        collection,
        id,
        JSON.stringify({ ...data, id }),
        now,
        now,
      );
  return { ok: true, id, updatedAt: now };
}
export async function removeRecord(token, collection, id) {
  validate(collection, id);
  if (storageInfo.cloud)
    await cloud(
      token,
      "DELETE",
      new URLSearchParams({ collection: `eq.${collection}`, id: `eq.${id}` }),
    );
  else
    local()
      .prepare(
        "DELETE FROM workspace_records WHERE workspace_hash=? AND collection=? AND id=?",
      )
      .run(hash(token), collection, id);
  return { ok: true };
}
