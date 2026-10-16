import test from 'node:test';
import assert from 'node:assert/strict';
import { templates, filterTemplates, templateById, templateContent, templatePath } from '../src/templates.js';

test('template filters combine facets and search actual metadata, with OR choices inside a facet', () => {
  assert.deepEqual(filterTemplates({kind:'Journal Article', publisher:['PLOS'], topic:['Medicine'], access:['Open Access']}).map(item=>item.id), ['plos-one']);
  assert.deepEqual(filterTemplates({query:'cambridge', university:['University of Cambridge']}).map(item=>item.id), ['cambridge-thesis-planning']);
  assert.deepEqual(filterTemplates({publisher:['PLOS','Frontiers']}).map(item=>item.id), ['plos-one','frontiers-original-research']);
  assert.equal(filterTemplates({kind:'Thesis & Dissertation', publisher:['PLOS']}).length, 0);
  assert.equal(filterTemplates({query:'not a matching template'}).length, 0);
  assert.equal(filterTemplates().length, templates.length);
});

test('every writing starter loads its own sections through a stable editor URL and preserves source guidance', () => {
  assert.equal(new Set(templates.map(item=>item.id)).size, templates.length);
  for (const item of templates) {
    const target=new URL(templatePath(item),'https://zntx.example');
    assert.equal(target.pathname, '/ai-writer');
    assert.equal(templateById(target.searchParams.get('template')), item);
    assert.equal(templateById(item.title),item);
    const content=templateContent(item);
    assert.match(content,/Writing starter/);
    for (const section of item.sections) {
      assert.ok(content.includes('## '+section.heading));
      assert.ok(content.includes(section.prompt));
    }
    if(item.guidanceUrl) assert.ok(content.includes(item.guidanceUrl));
    assert.equal(item.ranking,null);
  }
  assert.equal(templateById('unknown-template'),undefined);
  assert.notEqual(templateContent(templateById('conference-abstract')),templateContent(templateById('thesis-dissertation')));
});
