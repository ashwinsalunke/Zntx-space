import test from 'node:test';
import assert from 'node:assert/strict';
import { templateById } from '../src/templates.js';
import { templateRequest, templateLatex, topicFromRequest, manuscriptDocument, documentMarkdown, manuscriptExport, validateTemplatePaper, templateEvidence } from '../src/template-writing.js';
const item = templateById('journal-of-epidemiology-and-global-health');
test('selected manuscript template retains supplied geometry, section order, and an unfilled topic asks for content', () => {
  assert.equal(topicFromRequest(templateRequest(item)), '');
  assert.equal(topicFromRequest(templateRequest(item,'Antibiotic resistance in bacteria')), 'Antibiotic resistance in bacteria');
  assert.equal(topicFromRequest('Bacterial antibiotic resistance'), 'Bacterial antibiotic resistance');
  const tex = templateLatex(item);
  assert.match(tex,/10pt,twocolumn/);
  assert.match(tex,/paperwidth=210mm,paperheight=279mm,top=12mm,bottom=28mm,left=18mm,right=17mm,columnsep=6mm/);
  assert.ok(tex.indexOf('section{Introduction}') < tex.indexOf('section{Methods}'));
});
test('formatting supplied manuscript retains content and flags absent sections without inventing observations', () => {
  const doc = manuscriptDocument(item,'Introduction\nMy introduction.\nMethods\nActual supplied methods.\nResults\nObserved 10 samples.');
  const text=documentMarkdown(doc);
  assert.match(text,/My introduction/);assert.match(text,/Actual supplied methods/);assert.match(text,/Observed 10 samples/);assert.match(text,/Add abstract from your own manuscript/);
  assert.ok(text.indexOf('## Methods') < text.indexOf('## Results'));
});
test('generated drafts reject different template structure or unknown citations; export uses real cited references', () => {
  const sources=templateEvidence([{id:'a',title:'A real source',abstract:'An available abstract',url:'https://pubmed.ncbi.nlm.nih.gov/1/',authors:['Author A'],year:2024},{id:'b',title:'Metadata only',url:'https://example.org/b'}]);
  assert.equal(sources.length,1);
  const sections=item.sections.filter(s=>s.heading!=='References').map(s=>({heading:s.heading,content:'Source-based text [[cite:S1]].'}));
  assert.equal(validateTemplatePaper(JSON.stringify({title:'Working manuscript',sections}),item,sources).sections.length,5);
  assert.throws(()=>validateTemplatePaper(JSON.stringify({title:'Bad',sections:sections.slice(1)}),item,sources),/selected template/);
  assert.throws(()=>validateTemplatePaper(JSON.stringify({title:'Bad',sections:sections.map(s=>({...s,content:'Wrong [[cite:S99]]'}))}),item,sources),/citation|source/i);
  const doc=manuscriptDocument(item,'Introduction\nSupported claim [[cite:S1]].');
  const text=manuscriptExport(doc,sources);
  assert.match(text,/Supported claim \[1\]/);assert.match(text,/## References/);assert.match(text,/https:\/\/pubmed.ncbi.nlm.nih.gov\/1\//);assert.doesNotMatch(text,/10.0000\/example/);
});
