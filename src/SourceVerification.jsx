import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolExamples } from "./tool-examples.js";
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Download, ExternalLink, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { Button } from "./App.jsx";
import { api, download } from "./lib.js";
import "./source-verification.css";

const safeUrl = value => {try{const url=new URL(value);return ["http:","https:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const text = value => typeof value === "string" ? value : "";
const statusLabels = {match:"Metadata matched",mismatch:"Metadata differs",notice:"Publication notice found","no-notice-returned":"No notice returned","not-found":"No matching record",unavailable:"Check unavailable","not-checked":"Not checked",indexed:"Currently indexed","not-currently-indexed":"Not currently indexed","approval-record-found":"Approval record found","application-record-found":"Application record found",approved:"Approval record found",found:"Record found"};
function Results({ result, onChoose }) {
  return <div className="verification-results"><div className="verification-result-heading"><span>Checked {new Date(result.checkedAt).toLocaleString()}</span><Button icon={Download} onClick={()=>download("zntx-source-checks.json",JSON.stringify(result,null,2),"application/json")}>Export checks</Button></div>
    {(result.checks || []).map((check,index)=>{const url=safeUrl(check.url);const source=typeof check.source === "string" ? check.source : check.source?.name;const warning=["mismatch","notice"].includes(check.status);return <article className={`verification-check ${warning ? "attention" : ""}`} key={check.id || index}><div className="verification-check-title">{warning?<AlertCircle size={18}/>:<ShieldCheck size={18}/>}<h3>{check.label || check.id}</h3><span>{statusLabels[check.status] || check.status?.replaceAll("-"," ")}</span></div><p>{text(check.detail)}</p>{check.coverage && <p className="verification-coverage">{text(check.coverage)}</p>}{url&&<a href={url} target="_blank" rel="noopener noreferrer">{source || "Original source"}<ExternalLink size={12}/></a>}{check.notices?.length>0&&<ul>{check.notices.map((notice,i)=>{const href=safeUrl(notice.url);return <li key={i}>{href?<a href={href} target="_blank" rel="noopener noreferrer">{notice.title || notice.type || "Publication notice"}<ExternalLink size={12}/></a>:notice.title || notice.type}{notice.date?` · ${notice.date}`:""}{notice.source?` · ${notice.source}`:""}</li>;})}</ul>}</article>;})}
    {safeUrl(result.crossmark?.recordUrl)&&<p className="verification-crossmark"><a href={result.crossmark.recordUrl} target="_blank" rel="noopener noreferrer">Open Crossmark for this DOI <ExternalLink size={12}/></a><span>{result.crossmark.detail}</span></p>}
    {result.candidates?.length>0&&<div className="verification-candidates"><h3>Choose the matching reference</h3><p>A similar title does not establish identity. Check the title, author, and year before selecting.</p>{result.candidates.map(candidate=><button key={candidate.doi} disabled={!onChoose} onClick={()=>onChoose?.(candidate)}><strong>{candidate.title}</strong><span>{candidate.authors?.join?.(", ")}{candidate.year?` · ${candidate.year}`:""}</span><span>{candidate.doi}</span></button>)}</div>}
    {result.applications?.length>0&&<div className="verification-applications"><h3>Returned FDA applications</h3>{result.applications.map(application=><article key={application.applicationNumber}><strong>{application.applicationNumber}</strong><p>{application.sponsor}{application.hasOriginalApproval?" · Original approval record present":" · Original approval not established in inspected submissions"}</p><ul>{application.products?.map((product,index)=><li key={product.productNumber || index}>{product.brandName || "Product name not supplied"}{product.activeIngredients?.length?` — ${product.activeIngredients.map(i=>`${i.name} ${i.strength}`).join("; ")}`:""}{product.marketingStatus?` · ${product.marketingStatus}`:""}</li>)}</ul>{safeUrl(application.url)&&<a href={application.url} target="_blank" rel="noopener noreferrer">View FDA application <ExternalLink size={12}/></a>}</article>)}</div>}
    <p className="verification-limits">{text(result.limitation) || text(result.coverage) || "Checks cover supplied publication and registry metadata. They do not certify scientific correctness or confirm that every claim is supported."}</p>
  </div>;
}

export function PaperVerification({ paper }) {
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const controller=useRef(null);
  useEffect(()=>{setResult(null);setError("");setBusy(false);return()=>controller.current?.abort();},[paper.id,paper.doi,paper.pmid,paper.title]);
  async function check(candidate) {
    controller.current?.abort();const next=new AbortController();controller.current=next;
    setBusy(true);setError("");
    try {const data=await api("/api/verification/paper",{method:"POST",signal:next.signal,body:JSON.stringify({doi:candidate?.doi || paper.doi || undefined,pmid:paper.pmid || undefined,title:paper.title || undefined,issn:Array.isArray(paper.issn)?paper.issn[0]:paper.issn || undefined})});if(!next.signal.aborted)setResult(data);}
    catch(e){if(!next.signal.aborted)setError(e.message);}finally{if(!next.signal.aborted)setBusy(false);}
  }
  return <section className="paper-verification"><div className="verification-inline-heading"><div><h3>Publication checks</h3><p>Check the source record, reported publication notices, and journal indexing.</p></div><Button icon={busy?LoaderCircle:ShieldCheck} disabled={busy} onClick={()=>check()}>{busy?"Checking sources…":result?"Check again":"Check publication"}</Button></div>{error&&<p className="verification-error" role="alert">{error}</p>}{result&&<Results result={result} onChoose={busy?undefined:check}/>}</section>;
}

export function EvidenceVerification({ papers }) {
  const records=papers.filter(p=>p.abstract).slice(0,8);
  const [results,setResults]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function check() {
    const next=new AbortController();controller.current?.abort();controller.current=next;
    setBusy(true);setResults([]);setError("");
    for(const paper of records) {
      if(next.signal.aborted) break;
      try {const data=await api("/api/verification/paper",{method:"POST",signal:next.signal,body:JSON.stringify({doi:paper.doi || undefined,pmid:paper.pmid || undefined,title:paper.title})});if(!next.signal.aborted)setResults(previous=>[...previous,{paper,data}]);}
      catch(e){if(!next.signal.aborted){setError(e.message);break;}}
    }
    if(!next.signal.aborted)setBusy(false);
  }
  return <section className="evidence-verification"><div className="verification-inline-heading"><div><h3>External source checks</h3><p>Check up to {records.length} abstracts supplied to this report. These checks assess records and notices, not study validity.</p></div><Button icon={busy?LoaderCircle:ShieldCheck} disabled={busy || !records.length} onClick={check}>{busy?`${results.length}/${records.length} checked…`:"Check report sources"}</Button></div>{error&&<p className="verification-error" role="alert">{error}</p>}{results.map(({paper,data})=><details key={paper.id} className="evidence-check-record"><summary>{paper.title} <span>{data.checks?.some(c=>["notice","mismatch"].includes(c.status))?"Review flagged records":"View check results"}</span></summary><Results result={data}/></details>)}</section>;
}

export default function SourceVerification() {
  const [params]=useSearchParams();
  const [kind,setKind]=useState(params.get("kind") === "drug" ? "drug" : "paper"),[query,setQuery]=useState(params.get("q") || ""),[issn,setIssn]=useState("");
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  async function submit(e, candidate) {
    e?.preventDefault();const next=new AbortController();controller.current?.abort();controller.current=next;
    setBusy(true);setError("");setResult(null);
    const q=query.trim(),doi=q.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"").replace(/^doi:\s*/i,"");
    const body=candidate?{doi:candidate.doi,title:q}:/^10\.\d{4,9}\//.test(doi)?{doi}:/^(?:PMID:\s*)?\d+$/i.test(q)?{pmid:q.replace(/^PMID:\s*/i,"")}:{title:q};
    if(issn.trim())body.issn=issn.trim();
    try {const data=await api(kind === "paper" ? "/api/verification/paper" : "/api/verification/drug?q="+encodeURIComponent(q),kind === "paper" ? {method:"POST",signal:next.signal,body:JSON.stringify(body)} : {signal:next.signal});if(!next.signal.aborted)setResult(data);}
    catch(failure){if(!next.signal.aborted)setError(failure.message);}finally{if(!next.signal.aborted)setBusy(false);}
  }
  return <section className="page source-verification-page"><header className="page-heading"><div><h1>Check your sources</h1><p>Trace a reference to its original record and inspect reported publication updates.</p></div><ShieldCheck size={29}/></header><div className="verification-tabs">{[["paper","Research paper"],["drug","US drug approval"]].map(([id,label])=><button key={id} aria-pressed={kind === id} disabled={busy} onClick={()=>{setKind(id);setResult(null);setError("");}}>{label}</button>)}</div><PromptSuggestions key={kind} examples={kind === "paper" ? toolExamples.verification : toolExamples.drugCheck} value={query} onChoose={setQuery} disabled={busy} inputId="verification-query" /><form className="verification-form" onSubmit={submit}><label htmlFor="verification-query">{kind === "paper"?"DOI, PMID, or paper title":"Drug name or application number"}</label><div><Search size={19}/><input id="verification-query" value={query} onChange={e=>setQuery(e.target.value)} maxLength={300} required placeholder={kind === "paper"?"e.g. 10.1056/NEJMoa2307563":"e.g. Ozempic"}/><Button primary disabled={!query.trim()||busy} icon={busy?LoaderCircle:ShieldCheck}>{busy?"Checking…":"Check source"}</Button></div>{kind === "paper"&&<details><summary>Journal lookup</summary><label htmlFor="verification-issn">ISSN (optional)</label><input id="verification-issn" value={issn} onChange={e=>setIssn(e.target.value)} maxLength={9} placeholder="e.g. 0028-4793"/></details>}</form>{error&&<p className="verification-error" role="alert">{error}</p>}{result?<Results result={result} onChoose={busy?undefined:candidate=>submit(null,candidate)}/>:!busy&&<div className="verification-intro"><h2>Know what was checked</h2><div><article><CheckCircle2 size={21}/><h3>Publication identity</h3><p>Match publisher-deposited metadata and biomedical records to your reference.</p></article><article><AlertCircle size={21}/><h3>Reported updates</h3><p>Inspect corrections, retractions, and journal indexing. Missing data remains unknown.</p></article><article><ShieldCheck size={21}/><h3>Approval records</h3><p>Look up US FDA application and product records separately from research articles.</p></article></div><p>No single badge establishes that a finding is scientifically correct. <Link to="/integrations">View connected services</Link></p></div>}</section>;
}
