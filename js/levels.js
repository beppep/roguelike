// levels.js: hand-made levels from the level editor (editor.html), shared by the game and the editor.
// Plain script (no modules): files share one global scope.
//
// A level is { v, id, name, author, floor, rows, ducts, liquids }: `floor` is which tower floor it stands in for
// (0 Pharma Labs, 1 Weapons Foundry, 2 Meatology: its look, loot, door strength and story page), `rows` are map
// rows in the generator's characters (see gen.js), `ducts` the air-duct tiles ("x,y") and `liquids` [["x,y", kind]].
//
// To travel, a level becomes a short code (JSON, deflated, base64url) that fits in a link:
// editor.html#L=<code> opens it in the editor, index.html#L=<code> plays it. Saved levels live in this
// browser's localStorage, which the game and the editor share (same site).

const LEVEL_VERSION = 1, LEVEL_STORE = 'roguelike.levels';

async function encodeLevel(lv) {
  const { id, ...rest } = lv;  // the id is only for this browser's library
  const bytes = new TextEncoder().encode(JSON.stringify({ ...rest, v: LEVEL_VERSION }));
  const packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let bin = '';
  for (const b of packed) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Takes a bare code, or a whole link that has one after "L=". Throws if it isn't a level.
async function decodeLevel(text) {
  const m = String(text).match(/L=([A-Za-z0-9_-]+)/), code = (m ? m[1] : String(text)).trim();
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  return checkLevel(JSON.parse(json));
}

function checkLevel(lv) {
  if (!lv || !Array.isArray(lv.rows) || !lv.rows.length || lv.rows.some(r => typeof r !== 'string' || r.length !== lv.rows[0].length))
    throw new Error('That is not a level.');
  return { name: 'Untitled level', author: '', floor: 0, ducts: [], liquids: [], ...lv, floor: Math.max(0, Math.min(2, lv.floor | 0)) };
}

const levelLink = (code, page) => new URL(page + '#L=' + code, location.href).href;
// The level code in this page's address, if there is one.
const levelInHash = () => (location.hash.match(/L=([A-Za-z0-9_-]+)/) || [])[1] || null;

function savedLevels() {
  try { return JSON.parse(localStorage.getItem(LEVEL_STORE)) || []; } catch { return []; }
}
function storeLevels(list) {
  try { localStorage.setItem(LEVEL_STORE, JSON.stringify(list)); return true; } catch { return false; }
}
// Adds the level, or replaces the saved one with the same id. Returns the level with its id.
function saveLevel(lv) {
  const list = savedLevels(), id = lv.id || Math.random().toString(36).slice(2, 10);
  const entry = { ...lv, id, saved: Date.now() };
  const i = list.findIndex(l => l.id === id);
  if (i >= 0) list[i] = entry; else list.unshift(entry);
  return storeLevels(list) ? entry : null;
}
function deleteLevel(id) { storeLevels(savedLevels().filter(l => l.id !== id)); }
