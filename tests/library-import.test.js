import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRis} from '../src/library-import.js';
import {sourceUrl} from '../src/lib.js';

test('RIS imports real citation fields, wrapped abstracts, DOI, and book source identity',()=>{
 const records=parseRis('TY  - BOOK\nTI  - Drug discovery\nAU  - Smith, Alex\nPY  - 2024/01/01\nDO  - https://doi.org/10.1234/book\nPB  - Research Press\nAB  - First line\n  continued abstract\nUR  - https://publisher.example/book\nER  -\n');
 assert.equal(records.length,1);assert.equal(records[0].type,'book');assert.equal(records[0].abstract,'First line continued abstract');assert.equal(records[0].year,2024);assert.deepEqual(records[0].authors,['Smith, Alex']);assert.equal(sourceUrl(records[0]),'https://doi.org/10.1234/book');
});
test('RIS imports deduplicate repeat sources and reject empty or excessive files',()=>{
 const record='TY  - JOUR\nTI  - Repeated reference\nAU  - Author\nER  -\n';
 assert.equal(parseRis(record+record).length,1);assert.equal(parseRis(record)[0].id,parseRis(record)[0].id);
 assert.throws(()=>parseRis('not a reference file'),/No references/);
 assert.throws(()=>parseRis('x'.repeat(5*1024*1024+1)),/5 MB/);
});
test('RIS imports preserve supplied text without executing it or trusting unsafe URLs',()=>{
 const r=parseRis('TY  - JOUR\nTI  - <script>alert(1)</script>\nUR  - javascript:alert(1)\nER  -')[0];
 assert.match(r.title,/<script>/);assert.equal(sourceUrl(r),null);assert.equal(r.citations,null);
});
