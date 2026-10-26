// game.js: game state, rules, rendering and input — part of the roguelike. Plain script (no modules): files share one global scope
// and load in the order listed in index.html.

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// ---------- Helpers ----------
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Animation delay that's skipped while an off-screen enemy acts, so big floors don't drag.
const pause = ms => sleep(S.fast ? 0 : ms);
const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const manh = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const doorAt = (x, y) => S.doors.has(key(x, y));
const vatAt = (x, y) => S.vats.has(key(x, y));
// Solid for movement and sight: walls, furniture and closed doors.
// Enemies on the move (searching, chasing, fleeing) can open plain doors: they walk through closed '+' doors.
const enemyBlocked = (x, y) => isWall(x, y) && !doorAt(x, y);
const isWall = (x, y) => x < 0 || y < 0 || x >= S.w || y >= S.h || S.walls[y][x] || doorAt(x, y) || S.keyDoors.has(key(x, y)) || S.codeDoors.has(key(x, y));
const enemyAt = (x, y) => S.enemies.find(e => e.hp > 0 && e.x === x && e.y === y);
const isDirectional = s => s.type === 'shape' && s.shape !== 'ring';
const hasGear = id => !!run && Object.values(run.gear).includes(id);
const hasImplant = id => !!run && run.implants.includes(id);
const hasDefect = id => !!run && run.defects.includes(id);
// Free steps per turn: the operative's Move, plus gear, minus defects.
// Steps a move card gives: your Move stat for 'base', plus any bonus.
const cardMove = s => (s.move === 'base' ? (run ? moveStat() : OPERATIVE.move) : s.move || 0) + (s.moveBonus || 0);
// Max HP for this run: the run's own (Transfusions add, altars take) plus the Second Heart.
const maxHpStat = () => run.maxHp + (hasImplant('heart') ? SECOND_HEART_HP : 0);
// After max HP changes mid-floor: a gain also heals by the same amount, a loss caps your HP.
function syncMaxHp() {
  if (!S || !S.player) return;
  const P = S.player, before = P.max;
  P.max = maxHpStat();
  P.hp = Math.max(1, Math.min(P.max, P.hp + Math.max(0, P.max - before)));
}
const moveStat = () => run.char.move + (hasGear('runners') ? 1 : 0) - (hasDefect('spinal') ? 1 : 0);
const nameOf = u => u.id === 'p' ? 'You' : ENEMY_TYPES[u.kind].name;

function bfs(sx, sy, pass, maxD = Infinity) {
  const dist = new Map([[key(sx, sy), 0]]), prev = new Map(), q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift(), d = dist.get(key(x, y));
    if (d >= maxD) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (dist.has(k) || !pass(nx, ny)) continue;
      dist.set(k, d + 1); prev.set(k, key(x, y)); q.push([nx, ny]);
    }
  }
  return { dist, prev };
}

function pathTo(prev, sx, sy, tx, ty) {
  const path = [], start = key(sx, sy);
  for (let k = key(tx, ty); k !== start; k = prev.get(k)) path.push(unkey(k));
  return path.reverse();
}

// Line of sight: sample along the line between tile centers; walls block, units don't.
// The target tile itself doesn't count, so you can shoot at a door.
// Low furniture you can see (and shoot) over. Cabinets, vending machines, safes, vats and crates still block.
const LOW_FURNITURE = new Set(['desk', 'terminal', 'altar', 'contact', 'phone', 'husk']);
const LOW_PROPS = new Set(['droids', 'flesh']);
const blocksSight = (x, y) => isWall(x, y) && !(S.furn.has(key(x, y)) && LOW_FURNITURE.has(S.furn.get(key(x, y)).kind)) && !(S.props.has(key(x, y)) && LOW_PROPS.has(FLOORS[S.room].theme));

function los(a, b) {
  const x0 = a.x + .5, y0 = a.y + .5, x1 = b.x + .5, y1 = b.y + .5;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 6);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = Math.floor(x0 + (x1 - x0) * t), y = Math.floor(y0 + (y1 - y0) * t);
    if ((x !== b.x || y !== b.y) && blocksSight(x, y)) return false;
  }
  return true;
}

function fireLine(a, b, range) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, out = [];
  const steps = Math.ceil(range * 4);
  for (let i = 1; i <= steps; i++) {
    const t = i / 4, x = Math.floor(a.x + .5 + dx / len * t), y = Math.floor(a.y + .5 + dy / len * t);
    if (x === a.x && y === a.y) continue;
    if (blocksSight(x, y)) break;
    if (!isWall(x, y) && !out.some(p => p.x === x && p.y === y)) out.push({ x, y });
  }
  return out;
}

function rot(x, y, [dx, dy]) {
  if (dy === -1) return [x, y];
  if (dx === 1) return [-y, x];
  if (dy === 1) return [-x, -y];
  return [y, -x];
}

// Tiles an attack can reach (floor, or a door). With no dir, directional shapes return the union of all four facings.
function atkTiles(s, from, dir) {
  const out = [], seen = new Set();
  const add = (x, y) => {
    const k = key(x, y);
    if ((isWall(x, y) && !doorAt(x, y) && !vatAt(x, y) && !(s.dmg > 0 && structureKind(x, y)) && !(s.breach && breakableWall(x, y)) && !(s.type === 'hack' && hackTargetAt(x, y))) || seen.has(k) || (x === from.x && y === from.y)) return;
    seen.add(k); out.push({ x, y });
  };
  if (s.type === 'self') return out;
  if (s.type === 'melee') DIRS.forEach(([dx, dy]) => add(from.x + dx, from.y + dy));
  else if (s.type === 'ranged' || s.type === 'point' || s.type === 'hack') {
    for (let y = from.y - s.range; y <= from.y + s.range; y++) for (let x = from.x - s.range; x <= from.x + s.range; x++) {
      const d = manh({ x, y }, from);
      if (d >= 1 && d <= s.range && los(from, { x, y })) add(x, y);
    }
  } else if (s.shape === 'ring') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(from.x + dx, from.y + dy);
  } else {
    for (const d of dir ? [dir] : DIRS) {
      for (const [sx, sy] of SHAPES[s.shape]) {
        const [rx, ry] = rot(sx, sy, d), x = from.x + rx, y = from.y + ry;
        if ((s.shape === 'line' || s.shape === 'rail') && isWall(x, y)) { add(x, y); break; }
        add(x, y);
      }
    }
  }
  return out;
}

const turnRight = ([dx, dy]) => [-dy, dx];
const turnLeft = ([dx, dy]) => [dy, -dx];

// Vision cone: up to `vision` tiles ahead, widening by one tile to each side every two tiles. Walls block.
function visionTiles(e) {
  if (ENEMY_TYPES[e.kind].camera && (S.camLoop > 0 || e.looped > 0)) return [];
  if (e.stunned) return [];
  const [fx, fy] = e.facing, [px, py] = turnRight(e.facing), out = [];
  for (let f = 1; f <= visionOf(e); f++) {
    const w = Math.floor(f / 2);
    for (let l = -w; l <= w; l++) {
      const x = e.x + fx * f + px * l, y = e.y + fy * f + py * l;
      if (!isWall(x, y) && los(e, { x, y })) out.push({ x, y });
    }
  }
  return out;
}
const sees = (e, u) => visionTiles(e).some(t => t.x === u.x && t.y === u.y);

// Start facing an open direction that doesn't already see the player.
function initFacing(e) {
  const ok = DIRS.filter(d => { e.facing = d; return !sees(e, S.player) && !isWall(e.x + d[0], e.y + d[1]); });
  const pool = ok.length ? ok : DIRS;
  e.facing = pool[Math.floor(Math.random() * pool.length)];
}

function rollIntent(e) {
  const opts = ENEMY_TYPES[e.kind].intents;
  e.intent = opts[Math.floor(Math.random() * opts.length)];
  // Avatars copy the last attack card you played: its damage, and its range if it was a gun.
  const c = S.lastCard;
  if (ENEMY_TYPES[e.kind].mimic && c) e.intent = { move: 2, atk: c.action.dmg, range: c.action.type === 'ranged' ? c.action.range : c.action.type === 'melee' ? 0 : 3, mimic: c.name };
}

const isCamera = e => !!ENEMY_TYPES[e.kind].camera;
const immune = (e, what) => (ENEMY_TYPES[e.kind].immune || []).includes(what);
const isCivilian = e => !!ENEMY_TYPES[e.kind].civilian;
const isHostile = e => !isCamera(e) && !isCivilian(e);

function alertEnemy(e, bySight) {
  if (isCivilian(e) && !e.alerted) return scream(e, S.player);
  if (e.alerted || isCamera(e)) return;
  // Echo: Familiar Face. The first person to see you on a floor hesitates, sure they know you.
  if (S.familiar && bySight) {
    S.familiar = false;
    e.suspicious = { x: S.player.x, y: S.player.y, turns: INVESTIGATE_TURNS }; e.atTarget = false;
    floatText(e, '?', 'alert');
    log(`${nameOf(e)} frowns at you, sure they know you from somewhere.`);
    return;
  }
  e.alerted = true; e.suspicious = null; e.atTarget = false; e.lost = 0;
  e.lastSeen = { x: S.player.x, y: S.player.y };
  const dx = S.player.x - e.x, dy = S.player.y - e.y;
  e.facing = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  // Spotted during your turn: it acts this enemy phase. Spotted on its own turn: it acts next round.
  if (S.phase === 'enemy') { e.intent = null; e.fresh = true; } else rollIntent(e);
  floatText(e, '!', 'alert');
  sfx('alert');
  log(`${nameOf(e)} spotted you!`);
  S.stats.alerts++;
  raiseAlarm(ENEMY_TYPES[e.kind].chant ? 2 : 1);
  if (ENEMY_TYPES[e.kind].chant) log(`${nameOf(e)} starts to chant. The whole floor hears it.`);
  // It shouts: anyone in earshot who hasn't seen you comes to look where you are.
  makeNoise(e.x, e.y, NOISE.shout + (ENEMY_TYPES[e.kind].chant ? 4 : 0), S.player, true);
  renderUnits(); renderOverlays();
}

function checkSight() {
  for (const e of S.enemies) {
    if (e.alerted) continue;
    if (!isCamera(e)) noticeBody(e);
    if (e.alerted || S.inDuct || !sees(e, S.player)) continue;
    if (S.hidden && manh(e, S.player) > 1) continue;
    if (S.ghost) continue;
    if (e.bribed) continue;
    if (S.disguise && !isCivilian(e)) {
      if (manh(e, S.player) > DISGUISE_RANGE && S.violentRound !== S.round) continue;
      blowDisguise(e);
    }
    if (isCamera(e) && hasGear('corpmask') && !S.maskBlown) continue;
    if (isCivilian(e)) { if (S.violentRound === S.round) scream(e, S.player); continue; }
    if (isCamera(e)) cameraSpot(e); else alertEnemy(e, true);
  }
}

function blowDisguise(e) {
  log(`${nameOf(e)} looks twice. <b>Your ${S.disguise} doesn't fool anyone up close.</b>`);
  S.disguise = null;
  renderSide();
}

// The first person to see a body reacts: staff scream, guards go to look and the alarm rises.
function noticeBody(e) {
  const t = visionTiles(e).find(t => { const c = S.corpses.get(key(t.x, t.y)); return c && !c.found; });
  if (!t) return;
  S.corpses.get(key(t.x, t.y)).found = true;
  if (isCivilian(e)) return scream(e, t);
  e.suspicious = { x: t.x, y: t.y, turns: INVESTIGATE_TURNS + 2 }; e.atTarget = false;
  floatText(e, '?!', 'alert');
  log(`${nameOf(e)} finds a body and calls it in.`);
  raiseAlarm(1);
}

// Staff who see violence or a body scream (everyone nearby comes to look) and run.
function scream(e, at) {
  e.alerted = true; e.fleeing = true; e.intent = null; e.suspicious = null;
  floatText(e, 'AAAH', 'alert');
  sfx('scream');
  log(`${nameOf(e)} screams.`);
  S.stats.alerts++;
  raiseAlarm(1);
  makeNoise(e.x, e.y, NOISE.shout + 2, at, true);
  renderUnits();
}

// ---------- Noise, suspicion and the floor alarm ----------
// Sound spreads along open floor, over furniture and through doors, but not through walls.
function makeNoise(x, y, radius, focus, quiet) {
  if (radius <= 0) return;
  radius += S.noiseBonus;
  const to = focus || { x, y };
  const open = (nx, ny) => nx >= 0 && ny >= 0 && nx < S.w && ny < S.h && (!S.walls[ny][nx] || S.props.has(key(nx, ny)) || S.furn.has(key(nx, ny)));
  const reach = bfs(x, y, open, radius).dist;
  showNoise(x, y, radius);
  let heard = 0;
  for (const e of S.enemies) {
    if (e.alerted || e.stunned || isCamera(e) || isCivilian(e) || !reach.has(key(e.x, e.y))) continue;
    if (!e.suspicious) floatText(e, '?', 'alert');
    e.suspicious = { x: to.x, y: to.y, turns: INVESTIGATE_TURNS };
    e.atTarget = false;
    heard++;
  }
  if (heard && !quiet) log(heard === 1 ? 'Someone heard that.' : `${heard} people heard that.`);
  renderUnits(); renderOverlays();
}

function showNoise(x, y, radius) {
  const n = document.createElement('div');
  n.className = 'noise';
  n.style.left = (x * T + T / 2) + 'px'; n.style.top = (y * T + T / 2) + 'px';
  n.style.width = n.style.height = (radius * 2 + 1) * T + 'px';
  $('#fx').appendChild(n);
  setTimeout(() => n.remove(), 700);
}

function raiseAlarm(n) {
  const before = S.alarm;
  S.alarm = Math.min(ALARM_MAX, S.alarm + n);
  S.stats.alarm += n;
  if (before < ALARM_HURRY && S.alarm >= ALARM_HURRY) {
    log(`<b>Alarm level ${S.alarm}.</b> Patrols speed up.`);
    sfx('alarm');
    toast('The alarm is rising: patrols move faster.');
  }
  if (before < ALARM_MAX && S.alarm >= ALARM_MAX) {
    log('<b>Full alarm.</b> Reinforcements are coming up the lift.');
    sfx('alarm');
    toast('Full alarm: reinforcements are on their way.');
    S.reinforceIn = 1;
  }
  renderSide();
}

// A camera that sees you raises the alarm and sends the nearest guards who haven't seen you to your position.
function cameraSpot(c) {
  if (c.cool > 0) return;
  c.cool = 3; c.tracking = 2;
  floatText(c, '!', 'alert');
  log('A camera spots you. The alarm rises and it radios a guard.');
  sfx('beep');
  S.stats.cameras++;
  raiseAlarm(2);
  const guards = S.enemies.filter(e => isHostile(e) && !e.alerted && !e.bribed).sort((a, b) => manh(a, c) - manh(b, c)).slice(0, 2);
  for (const g of guards) {
    g.suspicious = { x: S.player.x, y: S.player.y, turns: INVESTIGATE_TURNS };
    g.atTarget = false;
    floatText(g, '?', 'alert');
  }
  renderUnits(); renderOverlays();
}

// Cameras turn to the next direction that looks into open space.
function cameraNextFacing(c) {
  let d = c.facing;
  for (let i = 0; i < 4; i++) {
    d = turnRight(d);
    if (!isWall(c.x + d[0], c.y + d[1])) return d;
  }
  return c.facing;
}

// An alerted enemy keeps track of you while it has a clear line to you within a few tiles of its sight range.
const canTrack = e => !S.inDuct && manh(e, S.player) <= visionOf(e) + 3 && los(e, S.player);
const visionOf = e => ENEMY_TYPES[e.kind].vision + (ENEMY_TYPES[e.kind].camera ? (hasDefect('feedback') ? 2 : 0) - (hasEcho('static') ? 2 : 0) : 0);

const ductReach = n => bfs(S.player.x, S.player.y, (x, y) => S.ducts.has(key(x, y)), n * (hasImplant('compressed') ? 2 : 1));
// The floor tiles you can drop onto from the grate you're at.
const ductExits = () => !S.grates.has(key(S.player.x, S.player.y)) ? [] : DIRS.map(([dx, dy]) => ({ x: S.player.x + dx, y: S.player.y + dy })).filter(t => !isWall(t.x, t.y) && !enemyAt(t.x, t.y));
const moveReach = n => S.inDuct ? ductReach(n) : bfs(S.player.x, S.player.y, (x, y) => !isWall(x, y) && !enemyAt(x, y) && !(S.trips.has(key(x, y)) && S.seen.has(key(x, y)) && !S.tripOk), n);
const reachTiles = n => {
  S.tripOk = true; const r = moveReach(n); S.tripOk = false;
  const out = [...r.dist.keys()].filter(k => k !== key(S.player.x, S.player.y)).map(k => { const [x, y] = unkey(k); return { x, y }; });
  return S.inDuct && n >= 1 ? out.concat(ductExits()) : out;
};

function dirTo(x, y) {
  const dx = x - S.player.x, dy = y - S.player.y;
  if (!dx && !dy) return null;
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

const atkName = s => s.gun ? (s.dmg ? `Shoot ${s.dmg}` : `Sleep ${s.stun}`) : [s.dmg ? `Attack ${s.dmg + (s.str && S ? strBonus() : 0)}` : '', s.stun ? 'Stun' : '', s.steal ? 'Steal' : '', s.pick ? 'Lockpick' : '', s.move ? `Move +${cardMove(s)}` : '', s.heal ? `Heal ${s.heal}` : '', s.noise ? (s.price ? `Coin ¥${s.price}` : 'Noise') : '', s.ghost ? 'Vanish' : '', s.push ? `Shove ${s.push}` : '', s.breach ? 'Breach' : '', s.ignite ? 'Ignite' : '', s.type === 'hack' ? 'Hack' : '', s.bribe ? `Bribe ¥${BRIBE_PRICE}` : '']
  .filter(Boolean).join(' + ');
const atkLabel = s => `${atkName(s)} · ${s.type === 'self' ? 'Self' : s.type === 'melee' ? 'Melee' : s.type === 'hack' ? 'Terminal, keypad or camera' : s.type === 'ranged' || s.type === 'point' ? 'Range ' + s.range : SHAPE_NAMES[s.shape]}${s.cost ? ` · costs ${s.cost} HP` : ''}`;

// ---------- State ----------
let S = null;
let deck = [];  // the run's deck; set by the character you pick, grows as you find cards
let run = null;  // the character you play plus loot that carries across floors
const unitEls = new Map();
// God mode (testing): walk any distance, and rest whenever you like without burning a card. Toggled from the header.
let godMode = false;
const fmtMove = n => n === Infinity ? '∞' : n;
// God mode money: creds become infinite while it's on, and go back to what you had when it's off.
function godCreds() {
  if (!run) return;
  if (godMode) { if (run.creds !== Infinity) run.realCreds = run.creds; run.creds = Infinity; }
  else if (run.creds === Infinity) run.creds = run.realCreds || 0;
}

const FURNITURE_LOOT_CHANCE = 0.12;

let docQueue = [];
const nextDoc = (pool, kind) => {
  if (!docQueue[kind] || !docQueue[kind].length) docQueue[kind] = [...pool].sort(() => Math.random() - 0.5);
  return docQueue[kind].pop();
};

// Most writing belongs to the floor you're on; the rest is the generic office stuff found everywhere.
const FLOOR_WRITING_SHARE = 0.7;

function makeFurniture(kind) {
  let loot = Math.random() < FURNITURE_LOOT_CHANCE * (S.adapt === 'thief' ? 0.5 : 1) ? (Math.random() < 0.4 ? randomPotion() : Math.random() < 0.6 ? randomGadget() : 'creds') : null;
  if (kind === 'cabinet' && Math.random() < CABINET_REWARD_CHANCE) loot = Math.random() < GUNMOD_SHARE ? 'gunmod' : 'card';
  const theme = FLOORS[S.room].theme === 'weapons' && Math.random() < 0.4 ? 'droids' : FLOORS[S.room].theme, local = FLOOR_WRITING[theme] && Math.random() < FLOOR_WRITING_SHARE;
  if (kind === 'desk') return { kind, searched: false, loot, email: local ? nextDoc(FLOOR_WRITING[theme].emails, 'email-' + theme) : nextDoc(EMAILS, 'email') };
  return { kind, searched: false, loot, doc: Math.random() < 0.2 ? null : local ? nextDoc(FLOOR_WRITING[theme].documents, 'doc-' + theme) : nextDoc(DOCUMENTS, 'doc') };
}

// Searching takes no card and no move, but you have to be standing right next to it.
function searchFurniture(x, y) {
  const f = S.furn.get(key(x, y)), P = S.player;
  const what = { desk: 'computer', cabinet: 'cabinet', safe: 'safe', vending: 'vending machine', terminal: 'terminal', husk: 'droid husk', altar: 'altar', stairs: 'stairwell door', contact: 'person', phone: 'phone' }[f.kind];
  if (Math.abs(P.x - x) + Math.abs(P.y - y) !== 1) { toast(`Get next to the ${what} to use it.`); return; }
  if (f.kind === 'safe') return f.opened ? toast('The safe is empty.') : openKeypad('safe', x, y);
  if (f.kind === 'vending') return openShop();
  if (f.kind === 'terminal') return toast('A networked terminal. Pick a Hack half and click the terminal from next to it.');
  if (f.kind === 'husk') return showModal('Droid husk', '', [['closeread', 'Close']], `<div class="doc mail"><p>${DROID_LOGS[(x * 7 + y) % DROID_LOGS.length]}</p></div>`);
  if (f.kind === 'stairs') return showModal('Fire stairs', 'A stairwell door, propped open with a fire extinguisher. Taking the stairs skips the lift: no story, no reward, and the Head loses track of you, so the next floor is not set against you.',
    [['stairs', 'Take the stairs'], ['closeread', 'Not yet']]);
  if (f.kind === 'contact') {
    const c = CONTACT_LINES[{ pharma: 0, weapons: 1, droids: 2, flesh: 3 }[FLOORS[S.room].theme]] || CONTACT_LINES[0];
    showModal(c.name, '', [['closeread', 'Go']], `<div class="doc paper"><p>${c.text}</p></div>`);
    if (!f.used) { f.used = true; contactGift(x, y); }
    return;
  }
  if (f.kind === 'phone') {
    if (f.used) return toast('The line is dead. It was always dead.');
    f.used = true;
    tileEl(x, y).classList.add('searched');
    showModal('The phone is ringing', '', [['closeread', 'Hang up']], `<div class="doc mail"><p>${PHONE_LINES[(S.room + run.seed) % PHONE_LINES.length]}</p></div>`);
    revealFar();
    return;
  }
  if (f.kind === 'altar') {
    if (f.used) return toast('The altar is sated.');
    const left = Object.keys(IMPLANTS).filter(id => !hasImplant(id)).length;
    S.altar = f;
    return showModal('Altar', `Old stone, newer stains. A brass plate: <i>WHAT IS OWED IS PAID.</i> Give up ${ALTAR_MAX_HP} of your max HP, for good, and something will grow in you: a random implant, in whatever part of you it chooses.${implantWarn()}`,
      left && run.maxHp > ALTAR_MAX_HP + 2 ? [['offer', 'Offer blood'], ['closeread', 'Step back']] : [['closeread', 'Step back']]);
  }
  let html;
  const mail = e => `<div class="doc mail"><div class="doc-head">From: ${e.from}<br>Subject: ${e.subject}</div><p>${e.body}</p></div>`;
  const paper = d => `<div class="doc paper">${d.title ? `<div class="doc-head">${d.title}</div>` : ''}<p>${d.body}</p></div>`;
  if (f.story) html = (f.story.kind === 'email' ? mail(f.story) : paper(f.story)).replace('class="doc ', 'class="doc story ');
  else if (f.clue) html = f.kind === 'desk' ? mail(f.clue.text) : paper(f.clue.text);
  else if (f.kind === 'desk') html = mail(f.email);
  else html = paper(f.doc || { body: EMPTY_FINDS[(x + y) % EMPTY_FINDS.length] });
  const first = !f.searched;
  f.searched = true;
  tileEl(x, y).classList.add('searched');
  showModal(f.kind === 'desk' ? 'Workstation' : 'Filing cabinet', '', [['closeread', 'Close']], html);
  if (first && f.story) { run.story[S.room] = true; log('<b>You read it twice.</b> This one matters.'); renderFurnStory(); }
  if (first && f.clue) learnClue(f.clue);
  if (first && f.loot) giveLoot(f.loot, { x, y }, f.kind === 'desk' ? 'from the desk drawer' : 'from the back of the drawer', '');
  else if (first && !f.clue && !f.story) log(f.kind === 'desk' ? 'You read the screen.' : 'You leaf through the cabinet.');
}

// ---------- Hacking ----------
// The Hack half: a terminal or keypad door within reach (next to you; Spinal Tap: 3 tiles, in sight), or a camera
// in sight within 5. Each hack works once per terminal. Firewalled terminals (after the Head noticed your hacking)
// also bite: 1 HP per hack. Every hack may be traced (alarm +1) unless you carry a Signal Jammer.
const hackReach = () => hasImplant('spinaltap') ? HACK_REACH_TAP : HACK_REACH;
function hackTargetAt(x, y) {
  const P = S.player, d = manh(P, { x, y }), near = d <= hackReach() && (d === 1 || los(P, { x, y }));
  const f = S.furn.get(key(x, y));
  if (f && f.kind === 'terminal' && near) return 'terminal';
  if (S.codeDoors.has(key(x, y)) && near) return 'keypad';
  const e = enemyAt(x, y);
  if (e && isCamera(e) && d <= 5 && los(P, e) && !(e.looped > 0)) return 'camera';
  return null;
}

function traceRisk() {
  S.stats.hacks++;
  sfx('hack');
  if (!hasGear('jammer') && Math.random() < TRACE_CHANCE) { log('<b>Traced.</b> The Head\'s ICE follows the connection back to you. The alarm rises.'); raiseAlarm(1); }
}

// Spends this turn's Hack. Called once a hack has actually happened.
function hackDone() { S.act.atkUsed = true; S.busy = false; render(); }

function hackAt(t) {
  const what = hackTargetAt(t.x, t.y);
  if (what === 'terminal') return openTerminal(t.x, t.y);
  if (what === 'keypad') {
    S.codeDoors.delete(key(t.x, t.y));
    traceRisk();
    log('You talk the keypad into opening.');
    renderCodeDoors(); renderUnits();
    return hackDone();
  }
  if (what === 'camera') {
    const c = enemyAt(t.x, t.y);
    c.looped = CAMERA_LOOP_ROUNDS;
    traceRisk();
    floatText(c, 'LOOPED', 'stun');
    log(`You loop the camera's feed for ${CAMERA_LOOP_ROUNDS} rounds.`);
    renderUnits();
    return hackDone();
  }
}

function openTerminal(x, y) {
  const f = S.furn.get(key(x, y));
  S.terminal = { x, y };
  const rows = HACKS.map(h => {
    const done = f.done.has(h.id) || (h.id === 'doors' && !S.keyDoors.size) || (h.id === 'plan' && S.planned);
    return `<button class="hack" data-act="hack-${h.id}" ${done ? 'disabled' : ''}>
      <b>${h.name}</b> <span>${done ? 'done' : ''}</span><small>${h.text}</small></button>`;
  }).join('');
  showModal('Terminal', `Your Hack gets you one of these.${hasGear('jammer') ? '' : ` It has a ${Math.round(TRACE_CHANCE * 100)}% chance to be traced (alarm +1).`}${f.firewall ? ' <b class="lost">Firewalled: every hack costs 1 HP.</b>' : ''}`,
    [['closeread', 'Log off']], `<div class="terminal-menu">${rows}</div>`);
  S.busy = false;
}

function doHack(id) {
  const t = S.terminal, f = t && S.furn.get(key(t.x, t.y)), h = HACKS.find(x => x.id === id);
  if (!f || !h || f.done.has(id) || S.act.atkUsed) return;
  $('#modal').hidden = true;
  f.done.add(id);
  traceRisk();
  if (f.firewall) { damage(S.player, 1); log('The firewall bites back. 1 damage.'); if (S.player.hp <= 0) { $('#modal').hidden = true; return gameOver('The firewall fried your nervous system.'); } }
  if (id === 'loop') { S.camLoop = CAMERA_LOOP_ROUNDS; log(`You loop the cameras for ${CAMERA_LOOP_ROUNDS} rounds.`); }
  else if (id === 'doors') { S.keyDoors.clear(); renderKeyDoors(); log('Every keycard door on the floor clunks open.'); }
  else if (id === 'plan') { S.planned = true; log('The printer whirs. The floor plan is now on your map.'); drawMinimap(); }
  else if (id === 'fire') {
    const P = S.player, spots = [];
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (!isWall(x, y) && manh({ x, y }, P) >= 14) spots.push({ x, y });
    const at = spots[Math.floor(Math.random() * spots.length)];
    if (at) { showNoise(at.x, at.y, 10); makeNoise(at.x, at.y, 10, at, true); log(`A fire alarm rings in the ${areaName(at.x, at.y)} of the floor.`); }
  }
  renderUnits(); renderOverlays(); renderSide();
  hackDone();
}

// ---------- Air ducts ----------
// Step into a grate next to you (1 step) to enter the duct layer. In there you crawl with your normal steps,
// nobody can see, hit or follow you, and you can't fight. Climb out from a grate onto the floor next to it (1 step).
async function enterDuct(x, y) {
  const a = S.act, P = S.player;
  if (manh(P, { x, y }) !== 1) { toast('Get next to the vent grate.'); return; }
  if (a.mvUsed || a.move < 1) { toast('You have no steps left this turn.'); return; }
  if (S.playing && !S.act.atkUsed && a.atk && a.atk.type !== 'self') { S.playing = null; a.atk = null; }
  S.busy = true;
  S.inDuct = true;
  sfx('vent');
  await walk(P, [[x, y]]);
  a.move -= 1; a.steps += 1; a.mvUsed = a.move <= 0;
  log('You pull the grate aside and squeeze into the air duct. Down here (up here) nobody can see you.');
  S.busy = false;
  render();
}

async function ductClick(x, y) {
  const a = S.act, P = S.player, k = key(x, y);
  if (a.mvUsed || a.move < 1) { toast('You have no steps left this turn. End your turn.'); return; }
  // Climbing out.
  if (ductExits().some(t => t.x === x && t.y === y)) {
    S.busy = true;
    S.inDuct = false;
    await walk(P, [[x, y]]);
    a.move -= 1; a.steps += 1; a.mvUsed = a.move <= 0;
    sfx('vent');
    log(`You drop out of the duct in the ${areaName(x, y)}.`);
    S.busy = false;
    if (P.x === S.exit.x && P.y === S.exit.y) return roomCleared();
    checkSight();
    return nextAction();
  }
  if (!S.ducts.has(k)) { toast(S.grates.has(key(P.x, P.y)) ? 'Climb out onto a floor tile next to this grate.' : 'You can only climb out through a grate.'); return; }
  const { dist, prev } = ductReach(a.move);
  if (!dist.has(k) || (x === P.x && y === P.y)) return;
  const path = pathTo(prev, P.x, P.y, x, y), cost = hasImplant('compressed') ? Math.ceil(path.length / 2) : path.length;
  S.busy = true;
  await walk(P, path);
  a.move -= cost; a.steps += cost; a.mvUsed = a.move <= 0;
  S.busy = false;
  nextAction();
}

// The duct layer: one block per duct tile, with walls drawn on the sides that have no tunnel.
function buildDucts() {
  const layer = document.createElement('div');
  layer.id = 'ducts';
  S.ductEls = new Map();
  for (const k of S.ducts) {
    const [x, y] = unkey(k), el = document.createElement('div');
    el.className = 'duct' + (S.grates.has(k) ? ' end' : '');
    el.style.left = x * T + 'px'; el.style.top = y * T + 'px';
    const side = (dx, dy) => S.ducts.has(key(x + dx, y + dy)) ? '0' : '4px';
    el.style.borderWidth = `${side(0, -1)} ${side(1, 0)} ${side(0, 1)} ${side(-1, 0)}`;
    layer.appendChild(el);
    S.ductEls.set(k, el);
  }
  return layer;
}

function renderDucts(reach) {
  $('#board').classList.toggle('in-duct', S.inDuct);
  if (!S.ductEls) return;
  for (const [k, el] of S.ductEls) {
    el.classList.toggle('seen', S.ductSeen.has(k));
    el.classList.toggle('vis', S.inDuct && S.vis.has(k));
    el.classList.toggle('reach', S.inDuct && reach.has(k));
  }
}

// ---------- Gadgets ----------
function giveGadget(id, at, from) {
  run.items[id] = (run.items[id] || 0) + 1;
  floatText(at, '+' + GADGETS[id].name.toUpperCase(), 'heal');
  log(`You take a <b>${GADGETS[id].name}</b> ${from}. ${GADGETS[id].text}`);
  renderSide();
}
const randomGadget = () => { const ids = Object.keys(GADGETS); return ids[Math.floor(Math.random() * ids.length)]; };

// Using one: thrown gadgets enter aiming mode (click a tile in range); the rest work at once.
function useGadget(id) {
  if (!run.items[id] || S.busy || S.phase !== 'turn') return;
  const g = GADGETS[id];
  if (g.throw && S.inDuct) { toast('No room to throw in a duct.'); return; }
  if (g.throw) { S.throwing = S.throwing === id ? null : id; render(); if (S.throwing) toast(`Click where to throw the ${g.name}.`); return; }
  run.items[id]--;
  if (id === 'ld50') {
    heal(S.player.max);
    const pool = Object.keys(DEFECTS).filter(x => !hasDefect(x));
    const dd = pool[Math.floor(Math.random() * pool.length)];
    log('You swallow the LD-50-emon. Everything stops hurting.');
    if (dd) { run.defects.push(dd); log(`<b>Defect: ${DEFECTS[dd].name}</b>. ${DEFECTS[dd].text} The habit is not yours.`); }
  }
  render();
}

const throwTiles = id => {
  const g = GADGETS[id], P = S.player, out = [];
  for (let y = P.y - g.throw; y <= P.y + g.throw; y++) for (let x = P.x - g.throw; x <= P.x + g.throw; x++) {
    const dd = manh({ x, y }, P);
    if (dd < 1 || dd > g.throw || !S.vis.has(key(x, y))) continue;
    if (id === 'breach' ? (breakableWall(x, y) || doorAt(x, y)) : !isWall(x, y) && los(P, { x, y })) out.push({ x, y });
  }
  return out;
};

async function throwAt(x, y) {
  const id = S.throwing, g = GADGETS[id];
  if (!throwTiles(id).some(t => t.x === x && t.y === y)) { toast('Out of reach. Pick a highlighted tile, or click the gadget again to cancel.'); return; }
  S.throwing = null;
  run.items[id]--;
  const near = (r, pred) => S.enemies.filter(e => manh(e, { x, y }) <= r && pred(e));
  if (id === 'emp') {
    near(g.radius, e => ENEMY_TYPES[e.kind].machine).forEach(e => { e.stunned = 2; floatText(e, 'EMP', 'stun'); });
    showNoise(x, y, g.radius);
    log('The EMP pops with a soft thud. Machines go dark.');
    for (const k of [...S.trips]) { const [tx, ty] = unkey(k); if (manh({ x: tx, y: ty }, { x, y }) <= g.radius + 1) { S.trips.delete(k); tileEl(tx, ty).classList.remove('trip'); } }
  } else if (id === 'flash') {
    near(g.radius, e => !immune(e, 'stun')).forEach(e => { e.stunned = 1; floatText(e, 'STUN', 'stun'); });
    showNoise(x, y, NOISE.gun);
    makeNoise(x, y, NOISE.gun, { x, y });
    log('The flashbang goes off with a bang that rattles your teeth.');
  } else if (id === 'fire') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dy) <= 1) ignite(x + dx, y + dy);
    makeNoise(x, y, NOISE.shape, { x, y });
    log('The incendiary bursts into flame.');
  } else if (id === 'noise') {
    showNoise(x, y, 6);
    makeNoise(x, y, 6, { x, y });
    log(`The noise maker clatters in the ${areaName(x, y)}.`);
  } else if (id === 'breach') {
    if (doorAt(x, y)) hitDoor({ x, y }, { breach: true }); else blowWall(x, y);
  }
  render();
  if (S.player.hp > 0 && !S.enemies.some(isHostile)) roomCleared();
}

// ---------- Vending machines ----------
// Creds buy potions. Buying takes no card and no move.
const VENDING_STOCK = [
  { item: 'stim',     name: 'Healing stim',   price: 12 },
  { item: 'speed',    name: 'Speed serum',    price: 18 },
  { item: 'strength', name: 'Strength serum', price: 18 },
  ...Object.entries(GADGETS).map(([item, g]) => ({ item, name: g.name, price: g.price })),
];

function openShop() {
  const rows = VENDING_STOCK.map(v => `<button data-act="buy-${v.item}" ${run.creds < v.price ? 'disabled' : ''}>${v.name}: ¥${v.price}</button>`).join('');
  showModal('Vending machine', `You have ¥${fmtMove(run.creds)}. The machine hums. One of the slots holds something that blinks back at you.`,
    [['closeread', 'Done']], `<div class="shop">${rows}<button class="gacha" data-act="gacha" ${run.creds < GACHA_PRICE ? 'disabled' : ''}>The blinking slot: ¥${GACHA_PRICE}, something random</button></div>`);
}

function gacha() {
  if (run.creds < GACHA_PRICE) return;
  run.creds -= GACHA_PRICE;
  const r = Math.random();
  log('You feed the blinking slot. It thinks about it.');
  giveLoot(r < 0.5 ? randomGadget() : r < 0.85 ? randomPotion() : 'creds', S.player, 'from the blinking slot', '');
  openShop();
}

function buy(item) {
  const v = VENDING_STOCK.find(s => s.item === item);
  if (!v || run.creds < v.price) return;
  run.creds -= v.price;
  if (GADGETS[item]) giveGadget(item, S.player, 'from the vending machine'); else givePotion(item, S.player, 'from the vending machine');
  openShop();
}

// ---------- Codes, safes and floor plans ----------
// Each floor hides, in its desks and cabinets: the code of every safe and keypad door, and one floor plan.
const randomCode = () => String(1000 + Math.floor(Math.random() * 9000));

// Rough location on the floor, for clues like "the safe in the north-east".
function areaName(x, y) {
  const ns = y < S.h / 3 ? 'north' : y > S.h * 2 / 3 ? 'south' : '';
  const ew = x < S.w / 3 ? 'west' : x > S.w * 2 / 3 ? 'east' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew || 'middle';
}

// Furniture you can actually stand next to (some get boxed in by other furniture).
const standable = k => { const [x, y] = unkey(k); return DIRS.some(([dx, dy]) => !S.walls[y + dy][x + dx]); };

function hideClues() {
  const clues = [];
  for (const [k, f] of S.furn) if (f.kind === 'safe') {
    const area = areaName(...unkey(k));
    clues.push({ kind: 'code', label: `Safe (${area})`, code: f.code,
      mail: { from: 'Facilities', subject: 'Safe combination changed', body: `The combination for the wall safe in the ${area} of this floor is now ${f.code}. Memorise it and delete this message.` },
      note: { title: 'Sticky note', body: `safe, ${area} side: ${f.code}` } });
  }
  for (const [k, code] of S.codeDoors) {
    if (clues.some(c => c.code === code)) continue;
    const area = areaName(...unkey(k));
    clues.push({ kind: 'code', label: `Door (${area})`, code,
      mail: { from: 'Security', subject: 'Storeroom keypad reset', body: `The keypad on the storeroom door in the ${area} of this floor has been reset to ${code}. Do not share it with contractors.` },
      note: { title: 'Torn memo', body: `...the storeroom door (${area}) now opens with ${code}. Shred after reading.` } });
  }
  clues.push({ kind: 'plan',
    mail: { from: 'Facilities', subject: 'Updated floor plan', body: 'Attached: the current floor plan for this level, including the new partitions. (The floor plan is now on your map.)' },
    note: { title: 'Fire evacuation plan', body: 'A laminated plan of the whole floor, every room and door marked in red. (The floor plan is now on your map.)' } });
  const spots = [...S.furn].filter(([k, f]) => (f.kind === 'desk' || f.kind === 'cabinet') && standable(k)).map(([, f]) => f).sort(() => Math.random() - 0.5);
  clues.forEach((c, i) => {
    const f = spots[i];
    if (!f) return;
    f.clue = { ...c, text: f.kind === 'desk' ? c.mail : c.note };
    f.loot = null;
  });
}

function learnClue(c) {
  if (c.kind === 'plan') {
    S.planned = true;
    log('You study the floor plan. The whole layout is now on your map.');
    toast('Floor plan found: the layout is on your map.');
    renderOverlays(); drawMinimap();
  } else {
    if (!S.codes.some(k => k.code === c.code)) S.codes.push({ label: c.label, code: c.code });
    log(`You note down a code: <b>${c.label} — ${c.code}</b>.`);
  }
  renderSide();
}

// The keypad on a safe or a keypad door. Codes you've found are offered as buttons.
function openKeypad(type, x, y) {
  const P = S.player;
  if (Math.abs(P.x - x) + Math.abs(P.y - y) !== 1) { toast(`Get next to the ${type === 'safe' ? 'safe' : 'keypad door'}.`); return; }
  S.keypad = { type, x, y };
  const known = S.codes.map(c => `<button data-act="keypad-fill" data-code="${c.code}">${c.label}: ${c.code}</button>`).join(' ');
  showModal(type === 'safe' ? 'Wall safe' : 'Keypad door', 'Enter the 4-digit code.', [['keypad-enter', 'Enter'], ['closeread', 'Cancel']],
    `<input id="keypad" class="keypad" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="Code">
     ${known ? `<div class="known-codes">${known}</div>` : '<p class="keypad-hint">You haven\'t found any codes yet. Search desks and cabinets.</p>'}`);
  setTimeout(() => $('#keypad') && $('#keypad').focus(), 0);
}

function enterCode() {
  const kp = S.keypad, input = $('#keypad');
  if (!kp || !input) return;
  const k = key(kp.x, kp.y);
  const right = kp.type === 'safe' ? S.furn.get(k).code : S.codeDoors.get(k);
  if (input.value.trim() !== right) {
    input.value = '';
    input.classList.remove('wrong'); void input.offsetWidth; input.classList.add('wrong');
    return;
  }
  $('#modal').hidden = true;
  S.keypad = null;
  if (kp.type === 'safe') {
    S.furn.get(k).opened = true;
    tileEl(kp.x, kp.y).classList.add('searched');
    log('The safe clicks open.');
    safeLoot(kp);
  } else {
    S.codeDoors.delete(k);
    log('The keypad beeps twice. The door unlocks.');
    renderCodeDoors(); renderUnits(); renderOverlays();
  }
  renderSide();
}

// What a safe holds: creds, and either an implant to install or a gun to swap.
function safeLoot(at) {
  {
    const imp = Object.keys(IMPLANTS).filter(id => !hasImplant(id));
    if (!imp.length || Math.random() >= SAFE_IMPLANT_CHANCE) {
      // A gun in the safe: it goes on the floor where you stand, and you're asked whether to swap.
      const pk = key(S.player.x, S.player.y), id = randomGun();
      S.drops.set(pk, 'gun-' + id); renderDrops();
      log(`There is a <b>${GUNS[id].name}</b> in the safe.`);
      setTimeout(() => offerGun(id, pk), 0);
    } else if (imp.length) {
      const id = imp[Math.floor(Math.random() * imp.length)];
      setTimeout(() => showModal('An implant in the safe', `Sealed in a sterile case: <b>${IMPLANTS[id].name}</b>. ${IMPLANTS[id].text} It goes in your ${partName(IMPLANTS[id].part)}.${implantWarn(id)}`,
        [['install-' + id, 'Install it'], ['closeread', 'Leave it']]), 0);
    }
    giveLoot('creds', at, 'from the safe', '');
    giveLoot(Math.random() < 0.5 ? 'gunmod' : 'card', at, 'from the safe', '');
  }
}

function renderCodeDoors() {
  for (const t of $('#board').querySelectorAll('.tile.codedoor')) t.classList.remove('codedoor');
  for (const k of S.codeDoors.keys()) tileEl(...unkey(k)).classList.add('codedoor');
}

// Floors are generated the first time you reach them, using this run's seed and the Head's response to how
// you played the floor before: more guards for killers, more cameras for ghosts, emptier drawers for thieves.
function floorMap(idx) {
  if (!run.maps[idx]) {
    const fl = { ...FLOORS[idx], runSeed: run.seed };
    if (run.adapt === 'killer') { fl.guards += 2; fl.mix += 'e'; }
    if (run.adapt === 'ghost') fl.cameras += 3;
    if (run.adapt === 'thief') fl.lootChance *= 0.5;
    run.maps[idx] = generateFloor(fl);
  }
  return run.maps[idx];
}

// Start of a run: fresh deck and loot, then floor 1.
function newRun() {
  run = { char: { ...OPERATIVE, move: OPERATIVE.move + (hasEcho('limb') ? 1 : 0) }, creds: START_CREDS, stims: hasEcho('saint') ? 2 : 0, speed: 0, strength: 0, gun: START_GUN, mods: {}, maxHp: MAX_HP,
    seed: Math.floor(Math.random() * 1e6), maps: [], adapt: null, story: [], floorStats: [],
    gear: {}, implants: [], defects: [], notes: [], items: {} };
  godCreds();
  deck = startingDeck(OPERATIVE);
  loadRoom(0);
}

function loadRoom(idx) {
  const rows = floorMap(idx);
  // Every floor starts with exactly DECK_SIZE cards: with more, you first pick which ones to take along.
  if (deck.length > DECK_SIZE) return chooseKeep(idx);
  S = {
    room: idx, w: rows[0].length, h: rows.length, walls: [], enemies: [], player: null,
    cards: deck.map(c => ({ ...c, used: false })), burned: 0, playing: null,
    round: 0, phase: 'turn', sel: null, act: null,
    preview: null, hoverDir: null, busy: false, log: [],
    doors: new Map(), keyDoors: new Set(), codeDoors: new Map(), codes: [], planned: false, keypad: null, props: new Set(), vats: new Map(), drops: new Map(), corpses: new Map(), breakable: BREAKABLES[FLOORS[idx].theme], loot: new Map(), furn: new Map(), seen: new Set(), vis: new Set(), cam: { x: 0, y: 0 }, fast: false, buff: { speed: 0, strength: 0 },
    grates: new Set(), ducts: new Set(rows.ducts || []), ductSeen: new Set(), inDuct: false, backrooms: new Set(), circles: new Set(), trips: new Set(), disguise: null, liquids: new Map(), fire: new Map(), camLoop: 0, shp: new Map(), openDoors: new Set(),
    alarm: 0, reinforceIn: 0, adapt: run.adapt, noiseBonus: run.adapt === 'loud' ? 1 : 0, familiar: hasEcho('staff'), stats: { kills: 0, takedowns: 0, alerts: 0, cameras: 0, alarm: 0, pickpockets: 0, smashed: 0, hacks: 0, loot: 0 },
  };
  let n = 0;
  const doorCode = randomCode();
  rows.forEach((row, y) => {
    S.walls.push([...row].map((c, x) => {
      if (c === 'P') S.player = { id: 'p', x, y, hp: maxHpStat(), max: maxHpStat() };
      else if (c === 'X') S.exit = { x, y };
      else if (c === 'O') S.openDoors.add(key(x, y));
      else if (c === '+') S.doors.set(key(x, y), DOOR_HP_BY_FLOOR[idx] || DOOR_HP_BY_FLOOR[DOOR_HP_BY_FLOOR.length - 1]);
      else if (c === 'L') S.keyDoors.add(key(x, y));
      else if (c === 'C') S.codeDoors.set(key(x, y), doorCode);  // the keypad room's doors share one code
      else if (c === 'S') S.furn.set(key(x, y), { kind: 'safe', code: randomCode(), opened: false });
      else if (c === 'V') S.furn.set(key(x, y), { kind: 'vending' });
      else if (c === 'T') S.furn.set(key(x, y), { kind: 'terminal', done: new Set(), firewall: run.adapt === 'hacker' });
      else if (c === 'G') S.grates.add(key(x, y));
      else if (c === 'b') S.backrooms.add(key(x, y));
      else if (c === 'r') S.circles.add(key(x, y));
      else if (c === 'A') S.furn.set(key(x, y), { kind: 'altar', used: false });
      else if (c === 'Z') S.furn.set(key(x, y), { kind: 'stairs' });
      else if (c === 'U') S.furn.set(key(x, y), { kind: 'husk' });
      else if (c === 'Q') S.furn.set(key(x, y), { kind: 'contact', used: false });
      else if (c === 'H') S.furn.set(key(x, y), { kind: 'phone', used: false });
      else if (c === 'w') S.trips.add(key(x, y));
      else if (c === 'K' || c === 'F') S.furn.set(key(x, y), makeFurniture(c === 'K' ? 'desk' : 'cabinet'));
      else if (c === 'o') {
        S.props.add(key(x, y));
        if (S.breakable) S.vats.set(key(x, y), S.breakable.hp);
      }
      else if (c === '$') S.loot.set(key(x, y), rollLoot(FLOORS[idx].loot) || 'creds');
      else if (ENEMY_TYPES[c]) S.enemies.push({ id: 'e' + n++, kind: c, x, y, hp: ENEMY_TYPES[c].hp, max: ENEMY_TYPES[c].hp, intent: null, alerted: false, facing: [0, 1] });
      return c === '#' || 'oKFSVTGAZQHU'.includes(c);
    }));
  });
  S.nextId = n;
  if (hasDefect('misfire')) { const c = S.cards[Math.floor(Math.random() * S.cards.length)]; c.used = true; run.notes.push(`Misfire: <b>${c.name}</b> starts this floor used.`); }
  S.enemies.forEach(initFacing);
  // Keycard floors: about a third of the staff carry a keycard (at least 2). Any one of them will do.
  S.needKey = KEYCARD_FLOORS.has(idx); S.hasKey = false;
  // Several staff carry a keycard (2 or 3, fewer if the floor has fewer people). Any one of them will do.
  if (S.needKey) S.enemies.filter(e => !isCamera(e)).sort(() => Math.random() - 0.5).slice(0, Math.max(2, Math.floor(S.enemies.filter(e => !isCamera(e)).length / 3)) + (Math.random() < 0.5 ? 1 : 0)).forEach(e => { e.hasKey = true; });
  hideClues();
  hideStory(idx);
  // Echoes from earlier runs.
  if (hasEcho('plan')) S.planned = true;
  if (hasEcho('deja')) { const c = [...S.furn.values()].find(f => f.clue && f.clue.kind === 'code'); if (c) S.codes.push({ label: c.clue.label, code: c.clue.code }); }
  buildBoard();
  run.notes.splice(0).forEach(log);
  if (S.adapt) log(`<i>The Head: ${CORP_AI_RESPONSES[S.adapt]}</i>`);
  if (S.needKey) log(`The lift is behind keycard doors. ${S.enemies.filter(e => e.hasKey).length} people here carry a keycard (marked KEY): pickpocket one, or take one down and search the body.`);
  startRound();
}

// Pick exactly DECK_SIZE cards to take onto floor `idx`; the rest are dropped for good.
// Starts with a suggestion: everything except your weakest attack cards (basic Shock Batons first).
function chooseKeep(idx) {
  const byWeakness = deck.filter(c => cardMaxDmg(c) > 0).sort((a, b) => cardMaxDmg(a) - cardMaxDmg(b) || a.id - b.id);
  const keep = new Set(deck);
  for (const c of byWeakness) if (keep.size > DECK_SIZE) keep.delete(c);
  const m = $('#modal');
  const draw = () => {
    m.innerHTML = `<div class="box wide"><h2>Pack for floor ${idx + 1}</h2>
      <p>You can take <b>${DECK_SIZE}</b> cards onto ${FLOORS[idx].name}. Click cards to keep or drop them. Dropped cards are gone for good.</p>
      <div class="keep-grid">${deck.map((c, i) => `<div class="card ${keep.has(c) ? 'sel' : 'dropped'}" data-keep="${i}">${cardHTML(c)}</div>`).join('')}</div>
      <p class="keep-count">${keep.size} / ${DECK_SIZE} kept</p>
      <button class="primary" data-act="keepdone" ${keep.size === DECK_SIZE ? '' : 'disabled'}>Start floor ${idx + 1}</button></div>`;
    m.querySelectorAll('[data-keep]').forEach(el => el.onclick = () => {
      const c = deck[+el.dataset.keep];
      if (keep.has(c)) keep.delete(c); else if (keep.size < DECK_SIZE) keep.add(c);
      draw();
    });
    m.querySelector('[data-act="keepdone"]').onclick = e => {
      e.stopPropagation();
      const dropped = deck.filter(c => !keep.has(c)).map(c => c.name);
      deck = deck.filter(c => keep.has(c));
      m.hidden = true;
      loadRoom(idx);
      log(`You left behind <b>${dropped.join(', ')}</b>.`);
      renderSide();
    };
  };
  draw();
  m.hidden = false;
}

function startRound() {
  if (!S.cards.length) { render(); return gameOver('You burned through every card.'); }
  S.round++;
  for (const e of S.enemies) {
    e.fresh = false;
    if (e.alerted) rollIntent(e); else e.intent = null;
  }
  // A turn: use one card (click it, then click its target) and move (click a blue tile), in any order.
  S.phase = 'turn'; S.sel = null; S.playing = null; S.preview = null; S.hoverDir = null;
  S.hidden = false; S.ghost = false; S.throwing = null;
  if (S.regen > 0) { S.regen--; heal(1); }
  if (S.camLoop > 0 && --S.camLoop === 0) log('The camera loop runs out. The cameras are watching again.');
  // move = steps left this turn (you can split them over several clicks), steps = steps taken so far.
  S.act = { atk: null, move: godMode ? Infinity : moveStat() + serumBonus('speed'), atkUsed: false, mvUsed: false, steps: 0 };
  // God mode: an empty hand just comes back.
  if (godMode && !S.cards.some(c => !c.used)) { S.cards.forEach(c => { c.used = false; }); log('God mode: your cards come back.'); }
  // No ready cards left: this turn has to be a rest (no moving, no way out of it).
  S.forcedRest = !S.cards.some(c => !c.used);
  if (S.forcedRest) {
    S.phase = 'burn';
    toast('Out of cards: you have to rest. Pick a card to burn.');
  }
  render();
}

// During a turn, clicking a ready card picks it as this turn's card (click it again to put it back).
// Self cards (heals, sprint) take effect at once. While resting, clicking picks the card to burn.
// Clicking one half of a ready card picks that half as this turn's action (click it again to put it back).
function pickCard(card, half = 0) {
  if (S.busy) return;
  if (S.phase === 'burn') { S.sel = S.sel === card ? null : card; renderHand(); renderBar(); return; }
  if (S.phase !== 'turn' || card.used || S.act.atkUsed) return;
  S.hoverDir = null; S.preview = null;
  if (S.playing === card && S.half === half) { S.playing = null; S.act.atk = null; return render(); }
  S.playing = card; S.half = half; S.act.atk = resolveAction(card.halves[half].action);
  if (S.act.atk.type === 'self') return useSelf();
  render();
}
// A half's action as played: Shoot halves become your gun's shot.
const gunMods = id => (run.mods && run.mods[id]) || 0;
const gunName = id => GUNS[id].name + (gunMods(id) ? ` +${gunMods(id)}` : '');
function gunAction(id) {
  const g = GUNS[id].action, m = gunMods(id), out = { ...g };
  if (m) { if (g.dmg > 0) out.dmg = g.dmg + m; else if (g.stun) out.stun = g.stun + m; }
  if (out.range && hasImplant('optic')) out.range += 2;
  return out;
}
const resolveAction = a => a.type === 'gun' ? gunAction(run.gun) : a;
const halfName = h => h.action.type === 'gun' ? gunName(run.gun) : h.name;
// The half you're playing this turn ({ name, action }).
const playedHalf = () => S.playing && S.playing.halves[S.half];
const cardMaxDmg = c => Math.max(...c.halves.map(h => resolveAction(h.action).dmg || 0));

// Resting replaces the whole turn, so it's only possible before you've moved or used a card.
function startRest() {
  const a = S.act;
  if (godMode) return godRest();
  if (S.phase !== 'turn' || S.busy || a.steps || a.atkUsed || !S.cards.some(c => c.used)) return;
  S.phase = 'burn'; S.sel = null; S.preview = null; S.playing = null; a.atk = null;
  render();
}

// God mode rest: any time, nothing burned. It still takes the turn (the enemies act).
async function godRest() {
  if (S.phase !== 'turn' || S.busy) return;
  S.playing = null; S.act.atk = null; S.preview = null;
  S.cards.forEach(x => { x.used = false; });
  tickSerums();
  log('You rest. God mode: nothing is burned.');
  await runEnemyPhase();
}

function toggleGod() {
  godMode = !godMode;
  document.body.classList.toggle('god', godMode);
  const b = document.querySelector('[data-act="god"]');
  if (b) b.textContent = godMode ? 'God mode: on' : 'God mode: off';
  godCreds();
  if (S && S.act && S.phase === 'turn') { S.act.move = godMode ? Infinity : Math.max(0, moveStat() + serumBonus('speed') - S.act.steps); S.act.mvUsed = S.act.move <= 0; }
  toast(godMode ? 'God mode on: walk anywhere, rest any time without burning cards, infinite creds.' : 'God mode off.');
  render();
}

// Resting takes the whole turn: burn the chosen card for good, every other card is ready again.
async function confirmRest() {
  const c = S.sel;
  if (S.phase !== 'burn' || !c) return;
  S.cards = S.cards.filter(x => x !== c);
  S.cards.forEach(x => { x.used = false; });
  S.burned++;
  S.hidden = hasImplant('chameleon');
  if (hasDefect('deathdrive') && S.player.hp > 1) { S.player.hp--; log('Death Drive: resting costs you 1 HP.'); }
  tickSerums();
  log(`You rest. <b>${c.name}</b> is burned.`);
  toast(`Rested — <b>${c.name}</b> burned for good.`);
  await runEnemyPhase();
}

// Synaptic Accelerator: once per floor, after using this turn's card, spend it and pick another.
const canOverdrive = () => hasImplant('accel') && !S.accelUsed && S.phase === 'turn' && !S.busy && S.act.atkUsed && S.playing && S.cards.some(c => !c.used && c !== S.playing);
function overdrive() {
  if (!canOverdrive()) return;
  S.accelUsed = true;
  S.playing.used = true; S.playing = null;
  S.act.atk = null; S.act.atkUsed = false;
  floatText(S.player, 'OVERDRIVE', 'stun');
  log('Overdrive. The world slows; you pick another card.');
  render();
}

// Self actions have no target, so they resolve as soon as you pick them.
function useSelf() {
  const a = S.act, s = a.atk;
  if (s.heal) heal(s.heal);
  if (s.ghost) { S.ghost = true; floatText(S.player, 'VANISH', 'stun'); log('Ghost Protocol: cameras and anyone who hasn\'t spotted you lose you until your next turn.'); }
  if (s.move) {
    const n = cardMove(s);
    a.move = Math.max(0, a.move) + n; a.mvUsed = false;
    log(`You get ${n} extra move.`);
  }
  a.atkUsed = true;
  nextAction();
}

// Something this card can affect on that tile: an enemy, a door, or a breakable vat.
const hasTarget = (s, t) => s.type === 'hack' ? !!hackTargetAt(t.x, t.y) : s.bribe ? !!(enemyAt(t.x, t.y) && canBribe(enemyAt(t.x, t.y))) : (s.type === 'point' && !isWall(t.x, t.y)) || (s.breach && breakableWall(t.x, t.y)) || (s.push && enemyAt(t.x, t.y)) || (!s.pick && !s.breach && enemyAt(t.x, t.y)) || (canHitDoor(s) && doorAt(t.x, t.y)) || (s.dmg > 0 && smashable(t.x, t.y));

function structureKind(x, y) {
  const k = key(x, y);
  if (S.keyDoors.has(k)) return 'keydoor';
  if (S.codeDoors.has(k)) return 'codedoor';
  const f = S.furn.get(k);
  if (f) return STRUCTURE_HP[f.kind] ? f.kind : null;
  return breakableWall(x, y) ? 'wall' : null;
}
const smashable = (x, y) => doorAt(x, y) || vatAt(x, y) || !!structureKind(x, y);
const breakableWall = (x, y) => x > 0 && y > 0 && x < S.w - 1 && y < S.h - 1 && S.walls[y][x] && !S.props.has(key(x, y)) && !S.furn.has(key(x, y)) && !S.grates.has(key(x, y));

// The tiles a click on (x, y) would hit with the picked card, or null if that click isn't a use of it.
function attackHit(s, x, y) {
  if (S.inDuct) return null;  // nothing to hit from inside a duct
  const P = S.player, inTiles = tiles => tiles.some(t => t.x === x && t.y === y);
  if (isDirectional(s)) {
    const d = dirTo(x, y), tiles = d && atkTiles(s, P, d);
    return tiles && inTiles(tiles) && tiles.some(t => hasTarget(s, t)) ? tiles : null;
  }
  const tiles = atkTiles(s, P);
  if (!inTiles(tiles)) return null;
  const hit = s.type === 'shape' ? tiles : [{ x, y }];
  return hit.some(t => hasTarget(s, t)) ? hit : null;
}

// ---------- Player actions ----------
// A click on the board uses the picked card if it lands on something the card can hit; otherwise it moves.
async function onTileClick(x, y) {
  if (S.busy || S.phase !== 'turn') return;
  const a = S.act, P = S.player;
  if (S.throwing) return throwAt(x, y);
  if (S.inDuct) return ductClick(x, y);
  if (a.atk && !a.atkUsed && (a.atk.type === 'hack' || a.atk.bribe || (a.atk.dmg > 0 && structureKind(x, y)))) { const hit = attackHit(a.atk, x, y); if (hit) return useAttack(hit); }
  if (S.furn.has(key(x, y))) return searchFurniture(x, y);
  if (S.grates.has(key(x, y))) return enterDuct(x, y);
  if (S.keyDoors.has(key(x, y))) return swipeKeycard(x, y);
  if (S.codeDoors.has(key(x, y))) return openKeypad("door", x, y);
  if (a.atk && !a.atkUsed) {
    const hit = attackHit(a.atk, x, y);
    if (hit) return useAttack(hit);
  }
  if (!a.mvUsed) {
    // Moves go around tripwires you have seen when they can, and through them when there is no other way.
    S.tripOk = S.trips.has(key(x, y));
    let { dist, prev } = moveReach(a.move);
    if (!dist.has(key(x, y))) { S.tripOk = true; ({ dist, prev } = moveReach(a.move)); }
    S.tripOk = false;
    if (!dist.has(key(x, y)) || (x === P.x && y === P.y)) {
      if (a.atk && !a.atkUsed && atkTiles(a.atk, P).some(t => t.x === x && t.y === y)) toast('Nothing to hit there.');
      return;
    }
    S.busy = true; renderOverlays();
    const path = pathTo(prev, P.x, P.y, x, y);
    await walk(P, path);
    a.move -= path.length; a.steps += path.length;
    a.mvUsed = a.move <= 0;
    // Running (RUN_STEPS or more in one turn) makes footstep noise, once per turn.
    if (a.steps >= RUN_STEPS && !a.ran && !hasGear('gelsoles')) { a.ran = true; makeNoise(P.x, P.y, NOISE.run, P); }
    S.busy = false;
    if (P.x === S.exit.x && P.y === S.exit.y) {
      log('You take the lift up.');
      return roomCleared();
    }
    nextAction();
  }
}

async function useAttack(hit) {
  const a = S.act, P = S.player;
  let s = a.atk;
  // Halves that cost creds (Coin Toss): no money, no play.
  if (s.price) {
    if (run.creds < s.price) { toast(`You need ¥${s.price}. You have ¥${fmtMove(run.creds)}.`); return; }
    run.creds -= s.price;
  }
  if (s.type === 'hack') { S.busy = true; return hackAt(hit[0]); }
  if (s.bribe) return bribe(enemyAt(hit[0].x, hit[0].y));
  {
    if (s.dmg > 0) s = { ...s, dmg: s.dmg + (s.str ? strBonus() : 0) };
    const targets = hit.map(t => !s.pick && enemyAt(t.x, t.y)).filter(Boolean);
    const doors = hit.filter(t => canHitDoor(s) && doorAt(t.x, t.y));
    const vats = hit.filter(t => s.dmg > 0 && vatAt(t.x, t.y));
    const structs = hit.filter(t => s.dmg > 0 && structureKind(t.x, t.y));
    S.busy = true; renderOverlays();
    const first = targets[0] || doors[0] || vats[0] || structs[0] || hit[0];
    if (s.type === 'point' && s.ignite) { ignite(first.x, first.y); makeNoise(first.x, first.y, NOISE.shape, P); log('Incinerate: a jet of fire.'); }
    else if (s.type === 'point') { showNoise(first.x, first.y, s.noise); makeNoise(first.x, first.y, s.noise, first); log(`You toss a coin into the ${areaName(first.x, first.y)}.`); }
    else if (s.type === 'ranged') { sfx(s.silent || !s.dmg ? 'puff' : 'bang'); await shot(P, first); }
    else { if (s.dmg > 0) sfx('hit'); else if (s.stun) sfx('stun'); await lunge(P, first); }
    if (s.cost) { S.player.hp = Math.max(1, S.player.hp - s.cost); floatText(S.player, '-' + s.cost, 'dmg'); log(`You pay ${s.cost} HP in blood.`); }
    if (s.breach && !doors.length && breakableWall(first.x, first.y)) blowWall(first.x, first.y);
    for (const d of doors) hitDoor(d, s);
    for (const v of vats) hitVat(v, s);
    let rebuild = false;
    for (const st of structs) if (hitStructure(st, s)) rebuild = true;
    if (rebuild) { buildBoard(); render(); renderCorpses(); }
    for (const e of targets) {
      if (s.steal) pickpocket(e);
      if (s.push) await shove(e, [e.x - P.x, e.y - P.y], s.push);
      // A stun alone doesn't give you away: the enemy just loses its next turn (and can't see meanwhile).
      if (s.stun && immune(e, 'stun')) { floatText(e, 'IMMUNE', 'stun'); log(`${nameOf(e)} has no nerves to stun.`); }
      else if (s.stun) {
        e.stunned = s.stun;
        floatText(e, 'STUN', 'stun');
        log(`You stun ${nameOf(e)}.`);
      }
      if (!s.dmg) continue;
      const sneak = !e.alerted && !isCamera(e), dmg = rollDmg(s.dmg) * (sneak ? BACKSTAB_MULT : 1);
      e.wasUnaware = sneak;
      log(sneak ? `Backstab! You hit ${nameOf(e)} for ${dmg}.` : `You hit ${nameOf(e)} for ${dmg}.`);
      damage(e, dmg);
      if (!isCamera(e)) S.maskBlown = true;
      if (e.hp > 0 && s.str && hasGear('knuckles') && ENEMY_TYPES[e.kind].machine) { e.stunned = 1; floatText(e, 'STUN', 'stun'); }
      if (e.hp > 0) alertEnemy(e);
    }
    if ((s.dmg > 0 && targets.length) || (s.push && targets.length) || ((s.type === 'ranged' || s.gun) && s.dmg > 0 && !s.silent)) { S.violentRound = S.round; checkSight(); }
    if ((s.type === 'ranged' || s.gun) && s.dmg > 0 && !s.silent) for (const t of hit) if (FLAMMABLE.has(S.liquids.get(key(t.x, t.y)))) ignite(t.x, t.y);
    if (s.stun) for (const e of targets) if (S.liquids.get(key(e.x, e.y)) === 'blood')
      for (const o of S.enemies) if (o !== e && !o.stunned && manh(o, e) <= 2 && S.liquids.get(key(o.x, o.y)) === 'blood') { o.stunned = s.stun; floatText(o, 'ARC', 'stun'); log(`The charge arcs through the blood into ${nameOf(o)}.`); }
    // Noise: silenced shots, stuns and picks are quiet; a kill on someone who never saw you is a takedown.
    const dealt = s.dmg > 0 && (targets.length || doors.length || vats.length || structs.length);
    const takedown = targets.length && targets.every(e => e.hp <= 0 && e.wasUnaware);
    const loud = s.silent ? 0 : (s.type === 'ranged' || s.gun) && s.dmg > 0 ? NOISE.gun : !dealt ? 0
      : doors.length || vats.length || structs.length ? NOISE.smash : s.type === 'shape' ? NOISE.shape : takedown ? NOISE.takedown : NOISE.melee;
    if (takedown) S.stats.takedowns += targets.length;
    if (loud) makeNoise(P.x, P.y, loud, P);
    renderUnits(); renderOverlays();
    await sleep(350);
    a.atkUsed = true; S.busy = false;
    if (S.player.hp <= 0) return;
    if (!S.enemies.some(isHostile)) return roomCleared();
    nextAction();
  }
}

// Shove: push someone up to n tiles straight away from you. Hitting a wall, door or another body hurts (2).
// The heavy (enforcers, golems) don't budge.
async function shove(e, dir, n) {
  if (ENEMY_TYPES[e.kind].heavy || isCamera(e)) { log(`${nameOf(e)} doesn't budge.`); if (!isCamera(e)) alertEnemy(e); return; }
  let moved = 0;
  while (moved < n) {
    const x = e.x + dir[0], y = e.y + dir[1];
    if (isWall(x, y) || enemyAt(x, y) || (x === S.player.x && y === S.player.y)) break;
    e.x = x; e.y = y; moved++;
    renderUnits(); await pause(90);
  }
  log(`You shove ${nameOf(e)}${moved ? ` ${moved} tile${moved > 1 ? 's' : ''}` : ''}.`);
  if (moved < n) { log(`${nameOf(e)} slams into something.`); damage(e, 2); }
  makeNoise(e.x, e.y, NOISE.melee, S.player);
  if (e.hp > 0) alertEnemy(e);
}

// Breaching: the wall tile becomes floor. Loud, and the alarm rises.
// Hits a smashable structure. Returns true when it broke and the board needs rebuilding.
function hitStructure(t, s) {
  const kind = structureKind(t.x, t.y), k = key(t.x, t.y);
  if (!kind) return false;
  const dmg = rollDmg(s.dmg), hp = (S.shp.has(k) ? S.shp.get(k) : STRUCTURE_HP[kind]) - dmg;
  floatText(t, '-' + dmg, 'dmg');
  const name = { keydoor: 'keycard door', codedoor: 'keypad door', wall: 'wall', vending: 'vending machine', husk: 'droid husk' }[kind] || kind;
  if (hp > 0) { S.shp.set(k, hp); log(`You hit the ${name}.`); return false; }
  S.shp.delete(k);
  S.stats.smashed++;
  sfx('smash');
  if (kind === 'keydoor') { S.keyDoors.delete(k); log('You smash the keycard door off its rails.'); renderKeyDoors(); return false; }
  if (kind === 'codedoor') { S.codeDoors.delete(k); log('You smash the keypad door in.'); renderCodeDoors(); return false; }
  if (kind === 'wall') { S.walls[t.y][t.x] = false; log('You break through the wall.'); return true; }
  // Furniture: it spills what it held, then it's just floor.
  const f = S.furn.get(k);
  S.furn.delete(k);
  S.walls[t.y][t.x] = false;
  log(`You smash the ${name}.`);
  if ((f.kind === 'desk' || f.kind === 'cabinet') && !f.searched) {
    if (f.story) { run.story[S.room] = true; const doc = f.story; setTimeout(() => showModal('In the wreckage', 'A page survives.', [['closeread', 'Close']], doc.kind === 'email' ? `<div class="doc mail story"><div class="doc-head">From: ${doc.from}<br>Subject: ${doc.subject}</div><p>${doc.body}</p></div>` : `<div class="doc paper story">${doc.title ? `<div class="doc-head">${doc.title}</div>` : ''}<p>${doc.body}</p></div>`), 0); }
    if (f.clue) learnClue(f.clue);
    if (f.loot) giveLoot(f.loot, t, `from the broken ${name}`, '');
  }
  if (f.kind === 'safe' && !f.opened) safeLoot(t);
  if (f.kind === 'vending') { giveLoot(randomPotion(), t, 'from the broken machine', ''); giveLoot(randomGadget(), t, 'from the broken machine', ''); }
  if (f.kind === 'terminal') log('It dies in a shower of sparks. No more hacking that one.');
  return true;
}

function blowWall(x, y) {
  S.walls[y][x] = false;
  S.stats.smashed++;
  log('The wall blows apart in a cloud of plaster and rebar.');
  sfx('boom');
  buildBoard(); render(); renderCorpses();
  showNoise(x, y, NOISE_BREACH);
  makeNoise(x, y, NOISE_BREACH, S.player);
  raiseAlarm(1);
}

const canBribe = e => !e.alerted && !e.bribed && !isCamera(e) && !ENEMY_TYPES[e.kind].machine && !ENEMY_TYPES[e.kind].heavy && !ENEMY_TYPES[e.kind].daemon;

// The Bribe half: someone next to you who hasn't spotted you takes BRIBE_PRICE and never saw you.
function bribe(e) {
  if (!e || !canBribe(e)) return;
  if (run.creds < BRIBE_PRICE) { toast(`A bribe costs ¥${BRIBE_PRICE}. You have ¥${fmtMove(run.creds)}.`); return; }
  run.creds -= BRIBE_PRICE;
  e.bribed = true;
  floatText(e, '¥', 'stun');
  log(`You fold ¥${BRIBE_PRICE} into ${nameOf(e)}'s hand. They look the other way for the rest of the shift.`);
  S.act.atkUsed = true;
  render();
}

function offerBribe(e) {
  S.bribeTarget = e;
  showModal(`Bribe the ${ENEMY_TYPES[e.kind].name.toLowerCase()}?`, `¥${BRIBE_PRICE} and they never saw you. You have ¥${fmtMove(run.creds)}.`,
    [['bribe', 'Pay'], ['closeread', 'Leave it']]);
  if (run.creds < BRIBE_PRICE) $('#modal [data-act="bribe"]').disabled = true;
}

function payBribe() {
  const e = S.bribeTarget;
  $('#modal').hidden = true;
  if (!e || run.creds < BRIBE_PRICE || !canBribe(e)) return;
  run.creds -= BRIBE_PRICE;
  e.bribed = true;
  floatText(e, '¥', 'stun');
  log(`You fold ¥${BRIBE_PRICE} into ${nameOf(e)}'s hand. They look the other way for the rest of the shift.`);
  render();
}

// Robbing an enemy that hasn't spotted you: the keycard carrier always gives up the keycard; anyone else
// rolls on LOOT_ODDS. Each enemy can only be robbed once, and it doesn't notice.
const THIEF_ODDS = { card: 0.2, creds: 0.45, potion: 0.35 };
function pickpocket(e) {
  if (isCamera(e)) { toast('A camera has no pockets.'); return; }
  if (e.alerted || e.robbed) {
    log(`${nameOf(e)} ${e.robbed ? 'has nothing left to take' : 'is watching you'}. Pickpocket fails.`);
    toast(e.robbed ? 'Already robbed.' : 'Pickpocket only works on enemies that haven\'t spotted you.');
    return;
  }
  e.robbed = true;
  S.stats.pickpockets++;
  if (e.hasKey && !S.hasKey) return takeKey(e);
  grantLoot(e, hasGear('thiefgloves') ? THIEF_ODDS : LOOT_ODDS, `from ${nameOf(e)}`, `${nameOf(e)}'s pockets are empty.`);
}

// The three potions are always equally likely: healing stim, speed serum, strength serum.
const POTIONS = ['stim', 'speed', 'strength'];
const randomPotion = () => POTIONS[Math.floor(Math.random() * POTIONS.length)];

function givePotion(kind, at, from) {
  sfx('pickup');
  if (kind === 'stim') {
    run.stims++;
    floatText(at, '+STIM', 'heal');
    log(`You take a <b>healing stim</b> ${from}. Use it from the panel on the right: it heals 1 a turn for ${STIM_TURNS} turns.`);
  } else {
    const sv = SERUMS[kind];
    run[kind]++;
    floatText(at, '+SERUM', 'heal');
    log(`You take a <b>${sv.name}</b> ${from}: +${sv.bonus} ${sv.desc} for ${sv.turns} turns. Use it from the panel on the right.`);
  }
  renderSide();
}

// Rolls odds {card, creds, potion}: returns 'card', 'gunmod', 'creds', one of POTIONS or gadgets, or null (nothing).
// `earned` = pockets, bodies, safes: there the card share pays out as a card or a gun mod. Elsewhere it's creds.
function rollLoot(odds, earned) {
  let roll = Math.random();
  if (roll < odds.card) return earned ? (Math.random() < GUNMOD_SHARE ? 'gunmod' : 'card') : 'creds';
  roll -= odds.card;
  if (roll < odds.creds) return 'creds';
  roll -= odds.creds;
  return roll < odds.potion ? (Math.random() < GADGET_SHARE ? randomGadget() : randomPotion()) : null;
}

// Gives one loot result. `at` is where the pop-up text appears; `from` finishes the log line
// ("from Ganger", "from a medicine cabinet").
function giveLoot(what, at, from, emptyMsg) {  // (what may be upgraded below)
  if (what) { S.stats.loot++; sfx('pickup'); }
  const owned = new Set(deck.map(c => c.id)), pool = REWARD_CARDS.filter(c => !owned.has(c.id));
  if (what === 'gunmod' && gunMods(run.gun) >= GUN_MOD_MAX) what = pool.length ? 'card' : 'creds';
  if (what === 'card' && pool.length) {
    const card = pool[Math.floor(Math.random() * pool.length)];
    deck = [...deck, card];
    S.cards.push({ ...card, used: false });
    floatText(at, '+CARD', 'stun');
    log(`You take a card ${from}: <b>${card.name}</b>.`);
    toast(`New card: <b>${card.name}</b>. It's yours for the run.`);
    renderHand();
  } else if (what === 'gunmod') {
    run.mods[run.gun] = gunMods(run.gun) + 1;
    floatText(at, '+MOD', 'stun');
    log(`You take a gun mod ${from} and fit it to your ${GUNS[run.gun].name}: now <b>${gunName(run.gun)}</b>.`);
    renderHand();
  } else if (what === 'card' || what === 'creds') {
    const n = 5 + Math.floor(Math.random() * 11);
    run.creds += n;
    floatText(at, `+¥${n}`, 'stun');
    log(`You take ¥${n} creds ${from}.`);
  } else if (GADGETS[what]) {
    giveGadget(what, at, from);
  } else if (POTIONS.includes(what)) {
    givePotion(what, at, from);
  } else {
    floatText(at, 'EMPTY', 'stun');
    log(emptyMsg);
  }
  renderSide();
}

const grantLoot = (at, odds, from, emptyMsg) => giveLoot(rollLoot(odds, true), at, from, emptyMsg);

// Each room cache's contents are decided when the floor loads, so its icon shows what's inside.
// Walking onto it takes it.
function openCache(x, y) {
  const what = S.loot.get(key(x, y));
  S.loot.delete(key(x, y));
  renderLoot();
  giveLoot(what, { x, y }, `from ${FLOORS[S.room].cache}`, '');
}

function useStim() {
  if (!run.stims || S.busy || S.phase !== 'turn') return;
  run.stims--;
  // A second stim while one is working adds its turns.
  S.regen = (S.regen || 0) + STIM_TURNS - 1;
  heal(1);
  renderSide();
}

// Extra Strength: the serum while it lasts, and Myomer Fibres.
const strBonus = () => serumBonus('strength') + (hasImplant('myomer') ? 1 : 0);
const serumBonus = kind => S.buff[kind] > 0 ? SERUMS[kind].bonus : 0;

// Drinking a serum counts this turn as the first of its turns; a second dose adds more turns.
function useSerum(kind) {
  if (!run[kind] || S.busy || S.phase !== 'turn') return;
  const sv = SERUMS[kind], wasActive = S.buff[kind] > 0;
  run[kind]--;
  S.buff[kind] += sv.turns;
  // Already mid-turn with the move still unused: the extra steps apply right away.
  if (kind === 'speed' && !wasActive && S.phase === 'turn' && !S.act.mvUsed) S.act.move += sv.bonus;  // only while steps are left
  floatText(S.player, `+${sv.bonus} ${sv.desc.toUpperCase()}`, 'heal');
  log(`You inject a <b>${sv.name}</b>: +${sv.bonus} ${sv.desc} for ${S.buff[kind]} turns.`);
  render();
}

// Called at the end of each of your turns (playing a card or resting).
function tickSerums() {
  for (const kind in S.buff) {
    if (S.buff[kind] > 0 && --S.buff[kind] === 0) log(`Your <b>${SERUMS[kind].name}</b> wears off.`);
  }
}

// Damaging attacks chip at doors; Lockpick opens one outright. Stuns and pickpockets don't affect doors.
const canHitDoor = s => s.dmg > 0 || !!s.pick || !!s.breach;

function hitVat(t, s) {
  const k = key(t.x, t.y), b = S.breakable, dmg = rollDmg(s.dmg), hp = S.vats.get(k) - dmg;
  floatText(t, '-' + dmg, 'dmg');
  if (hp > 0) {
    S.vats.set(k, hp);
    log(`You hit the ${b.name} for ${dmg} (${hp} left).`);
  } else {
    // Smashed: the tile becomes open floor with the pickup lying on it.
    S.vats.delete(k); S.props.delete(k); S.walls[t.y][t.x] = false;
    S.stats.smashed++;
    const el = tileEl(t.x, t.y);
    el.classList.remove('prop', 'vat');
    el.innerHTML = '';
    S.drops.set(k, b.drop === 'potion' ? randomPotion() : b.drop === 'gun' ? 'gun-' + randomGun() : b.drop);
    if (S.room === 0) { S.liquids.set(k, 'chem'); DIRS.forEach(([dx, dy]) => { if (!isWall(t.x + dx, t.y + dy) && Math.random() < 0.5) S.liquids.set(key(t.x + dx, t.y + dy), 'chem'); }); renderLiquids(); }
    log(`The ${b.name} breaks open. Something ${b.drop === 'potion' ? 'glints' : 'clatters'} on the floor: walk over it to take it.`);
    renderDrops();
  }
  renderVats(); renderOverlays(); renderSide();
}

// Walking onto a dropped pickup takes it.
function takeDrop(x, y) {
  const k = key(x, y), what = S.drops.get(k);
  if (what.startsWith('gun-')) return offerGun(what.slice(4), k);
  S.drops.delete(k);
  renderDrops();
  if (POTIONS.includes(what)) givePotion(what, { x, y }, 'off the floor');
  renderSide();
}

// A gun you haven't got (crates and safes), or any gun but yours.
const randomGun = () => { const ids = Object.keys(GUNS).filter(id => id !== run.gun && id !== START_GUN); return ids[Math.floor(Math.random() * ids.length)]; };

// Standing on a gun: swap it for yours, or leave it. The gun you put down stays on that tile.
function offerGun(id, k) {
  S.gunOffer = { id, k };
  const g = GUNS[id], mine = GUNS[run.gun];
  showModal(gunName(id), `${g.text}${gunMods(id) ? ` It carries ${gunMods(id)} mod${gunMods(id) > 1 ? 's' : ''}.` : ''}<br><br>You carry the <b>${gunName(run.gun)}</b>: ${mine.text} Every Shoot half fires the gun you carry, and mods stay on their gun. Swap? Your old one stays here.`,
    [['takegun', 'Swap guns'], ['closeread', 'Leave it']]);
}

function takeGun() {
  const o = S.gunOffer;
  $('#modal').hidden = true;
  if (!o || S.drops.get(o.k) !== 'gun-' + o.id) return;
  const old = run.gun;
  run.gun = o.id;
  S.drops.set(o.k, 'gun-' + old);
  S.gunOffer = null;
  sfx('pickup');
  log(`You take the <b>${gunName(o.id)}</b> and leave your ${gunName(old)} on the floor.`);
  if (S.playing && playedHalf().action.type === 'gun' && !S.act.atkUsed) S.act.atk = resolveAction(playedHalf().action);
  renderDrops(); render();
}

function hitDoor(t, s) {
  const k = key(t.x, t.y);
  if (s.breach) {
    S.doors.delete(k);
    showNoise(t.x, t.y, NOISE_BREACH); makeNoise(t.x, t.y, NOISE_BREACH, S.player); raiseAlarm(1);
    log('The door blows off its frame.');
    sfx('boom');
  } else if (s.pick) {
    S.doors.delete(k);
    S.openDoors.add(k);
    floatText(t, 'OPEN', 'heal');
    log('You pick the lock. The door slides open.');
    sfx('door');
  } else {
    const dmg = rollDmg(s.dmg), hp = S.doors.get(k) - dmg;
    floatText(t, '-' + dmg, 'dmg');
    if (hp > 0) { S.doors.set(k, hp); log(`You hit the door for ${dmg} (${hp} left).`); }
    else { S.doors.delete(k); sfx('smash'); log('You smash the door open.'); }
  }
  renderDoors(); renderOverlays();
}

// A body stays where someone dies. Walk onto it to search it: whatever they carried (the keycard included)
// and, unless you already pickpocketed them, a roll on the pickpocket odds.
function dropCorpse(e) {
  const k = key(e.x, e.y), old = S.corpses.get(k);
  if (!S.liquids.has(k)) { S.liquids.set(k, ENEMY_TYPES[e.kind].machine ? 'oil' : 'blood'); renderLiquids(); }
  const loot = e.robbed ? null : rollLoot(LOOT_ODDS, true);
  S.corpses.set(k, { kind: e.kind, hasKey: !!e.hasKey || !!(old && old.hasKey), loot: (old && !old.searched && old.loot) || loot, searched: false });
  e.hasKey = false;
  renderCorpses();
}

function searchCorpse(x, y) {
  const c = S.corpses.get(key(x, y));
  if (c.searched) return;
  c.searched = true;
  const who = 'the ' + ENEMY_TYPES[c.kind].name.toLowerCase() + "'s body";
  if (hasImplant('autophage')) { log(`The gland in your throat opens. You feed on ${who}.`); heal(3); }
  const gotKey = c.hasKey && !S.hasKey;
  if (gotKey) takeKey({ x, y, kind: c.kind });
  if (c.loot) giveLoot(c.loot, { x, y }, 'from ' + who, '');
  else if (!gotKey) log('You search ' + who + '. Nothing useful.');
  const uni = ENEMY_TYPES[c.kind].uniform;
  if (uni && !S.disguise) { S.disguiseOffer = uni; setTimeout(() => showModal('A uniform', `The ${uni} is mostly clean. Put it on? People more than ${DISGUISE_RANGE} tiles away will take you for staff, until someone sees you up close or sees you hurt someone.`, [['wear', 'Put it on'], ['closeread', 'Leave it']]), 0); }
  renderCorpses();
}

function renderCorpses() {
  const fx = $('#fx');
  fx.querySelectorAll('.corpse').forEach(el => el.remove());
  for (const [k, c] of S.corpses) {
    const [x, y] = unkey(k);
    const el = document.createElement('div');
    el.className = 'corpse' + (c.searched ? ' searched' : '') + (c.hasKey && !S.hasKey ? ' haskey' : '');
    el.style.left = x * T + 'px'; el.style.top = y * T + 'px';
    el.style.setProperty('--c', ENEMY_TYPES[c.kind].color);
    fx.prepend(el);
  }
}

// Keycard doors open with a swipe from the next tile (free, like searching). They can't be picked or smashed.
function swipeKeycard(x, y) {
  const P = S.player;
  if (Math.abs(P.x - x) + Math.abs(P.y - y) !== 1) { toast('Get next to the keycard door.'); return; }
  if (!S.hasKey && !hasGear('multitool')) { toast('This door needs a keycard.'); log('The reader blinks red. You need a keycard.'); return; }
  S.keyDoors.delete(key(x, y));
  if (S.hasKey) log('You swipe the keycard. The door unlocks with a heavy clunk.');
  else {
    log('You jam the multitool into the reader. It shorts with a bang and the door unlocks.');
    makeNoise(x, y, NOISE.smash, S.player);
    raiseAlarm(1);
  }
  renderKeyDoors(); renderUnits(); renderOverlays();
}

function renderKeyDoors() {
  for (const t of $('#board').querySelectorAll('.tile.keydoor')) t.classList.remove('keydoor', 'unlockable');
  for (const k of S.keyDoors) tileEl(...unkey(k)).classList.add('keydoor', ...(S.hasKey ? ['unlockable'] : []));
}

function takeKey(e) {
  e.hasKey = false; S.hasKey = true;
  floatText(e, 'KEYCARD', 'stun');
  log(`You take the <b>keycard</b> from ${nameOf(e)}. The exit is unlocked.`);
  toast('Keycard acquired — the exit is unlocked.');
  renderExit(); renderUnits(); renderSide(); renderCorpses(); renderKeyDoors();
}

// The turn never ends by itself: you press End turn, so there's always a moment to use a stim or serum.
function nextAction() {
  S.hoverDir = null;
  render();
}

// Ending the turn spends the picked card even if you didn't use it; you can't end a turn without one.
async function endTurn() {
  if (S.busy || S.phase !== 'turn') return;
  if (!S.playing) { toast('Pick a card first, or rest.'); return; }
  if (S.act.atk && S.act.atk.dmg > 0) S.lastCard = { name: halfName(playedHalf()), action: S.act.atk };
  S.playing.used = true; S.playing = null;
  S.hidden = hasImplant('chameleon') && !S.act.steps;
  tickSerums();
  await runEnemyPhase();
}

async function runEnemyPhase() {
  S.phase = 'enemy'; S.busy = true; S.hoverDir = null; S.sel = null;
  render();
  await sleep(250);
  for (const e of [...S.enemies]) {
    if (e.hp <= 0) continue;
    S.fast = !onScreen(e);
    await enemyTurn(e);
    S.fast = false;
    if (S.player.hp <= 0) { S.busy = false; return gameOver('Your vitals hit zero.'); }
  }
  await tickFire();
  if (S.player.hp <= 0) { S.busy = false; return gameOver('You burned.'); }
  if (!S.enemies.some(isHostile)) { S.busy = false; return roomCleared(); }
  if (S.alarm >= ALARM_MAX && --S.reinforceIn <= 0) { spawnReinforcement(); S.reinforceIn = REINFORCE_EVERY; renderUnits(); }
  S.busy = false;
  startRound();
}

// ---------- Enemy AI ----------
async function enemyTurn(e) {
  const r = unitEls.get(e.id);
  r.el.classList.add('acting'); r.intent.classList.add('acting');
  if (e.stunned) { e.stunned--; e.aim = null; await pause(300); }
  else if (isCamera(e)) await cameraTurn(e);
  else if (e.alerted && e.fleeing) await fleeTurn(e);
  else if (e.alerted) await alertedTurn(e);
  else if (e.suspicious) await investigateTurn(e);
  else await patrolTurn(e);
  e.intent = null;
  if (r.el.isConnected) { r.el.classList.remove('acting'); r.intent.classList.remove('acting'); }
  renderUnits();
}

// Patrols walk one step further per turn once the alarm is high.
const patrolSteps = e => ENEMY_TYPES[e.kind].patrol + (S.alarm >= ALARM_HURRY && ENEMY_TYPES[e.kind].patrol ? 1 : 0);

// Unaware: walk forward, turning at obstacles (right, then left, then back). Guards just turn in place.
async function patrolTurn(e) {
  if (!patrolSteps(e)) {
    e.facing = turnRight(e.facing);
    renderUnits(); renderOverlays();
    await pause(250);
    checkSight();
    return;
  }
  for (let i = 0; i < patrolSteps(e) && !e.alerted; i++) {
    const s = patrolStep(e, e);
    if (!s) break;
    await walk(e, [[s.x, s.y]]);
    checkSight();
  }
  await pause(80);
}

// Suspicious: walk to where the noise came from, then look around for a few turns, then give up.
const investigateSpeed = e => Math.max(1, ENEMY_TYPES[e.kind].patrol) + 1 + (S.alarm >= ALARM_HURRY ? 1 : 0);

function investigatePath(e) {
  const P = S.player, s = e.suspicious;
  const { dist, prev } = bfs(e.x, e.y, (x, y) => !enemyBlocked(x, y) && !(enemyAt(x, y) && enemyAt(x, y) !== e) && !(x === P.x && y === P.y));
  let best = null, score = Infinity;
  for (const [k, d] of dist) {
    const [x, y] = unkey(k), sc = manh({ x, y }, s) * 100 + d;
    if (sc < score) { score = sc; best = [x, y]; }
  }
  return best ? pathTo(prev, e.x, e.y, best[0], best[1]) : [];
}

async function investigateTurn(e) {
  const s = e.suspicious;
  if (!e.atTarget) {
    const path = investigatePath(e);
    for (const [x, y] of path.slice(0, investigateSpeed(e))) {
      if (e.alerted) return;
      await walk(e, [[x, y]]);
      checkSight();
    }
    if (path.length <= investigateSpeed(e)) e.atTarget = true;
    await pause(60);
    return;
  }
  e.facing = turnRight(e.facing);
  renderUnits(); renderOverlays();
  await pause(200);
  checkSight();
  if (!e.alerted && --s.turns <= 0) {
    e.suspicious = null; e.atTarget = false;
    log(`${nameOf(e)} gives up looking.`);
  }
}

// Alerted: chase and attack while it can see you; head for where it last saw you when it can't.
// After LOSE_TRACK_TURNS without seeing you it goes back to searching.
async function alertedTurn(e) {
  const P = S.player;
  if (canTrack(e)) { e.lastSeen = { x: P.x, y: P.y }; e.lost = 0; }
  else if (++e.lost >= LOSE_TRACK_TURNS) {
    e.alerted = false; e.intent = null; e.lost = 0; e.aim = null;
    e.suspicious = { x: e.lastSeen.x, y: e.lastSeen.y, turns: INVESTIGATE_TURNS }; e.atTarget = false;
    floatText(e, '?', 'alert');
    log(`${nameOf(e)} lost sight of you and starts searching.`);
    return investigateTurn(e);
  }
  if (!ENEMY_TYPES[e.kind].heavy && e.hp <= e.max * FLEE_AT) {
    e.fleeing = true; e.aim = null;
    floatText(e, 'FLEE', 'stun');
    log(`${nameOf(e)} panics and runs, shouting for help.`);
    makeNoise(e.x, e.y, NOISE.shout, P, true);
    return fleeTurn(e);
  }
  if (ENEMY_TYPES[e.kind].sniper) return sniperTurn(e);
  if (ENEMY_TYPES[e.kind].daemon && e.blink !== false && manh(e, P) > 1 && !e.lost) return blinkTurn(e);
  e.blink = true;
  if (e.intent) await attackTurn(e, e.lost ? e.lastSeen : P);
  else await pause(150);
}

// Sniper: if it has a line aimed, it fires along it (whoever is on the line gets hit). Otherwise, if it can see you,
// it aims at where you stand now; if not, it repositions.
async function sniperTurn(e) {
  const P = S.player;
  if (e.aim) {
    const line = e.aim; e.aim = null;
    sfx('bang');
    const end = line[line.length - 1] || P;
    await shot(e, end);
    makeNoise(e.x, e.y, NOISE.gun, e, true);
    const victim = [...(S.inDuct ? [] : [P]), ...S.enemies].find(u => u !== e && line.some(t => t.x === u.x && t.y === u.y));
    if (victim === P) { const dmg = reduceHit(SNIPER_DMG, { range: 1 }); log(`The sniper's round hits you for ${dmg}.`); damage(P, dmg); }
    else if (victim) { log(`The sniper's round hits ${nameOf(victim)}.`); damage(victim, SNIPER_DMG); }
    else log('The sniper\'s round cracks past you.');
    renderOverlays();
    return;
  }
  if (canTrack(e) && manh(e, P) <= SNIPER_RANGE) {
    e.aim = fireLine(e, P, SNIPER_RANGE);
    const dx = P.x - e.x, dy = P.y - e.y;
    e.facing = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    floatText(e, 'AIM', 'alert');
    log('The sniper takes aim. Get out of the red line.');
    renderUnits(); renderOverlays();
    await pause(250);
    return;
  }
  await attackTurn(e, e.lost ? e.lastSeen : P);
}

// Daemon: blinks to a free tile next to you (it has to have seen you), then attacks on its next turn.
async function blinkTurn(e) {
  const P = S.player;
  const spot = DIRS.map(([dx, dy]) => ({ x: P.x + dx, y: P.y + dy })).filter(t => !isWall(t.x, t.y) && !enemyAt(t.x, t.y)).sort(() => Math.random() - 0.5)[0];
  if (!spot || manh(e, P) > 12) { e.blink = false; return attackTurn(e, P); }
  floatText(e, 'BLINK', 'stun');
  e.x = spot.x; e.y = spot.y; e.facing = [P.x - e.x, P.y - e.y]; e.blink = false;
  sfx('whoosh');
  log(`${nameOf(e)} steps out of the wall beside you.`);
  renderUnits(); renderOverlays();
  await pause(300);
}

// Fleeing: get as far from you as it can.
async function fleeTurn(e) {
  const P = S.player;
  const { dist, prev } = bfs(e.x, e.y, (x, y) => !enemyBlocked(x, y) && !enemyAt(x, y) && !(x === P.x && y === P.y), 3);
  let best = null, score = -Infinity;
  for (const [k, d] of dist) {
    const [x, y] = unkey(k), sc = manh({ x, y }, P) * 10 - d + (los({ x, y }, P) ? 0 : 15);
    if (sc > score) { score = sc; best = [x, y]; }
  }
  if (best) await walk(e, pathTo(prev, e.x, e.y, best[0], best[1]));
  await pause(80);
}

// Cameras sweep, or keep facing you for a couple of turns after spotting you.
async function cameraTurn(c) {
  if (c.looped > 0) c.looped--;
  if (c.cool > 0) c.cool--;
  if (c.tracking > 0) {
    c.tracking--;
    const dx = S.player.x - c.x, dy = S.player.y - c.y;
    if (los(c, S.player)) c.facing = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  } else c.facing = cameraNextFacing(c);
  renderUnits(); renderOverlays();
  await pause(120);
  checkSight();
}

// Full alarm: a guard steps out of the lift room every few rounds and heads for you.
function spawnReinforcement() {
  const inside = bfs(S.exit.x, S.exit.y, (x, y) => !isWall(x, y)).dist;
  const { dist } = bfs(S.exit.x, S.exit.y, (x, y) => !S.walls[y][x], 14);
  const spot = [...dist.keys()].filter(k => !inside.has(k)).map(unkey).find(([x, y]) => !doorAt(x, y) && !S.keyDoors.has(key(x, y)) && !S.codeDoors.has(key(x, y)) && !enemyAt(x, y) && !(x === S.player.x && y === S.player.y) && !(x === S.exit.x && y === S.exit.y));
  if (!spot) return;
  const e = { id: 'e' + S.nextId++, kind: 'g', x: spot[0], y: spot[1], hp: ENEMY_TYPES.g.hp, max: ENEMY_TYPES.g.hp,
    intent: null, alerted: false, facing: [0, 1], suspicious: { x: S.player.x, y: S.player.y, turns: INVESTIGATE_TURNS } };
  S.enemies.push(e);
  log('The lift chimes. A reinforcement steps out.');
}

// One patrol step for enemy e from state s ({x, y, facing}); null if boxed in.
function patrolStep(e, s) {
  const P = S.player;
  const free = ([dx, dy]) => {
    const x = s.x + dx, y = s.y + dy, o = enemyAt(x, y);
    return !isWall(x, y) && (!o || o === e) && !(x === P.x && y === P.y);
  };
  let d = s.facing;
  if (!free(d)) {
    d = [turnRight(d), turnLeft(d), [-d[0], -d[1]]].find(free);
    if (!d) return null;
  }
  return { x: s.x + d[0], y: s.y + d[1], facing: d };
}

// Where an unaware enemy will be (and face) after each step of its next turn: patrolling, investigating or sweeping.
function predictPatrol(e) {
  const steps = patrolSteps(e);
  if (e.stunned) return [];
  if (isCamera(e)) return e.tracking ? [] : [{ x: e.x, y: e.y, facing: cameraNextFacing(e) }];
  if (e.suspicious && e.atTarget) return [{ x: e.x, y: e.y, facing: turnRight(e.facing) }];
  if (e.suspicious) {
    let px = e.x, py = e.y;
    return investigatePath(e).slice(0, investigateSpeed(e)).map(([x, y]) => {
      const st = { x, y, facing: [x - px, y - py] };
      px = x; py = y;
      return st;
    });
  }
  if (!steps) return [{ x: e.x, y: e.y, facing: turnRight(e.facing) }];
  const out = [];
  for (let i = 0, s = e; i < steps; i++) {
    s = patrolStep(e, s);
    if (!s) break;
    out.push(s);
  }
  return out;
}

// `goal` is you while it can see you, otherwise the spot where it last saw you.
async function attackTurn(e, goal) {
  const it = e.intent, P = S.player, tracking = goal === P;
  const canHit = (x, y) => !S.inDuct && it.atk > 0 && (it.range
    ? manh({ x, y }, P) <= it.range && los({ x, y }, P)
    : manh({ x, y }, P) === 1);

  if (it.move > 0 && !canHit(e.x, e.y)) {
    const { dist, prev } = bfs(e.x, e.y, (x, y) => !enemyBlocked(x, y) && !enemyAt(x, y) && !(x === P.x && y === P.y));
    // Head for the nearest tile it could attack from (or next to the player if it has no attack);
    // when it has lost sight of you, for the spot where it last saw you.
    const want = !tracking ? (x, y) => manh({ x, y }, goal) === 0 : it.atk > 0 ? canHit : (x, y) => manh({ x, y }, P) === 1;
    let best = null, score = Infinity;
    for (const [k, d] of dist) {
      const [x, y] = unkey(k);
      if (!want(x, y)) continue;
      const s = d * 100 + manh({ x, y }, goal);
      if (s < score) { score = s; best = [x, y]; }
    }
    // Nowhere to attack from: just get as close as possible.
    if (!best) for (const [k, d] of dist) {
      const [x, y] = unkey(k), s = manh({ x, y }, goal) * 100 + d;
      if (s < score) { score = s; best = [x, y]; }
    }
    if (best) await walk(e, pathTo(prev, e.x, e.y, best[0], best[1]).slice(0, it.move));
  }

  if (canHit(e.x, e.y)) {
    if (it.range) await shot(e, P); else await lunge(e, P);
    const dmg = reduceHit(rollDmg(it.atk), it);
    log(dmg ? `${nameOf(e)} hits you for ${dmg}.` : `${nameOf(e)} hits you, but your armour takes it.`);
    damage(P, dmg);
    await pause(250);
  } else await pause(150);
}

// Armour takes 1 off hits of its kind; Subdermal Plating takes 1 off the first hit each round.
function reduceHit(dmg, it) {
  if (it.range ? hasGear('vest') : hasGear('padding')) dmg--;
  if (hasImplant('plating') && S.platedRound !== S.round) { S.platedRound = S.round; dmg--; }
  return Math.max(0, dmg);
}

const BACKROOM_LINES = [
  'The carpet here is yellow and damp. The fluorescent hum is a little too loud. You do not remember the door.',
  'An empty room that goes on slightly longer than the walls allow. It smells of old carpet and someone else\'s déjà vu.',
  'Yellow walls, yellow carpet, a buzzing light. You have been here before. You are fairly sure you have never been here.',
];

// ---------- Liquids and fire ----------
// Setting a tile alight also flashes through every puddle of oil or chemicals connected to it.
function ignite(x, y) {
  if (isWall(x, y)) return;
  const lit = [[x, y]], seenK = new Set([key(x, y)]);
  for (let i = 0; i < lit.length; i++) {
    const [cx, cy] = lit[i];
    if (i && !FLAMMABLE.has(S.liquids.get(key(cx, cy)))) continue;
    if (i === 0 && !FLAMMABLE.has(S.liquids.get(key(cx, cy)))) continue;
    for (const [dx, dy] of DIRS) {
      const k = key(cx + dx, cy + dy);
      if (!seenK.has(k) && FLAMMABLE.has(S.liquids.get(k))) { seenK.add(k); lit.push([cx + dx, cy + dy]); }
    }
  }
  for (const [lx, ly] of lit) S.fire.set(key(lx, ly), FIRE_TURNS);
  sfx('whoosh');
  for (const u of [S.player, ...S.enemies]) if (seenK.has(key(u.x, u.y))) burn(u);
  renderLiquids();
}

function burn(u) {
  if (u.hp <= 0) return;
  if (u !== S.player && immune(u, 'fire')) { floatText(u, 'IMMUNE', 'stun'); return; }
  if (u === S.player && hasGear('apron')) { floatText(u, 'APRON', 'heal'); return; }
  log(`${nameOf(u)} ${u === S.player ? 'burn' : 'burns'}.`);
  damage(u, FIRE_DMG);
  if (u !== S.player && u.hp > 0 && !isCamera(u)) alertEnemy(u);
}

// End of each round: whoever stands in fire burns, fire creeps along oil and chemicals, then dies down.
async function tickFire() {
  if (!S.fire.size) return;
  for (const u of [S.player, ...S.enemies]) if (S.fire.has(key(u.x, u.y)) && !(u === S.player && S.inDuct)) burn(u);
  const spread = [];
  for (const k of S.fire.keys()) {
    const [x, y] = unkey(k);
    for (const [dx, dy] of DIRS) { const nk = key(x + dx, y + dy); if (!S.fire.has(nk) && FLAMMABLE.has(S.liquids.get(nk))) spread.push(nk); }
  }
  for (const [k, t] of [...S.fire]) {
    if (t > 1) S.fire.set(k, t - 1);
    else { S.fire.delete(k); if (FLAMMABLE.has(S.liquids.get(k))) S.liquids.delete(k); }
  }
  spread.forEach(k => S.fire.set(k, FIRE_TURNS));
  renderLiquids();
  await pause(200);
}

function renderLiquids() {
  const fx = $('#fx');
  if (!fx) return;
  fx.querySelectorAll('.puddle, .fire').forEach(el => el.remove());
  for (const [k, kind] of S.liquids) {
    const [x, y] = unkey(k), el = document.createElement('div');
    el.className = 'puddle ' + kind;
    el.style.left = x * T + 'px'; el.style.top = y * T + 'px';
    fx.prepend(el);
  }
  for (const k of S.fire.keys()) {
    const [x, y] = unkey(k), el = document.createElement('div');
    el.className = 'fire';
    el.style.left = x * T + 'px'; el.style.top = y * T + 'px';
    fx.appendChild(el);
  }
}

// ---------- Effects ----------
async function walk(u, path) {
  for (const [x, y] of path) {
    if (u !== S.player && doorAt(x, y)) {
      S.doors.delete(key(x, y));
      S.openDoors.add(key(x, y));
      renderDoors();
      if (S.vis.has(key(x, y))) { sfx('door'); log(`${nameOf(u)} opens a door.`); }
    }
    u.facing = [x - u.x, y - u.y];
    u.x = x; u.y = y;
    renderUnits(); renderOverlays();
    if (u === S.player) followPlayer();
    if (u === S.player && S.inDuct) sfx('step');
    else if (u === S.player) {
      sfx('step');
      if (S.trips.has(key(x, y))) {
        S.trips.delete(key(x, y));
        tileEl(x, y).classList.remove('trip');
        log('You break a laser tripwire. Somewhere a siren yelps.');
        sfx('alarm');
        showNoise(x, y, NOISE.gun);
        makeNoise(x, y, NOISE.gun, { x, y }, true);
        raiseAlarm(1);
      }
      if (S.backrooms.has(key(x, y)) && !S.backroomSeen) { S.backroomSeen = true; log(BACKROOM_LINES[S.room % BACKROOM_LINES.length]); }
      checkSight();
      if (S.loot.has(key(x, y))) openCache(x, y);
      if (S.drops.has(key(x, y))) takeDrop(x, y);
      if (S.corpses.has(key(x, y))) searchCorpse(x, y);
    }
    await pause(150);
  }
}

function damage(u, n) {
  u.hp -= n;
  if (u === S.player && u.hp <= 0 && S.phase === 'turn') setTimeout(() => { S.busy = false; gameOver('Your vitals hit zero.'); }, 0);
  if (u === S.player && n > 0) sfx('hurt');
  floatText(u, '-' + n, 'dmg');
  const r = unitEls.get(u.id);
  r.el.classList.remove('hit'); void r.el.offsetWidth; r.el.classList.add('hit');
  if (u !== S.player && u.hp <= 0) {
    log(`${nameOf(u)} is defeated.`);
    S.enemies = S.enemies.filter(e => e !== u);
    if (isCamera(u)) log('The camera sparks and goes dark.');
    else { dropCorpse(u); S.stats.kills++; }
    unitEls.delete(u.id);
    r.intent.remove(); r.el.classList.add('dead');
    setTimeout(() => r.el.remove(), 400);
  }
  renderUnits(); renderSide();
}

function heal(n) {
  if (!n) return;
  const P = S.player, before = P.hp;
  P.hp = Math.min(P.max, P.hp + n);
  if (P.hp > before) { floatText(P, '+' + (P.hp - before), 'heal'); log(`You heal ${P.hp - before}.`); }
  renderUnits(); renderSide();
}

function floatText(u, text, cls) {
  const f = document.createElement('div');
  f.className = 'float ' + cls; f.textContent = text;
  f.style.left = (u.x * T + T / 2) + 'px'; f.style.top = (u.y * T + T / 2) + 'px';
  $('#fx').appendChild(f);
  setTimeout(() => f.remove(), 900);
}

async function shot(from, to) {
  const s = document.createElement('div');
  s.className = 'shot';
  s.style.setProperty('--c', from.id === 'p' ? 'var(--blue)' : ENEMY_TYPES[from.kind].color);
  s.style.rotate = Math.atan2(to.y - from.y, to.x - from.x) + 'rad';
  s.style.left = (from.x * T + T / 2) + 'px'; s.style.top = (from.y * T + T / 2) + 'px';
  $('#fx').appendChild(s);
  void s.offsetWidth;
  s.style.left = (to.x * T + T / 2) + 'px'; s.style.top = (to.y * T + T / 2) + 'px';
  await pause(210);
  s.remove();
}

async function lunge(u, t) {
  const el = unitEls.get(u.id).el;
  el.style.transform = `translate(${Math.sign(t.x - u.x) * 14}px, ${Math.sign(t.y - u.y) * 14}px)`;
  await pause(110);
  el.style.transform = '';
  await pause(90);
}

function log(msg) { S.log.push(msg); }

let toastTimer;
function toast(html) {
  const t = $('#toast');
  t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function showModal(title, msg, buttons, extra = '') {
  const m = $('#modal');
  m.innerHTML = `<div class="box"><h2>${title}</h2><p>${msg}</p>${extra}${buttons.map(([act, label]) => `<button class="primary" data-act="${act}">${label}</button>`).join(' ')}</div>`;
  m.hidden = false;
}

function roomCleared() {
  S.phase = 'over'; render();
  run.floorStats[S.room] = { ...S.stats };
  if (S.room === FLOORS.length - 1) return showFinalLift();
  showLift();
}

// ---------- The lift ----------
// Between floors you ride the spine: a short scene, the Head's review of how you played (which decides
// how the next floor is set against you), and one of three things to take along.
function playStyle(st) {
  if (st.alarm >= 4) return ['loud', st.alarm];
  if (st.kills >= 4) return ['killer', st.kills];
  if (st.hacks >= 2) return ['hacker', st.hacks];
  if (st.pickpockets + st.loot >= 5) return ['thief', st.pickpockets + st.loot];
  if (!st.alerts && !st.cameras) return ['ghost', 0];
  return ['neutral', 0];
}

// Three offers: two cards you don't own, and a supply crate (or a third card when the crate rolls badly).
function liftOffers() {
  const owned = new Set(deck.map(c => c.id));
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const cards = REWARD_CARDS.filter(c => !owned.has(c.id)).sort(() => Math.random() - 0.5).slice(0, 1).map(card => ({ kind: 'card', card }));
  const gear = rnd(Object.keys(GEAR).filter(id => !hasGear(id)));
  if (gear) cards.push({ kind: 'gear', id: gear });
  const imp = rnd(Object.keys(IMPLANTS).filter(id => !hasImplant(id)));
  if (imp) cards.push({ kind: 'implant', id: imp });
  const supplies = [
    { kind: 'stims', n: 2, name: 'Med kit', text: '2 healing stims' },
    { kind: 'creds', n: 30, name: 'Envelope', text: '¥30 in creds' },
    { kind: 'serums', name: 'Lab samples', text: 'A speed and a strength serum' },
    { kind: 'belt', name: 'Grenade belt', text: 'EMP, flashbang and a noise maker' },
    { kind: 'transfusion', name: 'Transfusion', text: `+${TRANSFUSION_HP} max HP for the run` },
  ];
  while (cards.length < 3) cards.push(supplies.splice(Math.floor(Math.random() * supplies.length), 1)[0]);
  return cards;
}

function offerHTML(o, i) {
  if (o.kind === 'card') return `<div class="card offer" data-act="take-${i}">${cardHTML(o.card)}</div>`;
  if (o.kind === 'gear') {
    const g = GEAR[o.id], old = run.gear[g.slot];
    return `<div class="card offer item gear" data-act="take-${i}"><div class="half"><div class="kind">${g.slot}</div><p>${g.text}</p>${old ? `<div class="sub">Replaces ${GEAR[old].name}</div>` : ''}</div><div class="name">${g.name}</div></div>`;
  }
  if (o.kind === 'implant') {
    const m = IMPLANTS[o.id];
    return `<div class="card offer item implant" data-act="take-${i}"><div class="half"><div class="kind">Implant · ${partName(m.part)}</div><p>${m.text}${implantWarn(o.id)}</p></div><div class="name">${m.name}</div></div>`;
  }
  return `<div class="card offer supply" data-act="take-${i}"><div class="half"><div class="big heal">${o.text}</div><div class="sub">Supplies</div></div><div class="name">${o.name}</div></div>`;
}

function showLift() {
  sfx('lift');
  const [style, n] = playStyle(S.stats);
  const lines = CORP_AI_LINES[style];
  const line = lines[Math.floor(Math.random() * lines.length)].replace('{n}', n);
  const st = S.stats;
  S.liftOffers = liftOffers();
  run.adapt = style;
  showModal('The spine', '', [], `<div class="lift">
    <p class="lift-story">${ELEVATOR_STORIES[S.room] || ''}</p>
    <div class="doc mail ai"><div class="doc-head">From: the Head<br>Subject: Floor ${S.room + 1} review</div>
      <p>${line}</p><p class="ai-resp">${CORP_AI_RESPONSES[style]}</p>
      <p class="ai-stats">Kills ${st.kills} · takedowns ${st.takedowns} · spotted ${st.alerts} · cameras ${st.cameras} · robbed ${st.pickpockets}</p></div>
    <p>Take one thing up with you:</p>
    <div class="offers">${S.liftOffers.map(offerHTML).join('')}</div></div>`);
  $('#modal .box').classList.add('wide');
}

function takeOffer(i) {
  const o = S.liftOffers && S.liftOffers[i];
  if (!o) return;
  S.liftOffers = null;
  if (o.kind === 'card') deck = [...deck, o.card];
  else if (o.kind === 'gear') { run.gear[GEAR[o.id].slot] = o.id; run.notes.push(`You put on the <b>${GEAR[o.id].name}</b>: ${GEAR[o.id].text}`); }
  else if (o.kind === 'implant') installImplant(o.id);
  else if (o.kind === 'stims') run.stims += o.n;
  else if (o.kind === 'creds') run.creds += o.n;
  else if (o.kind === 'serums') { run.speed++; run.strength++; }
  else if (o.kind === 'transfusion') { run.maxHp += TRANSFUSION_HP; run.notes.push(`A transfusion in the lift: max HP +${TRANSFUSION_HP}.`); }
  else if (o.kind === 'belt') ['emp', 'flash', 'noise'].forEach(id => { run.items[id] = (run.items[id] || 0) + 1; });
  $('#modal').hidden = true;
  loadRoom(S.room + 1);
}

// Installs an implant. Past IMPLANT_SAFE_COUNT implants each one also brings a random defect.
function installImplant(id) {
  const old = implantIn(IMPLANTS[id].part), grew = !old;
  if (old) { run.implants = run.implants.filter(x => x !== old); run.notes.push(`You pull the <b>${IMPLANTS[old].name}</b> out of your ${partName(IMPLANTS[id].part)} to make room.`); }
  run.implants.push(id);
  syncMaxHp();
  run.notes.push(`Installed <b>${IMPLANTS[id].name}</b> in your ${partName(IMPLANTS[id].part)}: ${IMPLANTS[id].text}`);
  if (grew && run.implants.length > IMPLANT_SAFE_COUNT) {
    const pool = Object.keys(DEFECTS).filter(d => !hasDefect(d));
    const d = pool[Math.floor(Math.random() * pool.length)];
    if (d) { run.defects.push(d); run.notes.push(`<b>Defect in your ${partName(DEFECTS[d].part)}: ${DEFECTS[d].name}</b>. ${DEFECTS[d].text} Your body is running out of room for you.`); }
  }
}

const implantIn = part => run.implants.find(x => IMPLANTS[x].part === part);
const partName = part => BODY_PARTS.find(p => p.id === part).name.toLowerCase();
// What installing this implant would do besides its own rule: replace one, or bring a defect.
const implantWarn = id => {
  if (!id) return run.implants.length >= IMPLANT_SAFE_COUNT ? ' <b class="lost">If it goes into an empty part, it brings a random defect.</b>' : '';
  const old = implantIn(IMPLANTS[id].part);
  if (old) return ` Replaces your ${IMPLANTS[old].name}.`;
  return run.implants.length >= IMPLANT_SAFE_COUNT ? ' <b class="lost">Brings a random defect.</b>' : '';
};

function offerBlood() {
  const f = S.altar, pool = Object.keys(IMPLANTS).filter(id => !hasImplant(id));
  $('#modal').hidden = true;
  if (!f || f.used || !pool.length || run.maxHp <= ALTAR_MAX_HP + 2) return;
  f.used = true;
  run.maxHp -= ALTAR_MAX_HP;
  syncMaxHp();
  floatText(S.player, `-${ALTAR_MAX_HP} MAX HP`, 'dmg');
  sfx('hurt');
  log('You open your palm over the stone. The candles lean toward you.');
  installImplant(pool[Math.floor(Math.random() * pool.length)]);
  run.notes.splice(0).forEach(log);
  render();
}

// A Bazaar contact gives one thing: the floor plan if you lack it, else a gadget, else stims.
function contactGift(x, y) {
  tileEl(x, y).classList.add('searched');
  if (!S.planned) { S.planned = true; log('The contact slips you a folded floor plan. It is on your map.'); drawMinimap(); renderOverlays(); }
  else giveGadget(randomGadget(), { x, y }, 'from the contact');
  S.codes.length || hideCluesKnown();
}
// ...and tells you one code if any exist on the floor.
function hideCluesKnown() {
  const f = [...S.furn.values()].find(f => f.clue && f.clue.kind === 'code');
  if (f) { S.codes.push({ label: f.clue.label, code: f.clue.code }); log(`"And you'll want this," they add: <b>${f.clue.label} — ${f.clue.code}</b>.`); renderSide(); }
}

// The dream phone shows you where the lift and the document that matters are.
function revealFar() {
  const mark = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) S.seen.add(key(x + dx, y + dy)); };
  mark(S.exit.x, S.exit.y);
  for (const [k, f] of S.furn) if (f.story && !f.searched) mark(...unkey(k));
  log('When you hang up you know, the way you know things in dreams, where the lift is and where the paper that matters is. They are on your map.');
  renderOverlays(); drawMinimap();
}

function takeStairs() {
  $('#modal').hidden = true;
  if (S.room >= FLOORS.length - 1) return;
  S.phase = 'over';
  run.floorStats[S.room] = { ...S.stats };
  run.adapt = null;
  log('You take the fire stairs. Twelve flights. Nobody is watching the stairs.');
  loadRoom(S.room + 1);
}

// ---------- Story document, one per floor ----------
// Hidden in a desk or cabinet well away from where you start. Once you've seen its tile, it's marked.
function hideStory(idx) {
  const doc = STORY_DOCS[idx];
  if (!doc) return;
  const P = S.player;
  const spots = [...S.furn].filter(([k, f]) => (f.kind === 'desk' || f.kind === 'cabinet') && !f.clue && standable(k))
    .map(([k, f]) => ({ f, d: manh(P, { x: unkey(k)[0], y: unkey(k)[1] }) })).sort((a, b) => b.d - a.d);
  const pick = spots[Math.floor(Math.random() * Math.ceil(spots.length / 3))];
  if (pick) { pick.f.story = doc; pick.f.loot = null; }
}

function renderFurnStory() {
  for (const [k, f] of S.furn) if (f.story) tileEl(...unkey(k)).classList.toggle('story', !f.searched);
}

// ---------- Death ----------
function gameOver(msg) {
  S.phase = 'over'; render();
  const line = DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)];
  sfx('death');
  const st = S.stats;
  showModal('Flatlined', msg, [['restart', 'Retry floor'], ['newrun', 'Start over']], `<p class="epitaph">${line}</p>
    <p class="ai-stats">Floor ${S.room + 1}, ${FLOORS[S.room].name}, round ${S.round}. Kills ${st.kills} · takedowns ${st.takedowns} · spotted ${st.alerts} · cameras ${st.cameras} · hacks ${st.hacks}.
    Documents that matter: ${run.story.filter(Boolean).length} of ${FLOORS.length}.</p>`);
}

// ---------- The ending and Echoes ----------
// Echoes are the only thing that carries over between runs: one strange trait per win, kept in this browser.
const ECHO_KEY = 'roguelike-echoes';
function loadEchoes() { try { return JSON.parse(localStorage.getItem(ECHO_KEY)) || []; } catch { return []; } }
function saveEchoes(list) { try { localStorage.setItem(ECHO_KEY, JSON.stringify(list)); } catch {} }
let echoes = loadEchoes();
const hasEcho = id => echoes.includes(id);

// The last ride up: the lift scene, then the Head's message to you (the last document that matters), then the ending.
function showFinalLift() {
  sfx('lift');
  const m = STORY_DOCS[STORY_DOCS.length - 1];
  showModal('The spine', '', [['ending-0', 'Touch the Head']], `<div class="lift">
    <p class="lift-story">${ELEVATOR_STORIES[ELEVATOR_STORIES.length - 1]}</p>
    <div class="doc mail story"><div class="doc-head">From: ${m.from}<br>Subject: ${m.subject}</div><p>${m.body}</p></div></div>`);
  $('#modal .box').classList.add('wide');
}

function showEnding(i) {
  const last = i === ENDING_PARAGRAPHS.length - 1;
  showModal(i ? '' : 'The Head', '', [[last ? 'ending-echo' : 'ending-' + (i + 1), last ? 'Go back' : 'Continue']],
    `<p class="ending">${ENDING_PARAGRAPHS[i]}</p>`);
}

function showEcho() {
  const fresh = Object.keys(ECHO_FLAVOUR).filter(id => !hasEcho(id));
  const id = fresh[Math.floor(Math.random() * fresh.length)];
  if (id) { echoes = [...echoes, id]; saveEchoes(echoes); }
  const found = run.story.filter(Boolean).length;
  showModal('You come back weird', id ? 'Something came back with you.' : 'Nothing new came back with you. You are already as weird as it gets.',
    [['newrun', 'Climb again']],
    (id ? `<div class="doc paper"><div class="doc-head">Echo: ${ECHO_FLAVOUR[id].name}</div><p>${ECHO_FLAVOUR[id].text}</p></div>` : '') +
    `<p class="ai-stats">You found ${found} of ${FLOORS.length} documents that matter.</p>`);
}

// ---------- How to play ----------
function showHowTo() {
  showModal('How to play', '', [['title', 'Back']], `<div class="title howto">
    <p><b>Each turn</b> play one half of one card and move up to your Move, in any order, then press End turn. Every card has two
    halves, like Melee Attack or Sprint: you choose which. Searching desks, swiping keycards, keypads, vending machines and items
    are free. Terminals need a Hack half. Hover anything on the floor to see what it is. <b>Resting</b> takes a whole turn: you burn one card for good and get the rest back.</p>
    <p><b>Reach the lift</b> on each floor. You don't have to fight anyone. Some lifts sit behind keycard doors: pickpocket a carrier
    (marked KEY), search their body, hack a terminal, crawl through a vent, or blow a hole in the wall.</p>
    <p><b>Be seen less.</b> Yellow tiles are what people see now, violet what they'll see next. Noise draws people to it
    (<i>? Searching</i>). Getting spotted raises the <b>alarm</b>: at 3 patrols speed up, and at 5 reinforcements arrive.
    Hitting someone who hasn't seen you does double damage.</p>
    <p><b>Between floors</b> the lift tells you how the Head saw your play, and how it will answer. Take a card, gear or an implant.
    Implants go into parts of your body, one per part. Past three, they bring defects.</p>
    <p><b>Read.</b> Each floor hides one document that matters, in a desk or cabinet with a faint gold rim.</p></div>`);
  $('#modal .box').classList.add('wide');
}

// ---------- Title ----------
function showTitle() {
  const list = echoes.map(id => ECHO_FLAVOUR[id]).filter(Boolean);
  showModal('Roguelike', '', [['closeread', 'Climb the spine'], ['howto', 'How to play']], `<div class="title">
    <p class="epigraph">${TITLE_EPIGRAPH.split('\n').join('<br>')}</p>
    <p class="premise">${TITLE_PREMISE}</p>
    ${list.length ? `<div class="echoes"><b>Echoes</b>${list.map(e => `<div><i>${e.name}.</i> ${e.text}</div>`).join('')}</div>` : ''}</div>`);
  $('#modal .box').classList.add('wide');
}

// ---------- Rendering ----------
const tileEl = (x, y) => $('#board').children[y * S.w + x];
const isFloorTile = (x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h && (!S.walls[y][x] || S.props.has(key(x, y)) || S.furn.has(key(x, y)));

function buildBoard() {
  const b = $('#board');
  b.innerHTML = '';
  b.className = 'theme-' + FLOORS[S.room].theme;
  unitEls.clear();
  b.style.gridTemplateColumns = `repeat(${S.w}, ${T}px)`;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const t = document.createElement('div');
    let c = (x + y) % 2 ? 'floor alt' : 'floor';
    if (S.props.has(key(x, y))) c = 'floor prop';
    else if (S.furn.has(key(x, y))) c = 'floor ' + S.furn.get(key(x, y)).kind;
    else if (S.walls[y][x]) {
      // Solid rock with no floor next to it is drawn as empty void, so the building's shape reads clearly.
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloorTile(x + dx, y + dy)) edge = true;
      c = edge ? 'wall' : 'void';
    }
    t.className = 'tile ' + c;
    if (x === S.exit.x && y === S.exit.y) t.classList.add('exit');
    if (S.grates.has(key(x, y))) t.classList.add('grate');
    if (S.backrooms.has(key(x, y))) t.classList.add('backroom');
    if (S.circles.has(key(x, y))) t.classList.add('circle');
    if (S.trips.has(key(x, y))) t.classList.add('trip');
    t.dataset.x = x; t.dataset.y = y;
    b.appendChild(t);
  }
  b.style.width = S.w * T + 'px';
  renderExit(); renderDoors(); renderLoot(); renderVats(); renderDrops(); renderKeyDoors(); renderCodeDoors(); renderFurnStory();
  b.appendChild(buildDucts());
  const fx = document.createElement('div');
  fx.id = 'fx';
  b.appendChild(fx);
  renderLiquids();
}

function renderExit() {
  $('#board .tile.exit').innerHTML = `<span>${S.room === FLOORS.length - 1 ? 'HEAD' : 'LIFT'}</span>`;
}

function renderDoors() {
  for (const t of $('#board').querySelectorAll('.tile.opendoor')) t.classList.remove('opendoor', 'ns');
  for (const k of S.openDoors) {
    const [x, y] = unkey(k), t = tileEl(x, y);
    t.classList.add('opendoor');
    // Walls above and below: the door sits in a north-south wall.
    t.classList.toggle('ns', !!(S.walls[y - 1] && S.walls[y - 1][x] && S.walls[y + 1] && S.walls[y + 1][x]));
  }
  for (const t of $('#board').querySelectorAll('.tile.door')) { t.classList.remove('door'); t.innerHTML = ''; }
  for (const [k, hp] of S.doors) {
    const t = tileEl(...unkey(k));
    t.classList.add('door');
  }
}

// Vats show their HP once they've been hit, so you can see how close one is to breaking.
function renderVats() {
  for (const [k, hp] of S.vats) {
    const t = tileEl(...unkey(k));
    t.classList.add('vat');
    t.innerHTML = hp < S.breakable.hp ? `<span>${hp}</span>` : '';
  }
}

function renderDrops() {
  for (const t of $('#board').querySelectorAll('.tile.drop')) { t.classList.remove('drop', 'drop-stim', 'drop-speed', 'drop-strength', 'drop-gun'); t.innerHTML = ''; }
  for (const [k, what] of S.drops) {
    const t = tileEl(...unkey(k));
    t.classList.add('drop', what.startsWith('gun-') ? 'drop-gun' : 'drop-' + what);
    t.innerHTML = '<span></span>';
  }
}

function renderLoot() {
  for (const t of $('#board').querySelectorAll('.tile.loot')) { t.className = t.className.replace(/\bloot(-\w+)?\b/g, '').trim(); t.innerHTML = ''; }
  for (const [k, what] of S.loot) {
    const t = tileEl(...unkey(k));
    t.classList.add('loot', 'loot-' + what);
    t.innerHTML = what === 'creds' ? '<span>¥</span>' : '<span></span>';
  }
}

// Camera: drag the map to look anywhere, past the floor's edges too. It only snaps back to you at the start of a
// floor, when you walk near the edge of the view, or when you press Centre (or C). Redraws never move it.
// The building may slide at most CAM_MARGIN past the edges of the view (a smaller floor just stays centred).
const CAM_MARGIN = T * 2;
function clampCamera() {
  const vp = $('#viewport'), W = vp.clientWidth, H = vp.clientHeight, bw = S.w * T, bh = S.h * T;
  const axis = (v, view, size) => size + 2 * CAM_MARGIN <= view ? (view - size) / 2 : Math.min(CAM_MARGIN, Math.max(view - size - CAM_MARGIN, v));
  S.cam = { x: axis(S.cam.x, W, bw), y: axis(S.cam.y, H, bh) };
}
function applyCamera() {
  clampCamera(); $('#board').style.transform = `translate(${S.cam.x}px, ${S.cam.y}px)`; }

function centerCamera() {
  const vp = $('#viewport'), P = S.player;
  S.cam = { x: vp.clientWidth / 2 - (P.x + .5) * T, y: vp.clientHeight / 2 - (P.y + .5) * T };
  applyCamera();
}

function updateCamera() {
  if (!S.camSet) { S.camSet = true; return centerCamera(); }
  applyCamera();
}

// When you walk near the edge of the view (or off it), the camera catches up.
function followPlayer() {
  const vp = $('#viewport'), P = S.player, m = T * 1.5;
  const sx = (P.x + .5) * T + S.cam.x, sy = (P.y + .5) * T + S.cam.y;
  if (sx < m || sy < m || sx > vp.clientWidth - m || sy > vp.clientHeight - m) return centerCamera();
  applyCamera();
}

function onScreen(u) {
  const vp = $('#viewport'), sx = u.x * T + S.cam.x, sy = u.y * T + S.cam.y;
  return sx > -T && sy > -T && sx < vp.clientWidth && sy < vp.clientHeight;
}

// Whole-floor overview in the side panel: you, enemies, doors, caches and the exit.
function drawMinimap() {
  const cv = $('#minimap');
  if (!cv) return;
  const s = Math.max(2, Math.floor(198 / S.w));
  cv.width = S.w * s; cv.height = S.h * s;
  const c = cv.getContext('2d');
  // Only what you've seen is on the map; enemies only while you can see them.
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const k = key(x, y);
    c.fillStyle = !S.seen.has(k) ? (!S.planned ? '#050504' : S.walls[y][x] || isWall(x, y) ? '#2b3236' : '#161b1e') : S.keyDoors.has(k) ? '#b5503a' : S.grates.has(k) ? '#5d7f74' : S.doors.has(k) ? '#8a8172' : S.props.has(k) || S.furn.has(k) ? '#3a362f'
      : S.walls[y][x] ? '#0b0a09' : S.vis.has(k) ? '#3a3630' : '#24211d';
    c.fillRect(x * s, y * s, s, s);
  }
  const dot = (x, y, col) => { if (S.seen.has(key(x, y))) { c.fillStyle = col; c.fillRect(x * s - 1, y * s - 1, s + 2, s + 2); } };
  for (const k of S.loot.keys()) dot(...unkey(k), '#c9a24a');
  for (const [k, what] of S.drops) dot(...unkey(k), { stim: '#7fa36a', speed: '#6f9a8b', strength: '#b5503a' }[what] || '#8a7a4a');
  dot(S.exit.x, S.exit.y, S.needKey && !S.hasKey ? '#b5503a' : '#7fa36a');
  for (const e of S.enemies) if (visible(e)) dot(e.x, e.y, e.alerted ? '#e07a60' : ENEMY_TYPES[e.kind].color);
  dot(S.player.x, S.player.y, '#f1ead9');
}

function render() { renderUnits(); renderOverlays(); renderSide(); renderBar(); renderHand(); updateCamera(); }

function intentHTML(e) {
  if (e.stunned) return `<span class="stun">${e.stunned > 1 ? `Asleep ${e.stunned} turns` : 'Stunned'}</span>`;
  if (isCamera(e) && (S.camLoop > 0 || e.looped > 0)) return '<span class="stun">Looped</span>';
  if (isCamera(e)) return e.tracking ? '<span class="a">Tracking</span>' : '<span class="idle">Watching</span>';
  if (e.alerted && e.fleeing) return `<span class="sus">${isCivilian(e) ? 'Screaming' : 'Fleeing'}</span>`;
  if (isCivilian(e) && !e.suspicious) return '<span class="idle">Working</span>';
  if (!e.alerted && e.bribed) return '<span class="idle">Bribed</span>';
  if (!e.alerted && e.suspicious) return '<span class="sus">? Searching</span>';
  if (!e.alerted) return `<span class="idle">${ENEMY_TYPES[e.kind].patrol ? 'Patrolling' : 'On guard'}</span>`;
  if (e.aim) return `<span class="a">Fires ${SNIPER_DMG} next turn</span>`;
  if (ENEMY_TYPES[e.kind].sniper && e.alerted) return '<span class="m">Taking aim</span>';
  if (ENEMY_TYPES[e.kind].daemon && e.alerted && e.blink !== false) return '<span class="stun">Blink</span>';
  const it = e.intent;
  if (!it) return e.fresh ? '<span class="a">!</span>' : '';
  if (it.mimic) return `<span class="a">Mimics ${it.mimic}: ${it.atk}${it.range ? ` <small>R${it.range}</small>` : ''}</span>`;
  let h = '';
  if (it.move) h += `<span class="m">Move ${it.move}</span>`;
  if (it.atk) h += `<span class="a">${it.range ? `Shoot ${it.atk} <small>R${it.range}</small>` : `Attack ${it.atk}`}</span>`;
  return h;
}

// What you can see right now: tiles within SIGHT_RADIUS with a clear line from you (walls and closed doors
// block it; the wall or door itself is visible). Everything you have ever seen stays remembered in S.seen.
const SIGHT_RADIUS = 9;
function computeFov() {
  if (S.inDuct) {
    S.vis = new Set(ductReach(7).dist.keys());
    for (const k of S.vis) S.ductSeen.add(k);
    for (const t of ductExits()) { S.vis.add(key(t.x, t.y)); S.seen.add(key(t.x, t.y)); }
    return;
  }
  const P = S.player, R = SIGHT_RADIUS + (hasGear('visor') ? 3 : 0);
  S.vis = new Set([key(P.x, P.y)]);
  for (let y = P.y - R; y <= P.y + R; y++) for (let x = P.x - R; x <= P.x + R; x++) {
    if (x < 0 || y < 0 || x >= S.w || y >= S.h || (x - P.x) ** 2 + (y - P.y) ** 2 > R * R) continue;
    if (los(P, { x, y })) S.vis.add(key(x, y));
  }
  // Walls, doors and furniture bordering any floor you can see are visible too (so long walls don't get cut off).
  for (const k of [...S.vis]) {
    const [x, y] = unkey(k);
    if (isWall(x, y)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isWall(x + dx, y + dy)) S.vis.add(key(x + dx, y + dy));
  }
  for (const k of S.vis) S.seen.add(k);
}
const visible = u => (S.inDuct ? !S.ducts.has(key(u.x, u.y)) && S.vis.has(key(u.x, u.y)) : S.vis.has(key(u.x, u.y))) || (u.id !== 'p' && hasImplant('echo') && manh(u, S.player) <= 5);

function renderUnits() {
  computeFov();
  const fx = $('#fx');
  for (const u of [S.player, ...S.enemies]) {
    let r = unitEls.get(u.id);
    if (!r) {
      const isP = u.id === 'p', t = isP ? null : ENEMY_TYPES[u.kind];
      const el = document.createElement('div');
      el.className = 'unit ' + (isP ? 'player' : 'enemy') + (t && t.camera ? ' camera' : '') + (t && t.civilian ? ' civilian' : '');
      el.style.setProperty('--c', isP ? 'var(--blue)' : t.color);
      const icon = ICONS[isP ? '@' : u.kind];
      el.innerHTML = `<div class="token">${icon ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icon}</svg>` : `<b>${isP ? '@' : t.glyph}</b>`}</div>${isP ? '' : '<div class="eye"></div>'}<div class="hp"><i></i></div><div class="hpnum"></div>`;
      const intent = document.createElement('div');
      intent.className = 'intent';
      fx.append(el, intent);
      r = { el, intent };
      unitEls.set(u.id, r);
    }
    r.el.style.left = u.x * T + 'px'; r.el.style.top = u.y * T + 'px';
    r.intent.style.left = (u.x * T + T / 2) + 'px'; r.intent.style.top = u.y * T + 'px';
    r.el.querySelector('.hp i').style.width = (100 * Math.max(0, u.hp) / u.max) + '%';
    r.el.querySelector('.hpnum').textContent = Math.max(0, u.hp);
    if (u.id === 'p') continue;
    // Enemies you can't see right now aren't shown.
    const shown = visible(u);
    r.el.style.visibility = shown ? '' : 'hidden';
    r.intent.style.visibility = shown ? '' : 'hidden';
    r.intent.innerHTML = intentHTML(u);
    r.el.classList.toggle('aware', u.alerted);
    r.el.classList.toggle('haskey', !!u.hasKey && !S.hasKey);
    r.el.style.setProperty('--rot', Math.atan2(u.facing[0], -u.facing[1]) + 'rad');
  }
  updateCamera();
  drawMinimap();
}

function renderOverlays() {
  const cls = new Map(), P = S.player;
  const mark = (tiles, c) => tiles.forEach(t => cls.set(key(t.x, t.y), c));
  const markAtk = (spec, dir) => {
    const tiles = atkTiles(spec, P, dir);
    if (dir) return mark(tiles, 'preview');
    mark(tiles.filter(t => !cls.has(key(t.x, t.y))), 'range');  // faint range never hides a blue move tile
    mark(tiles.filter(t => spec.type !== 'point' && hasTarget(spec, t) && structureKind(t.x, t.y) !== 'wall'), 'target');
  };
  // Blue: where you can still move. Red on top: what the picked (or hovered) card can hit.
  if (S.phase === 'turn' && !S.busy && S.throwing) mark(throwTiles(S.throwing), 'target');
  else if (S.phase === 'turn' && !S.busy) {
    const a = S.act;
    if (!a.mvUsed) mark(reachTiles(a.move), 'reach');
    if (a.atk && !a.atkUsed && !S.inDuct) markAtk(a.atk, isDirectional(a.atk) ? S.hoverDir : null);
    else if (S.preview && !a.atkUsed && !S.inDuct) markAtk(S.preview, null);
  }
  // Yellow: what unaware enemies you can see are watching now. Violet: what they'll see on their next patrol.
  computeFov();
  const seen = new Set(), next = new Set();
  for (const e of S.enemies) {
    if (e.alerted || !visible(e)) continue;
    visionTiles(e).forEach(t => seen.add(key(t.x, t.y)));
    for (const s of predictPatrol(e)) visionTiles({ ...e, ...s }).forEach(t => next.add(key(t.x, t.y)));
  }
  const aims = new Set();
  for (const e of S.enemies) if (e.aim && visible(e)) e.aim.forEach(t => aims.add(key(t.x, t.y)));
  for (const t of $('#board').querySelectorAll('.tile')) {
    t.classList.remove('reach', 'range', 'target', 'preview');
    const k = key(+t.dataset.x, +t.dataset.y), c = cls.get(k);
    if (c) t.classList.add(c);
    t.classList.toggle('seen', seen.has(k));
    t.classList.toggle('next', !seen.has(k) && next.has(k));
    t.classList.toggle('aim', aims.has(k));
    // Never seen: black. Seen before but out of sight now: remembered, but dark.
    t.classList.toggle('unseen', !S.seen.has(k) && !S.planned);
    t.classList.toggle('planned', !S.seen.has(k) && S.planned);
    t.classList.toggle('fog', S.seen.has(k) && !S.vis.has(k));
    t.classList.toggle('duct-exit', S.inDuct && c === 'reach' && !S.ducts.has(k));
  }
  renderDucts(new Set([...cls].filter(([, c]) => c === 'reach').map(([k]) => k)));
}

// Your body: a silhouette with a marker on each part that can hold an implant. Gold = implant, red ring = defect.
// Hover a marker or a row to read what it does.
function bodyHTML() {
  const defectIn = part => run.defects.find(x => DEFECTS[x].part === part);
  const tip = p => { const i = implantIn(p.id), d = defectIn(p.id); return [p.name + ':', i ? `${IMPLANTS[i].name}. ${IMPLANTS[i].text}` : 'empty.', d ? `Defect: ${DEFECTS[d].name}. ${DEFECTS[d].text}` : ''].join(' ').trim(); };
  const marks = BODY_PARTS.map(p => `<g class="part ${implantIn(p.id) ? 'full' : ''} ${defectIn(p.id) ? 'bad' : ''}"><title>${tip(p)}</title><circle cx="${p.x}" cy="${p.y}" r="5.5"/></g>`).join('');
  const rows = BODY_PARTS.map(p => { const i = implantIn(p.id), d = defectIn(p.id);
    return `<div class="row" title="${tip(p)}"><span>${p.name}</span><b class="${i ? '' : 'empty'}">${i ? IMPLANTS[i].name : '—'}</b></div>` +
      (d ? `<div class="row defect" title="${tip(p)}"><span></span><b class="lost">${DEFECTS[d].name}</b></div>` : ''); }).join('');
  return `<div class="panel body">
    <div class="row stats"><span>Strength <b>${run.char.strength + strBonus()}</b></span><span>Move <b>${moveStat()}</b></span></div>
    <svg class="figure" viewBox="0 0 100 160" aria-label="Your body and its implants">
      <g class="sil"><circle cx="50" cy="20" r="14"/><rect x="44" y="33" width="12" height="8"/>
        <path d="M28 42h44l6 52h-12l-2 64h-11l-3-44-3 44h-11l-2-64h-12z"/><path d="M28 42l-10 46 7 2 9-36zM72 42l10 46-7 2-9-36z"/></g>
      <line class="spine" x1="50" y1="36" x2="50" y2="92"/>
      ${marks}
    </svg>
    <div class="parts">${rows}</div>
  </div>`;
}

function renderSide() {
  const P = S.player, hp = Math.max(0, P.hp);
  const canUseItem = S.phase === 'turn' && !S.busy;
  $('#side').innerHTML = `
    <div class="panel">
      <div class="row"><b>Floor ${S.room + 1} / ${FLOORS.length}</b><span>Round ${S.round}</span></div>
      <div class="floorname">${FLOORS[S.room].name}</div>
      <div class="row"><span>Alarm</span><span class="alarm">${Array.from({ length: ALARM_MAX }, (_, i) => `<i class="${i < S.alarm ? 'on' : ''}"></i>`).join('')}</span></div>
      <div class="hpbig"><i style="width:${100 * hp / P.max}%"></i><span>HP ${hp} / ${P.max}</span></div>
      <canvas id="minimap"></canvas>
    </div>
    <div class="panel">
      <div class="row"><span>Creds</span><b>¥${fmtMove(run.creds)}</b></div>
      ${S.codes.length ? `<div class="note">Codes found:</div>${S.codes.map(c => `<div class="row"><span>${c.label}</span><b>${c.code}</b></div>`).join("")}` : ""}
      <div class="row" title="${GUNS[run.gun].text}${gunMods(run.gun) ? ` Mods: +${gunMods(run.gun)}.` : ''}"><span>Gun</span><b>${gunName(run.gun)}</b></div>
      ${run.stims ? `<div class="row" title="Heals 1 a turn for ${STIM_TURNS} turns"><span>Healing stim${run.stims > 1 ? ` ×${run.stims}` : ''}</span><b><button class="mini-btn" data-act="stim" ${canUseItem ? '' : 'disabled'}>Use</button></b></div>` : ''}
      ${S.regen ? `<div class="buff">Healing stim: +1 HP at the start of your next ${S.regen} turn${S.regen > 1 ? 's' : ''}</div>` : ''}
      ${Object.entries(SERUMS).map(([kind, sv]) => `
        ${run[kind] ? `<div class="row" title="+${sv.bonus} ${sv.desc} for ${sv.turns} turns"><span>${sv.name}${run[kind] > 1 ? ` ×${run[kind]}` : ''}</span><b><button class="mini-btn" data-act="serum-${kind}" ${canUseItem ? '' : 'disabled'}>Use</button></b></div>` : ''}
        ${S.buff[kind] ? `<div class="buff">${sv.name}: +${sv.bonus} ${sv.desc}, ${S.buff[kind]} turn${S.buff[kind] > 1 ? 's' : ''} left</div>` : ''}`).join('')}
      ${Object.entries(run.items).filter(([, n]) => n > 0).map(([id, n]) => `<div class="row" title="${GADGETS[id].text}"><span>${GADGETS[id].name}${n > 1 ? ` ×${n}` : ''}</span><b><button class="mini-btn ${S.throwing === id ? 'aiming' : ''}" data-act="gadget-${id}" ${canUseItem ? '' : 'disabled'}>${S.throwing === id ? 'Cancel' : GADGETS[id].throw ? 'Throw' : 'Use'}</button></b></div>`).join('')}
      ${S.disguise ? `<div class="row"><span>Disguise</span><b class="ok">${S.disguise}</b></div>` : ''}
      ${S.needKey ? `<div class="row"><span>Keycard</span><b class="${S.hasKey ? 'ok' : 'lost'}">${S.hasKey ? 'Got it' : 'Needed'}</b></div>` : ''}
    </div>
    ${bodyHTML()}
    ${Object.keys(run.gear).length ? `<div class="panel loadout">
      ${GEAR_SLOTS.filter(sl => run.gear[sl]).map(sl => `<div class="row" title="${GEAR[run.gear[sl]].text}"><span>${sl}</span><b>${GEAR[run.gear[sl]].name}</b></div>`).join('')}
    </div>` : ''}
    ${S.log.length ? `<div class="panel log">${S.log.slice(-10).map(l => `<div>${l}</div>`).join('')}</div>` : ''}`;
  drawMinimap();
}

function renderBar() {
  const bar = $('#bar');
  if (S.phase === 'turn') {
    const a = S.act, c = S.playing, anyReady = S.cards.some(x => !x.used);
    const canRest = godMode || (!a.steps && !a.atkUsed && S.cards.some(x => x.used));
    let hint;
    if (!c) hint = anyReady
      ? `Pick one half of a card to use it, and click a blue tile to move (up to ${fmtMove(a.move)}).`
      : '<b>All your cards are used.</b> Rest to get them back.';
    else if (!a.atkUsed) hint = (isDirectional(a.atk) ? 'Point toward a target and click a red tile' : 'Click a red target')
      + ` to use <b>${halfName(playedHalf())}</b>. Click it again to put it back.`;
    else hint = a.mvUsed ? 'Done for this turn. Use a stim or serum if you like, then end your turn.' : (a.steps ? `You have ${fmtMove(a.move)} step${a.move > 1 ? 's' : ''} left. Click a blue tile, or end your turn.` : 'Click a blue tile to move, or end your turn.');
    if (S.inDuct) hint = `<b>In the air ducts.</b> Nobody can see you${c && a.atk && a.atk.type !== 'self' && !a.atkUsed ? `, and there's nothing to hit with ${halfName(playedHalf())} from here` : ''}. ${S.grates.has(key(S.player.x, S.player.y)) ? 'Click the floor next to this grate to climb out, or crawl on.' : 'Crawl along the duct (blue). Climb out at a grate.'}`;
    const bonus = '';
    bar.innerHTML = `
      <div class="hint">${hint}</div>
      ${canOverdrive() ? '<button data-act="overdrive" title="Synaptic Accelerator: once per floor">Overdrive</button>' : ''}
      <button data-act="rest" ${canRest ? '' : 'disabled'}>Rest</button>
      <button class="${a.atkUsed && a.mvUsed ? 'primary ready' : ''}" data-act="end" ${c ? '' : 'disabled'}>End turn</button>`;
  } else if (S.phase === 'burn') {
    const c = S.sel;
    bar.innerHTML = `
      <div class="hint">${S.forcedRest ? '<b>Out of cards.</b> You have to rest this turn. ' : ''}<b>Resting</b> takes your whole turn. Pick a card to <b>burn</b> for good. All your other cards come back.</div>
      ${S.forcedRest ? '' : '<button data-act="cancelrest">Cancel</button>'}
      <button class="primary" data-act="burn" ${c ? '' : 'disabled'}>Burn &amp; rest</button>`;
  } else if (S.phase === 'enemy') {
    bar.innerHTML = `<div class="hint">Enemies are acting…</div>`;
  } else bar.innerHTML = '';
}

function diagram(s) {
  let tiles;
  if (s.type === 'melee') tiles = DIRS;
  else if (s.shape === 'ring') tiles = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  else tiles = SHAPES[s.shape];
  const set = new Set(tiles.map(([x, y]) => key(x, y)));
  // Gun patterns stay visible on cards in the hand (other diagrams are hover-only there).
  let h = `<div class="diag${s.gun ? ' gun' : ''}">`;
  for (let y = Math.min(-3, ...tiles.map(t => t[1])); y <= 1; y++) for (let x = -2; x <= 2; x++) {
    const c = !x && !y ? 'me' : set.has(key(x, y)) ? (s.type === 'melee' ? 'opt' : 'hit') : '';
    h += `<i class="${c}"></i>`;
  }
  return h + '</div>';
}

function actionHTML(s) {
  if (s.type === 'self') {
    return (s.heal ? `<div class="big heal">Heal ${s.heal}</div>` : '') +
      (s.move ? `<div class="big dash">Move +${cardMove(s)}</div>` : '') +
      (s.ghost ? '<div class="big dash">Vanish</div><div class="sub">Cameras and the unaware can\'t see you this round</div>' : '<div class="sub">Self</div>');
  }
  const sub = s.type === 'hack' ? 'Terminal or keypad next to you, or a camera in sight' : s.bribe ? 'Someone unaware next to you' : s.ignite ? 'Fire. Oil and chemicals spread it' : s.type === 'point' ? (s.price ? 'Lands where you can see; people go to look' : 'A sound anywhere you can see') : s.push ? 'Into walls: 2 damage' : s.breach ? 'Blow a hole in a wall. Very loud'
    : s.cost ? `Costs ${s.cost} HP` : s.pick ? 'Opens a door, quietly'
    : s.steal ? 'Rob someone unaware' : s.type === 'melee' ? 'Melee' : s.type === 'ranged' ? 'Ranged · clear shot' : SHAPE_NAMES[s.shape];
  return `<div class="big">${atkName(s)}</div><div class="sub">${sub}</div>` +
    (s.type === 'ranged' || s.type === 'point' ? `<div class="rangeicon">⌖ ${s.range}</div>` : s.type === 'melee' || s.type === 'hack' ? '' : diagram(s));
}

// A card: two halves, each an action with its name. `chosen` = index of the half being played (or -1).
const cardHTML = (c, chosen = -1) => c.halves.map((h, i) => `<div class="half ${i === chosen ? 'chosen' : ''}" data-half="${i}" title="${halfName(h)}: ${atkLabel(resolveAction(h.action))}">${actionHTML(resolveAction(h.action))}<div class="hname">${halfName(h)}</div></div>`).join('<div class="or">or</div>');

// All your cards for this floor, in a fixed order: used ones are dark, burned ones are gone.
function renderHand() {
  const h = $('#hand');
  h.innerHTML = '';
  h.classList.toggle('locked', S.phase !== 'turn' && S.phase !== 'burn');
  h.classList.toggle('burning', S.phase === 'burn');
  // Turn state at a glance: cards glow while you still have to pick one, and fade once this turn's card is used.
  h.classList.toggle('choose', S.phase === 'turn' && !S.playing && !S.act.atkUsed);
  h.classList.toggle('done', S.phase === 'turn' && S.act.atkUsed);
  const spent = S.phase === 'turn' && S.act.atkUsed;
  for (const c of [...S.cards].sort((a, b) => a.id - b.id)) {
    const el = document.createElement('div');
    const picked = S.phase === 'burn' ? S.sel === c : c === S.playing && !spent;
    el.className = 'card' + (c.used || (c === S.playing && spent) ? ' used' : '') + (picked ? ' sel' : '');
    el.innerHTML = cardHTML(c, picked && S.phase === 'turn' ? S.half : -1);
    // A fan: cards tilt away from the middle and sit a little lower toward the edges.
    const off = h.children.length - (S.cards.length - 1) / 2;
    el.style.setProperty('--rot', off * 2.5 + 'deg');
    el.style.setProperty('--drop', Math.abs(off) ** 1.6 * 3 + 'px');
    el.onclick = () => pickCard(c, 0);  // resting: picks the whole card to burn
    el.querySelectorAll('.half').forEach((hEl, i) => {
      hEl.onclick = e => { e.stopPropagation(); pickCard(c, i); };
      hEl.onmouseenter = () => { if (S.phase === 'turn' && !S.playing && !c.used && !spent) { S.preview = resolveAction(c.halves[i].action); renderOverlays(); } };
    });
    el.onmouseleave = () => { S.preview = null; renderOverlays(); };
    h.appendChild(el);
  }
}

// ---------- Hover: what is this? ----------
// Just the name of whatever is on the tile under the mouse (one line per thing), with a word of state where it matters.
function describeTile(x, y) {
  const k = key(x, y);
  // Only what you have actually seen (a floor plan shows the layout, not what is in the rooms).
  if (!S.seen.has(k) && !S.ductSeen.has(k)) return null;
  const out = [], P = S.player, f = S.furn.get(k), e = enemyAt(x, y);
  if (S.inDuct && S.ducts.has(k)) out.push(S.grates.has(k) ? 'Vent grate' : 'Air duct');
  if (x === P.x && y === P.y) out.push('You');
  if (e && visible(e)) out.push(ENEMY_TYPES[e.kind].name + (isCamera(e) && (S.camLoop > 0 || e.looped > 0) ? ' (looped)' : e.bribed ? ' (bribed)' : ''));
  if (f) out.push({ desk: 'Desk', cabinet: 'Cabinet', safe: f.opened ? 'Safe (open)' : 'Safe', vending: 'Vending machine', terminal: 'Terminal',
    husk: 'Droid husk', altar: 'Altar', stairs: 'Fire stairs', contact: 'Contact', phone: 'Phone' }[f.kind]);
  if (S.grates.has(k) && !S.inDuct) out.push('Vent grate');
  if (doorAt(x, y)) out.push('Locked door');
  if (S.openDoors.has(k)) out.push('Open door');
  if (S.keyDoors.has(k)) out.push('Keycard door');
  if (S.codeDoors.has(k)) out.push('Keypad door');
  if (S.vats.has(k)) out.push(S.breakable.name[0].toUpperCase() + S.breakable.name.slice(1));
  if (x === S.exit.x && y === S.exit.y) out.push('Lift');
  if (S.loot.has(k)) out.push('Cache');
  if (S.drops.has(k)) out.push(S.drops.get(k).startsWith('gun-') ? GUNS[S.drops.get(k).slice(4)].name : 'Pickup');
  if (S.corpses.has(k)) out.push(S.corpses.get(k).searched ? 'Body (searched)' : 'Body');
  if (S.trips.has(k)) out.push('Laser tripwire');
  if (S.fire.has(k)) out.push('Fire');
  else if (S.liquids.has(k)) out.push({ blood: 'Blood', oil: 'Oil', chem: 'Chemicals' }[S.liquids.get(k)]);
  return out.length ? out.join('<br>') : null;
}

function showTip(ev) {
  const t = ev.target.closest('.tile'), tip = $('#tip');
  const text = t && describeTile(+t.dataset.x, +t.dataset.y);
  if (!text) { tip.hidden = true; return; }
  if (tip.dataset.k !== t.dataset.x + ',' + t.dataset.y) { tip.innerHTML = text; tip.dataset.k = t.dataset.x + ',' + t.dataset.y; }
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(ev.clientX + 16, innerWidth - r.width - 8) + 'px';
  tip.style.top = Math.min(ev.clientY + 16, innerHeight - r.height - 8) + 'px';
}

// ---------- Input ----------
const board = $('#board');
board.addEventListener('mousemove', showTip);

// Dragging the map. A press that moves less than a few pixels is still a click.
let drag = null;
$('#viewport').addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('button')) return;
  drag = { x: e.clientX, y: e.clientY, cx: S.cam.x, cy: S.cam.y, moved: false };
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true;
  board.classList.add('dragging');
  $('#tip').hidden = true;
  S.cam = { x: drag.cx + dx, y: drag.cy + dy };
  applyCamera();
});
window.addEventListener('pointerup', () => {
  if (drag && drag.moved) { S.dragged = true; setTimeout(() => { S.dragged = false; }, 0); }
  drag = null;
  board.classList.remove('dragging');
});
board.addEventListener('mouseleave', () => { $('#tip').hidden = true; });
board.addEventListener('click', e => {
  if (S.dragged) return;  // the end of a drag isn't a click
  const t = e.target.closest('.tile');
  if (t) onTileClick(+t.dataset.x, +t.dataset.y);
});
board.addEventListener('mousemove', e => {
  const t = e.target.closest('.tile');
  if (!t || S.phase !== 'turn' || !S.act.atk || S.act.atkUsed || !isDirectional(S.act.atk)) return;
  const d = dirTo(+t.dataset.x, +t.dataset.y);
  if (String(d) === String(S.hoverDir)) return;
  S.hoverDir = d; renderOverlays();
});
board.addEventListener('mouseleave', () => {
  if (S.hoverDir) { S.hoverDir = null; renderOverlays(); }
});

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'rest') startRest();
  else if (act === 'burn') confirmRest();
  else if (act === 'cancelrest') { if (S.phase === 'burn') { S.phase = 'turn'; S.sel = null; render(); } }
  else if (act === 'end') endTurn();
  else if (act === 'closeread') { $('#modal').hidden = true; S.keypad = null; }
  else if (act === 'keypad-enter') enterCode();
  else if (act.startsWith('buy-')) buy(act.slice(4));
  else if (act === 'keypad-fill') { $('#keypad').value = b.dataset.code; $('#keypad').focus(); }
  else if (act === 'stim') useStim();
  else if (act.startsWith('take-')) takeOffer(+act.slice(5));
  else if (act === 'overdrive') overdrive();
  else if (act === 'sound') toggleSound();
  else if (act === 'center') centerCamera();
  else if (act === 'takegun') takeGun();
  else if (act === 'god') toggleGod();
  else if (act === 'howto') showHowTo();
  else if (act === 'gacha') gacha();
  else if (act === 'bribe') payBribe();
  else if (act === 'offer') offerBlood();
  else if (act === 'stairs') takeStairs();
  else if (act === 'wear') { $('#modal').hidden = true; S.disguise = S.disguiseOffer; log(`You put on the ${S.disguise}. From a distance, you're staff.`); render(); }
  else if (act === 'title') showTitle();
  else if (act.startsWith('hack-')) doHack(act.slice(5));
  else if (act.startsWith('gadget-')) useGadget(act.slice(7));
  else if (act.startsWith('install-')) { $('#modal').hidden = true; installImplant(act.slice(8)); run.notes.splice(0).forEach(log); render(); }
  else if (act === 'ending-echo') showEcho();
  else if (act.startsWith('ending-')) showEnding(+act.slice(7));
  else if (act.startsWith('serum-')) useSerum(act.slice(6));
  else if (S.busy) return;
  else if (act === 'restart') { $('#modal').hidden = true; loadRoom(S.room); }
  else if (act === 'nextroom') { $('#modal').hidden = true; loadRoom(S.room + 1); }
  else if (act === 'newrun') { $('#modal').hidden = true; newRun(); }
});

document.addEventListener('keydown', e => { if ((e.key === 'c' || e.key === 'C') && e.target.tagName !== 'INPUT' && S) centerCamera(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'keypad') enterCode(); });

newRun();
showTitle();
toggleSound(); toggleSound();  // sets the header button's label
