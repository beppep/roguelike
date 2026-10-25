// sound.js: small synthesized sound effects (WebAudio, no files) — part of the roguelike.
// Plain script: defines sfx(name) and toggleSound() in the shared global scope. Loads before game.js.

let audio = null;
let soundOn = (() => { try { return localStorage.getItem('roguelike-sound') !== 'off'; } catch { return true; } })();

// The audio context can only start after a click, so it's created on first use.
function ctx() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

function toggleSound() {
  soundOn = !soundOn;
  try { localStorage.setItem('roguelike-sound', soundOn ? 'on' : 'off'); } catch {}
  const b = document.querySelector('[data-act="sound"]');
  if (b) b.textContent = soundOn ? 'Sound: on' : 'Sound: off';
}

// A tone: frequency glide from f0 to f1 over `dur` seconds.
function tone(f0, f1, dur, type = 'sine', vol = 0.15, delay = 0) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

// A burst of filtered noise: shots, impacts, fire.
function noise(dur, freq, vol = 0.2, q = 1, delay = 0, type = 'lowpass') {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const SOUNDS = {
  step:   () => noise(0.05, 900, 0.03),
  hit:    () => { noise(0.12, 500, 0.25); tone(140, 60, 0.12, 'triangle', 0.12); },
  puff:   () => noise(0.08, 1800, 0.12, 0.7, 0, 'bandpass'),
  bang:   () => { noise(0.35, 2500, 0.35); tone(120, 40, 0.25, 'square', 0.08); },
  alert:  () => { tone(660, 990, 0.12, 'square', 0.06); tone(990, 990, 0.1, 'square', 0.05, 0.12); },
  beep:   () => { tone(1400, 1400, 0.07, 'sine', 0.08); tone(1400, 1400, 0.07, 'sine', 0.08, 0.12); },
  scream: () => tone(700, 1300, 0.45, 'sawtooth', 0.05),
  alarm:  () => { for (let i = 0; i < 3; i++) { tone(520, 780, 0.25, 'sawtooth', 0.05, i * 0.3); } },
  smash:  () => { noise(0.3, 900, 0.3); tone(90, 50, 0.2, 'triangle', 0.15); },
  boom:   () => { noise(0.9, 400, 0.5); tone(70, 30, 0.6, 'sine', 0.3); },
  pickup: () => { tone(660, 660, 0.08, 'triangle', 0.08); tone(990, 990, 0.12, 'triangle', 0.08, 0.08); },
  hack:   () => { for (let i = 0; i < 5; i++) tone(1200 + Math.random() * 800, 900, 0.04, 'square', 0.03, i * 0.06); },
  hurt:   () => { tone(220, 110, 0.2, 'sawtooth', 0.1); noise(0.15, 700, 0.15); },
  whoosh: () => noise(0.6, 600, 0.25, 0.5, 0, 'bandpass'),
  lift:   () => { tone(110, 110, 1.2, 'sine', 0.12); tone(165, 165, 1.2, 'sine', 0.06); tone(880, 880, 0.3, 'triangle', 0.06, 1.0); },
  death:  () => { tone(330, 55, 1.4, 'sawtooth', 0.12); noise(1.2, 300, 0.15); },
  stun:   () => { tone(1800, 300, 0.2, 'square', 0.05); },
  vent:   () => { noise(0.5, 300, 0.12, 2, 0, 'bandpass'); noise(0.4, 250, 0.1, 2, 0.4, 'bandpass'); },
  door:   () => { tone(300, 180, 0.12, 'triangle', 0.08); },
};

function sfx(name) {
  if (!soundOn || !SOUNDS[name]) return;
  try { SOUNDS[name](); } catch {}
}
