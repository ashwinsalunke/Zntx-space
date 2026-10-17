import test from 'node:test';
import assert from 'node:assert/strict';
import { wantsResearchGuide, guideToolPath, guidePrompt, validateGuide } from '../shared/research-guide.js';

test('help and project-start requests route to guidance while factual research stays search', () => {
  for (const q of ['What can ScrapDX AI help me with?', 'How is ScrapTX going to help me in my research project?', 'I want to do research about bacteria', 'I want to research about bacteria', 'Help me start a research project', 'How can I use this app?', 'hello']) assert.equal(wantsResearchGuide(q), true, q);
  for (const q of ['bacteria antibiotic resistance', 'What causes antibiotic resistance in bacteria?', 'Compare bacterial microbiome studies', 'AI tools for research', 'scraping scientific databases']) assert.equal(wantsResearchGuide(q), false, q);
});
test('guide actions are real allowlisted routes and preserve the topic as encoded text', () => {
  assert.equal(guideToolPath('workflow', 'bacteria & resistance'), '/research-workflow?topic=bacteria+%26+resistance');
  assert.equal(guideToolPath('compare', 'bacteria'), '/search?q=bacteria&source=deep&view=table');
  assert.equal(guideToolPath('toString'), null);
  assert.equal(guideToolPath('https://evil.example'), null);
  assert.equal(guideToolPath('pdf', 'topic'), '/chat-pdf');
});
test('guide rejects invented actions and malformed output; history stays bounded and carries topic', () => {
  const guide = { reply: 'Let’s plan your review.', steps: ['Find sources, then compare their methods.'], topic: 'bacteria', question: 'Which angle?', suggestions: ['Resistance'], actions: ['papers'] };
  assert.deepEqual(validateGuide(guide), guide);
  for (const bad of [{ ...guide, actions: ['invented'] }, { ...guide, actions: ['__proto__'] }, { ...guide, suggestions: ['a', 'b', 'c', 'd'] }, { ...guide, reply: '' }]) assert.throws(() => validateGuide(bad));
  const text = guidePrompt('A presentation', Array.from({ length: 30 }, () => ({ query: 'I want to study bacteria', guide: { ...guide, reply: 'x'.repeat(5000) } })));
  assert.ok(text.length < 24000);
  const context = JSON.parse(text);
  assert.equal(context.conversation.length, 6);
  assert.equal(context.conversation[0].topic, 'bacteria');
  assert.equal(context.request, 'A presentation');
});
