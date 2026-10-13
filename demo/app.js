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
