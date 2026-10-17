import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { toolExamples, sourceExamples } from '../src/tool-examples.js';

test('tool examples fill actual inputs, require deliberate replacement, and never submit searches or generation', { timeout: 30000 }, async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DOMParser', 'MutationObserver', 'getComputedStyle', 'localStorage', 'Event', 'MouseEvent', 'KeyboardEvent', 'FormData']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  HTMLElement.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};

  const originalFetch = globalThis.fetch, calls = [];
  const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url); calls.push({ path, method: options.method || 'GET' });
    if (path === '/api/config') return response({ storage: 'Local SQLite' });
    if (path === '/api/ai/status') return response({ configured: false });
    if (path === '/api/docking/status') return response({ configured: false, engine: { name: 'AutoDock Vina', version: '1.2.7' }, limits: {} });
    if (path === '/api/integrations/status') return response({});
    if (path.includes('/status')) return response({ configured: false });
    if (path === '/api/library' || path === '/api/history' || path.startsWith('/api/records/') || path === '/api/docking/jobs') return response([]);
    throw Error('Example unexpectedly started a request: ' + path);
  };
  const React = await import('react'), { act } = React, { createRoot } = await import('react-dom/client'), { MemoryRouter } = await import('react-router-dom');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  let root;
  const wait = async (predicate, label) => { for (let i = 0; i < 200; i++) { if (predicate()) return; await act(async () => { await new Promise(r => setTimeout(r, 15)); }); } assert.fail('Timed out: ' + label); };
  const click = async el => { assert.ok(el, 'Expected button'); await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))); };
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
    async function mount(path) {
      if (root) await act(async () => root.unmount());
      root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App))));
      await wait(() => document.querySelector('.prompt-suggestions'), path);
    }
    const cases = [
      ['/', '[aria-label="Research task input"]', toolExamples.home[0]],
      ['/search', '#research-query', toolExamples.search[0]],
      ['/search?source=pubmed', '#research-query', toolExamples.pubmed[0]],
      ['/chat', '[aria-label="Research question"]', toolExamples.chat[0]],
      ['/ai-writer', '.writer-sidebar textarea', toolExamples.writer[0]],
      ['/concepts', '[aria-label="Research area"]', toolExamples.topics[0]],
      ['/citation-generator', '.citation-page input', toolExamples.citations[0]],
      ['/diagrams', '.tool-page input', toolExamples.diagrams[0]],
      ['/paraphraser', '#source-text', toolExamples.paraphraser[0].value],
      ['/ai-humanizer', '#source-text', toolExamples.paraphraser[0].value],
      ['/ai-detector', '#source-text', toolExamples.detector[0].value],
      ['/research-workflow', '#rf-topic', toolExamples.workflow[0]],
      ['/presentation', '#rf-topic', toolExamples.presentation[0]],
      ['/verification', '#verification-query', toolExamples.verification[0]],
      ['/verification?kind=drug', '#verification-query', toolExamples.drugCheck[0]],
      ...['drugs', 'trials', 'safety', 'pubmed'].map(t => ['/pharma?tool=' + t, '#pharma-query', t === 'pubmed' ? 'GLP-1 cardiovascular outcomes' : toolExamples[t][0]]),
      ...['scholar', 'arxiv', 'python', 'grants', 'google', 'patents', 'datasets'].map(id => ['/sources/' + id, '.source-search input', sourceExamples[id][0]]),
      ['/templates', '.tc-search input', toolExamples.templates[0]],
      ['/agents', '.workflow-search-field input', toolExamples.agents[0]],
    ];
    for (const [path, selector, expected] of cases) {
      await mount(path);
      const before = calls.length;
      await click(document.querySelector('.prompt-suggestions-items button'));
      await wait(() => document.querySelector(selector)?.value === expected, 'filled input on ' + path);
      assert.ok(!calls.slice(before).some(c => c.path.includes('/generate') || c.path.includes('/search?') || c.method === 'POST'), 'No remote work from selecting example on ' + path);
    }
    await mount('/search');
    const buttons = () => [...document.querySelectorAll('.prompt-suggestions-items button')];
    await click(buttons()[0]);
    await click(buttons()[1]);
    assert.equal(document.querySelector('#research-query').value, toolExamples.search[0], 'Existing input protected');
    await click([...document.querySelectorAll('.prompt-suggestions-confirm button')].find(b => b.textContent === 'Keep my text'));
    assert.equal(document.querySelector('#research-query').value, toolExamples.search[0]);
    await click(buttons()[1]);
    await click([...document.querySelectorAll('.prompt-suggestions-confirm button')].find(b => b.textContent === 'Use example'));
    assert.equal(document.querySelector('#research-query').value, toolExamples.search[1]);
    assert.equal(document.activeElement.id, 'research-query');
    for (const path of ['/docking', '/library', '/projects', '/automations', '/sources/zotero', '/sources/mendeley', '/read-pdf']) {
      await mount(path);
      const link = document.querySelector('.prompt-suggestions-items a');
      assert.ok(link, 'Guidance question on ' + path);
      assert.equal(link.closest('.source-page-icon'), null, 'Guidance is outside decorative icon layout');
      assert.ok(link.getAttribute('href').startsWith('/chat?guide=1&q='));
    }
    await mount('/chat-pdf');
    await click(document.querySelector('.prompt-suggestions-items button'));
    assert.ok(document.body.textContent.includes('Question ready: ' + toolExamples.pdf[0]));
    await mount('/extract-data');
    await click(document.querySelectorAll('.prompt-suggestions-items button')[1]);
    await click([...document.querySelectorAll('.prompt-suggestions-confirm button')].find(b => b.textContent === 'Use example'));
    assert.ok(document.body.textContent.includes('Fields ready: ' + toolExamples.extract[1]));
  } finally {
    if (root) await act(async () => root.unmount());
    await vite.close(); globalThis.fetch = originalFetch; dom.window.close();
  }
});
