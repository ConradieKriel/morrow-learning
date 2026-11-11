export type ManualInteraction = 'reflection' | 'reveal' | 'checklist' | 'choice';

export type ManualQuestionInput = {
  id: string;
  prompt: string;
  interaction: ManualInteraction;
  reveal: string;
  steps: string;
  options: string;
  correctIndex: number;
};

export type ManualActivityInput = {
  title: string;
  lesson: string;
  instructions: string;
  questions: ManualQuestionInput[];
};

export function createManualQuestion(id = 'question-1'): ManualQuestionInput {
  return {
    id,
    prompt: '',
    interaction: 'choice',
    reveal: '',
    steps: '',
    options: 'Option A\nOption B\nOption C\nOption D',
    correctIndex: 0,
  };
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] || character);
}

function paragraph(value: string): string {
  return escapeHtml(value.trim()).replace(/\r?\n/g, '<br>');
}

/** Builds one self-contained, multi-question activity without contacting an AI service. */
export function buildManualActivityHtml(input: ManualActivityInput): string {
  const title = input.title.trim();
  if (!title) throw new Error('Add an activity title first.');
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    throw new Error('Add at least one question to this activity.');
  }
  if (input.questions.length > 50) throw new Error('An activity can contain up to 50 questions.');

  const questionCards = input.questions.map((question, index) => {
    const prompt = question.prompt.trim();
    if (!prompt) throw new Error(`Add the text for question ${index + 1}.`);

    let content = '';
    if (question.interaction === 'reflection') {
      content = `
        <label class="field-label" for="response-${index}">Your answer</label>
        <textarea id="response-${index}" data-response rows="4" placeholder="Write your answer here..."></textarea>
      `;
    } else if (question.interaction === 'reveal') {
      const reveal = question.reveal.trim() || 'Review the lesson notes and explain the main idea in your own words.';
      content = `
        <button type="button" data-reveal>Reveal a hint or example answer</button>
        <div class="answer" data-reveal-answer hidden>${paragraph(reveal)}</div>
        <p class="question-feedback" data-question-feedback role="status" aria-live="polite"></p>
      `;
    } else if (question.interaction === 'checklist') {
      const steps = question.steps.split(/\r?\n/).map((step) => step.trim()).filter(Boolean).slice(0, 12);
      if (steps.length < 2) throw new Error(`Question ${index + 1}: add at least two checklist steps, one per line.`);
      content = `
        <div class="steps">
          ${steps.map((step) => `<label class="step"><input type="checkbox" data-checklist-step><span>${escapeHtml(step)}</span></label>`).join('')}
        </div>
        <p class="question-feedback" data-question-feedback role="status" aria-live="polite">0 of ${steps.length} steps complete</p>
      `;
    } else if (question.interaction === 'choice') {
      const options = question.options.split(/\r?\n/).map((option) => option.trim()).filter(Boolean).slice(0, 4);
      if (options.length < 2) throw new Error(`Question ${index + 1}: add at least two answer options, one per line.`);
      const requestedCorrectIndex = Number.isFinite(question.correctIndex) ? Math.floor(question.correctIndex) : 0;
      const correctIndex = Math.max(0, Math.min(options.length - 1, requestedCorrectIndex));
      content = `
        <div class="choices" role="group" aria-label="Answer options">
          ${options.map((option, optionIndex) => `
            <label class="option">
              <input type="radio" name="answer-${index}" value="${optionIndex === correctIndex ? 'correct' : 'incorrect'}">
              <span>${escapeHtml(option)}</span>
            </label>
          `).join('')}
        </div>
        <p class="question-feedback" data-question-feedback role="status" aria-live="polite"></p>
      `;
    } else {
      throw new Error(`Question ${index + 1}: choose a valid interaction type.`);
    }

    const interactionLabel: Record<ManualInteraction, string> = {
      reflection: 'Written response',
      reveal: 'Reveal answer',
      checklist: 'Checklist',
      choice: 'Multiple choice',
    };

    return `
      <section class="question-card" data-question data-type="${question.interaction}">
        <div class="question-heading"><span>QUESTION ${index + 1}</span><span>${interactionLabel[question.interaction]}</span></div>
        <h2>${paragraph(prompt)}</h2>
        ${content}
      </section>
    `;
  }).join('');

  const lesson = input.lesson.trim()
    ? `<section class="lesson"><h2>Explore the idea</h2><p>${paragraph(input.lesson)}</p></section>`
    : '';
  const instructions = input.instructions.trim()
    ? `<p class="instructions">${paragraph(input.instructions)}</p>`
    : '<p class="instructions">Answer each question, then finish the activity to see your result.</p>';

  const script = `
    (function () {
      var cards = Array.from(document.querySelectorAll('[data-question]'));
      var finishButton = document.getElementById('finish-activity');
      var result = document.getElementById('activity-result');

      cards.forEach(function (card) {
        var revealButton = card.querySelector('[data-reveal]');
        if (revealButton) {
          revealButton.addEventListener('click', function () {
            var answer = card.querySelector('[data-reveal-answer]');
            answer.hidden = !answer.hidden;
            revealButton.textContent = answer.hidden ? 'Reveal a hint or example answer' : 'Hide hint or example answer';
            card.dataset.revealed = answer.hidden ? 'false' : 'true';
          });
        }

        var steps = Array.from(card.querySelectorAll('[data-checklist-step]'));
        if (steps.length) {
          steps.forEach(function (step) {
            step.addEventListener('change', function () {
              var count = steps.filter(function (item) { return item.checked; }).length;
              var feedback = card.querySelector('[data-question-feedback]');
              feedback.textContent = count + ' of ' + steps.length + ' steps complete';
            });
          });
        }
      });

      finishButton.addEventListener('click', function () {
        var missing = [];
        var completed = 0;
        var score = 0;
        var maxScore = 0;

        cards.forEach(function (card, index) {
          var type = card.dataset.type;
          var feedback = card.querySelector('[data-question-feedback]');
          var isComplete = false;

          if (type === 'reflection') {
            var response = card.querySelector('[data-response]');
            isComplete = Boolean(response && response.value.trim());
          } else if (type === 'reveal') {
            isComplete = card.dataset.revealed === 'true';
            if (feedback) feedback.textContent = isComplete ? 'Hint or example reviewed.' : '';
          } else if (type === 'checklist') {
            var checks = Array.from(card.querySelectorAll('[data-checklist-step]'));
            isComplete = checks.length > 0 && checks.every(function (check) { return check.checked; });
            if (feedback && !isComplete) feedback.textContent = 'Complete every step before finishing.';
          } else if (type === 'choice') {
            var selected = card.querySelector('input[type="radio"]:checked');
            isComplete = Boolean(selected);
            if (selected) {
              maxScore += 1;
              if (selected.value === 'correct') {
                score += 1;
                if (feedback) feedback.textContent = 'Correct. Well done!';
              } else if (feedback) {
                feedback.textContent = 'Not quite. Review the correct answer with your teacher.';
              }
            }
          }

          if (isComplete) completed += 1;
          else missing.push(index + 1);
        });

        if (missing.length) {
          result.textContent = 'Please finish question' + (missing.length === 1 ? ' ' : 's ') + missing.join(', ') + ' before submitting.';
          return;
        }

        result.textContent = maxScore > 0
          ? 'You completed all ' + cards.length + ' questions. Your score is ' + score + ' out of ' + maxScore + '.'
          : 'You completed all ' + completed + ' questions. Well done!';
        finishButton.disabled = true;
        if (maxScore > 0 && typeof window.reportScore === 'function') window.reportScore(score, maxScore);
      });
    })();
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light;--green:#315d46;--pale:#edf4ed;--ink:#26352c;--line:#dce6dc}*{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:var(--ink);font:16px/1.6 Arial,sans-serif;padding:24px 14px}.wrap{max-width:720px;margin:0 auto}.top{background:var(--green);color:white;border-radius:14px;padding:24px}.top small{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}.top h1{font-size:clamp(26px,6vw,38px);line-height:1.15;margin:10px 0 0}.lesson,.card,.question-card{background:white;border:1px solid var(--line);border-radius:14px;padding:20px;margin-top:16px}.lesson h2,.card h2,.question-card h2{font-size:19px;margin:0 0 10px}.lesson p,.question-card p{margin:0 0 14px}.instructions{color:#4c6553;margin:0 0 14px}.privacy{color:#718075;font-size:12px;margin:0}.question-heading{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px;color:#54715c;font-size:11px;font-weight:700;letter-spacing:.09em}.question-heading span+span{font-weight:400;letter-spacing:0}.field-label{display:block;font-weight:700;margin:12px 0 6px}button{background:var(--green);border:0;border-radius:8px;color:#fff;font:inherit;font-weight:700;padding:11px 16px;cursor:pointer}button:disabled{opacity:.6;cursor:default}textarea{display:block;width:100%;max-width:100%;margin:8px 0 12px;border:1px solid var(--line);border-radius:8px;padding:12px;font:inherit}.question-feedback{color:var(--green);font-size:14px;font-weight:700;margin-top:12px!important;min-height:1.2em}.answer{margin-top:14px;padding:14px;background:var(--pale);border-radius:9px;white-space:normal}.steps,.choices{display:grid;gap:9px}.step,.option{display:flex;gap:10px;align-items:flex-start;padding:11px;border:1px solid var(--line);border-radius:8px}.step input,.option input{margin-top:6px;accent-color:var(--green)}.option{cursor:pointer}.finish{width:100%;margin-top:18px}.result{padding:14px;margin-top:14px;background:var(--pale);border-radius:9px;color:var(--green);font-weight:700;min-height:1.5em}.foot{text-align:center;color:#748077;font-size:12px;margin:20px 0 0}
</style>
</head>
<body><main class="wrap"><header class="top"><small>Morrow learning activity</small><h1>${escapeHtml(title)}</h1></header>${lesson}<section class="card">${instructions}<p class="privacy">Written responses are only used in this activity page. They are not sent to Morrow or saved after you leave.</p></section>${questionCards}<button class="finish" id="finish-activity" type="button">Finish activity</button><p class="result" id="activity-result" role="status" aria-live="polite"></p><p class="foot">Made with Morrow · Your learning, your pace</p></main>
<script>${script}</script></body></html>`;
}
