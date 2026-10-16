import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ExternalLink, Globe, Library, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { api } from "./lib.js";
import { Button, useApp } from "./App.jsx";
import "./external-connections.css";

export default function ExternalConnections() {
  const { notify, refreshLibrary } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(null), [libraries, setLibraries] = useState(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState("");
  const [serpKey, setSerpKey] = useState(""), [zoteroKey, setZoteroKey] = useState("");
  const [libraryId, setLibraryId] = useState(""), [libraryType, setLibraryType] = useState("users");
  const [clientId, setClientId] = useState(""), [clientSecret, setClientSecret] = useState("");
  const [summary, setSummary] = useState({});
  async function load() {
    const [a,b] = await Promise.all([api("/api/connections/status"),api("/api/library-sync/status")]);
    setSearch(a); setLibraries(b);
  }
  useEffect(() => {let active=true;load().catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  useEffect(() => {
    const state=params.get("mendeley");
    if (!state) return;
    if(state === "connected") notify("Mendeley authorized. Sync your references when ready.");
    else setError("Mendeley authorization did not complete. Check the registered callback URL and try again.");
    const next=new URLSearchParams(params);next.delete("mendeley");setParams(next,{replace:true});load().catch(e=>setError(e.message));
  },[params]);
  async function run(name, action) {
    setBusy(name);setError("");
    try {await action();await load();}
    catch(e){setError(e.message);}finally{setBusy("");}
  }
  async function sync(provider) {
    await run(provider+"-sync",async()=>{
      const result=await api(`/api/library-sync/${provider}/sync`,{method:"POST",body:"{}"});
      setSummary(previous=>({...previous,[provider]:result}));
      await refreshLibrary();
      notify(`${provider === "zotero" ? "Zotero" : "Mendeley"}: ${result.imported || 0} imported, ${result.updated || 0} updated${result.partial ? ". More records remain; continue sync." : "."}`);
    });
  }
  const syncControls = provider => {
    const state=libraries?.[provider];
    return <><div className="ec-actions"><Button primary icon={busy === provider+"-sync" ? LoaderCircle : RefreshCw} disabled={!!busy || !state?.connected} onClick={()=>sync(provider)}>{busy === provider+"-sync" ? "Syncing…" : state?.continuationAvailable ? "Continue sync" : "Sync references"}</Button><Button icon={Unplug} disabled={!!busy || (!state?.connected && !state?.pendingAuthorization)} onClick={()=>run(provider+"-disconnect",async()=>{await api(`/api/library-sync/${provider}`,{method:"DELETE"});setSummary(p=>({...p,[provider]:null}));notify("Disconnected. Imported references remain in My Library.");})}>Disconnect</Button></div>
    {state?.lastSyncAt && <p className="ec-meta">Last sync: {new Date(state.lastSyncAt).toLocaleString()}</p>}
    {summary[provider] && <div className="ec-sync-summary" role="status"><strong>{summary[provider].imported || 0} imported · {summary[provider].updated || 0} updated</strong>{summary[provider].partial && <p>This batch is saved. Continue sync to retrieve the remaining records.</p>}{(summary[provider].warnings || []).map(w=><p key={w}>{w}</p>)}<Link to="/library?tab=papers">Open My Library</Link></div>}</>;
  };
  return <section className="external-connections" aria-labelledby="ec-heading">
    <div className="ec-heading"><div><h2 id="ec-heading">Connect your research accounts</h2><p>Keys stay encrypted on this server, scoped to your private workspace, and out of library exports.</p></div><Button icon={RefreshCw} disabled={!!busy} onClick={()=>run("refresh",load)}>Refresh</Button></div>
    {error && <p className="ec-error" role="alert">{error}</p>}
    <div className="ec-grid">
      <article className="ec-card"><span className="ec-icon blue"><Globe size={21}/></span><h3>Google Search, Scholar & Patents</h3><span className="ec-status">{search?.serpapi.configured ? "Connected through SerpAPI" : "SerpAPI key required"}</span><p>Retrieve results inside scrapeTx using SerpAPI, a third-party search provider. Search snippets retain their original links.</p>
        <form onSubmit={e=>{e.preventDefault();run("serpapi",async()=>{await api("/api/connections/serpapi",{method:"POST",body:JSON.stringify({apiKey:serpKey.trim()})});setSerpKey("");notify("SerpAPI key validated. All three Google search tools are ready.");});}}>
          <label htmlFor="ec-serp-key">SerpAPI key</label><input id="ec-serp-key" type="password" autoComplete="off" value={serpKey} onChange={e=>setSerpKey(e.target.value)} placeholder="Paste your key here" required maxLength={200}/><div className="ec-actions"><Button primary disabled={!!busy || !serpKey.trim()}>{busy === "serpapi" ? "Checking…" : search?.serpapi.configured ? "Replace key" : "Connect searches"}</Button><a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer">Get a key <ExternalLink size={12}/></a></div>
        </form>
        {search?.serpapi.configured && <><p className="ec-meta">Key checked {new Date(search.serpapi.testedAt).toLocaleString()}</p><div className="ec-links"><Link to="/sources/scholar">Scholar</Link><Link to="/sources/google">Web search</Link><Link to="/sources/patents">Patents</Link></div><button className="ec-disconnect" disabled={!!busy} onClick={()=>run("serpapi-disconnect",()=>api("/api/connections/serpapi",{method:"DELETE"}))}>Disconnect search key</button></>}
        <p className="ec-footnote">Google's AI key is separate from this search key. Provider quotas and billing apply.</p>
      </article>
      <article className="ec-card"><span className="ec-icon red"><Library size={21}/></span><h3>Zotero</h3><span className="ec-status">{libraries?.zotero.connected ? "Library connected" : "Read-only library key required"}</span><p>Pull new and updated reference metadata into My Library. Repeated syncs update the same references and preserve your local notes.</p>
        <details open={!libraries?.zotero.connected}><summary>{libraries?.zotero.connected ? "Change library connection" : "Connect a library"}</summary><form onSubmit={e=>{e.preventDefault();run("zotero",async()=>{await api("/api/library-sync/zotero/connect",{method:"POST",body:JSON.stringify({apiKey:zoteroKey.trim(),libraryId:libraryId.trim() || undefined,libraryType})});setZoteroKey("");notify("Zotero key validated. Sync your library when ready.");});}}>
          <label htmlFor="ec-zotero-key">Zotero API key</label><input id="ec-zotero-key" type="password" autoComplete="off" maxLength={200} required value={zoteroKey} onChange={e=>setZoteroKey(e.target.value)}/>
          <label htmlFor="ec-library-type">Library</label><select id="ec-library-type" value={libraryType} onChange={e=>setLibraryType(e.target.value)}><option value="users">My personal library</option><option value="groups">Group library</option></select>
          <label htmlFor="ec-library-id">{libraryType === "groups" ? "Group ID" : "User ID (optional; discovered from your key)"}</label><input id="ec-library-id" inputMode="numeric" pattern="[0-9]*" value={libraryId} onChange={e=>setLibraryId(e.target.value)} required={libraryType === "groups"}/>
          <div className="ec-actions"><Button primary disabled={!!busy || !zoteroKey.trim()}>{busy === "zotero" ? "Checking…" : "Connect Zotero"}</Button><a href="https://www.zotero.org/settings/keys/new" target="_blank" rel="noopener noreferrer">Create read-only key <ExternalLink size={12}/></a></div>
        </form></details>{syncControls("zotero")}
      </article>
      <article className="ec-card"><span className="ec-icon violet"><Library size={21}/></span><h3>Mendeley</h3><span className="ec-status">{libraries?.mendeley.connected ? "Account authorized" : libraries?.mendeley.pendingAuthorization ? "Authorization pending" : "Account authorization required"}</span><p>Connect using Mendeley's authorization page, then pull reference metadata into My Library. Your Mendeley password is never collected here.</p>
        <details open={!libraries?.mendeley.connected}><summary>{libraries?.mendeley.connected ? "Reconnect account" : "Authorize Mendeley"}</summary><p className="ec-meta">Register an application in the Mendeley developer portal using this callback URL:</p><code className="ec-callback">{libraries?.callbackUrl || "Loading callback URL…"}</code><form onSubmit={e=>{e.preventDefault();run("mendeley",async()=>{const result=await api("/api/library-sync/mendeley/connect",{method:"POST",body:JSON.stringify({clientId:clientId.trim(),clientSecret:clientSecret.trim()})});setClientSecret("");const value=new URL(result.authorizationUrl || result.url);if(value.protocol !== "https:" || value.hostname !== "api.mendeley.com")throw Error("Mendeley returned an unexpected authorization address.");window.location.assign(value.href);});}}>
          <label htmlFor="ec-mendeley-id">Application ID</label><input id="ec-mendeley-id" autoComplete="off" value={clientId} onChange={e=>setClientId(e.target.value)} required maxLength={200}/><label htmlFor="ec-mendeley-secret">Application secret</label><input id="ec-mendeley-secret" type="password" autoComplete="off" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} required maxLength={500}/><div className="ec-actions"><Button primary disabled={!!busy || !clientId.trim() || !clientSecret.trim()}>{busy === "mendeley" ? "Preparing…" : "Authorize on Mendeley"}</Button><a href="https://dev.mendeley.com/" target="_blank" rel="noopener noreferrer">Developer portal <ExternalLink size={12}/></a></div>
        </form><p className="ec-footnote">Mendeley requests its documented “all” authorization scope. This connector uses read-only reference requests.</p></details>{syncControls("mendeley")}
      </article>
    </div>
    <p className="ec-footer"><CheckCircle2 size={15}/> Library sync pulls source metadata. It does not upload changes or delete records from your Zotero or Mendeley accounts.</p>
  </section>;
}
