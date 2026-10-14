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
    scheduleAutoBackup();
    return _writeQueue;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
  } catch (e) {
    toast('Storage is full. Try exporting and deleting old records.');
  }
  scheduleAutoBackup();
  return Promise.resolve();
}

async function initStorage() {
  records = canIdb ? (await idbGet(STORE_KEY)) || [] : loadRecords();
  if (canIdb && !records.length) {
    const legacy = loadRecords();
    if (legacy.length) { records = legacy; await persist(); }
  }
  // Load the shared roster. Without this `roster` stays [] and any rosterUpsert
  // would overwrite the whole shared roster with a partial record.
  roster = await rosterGet();
}

/* ============================== Driver Roster (shared) ============================== */
// usaf_roster_db / usaf_roster_v1 — the SAME IndexedDB all six AutoForce apps read,
// so a driver profile added in the Driver Hub autofills here too.
const ROSTER_DB = 'usaf_roster_db';
const ROSTER_KEY = 'usaf_roster_v1';
let roster = [];

function rosterOpen() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(ROSTER_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function rosterGet() {
  try {
    const db = await rosterOpen();
    return await new Promise((resolve) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(ROSTER_KEY);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (e) { return []; }
}

function rosterPut(list) {
  const snapshot = JSON.parse(JSON.stringify(list));
  if (canIdb) {
    return rosterOpen().then((db) => new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(snapshot, ROSTER_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    })).catch(() => {});
  }
  try { localStorage.setItem(ROSTER_DB + ':' + ROSTER_KEY, JSON.stringify(snapshot)); } catch (e) {}
  return Promise.resolve();
}

function rosterFind(name) {
  const n = String(name || '').trim().toLowerCase();
  return roster.find((r) => String(r.name || '').trim().toLowerCase() === n) || null;
}

function rosterUpsert(entry) {
  const name = String((entry && entry.name) || '').trim();
  if (!name) return;
  const existing = rosterFind(name);
  if (existing) {
    for (const k of ['license', 'warehouse', 'phone', 'hireDate', 'trainer', 'licenseExp', 'medCardExp']) {
      const v = String((entry && entry[k]) || '').trim();
      if (v) existing[k] = v;
    }
  } else {
    roster.push({
      name,
      license: String((entry && entry.license) || '').trim(),
      warehouse: String((entry && entry.warehouse) || '').trim(),
      phone: String((entry && entry.phone) || '').trim(),
      hireDate: String((entry && entry.hireDate) || '').trim(),
      trainer: String((entry && entry.trainer) || '').trim(),
      licenseExp: String((entry && entry.licenseExp) || '').trim(),
      medCardExp: String((entry && entry.medCardExp) || '').trim(),
    });
  }
  rosterPut(roster);
}

// Every driver name the app knows about: the shared roster plus any driver that
// only lives in the Cert Tracker — so the name pickers never come up empty just
// because a driver was first added on a different screen.
function knownDriverNames() {
  const seen = {};
  const add = (n) => { const s = String(n || '').trim(); if (s) seen[s.toLowerCase()] = s; };
  for (const r of roster) add(r.name);
  if (typeof drivers !== 'undefined' && drivers) for (const d of drivers) add(d.name);
  return Object.keys(seen).sort((a, b) => a.localeCompare(b)).map((k) => seen[k]);
}

function ensureRosterDatalist() {
  let dl = document.getElementById('roster-names');
  if (!dl) {
    dl = el('datalist', { id: 'roster-names' });
    document.body.appendChild(dl);
  }
  dl.innerHTML = '';
  for (const n of knownDriverNames()) dl.appendChild(el('option', { value: n }));
  return dl;
}

/* ---------- Reliable Month / Day / Year date entry ----------
   A native <input type="date"> calendar cannot always reach another year: on
   several phones and tablets (and inside installed web apps) tapping the year
   header simply does nothing, so a future licence expiry becomes impossible to
   enter. These three plain dropdowns always work on every device, and still
   store the same 'YYYY-MM-DD' string the app already uses. */
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function splitISO(iso) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(iso == null ? '' : iso).trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: 0, m: 0, d: 0 };
}

function joinISO(y, m, d) {
  if (!y || !m || !d) return '';
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// Month / Day / Year dropdowns. onChange(iso) fires on every pick; iso is ''
// until all three are chosen. A pre-filled date keeps its day and month, so
// just changing the year re-dates the whole field in one tap.
function dateSelects(value, onChange) {
  const cur = splitISO(value);
  const thisYear = new Date().getFullYear();
  const mSel = el('select', { class: 'dt-m', 'aria-label': 'Month' });
  const dSel = el('select', { class: 'dt-d', 'aria-label': 'Day' });
  const ySel = el('select', { class: 'dt-y', 'aria-label': 'Year' });
  const emit = () => {
    let y = Number(ySel.value) || 0;
    let m = Number(mSel.value) || 0;
    let d = Number(dSel.value) || 0;
    if (y && m && d) { const last = new Date(y, m, 0).getDate(); if (d > last) d = last; onChange(joinISO(y, m, d)); return; }
    onChange(joinISO(y, m, d));
  };
  mSel.appendChild(el('option', { value: '' }, ['Month']));
  MONTH_LABELS.forEach((label, i) => mSel.appendChild(el('option', { value: i + 1, selected: cur.m === i + 1 }, [label])));
  dSel.appendChild(el('option', { value: '' }, ['Day']));
  for (let i = 1; i <= 31; i++) dSel.appendChild(el('option', { value: i, selected: cur.d === i }, [i]));
  ySel.appendChild(el('option', { value: '' }, ['Year']));
  for (let y = thisYear + 12; y >= thisYear - 40; y--) ySel.appendChild(el('option', { value: y, selected: cur.y === y }, [y]));
  [mSel, dSel, ySel].forEach((s) => s.addEventListener('change', emit));
  return el('div', { class: 'dt-row' }, [mSel, dSel, ySel]);
}

// Same trio, but the field's original id lives on a hidden input so existing
// readers (document.getElementById(id).value) keep working untouched.
function dateField(labelText, id, value) {
  const hidden = el('input', { type: 'hidden', id, value: value || '' });
  const row = dateSelects(value || '', (iso) => { hidden.value = iso; });
  return el('div', { class: 'field' }, [el('span', { class: 'field-label' }, [labelText]), row, hidden]);
}

// Write an ISO date into a field by id and, when that id sits on a Month/Day/Year
// trio, move the three dropdowns to match — so autofill from the roster shows up
// in the visible controls instead of only landing on the hidden carrier.
function syncDateField(id, iso) {
  const hidden = document.getElementById(id);
  if (!hidden) return;
  hidden.value = iso || '';
  const host = hidden.parentNode;
  if (!host || !host.children) return;
  // NB: children is an HTMLCollection in a real browser (no .find/.forEach) —
  // walk it by index so this works on every engine as well as in the test mock.
  let row = null;
  for (let i = 0; i < host.children.length; i++) {
    const c = host.children[i];
    const cn = String((c && c.className) || '');
    if ((' ' + cn + ' ').indexOf(' dt-row ') >= 0) { row = c; break; }
  }
  if (!row || row.children.length !== 3) return;
  const p = splitISO(iso);
  const vals = [p.m ? String(p.m) : '', p.d ? String(p.d) : '', p.y ? String(p.y) : ''];
  for (let i = 0; i < row.children.length; i++) {
    const sel = row.children[i];
    if (sel && sel.tagName === 'SELECT') sel.value = vals[i];
  }
}

// Read an ISO date back as MM/DD/YYYY for the read-only roster summary.
function fmtDate(iso) {
  const p = splitISO(iso);
  if (!p.y) return String(iso == null ? '' : iso).trim();
  return String(p.m).padStart(2, '0') + '/' + String(p.d).padStart(2, '0') + '/' + p.y;
}

// Everything the roster knows about a driver that a form might want to show.
// The mapped fields get filled into the form; whatever is left over is printed
// under the name (hire date, lic. #, licence / med-card expirations).
function rosterInfoBits(r) {
  if (!r) return [];
  const out = [];
  const add = (label, v) => {
    const s = String(v == null ? '' : v).trim();
    if (s) out.push(label + ' ' + s);
  };
  add('Hire date', fmtDate(r.hireDate));
  add('Lic.#', r.license);
  add('Lic. exp', fmtDate(r.licenseExp));
  add('Med card exp', fmtDate(r.medCardExp));
  add('Warehouse', r.warehouse);
  add('Trainer', r.trainer);
  return out;
}

// Name input with typeahead; when it matches a roster driver, fills the given
// field ids from the roster (only when the target field is still empty) and
// shows the rest of what the roster knows about them.
// The field also carries a plain <select> pull-down of every known driver name:
// a native <datalist> popup only opens once you start typing (and on some phones
// and in installed web apps it never opens at all), so the dropdown is the
// dependable way to pick someone who is already on the roster.
function rosterField(labelText, id, value, fields, extra = {}) {
  const input = el('input', { type: 'text', id, value, list: 'roster-names', autocomplete: 'off', ...extra });
  const info = el('div', { class: 'roster-info' });
  info.style.display = 'none'; // nothing shown until a roster driver is matched
  const paintInfo = (r) => {
    const bits = rosterInfoBits(r);
    info.innerHTML = '';
    if (bits.length) {
      info.appendChild(el('b', {}, ['From roster: ']));
      info.appendChild(el('span', {}, [bits.join('  •  ')]));
    }
    info.style.display = bits.length ? '' : 'none';
  };
  // force = the user just picked the driver, so the roster wins; typing only
  // fills fields that are still blank so nothing they typed gets stomped.
  const fill = (force) => {
    const r = rosterFind(input.value);
    paintInfo(r);
    if (!r) return;
    for (const [fid, prop] of Object.entries(fields)) {
      const n = document.getElementById(fid);
      if (!n || (n.value && !force)) continue;
      syncDateField(fid, r[prop] || '');
    }
  };
  input.addEventListener('input', () => fill(false));
  input.addEventListener('change', () => fill(false));
  if (value) paintInfo(rosterFind(value));
  const kids = [el('span', { class: 'field-label' }, [labelText]), input];
  const names = knownDriverNames();
  if (names.length) {
    const pick = el('select', { class: 'roster-pick', 'aria-label': 'Choose ' + labelText + ' from the driver roster' });
    pick.appendChild(el('option', { value: '' }, ['Choose from roster…']));
    for (const n of names) pick.appendChild(el('option', { value: n }, [n]));
    pick.addEventListener('change', (e) => {
      const n = e.target.value;
      if (!n) return;
      input.value = n;
      fill(true);
      // Let any field-level handler (persisting the name, autofill, ...) run.
      if (typeof Event === 'function' && input.dispatchEvent) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      pick.value = '';
    });
    kids.push(pick);
  }
  kids.push(info);
  return el('label', { class: 'field' }, kids);
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
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
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
  ensureRosterDatalist();
  const view = document.getElementById('view');
  view.innerHTML = '';
  const form = el('form', { id: 'eval-form' });

  form.appendChild(el('section', { class: 'card info-card' }, [
    el('h2', { class: 'card-title' }, ['Driver Information']),
    rosterField('Driver', 'driver', current.driver, { lic: 'license', exp: 'licenseExp' }),
    field('Lic. #', 'lic', 'text', current.lic),
    dateField('Exp.', 'exp', current.exp),
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
  const clickerCard = el('section', { class: 'card clicker-card' }, [
    el('h2', { class: 'card-title' }, ['Verbal Narration Clicker']),
    el('p', { class: 'timed-note' }, ['Driver verbally narrates full visual field, scanning behavior, and hazard awareness out loud in real time. Tap once for each narration; evaluator can hold the device like a clicker.']),
    clickerCount,
    el('div', { class: 'clicker-row' }, [clickerBtn, clickerReset]),
  ]);

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

  form.appendChild(clickerCard);

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
  rosterUpsert({ name: current.driver, license: current.lic });
  toast('Saved' + (lowCount ? ' – ' + lowCount + ' item(s) rated Not Practiced' : '') + '.');
  const afSaved = JSON.parse(JSON.stringify(current));
  current = null;
  renderEvaluate();
  afPaceAutoSave(afSaved);   // auto-save the completed report PDF
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
  view.appendChild(autoBackupToggleUI());
  view.appendChild(el('div', { style: 'height:12px' }));

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
          (r.exp ? 'Lic exp ' + r.exp + '  •  ' : '') +
          'Lic ' + (r.lic || '–') + '  •  ' + (r.date || 'no date') + (r.nextPaceDate ? '  •  Next PACE ' + r.nextPaceDate : ''),
        ]),
        el('span', { class: 'badge ' + (low ? 'bad-ni' : 'bad-ok') }, [low ? low + ' Not Practiced' : 'OK']),
      ]),
      el('div', { class: 'rec-actions' }, [
        el('button', { class: 'btn ghost small', onclick: () => loadEval(r.id) }, ['Open']),
        el('button', { class: 'btn ghost small primary-outline', onclick: () => openReport(r.id) }, ['View / Print']),
        el('button', { class: 'btn ghost small', onclick: () => afPaceReport(r) }, ['📄 PDF']),
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

/* ---------- Auto-backup ----------
   Keeps an off-device, recoverable copy: a timestamped JSON file drops into
   Downloads a few seconds after you stop entering data. Debounced 15s,
   throttled to one per 5 min, capped per session. Toggle on the Records tab. */
const AUTOBACKUP_KEY = 'autobk_pace';
let _abEnabled = (localStorage.getItem(AUTOBACKUP_KEY) !== 'off');
let _abTimer = null, _abLast = 0, _abCount = 0, _abPending = false;
const AB_DELAY = 15000, AB_MIN_GAP = 300000, AB_MAX = 6;

function autoBackupEnabled() { return _abEnabled; }
function setAutoBackup(on) { _abEnabled = !!on; try { localStorage.setItem(AUTOBACKUP_KEY, on ? 'on' : 'off'); } catch (e) {} }
function scheduleAutoBackup() { if (!_abEnabled) return; _abPending = true; clearTimeout(_abTimer); _abTimer = setTimeout(runAutoBackup, AB_DELAY); }
function runAutoBackup() {
  if (!_abEnabled || !_abPending) return;
  const now = Date.now();
  if (_abCount >= AB_MAX) { _abPending = false; return; }
  if (_abLast && now - _abLast < AB_MIN_GAP) { _abTimer = setTimeout(runAutoBackup, AB_MIN_GAP - (now - _abLast)); return; }
  _abPending = false; _abLast = now; _abCount++;
  try {
    if (!records.length) return;
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    download('pace-auto-' + ts + '.json', JSON.stringify(records, null, 2));
  } catch (e) {}
}
function autoBackupToggleUI() {
  const ck = el('input', { type: 'checkbox', class: 'ab-ck', onchange: (e) => { setAutoBackup(e.target.checked); toast(e.target.checked ? 'Auto-backup ON' : 'Auto-backup OFF'); } });
  ck.checked = _abEnabled;
  return el('label', { class: 'ab-toggle' }, [
    ck,
    el('span', { class: 'ab-txt' }, [
      el('span', { class: 'ab-title' }, ['Auto-backup to Downloads']),
      el('span', { class: 'sub' }, ['Saves a timestamped backup file to Downloads a few seconds after you stop entering data (up to 6 per session).']),
    ]),
  ]);
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
    el('button', { class: 'btn ghost small', onclick: () => afPaceReport(r) }, ['📄 Save PDF / Email']),
  ]));

  const report = el('div', { class: 'report' }, []);
  report.appendChild(el('h2', {}, ['PACE Driving Evaluation']));
  report.appendChild(el('p', { class: 'rsub' }, ['Quarterly ride-along assessment • ' + (r.date || 'no date')]));

  const meta = el('table', { class: 'rtbl' }, []);
  const metaRow = el('tr', {}, []);
  metaRow.appendChild(el('td', {}, [el('strong', {}, ['Driver:']), ' ' + (r.driver || '–')]));
  metaRow.appendChild(el('td', {}, [el('strong', {}, ['Evaluator:']), ' ' + (r.evaluator || '–')]));
  meta.appendChild(metaRow);
  const metaRow2 = el('tr', {}, []);
  metaRow2.appendChild(el('td', {}, [el('strong', {}, ['Lic. #:']), ' ' + (r.lic || '–')]));
  metaRow2.appendChild(el('td', {}, [el('strong', {}, ['Lic Exp:']), ' ' + (r.exp || '–')]));
  meta.appendChild(metaRow2);
  if (r.training) {
    const metaRow3 = el('tr', {}, []);
    metaRow3.appendChild(el('td', {}, [el('strong', {}, ['Result:']), ' ' + (r.training === 'completed' ? 'Training Completed' : 'Continued Training')]));
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
    if (state.notes) rows.push(el('tr', {}, [el('td', { colspan: 2 }, [el('em', {}, [state.notes])])]));
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
  if ('serviceWorker' in navigator) {
    /* SW disabled in demo */
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => stopAllTimers());
}

/* === AF-REPORT:BEGIN === */
window.__afToast = toast;

/* Build a print-quality PDF spec out of one saved PACE evaluation. */
function afPaceSpec(r) {
  const val = (v) => (v ? RATING_LABEL[v] : '—');
  const meta = [
    ['Driver:', r.driver || '—'],
    ['Evaluator:', r.evaluator || '—'],
    ['Lic. #:', r.lic || '—'],
    ['Lic Exp:', fmtDate(r.exp) || '—'],
    ['Date:', fmtDate(r.date) || '—'],
    ['Next PACE:', fmtDate(r.nextPaceDate) || '—'],
    ['Review Date:', fmtDate(r.reviewDate) || '—'],
    ['Result:', r.training === 'completed' ? 'Training Completed'
      : r.training === 'continued' ? 'Continued Training' : '—'],
  ];
  const blocks = SECTIONS.map((sec) => {
    const st = (r.sections && r.sections[sec.id]) || { ratings: {}, timed: {}, notes: '' };
    const rows = sec.items.map((it) => [it, val((st.ratings || {})[it])]);
    (sec.timed || []).forEach((t) => {
      const ts = (st.timed && st.timed[t.id]) || {};
      rows.push([t.label + ' (seconds)', ts.sec != null ? ts.sec + 's' : '—']);
      rows.push(['   Rating', val(ts.rating)]);
    });
    return { heading: sec.num + '. ' + sec.title, rows, notes: st.notes };
  });
  const paragraphs = [];
  if (r.overallNotes) paragraphs.push({ heading: 'Overall Notes / Coaching Points', text: r.overallNotes });
  if (r.clicker) paragraphs.push({ heading: 'Verbal Narration Clicker', text: r.clicker + ' narration(s) recorded during the drive' });
  const signatures = [];
  if (r.evaluatorSig) signatures.push({ label: 'Evaluator Signature', image: r.evaluatorSig });
  if (r.employeeSig) signatures.push({ label: 'Employee Signature', image: r.employeeSig });
  const footnotes = [];
  footnotes.push('Items rated Not Practiced: ' + countLow(r) + ' of ' + totalItems());
  if (r.trainingCompleteDate) footnotes.push('PACE Behavioral Driving Evaluation Training Complete Date: ' + fmtDate(r.trainingCompleteDate));
  footnotes.push('Generated ' + todayISO() + ' · U.S. AutoForce · Field Operations');
  return {
    kind: 'PACE',
    name: r.driver || r.evaluator || 'Driver',
    date: r.date || todayISO(),
    title: 'PACE Driving Evaluation',
    subtitle: 'Plan Ahead · Analyze Surroundings · Communicate · Execute',
    logo: typeof AF_LOGO !== 'undefined' ? AF_LOGO : null,
    stamp: r.training === 'completed' ? 'TRAINING COMPLETED'
      : r.training === 'continued' ? 'CONTINUED TRAINING' : '',
    meta, blocks, paragraphs, signatures, footnotes,
  };
}

/* Save + offer to email one PACE record (also used by the on-screen buttons). */
function afPaceReport(r) { return AFReport.save(afPaceSpec(r)); }

/* Auto-save on Save, once per driver+date: loading and re-saving an evaluation
   to fix a rating must not pile duplicate PDFs into Downloads.  The 📄 PDF
   button above always exports a fresh copy. */
function afPaceAutoSave(r) {
  const key = 'pace:' + String(r.driver || '').trim().toLowerCase() + ':' + (r.date || todayISO());
  if (AFReport.seen && AFReport.seen(key)) {
    if (window.console && console.info) console.info('[afreport] already saved ' + key);
    return;
  }
  AFReport.markReported(key);
  afPaceReport(r);
}
/* === AF-REPORT:END === */

const AF_LOGO = 'data:image/jpeg;base64,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';
