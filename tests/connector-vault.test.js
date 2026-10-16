import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createConnectorVault } from "../server/connector-vault.js";

test("connector vault encrypts credentials and separates workspace/provider scopes across restart", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zntx-vault-"));
  let vault = createConnectorVault({ directory });
  const first = "a".repeat(64), second = "b".repeat(64), secret = "private-serpapi-test-secret-do-not-store-as-plaintext";
  try {
    vault.set(first, "serpapi", { apiKey: secret });
    assert.deepEqual(vault.get(first, "serpapi"), { apiKey: secret });
    assert.equal(vault.get(second, "serpapi"), null);
    assert.equal(vault.get(first, "zotero"), null);
    assert.ok(!readFileSync(path.join(directory, "connector-vault.db")).includes(Buffer.from(secret)));
    assert.equal(statSync(path.join(directory,"connector-vault.key")).mode & 0o777, 0o600);
    assert.equal(statSync(path.join(directory,"connector-vault.db")).mode & 0o777, 0o600);
    vault.close(); vault = createConnectorVault({ directory });
    assert.equal(vault.get(first,"serpapi").apiKey,secret);
    vault.remove(first,"serpapi"); assert.equal(vault.get(first,"serpapi"),null);
  } finally {vault.close();rmSync(directory,{recursive:true,force:true});}
});

test("connector vault rejects invalid scope and oversized or non-object credentials", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "zntx-vault-"));
  const vault=createConnectorVault({directory});
  try {
    assert.throws(()=>vault.get("invalid","serpapi"),/scope/);
    assert.throws(()=>vault.get("a".repeat(64),"arbitrary"),/scope/);
    assert.throws(()=>vault.set("a".repeat(64),"serpapi",[]),/object/);
    assert.throws(()=>vault.set("a".repeat(64),"serpapi",{apiKey:"x".repeat(100001)}),/limit/);
  }finally{vault.close();rmSync(directory,{recursive:true,force:true});}
});
