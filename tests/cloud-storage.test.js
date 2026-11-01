import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStorage,cloudStorageError} from '../server/cloud-storage.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
test('cloud saves recover from temporary gateway 521 failures using the identical upsert and shared timeout',async()=>{
 const requests=[],pauses=[];
 const cloud=createCloudStorage({url:'https://example.supabase.co',key:'private-fixture-key',wait:async n=>pauses.push(n),fetchImpl:async(url,options)=>{requests.push({url,...options});return requests.length<3 ? new Response('not ready',{status:521}):json([{id:'answer'}]);}});
 assert.deepEqual(await cloud('owner','POST','on_conflict=workspace_hash,collection,id',{id:'answer',data:{text:'Preserved answer'}}),[{id:'answer'}]);
 assert.equal(requests.length,3);assert.deepEqual(pauses,[350,700]);assert.equal(requests[0].body,requests[2].body);assert.equal(requests[0].signal,requests[2].signal);
});
test('permanent cloud permission and record errors are not retried or disguised as temporary failures',async()=>{
 for(const [status,providerCode,expected] of [[403,'42501','CLOUD_ACCESS_DENIED'],[400,'23514','CLOUD_RECORD_REJECTED'],[400,'22P05','CLOUD_TEXT_REJECTED']]){
  let calls=0;const cloud=createCloudStorage({url:'https://example.supabase.co',key:'private-fixture-key',fetchImpl:async()=>{calls++;return json({code:providerCode,message:'private upstream detail'},status);}});
  await assert.rejects(cloud('owner','POST','',{}),e=>e.code===expected && !e.retryable && !e.message.includes('private upstream detail'));
  assert.equal(calls,1);
 }
});
test('persistent outages are bounded and do not expose provider payloads or authentication secrets',async()=>{
 let calls=0;const cloud=createCloudStorage({url:'https://example.supabase.co',key:'private-fixture-key',wait:async()=>{},fetchImpl:async()=>{calls++;return json({message:'private-fixture-key'},521);}});
 await assert.rejects(cloud('owner','GET',''),e=>e.code==='CLOUD_TEMPORARILY_UNAVAILABLE' && e.retryable && !e.message.includes('private-fixture-key'));assert.equal(calls,3);
 assert.equal(cloudStorageError(429).retryable,true);
});
test('network recovery, empty deletes and malformed responses remain explicit',async()=>{
 let calls=0;const cloud=createCloudStorage({url:'https://example.supabase.co',key:'key',wait:async()=>{},fetchImpl:async()=>{if(++calls===1)throw Error('connection reset');return new Response(null,{status:204});}});
 assert.deepEqual(await cloud('owner','DELETE','id=eq.disposable'),[]);assert.equal(calls,2);
 const malformed=createCloudStorage({url:'https://example.supabase.co',key:'key',fetchImpl:async()=>new Response('not JSON',{status:200})});
 await assert.rejects(malformed('owner','GET',''),e=>e.code==='CLOUD_INVALID_RESPONSE');
});
