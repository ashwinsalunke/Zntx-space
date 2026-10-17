import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('home guidance remembers replies, preserves failed input, saves/reloads and opens a real evidence search', { timeout: 30000 }, async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle', 'localStorage', 'Event', 'MouseEvent', 'KeyboardEvent', 'FormData']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  HTMLElement.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  const originalFetch = globalThis.fetch, calls = [], chats = [], notes = [];
  let guideRequests = 0, failNext = false;
  const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url), body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, body });
    if (path === '/api/config') return response({ storage: 'Local SQLite' });
    if (['/api/library', '/api/history'].includes(path)) return response([]);
    if (path === '/api/ai/status') return response({ configured: true });
    if (path === '/api/records/chats') return response(chats);
    if (path === '/api/records/notes') return response(notes);
    if (path.startsWith('/api/records/notes/') && options.method === 'PUT') { notes.push(body); return response(body); }
    if (path.startsWith('/api/records/chats/') && options.method === 'PUT') { const i = chats.findIndex(c => c.id === body.id); if (i >= 0) chats[i] = body; else chats.push(body); return response(body); }
    if (path === '/api/ai/generate') {
      guideRequests++;
      if (failNext) { failNext = false; return new Response(JSON.stringify({ error: 'Private provider configuration detail' }), { status: 503 }); }
      if (JSON.parse(body.prompt).request === 'I am working on molecular docking') return response({ text: JSON.stringify({ reply: 'ScrapeTx helps you run docking predictions and inspect poses.', steps: ['Load the prepared example or upload PDBQT files.', 'Set the search box and inspect predicted poses and scores.'], topic: 'molecular docking', question: 'Do you have prepared files?', suggestions: ['Try the example'], actions: ['docking', 'papers'] }) });
      const topic = guideRequests > 1 ? 'bacteria antibiotic resistance' : '';
      return response({ text: JSON.stringify({ reply: topic ? 'Let’s focus your bacteria project on antibiotic resistance. Read relevant studies, compare their findings and build a cited literature draft.' : 'I can help you choose a question, find papers, compare evidence and create a cited draft.', topic, steps: ['Choose a research question.', 'Find papers and compare their results.'], question: topic ? 'Would you like a review or presentation?' : 'What would you like to research?', suggestions: topic ? ['A literature review', 'A presentation'] : ['Bacteria'], actions: topic ? ['papers', 'compare', 'workflow'] : ['workflow', 'library'] }), citations: [], generatedAt: new Date().toISOString() });
    }
    if (path.startsWith('/api/discovery/search?')) return response({ papers: [], sources: [], retrievedAt: new Date().toISOString(), coverage: { retrievedRecords: 0, duplicatesRemoved: 0, withAbstract: 0 }, ranking: { description: 'Search relevance' } });
    if (path.startsWith('/api/records/searches/')) return response(body);
    throw Error('Unexpected request: ' + path);
  };
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client'), { MemoryRouter } = await import('react-router-dom');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  let root;
  const wait = async (predicate, label) => { for (let i = 0; i < 200; i++) { if (predicate()) return; await act(async () => { await new Promise(r => setTimeout(r, 20)); }); } assert.fail('Timed out: ' + label); };
  const click = async el => { assert.ok(el, 'Expected clickable control'); await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true }))); };
  const button = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
    const mount = async path => { root = createRoot(document.getElementById('root')); await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App)))); };
    await mount('/');
    await wait(() => document.querySelector('.home-guide-start a'), 'home guidance entry');
    await click(document.querySelector('.home-guide-start a'));
    await wait(() => notes.length === 1 && !button('Bacteria')?.disabled, 'first guide reply saved');
    assert.equal(calls.some(c => c.path.startsWith('/api/discovery/search')), false, 'Help does not search academic databases');
    assert.equal(calls.find(c => c.path === '/api/ai/generate').body.task, 'guide');
    failNext = true;
    await click(button('Bacteria'));
    await wait(() => document.querySelector('.research-error'), 'retryable guide failure');
    assert.equal(document.querySelector('[aria-label="Research question"]').value, 'Bacteria');
    assert.ok(!document.body.textContent.includes('Private provider configuration detail'));
    await act(async () => document.querySelector('.research-follow-up').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await wait(() => notes.length === 2 && document.querySelectorAll('.research-guide').length === 2, 'topic-specific guidance');
    const context = JSON.parse(calls.filter(c => c.path === '/api/ai/generate').at(-1).body.prompt);
    assert.equal(context.conversation[0].user, 'What can scrapeTx help me with?');
    assert.equal(context.request, 'Bacteria');
    const workflow = [...document.querySelectorAll('.research-guide a')].find(a => a.getAttribute('href') === '/research-workflow?topic=bacteria+antibiotic+resistance');
    assert.ok(workflow, 'Cited draft button preserves the chosen topic');
    assert.equal(document.querySelectorAll('.research-source-grid').length, 0);
    await wait(() => chats[0]?.turnIds.length === 2, 'chat saved');
    const savedPath = '/chat/' + chats[0].id;
    await act(async () => root.unmount());
    await mount(savedPath);
    await wait(() => document.querySelectorAll('.research-guide').length === 2, 'saved guidance restored');
    assert.equal(button('Guide me').getAttribute('aria-pressed'), 'true');
    await click([...document.querySelectorAll('.research-guide a')].find(a => a.textContent.includes('Compare evidence')));
    await wait(() => calls.some(c => c.path === '/api/discovery/search?q=bacteria%20antibiotic%20resistance'), 'real evidence search');
    await act(async () => root.unmount());
    const searchesBefore = calls.filter(c => c.path.startsWith('/api/discovery/search')).length;
    await mount('/chat?q=I%20am%20working%20on%20molecular%20docking&auto=1');
    await wait(() => document.querySelector('.research-guide-actions a')?.textContent.includes('Open molecular docking'), 'docking guide action');
    assert.equal(document.querySelector('.research-guide-actions a').getAttribute('href'), '/docking');
    assert.ok(document.querySelector('.research-guide').textContent.includes('PDBQT'));
    assert.equal(calls.filter(c => c.path.startsWith('/api/discovery/search')).length, searchesBefore, 'Task statement opens guidance, not a literal literature search');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close(); globalThis.fetch = originalFetch; dom.window.close();
  }
});
