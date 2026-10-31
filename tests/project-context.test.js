import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectWriter } from '../server/project-context.js';
import { isResearchProject, belongsToProject, projectToolPath, projectSection } from '../shared/project-workspace.js';
function store() {
  const records = new Map(); const key = (t,c,i)=>JSON.stringify([t,c,i]);
  const getRecord = async(t,c,i)=>structuredClone(records.get(key(t,c,i)) || null);
  const putRecord = async(t,c,i,d)=>{records.set(key(t,c,i),structuredClone({...d,id:i})); return {ok:true,id:i};};
  return {getRecord,putRecord,write:createProjectWriter({getRecord,putRecord})};
}
test('project membership survives switching, stale autosaves, concurrent attachments and workspace isolation', async()=>{
  const s=store();
  for(const id of ['a','b','c']) await s.putRecord('owner','projects',id,{type:'research-project',title:id,papers:{}});
  await s.write('owner','notes','n',{title:'Reading notes'},'a');
  await s.write('owner','notes','n',{title:'Changed',projectIds:['b']},'b');
  assert.deepEqual((await s.getRecord('owner','notes','n')).projectIds,['a']);
  await Promise.all([s.write('owner','notes','n',{},'b',true),s.write('owner','notes','n',{},'c',true),s.write('owner','notes','n',{title:'Autosave'},'a')]);
  const record=await s.getRecord('owner','notes','n');
  assert.deepEqual(record.projectIds,['a','b','c']); assert.equal(record.title,'Autosave');
  await assert.rejects(s.write('stranger','notes','x',{title:'X'},'a'),/available research project/);
  await assert.rejects(s.write('owner','notes','missing',{},'a',true),/no longer available/);
  await s.write('owner','notes','free',{title:'Unassigned'});
  await s.write('owner','notes','free',{title:'Still unassigned'},'a');
  assert.deepEqual((await s.getRecord('owner','notes','free')).projectIds,[]);
});
test('legacy reviews remain projects, workflow documents do not; routes preserve topic and output categories',()=>{
  assert.equal(isResearchProject({papers:{},title:'Old review'}),true);
  assert.equal(isResearchProject({type:'research-workflow',papers:{},workflow:{}}),false);
  assert.equal(belongsToProject({projectIds:['p']},'p'),true);
  assert.equal(projectToolPath('/search',{question:'a & b'}),'/search?q=a+%26+b&source=deep');
  assert.equal(projectSection('projects',{type:'research-workflow',workflow:{deliverable:'presentation'}}),'Slides');
  assert.equal(projectSection('notes',{type:'research-notebook'}),'Notes');
});
