import test from 'node:test';
import assert from 'node:assert/strict';
import {citedSentences, cleanClaim, validateSupportOutput, evidenceMetadata, enrichCitations} from '../shared/claim-evidence.js';
const sources=[{id:'S1',title:'Study',abstract:'The mouse study found an association between A and B. It did not test causality.',page:4,kind:'pdf-page'}];
test('support checks require exact text, retain uncertainty, and reject invented quotations, unknown sources and duplicate assessments',()=>{
 const result=validateSupportOutput(JSON.stringify({assessments:[{sourceId:'S1',relation:'partial',quote:'The mouse study found an association between A and B.',explanation:'The passage concerns mice and association, not a human causal effect.'}]}),sources);
 assert.equal(result[0].quoteMatched,true);assert.equal(result[0].relation,'partial');
 for(const assessment of [
  {sourceId:'S1',relation:'supports',quote:'Human trials proved that A causes B.',explanation:'Unsupported'},
  {sourceId:'S1',relation:'supports',quote:'',explanation:'No quote'},
  {sourceId:'S2',relation:'supports',quote:sources[0].abstract,explanation:'Wrong source'},
  {sourceId:'S1',relation:'proven',quote:sources[0].abstract,explanation:'Invalid label'},
 ]) assert.throws(()=>validateSupportOutput(JSON.stringify({assessments:[assessment]}),sources));
 assert.throws(()=>validateSupportOutput(JSON.stringify({assessments:Array(2).fill({sourceId:'S1'})}),sources));
 assert.equal(validateSupportOutput('{"assessments":[]}',sources)[0].relation,'not-assessed');
 assert.equal(validateSupportOutput(JSON.stringify({assessments:[{sourceId:'S1',relation:'does-not-support',quote:'',explanation:'No text'}]}),[{...sources[0],abstract:''}])[0].relation,'not-assessed');
});
test('sentence links associate only cited claims, preserve neighbouring uncited text and multiple markers',()=>{
 const parts=citedSentences('Background without evidence. A was associated with B [[cite:S1]] [[cite:S2]]. More uncited prose.');
 assert.deepEqual(parts.map(p=>p.ids),[[],['S1','S2'],[]]);assert.equal(cleanClaim(parts[1].text),'A was associated with B');
 assert.deepEqual(citedSentences('A was associated with B. [[cite:S1]]')[0].ids,['S1']);
 assert.deepEqual(citedSentences('Uncited prose.')[0].ids,[]);
 const comma=citedSentences('A was associated with B [[cite:S1]], [[cite:S2]], and [[cite:S3]].');
 assert.deepEqual(comma[0].ids,['S1','S2','S3']);assert.equal(cleanClaim(comma[0].text),'A was associated with B');
});
test('source metadata retains real PDF pages and bounded passages, strips unsafe links and never infers pages from a title',()=>{
 assert.equal(evidenceMetadata({...sources[0],url:'javascript:alert(1)'}).url,'');
 assert.equal(evidenceMetadata({id:'1',title:'Page 10 paper'}).page,undefined);
 assert.equal(evidenceMetadata({...sources[0],pdf:'https://example.org/file.pdf'}).page,4);
 assert.equal(evidenceMetadata({...sources[0],page:-1}).page,undefined);
 const enriched=enrichCitations([{id:'1',title:'Study',url:'https://example.org'}],sources);
 assert.equal(enriched[0].abstract,sources[0].abstract);assert.equal(enriched[0].page,4);
});
