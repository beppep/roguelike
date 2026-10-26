// data.js: tuning numbers, cards, enemies, floors — part of the roguelike. Plain script (no modules): files share one global scope
// and load in the order listed in index.html.

// ---------- Tuning ----------
const T = 46;
// Max HP at the start of a run. It changes over the run: Transfusions and the Second Heart raise it, altars take it.
const MAX_HP = 10;
const TRANSFUSION_HP = 2, SECOND_HEART_HP = 3;

// Attack shapes, written facing "up" (y = -1). Rotated to face the chosen direction.
const SHAPES = {
  arc:  [[-1, -1], [0, -1], [1, -1]],
  line: [[0, -1], [0, -2], [0, -3]],
  cone: [[0, -1], [-1, -2], [0, -2], [1, -2]],
  rail: [[0, -1], [0, -2], [0, -3], [0, -4], [0, -5]],
};
const SHAPE_NAMES = { arc: 'Sweep', line: 'Pierce', rail: 'Pierce 5', cone: 'Cone', ring: 'Whirl' };

// You, the operative. strength = damage of Melee Attack, move = free steps every turn.
const OPERATIVE = { name: 'Operative', strength: 3, move: 4 };

// Every card has two halves. Each turn you play one card and choose ONE of its halves, and you also move.
// A half is an action: 'self' actions need no target (heal, extra move, vanish); the rest target a tile.
// move: 'base' means as many extra steps as your Move stat; moveBonus adds steps on top.
const HALVES = {
  strike:     { name: 'Melee Attack',    action: { type: 'melee', dmg: OPERATIVE.strength, str: true } },
  sprint:     { name: 'Sprint',          action: { type: 'self', move: 'base' } },
  lockpick:   { name: 'Lockpick',        action: { type: 'melee', dmg: 0, pick: true } },
  hack:       { name: 'Hack',            action: { type: 'hack', range: 5 } },
  // Shoot: fires whatever gun you carry (see GUNS). A better gun makes every Shoot half better.
  shoot:      { name: 'Shoot',           action: { type: 'gun' } },
  // Shove: push someone next to you 2 tiles and stun them for a turn; slamming into something does 2 damage.
  shove:      { name: 'Shove',           action: { type: 'melee', dmg: 0, push: 2, stun: 1 } },
  pickpocket: { name: 'Pickpocket',      action: { type: 'melee', dmg: 0, steal: true } },
  bribe:      { name: 'Bribe',           action: { type: 'melee', dmg: 0, bribe: true } },
  patch:      { name: 'Med-Patch',       action: { type: 'self', heal: 2 } },
  // Coin Toss: throw a coin (¥1) at a tile you can see; everyone in earshot of it goes to look.
  coin:       { name: 'Coin Toss',       action: { type: 'point', noise: 6, range: 7, price: 1 } },
  katana:     { name: 'Mono-Katana',     action: { type: 'melee', dmg: 4 } },
  breach:     { name: 'Breach',          action: { type: 'melee', dmg: 0, breach: true } },
  arc:        { name: 'Arc Blade',       action: { type: 'shape', shape: 'arc', dmg: 3 } },
  emp:        { name: 'EMP Pulse',       action: { type: 'shape', shape: 'ring', dmg: 0, stun: 1 } },
  overclock:  { name: 'Overclock',       action: { type: 'self', move: 'base', moveBonus: 2 } },
  nanostim:   { name: 'Nano-Stim',       action: { type: 'self', heal: 4 } },
  ghost:      { name: 'Ghost Protocol',  action: { type: 'self', ghost: true } },
  bloodlet:   { name: 'Bloodlet',        action: { type: 'melee', dmg: 6, cost: 2 } },
  incinerate: { name: 'Incinerate',      action: { type: 'point', ignite: true, range: 4 } },
};
const card = (id, top, bottom) => ({ id, name: `${HALVES[top].name} / ${HALVES[bottom].name}`, halves: [HALVES[top], HALVES[bottom]] });

// How many cards you start every floor with.
const DECK_SIZE = 8;

// Starting deck: fighting, sneaking, opening and talking your way through, two options on every card.
const startingDeck = () => [
  card(1, 'strike', 'sprint'),
  card(2, 'strike', 'lockpick'),
  card(3, 'strike', 'hack'),
  card(4, 'shoot', 'hack'),
  card(5, 'shove', 'coin'),
  card(6, 'pickpocket', 'bribe'),
  card(7, 'patch', 'sprint'),
  card(8, 'lockpick', 'sprint'),
];

// Offered in the lift between floors: one you don't already own.
const REWARD_CARDS = [
  card(11, 'katana', 'breach'),
  card(12, 'shoot', 'sprint'),
  card(13, 'arc', 'shove'),
  card(14, 'katana', 'lockpick'),
  card(15, 'emp', 'hack'),
  card(16, 'shoot', 'coin'),
  card(17, 'overclock', 'patch'),
  card(18, 'arc', 'breach'),
  card(19, 'shoot', 'hack'),
  card(20, 'nanostim', 'ghost'),
  card(21, 'bloodlet', 'incinerate'),
  card(22, 'incinerate', 'sprint'),
  card(23, 'ghost', 'pickpocket'),
];

// What a successful pickpocket finds (the rest of the time: nothing). A potion is one of the three below, equally likely.
const LOOT_ODDS = { card: 0.15, creds: 0.3, potion: 0.3 };
// A healing stim heals 1 HP a turn for STIM_TURNS turns: right away, then at the start of each of your next turns.
const STIM_TURNS = 3;

// Serums: drink one and the bonus lasts this turn plus the next ones, `turns` turns in all.
// The strength serum raises your basic Strength, so it boosts Melee Attacks (the cards that use Strength).
const SERUMS = {
  speed:    { name: 'Speed serum',    bonus: 2, desc: 'move',     turns: 3 },
  strength: { name: 'Strength serum', bonus: 2, desc: 'Strength', turns: 5 },
};

// Every hit (yours and enemies') has this chance to land 1 off its listed damage, half up and half down.
const DMG_VARIANCE = 0.5;
const rollDmg = n => {
  if (n <= 0) return 0;
  const r = Math.random();
  return Math.max(1, n + (r < DMG_VARIANCE / 2 ? -1 : r < DMG_VARIANCE ? 1 : 0));
};

// Doors ('+' on the map) block movement and sight until smashed or lockpicked. They get sturdier higher up.
const DOOR_HP_BY_FLOOR = [5, 7, 9];
// Everything else can be smashed with damaging attacks too (smashing is loud). HP by kind; furniture spills
// whatever it held. Outer walls, grates, the fire stairs and people at their desks can't be broken.
const STRUCTURE_HP = { keydoor: 15, codedoor: 12, wall: 20, desk: 4, cabinet: 6, terminal: 6, vending: 8, safe: 20, husk: 5, altar: 12, phone: 3 };

// Furniture you can smash with damaging attacks, per floor theme. Each one leaves a pickup on its tile:
// walk over it to take it. Floors not listed here have furniture that can't be broken.
const BREAKABLES = {
  pharma:  { name: 'vat',   hp: 4, drop: 'potion' },
  weapons: { name: 'crate', hp: 6, drop: 'gun' },
  flesh:   { name: 'blood font', hp: 3, drop: 'potion' },
};

// ---------- Guns ----------
// You carry one gun; every Shoot half fires it. You start with the Silenced Pistol. Weapons crates (Foundry) and
// safes hold other guns: taking one swaps it for yours, and your old gun stays on the floor (you can swap back).
// Guns trade off rather than stack: quiet or loud, damage, range, a cone or a line.
const GUNS = {
  // The one you start with is unreliable: anything you find is an upgrade of some kind.
  silenced: { name: 'Silenced Pistol',    text: 'Quiet. 5 damage, range 5, but misses 1 shot in 10.',          action: { type: 'ranged', gun: true, dmg: 5, range: 5, silent: true, miss: 0.1 } },
  carbine:  { name: 'Suppressed Carbine', text: 'Quiet. 5 damage, range 6.',                                    action: { type: 'ranged', gun: true, dmg: 5, range: 6, silent: true } },
  revolver: { name: 'Heavy Revolver',     text: 'Loud. 8 damage, range 5.',                                     action: { type: 'ranged', gun: true, dmg: 8, range: 5 } },
  rifle:    { name: 'Smart Rifle',        text: 'Loud. 6 damage, range 8.',                                     action: { type: 'ranged', gun: true, dmg: 6, range: 8 } },
  scatter:  { name: 'Scattergun',         text: 'Loud. 5 damage to everyone in a cone in front of you.',       action: { type: 'shape', gun: true, shape: 'cone', dmg: 5 } },
  rail:     { name: 'Rail Gun',           text: 'Loud. 6 damage to everyone in a line 5 long.',                action: { type: 'shape', gun: true, shape: 'rail', dmg: 6 } },
  tranq:    { name: 'Tranq Pistol',       text: 'Quiet. No damage: puts the target to sleep for 3 turns. Range 6.', action: { type: 'ranged', gun: true, dmg: 0, stun: 3, range: 6, silent: true } },
};
const START_GUN = 'silenced';
// Gun mods fit the gun you carry when you find them, and stay with that gun: +1 damage (a tranq gun sleeps 1 turn
// longer). At most GUN_MOD_MAX per gun.
const GUN_MOD_MAX = 2;

// Rewards for doing something: picking a pocket, searching a body, cracking a safe, sometimes a filing cabinet.
// Floor caches never hold them. When such loot rolls its 'card' share, it's a gun mod GUNMOD_SHARE of the time.
const GUNMOD_SHARE = 0.35;
// Chance a filing cabinet's drawer holds a card or a gun mod.
const CABINET_REWARD_CHANCE = 0.08;

// Floors (0-based) whose exit is locked until you take the keycard from the enemy carrying it.
const KEYCARD_FLOORS = new Set([1, 2]);

// Hitting an enemy that hasn't spotted you multiplies the damage.
const BACKSTAB_MULT = 2;

// ---------- Stealth ----------
// Noise radius in tiles (sound travels along open floor and through doors, not through walls). Anyone who
// hasn't seen you and hears it walks over to investigate. A takedown is a kill on someone who never saw you.
const NOISE = { melee: 3, takedown: 1, shape: 4, gun: 8, smash: 6, shout: 6, run: 2 };
const RUN_STEPS = 4;          // moving this many tiles or more in one turn is running, and makes footstep noise
const LOSE_TRACK_TURNS = 3;   // an alerted enemy who hasn't seen you for this many turns starts searching instead
const INVESTIGATE_TURNS = 3;  // how long a suspicious enemy looks around once it reaches the noise
const FLEE_AT = 0.34;         // non-heavy enemies flee below this share of their HP

// ---------- Floor alarm ----------
// 0–5. Alerting someone +1, a camera spotting you +2. At ALARM_HURRY patrols move one step faster;
// at ALARM_MAX reinforcements walk out of the lift every REINFORCE_EVERY rounds.
const ALARM_MAX = 5, ALARM_HURRY = 3, REINFORCE_EVERY = 4;
const SNIPER_DMG = 5, SNIPER_RANGE = 10;

// Each round an alerted enemy rolls one of its intents. atk 0 = move only. range = ranged attack.
// Unaware enemies patrol `patrol` steps per turn (0 = stands guard and turns), seeing `vision` tiles ahead.
const ENEMY_TYPES = {
  g: { name: 'Ganger',   glyph: 'G', hp: 6,  color: '#b5563a', vision: 4, patrol: 2, uniform: 'security uniform', intents: [{ move: 3, atk: 2 }, { move: 2, atk: 3 }, { move: 4, atk: 1 }] },
  d: { name: 'Drone',    glyph: 'D', hp: 4,  color: '#a8925a', vision: 5, patrol: 2, machine: true, intents: [{ move: 2, atk: 2, range: 4 }, { move: 1, atk: 3, range: 5 }, { move: 3, atk: 1, range: 4 }] },
  e: { name: 'Enforcer', glyph: 'E', hp: 10, color: '#8a6a8e', vision: 3, patrol: 0, heavy: true, uniform: 'riot armour', intents: [{ move: 2, atk: 4 }, { move: 1, atk: 5 }, { move: 4, atk: 0 }] },
  // Cameras never move or attack: they sweep a room, and when they see you they raise the alarm and radio a guard.
  // Higher up: the Company's older staff. Cultists chant when they spot you (a loud shout); golems are clay and ichor,
  // slow and armoured; avatars are the Head's eyes, they see far and shoot.
  k: { name: 'Cultist',  glyph: 'K', hp: 5,  color: '#9a3b34', vision: 4, patrol: 1, chant: true, uniform: 'cultist robe', intents: [{ move: 3, atk: 2 }, { move: 2, atk: 3 }, { move: 3, atk: 2 }] },
  m: { name: 'Golem',    glyph: 'M', hp: 14, color: '#7d6a52', vision: 3, patrol: 1, heavy: true, immune: ['stun'], intents: [{ move: 1, atk: 5 }, { move: 2, atk: 4 }, { move: 1, atk: 6 }] },
  a: { name: 'Avatar',   glyph: 'A', hp: 6,  color: '#b8b09a', vision: 6, patrol: 0, machine: true, mimic: true, intents: [{ move: 2, atk: 3, range: 6 }, { move: 1, atk: 4, range: 6 }, { move: 3, atk: 2, range: 5 }] },
  // Office staff. They don't fight, and you're just another face in the corridor, but they scream (alarm +1)
  // if they see violence or a body, then run.
  v: { name: 'Clerk',    glyph: 'v', hp: 3,  color: '#9a937f', vision: 4, patrol: 1, civilian: true, intents: [] },
  // Snipers take a turn to aim (the line is shown in red) and fire along it the next: step out of the line.
  n: { name: 'Sniper',   glyph: 'N', hp: 4,  color: '#7f8a6a', vision: 8, patrol: 1, sniper: true, uniform: 'marksman fatigues', intents: [{ move: 2, atk: 0 }] },
  // Daemons blink through the walls to your side, then strike.
  y: { name: 'Daemon',   glyph: 'Y', hp: 8,  color: '#a3402f', vision: 5, patrol: 1, daemon: true, immune: ['fire'], intents: [{ move: 1, atk: 4 }, { move: 1, atk: 5 }] },
  c: { name: 'Camera', glyph: '◉', hp: 2, color: '#8a8172', vision: 6, patrol: 0, camera: true, machine: true, intents: [] },
};

// The corporate tower: three generated floors (the droid floor's drones and snipers now live on the Foundry). The lift from the last one goes to the Head (the ending; a boss floor
// may come later). Each floor is one rectangular office building: a grid of
// two-wide corridors, with the blocks between them cut into rooms by walls one tile thick. Each run adds its own number to
// the seed, so a floor keeps its layout for the whole run (restarts included) but changes between runs. vCorridors = north-south corridors crossing the east-west
// one, extraDoors = chance each extra wall between two spaces also gets a door (more routes around),
// enemyChance / lootChance = chance a room has a person / a cache, guards = extra corridor patrols, mix = enemy letters,
// loot = odds for what a cache holds.
// Walking distance from the start to the exit: about 15 turns at Move 3.
const EXIT_STEPS = 45;

const FLOORS = [
  { name: 'Pharma Labs',     theme: 'pharma',  cache: 'a medicine cabinet', seed: 1101, w: 40, h: 28, vCorridors: 2,
    extraDoors: 0.3, enemyChance: 0.55, lootChance: 0.6, guards: 2, cameras: 1, civilians: 5, mix: 'ggd',   puddles: { kind: 'chem', count: 4 }, loot: { card: 0.15, creds: 0.25, potion: 0.6 } },
  { name: 'Weapons Foundry', theme: 'weapons', cache: 'a weapons locker',   seed: 2202, w: 46, h: 30, vCorridors: 2,
    extraDoors: 0.3, enemyChance: 0.45, lootChance: 0.5, guards: 2, cameras: 4, civilians: 3, mix: 'ggddden', oilrooms: 1, puddles: { kind: 'oil', count: 6 }, loot: { card: 0.35, creds: 0.4, potion: 0.25 } },
  { name: 'Meatology',       theme: 'flesh',   cache: 'a reliquary',        seed: 4404, w: 50, h: 34, vCorridors: 3,
    extraDoors: 0.35, enemyChance: 0.4, lootChance: 0.45, guards: 2, cameras: 2, mix: 'kkkmgy', oilrooms: 1, altars: 2, puddles: { kind: 'blood', count: 6 }, loot: { card: 0.25, creds: 0.3, potion: 0.45 } },
];
FLOORS.forEach((fl, i) => { fl.index = i; });


// ---------- Gear ----------
// Passive, kept for the run, one piece per slot: a new piece replaces whatever was in its slot.
// Offered in the lift between floors.
const GEAR = {
  gelsoles:    { slot: 'Boots',  name: 'Gel Soles',       text: 'Running makes no noise.' },
  runners:     { slot: 'Boots',  name: 'Kinetic Runners', text: '+1 Move.' },
  vest:        { slot: 'Armour', name: 'Ballistic Vest',  text: 'Ranged hits deal 1 less.' },
  apron:       { slot: 'Armour', name: 'Lead Apron',      text: 'Fire can\'t hurt you.' },
  padding:     { slot: 'Armour', name: 'Riot Padding',    text: 'Melee hits deal 1 less.' },
  knuckles:    { slot: 'Gloves', name: 'Shock Knuckles',  text: 'Melee Attack also stuns machines (drones, cameras, avatars).' },
  thiefgloves: { slot: 'Gloves', name: "Thief's Gloves",  text: 'Pickpocketing always finds something.' },
  visor:       { slot: 'Mask',   name: 'Optic Visor',     text: '+3 sight radius.' },
  corpmask:    { slot: 'Mask',   name: 'Corporate Mask',  text: 'Cameras ignore you until you hurt someone on that floor.' },
  jammer:      { slot: 'Tool',   name: 'Signal Jammer',   text: 'Your hacks are never traced.' },
  multitool:   { slot: 'Tool',   name: 'Multitool',       text: 'Short out a keycard reader to open its door without a keycard. Loud, and the alarm rises.' },
};
const GEAR_SLOTS = ['Boots', 'Armour', 'Gloves', 'Mask', 'Tool'];

// ---------- Implants ----------
// Strong new rules, installed in the lift, found in safes or grown at altars. Each one goes into a part of your body,
// one implant per part: a new one in an occupied part replaces the old one. Once you carry more than
// IMPLANT_SAFE_COUNT implants, every further one also installs a random defect, which settles in its own part.
const IMPLANT_SAFE_COUNT = 3;
// Body parts, with where their marker sits on the side panel's body diagram (viewBox 0 0 100 160).
const BODY_PARTS = [
  { id: 'brain', name: 'Brain', x: 50, y: 14 },
  { id: 'eyes',  name: 'Eyes',  x: 50, y: 22 },
  { id: 'skull', name: 'Skull', x: 38, y: 27 },
  { id: 'ears',  name: 'Ears',  x: 63, y: 24 },
  { id: 'heart', name: 'Heart', x: 42, y: 50 },
  { id: 'spine', name: 'Spine', x: 50, y: 62 },
  { id: 'arms',  name: 'Arms',  x: 76, y: 70 },
  { id: 'skin',  name: 'Skin',  x: 27, y: 74 },
  { id: 'gut',   name: 'Gut',   x: 57, y: 88 },
];
const IMPLANTS = {
  accel:     { part: 'brain', name: 'Synaptic Accelerator', text: 'Once per floor, Overdrive: play a second card in the same turn.' },
  plating:   { part: 'skin',  name: 'Subdermal Plating',    text: 'The first hit you take each round deals 1 less.' },
  echo:      { part: 'ears',  name: 'Echolocator',          text: 'You see people through walls within 5 tiles.' },
  autophage: { part: 'gut',   name: 'Autophage Gland',      text: 'Searching a body also feeds you from it: heal 3.' },
  spinaltap: { part: 'spine', name: 'Spinal Tap',           text: 'Hack terminals and keypad doors from up to 3 tiles away.' },
  compressed:{ part: 'skull', name: 'Compressed Head',      text: 'In the air ducts every step goes twice as far.' },
  heart:     { part: 'heart', name: 'Second Heart',         text: `+${SECOND_HEART_HP} max HP.` },
  myomer:    { part: 'arms',  name: 'Myomer Fibres',        text: '+1 Strength: Melee Attack hits 1 harder.' },
  optic:     { part: 'eyes',  name: 'Targeting Optic',      text: 'Guns reach 2 tiles further.' },
  chameleon: { part: 'skin',  name: 'Dermal Chameleon',     text: 'End a turn without moving and nobody who hasn\'t spotted you can see you (except from right next to you) until your next turn.' },
};
const DEFECTS = {
  misfire:    { part: 'brain', name: 'Misfire',       text: 'One random card starts every floor already used.' },
  spinal:     { part: 'spine', name: 'Spinal Defect', text: '-1 Move.' },
  deathdrive: { part: 'gut',   name: 'Death Drive',   text: 'Resting costs 1 HP.' },
  feedback:   { part: 'ears',  name: 'Feedback',      text: 'Cameras see 2 tiles further.' },
};
// Chance an opened safe also holds an implant you can install on the spot.
const SAFE_IMPLANT_CHANCE = 0.5;

// ---------- Hacking ----------
// The Hack half works on a networked terminal or a keypad door next to you (Spinal Tap: up to 3 tiles away, in
// sight), or on a camera you can see within 5 tiles. A terminal offers one of these hacks per Hack card.
const HACK_REACH = 1, HACK_REACH_TAP = 3;
const CAMERA_LOOP_ROUNDS = 5;
const HACKS = [
  { id: 'loop',  name: 'Loop the cameras', text: `Every camera on the floor shows old footage for ${CAMERA_LOOP_ROUNDS} rounds.` },
  { id: 'doors', name: 'Release the lift doors', text: 'Unlocks every keycard door on this floor.' },
  { id: 'plan',  name: 'Print the floor plan', text: 'The whole layout goes on your map.' },
  { id: 'fire',  name: 'Pull a fire alarm', text: 'A bell rings far from you. Everyone who hears it goes to look.' },
];

// ---------- Gadgets ----------
// One-use, free to use (no card, no move). Thrown ones need a tile you can see within `throw` tiles.
const GADGETS = {
  emp:     { name: 'EMP grenade',   price: 15, throw: 5, radius: 2, text: 'Stuns drones, cameras and avatars within 2 tiles for 2 turns. Quiet.' },
  flash:   { name: 'Flashbang',     price: 15, throw: 5, radius: 2, text: 'Stuns everyone within 2 tiles for a turn. Loud.' },
  fire:    { name: 'Incendiary',    price: 18, throw: 5, radius: 1, text: 'Sets everything within 1 tile on fire. Oil and chemicals carry it further.' },
  noise:   { name: 'Noise maker',   price: 8,  throw: 7, text: 'Rattles where it lands: everyone in earshot goes to look.' },
  breach:  { name: 'Breach charge', price: 20, throw: 1, text: 'Blows a hole in a wall (or door) next to you. Very loud.' },
  ld50:    { name: 'LD-50-emon',    price: 25, text: 'Heals you fully. Leaves one new habit that is not yours: a random defect.' },
};
// Chance that loot which would have been a potion is a gadget instead.
const GADGET_SHARE = 0.3;
const NOISE_BREACH = 10;

// ---------- Liquids and fire ----------
// Bodies leave blood (machines leave oil); broken vats leave chemicals. Oil and chemicals burn: gunfire, Incinerate
// and incendiaries set them alight, and fire races along any connected puddle. Fire burns for FIRE_TURNS rounds and
// hurts whoever stands in it at the end of a round. Blood doesn't burn.
const FLAMMABLE = new Set(['oil', 'chem']);
const FIRE_TURNS = 3, FIRE_DMG = 2;
// Floors also start with a few puddles of their own (FLOORS[].puddles): chemical spills in the labs, oil leaks in
// the Foundry, blood in Meatology. Each is a small blob of PUDDLE_SIZE tiles or so.
const PUDDLE_SIZE = [2, 5];

// ---------- Creds ----------
// The gacha slot in every vending machine: pay GACHA_PRICE for something random (rarely a card).
const GACHA_PRICE = 10;
// Bribing: click someone next to you who hasn't spotted you, with no card picked. Humans only (not machines,
// golems or daemons). A bribed person never raises the alarm over you on this floor.
const BRIBE_PRICE = 20;
// Pocket change at the start of a run (enough for a few coin tosses).
const START_CREDS = 5;

// ---------- Token icons ----------
// Small silhouettes (24x24, drawn in the unit's colour) shown on the round tokens. '@' is you.
const ICONS = {
  '@': '<circle cx="12" cy="7" r="3.6"/><path d="M5 21c0-5 3-8.5 7-8.5s7 3.5 7 8.5z"/><path d="M8.2 6.2C8.6 3.4 10 2 12 2s3.4 1.4 3.8 4.2L15 5.5C14.2 4 13.2 3.4 12 3.4S9.8 4 9 5.5z"/>',
  g: '<circle cx="11" cy="6.5" r="3.4"/><path d="M4 21c0-5 3-8 7-8s7 3 7 8z"/><path d="M17.5 4.5l2.4-1.2 1 1.8-5 9-1.6-.8z"/>',
  d: '<circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="18" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.5"/>',
  e: '<path d="M7 9.5C7 5.5 9 3 12 3s5 2.5 5 6.5v1.5H7z"/><rect x="8.5" y="8.2" width="7" height="1.6" fill="#15130f"/><path d="M2.5 22c0-6 4-9.5 9.5-9.5s9.5 3.5 9.5 9.5z"/>',
  c: '<rect x="3" y="7" width="13" height="9" rx="1.5"/><path d="M16 9.5l5-2.5v9l-5-2.5z"/><circle cx="9.5" cy="11.5" r="2.4" fill="#15130f"/>',
  v: '<circle cx="12" cy="7" r="3.4"/><path d="M5.5 21c0-5 2.8-8 6.5-8s6.5 3 6.5 8z"/><path d="M11.2 13h1.6l.8 5-1.6 1.6-1.6-1.6z" fill="#15130f"/>',
  k: '<path d="M12 2c3 0 5 3 5 6.5L20 22H4l3-13.5C7 5 9 2 12 2z"/><circle cx="12" cy="9" r="2.4" fill="#15130f"/>',
  m: '<rect x="7.5" y="2.5" width="9" height="7" rx="1"/><rect x="3" y="10.5" width="18" height="11" rx="1.5"/><rect x="9.5" y="5" width="1.8" height="1.8" fill="#15130f"/><rect x="12.7" y="5" width="1.8" height="1.8" fill="#15130f"/>',
  a: '<ellipse cx="12" cy="12" rx="10" ry="6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1.3" fill="#15130f"/>',
  n: '<circle cx="8" cy="7" r="3.2"/><path d="M2 21c0-5 2.6-8 6-8s6 3 6 8z"/><path d="M9 12.5l13-6 .6 1.4-13 6z"/>',
  y: '<path d="M6 2l2.6 5.2C9.6 6.5 10.7 6.2 12 6.2s2.4.3 3.4 1L18 2l.4 7c1 1.3 1.6 2.9 1.6 4.6C20 18 16.4 22 12 22s-8-4-8-8.4c0-1.7.6-3.3 1.6-4.6z"/><circle cx="9.3" cy="13" r="1.4" fill="#15130f"/><circle cx="14.7" cy="13" r="1.4" fill="#15130f"/>',
};

// Altars (ritual rooms, Meatology): give up ALTAR_MAX_HP of your max HP, for good, for a random implant. One offering each.
const ALTAR_MAX_HP = 2;

// ---------- Disguises ----------
// Search the body of someone in uniform (guards, enforcers, snipers, cultists) and you can wear their clothes.
// People and cameras further than DISGUISE_RANGE tiles away take you for staff. Up close, or if anyone sees you
// hurt someone, the disguise is blown. It lasts until it's blown or you leave the floor.
const DISGUISE_RANGE = 2;

// ---------- Traps ----------
// Laser tripwires ('w') across corridors on floors 2 and 3: crossing one raises the alarm and makes noise.
// An EMP clears them; you can also simply walk around. Once seen, your moves route around them.
const TRIPWIRES = [0, 3, 1];

// Each hack has this chance to be traced by the Head's ICE (alarm +1). A Signal Jammer stops traces.
const TRACE_CHANCE = 0.2;

// ---------- Air ducts ----------
// A layer above the floor. Each vent grate is joined to its nearest grate by a tunnel if that grate is at most
// DUCT_MAX tiles away (as the crow walks); tunnels that cross make small networks. Inside, you crawl with your
// normal steps, nobody can see or follow you, and you climb out through any grate.
const DUCT_MAX = 14;
