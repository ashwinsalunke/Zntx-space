// RIS metadata import only. Source strings remain plain text; no URLs are fetched.
export function parseRis(text) {
  if (typeof text !== 'string' || text.length > 5 * 1024 * 1024)
    throw Error('Choose an RIS file smaller than 5 MB.');
  const records = [];
  let fields = null, last = null;
  const finish = () => {
    if (!fields) return;
    const get = (...keys) => keys.flatMap(k => fields[k] || []).find(Boolean) || '';
    const title = get('TI','T1','CT','BT');
    if (!title) { fields=null; return; }
    const doi = get('DO').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').trim();
    const authors = [...(fields.AU || fields.A1 || [])];
    const year = Number(/\b(18|19|20|21)\d{2}\b/.exec(get('PY','Y1','DA'))?.[0]) || null;
    const identity = [title,authors.join(';'),year].join('|');
    let hash = 2166136261;
    for (let i=0;i<identity.length;i++) { hash ^= identity.charCodeAt(i); hash = Math.imul(hash,16777619); }
    const url = get('UR','L1');
    const type = get('TY');
    records.push({id: /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : `ris-${(hash >>> 0).toString(16)}`,
      title,authors,year,doi,url,abstract:get('AB','N2'),journal:get('JO','JF','T2','BT'),publisher:get('PB'),
      type:type==='BOOK'?'book':type==='CHAP'?'book-chapter':'journal-article',
      source:'RIS import',citations:null,volume:get('VL'),issue:get('IS'),pages:[get('SP'),get('EP')].filter(Boolean).join('-'),
      isbn:fields.SN || [], importedAt:new Date().toISOString()});
    fields=null; last=null;
    if (records.length>500) throw Error('Import up to 500 references at a time.');
  };
  for (const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/.exec(line);
    if (match) {
      const [,key,value]=match;
      if (key==='TY') { finish(); fields={}; }
      if (!fields) continue;
      if (key==='ER') { finish(); continue; }
      (fields[key] ||= []).push(value.trim()); last=key;
    } else if (fields && last && line.trim()) {
      const values=fields[last]; values[values.length-1]+=' '+line.trim();
    }
  }
  finish();
  if (!records.length) throw Error('No references with titles were found. Export a standard RIS file from your reference manager.');
  return [...new Map(records.map(r=>[r.id,r])).values()];
}
