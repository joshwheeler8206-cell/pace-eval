'use strict';

/* ================================================================
   U.S. AutoForce PACE Driving Evaluation
   Plan Ahead / Analyze Surroundings / Communicate / Execute
   Built-in stopwatches for Eye Lead, Mirror Intervals & Following Distance.
   ================================================================ */

/* ============================== Form definition ============================== */

const SECTIONS = [
  {
    id: 'plan',
    num: '1',
    title: 'PLAN AHEAD',
    items: [
      'Examines Vehicle',
      'Plans Trip',
      'Driver Position / Safety Restraint',
    ],
    timed: [],
  },
  {
    id: 'analyze',
    num: '2',
    title: 'ANALYZE SURROUNDINGS',
    items: [
      'Identifies distant relevant objects',
      'Checks blind spots prior to lane change',
      'Clears intersection (L-R-L-R)',
      'Compensates for potential hazards',
      'Adjusts speed to meet environment',
      'Checks Mirror Regularly (Balanced)',
    ],
    timed: [
      { id: 'eye', label: 'Eye Lead Time' },
      { id: 'mirror', label: 'Mirror Check Intervals' },
    ],
  },
  {
    id: 'comm',
    num: '3',
    title: 'COMMUNICATES',
    items: [
      'Proper use of lights',
      'Properly uses turn signals, flashers, brake lights',
      'Covers horn / sounds when needed',
      'Stays out of others blind spots',
      'Seeks eye contact with other drivers',
    ],
    timed: [],
  },
  {
    id: 'exec',
    num: '4',
    title: 'EXECUTE',
    items: [
      'Maintains proper space around vehicle',
      'Choose lane of least resistance',
      'Keeps vehicle rolling by adjusting to traffic',
      'Drives within visibility limitations',
      'Stopping and proceeding at intersections',
      'Positions vehicle to eliminate risk (turning/backing)',
    ],
    timed: [
      { id: 'following', label: 'Following Distance' },
    ],
  },
];

const RATINGS = [1, 2, 3];
const RATING_LABEL = { 1: 'Not Practiced', 2: 'Somewhat Practiced', 3: 'Always Practiced' };
const STORE_KEY = 'usaf_pace_evals_v1';

/* ============================== State ============================== */

let records = [];
let current = null;
let activeView = 'evaluate';
let timers = {}; // active stopwatch interval ids: { eye: id, mirror: id, following: id }
let timerStart = {}; // start epoch ms per timed id

/* ============================== Storage ============================== */

const DB_NAME = 'usaf_pace_eval_db';
const canIdb = typeof indexedDB !== 'undefined';
let dbReady = idbOpen();
let _writeQueue = Promise.resolve();

function idbOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function idbGet(key) {
  try {
    const db = await dbReady;
    return await new Promise((resolve) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await dbReady;
    return await new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) { return false; }
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function persist() {
  const snapshot = JSON.parse(JSON.stringify(records));
  if (canIdb) {
    _writeQueue = _writeQueue.then(() => idbSet(STORE_KEY, snapshot)).catch(() => {});
    return _writeQueue;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    toast('Storage is full. Try exporting and deleting old records.');
  }
  return Promise.resolve();
}

async function initStorage() {
  records = canIdb ? (await idbGet(STORE_KEY)) || [] : loadRecords();
  if (canIdb && !records.length) {
    const legacy = loadRecords();
    if (legacy.length) { records = legacy; await persist(); }
  }
}

/* ============================== Helpers ============================== */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style') node.style.cssText = v;
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return node;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function formValue(id) {
  const node = document.getElementById(id);
  return node ? node.value : '';
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============================== Data model ============================== */

function newEval() {
  const sections = {};
  for (const s of SECTIONS) {
    const ratings = {};
    for (const it of s.items) ratings[it] = null;
    const timed = {};
    for (const t of s.timed) timed[t.id] = { sec: null, rating: null };
    sections[s.id] = { ratings, timed, notes: '' };
  }
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    driver: '',
    exp: '',
    lic: '',
    evaluator: '',
    date: todayISO(),
    sections,
    overallNotes: '',
    training: '', // 'completed' | 'continued' | ''
    trainingCompleteDate: '',
    clicker: 0,
    nextPaceDate: '',
    reviewDate: todayISO(),
    evaluatorSig: null,
    employeeSig: null,
  };
}

function countLow(ev) {
  let n = 0;
  for (const s of SECTIONS) {
    for (const it of s.items) if (ev.sections[s.id].ratings[it] === 1) n++;
    for (const t of s.timed) if (ev.sections[s.id].timed[t.id].rating === 1) n++;
  }
  return n;
}

function countRated(ev) {
  let n = 0;
  for (const s of SECTIONS) {
    for (const it of s.items) if (ev.sections[s.id].ratings[it]) n++;
    for (const t of s.timed) if (ev.sections[s.id].timed[t.id].rating) n++;
  }
  return n;
}

function totalItems() {
  let n = 0;
  for (const s of SECTIONS) n += s.items.length + s.timed.length;
  return n;
}

/* ============================== Signature pad ============================== */

function makeSigPad(label) {
  const wrap = el('div', { class: 'sigpad-wrap' });
  const canvas = el('canvas', { class: 'sigpad', width: 600, height: 200 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827';

  let drawing = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * (canvas.width / r.width), y: (src.clientY - r.top) * (canvas.height / r.height) };
  };
  const down = (e) => { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const up = () => (drawing = false);

  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', up);
  canvas.addEventListener('mouseleave', up);
  canvas.addEventListener('touchstart', down, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', up);

  const bar = el('div', { class: 'sigpad-bar' });
  const clearBtn = el('button', { class: 'btn ghost small', onclick: () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); } }, ['Clear']);
  bar.appendChild(el('span', { class: 'sigpad-label' }, [label]));
  bar.appendChild(clearBtn);
  wrap.appendChild(bar);
  wrap.appendChild(canvas);
  return { wrap, canvas, get: () => (ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0) ? canvas.toDataURL() : null) };
}

/* ============================== Stopwatches ============================== */

function stopTimer(id) {
  if (timers[id]) {
    clearInterval(timers[id]);
    delete timers[id];
  }
}

function stopAllTimers() {
  for (const id of Object.keys(timers)) stopTimer(id);
}

function fmtSec(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

function toggleTimer(id, btn) {
  if (timers[id]) {
    stopTimer(id);
    const sec = current.sections[secSection(id)].timed[id];
    sec.sec = round1((Date.now() - timerStart[id]) / 1000);
    const input = document.getElementById('timed-sec-' + id);
    if (input) input.value = sec.sec;
    btn.classList.remove('running');
    btn.textContent = 'Start';
    const read = document.querySelector('.timed-read[data-read="' + id + '"]');
    if (read) read.classList.remove('running');
  } else {
    stopAllTimers();
    timerStart[id] = Date.now();
    timers[id] = setInterval(() => {
      const read = document.querySelector('.timed-read[data-read="' + id + '"]');
      if (read) read.textContent = fmtSec(Date.now() - timerStart[id]);
    }, 100);
    btn.classList.add('running');
    btn.textContent = 'Stop';
    const read = document.querySelector('.timed-read[data-read="' + id + '"]');
    if (read) { read.textContent = '0.0s'; read.classList.add('running'); }
  }
}

function secSection(id) {
  for (const s of SECTIONS) for (const t of s.timed) if (t.id === id) return s.id;
  return null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/* ============================== Render: Evaluate ============================== */

function renderEvaluate() {
  if (!current) current = newEval();
  stopAllTimers();
  const view = document.getElementById('view');
  view.innerHTML = '';
  const form = el('form', { id: 'eval-form' });

  form.appendChild(el('section', { class: 'card info-card' }, [
    el('h2', { class: 'card-title' }, ['Driver Information']),
    field('Driver', 'driver', 'text', current.driver),
    field('Exp. (Years)', 'exp', 'text', current.exp),
    field('Lic. #', 'lic', 'text', current.lic),
    field('Evaluator', 'evaluator', 'text', current.evaluator),
    field('Date', 'date', 'date', current.date, { required: true }),
  ]));

  form.appendChild(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title' }, ['Rating Scale']),
    el('div', { class: 'legend' }, [
      el('span', { class: 'l1' }, ['1 – Not Practiced']),
      el('span', { class: 'l2' }, ['2 – Somewhat Practiced']),
      el('span', { class: 'l3' }, ['3 – Always Practiced']),
    ]),
  ]));

  const clickerCount = el('div', { class: 'clicker-count' }, [String(current.clicker || 0)]);
  const clickerBtn = el('button', { type: 'button', class: 'clicker-btn', onclick: () => {
    current.clicker = (current.clicker || 0) + 1;
    clickerCount.textContent = String(current.clicker);
  } }, ['Tap to Narrate']);
  const clickerReset = el('button', { type: 'button', class: 'btn ghost small', onclick: () => {
    current.clicker = 0;
    clickerCount.textContent = '0';
  } }, ['Reset']);
  form.appendChild(el('section', { class: 'card clicker-card' }, [
    el('h2', { class: 'card-title' }, ['Verbal Narration Clicker']),
    el('p', { class: 'timed-note' }, ['Driver verbally narrates full visual field, scanning behavior, and hazard awareness out loud in real time. Tap once for each narration; evaluator can hold the device like a clicker.']),
    clickerCount,
    el('div', { class: 'clicker-row' }, [clickerBtn, clickerReset]),
  ]));

  const progress = el('div', { class: 'progress' });
  view.appendChild(progress);

  for (const sec of SECTIONS) {
    const state = current.sections[sec.id];
    const blocks = [];

    for (const item of sec.items) {
      const val = state.ratings[item];
      blocks.push(el('div', { class: 'item' }, [
        el('span', { class: 'item-label' }, [item]),
        el('div', { class: 'rating' }, RATINGS.map((r) =>
          el('button', {
            type: 'button',
            class: 'rate r' + r + (val === r ? ' on' : ''),
            'data-sec': sec.id,
            'data-item': item,
            'data-rating': r,
            onclick: (e) => setRating(sec.id, item, r, e.currentTarget),
          }, [String(r)])
        )),
      ]));
    }

    for (const t of sec.timed) {
      blocks.push(makeTimedBlock(sec.id, t, state.timed[t.id]));
    }

    blocks.push(el('textarea', {
      class: 'notes',
      rows: 2,
      placeholder: 'Comments / notes for this section…',
      'data-sec': sec.id,
      oninput: (e) => { state.notes = e.target.value; },
    }, [state.notes]));

    if (sec.id === 'exec') {
      blocks.push(field('PACE Behavioral Driving Evaluation Training Complete Date', 'trainingCompleteDate', 'date', current.trainingCompleteDate));
    }

    form.appendChild(el('section', { class: 'card' }, [
      el('h2', { class: 'card-title' }, [sec.num + '. ' + sec.title]),
      ...blocks,
    ]));
  }

  form.appendChild(el('section', { class: 'card decision-card' }, [
    el('h2', { class: 'card-title' }, ['Quarterly Driving Evaluation']),
    el('span', { class: 'field-label' }, ['Result']),
    el('div', { class: 'toggle-row' }, [
      el('button', { type: 'button', class: 'toggle' + (current.training === 'completed' ? ' on' : ''), 'data-train': 'completed', onclick: (e) => setTraining('completed', e.currentTarget) }, ['Training Completed']),
      el('button', { type: 'button', class: 'toggle' + (current.training === 'continued' ? ' on' : ''), 'data-train': 'continued', onclick: (e) => setTraining('continued', e.currentTarget) }, ['Continued Training']),
    ]),
    field('Next PACE Drive Date', 'nextPaceDate', 'date', current.nextPaceDate),
    field('Review Date', 'reviewDate', 'date', current.reviewDate),
  ]));

  form.appendChild(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title' }, ['Overall Performance Notes / Coaching Points']),
    el('textarea', {
      class: 'notes overall',
      rows: 5,
      placeholder: 'Write coaching observations, strengths, or improvement plans here…',
      oninput: (e) => { current.overallNotes = e.target.value; },
    }, [current.overallNotes]),
  ]));

  const sigEvaluator = makeSigPad('Evaluator Signature');
  const sigEmployee = makeSigPad('Employee Signature');
  current._sigEvaluator = sigEvaluator;
  current._sigEmployee = sigEmployee;

  form.appendChild(el('section', { class: 'card' }, [
    el('h2', { class: 'card-title' }, ['Signatures']),
    sigEvaluator.wrap,
    sigEmployee.wrap,
  ]));

  form.appendChild(el('div', { class: 'actions' }, [
    el('button', { type: 'button', class: 'btn primary big', onclick: () => saveEval() }, ['Save Evaluation']),
    el('button', { type: 'button', class: 'btn ghost big', onclick: () => resetEval() }, ['Reset']),
  ]));

  view.appendChild(form);
  updateProgress();
}

function field(labelText, id, type, value, extra = {}) {
  const input = el('input', { type, id, value, ...extra });
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, [labelText]), input]);
}

function makeTimedBlock(secId, t, state) {
  const display = el('div', { class: 'timed-read', 'data-read': t.id }, [state.sec != null ? state.sec + 's' : '0.0s']);
  const btn = el('button', { type: 'button', class: 'timer-btn', onclick: (e) => toggleTimer(t.id, e.currentTarget) }, ['Start']);

  const input = el('input', {
    id: 'timed-sec-' + t.id,
    type: 'number',
    min: '0',
    step: '0.1',
    inputmode: 'decimal',
    placeholder: 'e.g. 4',
    value: state.sec != null ? state.sec : '',
    oninput: (e) => { state.sec = e.target.value === '' ? null : round1(Number(e.target.value)); },
  });

  return el('div', { class: 'item timed' }, [
    el('div', { class: 'timed-main' }, [
      el('span', { class: 'item-label' }, [t.label + ' (seconds)']),
      display,
    ]),
    btn,
    el('div', { class: 'timed-foot' }, [
      el('div', { class: 'timed-sec' }, [
        el('span', { class: 'field-label' }, ['Seconds']),
        input,
      ]),
      el('div', { class: 'rating' }, RATINGS.map((r) =>
        el('button', {
          type: 'button',
          class: 'rate r' + r + (state.rating === r ? ' on' : ''),
          'data-timed': t.id,
          'data-rating': r,
          onclick: (e) => setTimedRating(t.id, r, e.currentTarget),
        }, [String(r)])
      )),
    ]),
    el('p', { class: 'timed-note' }, [timerHint(t.id)]),
  ]);
}

function timerHint(id) {
  if (id === 'eye') return 'Start when the driver first looks ahead; stop when they look away/re-engage. Longer is better.';
  if (id === 'mirror') return 'Time between mirror checks. Start on one check, stop on the next. Target every 5–8 seconds.';
  return 'Pick a fixed object ahead. When the vehicle ahead passes it, start; stop when you pass it. 4+ seconds is a safe following distance.';
}

function setRating(secId, item, rating, btn) {
  current.sections[secId].ratings[item] = rating;
  const container = btn.parentNode;
  for (const b of container.querySelectorAll('.rate')) b.classList.toggle('on', b.dataset.rating === String(rating));
  updateProgress();
}

function setTimedRating(id, rating, btn) {
  const secId = secSection(id);
  if (!secId) return;
  current.sections[secId].timed[id].rating = rating;
  const container = btn.parentNode;
  for (const b of container.querySelectorAll('.rate')) b.classList.toggle('on', b.dataset.rating === String(rating));
  updateProgress();
}

function setTraining(val, btn) {
  current.training = current.training === val ? '' : val;
  const row = btn.parentNode;
  for (const b of row.querySelectorAll('.toggle')) b.classList.toggle('on', b.dataset.train === current.training);
}

function updateProgress() {
  if (!current) return;
  const done = countRated(current);
  const total = totalItems();
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = document.querySelector('.progress');
  if (bar) bar.innerHTML = '<div class="progress-fill" style="width:' + pct + '%"></div><span>' + pct + '% rated</span>';
}

/* ============================== Save / Load / Delete ============================== */

function saveEval() {
  current.driver = formValue('driver');
  current.exp = formValue('exp');
  current.lic = formValue('lic');
  current.evaluator = formValue('evaluator');
  current.date = formValue('date');
  current.nextPaceDate = formValue('nextPaceDate');
  current.reviewDate = formValue('reviewDate');
  current.trainingCompleteDate = formValue('trainingCompleteDate');

  if (!current.date) { toast('Date is required.'); return; }
  if (!current.evaluator.trim()) { toast('Evaluator name is required.'); return; }

  stopAllTimers();
  current.evaluatorSig = current._sigEvaluator ? current._sigEvaluator.get() : null;
  current.employeeSig = current._sigEmployee ? current._sigEmployee.get() : null;
  delete current._sigEvaluator;
  delete current._sigEmployee;

  const lowCount = countLow(current);

  const idx = records.findIndex((r) => r.id === current.id);
  if (idx >= 0) records[idx] = JSON.parse(JSON.stringify(current));
  else records.push(JSON.parse(JSON.stringify(current)));

  persist();
  toast('Saved' + (lowCount ? ' – ' + lowCount + ' item(s) rated Not Practiced' : '') + '.');
  current = null;
  renderEvaluate();
}

function resetEval() {
  if (!confirm('Clear this form and start a new evaluation?')) return;
  current = null;
  renderEvaluate();
}

function loadEval(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  current = JSON.parse(JSON.stringify(r));
  switchView('evaluate');
  renderEvaluate();
  toast('Loaded evaluation. Edit and Save to update.');
}

function deleteEval(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  if (!confirm('Delete this PACE evaluation?')) return;
  records = records.filter((x) => x.id !== id);
  persist();
  renderRecords();
  toast('Deleted.');
}

/* ============================== Render: Records ============================== */

function renderRecords() {
  stopAllTimers();
  const view = document.getElementById('view');
  view.innerHTML = '';

  const sorted = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const head = el('div', { class: 'page-head' }, [
    el('h2', { class: 'page-title' }, ['PACE Evaluations (' + sorted.length + ')']),
    el('button', { class: 'btn ghost', onclick: exportAll }, ['Export All (JSON)']),
  ]);
  view.appendChild(head);

  if (!sorted.length) {
    view.appendChild(el('div', { class: 'empty' }, ['No PACE evaluations saved yet. Complete one from the Evaluate tab.']));
    return;
  }

  const list = el('div', { class: 'rec-list' });
  for (const r of sorted) {
    const low = countLow(r);
    list.appendChild(el('div', { class: 'card rec' }, [
      el('div', { class: 'rec-main' }, [
        el('div', { class: 'rec-name' }, [r.driver || r.evaluator || '(no driver)']),
        el('div', { class: 'rec-meta' }, [
          (r.exp ? 'Exp ' + r.exp + ' yr' + (r.exp === '1' ? '' : 's') + '  •  ' : '') +
          'Lic ' + (r.lic || '–') + '  •  ' + (r.date || 'no date') + (r.nextPaceDate ? '  •  Next PACE ' + r.nextPaceDate : ''),
        ]),
        el('span', { class: 'badge ' + (low ? 'bad-ni' : 'bad-ok') }, [low ? low + ' Not Practiced' : 'OK']),
      ]),
      el('div', { class: 'rec-actions' }, [
        el('button', { class: 'btn ghost small', onclick: () => loadEval(r.id) }, ['Open']),
        el('button', { class: 'btn ghost small primary-outline', onclick: () => openReport(r.id) }, ['View / Print']),
        el('button', { class: 'btn ghost small', onclick: () => exportOne(r) }, ['Export']),
        el('button', { class: 'btn ghost small danger', onclick: () => deleteEval(r.id) }, ['Delete']),
      ]),
    ]));
  }
  view.appendChild(list);
}

function exportOne(r) {
  download('pace-eval-' + ((r.driver || r.evaluator).replace(/\s+/g, '_') || 'driver') + '-' + (r.date || 'nodate') + '.json', JSON.stringify(r, null, 2));
}

function exportAll() {
  if (!records.length) { toast('Nothing to export yet.'); return; }
  download('pace-evaluations-' + todayISO() + '.json', JSON.stringify(records, null, 2));
}

/* ============================== Render: Report ============================== */

function openReport(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  stopAllTimers();
  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(el('div', { class: 'backbar' }, [
    el('button', { class: 'btn ghost small', onclick: () => renderRecords() }, ['← Back']),
    el('button', { class: 'btn primary small', onclick: () => window.print() }, ['Print / PDF']),
  ]));

  const report = el('div', { class: 'report' }, []);
  report.appendChild(el('h2', {}, ['PACE Driving Evaluation']));
  report.appendChild(el('p', { class: 'rsub' }, ['Quarterly ride-along assessment • ' + (r.date || 'no date')]));

  const meta = el('table', { class: 'rtbl' }, []);
  const metaRow = el('tr', {}, []);
  metaRow.appendChild(el('td', {}, ['<strong>Driver:</strong> ' + esc(r.driver || '–')]));
  metaRow.appendChild(el('td', {}, ['<strong>Exp:</strong> ' + esc(r.exp || '–')]));
  meta.appendChild(metaRow);
  const metaRow2 = el('tr', {}, []);
  metaRow2.appendChild(el('td', {}, ['<strong>Lic. #:</strong> ' + esc(r.lic || '–')]));
  metaRow2.appendChild(el('td', {}, ['<strong>Evaluator:</strong> ' + esc(r.evaluator || '–')]));
  meta.appendChild(metaRow2);
  if (r.training) {
    const metaRow3 = el('tr', {}, []);
    metaRow3.appendChild(el('td', {}, ['<strong>Result:</strong> ' + (r.training === 'completed' ? 'Training Completed' : 'Continued Training')]));
    metaRow3.appendChild(el('td', {}, []));
    meta.appendChild(metaRow3);
  }
  report.appendChild(meta);

  for (const sec of SECTIONS) {
    const state = r.sections[sec.id];
    const rows = [];
    for (const item of sec.items) {
      const val = state.ratings[item];
      rows.push(el('tr', {}, [
        el('td', {}, [item]),
        el('td', { style: 'width:34%' }, [val ? '★ ' + RATING_LABEL[val] : '—']),
      ]));
    }
    for (const t of sec.timed) {
      const st = state.timed[t.id];
      rows.push(el('tr', {}, [
        el('td', {}, [t.label + ' (seconds)']),
        el('td', { style: 'width:34%' }, [st.sec != null ? st.sec + 's' : '—']),
      ]));
      rows.push(el('tr', {}, [
        el('td', { style: 'padding-left:18px;color:var(--muted)' }, ['  Rating']),
        el('td', {}, [st.rating ? '★ ' + RATING_LABEL[st.rating] : '—']),
      ]));
    }
    if (state.notes) rows.push(el('tr', {}, [el('td', { colspan: 2 }, ['<em>' + esc(state.notes) + '</em>'])]));;
    report.appendChild(el('div', { class: 'rsec' }, [
      el('h3', {}, [sec.num + '. ' + sec.title]),
      el('table', { class: 'rtbl' }, rows),
    ]));
  }

  if (r.overallNotes) {
    report.appendChild(el('div', { class: 'rsec' }, [
      el('h3', {}, ['Overall Notes / Coaching Points']),
      el('p', {}, [esc(r.overallNotes)]),
    ]));
  }

  report.appendChild(el('div', { class: 'rfoot' }, [
    el('div', { class: 'sigbox' + (r.evaluatorSig ? '' : ' ns') }, [
      r.evaluatorSig ? el('img', { src: r.evaluatorSig, alt: 'evaluator signature' }) : null,
      'Evaluator Signature',
    ]),
    el('div', { class: 'sigbox' + (r.employeeSig ? '' : ' ns') }, [
      r.employeeSig ? el('img', { src: r.employeeSig, alt: 'employee signature' }) : null,
      'Employee Signature',
    ]),
  ]));

  if (r.clicker) {
    report.appendChild(el('div', { class: 'rsec' }, [
      el('h3', {}, ['Verbal Narration Clicker']),
      el('p', {}, [String(r.clicker) + ' narration(s) recorded during the drive']),
    ]));
  }

  report.appendChild(el('div', { class: 'foot' }, [
    el('span', {}, ['Next PACE Drive: ' + (r.nextPaceDate || '—')]),
    el('span', {}, ['Review Date: ' + (r.reviewDate || '—')]),
  ]));
  if (r.trainingCompleteDate) {
    report.appendChild(el('p', { class: 'rsub', style: 'margin-top:10px' }, ['PACE Behavioral Driving Evaluation Training Complete Date: ' + r.trainingCompleteDate]));
  }

  view.appendChild(report);
}

/* ============================== Tabs / Init ============================== */

function switchView(view) {
  activeView = view;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.view === view);
  if (view === 'evaluate') renderEvaluate();
  else if (view === 'records') renderRecords();
}

function init() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  initStorage().then(() => renderEvaluate());
}

if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => stopAllTimers());
}
