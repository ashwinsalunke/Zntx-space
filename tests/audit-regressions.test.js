import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSavedChat } from '../src/saved-chat.js';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('saved chats retrieve exact turn IDs beyond the collection listing limit, in order with bounded concurrency', async () => {
  const ids = Array.from({ length: 510 }, (_, i) => `turn-${i}`);
  let running = 0, peak = 0;
  const { turns } = await loadSavedChat('older-chat', async path => {
    if (path === '/api/records/chats/older-chat') return { turnIds: ids };
    assert.match(path, /^\/api\/records\/notes\/turn-\d+$/);
    peak = Math.max(peak, ++running);
    await new Promise(resolve => setImmediate(resolve));
    running--;
    return { id: path.split('/').at(-1), chatId: 'older-chat' };
  });
  assert.equal(peak, 4);
  assert.deepEqual(turns.map(t => t.id), ids);
});

test('saved chat recovery reports missing or mismatched turns instead of silently discarding evidence', async () => {
  await assert.rejects(loadSavedChat('a', async path => path.includes('/chats/') ? { turnIds: ['b'] } : { chatId: 'another-chat' }), /does not belong/);
  await assert.rejects(loadSavedChat('a', async path => {
    if (path.includes('/chats/')) return { turnIds: ['missing'] };
    throw Error('Saved turn unavailable');
  }), /Saved turn unavailable/);
});

test('search cancellation restores usable inputs, late errors stay hidden, navigation stays available after a tool crash', { timeout: 30000 }, async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle', 'localStorage', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  HTMLElement.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  const originalFetch = globalThis.fetch;
  const pending = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.startsWith('/api/papers?') || path.startsWith('/api/sources/search?')) return new Promise((resolve, reject) => pending.push({ reject, signal: options.signal }));
    return new Response(JSON.stringify(path === '/api/config' ? { storage: 'Local SQLite' } : []), { headers: { 'Content-Type': 'application/json' } });
  };
  const React = await import('react'), { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { MemoryRouter, useNavigate } = await import('react-router-dom');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  let root, navigate;
  const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await act(async () => new Promise(r => setTimeout(r, 15))); } assert.fail('UI did not settle'); };
  function NavigationHandle() { navigate = useNavigate(); return null; }
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
    root = createRoot(document.getElementById('root'));
    await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/search?q=bacteria'] }, React.createElement(NavigationHandle), React.createElement(App))));
    await wait(() => pending.length === 1);
    await act(async () => navigate('/search'));
    assert.equal(pending[0].signal.aborted, true);
    await act(async () => pending[0].reject(Error('Stale provider error')));
    assert.ok(!document.body.textContent.includes('Stale provider error'));
    assert.ok(!document.body.textContent.includes('Searching…'));
    await act(async () => navigate('/sources/arxiv?q=bacteria'));
    await wait(() => pending.length === 2);
    await act(async () => navigate('/sources/arxiv'));
    assert.equal(pending[1].signal.aborted, true);
    await act(async () => pending[1].reject(Error('Old arXiv failure')));
    assert.ok(!document.body.textContent.includes('Old arXiv failure'));
    assert.ok(!document.body.textContent.includes('Searching…'));
    assert.ok(document.querySelector('nav a[href="/library"]'), 'Library is in primary navigation');
    assert.ok(document.querySelector('nav a[href="/docking"]'), 'Docking is in primary navigation');
    await act(async () => root.unmount());
    const { default: ErrorBoundary } = await vite.ssrLoadModule('/src/ErrorBoundary.jsx');
    let broken = true;
    function BrokenTool() { if (broken) throw Error('Deliberate test crash'); return React.createElement('p', null, 'Tool recovered'); }
    root = createRoot(document.getElementById('root'), { onCaughtError() {} });
    localStorage.setItem('retained-draft', 'my research');
    await act(async () => root.render(React.createElement(ErrorBoundary, null, React.createElement(BrokenTool))));
    assert.match(document.body.textContent, /This tool couldn’t open/);
    broken = false;
    await act(async () => document.querySelector('button').click());
    assert.match(document.body.textContent, /Tool recovered/);
    assert.equal(localStorage.getItem('retained-draft'), 'my research');
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close(); globalThis.fetch = originalFetch; dom.window.close();
  }
});

// Exercise the installed molecule model API; WebGL drawing still needs browser QA.
test('installed 3Dmol parses and styles the real receptor and selects an independent ligand pose', async () => {
  const { readFileSync } = await import('node:fs');
  const { styleReceptor, dockingPose } = await import('../src/molecule-model.js');
  const dom = new JSDOM('<!doctype html>', { runScripts: 'outside-only' });
  try {
    dom.window.$3Dmol = {};
    dom.window.URL.createObjectURL = () => 'blob:unused-test-worker';
    dom.window.eval(readFileSync(new URL('../node_modules/3dmol/build/3Dmol.js', import.meta.url), 'utf8'));
    const lib = dom.window['3Dmol'];
    const protein = new lib.GLModel(0);
    protein.addMolData(readFileSync(new URL('../fixtures/docking/1iep_receptor.pdbqt', import.meta.url), 'utf8'), 'pdbqt');
    styleReceptor(protein);
    const atoms = protein.selectedAtoms({});
    assert.equal(atoms.length, 2229);
    assert.ok(atoms.some(a => a.style.cartoon?.color === '#a5b6ac'));
    assert.equal(dockingPose('MODEL 1\nfirst\nENDMDL\nMODEL 2\nsecond\nENDMDL', 2), 'MODEL 2\nsecond\nENDMDL');
  } finally { dom.window.close(); }
});
