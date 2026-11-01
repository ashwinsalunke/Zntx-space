import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:5180";
const a = randomBytes(32).toString("hex"),
  b = randomBytes(32).toString("hex");
const id = "disposable-verification-" + Date.now();
const turnId=id+"-turn", chatId=id+"-chat";
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
  const source={id:"S1",title:"Disposable research source",url:"https://example.org/source",abstract:"A source passage containing Unicode: α, β, ≥, and scientific uncertainty.",kind:"abstract"};
  const turn={id:turnId,type:"research-chat-turn",chatId,query:"Disposable research-answer storage check",result:{query:"diagnostic",sources:[],papers:[source],coverage:{retrievedRecords:1,withAbstract:1}},ai:{text:"A bounded claim [[cite:S1]].",citations:[source],evidenceSources:[source],activity:{query:"diagnostic",sources:[]}}};
  await call(a,"PUT","/api/records/notes/"+turnId,turn);
  await call(a,"PUT","/api/records/chats/"+chatId,{id:chatId,title:"Disposable persistence check",turnIds:[turnId]});
  assert.deepEqual((await call(a,"GET","/api/records/notes/"+turnId)).ai.citations,[source]);
  assert.deepEqual((await call(a,"GET","/api/records/chats/"+chatId)).turnIds,[turnId]);
  const foreignTurn=await fetch(base+"/api/records/notes/"+turnId,{headers:{"X-Workspace-Token":b}});
  assert.equal(foreignTurn.status,404);
  console.log("PASS: complete research-answer, evidence passages, chat manifest, Unicode, and direct reload.");
  const noToken = await fetch(base + "/api/library");
  assert.equal(noToken.status, 401);
  console.log(
    "PASS: workspace create/read/update, cross-workspace isolation, and missing-token rejection.",
  );
} finally {
  await call(a, "DELETE", "/api/records/chats/" + chatId);
  await call(a, "DELETE", "/api/records/notes/" + turnId);
  await call(a, "DELETE", "/api/records/notes/" + id);
}
