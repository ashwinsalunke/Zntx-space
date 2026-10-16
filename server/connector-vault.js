import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultDirectory = fileURLToPath(new URL("../.data/", import.meta.url));
const providers = new Set(["serpapi", "zotero", "mendeley"]);
export function createConnectorVault({ directory = defaultDirectory } = {}) {
  let db, key;
  function open() {
    if (db) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const keyPath = path.join(directory, "connector-vault.key");
    try { writeFileSync(keyPath, randomBytes(32), { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    key = readFileSync(keyPath);
    if (key.length !== 32) throw new Error("The connector vault key is invalid. Restore its secure backup.");
    chmodSync(keyPath, 0o600);
    const dbPath = path.join(directory, "connector-vault.db");
    db = new DatabaseSync(dbPath);
    chmodSync(dbPath, 0o600);
    db.exec("CREATE TABLE IF NOT EXISTS credentials (workspace_hash TEXT NOT NULL, provider TEXT NOT NULL, payload BLOB NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(workspace_hash,provider))");
  }
  function identity(token, provider) {
    if (!/^[a-f0-9]{64}$/.test(token || "") || !providers.has(provider)) throw new Error("Invalid private connector scope.");
    return createHash("sha256").update(token).digest("hex");
  }
  return {
    get(token, provider) {
      const hash = identity(token, provider); open();
      const row = db.prepare("SELECT payload FROM credentials WHERE workspace_hash=? AND provider=?").get(hash, provider);
      if (!row) return null;
      try {
        const bytes = Buffer.from(row.payload);
        const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(`${hash}:${provider}`));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
      } catch { throw new Error("The private connector credentials could not be read. Restore the vault key or reconnect this account."); }
    },
    set(token, provider, value) {
      const hash = identity(token, provider);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Connector credentials must be an object.");
      const plaintext = JSON.stringify(value);
      if (Buffer.byteLength(plaintext) > 100000) throw new Error("Connector credentials exceed the storage limit.");
      open();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`${hash}:${provider}`));
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
      db.prepare("INSERT INTO credentials(workspace_hash,provider,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(workspace_hash,provider) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").run(hash, provider, payload, new Date().toISOString());
    },
    remove(token, provider) {
      const hash = identity(token, provider); open();
      db.prepare("DELETE FROM credentials WHERE workspace_hash=? AND provider=?").run(hash, provider);
    },
    close() { db?.close(); db = undefined; key = undefined; },
  };
}
