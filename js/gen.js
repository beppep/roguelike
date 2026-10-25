// gen.js: the floor generator — part of the roguelike. Plain script (no modules): files share one global scope
// and load in the order listed in index.html.

function mulberry32(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Builds a floor as map rows: # wall, . floor, + door, o floor-themed furniture (blocks movement and sight),
// K desk with a computer and F filing cabinet (solid; search them from next door), $ loot cache,
// L keycard door, C keypad door, S wall safe, V vending machine, T networked terminal, G vent grate (in a wall),
// P player, X exit (the lift up), g/d/e/k/m/a enemies (ganger, drone, enforcer, cultist, golem, avatar), v clerk, c camera, n sniper, y daemon, b backroom floor, A altar, r blood circle floor,
// Z fire stairs, Q Bazaar contact, H dream phone, w laser tripwire (floor). The air ducts are returned as rows.ducts.
function generateFloor(f) {
  const rng = mulberry32(f.seed + (f.runSeed || 0));
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)), pick = a => a[Math.floor(rng() * a.length)];
  const W = f.w, H = f.h;
  const g = Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.'));
  const wallLine = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = '#'; };

  // Corridors: one east-west through the middle and vCorridors north-south ones, all two tiles wide.
  const isCorr = Array.from({ length: H }, () => Array(W).fill(false));
  const hy = (H >> 1) - 1, vxs = [];
  for (let x = 1; x < W - 1; x++) isCorr[hy][x] = isCorr[hy + 1][x] = true;
  for (let k = 1; k <= f.vCorridors; k++) {
    const vx = Math.round(k * W / (f.vCorridors + 1)) - 1 + ri(-1, 1);
    vxs.push(vx);
    for (let y = 1; y < H - 1; y++) isCorr[y][vx] = isCorr[y][vx + 1] = true;
  }

  // Blocks between corridors: wall off each side that faces a corridor, then cut the rest into rooms.
  const split = (x0, y0, x1, y1) => {
    const w = x1 - x0 + 1, h = y1 - y0 + 1, canV = w >= 7, canH = h >= 7;
    if (!(w > 10 || h > 8 || (w * h > 45 && rng() < 0.5)) || (!canV && !canH)) return;
    if (canV && (!canH || w > h || (w === h && rng() < 0.5))) {
      const sx = ri(x0 + 3, x1 - 3);
      wallLine(sx, y0, sx, y1); split(x0, y0, sx - 1, y1); split(sx + 1, y0, x1, y1);
    } else {
      const sy = ri(y0 + 3, y1 - 3);
      wallLine(x0, sy, x1, sy); split(x0, y0, x1, sy - 1); split(x0, sy + 1, x1, y1);
    }
  };
  const segs = (n, cuts) => {
    const out = [];
    let a = 1;
    for (const c of cuts) { out.push([a, c - 1]); a = c + 2; }
    out.push([a, n - 2]);
    return out;
  };
  for (const [bx0, bx1] of segs(W, vxs)) for (const [by0, by1] of segs(H, [hy])) {
    let x0 = bx0, x1 = bx1, y0 = by0, y1 = by1;
    if (bx0 > 1) { wallLine(bx0, by0, bx0, by1); x0++; }
    if (bx1 < W - 2) { wallLine(bx1, by0, bx1, by1); x1--; }
    if (by0 > 1) { wallLine(bx0, by0, bx1, by0); y0++; }
    if (by1 < H - 2) { wallLine(bx0, by1, bx1, by1); y1--; }
    split(x0, y0, x1, y1);
  }

  // Label the open spaces: the corridor network is one space, every room is its own.
  const region = Array.from({ length: H }, () => Array(W).fill(-1)), spaces = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== '.' || region[y][x] >= 0) continue;
    const id = spaces.length, cells = [[x, y]];
    region[y][x] = id;
    for (let i = 0; i < cells.length; i++) {
      const [cx, cy] = cells[i];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (g[ny][nx] === '.' && region[ny][nx] < 0) { region[ny][nx] = id; cells.push([nx, ny]); }
      }
    }
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
    spaces.push({ id, cells, corridor: cells.some(([cx, cy]) => isCorr[cy][cx]),
      x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1 });
  }

  // Doors go in straight wall tiles between two different spaces. Every space gets connected (a random
  // spanning tree), plus some extra connections for alternate routes. A quarter are open doorways.
  const cand = new Map();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] !== '#') continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const a = region[y - dy][x - dx], b = region[y + dy][x + dx];
      if (a < 0 || b < 0 || a === b || g[y - dx][x - dy] !== '#' || g[y + dx][x + dy] !== '#') continue;
      const k = Math.min(a, b) + ',' + Math.max(a, b);
      if (!cand.has(k)) cand.set(k, []);
      cand.get(k).push([x, y]);
    }
  }
  const edges = [...cand.keys()];
  for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [edges[i], edges[j]] = [edges[j], edges[i]]; }
  const parent = spaces.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const degree = spaces.map(() => 0), used = new Set();
  const connect = k => {
    const [a, b] = k.split(',').map(Number);
    const [x, y] = pick(cand.get(k));
    g[y][x] = rng() < 0.75 ? '+' : '.';
    degree[a]++; degree[b]++; used.add(k);
  };
  for (const k of edges) {
    const [a, b] = k.split(',').map(Number), ra = find(a), rb = find(b);
    if (ra === rb && rng() >= f.extraDoors) continue;
    parent[ra] = rb;
    connect(k);
  }
  // Dead ends are fine for closets; anything bigger gets a second way out when its walls allow one.
  spaces.forEach((s, i) => {
    if (s.corridor || degree[i] !== 1 || s.w * s.h < 16) return;
    const extra = edges.find(k => !used.has(k) && k.split(',').map(Number).includes(i));
    if (extra) connect(extra);
  });

  // Start in the main corridor at the west end, with doors and branches in reach right away.
  // The exit goes in the room whose walking distance is closest to EXIT_STEPS.
  const rooms = spaces.filter(s => !s.corridor);
  const start = { cx: 1, cy: hy };
  const dist = Array.from({ length: H }, () => Array(W).fill(-1)), q = [[start.cx, start.cy]];
  dist[start.cy][start.cx] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (g[ny][nx] === '#' || dist[ny][nx] >= 0) continue;
      dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]);
    }
  }
  const off = r => Math.abs(dist[r.cy][r.cx] - EXIT_STEPS);
  const exitRoom = rooms.filter(r => r !== start).reduce((a, b) => off(b) < off(a) ? b : a);
  g[start.cy][start.cx] = 'P';
  g[exitRoom.cy][exitRoom.cx] = 'X';

  // Keycard floors: every way into the lift room becomes a keycard door, plus up to two dead-end side rooms.
  // Only rooms you can do without are sealed, so a keycard door can never trap you.
  const openings = r => {
    const out = [];
    for (let x = r.x; x < r.x + r.w; x++) out.push([x, r.y - 1], [x, r.y + r.h]);
    for (let y = r.y; y < r.y + r.h; y++) out.push([r.x - 1, y], [r.x + r.w, y]);
    return out.filter(([x, y]) => g[y][x] === '+' || g[y][x] === '.');
  };
  if (KEYCARD_FLOORS.has(f.index)) {
    for (const [x, y] of openings(exitRoom)) g[y][x] = 'L';
    const deadEnds = rooms.filter(r => r !== exitRoom && openings(r).length === 1);
    for (let i = 0; i < 2 && deadEnds.length; i++) {
      // (its one doorway may already be a keycard door, if it opens into the lift room)
      const o = openings(deadEnds.splice(Math.floor(rng() * deadEnds.length), 1)[0])[0];
      if (o) g[o[1]][o[0]] = 'L';
    }
  }
  // One room per floor gets keypad doors on all its ways in; the code is written down somewhere on the floor.
  // Only a room you can do without: with it sealed, every other room must still be reachable from the start.
  const reachableWithout = sealed => {
    const seenR = new Set([key(start.cx, start.cy)]), stack = [[start.cx, start.cy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (g[ny][nx] === '#' || seenR.has(k)) continue;
        seenR.add(k); stack.push([nx, ny]);
      }
    }
    return rooms.every(r => r === sealed || seenR.has(key(r.cx, r.cy)));
  };
  for (const r of [...rooms].sort(() => rng() - 0.5)) {
    const ways = openings(r);
    if (r === exitRoom || !ways.length || ways.length > 2) continue;
    const before = ways.map(([x, y]) => g[y][x]);
    for (const [x, y] of ways) g[y][x] = '#';
    const ok = reachableWithout(r);
    ways.forEach(([x, y], i) => { g[y][x] = ok ? 'C' : before[i]; });
    if (ok) break;
  }
  const safeRooms = [...rooms].sort(() => rng() - 0.5).slice(0, ri(1, 2));
  const vendRooms = rooms.filter(r => !safeRooms.includes(r)).sort(() => rng() - 0.5).slice(0, 2);
  const termRooms = rooms.filter(r => !safeRooms.includes(r) && !vendRooms.includes(r)).sort(() => rng() - 0.5).slice(0, ri(1, 2));
  // Far rooms (by walking distance) for the fire stairs ('Z', floors 1-4), a Bazaar contact ('Q', floors 1-4)
  // and the dream phone ('H', floors 2-5).
  const farRooms = rooms.filter(r => r !== exitRoom && dist[r.cy][r.cx] > 14 && !safeRooms.includes(r) && !vendRooms.includes(r) && !termRooms.includes(r)).sort(() => rng() - 0.5);
  const special = new Map();
  if (f.index < 4 && farRooms[0]) special.set(farRooms[0], 'Z');
  if (f.index < 4 && farRooms[1]) special.set(farRooms[1], 'Q');
  if (f.index > 0 && farRooms[2]) special.set(farRooms[2], 'H');

  const freeTile = r => {
    for (let i = 0; i < 60; i++) {
      const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1);
      if (g[y][x] === '.') return [x, y];
    }
    return null;
  };
  // Lone blocks with open floor all around give cover but never block a doorway or cut a room in two.
  const loneSpot = r => {
    const x = ri(r.x + 1, r.x + r.w - 2), y = ri(r.y + 1, r.y + r.h - 2);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy][x + dx] !== '.') return null;
    return [x, y];
  };
  // A cabinet stands against a plain stretch of wall (no door beside it), and only if the room stays connected.
  const roomConnected = r => {
    const open = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!'#oKFSVTAZQH'.includes(g[y][x])) open.push(key(x, y));
    if (!open.length) return true;
    const seenCells = new Set([open[0]]), stack = [open[0]];
    while (stack.length) {
      const [x, y] = unkey(stack.pop());
      for (const [dx, dy] of DIRS) {
        const k = key(x + dx, y + dy);
        if (open.includes(k) && !seenCells.has(k)) { seenCells.add(k); stack.push(k); }
      }
    }
    return seenCells.size === open.length;
  };
  const wallSpot = r => {
    const side = ri(0, 3);
    const x = side === 0 ? r.x : side === 1 ? r.x + r.w - 1 : ri(r.x, r.x + r.w - 1);
    const y = side === 2 ? r.y : side === 3 ? r.y + r.h - 1 : ri(r.y, r.y + r.h - 1);
    if (g[y][x] !== '.') return null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = g[y + dy][x + dx];
      if ('+LC'.includes(c) || ((dx || dy) && c === '.' && (y + dy < r.y || y + dy >= r.y + r.h || x + dx < r.x || x + dx >= r.x + r.w))) return null;
    }
    return [x, y];
  };
  // Backrooms: a few rooms that are just empty yellow carpet. 'b' is floor that belongs to one.
  // Ritual rooms: an altar ('A') in the middle, ringed by a blood circle ('r', floor).
  const altarRooms = rooms.filter(r => r !== exitRoom && r.w >= 5 && r.h >= 5 && !safeRooms.includes(r) && !vendRooms.includes(r) && !termRooms.includes(r))
    .sort(() => rng() - 0.5).slice(0, f.altars || 0);
  const backRooms = rooms.filter(r => !altarRooms.includes(r) && !special.has(r) && r !== exitRoom && !safeRooms.includes(r) && !vendRooms.includes(r) && !termRooms.includes(r)
    && Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy) > 8).sort(() => rng() - 0.5).slice(0, f.backrooms || 0);
  for (const r of rooms) {
    if (altarRooms.includes(r)) {
      const cx = Math.floor(r.x + r.w / 2), cy = Math.floor(r.y + r.h / 2);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[cy + dy][cx + dx] === '.') g[cy + dy][cx + dx] = (dx || dy) ? 'r' : 'A';
      const n = rng() < f.enemyChance ? 1 : 0;
      for (let i = 0; i < n; i++) { const p = freeTile(r); if (p) g[p[1]][p[0]] = pick([...f.mix]); }
      continue;
    }
    if (backRooms.includes(r)) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (g[y][x] === '.') g[y][x] = 'b';
      continue;
    }
    // Office furniture: desks with computers in the middle, a filing cabinet or two against the walls,
    // and a little of whatever this floor makes.
    const area = r.w * r.h;
    for (let i = 0; i < Math.max(1, Math.floor(area / 14)); i++) { const p = loneSpot(r); if (p) g[p[1]][p[0]] = 'K'; }
    for (let i = 0; i < (area >= 20 ? 2 : 1); i++) {
      const p = wallSpot(r);
      if (!p) continue;
      g[p[1]][p[0]] = 'F';
      if (!roomConnected(r)) g[p[1]][p[0]] = '.';
    }
    for (let i = 0; i < Math.floor(area / 18); i++) { const p = loneSpot(r); if (p) g[p[1]][p[0]] = 'o'; }
    // A wall safe, opened with a code found elsewhere on the floor.
    for (let i = 0; i < 6 && safeRooms.includes(r); i++) {
      const p = wallSpot(r);
      if (!p) continue;
      g[p[1]][p[0]] = 'S';
      if (roomConnected(r)) break;
      g[p[1]][p[0]] = '.';
    }
    // A vending machine in a couple of break rooms: somewhere to spend creds.
    for (let i = 0; i < 6 && vendRooms.includes(r); i++) {
      const p = wallSpot(r);
      if (!p) continue;
      g[p[1]][p[0]] = 'V';
      if (roomConnected(r)) break;
      g[p[1]][p[0]] = '.';
    }
    for (let i = 0; i < 6 && special.has(r); i++) {
      const p = wallSpot(r);
      if (!p) continue;
      g[p[1]][p[0]] = special.get(r);
      if (roomConnected(r)) break;
      g[p[1]][p[0]] = '.';
    }
    // A networked terminal: hack it with Energy to loop cameras, release doors, print the plan or pull a fire alarm.
    for (let i = 0; i < 6 && termRooms.includes(r); i++) {
      const p = wallSpot(r);
      if (!p) continue;
      g[p[1]][p[0]] = 'T';
      if (roomConnected(r)) break;
      g[p[1]][p[0]] = '.';
    }
    const n = (rng() < f.enemyChance ? 1 : 0) + (r === exitRoom ? 1 : 0);
    for (let i = 0; i < n; i++) { const p = freeTile(r); if (p) g[p[1]][p[0]] = pick([...f.mix]); }
    const p = freeTile(r);
    if (p && rng() < f.lootChance) g[p[1]][p[0]] = '$';
  }
  // Vent grates sit in plain stretches of room wall (not corners, not beside a door). Crawl from one to another.
  const grateSpots = r => {
    const out = [];
    for (let x = r.x + 1; x < r.x + r.w - 1; x++) out.push([x, r.y - 1, 1, 0], [x, r.y + r.h, 1, 0]);
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) out.push([r.x - 1, y, 0, 1], [r.x + r.w, y, 0, 1]);
    return out.filter(([x, y, ax, ay]) => x > 0 && y > 0 && x < f.w - 1 && y < f.h - 1 && g[y][x] === '#'
      && g[y + ay][x + ax] === '#' && g[y - ay][x - ax] === '#'
      && [[ay, ax], [-ay, -ax]].some(([dx, dy]) => g[y + dy][x + dx] === '.'));
  };
  const ventRooms = [...rooms].sort(() => rng() - 0.5);
  let vents = 0;
  for (const r of ventRooms) {
    if (vents >= 6 && (rng() > 0.3 || vents >= 10)) continue;
    const spots = grateSpots(r);
    if (!spots.length) continue;
    const [x, y] = spots[Math.floor(rng() * spots.length)];
    g[y][x] = 'G'; vents++;
  }
  // Air ducts: each grate joins its nearest grate with an L-shaped tunnel (if it's close enough). A grate with
  // nothing in reach goes back to plain wall.
  const grates = [];
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (g[y][x] === 'G') grates.push([x, y]);
  const ducts = new Set(), linked = new Set();
  const tunnel = ([ax, ay], [bx, by]) => {
    const [cx, cy] = rng() < 0.5 ? [bx, ay] : [ax, by];
    const line = (x0, y0, x1, y1) => { for (let x = x0, y = y0; ; x += Math.sign(x1 - x0), y += Math.sign(y1 - y0)) { ducts.add(key(x, y)); if (x === x1 && y === y1) break; } };
    line(ax, ay, cx, cy); line(cx, cy, bx, by);
    linked.add(key(ax, ay)); linked.add(key(bx, by));
  };
  for (const a of grates) {
    const near = grates.filter(b => b !== a).map(b => [b, Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])]).sort((p, q) => p[1] - q[1])[0];
    if (near && near[1] <= DUCT_MAX) tunnel(a, near[0]);
  }
  for (const [x, y] of grates) if (!linked.has(key(x, y))) g[y][x] = '#';
  // Office staff ('v') wander the rooms away from the start.
  const staffRooms = rooms.filter(r => Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy) > 6);
  for (let i = 0; i < (f.civilians || 0) && staffRooms.length; i++) {
    const p = freeTile(pick(staffRooms));
    if (p) g[p[1]][p[0]] = 'v';
  }
  // Laser tripwires straight across the two-wide corridors.
  const corr = spaces.filter(s => s.corridor).flatMap(s => s.cells).filter(([x, y]) => g[y][x] === '.' && dist[y][x] > 10).sort(() => rng() - 0.5);
  let trips = 0;
  for (const [x, y] of corr) {
    if (trips >= (TRIPWIRES[f.index] || 0)) break;
    const across = [[0, 1], [1, 0]].find(([ax, ay]) => g[y + ay][x + ax] === '.' && g[y - ay][x - ax] === '#' && g[y + 2 * ay][x + 2 * ax] === '#');
    if (!across) continue;
    g[y][x] = 'w'; g[y + across[1]][x + across[0]] = 'w'; trips++;
  }
  const far = spaces.filter(s => s.corridor).flatMap(s => s.cells)
    .filter(([x, y]) => g[y][x] === '.' && Math.abs(x - start.cx) + Math.abs(y - start.cy) > 10);
  for (let i = 0; i < f.guards && far.length; i++) {
    const [x, y] = far.splice(Math.floor(rng() * far.length), 1)[0];
    g[y][x] = pick([...f.mix]);
  }
  // Cameras sit in room corners and sweep the room. Never right by the start, never blocking a doorway.
  const camRooms = rooms.filter(r => r.w * r.h >= 12 && Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy) > 8)
    .sort(() => rng() - 0.5);
  let cams = 0;
  for (const r of camRooms) {
    if (cams >= (f.cameras || 0)) break;
    const inRoom = (x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    const corners = [[r.x, r.y], [r.x + r.w - 1, r.y], [r.x, r.y + r.h - 1], [r.x + r.w - 1, r.y + r.h - 1]].sort(() => rng() - 0.5);
    const c = corners.find(([x, y]) => g[y][x] === '.' && DIRS.every(([dx, dy]) => inRoom(x + dx, y + dy) || g[y + dy][x + dx] === '#'));
    if (c) { g[c[1]][c[0]] = 'c'; cams++; }
  }
  const out = g.map(row => row.join(''));
  out.ducts = [...ducts];  // the duct layer rides along with the map rows
  return out;
}

