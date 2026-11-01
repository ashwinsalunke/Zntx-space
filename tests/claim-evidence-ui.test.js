import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

test('clickable claims reveal exact passages, real search activity and PDF pages; evidence checks save under the active project', {timeout:30000}, async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 for(const k of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','localStorage','Event','MouseEvent','KeyboardEvent']) Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});
 globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const token='a'.repeat(64);localStorage.setItem('zntx-workspace-token',token);localStorage.setItem('scrapetx-project:'+token,'project-a');
 const before=globalThis.fetch,calls=[],records=[];
 const quote='The mouse study found an association between A and B.';
 const source={id:'S1',title:'Mouse association study',abstract:quote+' Causality was not tested.',url:'https://doi.org/10.1234/study',pdf:'https://example.org/study.pdf',page:4,kind:'pdf-page'};
 globalThis.fetch=async(url,o={})=>{calls.push({url,...o});if(url==='/api/ai/evidence')return new Response(JSON.stringify({claim:'A was associated with B',assessments:JSON.parse(o.body).evidence.map(s=>({sourceId:s.id,relation:'partial',quote,quoteMatched:true,explanation:'The evidence concerns mice and does not establish a causal effect.'}))}));if(String(url).startsWith('/api/records/notes/')){records.push(JSON.parse(o.body));return new Response('{"ok":true}');}throw Error('Unexpected request '+url);};
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom');
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});let root;
 const wait=async(fn,label)=>{for(let i=0;i<150;i++){if(fn())return;await act(async()=>{await new Promise(r=>setTimeout(r,10));});}assert.fail(label);};
 const click=async(el)=>{assert.ok(el);await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));};
 const button=(text)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 try{
  const {ResearchText}=await vite.ssrLoadModule('/src/AiPanel.jsx'),{AppContext}=await vite.ssrLoadModule('/src/app-context.js');
  const activity={query:'biofilm antibiotics',retrievedAt:'2026-11-01T00:00:00Z',sources:[{name:'PubMed',url:'https://pubmed.ncbi.nlm.nih.gov/',status:'ok',returned:12},{name:'Unavailable provider',status:'error'}],partial:true};
  const render=async(citations,text='Background without a linked source. A was associated with B [[cite:S1]].',savedAssessment)=>{if(root)await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(AppContext.Provider,{value:{activeProject:{id:'project-a',title:'Antibiotics'}}},React.createElement(ResearchText,{text,citations,prefix:'answer',activity,savedAssessment})))));};
  await render([source]);assert.equal(document.querySelectorAll('.evidence-claim-text').length,1);
  await click(document.querySelector('.evidence-claim-text'));await wait(()=>document.querySelector('.evidence-passage mark'),'matched passage');
  assert.equal(document.querySelector('.evidence-passage mark').textContent,quote);assert.match(document.querySelector('.evidence-support-label').textContent,/Partially supports/);
  assert.ok([...document.querySelectorAll('a')].some(a=>a.href.includes('/read-pdf?')&&a.href.endsWith('&page=4')));
  assert.ok(document.querySelector('.evidence-source-actions a').href.startsWith('https://doi.org/'));
  await click(button('Search activity'));assert.match(document.querySelector('.evidence-drawer-body').textContent,/biofilm antibiotics/);assert.match(document.querySelector('.evidence-drawer-body').textContent,/Search failed/);assert.match(document.querySelector('.evidence-drawer-body').textContent,/partial results/);
  await click([...document.querySelectorAll('.evidence-drawer-tabs button')].find(b=>b.textContent.startsWith('Evidence')));await click(button('Save evidence check to project'));await wait(()=>records.length,'saved assessment');
  assert.equal(records[0].citations[0].page,4);assert.equal(records[0].assessment.assessments[0].quote,quote);assert.equal(calls.find(c=>c.url.startsWith('/api/records/')).headers['X-Research-Project'],'project-a');
  await click(document.querySelector('[aria-label="Close evidence"]'));assert.equal(document.querySelector('dialog'),null);
  const savedCount=calls.length;
  await render([source],'A different saved claim [[cite:S1]].',{claim:'A different saved claim',checkedAt:'2026-11-01T00:00:00Z',assessments:[{sourceId:'S1',relation:'partial',quote,explanation:'The saved check is restricted to the supplied mouse study.'}]});
  await click(document.querySelector('.evidence-chip'));await wait(()=>document.querySelector('.evidence-passage mark'),'reopened saved check');assert.equal(calls.length,savedCount,'Opening a valid saved check does not call AI again');
  await click(document.querySelector('[aria-label="Close evidence"]'));
  const count=calls.length;
  await render([{id:'S2',title:'Legacy metadata record',url:'https://example.org/article'}],'An older claim [[cite:S2]].');await click(document.querySelector('.evidence-chip'));assert.match(document.querySelector('dialog').textContent,/Metadata only/);assert.match(document.querySelector('dialog').textContent,/no supporting passage/i);assert.equal(calls.length,count);
  await click(document.querySelector('[aria-label="Close evidence"]'));
  const batchSources=Array.from({length:7},(_,i)=>({...source,id:'batch-'+i,title:'Batch study '+i}));
  const beforeBatch=calls.filter(c=>c.url==='/api/ai/evidence').length;
  await render(batchSources,'A finding shared by several studies '+batchSources.map(s=>'[[cite:'+s.id+']]').join(', ')+'.');
  await click(document.querySelector('.evidence-chip'));await wait(()=>document.querySelectorAll('.evidence-passage mark').length===7,'all seven sources checked');
  assert.equal(calls.filter(c=>c.url==='/api/ai/evidence').length-beforeBatch,2);
 }finally{if(root)await act(async()=>root.unmount());await vite.close();globalThis.fetch=before;dom.window.close();}
});
