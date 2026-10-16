import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:5180";
const a = randomBytes(32).toString("hex"),
  b = randomBytes(32).toString("hex");
const id = "disposable-verification-" + Date.now();
const call = async (token, method, path, data) => {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Workspace-Token": token },
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await r.json();
  assert.ok(r.ok, json.error || `HTTP ${r.status}`);
  return json;
};
await call(a, "PUT", "/api/records/notes/" + id, {
  id,
  title: "Disposable cloud verification",
  body: "Verify workspace isolation and updates.",
});
try {
  const own = await call(a, "GET", "/api/records/notes");
  const other = await call(b, "GET", "/api/records/notes");
  assert.ok(own.some((n) => n.id === id));
  assert.ok(!other.some((n) => n.id === id));
  await call(a, "PUT", "/api/records/notes/" + id, {
    id,
    title: "Updated verification",
  });
  assert.equal(
    (await call(a, "GET", "/api/records/notes")).find((n) => n.id === id).title,
    "Updated verification",
  );
  const noToken = await fetch(base + "/api/library");
  assert.equal(noToken.status, 401);
  console.log(
    "PASS: workspace create/read/update, cross-workspace isolation, and missing-token rejection.",
  );
} finally {
  await call(a, "DELETE", "/api/records/notes/" + id);
}
