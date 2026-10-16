import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceUrl, citation, bibliographyHtml } from '../src/lib.js';
import { crossrefPaper, crossrefRequest, rankBibliography } from '../server/research.js';

test('exact title matches lead bibliography results without relabelling related works as matches', () => {
  const papers=[{title:'A review of drug safety'}, {title:'Safety of Semaglutide.'}, {title:'Safety of semaglutide in a population'}];
  assert.deepEqual(rankBibliography(papers,'Safety of Semaglutide'),[papers[1],papers[0],papers[2]]);
  assert.equal(papers[0].title,'A review of drug safety');
});

test('bibliography searches exact DOI records and bibliographic titles without restricting book types', () => {
  assert.deepEqual(crossrefRequest('https://doi.org/10.3389/fendo.2021.645563',true), {url:'https://api.crossref.org/works/10.3389%2Ffendo.2021.645563',exact:true});
  const all = new URL(crossrefRequest('Research book title',true).url);
  assert.equal(all.searchParams.get('query.bibliographic'),'Research book title');
  assert.equal(all.searchParams.has('filter'),false);
  const articles = new URL(crossrefRequest('semaglutide').url);
  assert.equal(articles.searchParams.get('filter'),'type:journal-article');
});

test('bibliography resolves DOI forms consistently and retains supplied source fallbacks', () => {
  for (const doi of ['10.1234/study', 'https://doi.org/10.1234/study', 'doi: 10.1234/study'])
    assert.equal(sourceUrl({doi,url:'https://publisher.example/other'}), 'https://doi.org/10.1234/study');
  assert.equal(sourceUrl({doi:'unavailable',url:'https://pubchem.ncbi.nlm.nih.gov/compound/4091'}), 'https://pubchem.ncbi.nlm.nih.gov/compound/4091');
  assert.equal(sourceUrl({pmid:'37952131'}), 'https://pubmed.ncbi.nlm.nih.gov/37952131/');
  assert.equal(sourceUrl({pmcid:'PMC12345'}), 'https://europepmc.org/articles/PMC12345');
  assert.equal(sourceUrl({title:'Unknown source'}), null);
});

test('source links reject executable, credential-bearing and control-character URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'https://user:secret@example.com/article', 'https://example.com/\narticle'])
    assert.equal(sourceUrl({url}), null);
  assert.equal(sourceUrl({doi:'not a DOI',url:'javascript:alert(1)',sourceUrl:'https://publisher.example/article'}), 'https://publisher.example/article');
});

test('all bibliography formats preserve source URLs when a DOI is absent', () => {
  const paper = {title:'Compound record',authors:['PubChem'],url:'https://pubchem.ncbi.nlm.nih.gov/compound/4091'};
  for (const style of ['APA','MLA','IEEE','BibTeX','RIS'])
    assert.ok(citation(paper,style).includes(paper.url),style);
  assert.match(citation(paper,'BibTeX'), /url = \{https:\/\/pubchem/);
  assert.match(citation(paper,'RIS'), /UR  - https:\/\/pubchem/);
});

test('book and chapter metadata retain appropriate export types and original source links', () => {
  const book=crossrefPaper({DOI:'10.1234/book',title:['A research book'],type:'book',publisher:'Example Press',ISBN:['9781234567890']});
  assert.equal(book.publisher,'Example Press');
  assert.deepEqual(book.isbn,['9781234567890']);
  assert.match(citation(book,'BibTeX'),/^@book\{/);
  assert.match(citation(book,'BibTeX'),/publisher = \{Example Press\}/);
  assert.match(citation(book,'RIS'),/^TY  - BOOK/);
  assert.match(citation({...book,type:'book-chapter'},'BibTeX'),/^@incollection\{/);
  assert.match(citation({...book,type:'book-chapter'},'RIS'),/^TY  - CHAP/);
});

test('linked HTML bibliography escapes source content and never invents missing links', () => {
  const output=bibliographyHtml([
    {title:'<script>alert(1)</script>',authors:[],url:'https://example.com/article?a=1&b=2'},
    {title:'Unavailable',authors:[],url:'javascript:alert(1)'}
  ]);
  assert.ok(output.includes('href="https://example.com/article?a=1&amp;b=2"'));
  assert.ok(output.includes('&lt;script&gt;'));
  assert.ok(!output.includes('<script>'));
  assert.ok(!output.includes('javascript:'));
  assert.ok(output.includes('Source link unavailable'));
  assert.equal((output.match(/<a /g)||[]).length,1);
});
