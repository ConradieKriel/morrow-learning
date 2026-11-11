import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManualActivityHtml, createManualQuestion } from '../lib/manual-activity.ts';
import { validateGeneratedHtml } from '../lib/html-sandbox.ts';

const question = (id, prompt, overrides = {}) => ({
  ...createManualQuestion(id),
  prompt,
  ...overrides,
});

const base = {
  title: 'Water cycle explorer',
  lesson: 'Water moves between the land, oceans and atmosphere.',
  instructions: 'Read the short lesson and complete every question.',
  questions: [
    question('q1', 'Which process changes liquid water into water vapour?', {
      interaction: 'choice',
      options: 'Evaporation\nCondensation\nPrecipitation\nCollection',
      correctIndex: 0,
    }),
  ],
};

test('manual activity builds a complete standalone page without AI', () => {
  const html = buildManualActivityHtml(base);
  assert.doesNotThrow(() => validateGeneratedHtml(html));
  assert.match(html, /data-question/);
  assert.match(html, /Finish activity/);
  assert.match(html, /reportScore\(score, maxScore\)/);
});

test('manual activity supports multiple questions in the same activity', () => {
  const html = buildManualActivityHtml({
    ...base,
    questions: [
      ...base.questions,
      question('q2', 'Explain why clouds form.', { interaction: 'reflection' }),
      question('q3', 'What happens after water vapour cools?', {
        interaction: 'choice',
        options: 'It condenses\nIt combusts\nIt disappears\nIt freezes instantly',
        correctIndex: 0,
      }),
    ],
  });

  assert.doesNotThrow(() => validateGeneratedHtml(html));
  assert.equal((html.match(/class="question-card" data-question/g) || []).length, 3);
  assert.match(html, /QUESTION 1/);
  assert.match(html, /QUESTION 2/);
  assert.match(html, /QUESTION 3/);
  assert.match(html, /Your answer/);
  assert.match(html, /var maxScore = 0/);
});

test('manual activity supports all four interaction types across different questions', () => {
  const html = buildManualActivityHtml({
    ...base,
    questions: [
      question('q1', 'Choose the stage that forms clouds.', {
        interaction: 'choice', options: 'Evaporation\nCondensation', correctIndex: 1,
      }),
      question('q2', 'Write one thing you learned.', { interaction: 'reflection' }),
      question('q3', 'Reveal a hint about evaporation.', {
        interaction: 'reveal', reveal: 'The sun provides energy for this process.',
      }),
      question('q4', 'Put your work in order.', {
        interaction: 'checklist', steps: 'Read the task\nPlan\nCheck your answer',
      }),
    ],
  });

  assert.match(html, /data-response/);
  assert.match(html, /data-reveal/);
  assert.match(html, /data-checklist-step/);
  assert.match(html, /type="radio"/);
  assert.doesNotThrow(() => validateGeneratedHtml(html));
});

test('manual builder escapes teacher input in the title, question and options', () => {
  const html = buildManualActivityHtml({
    ...base,
    title: '<script>alert(1)</script>',
    questions: [question('q1', '<img src=x onerror=alert(1)>', {
      interaction: 'choice',
      options: '<script>bad()</script>\nSafe answer',
      correctIndex: 1,
    })],
  });
  assert.doesNotThrow(() => validateGeneratedHtml(html));
  assert.doesNotMatch(html, /<h1><script>/);
  assert.doesNotMatch(html, /<h2><img/);
  assert.match(html, /&lt;script&gt;/);
});

test('manual builder validates activity title, question count and each question', () => {
  assert.throws(() => buildManualActivityHtml({ ...base, title: '  ' }), /title/);
  assert.throws(() => buildManualActivityHtml({ ...base, questions: [] }), /at least one question/);
  assert.throws(() => buildManualActivityHtml({ ...base, questions: [question('q1', '')] }), /question 1/);
  assert.throws(() => buildManualActivityHtml({ ...base, questions: [question('q1', 'Make a list', { interaction: 'checklist', steps: 'Only one step' })] }), /at least two checklist steps/);
  assert.throws(() => buildManualActivityHtml({ ...base, questions: [question('q1', 'Select an answer', { interaction: 'choice', options: 'Only one option' })] }), /at least two answer options/);
});

test('learner can finish a multi-question activity and receives one combined score', async () => {
  const vm = await import('node:vm');
  const html = buildManualActivityHtml({
    ...base,
    questions: [
      base.questions[0],
      question('q2', 'What causes water to evaporate?', {
        interaction: 'choice', options: 'Heat energy\nMoonlight', correctIndex: 0,
      }),
      question('q3', 'Explain one thing you learned.', { interaction: 'reflection' }),
    ],
  });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(script);

  const createElement = (initial = {}) => ({
    textContent: '', hidden: false, disabled: false, checked: false, value: '',
    listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    ...initial,
  });
  const createCard = (type, options = {}) => {
    const feedback = createElement();
    const response = createElement({ value: options.response || '' });
    const selected = options.selected ? createElement({ value: options.selected }) : null;
    const revealButton = createElement({ textContent: 'Reveal a hint or example answer' });
    const revealAnswer = createElement({ hidden: true });
    const steps = (options.steps || []).map((checked) => createElement({ checked }));
    return {
      dataset: { type, revealed: 'false' },
      querySelector(selector) {
        if (selector === '[data-reveal]') return type === 'reveal' ? revealButton : null;
        if (selector === '[data-reveal-answer]') return type === 'reveal' ? revealAnswer : null;
        if (selector === '[data-question-feedback]') return feedback;
        if (selector === '[data-response]') return type === 'reflection' ? response : null;
        if (selector === 'input[type="radio"]:checked') return type === 'choice' ? selected : null;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-checklist-step]') return steps;
        return [];
      },
      _feedback: feedback,
      _revealButton: revealButton,
      _revealAnswer: revealAnswer,
      _steps: steps,
    };
  };

  const cards = [
    createCard('choice', { selected: 'correct' }),
    createCard('choice', { selected: 'incorrect' }),
    createCard('reflection', { response: 'Evaporation is when liquid turns into vapour.' }),
  ];
  const finishButton = createElement();
  const result = createElement();
  const reported = [];
  const document = {
    querySelectorAll(selector) { return selector === '[data-question]' ? cards : []; },
    getElementById(id) { return id === 'finish-activity' ? finishButton : result; },
  };

  vm.runInNewContext(script, {
    document,
    window: { reportScore: (score, maxScore) => reported.push([score, maxScore]) },
  });
  finishButton.listeners.click();

  assert.match(result.textContent, /completed all 3 questions/i);
  assert.match(result.textContent, /score is 1 out of 2/i);
  assert.deepEqual(reported, [[1, 2]]);
  assert.equal(finishButton.disabled, true);
});

test('learner cannot submit until every question interaction is completed', async () => {
  const vm = await import('node:vm');
  const html = buildManualActivityHtml({
    ...base,
    questions: [
      question('q1', 'Reveal the example.', { interaction: 'reveal', reveal: 'An example.' }),
      question('q2', 'Complete all steps.', { interaction: 'checklist', steps: 'Read\nCheck' }),
    ],
  });
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  const listeners = {};
  const feedback = { textContent: '' };
  const answer = { hidden: true };
  const revealButton = { textContent: 'Reveal a hint or example answer', addEventListener(type, callback) { listeners[`reveal-${type}`] = callback; } };
  const checks = [{ checked: true, addEventListener() {} }, { checked: false, addEventListener() {} }];
  const cards = [
    { dataset: { type: 'reveal', revealed: 'false' }, querySelector: (selector) => selector === '[data-reveal]' ? revealButton : selector === '[data-reveal-answer]' ? answer : selector === '[data-question-feedback]' ? feedback : null, querySelectorAll: () => [] },
    { dataset: { type: 'checklist' }, querySelector: (selector) => selector === '[data-question-feedback]' ? feedback : null, querySelectorAll: () => checks },
  ];
  const finishButton = { disabled: false, addEventListener(type, callback) { listeners[`finish-${type}`] = callback; } };
  const result = { textContent: '' };
  const document = {
    querySelectorAll: () => cards,
    getElementById: (id) => id === 'finish-activity' ? finishButton : result,
  };
  vm.runInNewContext(script, { document, window: {} });
  listeners['finish-click']();
  assert.match(result.textContent, /finish questions 1, 2/i);

  listeners['reveal-click']();
  checks[1].checked = true;
  listeners['finish-click']();
  assert.match(result.textContent, /completed all 2 questions/i);
  assert.equal(finishButton.disabled, true);
});
