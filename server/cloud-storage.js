import { setTimeout as delay } from 'node:timers/promises';

const failure = (message, code, status = 503, retryable = false) => Object.assign(new Error(message), {code,status,retryable});
export function cloudStorageError(status, providerCode = '') {
  if ([401,403].includes(status)) return failure('Cloud storage access was rejected. Check the project connection and workspace permissions.', 'CLOUD_ACCESS_DENIED', 403);
  if (status === 404 || providerCode === 'PGRST205') return failure('The cloud workspace table is unavailable. Check the project storage setup.', 'CLOUD_TABLE_UNAVAILABLE');
  if (providerCode === '23514') return failure('Cloud storage rejected this record because it exceeds a storage limit or does not match the required format. Keep this page open and export your research before editing it.', 'CLOUD_RECORD_REJECTED', 400);
  if (['22P05','22021'].includes(providerCode)) return failure('The source text contains a character cloud storage cannot accept. Keep this page open and export your research.', 'CLOUD_TEXT_REJECTED', 400);
  if (status === 429 || status >= 500) return failure('Cloud storage is temporarily unavailable or still starting. Your work has not synced yet. Keep this page open and retry shortly.', 'CLOUD_TEMPORARILY_UNAVAILABLE', 503, true);
  return failure('Cloud storage could not accept this request. Your changes have not been saved. Keep this page open and retry.', 'CLOUD_REQUEST_REJECTED', 400);
}

// Every operation here is idempotent: reads, deterministic filtered deletes,
// and record upserts with identical bodies. Do not use this for append-only POSTs.
export function createCloudStorage({url,key,fetchImpl=globalThis.fetch,timeoutMs=18000,retryDelayMs=350,wait=delay} = {}) {
  return async function cloud(token,method,query,body) {
    const signal=AbortSignal.timeout(timeoutMs);
    const options={method,headers:{apikey:key,'X-Workspace-Token':token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:body ? JSON.stringify(body):undefined,signal};
    for(let attempt=0;attempt<3;attempt++) {
      let response;
      try { response=await fetchImpl(`${url}/rest/v1/zntx_records?${query}`,options); }
      catch(error) {
        if(!signal.aborted && attempt<2) {try {await wait(retryDelayMs*(attempt+1),undefined,{signal});} catch {throw failure('Cloud storage took too long to respond. Keep this page open and retry.','CLOUD_CONNECTION_UNAVAILABLE',503,true);} continue;}
        throw failure('Cloud storage cannot be reached. Your work has not synced yet. Keep this page open and retry shortly.','CLOUD_CONNECTION_UNAVAILABLE',503,true);
      }
      if(response.ok) {
        if(response.status===204) return [];
        try {return await response.json();} catch {throw failure('Cloud storage returned an incomplete response. Keep this page open and retry.','CLOUD_INVALID_RESPONSE',502,true);}
      }
      if(response.status>=500 && attempt<2 && !signal.aborted) {
        await response.body?.cancel();
        try {await wait(retryDelayMs*(attempt+1),undefined,{signal});} catch {throw failure('Cloud storage took too long to respond. Keep this page open and retry.','CLOUD_CONNECTION_UNAVAILABLE',503,true);}
        continue;
      }
      const error=await response.json().catch(()=>({}));
      const code=typeof error.code==='string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : '';
      console.error('Supabase storage error:',response.status,code,method);
      throw cloudStorageError(response.status,code);
    }
  };
}
