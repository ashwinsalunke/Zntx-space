import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createConnectionsRouter } from "../server/connections.js";

async function withServer(fetchImpl, fn) {
  const records = new Map();
  const vault = {get:(token,provider)=>records.get(token+provider),set:(token,provider,value)=>records.set(token+provider,value),remove:(token,provider)=>records.delete(token+provider)};
  const app=express();app.use(express.json());app.use(createConnectionsRouter({vault,fetchImpl}));app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
  const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
  try {await fn(async(path,body,token="a".repeat(64),method=body?"POST":"GET")=>{const response=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method,headers:{"Content-Type":"application/json",...(token?{"X-Workspace-Token":token}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};},records);}finally{await new Promise(r=>server.close(r));}
}
test("search connection validates the account and exposes only workspace-scoped status",async()=>{
  const secret="a-private-serpapi-key-1234567890";
  let calls=0;
  await withServer(async(url,init)=>{calls++;const parsed=new URL(url);assert.equal(parsed.origin,"https://serpapi.com");assert.equal(parsed.pathname,"/account.json");assert.equal(parsed.searchParams.get("api_key"),secret);assert.equal(init.redirect,"error");return new Response(JSON.stringify({account_id:"test-account",email:"private@example.org",api_key:secret}));},async(call)=>{
    assert.equal((await call("/status",null,null)).status,401);
    assert.equal((await call("/serpapi",{apiKey:"bad"})).status,400);assert.equal(calls,0);
    assert.equal((await call("/serpapi",{apiKey:secret})).data.connected,true);
    const state=await call("/status");assert.equal(state.data.serpapi.configured,true);assert.ok(!JSON.stringify(state).includes(secret));assert.ok(!JSON.stringify(state).includes("private@example.org"));
    assert.equal((await call("/status",null,"b".repeat(64))).data.serpapi.configured,false);
    await call("/serpapi",null,"a".repeat(64),"DELETE");assert.equal((await call("/status")).data.serpapi.configured,false);
  });
});
test("failed account checks retain a working key and do not echo provider errors",async()=>{
  const first="first-valid-private-key-1234567",second="second-invalid-key-1234567890";
  await withServer(async url=>new URL(url).searchParams.get("api_key")===first?new Response(JSON.stringify({account_id:"valid"})):new Response(JSON.stringify({error:second}),{status:401}),async(call,records)=>{
    await call("/serpapi",{apiKey:first});
    const failure=await call("/serpapi",{apiKey:second});assert.equal(failure.status,401);assert.ok(!JSON.stringify(failure).includes(second));
    assert.equal(records.get("a".repeat(64)+"serpapi").apiKey,first);
  });
});
