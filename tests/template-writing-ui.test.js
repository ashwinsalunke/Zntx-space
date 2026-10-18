import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { templateById } from '../src/templates.js';
const template=templateById('journal-of-epidemiology-and-global-health');
test('template selection attaches the file, checks missing content, drafts in order, exports and reopens from the library', {timeout:30000}, async()=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
  for(const key of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','getComputedStyle','localStorage','Event','MouseEvent','KeyboardEvent','FormData']) Object.defineProperty(globalThis,key,{configurable:true,value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key]});
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.scrollTo=()=>{};HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const fetchBefore=globalThis.fetch, notes=[], calls=[], exports=[], deleted=[];
  let history=[{id:'a',query:'bacteria',source:'crossref'},{id:'b',query:'bacteria',source:'pubmed'},{id:'c',query:'diabetes',source:'pubmed'}], failDelete=true;
  const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
  const createBefore=URL.createObjectURL,revokeBefore=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:test';URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){};
  globalThis.fetch=async(url,options={})=>{
    const path=String(url),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;calls.push({path,method,body});
    if(path==='/api/config')return json({storage:'Local SQLite'});
    if(path==='/api/library')return json([{id:'saved-paper',title:'Saved source'}]);
    if(path==='/api/history'&&method==='GET')return json(history);
    if(path.startsWith('/api/history')&&method==='DELETE'){
      if(failDelete){failDelete=false;return json({error:'Deletion failed; retry.'},503);}
      const id=path.split('/')[3],query=history.find(h=>h.id===id)?.query;history=id?history.filter(h=>h.query!==query):[];deleted.push(id||'all');return json({ok:true});
    }
    if(path==='/api/ai/status')return json({configured:true});
    if(path.startsWith('/api/discovery/search?'))return json({papers:[{id:'p1',title:'Antibiotic resistance evidence',abstract:'Study abstract about antimicrobial resistance.',url:'https://pubmed.ncbi.nlm.nih.gov/1/',authors:['Author A'],year:2024}]});
    if(path==='/api/ai/generate')return json({text:JSON.stringify({title:'Antibiotic resistance in bacteria',sections:template.sections.filter(s=>s.heading!=='References').map(s=>({heading:s.heading,content:'Supported abstract-level summary [[cite:S1]].'}))}),generatedAt:new Date().toISOString()});
    if(path==='/api/records/notes')return json(notes);
    if(path.startsWith('/api/records/notes/')){
      if(method==='PUT'){const i=notes.findIndex(n=>n.id===body.id);if(i>=0)notes[i]=body;else notes.push(body);return json({ok:true});}
      return json(notes.find(n=>n.id===path.split('/').at(-1)));
    }
    if(path.startsWith('/api/records/'))return json([]);
    if(path==='/api/export/document'){exports.push(body);return new Response('fake-test-package',{headers:{'Content-Type':'application/octet-stream'}});}
    throw Error('Unexpected request '+path);
  };
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom');
  const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});let root;
  const wait=async(predicate,label)=>{for(let i=0;i<250;i++){if(predicate())return;await act(async()=>new Promise(r=>setTimeout(r,15)));}assert.fail('Timed out: '+label);};
  const click=async element=>{assert.ok(element);await act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));};
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
  const fill=async(element,value)=>{await act(async()=>{const proto=element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});};
  try{
    const {default:App}=await vite.ssrLoadModule('/src/App.jsx');
    async function mount(path){if(root)await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(App))));}
    await mount('/templates?q=epidemiology');await wait(()=>document.querySelector('.tc-start'),'template');await click(document.querySelector('.tc-start'));
    await wait(()=>document.querySelector('.template-attachment'),'attachment');assert.match(document.querySelector('textarea').value,/I'm writing about __________/);
    assert.equal(calls.filter(c=>c.path==='/api/ai/generate').length,0);
    await click(document.querySelector('[aria-label="Submit research task"]'));
    await wait(()=>document.querySelector('.tw-missing'),'missing content');assert.match(document.body.textContent,/Checking the supplied template/);
    assert.equal(calls.filter(c=>c.path==='/api/ai/generate').length,0,'blank placeholders do not launch research');
    await fill(document.querySelector('[aria-label="Manuscript research topic"]'),'Antibiotic resistance in bacteria');await click(button('Find sources & write'));
    await wait(()=>notes.length===1&&document.querySelector('[aria-label="Research paper editor"]'),'saved editable manuscript');
    assert.equal(notes[0].type,'template-manuscript');assert.equal(notes[0].templateId,template.id);assert.match(notes[0].content,/## References/);
    assert.match(notes[0].content,/https:\/\/pubmed.ncbi.nlm.nih.gov\/1/);
    const ai=calls.find(c=>c.path==='/api/ai/generate').body;assert.equal(ai.task,'workflow-paper');assert.equal(ai.evidence[0].id,'S1');
    await click(button('Manuscript.docx'));assert.equal(exports[0].layout,'jegh');assert.match(exports[0].content,/References/);
    await mount('/library');await wait(()=>document.body.textContent.includes('Antibiotic resistance in bacteria'),'library note');
    await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Antibiotic resistance in bacteria')));
    await wait(()=>[...document.querySelectorAll('a')].some(a=>a.textContent.includes('Open manuscript editor')),'open editor');
    await click([...document.querySelectorAll('a')].find(a=>a.textContent.includes('Open manuscript editor')));await wait(()=>document.querySelector('[aria-label="Research paper editor"]'),'reopened editor');
    await mount('/search');await wait(()=>document.querySelector('[aria-label="Delete search: bacteria"]'),'delete action');
    await click(document.querySelector('[aria-label="Delete search: bacteria"]'));await click(button('Delete search'));await wait(()=>document.body.textContent.includes('Deletion failed; retry.'),'failure feedback');assert.equal(history.length,3);
    await click(button('Delete search'));await wait(()=>history.length===1&&!document.querySelector('[aria-label="Delete search: bacteria"]'),'duplicates removed');assert.equal(deleted[0],'a');
    assert.ok(!document.querySelector('datalist option[value="bacteria"]'));
    await click(document.querySelector('[aria-label="Clear all recent searches"]'));await click(button('Delete all searches'));await wait(()=>history.length===0&&!document.querySelector('.recent-searches'),'all removed');
    assert.equal(notes.length,1,'deleting history leaves manuscript intact');
  } finally {if(root)await act(async()=>root.unmount());await vite.close();globalThis.fetch=fetchBefore;URL.createObjectURL=createBefore;URL.revokeObjectURL=revokeBefore;dom.window.close();}
});
