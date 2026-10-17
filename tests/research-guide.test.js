import test from 'node:test';
import assert from 'node:assert/strict';
import { wantsResearchGuide, guideToolPath, guidePrompt, validateGuide, preferredGuideTool, prioritizeGuideAction, guideRequest } from '../shared/research-guide.js';

test('help and project-start requests route to guidance while factual research stays search', () => {
  for (const q of ['What can ScrapDX AI help me with?', 'How is ScrapTX going to help me in my research project?', 'I want to do research about bacteria', 'I want to research about bacteria', 'Help me start a research project', 'How can I use this app?', 'hello', 'I am working on molecular docking', 'I’m currently working on molecular docking', 'We are preparing a literature review', 'I am studying bacteria', 'Open molecular docking', 'Who are you?', 'What is scrapeTx?', 'What do you do for the user?']) assert.equal(wantsResearchGuide(q), true, q);
  for (const q of ['bacteria antibiotic resistance', 'What causes antibiotic resistance in bacteria?', 'Compare bacterial microbiome studies', 'AI tools for research', 'scraping scientific databases', 'molecular docking', 'Molecular docking validation studies', 'Compare molecular docking algorithms']) assert.equal(wantsResearchGuide(q), false, q);
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

test('explicit research tasks get their matching tool even when the AI omits it', () => {
  const guide = { actions: ['papers', 'compare', 'workflow'], topic: 'molecular docking' };
  assert.deepEqual(prioritizeGuideAction(guide, 'I am working on molecular docking').actions, ['docking', 'papers', 'compare']);
  assert.equal(guideToolPath('docking'), '/docking');
  for (const [request, tool] of [['I am working on a presentation', 'slides'], ['I am writing a literature review', 'workflow'], ['Help me understand a PDF', 'pdf'], ['I am creating a bibliography', 'citations'], ['I need a flowchart', 'diagrams'], ['Create slides about molecular docking', 'slides'], ['Find papers on molecular docking', 'papers']]) assert.equal(preferredGuideTool(request), tool, request);
  assert.equal(prioritizeGuideAction(guide, 'I am studying bacteria'), guide);
  const prompt = guidePrompt('I am working on a presentation', [{ query: 'molecular docking' }]);
  assert.equal(preferredGuideTool(guideRequest(prompt)), 'slides', 'Current task wins over older context');
});
