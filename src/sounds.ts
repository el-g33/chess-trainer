// Sound effects (Kenney's CC0 sounds, public/sounds): a wooden knock for a
// move, a slap for a capture, a metal click for check, a cloth swish for
// castling, a bell when the game ends, tones for quiz answers and a tick
// when you're nearly out of time.
// Played with Web Audio (pitched up, see PITCH), which phones allow once the
// page has been touched.

export type Sound = "move" | "capture" | "check" | "castle" | "gameover" | "right" | "wrong" | "tick";

const FILES: Record<Sound, string[]> = {
  move: ["move1", "move2", "move3"], // a few knocks, so moves don't sound mechanical
  capture: ["capture"],
  check: ["check"],
  castle: ["castle"],
  gameover: ["gameover"],
  right: ["right"],
  wrong: ["wrong"],
  tick: ["tick"],
};

let context: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let enabled = true;
let volume = 0.7;
// Played faster than recorded, so higher (1.8 = about 10 semitones up) and snappier
const PITCH = 1.8;

export function setSound(on: boolean, level: number) {
  enabled = on;
  volume = Math.max(0, Math.min(1, level));
}

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null; // no Web Audio here: the app just stays silent
  }
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

/** Start loading the sounds and let the browser play them (call on the first touch or click). */
export function unlockSounds() {
  audio();
  for (const names of Object.values(FILES)) for (const name of names) void load(name);
}

export async function play(sound: Sound) {
  if (!enabled || volume === 0) return;
  const ctx = audio();
  if (!ctx) return;
  const names = FILES[sound];
  const buffer = await load(names[Math.floor(Math.random() * names.length)]);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.playbackRate.value = PITCH;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

/** The sound for a move written in notation: check, castling, capture or a plain move. */
export function soundForMove(san: string): Sound {
  if (san.includes("+") || san.includes("#")) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}
