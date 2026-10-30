// The load screen while Stockfish checks a whole game before its review: one
// of four little animations, picked at random, with no numbers - a knight's
// tour, hopping pawns, the coach at work, or a smothered mate in three.

import { avatarSvg, type Mood } from "./avatar";

type Role = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
type Stop = () => void;

const piece = (role: Role, colour: "white" | "black") => {
  const span = document.createElement("span");
  span.className = `mini-piece ${role} ${colour} load-piece`;
  return span;
};

/** A small board of `size` x `size` squares, `cell` pixels each. */
function board(size: number, cell: number): HTMLElement {
  const box = document.createElement("div");
  box.className = "load-board";
  box.style.width = box.style.height = `${size * cell}px`;
  box.style.gridTemplateColumns = `repeat(${size}, ${cell}px)`;
  box.style.setProperty("--cell", `${cell}px`);
  for (let r = 0; r < size; r++) {
    for (let f = 0; f < size; f++) {
      const square = document.createElement("i");
      if ((r + f) % 2) square.className = "dark";
      box.append(square);
    }
  }
  return box;
}

function place(el: HTMLElement, file: number, rank: number, cell: number) {
  el.style.transform = `translate(${file * cell}px, ${rank * cell}px)`;
}

/** A knight hopping round a little board, leaving a trail. */
function knightsTour(stage: HTMLElement, caption: HTMLElement): Stop {
  const cell = 40;
  const box = board(4, cell);
  const knight = piece("knight", "white");
  box.append(knight);
  stage.append(box);
  caption.textContent = "Checking every move…";
  const route: [number, number][] = [[0, 0], [1, 2], [3, 3], [2, 1]];
  let i = 0;
  place(knight, 0, 0, cell);
  const timer = window.setInterval(() => {
    i = (i + 1) % route.length;
    knight.classList.remove("hopping");
    void knight.offsetWidth; // restart the hop
    knight.classList.add("hopping");
    place(knight, route[i][0], route[i][1], cell);
  }, 900);
  return () => clearInterval(timer);
}

/** A wave of pawns hopping one after another. */
function hoppingPawns(stage: HTMLElement, caption: HTMLElement): Stop {
  const row = document.createElement("div");
  row.className = "load-pawns";
  for (let i = 0; i < 5; i++) {
    const pawn = piece("pawn", i % 2 ? "black" : "white");
    pawn.style.animationDelay = `${i * 0.12}s`;
    row.append(pawn);
  }
  stage.append(row);
  caption.textContent = "Lining up every move for a closer look...";
  return () => {};
}

/** The coach sketching, then thinking, then checking the time. */
function coachAtWork(stage: HTMLElement, caption: HTMLElement): Stop {
  const scene = document.createElement("div");
  scene.className = "load-coach";
  const face = document.createElement("div");
  face.className = "load-coach-face";
  const prop = document.createElement("div");
  prop.className = "load-coach-prop";
  scene.append(face, prop);
  stage.append(scene);
  const PHASES: [Mood, string, string][] = [
    ["talk", "Sketching out your game...",
      `<svg viewBox="0 0 80 90" width="80" height="90"><rect x="6" y="6" width="68" height="78" rx="5" fill="var(--card)" stroke="var(--muted)" stroke-width="2"/><path class="load-sketch" d="M16 70 L30 46 L44 60 L60 28" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`],
    ["think", "Thinking it over...",
      `<svg viewBox="0 0 90 80" width="90" height="80"><circle cx="10" cy="70" r="5" fill="var(--muted)" opacity=".5"/><circle cx="22" cy="56" r="8" fill="var(--muted)" opacity=".5"/><ellipse cx="56" cy="30" rx="32" ry="24" fill="var(--muted)" opacity=".35"/><text x="56" y="38" text-anchor="middle" font-size="22" fill="var(--text)">?</text></svg>`],
    ["worried", "Nearly there...",
      `<svg viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="30" fill="var(--card)" stroke="var(--text)" stroke-width="3"/><line x1="40" y1="40" x2="40" y2="20" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/><line class="load-hand" x1="40" y1="40" x2="56" y2="40" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg>`],
  ];
  let i = 0;
  const show = () => {
    const [mood, text, svg] = PHASES[i];
    face.innerHTML = avatarSvg(mood, 96);
    prop.innerHTML = svg;
    caption.textContent = text;
  };
  show();
  const timer = window.setInterval(() => {
    i = (i + 1) % PHASES.length;
    show();
  }, 2800);
  return () => clearInterval(timer);
}

/** A smothered mate in three, played over and over:
 *  1.Nh6+ Kh8 2.Qg8+ Rxg8 3.Nf7# (checked with python-chess). */
function smotheredMate(stage: HTMLElement, caption: HTMLElement): Stop {
  const cell = 26;
  const box = board(8, cell);
  stage.append(box);
  const START: Record<string, [Role, "white" | "black"]> = {
    a8: ["rook", "black"], f8: ["rook", "black"], g8: ["king", "black"],
    a7: ["pawn", "black"], b7: ["pawn", "black"], c7: ["pawn", "black"], g7: ["pawn", "black"], h7: ["pawn", "black"],
    f7: ["knight", "white"], c4: ["queen", "white"],
    a2: ["pawn", "white"], b2: ["pawn", "white"], c2: ["pawn", "white"], g2: ["pawn", "white"], h2: ["pawn", "white"], g1: ["king", "white"],
  };
  const LINE: [string, string, string][] = [
    ["f7", "h6", "Check from the knight and the queen at once."],
    ["g8", "h8", "The king has only one square."],
    ["c4", "g8", "The queen gives herself up!"],
    ["f8", "g8", "The rook has to take her."],
    ["h6", "f7", "Smothered mate: the king is trapped by its own pieces."],
  ];
  const at = (square: string): [number, number] => [square.charCodeAt(0) - 97, 8 - Number(square[1])];
  let pieces = new Map<string, HTMLElement>();
  let timers: number[] = [];
  const later = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
  const reset = () => {
    for (const el of pieces.values()) el.remove();
    box.querySelector(".load-mate")?.remove();
    pieces = new Map();
    for (const [square, [role, colour]] of Object.entries(START)) {
      const el = piece(role, colour);
      el.style.transition = "none";
      place(el, ...at(square), cell);
      box.append(el);
      pieces.set(square, el);
    }
    caption.textContent = "White to play: mate in three.";
  };
  const play = (step: number) => {
    if (step >= LINE.length) {
      later(2600, () => { reset(); later(1600, () => play(0)); });
      return;
    }
    const [from, to, text] = LINE[step];
    const el = pieces.get(from)!;
    pieces.get(to)?.remove();
    el.style.transition = "";
    place(el, ...at(to), cell);
    pieces.delete(from);
    pieces.set(to, el);
    caption.textContent = text;
    if (step === LINE.length - 1) {
      const ring = document.createElement("span");
      ring.className = "load-mate";
      place(ring, ...at("h8"), cell);
      later(500, () => box.append(ring));
    }
    later(1700, () => play(step + 1));
  };
  reset();
  later(1600, () => play(0));
  return () => timers.forEach(clearTimeout);
}

const ANIMATIONS = [knightsTour, hoppingPawns, coachAtWork, smotheredMate];

/** Start one of the animations at random in `stage`; returns how to stop it. */
export function startLoadAnimation(stage: HTMLElement, caption: HTMLElement): Stop {
  stage.replaceChildren();
  const run = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
  const stop = run(stage, caption);
  return () => {
    stop();
    stage.replaceChildren();
  };
}
