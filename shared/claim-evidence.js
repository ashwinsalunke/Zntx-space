// Evidence excerpts are copied from supplied text, never accepted from model
// memory. A matching excerpt proves provenance, not scientific truth.
export const normalizeEvidenceText = value => String(value || '').replace(/\s+/g, ' ').trim();
export function safeEvidenceUrl(value) {
  try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function evidenceMetadata(source) {
  const abstract = String(source.abstract || source.evidenceText || '').slice(0,12000);
  const page = Number.isInteger(source.page) && source.page > 0 && source.page <= 20000 ? source.page : null;
  const kind = ['abstract','pdf-page','full-text-excerpt','search-snippet','document-text'].includes(source.kind) ? source.kind : String(source.coverage || '').startsWith('full-text') ? 'full-text-excerpt' : 'abstract';
  return {id:String(source.id || source.evidenceId || ''), title:String(source.title || 'Supplied source').slice(0,1000), url:safeEvidenceUrl(source.url || source.sourceUrl), abstract, kind, ...(page ? {page} : {}), ...(safeEvidenceUrl(source.pdf) ? {pdf:safeEvidenceUrl(source.pdf)} : {}), ...(source.documentId ? {documentId:String(source.documentId).slice(0,180)} : {}), ...(source.librarySync?.provider === 'mendeley' && typeof source.librarySync.remoteId === 'string' && source.librarySync.remoteId.length <= 200 ? {librarySync:{provider:'mendeley',remoteId:source.librarySync.remoteId}} : {})};
}
export function enrichCitations(citations = [], sources = []) {
  return citations.map(c => {
    const found = sources.find(s => (s.evidenceId || s.id) === c.id || (s.title && s.title === c.title) || (s.url && s.url === c.url));
    return {...(found ? evidenceMetadata({...found,id:c.id,abstract:found.evidenceText || found.abstract}) : {}), ...c};
  });
}
export function citedSentences(value) {
  // Include citation markers immediately after punctuation in the preceding
  // sentence. No factual support is inferred for uncited neighbouring text.
  const text = String(value || '');
  const matches = [...text.matchAll(/\[\[cite:([^\]\r\n]+)\]\]/g)];
  if (!matches.length) return [{text, ids:[]}];
  const parts=[]; let start=0;
  for(let i=0;i<matches.length;i++) {
    const m=matches[i], end=m.index+m[0].length;
    // Consecutive markers belong to the same claim.
    let last=end, ids=[m[1]];
    while(i+1<matches.length && /^[\s,;]*(?:and\s*)?$/.test(text.slice(last,matches[i+1].index))) {i++;ids.push(matches[i][1]);last=matches[i].index+matches[i][0].length;}
    const prefix=text.slice(start,m.index);
    const boundaries=[...prefix.matchAll(/[.!?](?:[”"']?)(?:\s+)(?=[A-Z\d])/g)];
    const boundary=boundaries.at(-1);
    // If the marker follows sentence-final punctuation, the preceding sentence
    // is still the claim. Other earlier sentences remain ordinary prose.
    const split=boundary ? boundary.index+boundary[0].length : 0;
    if(split) parts.push({text:prefix.slice(0,split),ids:[]});
    parts.push({text:text.slice(start+split,last),ids:[...new Set(ids)]});start=last;
  }
  if(start<text.length) parts.push({text:text.slice(start),ids:[]});
  return parts;
}
export const stripCitationMarkers = text => String(text || '').replace(/\s*\[\[cite:[^\]]+\]\](?:[\s,;]*(?:and\s+)?\[\[cite:[^\]]+\]\])*/g,'');
export const cleanClaim = text => normalizeEvidenceText(stripCitationMarkers(text).replace(/\*\*/g,''));
export const SUPPORT_SCHEMA = {type:'object',properties:{assessments:{type:'array',items:{type:'object',properties:{sourceId:{type:'string'},relation:{type:'string'},quote:{type:'string'},explanation:{type:'string'}},required:['sourceId','relation','quote','explanation']}}},required:['assessments']};
export function validateSupportOutput(text, sources) {
  const object=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));
  if(!Array.isArray(object?.assessments) || object.assessments.length > sources.length) throw Error('Invalid evidence assessment.');
  const suppliedIds = new Set(sources.map(s=>s.id));
  const outputIds=object.assessments.map(a=>a?.sourceId);
  if(new Set(outputIds).size !== outputIds.length || outputIds.some(id=>!suppliedIds.has(id))) throw Error('Unknown or duplicate evidence source.');
  const seen=new Set();
  return sources.map(source => {
    const a=object.assessments.find(a=>a?.sourceId===source.id);
    if(!a) return {sourceId:source.id,relation:'not-assessed',quote:'',explanation:'No assessment was returned for this source.'};
    if(seen.has(a.sourceId) || !['supports','partial','does-not-support','contradicts'].includes(a.relation) || typeof a.quote!=='string' || a.quote.length>1200 || typeof a.explanation!=='string' || a.explanation.length>1500) throw Error('Invalid evidence assessment.');
    seen.add(a.sourceId);
    if(!normalizeEvidenceText(source.abstract)) {if(a.quote.trim()) throw Error('The proposed passage was not found in the supplied source text.'); return {sourceId:source.id,relation:'not-assessed',quote:'',explanation:'No passage text is stored for this source.'};}
    const quote=normalizeEvidenceText(a.quote), supplied=normalizeEvidenceText(source.abstract);
    const matched=quote.length>=Math.min(20,supplied.length) && quote.length>0 && supplied.includes(quote);
    if(quote && !matched) throw Error('The proposed passage was not found in the supplied source text.');
    if(['supports','partial','contradicts'].includes(a.relation) && !matched) throw Error('Support requires an exact passage from the supplied text.');
    return {sourceId:source.id,relation:a.relation,quote,explanation:a.explanation.trim(),quoteMatched:matched};
  });
}

export function searchProvenance(activity) {
  if(!activity) return undefined;
  const entry = value => ({query:String(value.query || '').slice(0,1000),retrievedAt:value.retrievedAt || null,partial:!!value.partial,sources:(value.sources || []).slice(0,24).map(s=>({name:s.name || s.source || 'Research provider',url:safeEvidenceUrl(s.url),status:s.status || 'recorded',returned:typeof s.returned === 'number' ? s.returned : null}))});
  return {...entry(activity),additionalSearches:(activity.additionalSearches || []).slice(0,40).map(entry)};
}
