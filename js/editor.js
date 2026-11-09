// editor.js: the level editor (editor.html). Plain script (no modules): it shares one global scope with data.js
// (tiles, enemies, icons), gen.js (random floors to start from) and levels.js (level codes, links and the saved list).
// The board uses the game's own tile classes from style.css, so a level looks here the way it will in the game.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];  // gen.js needs these three, which the game defines in game.js
const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const $ = s => document.querySelector(s);

// ---------- What can be painted ----------
const SOLID = '#oKFSVTGAZQHUB';
const FURN = { K: 'desk', F: 'cabinet', S: 'safe', V: 'vending', T: 'terminal', A: 'altar', Z: 'stairs', B: 'alarm', U: 'husk', Q: 'contact', H: 'phone' };
const CLUTTER = { pharma: ['Lab vat', 'Breakable. Spills chemicals, may drop a stim.'], weapons: ['Weapons crate', 'Breakable. May hold a gun.'], flesh: ['Clutter', 'Blocks walking and sight.'] };
const PALETTE = [
  ['Building', [
    ['.', 'Floor'], ['#', 'Wall', 'Interior walls can be smashed (20 HP) or breached.'],
    ['+', 'Locked door', 'Lockpick it, smash it, or wait for a guard to open it.'], ['O', 'Open door', 'A door frame: walkable and see-through.'],
    ['L', 'Keycard door', 'Needs a keycard. Some of the people on the level carry one.'], ['C', 'Keypad door', 'Its code is hidden in a desk or cabinet on the level.'],
    ['G', 'Vent grate', 'Put it in a wall, then join grates with ducts on the Ducts layer.'], ['w', 'Laser tripwire', 'Crossing it raises the alarm. Hackable.'],
    ['b', 'Oil-flooded floor', 'One spark and it all burns.'], ['r', 'Blood circle', 'Ritual floor marking.'],
  ]],
  ['Furniture', [
    ['o', 'Clutter'], ['K', 'Desk', 'Search it for loot, mail and codes.'], ['F', 'Filing cabinet', 'Search it for loot, notes and codes.'],
    ['S', 'Wall safe', 'Code-locked. Its code is hidden in a desk or cabinet.'], ['V', 'Vending machine', 'Sells stims and gadgets.'],
    ['T', 'Terminal', 'Hack it: loop cameras, open keycard doors, kill lasers.'], ['B', 'Alarm button', 'Clerks run here to raise the alarm.'],
    ['$', 'Loot cache', 'Something lying on the floor.'], ['A', 'Altar', 'Max HP for an implant.'], ['Z', 'Fire stairs', 'Skips the lift and its reward.'],
    ['Q', 'Bazaar contact', 'A fixer who trades.'], ['H', 'Dream phone', 'It rings.'], ['U', 'Droid husk', 'A dead droid with a log.'],
  ]],
  ['Start and goal', [['P', 'Start', 'Where you begin. Exactly one.'], ['X', 'Lift', 'The way out. Exactly one.']]],
  ['People and machines', Object.entries(ENEMY_TYPES).map(([c, t]) => [c, t.name, t.civilian ? "Doesn't fight. Runs for an alarm button."
    : t.camera ? 'Sweeps a room and radios guards.' : `${t.hp} HP, sees ${t.vision} tiles.`])],
];
const LIQUIDS = [['oil', 'Oil', 'Burns.'], ['chem', 'Chemicals', 'Burns.'], ['blood', 'Blood', "Doesn't burn."]];
const tileInfo = c => {
  for (const [, items] of PALETTE) for (const it of items) if (it[0] === c) {
    if (c === 'o') return [c, ...CLUTTER[FLOORS[L.floor].theme]];
    return it;
  }
  return [c, '?'];
};

// ---------- State ----------
let L;                               // { id, name, author, floor, w, h, grid: [[char]], ducts: Set, liquids: Map }
let layer = 'tiles', tool = 'brush', brush = '#', liquidKind = 'oil';
let zoom = 1, pan = { x: 0, y: 0 };
const undoStack = [], redoStack = [];
const DRAFT = 'roguelike.editor.draft';

const at = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h ? L.grid[y][x] : '#';
const inside = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h;
const isFloorTile = (x, y) => inside(x, y) && (!SOLID.includes(at(x, y)) || at(x, y) === 'o' || !!FURN[at(x, y)]);

function blankLevel(w, h, floor) {
  const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.'));
  grid[h >> 1][2] = 'P'; grid[h >> 1][w - 3] = 'X';
  return { name: 'Untitled level', author: '', floor, w, h, grid, ducts: new Set(), liquids: new Map() };
}

function fromData(lv) {
  return { id: lv.id, name: lv.name, author: lv.author || '', floor: lv.floor, w: lv.rows[0].length, h: lv.rows.length,
    grid: lv.rows.map(r => [...r]), ducts: new Set(lv.ducts || []), liquids: new Map(lv.liquids || []) };
}

// The level as the game reads it. Every grate is part of the duct layer.
function levelData() {
  const rows = L.grid.map(r => r.join(''));
  const ducts = new Set([...L.ducts].filter(k => inside(...k.split(',').map(Number))));
  L.grid.forEach((r, y) => r.forEach((c, x) => { if (c === 'G') ducts.add(key(x, y)); }));
  const liquids = [...L.liquids].filter(([k]) => { const [x, y] = k.split(',').map(Number); return inside(x, y) && !SOLID.includes(at(x, y)); });
  return { id: L.id, name: L.name.trim() || 'Untitled level', author: L.author.trim(), floor: L.floor, rows, ducts: [...ducts], liquids };
}

function snapshot() { return JSON.stringify({ ...levelData(), id: L.id }); }
function restore(json) {
  const lv = JSON.parse(json);
  L = fromData(lv);
  syncFields(); buildBoard(); changed(false);
}
function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}
function undo() { if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()); } }
function redo() { if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()); } }

let checkTimer = 0;
function changed(save = true) {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    runChecks();
    if (save) try { localStorage.setItem(DRAFT, JSON.stringify(levelData())); } catch { /* storage off: no draft */ }
  }, 150);
}

// ---------- Board ----------
const board = $('#board'), view = $('#ed-view');
const tileEl = (x, y) => board.children[y * L.w + x];

function buildBoard() {
  board.innerHTML = '';
  board.className = 'theme-' + FLOORS[L.floor].theme + (layer === 'ducts' ? ' in-duct' : '') + (layer === 'liquids' ? ' ed-liquids' : '');
  board.style.gridTemplateColumns = `repeat(${L.w}, ${T}px)`;
  board.style.width = L.w * T + 'px';
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const t = document.createElement('div');
    t.dataset.x = x; t.dataset.y = y;
    board.appendChild(t);
  }
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) renderTile(x, y);
  const ducts = document.createElement('div');
  ducts.id = 'ducts';
  board.appendChild(ducts);
  const rect = document.createElement('div');
  rect.id = 'ed-rect'; rect.hidden = true;
  board.appendChild(rect);
  renderDucts();
  placeBoard();
}

function unitHTML(c) {
  const isP = c === 'P', t = ENEMY_TYPES[c], icon = ICONS[isP ? '@' : c];
  return `<div class="unit ${isP ? 'player' : 'enemy'}${t && t.camera ? ' camera' : ''}${t && t.civilian ? ' civilian' : ''}" style="left:0;top:0;--c:${isP ? 'var(--blue)' : t.color}">
    <div class="token">${icon ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icon}</svg>` : `<b>${t.glyph}</b>`}</div></div>`;
}

// Classes for one tile: the same ones the game's buildBoard and render functions put on it.
function tileClasses(x, y) {
  const c = at(x, y), theme = FLOORS[L.floor].theme;
  let cls = (x + y) % 2 ? 'floor alt' : 'floor';
  if (c === 'o') cls = 'floor prop' + (BREAKABLES[theme] ? ' vat' : '');
  else if (FURN[c]) cls = 'floor ' + FURN[c];
  else if (c === '#' || c === 'G') {
    let edge = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloorTile(x + dx, y + dy)) edge = true;
    cls = edge ? 'wall' : 'void';
  }
  const extra = { '+': 'door', L: 'keydoor', C: 'codedoor', X: 'exit', G: 'grate', b: 'oilroom', r: 'circle', w: 'trip', $: 'loot loot-creds' }[c];
  if (extra) cls += ' ' + extra;
  if (c === 'O') cls += ' opendoor' + (SOLID.includes(at(x, y - 1)) && SOLID.includes(at(x, y + 1)) ? ' ns' : '');
  return 'tile ' + cls;
}

function renderTile(x, y) {
  const t = tileEl(x, y), c = at(x, y), k = key(x, y);
  t.className = tileClasses(x, y);
  let html = '';
  const liq = c === 'b' ? 'oil' : L.liquids.get(k);
  if (liq && !SOLID.includes(c)) html += `<div class="puddle ${liq}${c === 'b' ? ' full' : ''}" style="left:0;top:0"></div>`;
  if (c === 'X') html += `<span>${L.floor === FLOORS.length - 1 ? 'HEAD' : 'LIFT'}</span>`;
  if (c === '$') html += '<span>¥</span>';
  if (c === 'P' || ENEMY_TYPES[c]) html += unitHTML(c);
  t.innerHTML = html;
}
// A change can turn the walls around it into void or back, and turn open doors.
function renderAround(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy)) renderTile(x + dx, y + dy);
}

function renderDucts() {
  const layerEl = $('#ducts');
  layerEl.innerHTML = '';
  const all = new Set(L.ducts);
  L.grid.forEach((r, y) => r.forEach((c, x) => { if (c === 'G') all.add(key(x, y)); }));
  for (const k of all) {
    const [x, y] = k.split(',').map(Number);
    if (!inside(x, y)) continue;
    const el = document.createElement('div');
    el.className = 'duct seen' + (at(x, y) === 'G' ? ' end' : '');
    el.style.left = x * T + 'px'; el.style.top = y * T + 'px';
    const side = (dx, dy) => all.has(key(x + dx, y + dy)) ? '0' : '4px';
    el.style.borderWidth = `${side(0, -1)} ${side(1, 0)} ${side(0, 1)} ${side(-1, 0)}`;
    layerEl.appendChild(el);
  }
}

// ---------- Camera: pan and zoom ----------
function placeBoard() { board.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`; }
function fit() {
  const r = view.getBoundingClientRect(), left = $('#ed-tools').getBoundingClientRect().right + 12, right = $('#ed-info').getBoundingClientRect().left - 12;
  const top = $('header').getBoundingClientRect().bottom + 12, w = Math.max(200, right - left), h = Math.max(200, r.height - top - 12);
  zoom = Math.max(0.2, Math.min(1.2, w / (L.w * T), h / (L.h * T)));
  pan.x = left + (w - L.w * T * zoom) / 2; pan.y = top + (h - L.h * T * zoom) / 2;
  placeBoard();
}
function zoomAt(cx, cy, factor) {
  const nz = Math.max(0.15, Math.min(2.5, zoom * factor));
  pan.x = cx - (cx - pan.x) * nz / zoom; pan.y = cy - (cy - pan.y) * nz / zoom;
  zoom = nz; placeBoard();
}
function focusTile(x, y) {
  const r = view.getBoundingClientRect();
  pan.x = r.width / 2 - (x + 0.5) * T * zoom; pan.y = r.height / 2 - (y + 0.5) * T * zoom;
  placeBoard();
  const t = tileEl(x, y);
  t.classList.add('ed-flash'); setTimeout(() => t.classList.remove('ed-flash'), 1200);
}
const tileAtPoint = (cx, cy) => {
  const b = board.getBoundingClientRect();
  return [Math.floor((cx - b.left) / (T * zoom)), Math.floor((cy - b.top) / (T * zoom))];
};

// ---------- Painting ----------
// Start and lift are unique: placing one moves it.
function setTile(x, y, c) {
  if (!inside(x, y) || at(x, y) === c) return;
  if (c === 'P' || c === 'X') L.grid.forEach((r, yy) => r.forEach((cc, xx) => { if (cc === c) { r[xx] = '.'; renderAround(xx, yy); } }));
  L.grid[y][x] = c;
  renderAround(x, y);
}
function setDuct(x, y, on) {
  if (!inside(x, y)) return;
  if (on) L.ducts.add(key(x, y)); else L.ducts.delete(key(x, y));
}
function setLiquid(x, y, kind) {
  if (!inside(x, y)) return;
  if (kind && !SOLID.includes(at(x, y))) L.liquids.set(key(x, y), kind); else L.liquids.delete(key(x, y));
  renderTile(x, y);
}
// Paints one tile on the current layer. erase: the right mouse button.
function paint(x, y, erase) {
  if (layer === 'tiles') setTile(x, y, erase ? '.' : brush);
  else if (layer === 'ducts') setDuct(x, y, !erase);
  else setLiquid(x, y, erase ? null : liquidKind);
}
function paintLine(a, b, erase) {
  let [x0, y0] = a; const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    paint(x0, y0, erase);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function paintRect(a, b, erase, room) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (room && layer === 'tiles' && !erase) setTile(x, y, x === x0 || x === x1 || y === y0 || y === y1 ? '#' : '.');
    else paint(x, y, erase);
  }
}
function floodFill(x, y, erase) {
  if (!inside(x, y)) return;
  const from = at(x, y), seen = new Set([key(x, y)]), cells = [[x, y]];
  for (let i = 0; i < cells.length && cells.length < 6000; i++) {
    const [cx, cy] = cells[i];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (inside(nx, ny) && !seen.has(key(nx, ny)) && at(nx, ny) === from) { seen.add(key(nx, ny)); cells.push([nx, ny]); }
    }
  }
  for (const [cx, cy] of cells) paint(cx, cy, erase);
}
function pickAt(x, y) {
  if (!inside(x, y)) return;
  if (layer === 'liquids') { const l = L.liquids.get(key(x, y)); if (l) liquidKind = l; }
  else { brush = at(x, y); setLayer('tiles'); }
  setTool('brush'); renderPalette();
}

let stroke = null, panning = null, spaceDown = false;
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('pointerdown', e => {
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    panning = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    view.setPointerCapture(e.pointerId); view.classList.add('panning');
    e.preventDefault(); return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  const [x, y] = tileAtPoint(e.clientX, e.clientY), erase = e.button === 2;
  if (e.altKey || tool === 'pick') return pickAt(x, y);
  if (!inside(x, y) && tool !== 'rect' && tool !== 'room') return;
  pushUndo();
  view.setPointerCapture(e.pointerId);
  if (tool === 'fill') { floodFill(x, y, erase); afterPaint(); return; }
  stroke = { start: [x, y], last: [x, y], erase };
  if (tool === 'brush') paint(x, y, erase);
  else showRect(stroke.start, stroke.last);
});
view.addEventListener('pointermove', e => {
  if (panning) { pan.x = e.clientX - panning.x; pan.y = e.clientY - panning.y; placeBoard(); return; }
  const [x, y] = tileAtPoint(e.clientX, e.clientY);
  showHover(x, y);
  if (!stroke) return;
  if (tool === 'brush') { paintLine(stroke.last, [x, y], stroke.erase); stroke.last = [x, y]; }
  else { stroke.last = [Math.max(0, Math.min(L.w - 1, x)), Math.max(0, Math.min(L.h - 1, y))]; showRect(stroke.start, stroke.last); }
});
const endStroke = () => {
  if (panning) { panning = null; view.classList.remove('panning'); return; }
  if (!stroke) return;
  if (tool === 'rect' || tool === 'room') {
    const s = [Math.max(0, Math.min(L.w - 1, stroke.start[0])), Math.max(0, Math.min(L.h - 1, stroke.start[1]))];
    paintRect(s, stroke.last, stroke.erase, tool === 'room');
    $('#ed-rect').hidden = true;
  }
  stroke = null;
  afterPaint();
};
view.addEventListener('pointerup', endStroke);
view.addEventListener('pointercancel', endStroke);
view.addEventListener('pointerleave', () => { $('#ed-hover').textContent = 'Point at a tile.'; });
view.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });

function afterPaint() { if (layer !== 'liquids') renderDucts(); changed(); }

function showRect(a, b) {
  const r = $('#ed-rect'), x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
  r.hidden = false;
  r.className = tool === 'room' ? 'room' : '';
  r.style.left = x0 * T + 'px'; r.style.top = y0 * T + 'px';
  r.style.width = (Math.abs(a[0] - b[0]) + 1) * T + 'px'; r.style.height = (Math.abs(a[1] - b[1]) + 1) * T + 'px';
  r.dataset.size = `${Math.abs(a[0] - b[0]) + 1} × ${Math.abs(a[1] - b[1]) + 1}`;
}

function showHover(x, y) {
  const el = $('#ed-hover');
  if (!inside(x, y)) { el.textContent = 'Outside the level.'; return; }
  const k = key(x, y), bits = [tileInfo(at(x, y))[1]];
  if (L.liquids.has(k) && !SOLID.includes(at(x, y))) bits.push(LIQUIDS.find(l => l[0] === L.liquids.get(k))[1].toLowerCase() + ' puddle');
  if (L.ducts.has(k) && at(x, y) !== 'G') bits.push('duct above');
  el.innerHTML = `<b>${x}, ${y}</b> ${bits.join(', ')}`;
}

// ---------- Panels ----------
function swatchHTML(c) {
  // Drawn as if surrounded by floor, so walls show as walls.
  const cls = c === '#' || c === 'G' ? 'tile wall' + (c === 'G' ? ' grate' : '') : tileClassesFor(c);
  let inner = '';
  if (c === 'X') inner = `<span>${L.floor === FLOORS.length - 1 ? 'HEAD' : 'LIFT'}</span>`;
  if (c === '$') inner = '<span>¥</span>';
  if (c === 'b') inner = '<div class="puddle oil full" style="left:0;top:0"></div>';
  if (c === 'P' || ENEMY_TYPES[c]) inner = unitHTML(c);
  return `<div class="swatch"><div class="${cls}">${inner}</div></div>`;
}
function tileClassesFor(c) {
  const theme = FLOORS[L.floor].theme;
  let cls = 'floor';
  if (c === 'o') cls = 'floor prop' + (BREAKABLES[theme] ? ' vat' : '');
  else if (FURN[c]) cls = 'floor ' + FURN[c];
  const extra = { '+': 'door', L: 'keydoor', C: 'codedoor', X: 'exit', b: 'oilroom', r: 'circle', w: 'trip', $: 'loot loot-creds', O: 'opendoor' }[c];
  return 'tile ' + cls + (extra ? ' ' + extra : '');
}

function renderPalette() {
  const p = $('#palette');
  p.className = 'theme-' + FLOORS[L.floor].theme;
  if (layer === 'tiles') {
    p.innerHTML = PALETTE.map(([group, items]) => `<h3>${group}</h3><div class="ed-grid">${items.map(it => {
      const [c, name] = tileInfo(it[0]);
      return `<button class="ed-item${c === brush ? ' on' : ''}" data-brush="${c}" title="${name}">${swatchHTML(c)}<span>${name}</span></button>`;
    }).join('')}</div>`).join('');
  } else if (layer === 'liquids') {
    p.innerHTML = `<h3>Puddles</h3><div class="ed-grid">${LIQUIDS.map(([k, name]) => `<button class="ed-item${k === liquidKind ? ' on' : ''}" data-liquid="${k}" title="${name}">
      <div class="swatch"><div class="tile floor"><div class="puddle ${k}" style="left:0;top:0"></div></div></div><span>${name}</span></button>`).join('')}</div>
      <p class="muted">Paint puddles on open floor. Oil and chemicals catch fire from gunfire and flames, and fire spreads along them.</p>`;
  } else {
    p.innerHTML = `<h3>Air ducts</h3><p class="muted">Ducts run above the floor. Paint a path of ducts from one vent grate to another (grates go in walls, on the Map layer). The player climbs in at a grate, crawls along and climbs out at any other grate on the same ducts. Nobody can see them in there.</p>
      <p class="muted">Right-click removes ducts.</p>`;
  }
  renderBrushInfo();
}
function renderBrushInfo() {
  const el = $('#ed-brush');
  if (layer === 'tiles') {
    const [c, name, hint] = tileInfo(brush);
    el.innerHTML = `<h3>Brush</h3><div class="ed-brushrow">${swatchHTML(c)}<div><b>${name}</b>${hint ? `<p>${hint}</p>` : ''}</div></div>`;
  } else if (layer === 'liquids') {
    const [k, name, hint] = LIQUIDS.find(l => l[0] === liquidKind);
    el.innerHTML = `<h3>Brush</h3><div class="ed-brushrow"><div class="swatch"><div class="tile floor"><div class="puddle ${k}" style="left:0;top:0"></div></div></div><div><b>${name}</b><p>${hint}</p></div></div>`;
  } else el.innerHTML = `<h3>Brush</h3><div class="ed-brushrow"><div class="swatch"><div class="ed-ductsw"></div></div><div><b>Duct</b><p>Joins vent grates.</p></div></div>`;
}

function setLayer(l) {
  layer = l;
  document.querySelectorAll('[data-layer]').forEach(b => b.classList.toggle('on', b.dataset.layer === l));
  board.classList.toggle('in-duct', l === 'ducts');
  board.classList.toggle('ed-liquids', l === 'liquids');
  document.querySelector('[data-tool="room"]').disabled = l !== 'tiles';
  if (tool === 'room' && l !== 'tiles') setTool('rect');
  renderPalette();
}
function setTool(t) {
  tool = t;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  view.dataset.tool = t;
}

function syncFields() {
  $('#lv-name').value = L.name; $('#lv-author').value = L.author; $('#lv-floor').value = L.floor;
  $('#lv-w').value = L.w; $('#lv-h').value = L.h;
  renderPalette();
}

// ---------- Checks ----------
// Problems that would make the level broken or unwinnable, and softer warnings.
function runChecks() {
  const out = [], find = c => { const r = []; L.grid.forEach((row, y) => row.forEach((cc, x) => { if (cc === c) r.push([x, y]); })); return r; };
  const starts = find('P'), lifts = find('X');
  if (!starts.length) out.push(['err', 'No start. Place one (Start and goal).']);
  if (!lifts.length) out.push(['err', 'No lift. Place one (Start and goal).']);
  if (starts.length && lifts.length) {
    // Doors of every kind count as passable: they can all be opened somehow.
    const [sx, sy] = starts[0], seen = new Set([key(sx, sy)]), q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) for (const [dx, dy] of DIRS) {
      const nx = q[i][0] + dx, ny = q[i][1] + dy;
      if (inside(nx, ny) && !seen.has(key(nx, ny)) && !SOLID.includes(at(nx, ny))) { seen.add(key(nx, ny)); q.push([nx, ny]); }
    }
    if (!seen.has(key(...lifts[0]))) out.push(['err', "The lift can't be reached from the start (ducts and smashing walls aside).", lifts[0]]);
  }
  const people = Object.keys(ENEMY_TYPES).filter(c => !ENEMY_TYPES[c].camera).flatMap(find);
  const keyDoors = find('L');
  if (keyDoors.length && !people.length) out.push(['err', 'Keycard doors, but nobody to carry a keycard. Add a guard or a clerk.', keyDoors[0]]);
  const searchable = [...find('K'), ...find('F')].filter(([x, y]) => DIRS.some(([dx, dy]) => !SOLID.includes(at(x + dx, y + dy))));
  const needCodes = find('C').length + find('S').length;
  if (needCodes && !searchable.length) out.push(['warn', 'Keypad doors and safes hide their codes in desks and filing cabinets. Add one the player can reach.', (find('C')[0] || find('S')[0])]);
  for (const [x, y] of find('G')) {
    const inWall = DIRS.some(([dx, dy]) => SOLID.includes(at(x + dx, y + dy)) && at(x + dx, y + dy) !== 'G');
    const linked = DIRS.some(([dx, dy]) => L.ducts.has(key(x + dx, y + dy)) || at(x + dx, y + dy) === 'G');
    const reach = DIRS.some(([dx, dy]) => !SOLID.includes(at(x + dx, y + dy)));
    if (!reach || !inWall) out.push(['warn', 'A vent grate should sit in a wall with floor on one side.', [x, y]]);
    else if (!linked) out.push(['warn', 'A vent grate with no duct. Paint ducts from it on the Ducts layer.', [x, y]]);
  }
  const guards = people.length;
  out.push(['ok', `${guards} ${guards === 1 ? 'person' : 'people'}, ${find('c').length} camera${find('c').length === 1 ? '' : 's'}, ${find('K').length + find('F').length} desks and cabinets.`]);
  $('#ed-checks').innerHTML = out.map(([kind, text, pos], i) => `<div class="check ${kind}${pos ? ' go' : ''}" data-check="${i}">${text}</div>`).join('');
  $('#ed-checks').querySelectorAll('[data-check]').forEach(el => { const pos = out[+el.dataset.check][2]; if (pos) el.onclick = () => focusTile(...pos); });
  return out;
}

// ---------- Saving, sharing, files ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function modal(title, html) {
  const m = $('#modal');
  m.innerHTML = `<div class="box wide ed-modal"><h2>${title}</h2>${html}<div class="ed-modal-foot"><button data-ed="close">Close</button></div></div>`;
  m.hidden = false;
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function save() {
  const entry = saveLevel(levelData());
  if (!entry) return toast("Couldn't save: this browser blocks storage. Use Share, then Download file.");
  L.id = entry.id;
  changed();
  toast(`Saved "${entry.name}" to My levels.`);
}

async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { if (input) { input.select(); try { return document.execCommand('copy'); } catch { return false; } } return false; }
}

async function share() {
  const lv = levelData(), code = await encodeLevel(lv);
  const edit = levelLink(code, 'editor.html'), play = levelLink(code, 'index.html');
  const errs = runChecks().filter(c => c[0] === 'err');
  modal('Share this level', `
    <p>Send a link to anyone: in a chat, an email, anywhere you can paste text. The whole level is inside the link, so nothing gets uploaded and nobody needs an account.</p>
    ${errs.length ? `<p class="ed-warnline">This level still has ${errs.length} problem${errs.length > 1 ? 's' : ''} (see Checks). It can be shared, but it might not be playable yet.</p>` : ''}
    <div class="ed-share"><label>Link to edit it (opens in the level editor, where they can save it or play it)</label>
      <div class="ed-copyrow"><input readonly id="share-edit" value="${esc(edit)}"><button data-copy="share-edit">Copy</button></div></div>
    <div class="ed-share"><label>Link to play it (opens straight into the game)</label>
      <div class="ed-copyrow"><input readonly id="share-play" value="${esc(play)}"><button data-copy="share-play">Copy</button></div></div>
    <div class="ed-share"><label>Or as a file (open it with My levels, then Open a file)</label>
      <div class="ed-copyrow"><button data-ed="download">Download ${esc(fileName(lv))}</button></div></div>
    <p class="muted">${code.length.toLocaleString()} characters.${location.protocol === 'file:' ? ' This page is opened from a file on this computer, so the links only work here. Use the editor at beppep.github.io/roguelike/editor.html to share links.' : ''}</p>`);
}
const fileName = lv => (lv.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'level') + '.level.json';
function download() {
  const lv = levelData(), rest = { ...lv };
  delete rest.id;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...rest, v: LEVEL_VERSION })], { type: 'application/json' }));
  a.download = fileName(lv);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openLevel(lv, note) {
  pushUndo();
  L = fromData(lv);
  syncFields(); buildBoard(); fit(); changed();
  if (note) toast(note);
}

function library(err = '') {
  const list = savedLevels();
  modal('My levels', `<p>Levels saved in this browser. The game's Custom levels screen lists them too.</p>
    <div class="ed-lib">${list.length ? list.map(l => `<div class="ed-librow${l.id === L.id ? ' cur' : ''}"><div><b>${esc(l.name)}</b><span>${l.author ? 'by ' + esc(l.author) + ', ' : ''}${FLOORS[l.floor].name}, ${l.rows[0].length}×${l.rows.length}, saved ${new Date(l.saved).toLocaleString()}</span></div>
      <button data-open="${l.id}">Open</button><button data-del="${l.id}" title="Delete it from this browser">Delete</button></div>`).join('') : '<p class="muted">Nothing saved yet. Save puts the level you are editing here.</p>'}</div>
    <h3>Got a level from someone?</h3>
    <div class="ed-copyrow"><input id="lib-code" placeholder="Paste the link or code they sent" autocomplete="off"><button data-ed="pastecode">Open</button></div>
    <div class="ed-copyrow"><button data-ed="openfile">Open a file…</button><input type="file" id="lib-file" accept=".json,.txt,application/json" hidden></div>
    ${err ? `<p class="ed-warnline">${esc(err)}</p>` : ''}`);
  $('#lib-file').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    const text = await f.text();
    try {
      let lv;
      try { lv = checkLevel(JSON.parse(text)); } catch { lv = await decodeLevel(text); }
      delete lv.id;
      $('#modal').hidden = true;
      openLevel(lv, `Opened "${lv.name}". Save it to keep it.`);
    } catch { library("That file isn't a level."); }
  };
}

async function pasteCode() {
  try {
    const lv = await decodeLevel($('#lib-code').value);
    $('#modal').hidden = true;
    openLevel(lv, `Opened "${lv.name}". Save it to keep it.`);
  } catch { library("That link or code didn't work. Copy the whole thing and try again."); }
}

function newLevel() {
  modal('New level', `<div class="ed-newform">
      <label>Floor <select id="new-floor">${FLOORS.map((f, i) => `<option value="${i}"${i === L.floor ? ' selected' : ''}>${f.name}</option>`).join('')}</select></label>
      <label>Width <input id="new-w" type="number" min="12" max="80" value="30"></label>
      <label>Height <input id="new-h" type="number" min="10" max="60" value="20"></label></div>
    <p class="muted">Start from an empty box, or from a random floor the game would make (its size is set by the floor).</p>
    <div class="ed-copyrow"><button class="primary" data-ed="newblank">Empty box</button><button data-ed="newgen">Random floor</button></div>`);
}
const clampNum = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(+v) || d));
function newBlank() {
  const fl = +$('#new-floor').value, w = clampNum($('#new-w').value, 12, 80, 30), h = clampNum($('#new-h').value, 10, 60, 20);
  $('#modal').hidden = true;
  pushUndo();
  L = blankLevel(w, h, fl);
  syncFields(); buildBoard(); fit(); changed();
}
function newGenerated() {
  const fl = +$('#new-floor').value;
  const rows = generateFloor({ ...FLOORS[fl], runSeed: Math.floor(Math.random() * 1e6) });
  $('#modal').hidden = true;
  openLevel({ name: FLOORS[fl].name + ' remix', author: L.author, floor: fl, rows: [...rows], ducts: rows.ducts, liquids: rows.liquids });
}

function resize() {
  const w = clampNum($('#lv-w').value, 12, 80, L.w), h = clampNum($('#lv-h').value, 10, 60, L.h);
  if (w === L.w && h === L.h) return;
  pushUndo();
  L.grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => L.grid[y] && L.grid[y][x] !== undefined ? L.grid[y][x] : '#'));
  L.w = w; L.h = h;
  syncFields(); buildBoard(); changed();
}

async function playtest() {
  const code = await encodeLevel(levelData());
  const errs = runChecks().filter(c => c[0] === 'err');
  if (errs.length) toast(errs[0][1]);
  window.open(levelLink(code, 'index.html'), '_blank');
}

// ---------- Input wiring ----------
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.layer) setLayer(d.layer);
  else if (d.tool) setTool(d.tool);
  else if (d.brush !== undefined) { brush = d.brush; if (tool === 'pick' || tool === 'room') setTool('brush'); renderPalette(); }
  else if (d.liquid) { liquidKind = d.liquid; renderPalette(); }
  else if (d.copy) copyText($('#' + d.copy).value, $('#' + d.copy)).then(ok => toast(ok ? 'Link copied. Paste it wherever you talk.' : 'Select the link and copy it by hand.'));
  else if (d.open) { const lv = savedLevels().find(l => l.id === d.open); $('#modal').hidden = true; if (lv) openLevel(lv, `Opened "${lv.name}".`); }
  else if (d.del) { const lv = savedLevels().find(l => l.id === d.del); if (lv && confirm(`Delete "${lv.name}" from this browser? This can't be undone.`)) { deleteLevel(d.del); if (L.id === d.del) delete L.id; library(); } }
  else if (d.ed) ({
    new: newLevel, library: () => library(), save, share, play: playtest, undo, redo, fit, resize, download,
    close: () => { $('#modal').hidden = true; }, pastecode: pasteCode, openfile: () => $('#lib-file').click(),
    newblank: newBlank, newgen: newGenerated,
  })[d.ed]();
});
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });

$('#lv-name').addEventListener('input', e => { L.name = e.target.value; changed(); });
$('#lv-author').addEventListener('input', e => { L.author = e.target.value; changed(); });
$('#lv-floor').innerHTML = FLOORS.map((f, i) => `<option value="${i}">${f.name}</option>`).join('');
$('#lv-floor').addEventListener('change', e => { pushUndo(); L.floor = +e.target.value; buildBoard(); renderPalette(); changed(); });
for (const id of ['#lv-w', '#lv-h']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') resize(); });

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); }
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if (k === ' ') { spaceDown = true; view.classList.add('can-pan'); e.preventDefault(); }
  else if (k === 'escape') $('#modal').hidden = true;
  else if ({ b: 1, r: 1, m: 1, f: 1, i: 1 }[k]) setTool({ b: 'brush', r: 'rect', m: 'room', f: 'fill', i: 'pick' }[k]);
  else if (k === '1' || k === '2' || k === '3') setLayer(['tiles', 'ducts', 'liquids'][+k - 1]);
  else if (k === '0') fit();
});
document.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; view.classList.remove('can-pan'); } });
window.addEventListener('resize', () => placeBoard());

// The game's tile rules are written for #board; the palette swatches get a copy of them.
for (const sheet of document.styleSheets) {
  let rules;
  try { rules = sheet.cssRules; } catch { continue; }
  if (!sheet.href || !sheet.href.includes('style.css')) continue;
  const copies = [];
  for (const r of rules) if (r.selectorText && r.selectorText.includes('#board .tile')) copies.push(r.cssText.replace(/#board \.tile/g, '.swatch .tile'));
  for (const c of copies) try { sheet.insertRule(c, sheet.cssRules.length); } catch { /* a rule this browser can't copy */ }
}

// ---------- Start ----------
// A level link (editor.html#L=...) opens that level; otherwise the last draft; otherwise an empty box.
async function boot() {
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT)); } catch { /* no draft */ }
  L = draft ? fromData(checkLevel(draft)) : blankLevel(30, 20, 0);
  setTool('brush'); setLayer('tiles'); syncFields(); buildBoard(); fit(); runChecks();
  const code = levelInHash();
  if (code) {
    try {
      const lv = await decodeLevel(code);
      openLevel(lv, `Opened "${lv.name}"${lv.author ? ' by ' + lv.author : ''}. Save it to keep it, or Playtest it.`);
      undoStack.length = 0;
    } catch { toast("That level link didn't work."); }
    history.replaceState(null, '', location.pathname);
  }
}
boot();
