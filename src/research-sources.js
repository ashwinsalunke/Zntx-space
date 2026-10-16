export const researchSources = [
  {id:'deep',label:'Deep Research',icon:'sparkles',description:'Search across scholarly sources and build a cited reading list.',placeholder:'Ask a research question, compare studies, or explore a drug…'},
  {id:'zotero',label:'Zotero Library',icon:'library',description:'Import a reference export or connect your private Zotero library.',placeholder:'Find something in your Zotero references…'},
  {id:'mendeley',label:'Mendeley Library',icon:'books',description:'Bring an RIS export from Mendeley into your research library.',placeholder:'Search or import your Mendeley references…'},
  {id:'pubmed',label:'PubMed',icon:'flask',description:'Find biomedical articles and read their original abstracts.',placeholder:'Search PubMed by drug, disease, title, or research question…'},
  {id:'scholar',label:'Google Scholar',icon:'graduation',description:'Open a scholarly search on Google Scholar.',placeholder:'What would you like to find on Google Scholar?'},
  {id:'arxiv',label:'arXiv',icon:'atom',description:'Explore preprints. Findings may not have been peer reviewed.',placeholder:'Search preprints by topic, author, or title…'},
  {id:'python',label:'Python Library',icon:'code',description:'Look up a Python package and its official metadata on PyPI.',placeholder:'Enter a package name, such as pandas or biopython…'},
  {id:'grants',label:'Grants.gov',icon:'badge',description:'Explore US federal grant opportunities and funding notices.',placeholder:'Search grants by research topic or funding opportunity…'},
  {id:'uploaded',label:'Uploaded Files',icon:'upload',description:'Read a PDF and save useful source passages to your library.',placeholder:'Ask a question about a PDF you would like to upload…'},
  {id:'trials',label:'ClinicalTrials.gov',icon:'microscope',description:'Inspect registered clinical studies and their recruitment details.',placeholder:'Search a drug, condition, intervention, or trial ID…'},
  {id:'google',label:'Google Search',icon:'globe',description:'Open a web search on Google.',placeholder:'What would you like to find on the web?'},
  {id:'patents',label:'Google Patents',icon:'patent',description:'Open patent records and prior-art searches on Google Patents.',placeholder:'Search a compound, invention, patent number, or technology…'},
  {id:'datasets',label:'Online Datasets',icon:'database',description:'Find research datasets with persistent source identifiers.',placeholder:'Search published datasets by research topic…'},
];
// Deep Research is one option, alongside 12 specific sources and library/file tools.
export function researchSourcePath(id, query='') {
  const q = query.trim();
  const params = new URLSearchParams();
  if(q) params.set('q',q);
  if(id==='deep') { if(q) params.set('auto','1'); return '/chat'+(q?'?'+params:''); }
  if(id==='pubmed') {params.set('source','pubmed');return '/search?'+params;}
  if(id==='trials') {params.set('tool','trials');return '/pharma?'+params;}
  if(id==='uploaded') return '/chat-pdf'+(q?'?'+params:'');
  return '/sources/'+id+(q?'?'+params:'');
}
