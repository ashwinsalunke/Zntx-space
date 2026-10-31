import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {createProjectWriter} from '../server/project-context.js';

test('create a project, attach existing sources, use them in writing, and switch without losing project ownership', {timeout:30000}, async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
 for(const k of ['window','document','navigator','HTMLElement','Element','Node','DOMParser','MutationObserver','localStorage','Event','MouseEvent','KeyboardEvent','FormData']) Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});
 globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window); globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.scrollTo=()=>{};HTMLElement.prototype.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
 const rows=new Map();const key=(c,id)=>c+'/'+id;
 const getRecord=async(t,c,id)=>rows.get(key(c,id))||null;
 const putRecord=async(t,c,id,d)=>{rows.set(key(c,id),{...d,id,updatedAt:new Date().toISOString()});return {ok:true,id};};
 const write=createProjectWriter({getRecord,putRecord});
 await putRecord('owner','papers','p1',{id:'p1',title:'A saved antibiotic paper',abstract:'This research compares bacterial biofilms.',url:'https://example.com/article'});
 const original=globalThis.fetch;const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 globalThis.fetch=async(url,o={})=>{
  if(url==='/api/config')return json({cloud:false});if(url==='/api/ai/status')return json({configured:false});
  if(url==='/api/history')return json([]);if(url==='/api/library')return json([...rows.entries()].filter(([k])=>k.startsWith('papers/')).map(([,r])=>r));
  const match=String(url).match(/^\/api\/(records|project-items)\/([^/?]+)(?:\/([^?]+))?/);
  if(match){const [,kind,c,raw]=match,id=raw&&decodeURIComponent(raw);if(o.method==='PUT')return json(await write('owner',c,id,JSON.parse(o.body),o.headers['X-Research-Project']));if(kind==='project-items')return json(await write('owner',c,id,{},JSON.parse(o.body).projectId,true));return json(id ? rows.get(key(c,id)) : [...rows.entries()].filter(([k])=>k.startsWith(c+'/')).map(([,r])=>r));}
  throw Error('Unexpected call '+url);
 };
 const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom');
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent'});let root;
 const wait=async(fn,label)=>{for(let i=0;i<150;i++){if(fn())return;await act(async()=>{await new Promise(r=>setTimeout(r,20));});}assert.fail(label);};
 const click=async(el)=>{assert.ok(el);await act(async()=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const fill=async(el,value)=>{await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});};
 try {
  const {default:App}=await vite.ssrLoadModule('/src/App.jsx');root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/projects?new=1']},React.createElement(App))));
  await wait(()=>document.querySelector('.project-create-form'),'create form');
  await fill(document.querySelector('.project-create-form input'),'Antibiotic research');await fill(document.querySelector('.project-create-form textarea'),'How do biofilms influence resistance?');
  await click(button('Create project'));await wait(()=>document.querySelector('.project-tool-grid'),'project home');
  const project=[...rows.values()].find(r=>r.type==='research-project');assert.ok(project);assert.equal(document.querySelector('#active-research-project').value,project.id);
  await click(button('Add from My Library'));await wait(()=>button('Add'),'existing source');await click(button('Add'));await wait(()=>rows.get('papers/p1').projectIds?.includes(project.id),'attached source');
  await click(button('Done'));await click([...document.querySelectorAll('.project-tool-grid a')].find(a=>a.textContent.includes('Write your paper')));
  await wait(()=>button('Use project sources'),'source handoff');assert.equal(document.querySelector('#rf-topic').value,project.question);
  await click(button('Use project sources'));await wait(()=>[...rows.values()].some(r=>r.type==='research-workflow'),'workflow saved');
  const workflow=[...rows.values()].find(r=>r.type==='research-workflow');assert.deepEqual(workflow.projectIds,[project.id]);assert.equal(workflow.workflow.sources[0].title,'A saved antibiotic paper');
  await act(async()=>{const select=document.querySelector('#active-research-project');select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await wait(()=>document.querySelector('.project-list'),'switch project');assert.equal(rows.get('projects/'+workflow.id).projectIds[0],project.id);
 } finally {if(root)await act(async()=>root.unmount());await vite.close();globalThis.fetch=original;dom.window.close();}
});
