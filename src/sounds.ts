// Sound effects, in four styles to choose from in the settings:
//  - Original: Kenney's CC0 recordings (public/sounds), pitched up, with the
//    top end lifted and a crisp click on each move
//  - Felt & walnut, Crisp wood, Soft app: made on the spot with Web Audio
// Each style has a move, capture, check, castling, promotion, illegal move,
// game start and checkmate sound. Their moves play a little lower than yours,
// so you can tell who moved without looking. Phones only allow sound once the
// page has been touched.

export type Sound = "move" | "capture" | "check" | "castle" | "promote" | "illegal" | "start" | "mate"
  | "gameover" | "right" | "wrong" | "tick";

export type SoundStyle = "original" | "felt" | "wood" | "soft";

export const SOUND_STYLES: Record<SoundStyle, string> = {
  original: "Original",
  felt: "Felt & walnut",
  wood: "Crisp wood",
  soft: "Soft app",
};

const THEIR_PITCH = 0.84; // their moves: about three semitones lower

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let enabled = true;
let volume = 0.7;
let style: SoundStyle = "original";
let shift = 1; // the pitch of the sound being made (lower for their moves)

export function setSound(on: boolean, level: number, chosen: SoundStyle = style) {
  enabled = on;
  volume = Math.max(0, Math.min(1, level));
  style = chosen;
  if (master) master.gain.value = volume;
}

function audio(): AudioContext | null {
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = volume;
      master.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null; // no Web Audio here: the app just stays silent
  }
}

// -- Building blocks -------------------------------------------------------------

const vary = (f: number, amount = 0.04) => f * (1 + (Math.random() * 2 - 1) * amount);
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12); // MIDI note number to Hz

interface ToneOptions { type?: OscillatorType; f: number; f2?: number; t?: number; a?: number; d?: number; vol?: number; lp?: number }

/** A note: an oscillator with a quick attack and a decay, optionally sliding. */
function tone({ type = "sine", f, f2, t = 0, a = 0.004, d = 0.2, vol = 0.4, lp }: ToneOptions) {
  const c = context!;
  const start = c.currentTime + t;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f * shift, start);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2 * shift, start + a + d);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + a + d);
  let node: AudioNode = osc.connect(gain);
  if (lp) {
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lp;
    node = node.connect(filter);
  }
  node.connect(master!);
  osc.start(start);
  osc.stop(start + a + d + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;
interface NoiseOptions { t?: number; d?: number; vol?: number; type?: BiquadFilterType; f?: number; q?: number; f2?: number }

/** A burst of filtered noise: the "wood" and "click" of a knock. */
function noise({ t = 0, d = 0.05, vol = 0.4, type = "bandpass", f = 2000, q = 1, f2 }: NoiseOptions) {
  const c = context!;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = c.currentTime + t;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(f * shift, start);
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2 * shift, start + d);
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
  src.connect(filter).connect(gain).connect(master!);
  src.start(start, Math.random() * 0.5);
  src.stop(start + d + 0.02);
}

/** A crisp tick: the click of a piece touching the board. */
const tick = ({ t = 0, vol = 0.25 } = {}) => noise({ t, d: 0.012, vol, type: "highpass", f: 4500 });

/** A bell: a few inharmonic partials ringing out. */
function bell(f: number, t = 0, vol = 0.25, d = 1.2) {
  for (const [ratio, level] of [[1, 1], [2.0, 0.5], [2.76, 0.35], [5.4, 0.15]]) {
    tone({ f: f * ratio, t, a: 0.003, d: d / ratio ** 0.5, vol: vol * level });
  }
}

/** A wooden knock: a thump with a sliding pitch and a crack of noise. */
function knock({ t = 0, pitch = 1, vol = 1, bright = 1 }) {
  tone({ f: vary(190 * pitch), f2: 110 * pitch, t, d: 0.09, vol: 0.55 * vol });
  tone({ type: "triangle", f: vary(820 * pitch * bright), t, a: 0.002, d: 0.035, vol: 0.25 * vol });
  noise({ t, d: 0.035, vol: 0.5 * vol, f: vary(2300 * bright), q: 2.5 });
}

/** A heavy piece with a felt base on a thick wooden board. */
function thock({ t = 0, pitch = 1, vol = 1 }) {
  tone({ f: vary(150 * pitch), f2: 85 * pitch, t, a: 0.003, d: 0.12, vol: 0.7 * vol });
  tone({ type: "triangle", f: vary(420 * pitch), t, a: 0.002, d: 0.05, vol: 0.18 * vol, lp: 900 });
  noise({ t, d: 0.05, vol: 0.45 * vol, type: "lowpass", f: vary(700 * pitch), q: 0.7 });
}

/** A hard click with a short ring. */
function clack({ t = 0, pitch = 1, vol = 1 }) {
  noise({ t, d: 0.02, vol: 0.7 * vol, type: "highpass", f: 2600 * pitch, q: 0.8 });
  tone({ f: vary(2900 * pitch, 0.03), t, a: 0.001, d: 0.09, vol: 0.12 * vol });
  tone({ f: vary(1250 * pitch, 0.03), t, a: 0.001, d: 0.06, vol: 0.18 * vol });
  tone({ f: 260 * pitch, f2: 160 * pitch, t, d: 0.05, vol: 0.35 * vol });
}

/** A marimba note: a sine with a short, woody overtone. */
function mallet(f: number, t = 0, vol = 0.45, d = 0.5) {
  tone({ f, t, a: 0.003, d, vol });
  tone({ f: f * 4, t, a: 0.002, d: 0.06, vol: vol * 0.35 });
  noise({ t, d: 0.015, vol: 0.12, f: 3000, q: 1 });
}

function load(name: string): Promise<AudioBuffer | null> {
  if (!buffers.has(name)) {
    buffers.set(
      name,
      fetch(`${import.meta.env.BASE_URL}sounds/${name}.wav`)
        .then((r) => r.arrayBuffer())
        .then((data) => audio()?.decodeAudioData(data) ?? null)
        .catch(() => null),
    );
  }
  return buffers.get(name)!;
}

/** One of the recorded sounds: sped up (higher) by rate, with the top end
 *  lifted by bright (in dB). */
async function file(name: string, { rate = 1.8, vol = 0.9, bright = 0, t = 0 } = {}) {
  const c = audio();
  const pitch = shift; // (the shift is only set while the sound is being started)
  const buffer = await load(name);
  if (!c || !buffer) return;
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = vol;
  src.buffer = buffer;
  src.playbackRate.value = rate * pitch;
  let node: AudioNode = src;
  if (bright) {
    const shelf = c.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 2500;
    shelf.gain.value = bright;
    const presence = c.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 6000;
    presence.Q.value = 0.9;
    presence.gain.value = bright * 0.5;
    node = node.connect(shelf).connect(presence);
  }
  node.connect(gain).connect(master!);
  src.start(c.currentTime + t);
}

const moveFile = () => `move${1 + Math.floor(Math.random() * 3)}`;

// -- The styles ------------------------------------------------------------------

type Kit = Record<"move" | "capture" | "check" | "castle" | "promote" | "illegal" | "start" | "mate", () => void>;

const KITS: Record<SoundStyle, Kit> = {
  original: {
    move: () => { void file(moveFile(), { rate: vary(2.4, 0.03), bright: 10 }); tick({ vol: 0.22 }); },
    capture: () => { void file("capture", { rate: 2.3, bright: 10 }); tick({ vol: 0.32 }); },
    check: () => { void file("check", { rate: 2.1, bright: 8 }); tick({ vol: 0.2 }); },
    castle: () => { void file("castle", { rate: 2.3, bright: 9 }); tick({ vol: 0.22 }); tick({ t: 0.12, vol: 0.18 }); },
    promote: () => { void file(moveFile(), { rate: 2.4, bright: 10 }); tick({ vol: 0.22 }); void file("right", { rate: 1.9, bright: 6, t: 0.07, vol: 0.8 }); },
    illegal: () => void file("wrong", { rate: 1.8, bright: 4, vol: 0.8 }),
    start: () => void file("gameover", { rate: 2.4, bright: 8, vol: 0.6 }),
    mate: () => { void file("check", { rate: 2.1, bright: 8 }); tick({ vol: 0.25 }); void file("gameover", { rate: 1.8, bright: 8, t: 0.22 }); },
  },
  felt: {
    move: () => { thock({ pitch: vary(1.45, 0.05) }); tick({ vol: 0.22 }); },
    capture: () => { thock({ pitch: 1.6, vol: 1.1 }); clack({ t: 0.004, pitch: 0.8, vol: 0.5 }); thock({ t: 0.05, pitch: 1.2, vol: 0.8 }); tick({ vol: 0.3 }); },
    check: () => { thock({ pitch: 1.45 }); tick({ vol: 0.22 }); mallet(NOTE(84), 0.07, 0.28, 0.4); mallet(NOTE(88), 0.15, 0.25, 0.55); },
    castle: () => {
      thock({ pitch: 1.3 });
      tick({ vol: 0.2 });
      noise({ t: 0.04, d: 0.14, vol: 0.12, type: "bandpass", f: 1500, f2: 3500, q: 0.6 });
      thock({ t: 0.16, pitch: 1.45 });
      tick({ t: 0.16, vol: 0.2 });
    },
    promote: () => { thock({ pitch: 1.45 }); tick({ vol: 0.22 }); [76, 79, 84, 88].forEach((n, i) => mallet(NOTE(n), 0.06 + i * 0.06, 0.25, 0.4)); },
    illegal: () => { tone({ f: 200, d: 0.09, vol: 0.4, lp: 900 }); tone({ f: 180, t: 0.1, d: 0.12, vol: 0.4, lp: 900 }); },
    start: () => { mallet(NOTE(72), 0, 0.3, 0.5); mallet(NOTE(79), 0.12, 0.3, 0.7); },
    mate: () => {
      thock({ pitch: 1.5, vol: 1.2 });
      tick({ vol: 0.3 });
      bell(NOTE(45), 0.1, 0.35, 2.4);
      for (const n of [67, 72, 76, 79]) mallet(NOTE(n), 0.3, 0.2, 1.6);
    },
  },
  wood: {
    move: () => { knock({ pitch: vary(1.35, 0.06), bright: 1.35 }); tick({ vol: 0.2 }); },
    capture: () => {
      knock({ pitch: 1.5, vol: 1.1, bright: 1.6 });
      knock({ t: 0.045, pitch: 1.15, vol: 0.9, bright: 1.3 });
      noise({ t: 0.04, d: 0.08, vol: 0.3, f: 2000, q: 0.8 });
      tick({ vol: 0.3 });
    },
    check: () => { knock({ pitch: 1.4, bright: 1.35 }); tick({ vol: 0.2 }); mallet(NOTE(86), 0.06, 0.3, 0.35); mallet(NOTE(91), 0.14, 0.3, 0.45); },
    castle: () => {
      knock({ pitch: 1.1, bright: 1.3 });
      tick({ vol: 0.2 });
      noise({ t: 0.03, d: 0.16, vol: 0.18, type: "highpass", f: 2000, f2: 6000 });
      knock({ t: 0.17, pitch: 1.3, bright: 1.3 });
      tick({ t: 0.17, vol: 0.2 });
    },
    promote: () => { knock({ pitch: 1.35, bright: 1.35 }); tick({ vol: 0.2 }); [79, 84, 88, 91].forEach((n, i) => mallet(NOTE(n), 0.06 + i * 0.06, 0.25, 0.4)); },
    illegal: () => { knock({ pitch: 0.8, bright: 0.7 }); knock({ t: 0.1, pitch: 0.75, bright: 0.7 }); },
    start: () => { mallet(NOTE(79), 0, 0.3, 0.5); mallet(NOTE(86), 0.12, 0.3, 0.7); },
    mate: () => {
      knock({ pitch: 1.4, vol: 1.1, bright: 1.4 });
      tick({ vol: 0.3 });
      bell(NOTE(47), 0.08, 0.35, 2.2);
      [72, 76, 79, 84].forEach((n, i) => mallet(NOTE(n), 0.2 + i * 0.09, 0.28, 0.9));
    },
  },
  soft: {
    move: () => { tone({ f: vary(1150, 0.05), d: 0.03, vol: 0.51 }); noise({ d: 0.012, vol: 0.4, type: "highpass", f: 4000 }); },
    capture: () => { tone({ f: 600, f2: 900, d: 0.05, vol: 0.64 }); tone({ f: 1300, t: 0.04, d: 0.04, vol: 0.4 }); noise({ d: 0.02, vol: 0.48, type: "bandpass", f: 2500 }); },
    check: () => { tone({ f: NOTE(81), d: 0.12, vol: 0.4 }); tone({ f: NOTE(86), t: 0.1, d: 0.2, vol: 0.4 }); },
    castle: () => {
      tone({ f: 900, d: 0.03, vol: 0.48 });
      noise({ t: 0.02, d: 0.12, vol: 0.19, type: "highpass", f: 2000, f2: 6000 });
      tone({ f: 1100, t: 0.13, d: 0.03, vol: 0.48 });
    },
    promote: () => [76, 81, 86, 88].forEach((n, i) => tone({ f: NOTE(n), t: i * 0.05, d: 0.15, vol: 0.32 })),
    illegal: () => { tone({ type: "triangle", f: 180, d: 0.07, vol: 0.56 }); tone({ type: "triangle", f: 180, t: 0.1, d: 0.07, vol: 0.56 }); },
    start: () => { tone({ f: NOTE(76), d: 0.15, vol: 0.35 }); tone({ f: NOTE(83), t: 0.1, d: 0.3, vol: 0.35 }); },
    mate: () => [72, 76, 79, 84].forEach((n, i) => bell(NOTE(n), i * 0.09, 0.13, 1.4)),
  },
};

// The app's other sounds (quiz answers, the clock, a game that ends without
// checkmate) stay the recordings, as before
const OTHERS: Partial<Record<Sound, string>> = { gameover: "gameover", right: "right", wrong: "wrong", tick: "tick" };

/** Start loading the sounds and let the browser play them (call on the first touch or click). */
export function unlockSounds() {
  audio();
  for (const name of ["move1", "move2", "move3", "capture", "check", "castle", "gameover", "right", "wrong", "tick"]) void load(name);
}

/** Play a sound; `theirs` plays a move a little lower, as the opponent's. */
export async function play(sound: Sound, theirs = false) {
  if (!enabled || volume === 0) return;
  const c = audio();
  if (!c || !master) return;
  const recorded = OTHERS[sound];
  if (recorded) {
    shift = 1;
    await file(recorded);
    return;
  }
  shift = theirs ? THEIR_PITCH : 1;
  try {
    KITS[style][sound as keyof Kit]();
  } finally {
    shift = 1;
  }
}

/** The sound for a move written in notation: checkmate, promotion, check,
 *  castling, capture or a plain move. */
export function soundForMove(san: string): Sound {
  if (san.includes("#")) return "mate";
  if (san.includes("=")) return "promote";
  if (san.includes("+")) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}
