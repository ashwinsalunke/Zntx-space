import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, ExternalLink, FileText, Search, ChevronRight, LoaderCircle, RotateCcw, Bookmark, Check } from 'lucide-react';
import { api } from './lib.js';
import { useProjectApi } from './useProjectApi.js';
import { useApp } from './app-context.js';
import { safeEvidenceUrl, evidenceMetadata, cleanClaim, enrichCitations, searchProvenance, validateSupportOutput } from '../shared/claim-evidence.js';
import { pdfReaderLink } from './SourcePdfReader.jsx';
import './claim-evidence.css';
export const EvidenceContext = createContext(null);
export const useClaimEvidence = () => useContext(EvidenceContext);
const checks = new Map();
const kindNames = {'abstract':'Abstract','pdf-page':'Extracted PDF page','full-text-excerpt':'Full-text excerpt','search-snippet':'Search snippet','document-text':'Document passage'};
export const evidenceKind = source => source.kind || (source.coverage === 'full-text' ? 'full-text-excerpt' : 'abstract');
export const sourceDomain = source => {try {return new URL(source.url || source.pdf).hostname.replace(/^www\./,'');}catch{return source.page ? 'PDF' : 'Source';}};
export function SearchActivity({activity, citations=[], busy=false, defaultOpen=false}) {
  const searches=activity ? [activity,...(activity.additionalSearches || [])].filter(s=>s.query || s.sources?.length) : [];
  if(!searches.length && !citations.length && !busy) return null;
  return <details className="evidence-activity" open={defaultOpen ? true : undefined}><summary><Search size={14}/>{busy ? 'Reviewing supplied evidence' : searches.length ? `Search activity · ${searches.length} ${searches.length===1?'query':'queries'}` : `${citations.length} supplied ${citations.length===1?'source':'sources'}`}<ChevronRight size={14}/></summary><div>
    {!searches.length && <p>No web search is recorded for this answer. It uses the supplied source text.</p>}
    {searches.map((search,i)=><section key={i}><strong>Search: {search.query || 'Recorded source search'}</strong>{search.retrievedAt && <small>{new Date(search.retrievedAt).toLocaleString()}</small>}<ul>{(search.sources || []).map((provider,index)=><li key={index}>{safeEvidenceUrl(provider.url) ? <a href={safeEvidenceUrl(provider.url)} target="_blank" rel="noreferrer">{provider.name || provider.source || 'Research provider'} <ExternalLink size={12}/></a> : <span>{provider.name || provider.source || 'Research provider'}</span>}<small>{provider.status === 'ok' ? typeof provider.returned === 'number' ? `${provider.returned} records returned` : 'Search completed · count unavailable' : provider.status === 'error' ? 'Search failed — partial coverage' : provider.status || 'Recorded search'}</small></li>)}</ul>{search.partial && <p>Some providers did not respond. These are partial results.</p>}</section>)}
    {!!citations.length && <section><strong>Evidence supplied to this answer</strong><ul>{citations.map((source,i)=><li key={source.id || i}><span>{source.title}</span><small>{kindNames[evidenceKind(source)] || 'Source text'}{source.page ? ` · PDF page ${source.page}` : ''}{!source.abstract ? ' · text not stored' : ''}</small></li>)}</ul><p>Retrieved metadata, supplied passages, and reading the complete paper are different steps. Only the recorded steps are shown here.</p></section>}
  </div></details>;
}
export function EvidenceScope({citations=[], evidence=[], activity, onOpenPage, savedAssessment, children}) {
  const [selection,setSelection]=useState(null);
  const sources=useMemo(()=>enrichCitations(citations,evidence),[citations,evidence]);
  return <EvidenceContext.Provider value={{sources,open:(claim,ids)=>setSelection({claim:cleanClaim(claim),ids})}}>{children}{selection && <EvidenceDrawer claim={selection.claim} sources={sources.filter(s=>selection.ids.includes(s.id))} activity={activity} onOpenPage={onOpenPage} savedAssessment={savedAssessment} onClose={()=>setSelection(null)}/>}</EvidenceContext.Provider>;
}
export function EvidenceDrawer({claim, sources, activity, onOpenPage, savedAssessment, onClose}) {
  const app=useApp() || {}, projectApi=useProjectApi();
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[tab,setTab]=useState('evidence'),[checkedCount,setCheckedCount]=useState(0);
  const dialog=useRef(), heading=useId(), opener=useRef(globalThis.document?.activeElement);
  const supplied=useMemo(()=>sources.map(s=>evidenceMetadata(s)),[sources]);
  const key=JSON.stringify([claim,supplied]);
  useEffect(()=>{const node=dialog.current;if(node.showModal)node.showModal();else node.setAttribute('open','');return()=>{node.close?.();opener.current?.focus?.();};},[]);
  useEffect(()=>{
    const control=new AbortController();setBusy(false);setError('');setResult(null);setSaved(false);setCheckedCount(0);
    if(savedAssessment && !retry && cleanClaim(savedAssessment.claim) === claim) {
      try { const validated=validateSupportOutput(JSON.stringify(savedAssessment),supplied); setResult({...savedAssessment,assessments:validated}); return; } catch { /* Recheck changed evidence instead of showing stale support. */ }
    }
    if(checks.has(key) && !retry) {setResult(checks.get(key));return;}
    if(!claim || !supplied.some(s=>s.abstract)) return;
    setBusy(true);
    (async()=>{
      let combined={claim,assessments:[]};
      for(let start=0;start<supplied.length;start+=6){
        const batch=supplied.slice(start,start+6);
        const data=batch.some(s=>s.abstract) ? await api('/api/ai/evidence',{method:'POST',signal:control.signal,body:JSON.stringify({claim,evidence:batch})}) : {claim,assessments:batch.map(s=>({sourceId:s.id,relation:'not-assessed',quote:'',explanation:'No passage text is stored for this source.'}))};
        if(control.signal.aborted)return;
        combined={...combined,...data,assessments:[...combined.assessments,...data.assessments]};
        setCheckedCount(start+batch.length);setResult(combined);
      }
      checks.set(key,combined);if(checks.size>50)checks.delete(checks.keys().next().value);
    })().catch(e=>{if(!control.signal.aborted)setError(e.message);}).finally(()=>{if(!control.signal.aborted)setBusy(false);});
    return()=>control.abort();
  },[key,retry]);
  const labels={supports:'Supports this claim',partial:'Partially supports this claim','does-not-support':'Does not support this claim',contradicts:'Contradicts this claim','not-assessed':'Not assessed'};
  async function save(){setSaving(true);try{await projectApi('/api/records/notes/'+crypto.randomUUID(),{method:'PUT',body:JSON.stringify({type:'claim-evidence',title:'Evidence check: '+claim.slice(0,120),content:claim+' '+sources.map(s=>`[[cite:${s.id}]]`).join(' '),citations:supplied,assessment:result,activity:searchProvenance(activity),createdAt:new Date().toISOString()})});setSaved(true);}catch(e){setError(e.message);}finally{setSaving(false);}}
  return createPortal(<dialog ref={dialog} className="evidence-drawer" aria-labelledby={heading} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}><div className="evidence-drawer-inner"><header><div><span>SCRAPETX · SOURCES</span><h2 id={heading}>Evidence for this claim</h2></div><button className="evidence-icon-btn" aria-label="Close evidence" onClick={onClose} autoFocus><X size={20}/></button></header><div className="evidence-drawer-tabs"><button aria-pressed={tab==='evidence'} onClick={()=>setTab('evidence')}>Evidence <span>{sources.length}</span></button><button aria-pressed={tab==='activity'} onClick={()=>setTab('activity')}>Search activity</button></div>
    <div className="evidence-drawer-body">{tab==='activity' ? <SearchActivity activity={activity} citations={sources} defaultOpen/> : <><p className="evidence-section-label">AI CLAIM</p><blockquote className="evidence-claim-quote">{claim || 'Citation selected. Inspect the source passage below.'}</blockquote>{busy && <p role="status" className="evidence-check-status"><LoaderCircle size={15} className="spin"/>Comparing this claim with the cited passages…{supplied.length>6 ? ` (${checkedCount} of ${supplied.length})` : ''}</p>}{error && <div role="alert" className="evidence-check-error">{error}<button onClick={()=>setRetry(n=>n+1)} disabled={busy}><RotateCcw size={14}/> Retry support check</button></div>}
    {sources.map((source,index)=>{const assessment=result?.assessments?.find(a=>a.sourceId===source.id);const pdf=source.pdf || source.librarySync?.provider==='mendeley';return <article className="evidence-source-card" key={source.id}><div className="evidence-source-heading"><span className="evidence-source-number">{index+1}</span><div><small>{sourceDomain(source)}</small><h3>{source.title}</h3></div></div><div className="evidence-source-meta"><span>{kindNames[evidenceKind(source)] || 'Source passage'}</span><span>{source.page ? `PDF page ${source.page}` : 'PDF page unavailable'}</span></div>
      <p className={'evidence-support-label relation-'+(assessment?.relation || 'pending')}>{assessment ? 'AI assessment · '+labels[assessment.relation] : source.abstract ? 'Cited source · support not checked yet' : 'Metadata only · no passage stored'}</p>
      {assessment?.quote && <><p className="evidence-section-label">MATCHED PASSAGE</p><blockquote className="evidence-passage"><mark>{assessment.quote}</mark></blockquote><small>Exact wording matched in the supplied {kindNames[evidenceKind(source)]?.toLowerCase() || 'text'}.</small></>}
      {assessment?.explanation && <p className="evidence-explanation">{assessment.explanation}</p>}
      {source.abstract && <details className="evidence-original-text" open={!assessment}><summary>View supplied source text</summary><p>{source.abstract}</p></details>}
      {!source.abstract && <p>No supporting passage is stored with this citation. A valid identifier alone does not establish support. Open the paper to check it.</p>}
      <div className="evidence-source-actions">{safeEvidenceUrl(source.url) && <a href={safeEvidenceUrl(source.url)} target="_blank" rel="noreferrer">Original paper <ExternalLink size={14}/></a>}{source.page && onOpenPage ? <button onClick={()=>{onOpenPage(source);onClose();}}><FileText size={14}/>Open PDF page {source.page}</button> : pdf ? <Link to={pdfReaderLink(source)+(source.page?'&page='+source.page:'')} onClick={onClose}><FileText size={14}/>{source.page ? `Open PDF page ${source.page}` : 'Read PDF'}</Link> : null}</div>
      {source.page && !onOpenPage && !pdf && <small>Page location is saved; reattach the PDF to open that page.</small>}
    </article>;})}
    {!sources.length && <p>No source record is available for this citation.</p>}
    {result?.checkedAt && <p className="evidence-limit">Checked {new Date(result.checkedAt).toLocaleString()} · <button className="evidence-inline-action" onClick={()=>setRetry(n=>n+1)} disabled={busy}>Recheck support</button></p>}
    <p className="evidence-limit">The support check is an AI assessment of the supplied passage, with exact excerpt matching. It does not verify scientific truth or replace reading the paper. PDF page numbers refer to extracted file pages when available.</p>
    {result && <button className="evidence-save" onClick={save} disabled={saving || saved || busy}>{saved ? <Check size={15}/> : <Bookmark size={15}/>}{saved ? 'Evidence check saved' : saving ? 'Saving…' : app.activeProject ? 'Save evidence check to project' : 'Save evidence check to library'}</button>}</> }</div></div></dialog>,document.body);
}
