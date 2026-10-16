import React,{useState,useEffect,useRef} from 'react';
import {Link,useParams,useSearchParams} from 'react-router-dom';
import {Search,ArrowUpRight,ArrowRight,Bookmark,Check,Download,ExternalLink,Globe,Library,Upload,FileText,LoaderCircle,Database,AlertCircle} from 'lucide-react';
import {useApp,Button,Empty} from './App.jsx';
import {api,csv,download,sourceUrl,excerpt} from './lib.js';
import {researchSources} from './research-sources.js';
import AiPanel from './AiPanel.jsx';
const externalBase={scholar:'https://scholar.google.com/scholar?q=',google:'https://www.google.com/search?q=',patents:'https://patents.google.com/?q='};
export default function SourceWorkspace(){
 const {sourceId}=useParams();
 const [params,setParams]=useSearchParams();
 const definition=researchSources.find(s=>s.id===sourceId);
 const {library,savePaper,saveNote,notify}=useApp();
 const [query,setQuery]=useState(params.get('q')||'');
 const [result,setResult]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const request=useRef(null);
 const personal=['zotero','mendeley'].includes(sourceId);
 const external=!!externalBase[sourceId];
 const queryParam=params.get('q')||'';
 useEffect(()=>{setQuery(queryParam);setResult(null);setError('');if(queryParam&&!personal&&!external)search(queryParam);return()=>request.current?.abort();},[sourceId,queryParam]);
 async function search(text=query){
  if(!text.trim())return;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setError('');setResult(null);
  try{const data=await api('/api/sources/search?'+new URLSearchParams({source:sourceId,q:text.trim()}),{signal:controller.signal});if(!controller.signal.aborted)setResult(data);}
  catch(e){if(e.name!=='AbortError')setError(e.message);}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 if(!definition)return <section className="page"><Empty title="Choose a research source"><Link className="btn" to="/">Return home</Link></Empty></section>;
 const rows=(result?.results||[]).map(r=>({...r,authors:r.authors||[],citations:r.citations??null,abstract:r.abstract||'',source:r.source||definition.label}));
 const externalUrl=externalBase[sourceId]+encodeURIComponent(query.trim());
 const submit=e=>{e.preventDefault();if(query.trim()===queryParam)search();else setParams({q:query.trim()});};
 const saveAsNote=async r=>{try{await saveNote({title:r.title,content:r.abstract||r.description||'Source record saved for review.',sourceUrl:sourceUrl(r)||'',sourceTitle:r.title,citations:[{title:r.title,url:sourceUrl(r)||''}]});}catch(e){notify(e.message,true);}};
 return <section className="page source-workspace">
  <Link className="source-back" to="/"><ArrowRight size={14} style={{transform:'rotate(180deg)'}}/> All research sources</Link>
  <div className="source-page-heading"><span className="source-page-icon">{personal?<Library size={26}/>:external?<Globe size={26}/>:<Database size={26}/>}</span><div><span className="section-label">YOUR RESEARCH TOOLKIT</span><h1>{definition.label}</h1><p>{definition.description}</p></div><span className="source-mode">{personal?'Your references':external?'Search on source site':'Live source records'}</span></div>
  {personal?<div className="source-personal-grid">
   <article className="source-guide-card"><Upload size={26}/><h2>Bring your references with you</h2><p>Export a bibliography as an RIS file from {definition.label.replace(' Library','')}, then import it into My Library. Titles, authors, abstracts, and source links stay with your references.</p><Link className="btn primary" to="/library?import=ris">Import references <ArrowRight size={15}/></Link></article>
   <article className="source-guide-card"><Library size={26}/><h2>{sourceId==='zotero'?'Connect your Zotero library':'A home for your reading list'}</h2><p>{sourceId==='zotero'?'Connect your personal library in Integrations to import reference metadata. You can also use an RIS export without a connection.':'Organize imported sources into folders, write reading notes, and export a linked bibliography. Mendeley account synchronization is not connected.'}</p><Link className="btn" to={sourceId==='zotero'?'/integrations':'/library'}>{sourceId==='zotero'?'Open integrations':'Open My Library'} <ArrowUpRight size={15}/></Link></article>
  </div>:<>
   <form className="search-form source-search" onSubmit={external?e=>e.preventDefault():submit}><Search size={19}/><input aria-label={'Search '+definition.label} value={query} onChange={e=>setQuery(e.target.value)} placeholder={definition.placeholder}/>{external?<a className={`btn primary ${!query.trim()?'disabled-link':''}`} aria-disabled={!query.trim()} href={query.trim()?externalUrl:undefined} target="_blank" rel="noopener noreferrer">Open search <ArrowUpRight size={16}/></a>:<Button primary disabled={!query.trim()||busy} aria-label={'Search '+definition.label}>{busy?<LoaderCircle className="spin" size={17}/>:<>Search <ArrowRight size={16}/></>}</Button>}</form>
   {external?<div className="source-external-panel"><Globe size={30}/><h2>Search directly on {definition.label}</h2><p>Your search opens on the original service. You can save a useful result’s title, URL, and notes in My Library.</p><Link className="btn" to="/library?new=note">Save a source or note <Bookmark size={15}/></Link></div>:<>
    {busy&&<div className="source-loading" role="status"><LoaderCircle className="spin" size={24}/><p>Finding source records…</p><span>Every result links back to its original record.</span></div>}
    {error&&<div className="notice source-error" role="alert"><AlertCircle size={19}/><div><strong>We couldn’t reach this source</strong><p>{error}</p><Button onClick={()=>search()}>Try again</Button></div></div>}
    {result&&<>
     <div className="source-results-heading"><div><h2>{rows.length} source {rows.length === 1 ? 'record' : 'records'}</h2><p>{result.total!=null?`${Number(result.total).toLocaleString()} source matches · `:''}{result.source} · {new Date(result.retrievedAt).toLocaleDateString()}</p></div><Button icon={Download} disabled={!rows.length} onClick={()=>download('zntx-'+sourceId+'.csv',csv(rows),'text/csv')}>Export results</Button></div>
     {(result.warnings||[]).map(w=><p className="source-coverage" key={w}>{w}</p>)}
     {!!rows.length&&<AiPanel task="synthesis" prompt={`Help me understand these ${definition.label} records for the question: ${queryParam||query}. Clearly distinguish datasets, preprints, grant notices and software metadata from clinical study findings. Summarize only supplied source descriptions, cite sources, and state what remains unknown.`} evidence={rows.filter(r=>r.abstract).slice(0,12)} label="Explore these sources with ScrapeTx Ai"/>}
     <div className="source-result-list">{rows.map(r=>{const url=sourceUrl(r);const saved=library.some(p=>p.id===r.id);return <article key={r.id}><div className="source-record-top"><span className="tag">{r.type||definition.label}</span><span>{r.year||'Date unavailable'}</span></div><h3>{url?<a href={url} target="_blank" rel="noopener noreferrer">{r.title}<ArrowUpRight size={15}/></a>:r.title}</h3><p className="source-authors">{r.authors.slice(0,4).join(', ')||r.publisher||r.source}</p><p className="source-record-description">{excerpt(r.abstract,650)||'No description was supplied. Read the original record for details.'}</p><div className="source-record-actions"><Button icon={saved?Check:Bookmark} onClick={()=>savePaper(r)}>{saved?'Saved to library':'Save source'}</Button><button className="text-btn" onClick={()=>saveAsNote(r)}><FileText size={14}/>Save source note</button>{url&&<a href={url} target="_blank" rel="noopener noreferrer">Original record <ExternalLink size={13}/></a>}</div></article>;})}</div>
     {!rows.length&&<Empty icon={Search} title="No matching records">Try a broader topic or a different spelling.</Empty>}
    </>}
    {!result&&!busy&&!error&&<div className="source-external-panel"><Search size={28}/><h2>Follow your next question</h2><p>{sourceId==='python'?'Enter an exact package name, such as pandas, rdkit, or biopython.':'Search a topic to discover records from '+definition.label+'.'}</p></div>}
   </>}
  </>}
 </section>;
}
