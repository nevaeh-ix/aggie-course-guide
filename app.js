// Start with the student's major, then match what they want to learn.
import { assess, normalizeCode } from './engine.mjs';
import { buildLexicalIndex, rankCourses } from './retrieval.mjs';
import { interpretMessage } from './conversation.mjs';
const $ = (id) => document.getElementById(id);
const createElement = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const PLAN_STORAGE_KEY = 'aggie-plan-v2';
const MODEL_LOAD_TIMEOUT_MS = 90000;
const MAX_CACHED_QUERIES = 8;
const MODEL_NAMES = { semantic: 'MiniLM', tfidf: 'TF-IDF', bm25: 'BM25' };

let catalog, vectors, lexicalIndex;
let worker, pending;
let serial = 0;
let busy = false;
let generation = 0;
let lastRun = null;
let resultBubble = null;
const vectorCache = new Map();
let workerReady = false;
let saved = [];

// Keep the plan when the page refreshes in the same browser tab.
try {
  saved = JSON.parse(sessionStorage.getItem(PLAN_STORAGE_KEY) || '[]');
  if (!Array.isArray(saved)) saved = [];
} catch {
  // A blocked or unreadable session should still let someone explore courses.
}

function setStatus(text) {
  $('aiStatus').textContent = text;
}

function savePlan() {
  try {
    sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    setStatus('Session storage unavailable; keep this tab open to retain your plan.');
  }
}

function addMessage(kind, text) {
  const bubble = createElement('div', text, `bubble ${kind}`);
  $('messages').append(bubble);
  $('messages').scrollTop = $('messages').scrollHeight;
  return bubble;
}

function readProfile() {
  const parseCourseCodes = (value) =>
    value
      .split(/[,;\n]+/)
      .map(normalizeCode)
      .filter(Boolean);
  return {
    program: $('program').value,
    standing: $('standing').value,
    completed: parseCourseCodes($('completed').value),
    concurrent: parseCourseCodes($('concurrent').value),
    permission: $('permission').checked,
    statistics: $('stats').checked,
    readyOnly: $('readyOnly').checked
  };
}

function setSearchBusy(isBusy) {
  busy = isBusy;
  $('findButton').disabled = isBusy;
  $('matchingMode').disabled = isBusy;
  if (isBusy) $('chatForm').setAttribute('aria-busy', 'true');
  else $('chatForm').removeAttribute('aria-busy');
}

function stopWorker() {
  worker?.terminate();
  worker = null;
  workerReady = false;
}

function startWorker() {
  worker = new Worker(new URL('./ai-worker.js?v=10', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    // Ignore a reply if its search was cancelled or replaced.
    if (!pending || data.id !== pending.id) return;
    if (data.status === 'loading')
      setStatus(
        `Loading AI model · ${data.progress}% · keyword matching is available without a download`
      );
    else {
      const request = pending;
      pending = null;
      clearTimeout(request.timeout);
      if (data.status === 'ready') {
        workerReady = true;
        request.resolve(data.vector);
      } else {
        stopWorker();
        request.reject(new Error(data.message));
      }
    }
  };
  worker.onerror = () => {
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('AI could not start in this browser.'));
      pending = null;
    }
    stopWorker();
  };
}

function embedQuery(text) {
  // Reuse a recent query instead of running the model again.
  if (vectorCache.has(text)) return Promise.resolve(vectorCache.get(text));
  if (!worker) startWorker();
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => {
      stopWorker();
      pending = null;
      reject(new Error('The AI model took too long to load. Retry, or choose keyword matching.'));
    }, MODEL_LOAD_TIMEOUT_MS);
    pending = {
      id,
      resolve: (vector) => {
        if (vectorCache.size >= MAX_CACHED_QUERIES) {
          vectorCache.delete(vectorCache.keys().next().value);
        }
        vectorCache.set(text, vector);
        resolve(vector);
      },
      reject,
      timeout
    };
    setStatus(
      workerReady
        ? 'Comparing your interests with course text…'
        : 'Loading AI model for the first request · about 23 MB'
    );
    worker.postMessage({ id, text });
  });
}

function createSourceLink(course) {
  const link = createElement(
    'a',
    `Source: ${course.sourceYear}${course.sourcePage ? ` · PDF p. ${course.sourcePage}` : ''} ↗`
  );
  link.href = course.source + (course.sourcePage ? `#page=${course.sourcePage}` : '');
  link.target = '_blank';
  link.rel = 'noreferrer';
  return link;
}

function createPlanButton(course) {
  const button = createElement(
    'button',
    saved.some(
      (savedCourse) =>
        savedCourse.program === $('program').value && savedCourse.code === course.code
    )
      ? 'Saved ✓'
      : '+ Save to plan',
    'chip save-course'
  );
  button.type = 'button';
  button.dataset.course = course.code;
  button.addEventListener('click', () => {
    const program = $('program').value;
    if (
      !saved.some(
        (savedCourse) => savedCourse.program === program && savedCourse.code === course.code
      )
    )
      saved.push({ program, code: course.code });
    savePlan();
    renderPlan();
    button.textContent = 'Saved ✓';
  });
  return button;
}

function renderPlan() {
  // Each major has its own shortlist, even when course codes overlap.
  const list = $('planList');
  list.replaceChildren();
  const program = $('program').value;
  const courses = saved
    .filter((savedCourse) => savedCourse.program === program)
    .map((savedCourse) => catalog.courses.find((course) => course.code === savedCourse.code))
    .filter(Boolean);
  const credits = courses.reduce((total, course) => total + (course.credits || 0), 0);
  const hasUnknownCredits = courses.some((course) => course.credits === null);
  $('planTotal').textContent =
    `${courses.length} courses · ${credits}${hasUnknownCredits ? '+' : ''} known credits`;
  if (!courses.length)
    list.append(createElement('p', 'Save courses from your results to build a shortlist.', 'hint'));
  for (const course of courses) {
    const row = createElement('div', undefined, 'plan-row');
    const info = createElement('div', `${course.code} · ${course.title}`);
    const check = assess(course, readProfile());
    info.append(
      createElement(
        'small',
        check.status === 'blocked'
          ? `Plan ahead: ${check.missing.join(', ')}`
          : check.status === 'review'
            ? 'Requirements need review'
            : check.status === 'completed'
              ? 'Already completed'
              : 'Listed course checks met'
      )
    );
    const removeButton = createElement('button', '×', 'remove-course');
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Remove ${course.code}`);
    removeButton.addEventListener('click', () => {
      saved = saved.filter(
        (savedCourse) => !(savedCourse.program === program && savedCourse.code === course.code)
      );
      savePlan();
      renderPlan();
      document.querySelectorAll('.save-course').forEach((saveButton) => {
        saveButton.textContent = saved.some(
          (savedCourse) =>
            savedCourse.program === program && savedCourse.code === saveButton.dataset.course
        )
          ? 'Saved ✓'
          : '+ Save to plan';
      });
    });
    row.append(info, removeButton);
    list.append(row);
  }
}

function createCourseCard(result, semantic) {
  const { course, checks, score } = result;
  const card = createElement('article', undefined, 'course');
  const top = createElement('div', undefined, 'course-top');
  const title = createElement('div');
  title.append(
    createElement('h3', course.title),
    createElement('div', `${course.code} · ${course.credits ?? 'Unlisted'} credits`, 'course-code')
  );
  top.append(title, createElement('span', MODEL_NAMES[result.method] || 'Course details', 'match'));
  card.append(top);
  if (Number.isFinite(score))
    card.append(
      createElement(
        'p',
        semantic
          ? `Meaning similarity: ${score.toFixed(3)} · not a probability`
          : `${MODEL_NAMES[result.method]} score: ${score.toFixed(3)} · ${score > 0 ? 'shared course terms' : 'no shared terms'}`,
        'course-note'
      )
    );
  if (result.matchedTerms?.length)
    card.append(
      createElement('p', `Shared words: ${result.matchedTerms.join(', ')}`, 'matched-terms')
    );
  card.append(createElement('p', course.description, 'course-description'));
  const label =
    checks.status === 'ready'
      ? 'Listed course checks met'
      : checks.status === 'blocked'
        ? 'Plan ahead'
        : checks.status === 'completed'
          ? 'Already completed'
          : 'Review requirements';
  card.append(createElement('div', label, `eligibility ${checks.status}`));
  if (checks.missing.length)
    card.append(createElement('p', `Still needed: ${checks.missing.join('; ')}`, 'course-note'));
  if (checks.notes.length) card.append(createElement('p', checks.notes.join(' '), 'course-note'));
  const details = createElement('details');
  details.append(
    createElement('summary', 'See listed requirements'),
    createElement(
      'p',
      course.requirementText ||
        'No complete prerequisite rule is available for this course. Verify before registering.',
      'course-note'
    )
  );
  const bottom = createElement('div', undefined, 'course-bottom');
  bottom.append(createSourceLink(course), createPlanButton(course));
  card.append(details, bottom);
  return card;
}

function calculateRun(
  query,
  mode,
  queryVector = null,
  embeddingMs = 0,
  modelCold = false,
  error = null
) {
  const snapshot = readProfile();
  // Compare the models with the same profile and course pool.
  const models = mode === 'compare' ? ['tfidf', 'bm25', 'semantic'] : [mode];
  const runs = models.map((method) => {
    if (method === 'semantic' && !queryVector)
      return { method, rows: [], rankingMs: null, unavailable: true };
    const start = performance.now();
    const rows = rankCourses(catalog.courses, lexicalIndex, query, snapshot, {
      method,
      queryVector,
      vectors,
      limit: mode === 'compare' ? 3 : 6,
      // Keep zero-score results visible when comparing the top three from each model.
      minScore: mode === 'compare' ? null : method === 'semantic' ? 0.19 : 0
    });
    return { method, rows, rankingMs: performance.now() - start, unavailable: false };
  });
  return {
    query,
    mode,
    profile: snapshot,
    runs,
    queryVector,
    embeddingMs,
    modelCold,
    error,
    createdAt: new Date().toISOString()
  };
}

function renderResults(run, refresh = false) {
  if (!refresh) {
    if (resultBubble)
      resultBubble.replaceChildren(
        createElement(
          'p',
          'Earlier search results cleared. The courses below use your current profile.',
          'source'
        )
      );
    resultBubble = addMessage('assistant', '');
  } else if (!resultBubble) return;
  resultBubble.replaceChildren();
  resultBubble.classList.toggle('comparison-bubble', run.mode === 'compare');
  resultBubble.append(createElement('p', `Courses for “${run.query}”`, 'results-title'));
  if (run.error)
    resultBubble.append(
      createElement(
        'p',
        run.mode === 'compare'
          ? 'The on-device AI could not load. Both keyword models are shown below; select AI matching to retry.'
          : 'The on-device AI could not load. These are keyword matches, so you can keep exploring. Select AI matching to retry.',
        'fallback-note'
      )
    );
  if (run.mode === 'compare') {
    resultBubble.append(
      createElement(
        'p',
        'Same interest, same major and profile. Each model ranks the same courses; its first three results appear below. Scores have different scales and do not measure accuracy.',
        'comparison-intro'
      )
    );
    const columns = createElement('div', undefined, 'comparison-grid');
    for (const model of run.runs) {
      const column = createElement('section', undefined, 'comparison-column');
      column.append(
        createElement('h3', MODEL_NAMES[model.method]),
        createElement(
          'p',
          model.method === 'semantic' ? 'Matches related meanings' : 'Matches words in course text',
          'hint'
        )
      );
      if (model.unavailable)
        column.append(
          createElement(
            'p',
            'AI unavailable on this device. Try again or use either keyword model.',
            'fallback-note'
          )
        );
      else {
        column.append(
          createElement('p', `Ranking: ${model.rankingMs.toFixed(1)} ms`, 'run-timing')
        );
        if (!model.rows.length)
          column.append(createElement('p', 'No courses meet your profile filters.', 'hint'));
        else if (model.rows.every((r) => r.score === 0))
          column.append(
            createElement(
              'p',
              'No shared words. The zero-score ties below are ordered by course code, not relevance.',
              'zero-match'
            )
          );
        for (const [i, row] of model.rows.entries()) {
          const card = createCourseCard(row, model.method === 'semantic');
          card.classList.add('compact-course');
          card.prepend(createElement('div', `#${i + 1}`, 'rank-label'));
          column.append(card);
        }
      }
      columns.append(column);
    }
    resultBubble.append(columns);
    if (run.queryVector)
      resultBubble.append(
        createElement(
          'p',
          `AI input processing: ${run.embeddingMs.toFixed(0)} ms${run.modelCold ? ' (includes first model load)' : ''}. Ranking times above exclude this shared input-processing step. These timings describe this device and request. They are not a recommendation-quality benchmark.`,
          'source'
        )
      );
  } else {
    const model = run.runs[0];
    resultBubble.append(
      createElement(
        'p',
        model.rows.length
          ? 'Start with the descriptions, then check what you may need to take first.'
          : 'No strong matches with these settings. Try another interest or turn off “Only listed course checks met” to see courses to prepare for.'
      )
    );
    const cards = createElement('div', undefined, 'recommendations');
    for (const row of model.rows) cards.append(createCourseCard(row, model.method === 'semantic'));
    resultBubble.append(cards);
  }
  resultBubble.append(
    createElement(
      'p',
      'Only the captured requirements can be checked. Grades, course offerings, and degree or track credit still need confirmation.',
      'source'
    )
  );
  $('exportComparison').disabled = run.mode !== 'compare';
  $('messages').scrollTop = $('messages').scrollHeight;
}

function refreshResults() {
  if (!lastRun || busy) return;
  // Profile changes can reuse the last query vector; no new model request is needed.
  lastRun = calculateRun(
    lastRun.query,
    lastRun.mode,
    lastRun.queryVector,
    lastRun.embeddingMs,
    lastRun.modelCold,
    lastRun.error
  );
  renderResults(lastRun, true);
}

function offerTopics() {
  const bubble = addMessage(
    'assistant',
    'What would make a class fun for you—building something, being creative, or solving a problem? Pick a starting point or describe an interest. I don’t have verified difficulty or workload ratings.'
  );
  const options = createElement('div', undefined, 'clarify-options');
  const choices = TOPICS_BY_PROGRAM[$('program').value] || [];
  for (const label of choices) {
    const button = createElement('button', label, 'chip');
    button.type = 'button';
    button.onclick = () => {
      if (!busy) {
        $('question').value = label;
        ask();
      }
    };
    options.append(button);
  }
  bubble.append(options);
}
async function ask() {
  if (busy || !catalog) return;
  const question = $('question').value.trim() || $('interest').value.trim();
  if (!question) {
    $('question').focus();
    setStatus('Tell me a topic or something you want to build.');
    return;
  }
  const interpreted = interpretMessage(question);
  const snapshot = readProfile();
  const invalidCodes = [
    ...snapshot.completed,
    ...snapshot.concurrent,
    ...interpreted.updates.completed
  ].filter((c) => !/^([A-Z]{2,5}|COMP\/ECEN) \d{3}$/.test(normalizeCode(c)));
  if (invalidCodes.length) {
    setStatus(`Use course codes separated by commas. Check: ${invalidCodes.join(', ')}`);
    return;
  }
  addMessage('student', question);
  $('question').value = '';
  $('interest').value = '';
  if (interpreted.updates.standing) $('standing').value = interpreted.updates.standing;
  if (interpreted.updates.completed.length)
    $('completed').value = [
      ...new Set([...snapshot.completed, ...interpreted.updates.completed].map(normalizeCode))
    ].join(', ');
  renderPlan();
  // Handle profile updates and greetings before loading the AI model.
  if (interpreted.kind === 'profile') {
    addMessage(
      'assistant',
      `Got it—your profile is updated.${interpreted.updates.standing ? ' Your year helps with class-standing rules, but does not confirm completed prerequisites.' : ''}${lastRun ? ' I’ve refreshed your latest results.' : ' What would you like to learn or build?'}`
    );
    refreshResults();
    setStatus('Profile updated · no AI download needed');
    return;
  }
  if (interpreted.kind === 'greeting') {
    addMessage(
      'assistant',
      'Hey! Tell me a topic you want to learn, or something you want to build. You can also tell me your year or completed course codes.'
    );
    return;
  }
  if (interpreted.kind === 'clarify') {
    offerTopics();
    setStatus('Choose an interest to find related courses');
    return;
  }
  const query = interpreted.topic;
  const request = ++generation;
  let mode = $('matchingMode').value;
  let queryVector = null,
    error = null,
    embeddingMs = 0;
  const modelCold = !workerReady && !vectorCache.has(query);
  setSearchBusy(true);
  try {
    if (mode === 'semantic' || mode === 'compare') {
      const start = performance.now();
      try {
        if (!vectors) throw new Error('Course embeddings unavailable');
        queryVector = await embedQuery(query);
      } catch {
        // Keep the search usable if the model can't load on this device.
        error = 'semantic_unavailable';
        if (mode === 'semantic') {
          mode = 'tfidf';
          $('matchingMode').value = 'tfidf';
        }
      }
      embeddingMs = performance.now() - start;
    }
    // Changing majors makes results from an earlier search out of date.
    if (request !== generation) return;
    lastRun = calculateRun(query, mode, queryVector, embeddingMs, modelCold, error);
    renderResults(lastRun);
    setStatus(
      error
        ? 'AI unavailable · showing clearly labeled keyword results'
        : mode === 'compare'
          ? 'Three-model comparison ready'
          : mode === 'semantic'
            ? 'AI matching ready · processed on this device'
            : `${MODEL_NAMES[mode]} keyword matching ready`
    );
  } catch {
    if (request === generation) {
      addMessage(
        'assistant',
        'This search could not finish. Your course profile is saved in this session. Try your search again.'
      );
      setStatus('Search not completed');
    }
  } finally {
    if (request === generation) setSearchBusy(false);
  }
}
const TOPICS_BY_PROGRAM = {
  'BS-CS': ['Artificial intelligence', 'Cybersecurity', 'Game design', 'Software engineering'],
  'BS-AE': ['Building energy', 'Structural design', 'Lighting', 'Sustainable buildings'],
  'BS-CE': ['Transportation', 'Water treatment', 'Structures', 'Soil mechanics'],
  'BS-ME': ['Robotics', 'Thermodynamics', 'Manufacturing', 'Fluid mechanics'],
  'BS-MEA': ['Aerodynamics', 'Propulsion', 'Flight dynamics', 'Control systems'],
  'BS-ISE': ['Supply chains', 'Optimization', 'Simulation', 'Human factors'],
  'BS-EE': ['Power systems', 'Electronics', 'Signals', 'Control systems'],
  'BS-CpE': ['Embedded systems', 'Digital design', 'Computer networks', 'Robotics'],
  'BS-BIOE-G': ['Medical devices', 'Biomaterials', 'Tissue engineering', 'Biomechanics'],
  'BS-BIOE-I': ['Biomedical design', 'Medical devices', 'Biomaterials', 'Healthcare'],
  'BS-BE-BP': ['Bioprocessing', 'Biofuels', 'Bioreactors', 'Food engineering'],
  'BS-BE-NR': ['Water resources', 'Soil conservation', 'Sustainability', 'Environmental systems'],
  'BS-CHE': ['Process design', 'Thermodynamics', 'Reaction engineering', 'Polymers']
};

function chooseMajor() {
  if (!$('program').value) {
    $('program').focus();
    return;
  }
  generation++;
  lastRun = null;
  resultBubble = null;
  $('exportComparison').disabled = true;
  const program = catalog.programs.find((program) => program.id === $('program').value);
  $('majorGate').hidden = true;
  $('appShell').hidden = false;
  $('mainApp').hidden = false;
  $('unsupported').hidden = true;
  document.querySelector('.trust-strip').hidden = true;
  $('chosenMajor').textContent = program.name;
  const courses = catalog.courses.filter((course) => course.programs.includes(program.id));
  $('messages').replaceChildren();
  addMessage(
    'assistant',
    `Hey! What would you like to learn or build? I’ll look through ${program.name} courses and show what you may need to take first. You can also say “I’m a freshman” or “I’ve completed COMP 163.”`
  );
  $('topicChips').replaceChildren();
  for (const topic of TOPICS_BY_PROGRAM[program.id]) {
    const button = createElement('button', topic, 'chip');
    button.type = 'button';
    button.onclick = () => {
      if (busy) return;
      $('interest').value = topic;
      $('question').value = '';
      ask();
    };
    $('topicChips').append(button);
  }
  $('courseOptions').replaceChildren();
  const knownCodes = new Set(courses.map((course) => course.code));
  for (const course of courses)
    for (const match of course.requirementText.matchAll(/\b[A-Z]{2,5}\s+\d{3}\b/g))
      knownCodes.add(normalizeCode(match[0]));
  for (const code of [...knownCodes].sort()) {
    const option = createElement('option');
    option.value = code;
    $('courseOptions').append(option);
  }
  $('quickCourses').replaceChildren();
  for (const course of courses
    .filter((course) => Number(course.code.match(/\d{3}/)?.[0]) < 220)
    .slice(0, 4)) {
    const button = createElement('button', `+ ${course.code}`, 'chip');
    button.type = 'button';
    button.onclick = () => {
      const codes = readProfile().completed;
      if (!codes.includes(normalizeCode(course.code))) codes.push(course.code);
      $('completed').value = codes.join(', ');
      renderPlan();
      refreshResults();
    };
    $('quickCourses').append(button);
  }
  renderPlan();
  $('question').focus();
  setStatus('Ready · describe an interest or update your profile');
}
$('continueButton').addEventListener('click', chooseMajor);
$('changeMajorTop').addEventListener('click', () => {
  generation++;
  if (pending) {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Search cancelled'));
    pending = null;
    stopWorker();
  }
  setSearchBusy(false);
  $('appShell').hidden = true;
  $('majorGate').hidden = false;
  document.querySelector('.trust-strip').hidden = false;
  $('program').focus();
});
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  ask();
});
$('matchingMode').addEventListener('change', () => {
  const mode = $('matchingMode').value;
  setStatus(
    mode === 'semantic' || mode === 'compare'
      ? 'AI will load when needed · about 23 MB'
      : 'Keyword matching selected · no AI download needed'
  );
  if (lastRun && !busy) {
    $('question').value = lastRun.query;
    ask();
  }
});
for (const id of ['completed', 'concurrent', 'standing', 'permission', 'stats', 'readyOnly'])
  $(id).addEventListener('change', () => {
    if (catalog) {
      renderPlan();
      refreshResults();
    }
  });
$('exportComparison').addEventListener('click', () => {
  if (!lastRun || lastRun.mode !== 'compare') return;
  const run = lastRun;
  // Save the settings with the results so the comparison has enough context later.
  const payload = {
    schemaVersion: 1,
    query: run.query,
    profile: run.profile,
    createdAt: run.createdAt,
    catalogCollected: catalog.collected,
    conditions: {
      topK: 3,
      minimumScoreFilter: false,
      sameCandidatePool: true,
      lexicalCorpus: 'Full catalog; title, description, tags',
      semanticModel: catalog.model,
      bm25: { k1: 1.2, b: 0.75 },
      tfidf: { tf: '1 + ln(count)', idf: 'ln((N+1)/(df+1)) + 1', normalization: 'L2' }
    },
    timing: {
      inputEmbeddingMs: run.embeddingMs,
      includesFirstModelLoad: run.modelCold,
      rankingExcludesInputEmbedding: true
    },
    environment: {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency
    },
    evaluation: 'Unlabeled live retrieval run. No accuracy, relevance, or user-study claims.',
    results: run.runs.map((model) => ({
      model: model.method,
      available: !model.unavailable,
      rankingMs: model.rankingMs,
      courses: model.rows.map((r, i) => ({
        rank: i + 1,
        code: r.course.code,
        title: r.course.title,
        score: r.score,
        status: r.checks.status,
        missing: r.checks.missing,
        notes: r.checks.notes,
        matchedTerms: r.matchedTerms,
        source: r.course.source
      }))
    }))
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  );
  const downloadLink = createElement('a');
  downloadLink.href = url;
  downloadLink.download = 'aggie-model-comparison.json';
  downloadLink.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  // Course text is required. Keyword search can still work without embeddings.
  const [courseResponse, vectorResponse] = await Promise.all([
    fetch('./catalog.json'),
    fetch('./embeddings.json').catch(() => null)
  ]);
  if (!courseResponse.ok) throw new Error('Course data could not load.');
  catalog = await courseResponse.json();
  vectors = vectorResponse?.ok ? await vectorResponse.json().catch(() => null) : null;
  lexicalIndex = buildLexicalIndex(catalog.courses);
  for (const p of catalog.programs) {
    const o = createElement('option', p.name);
    o.value = p.id;
    $('program').append(o);
  }
  $('continueButton').disabled = false;
  $('catalogCount').hidden = true;
  setStatus(
    vectors
      ? 'AI will load on your first request · about 23 MB'
      : 'Course text loaded · keyword matching available'
  );
} catch {
  setStatus('Course data could not load. Refresh the page to retry.');
  $('catalogCount').textContent = 'Course data unavailable — refresh to retry';
}
