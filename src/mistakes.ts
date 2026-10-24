// Your mistakes, as puzzles: positions from your reviewed games (mistakes,
// misses and blunders) and from drills (moves missed on the first try), kept
// on the device and brought back on a schedule - after 1, 3, 7 and then 21
// days while you keep getting them right, and from tomorrow again when you
// don't. Right once more after the 21 days, a position counts as mastered.

export type MistakePhase = "opening" | "middlegame" | "endgame";
export type MistakeKind = "mistake" | "miss" | "drill";

export interface Mistake {
  id: string; // the position and the better move
  fen: string; // the position, your move to play
  best: string; // the better move (UCI)
  played?: string; // what you played (UCI), when it came from a game
  line?: MistakeLine; // how the game got there, when known
  kind: MistakeKind;
  phase: MistakePhase;
  source: string; // "your game against brad12340987", "the London drill"
  added: number; // day numbers (days since 1970, local time)
  due: number;
  stage: number; // right answers in a row (5 = mastered)
}

/** The moves (UCI) from a starting position up to the puzzle's position. */
export interface MistakeLine {
  start: string; // FEN
  moves: string[];
}

const KEY = "chess-trainer-mistakes";
const INTERVALS = [1, 3, 7, 21]; // days until it comes back, after 1, 2, 3, 4 right answers in a row
export const MASTERED = INTERVALS.length + 1;
const KEEP = 500; // the most positions kept (the oldest mastered ones go first)

export const today = (date = new Date()) =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

export function loadMistakes(): Mistake[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveAll(list: Mistake[]) {
  if (list.length > KEEP) {
    // drop the oldest mastered ones first, then the oldest of the rest
    list.sort((a, b) => Number(b.stage >= MASTERED) - Number(a.stage >= MASTERED) || a.added - b.added);
    list.splice(0, list.length - KEEP);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked: they just aren't kept
  }
}

/** A saved position's id: the position (without the move counters) and the better move. */
export const mistakeId = (fen: string, best: string) => `${fen.split(" ").slice(0, 4).join(" ")} ${best}`;

/** Add positions (one already there is left as it is). Returns how many are new. */
export function addMistakes(found: Omit<Mistake, "id" | "added" | "due" | "stage">[]): number {
  const list = loadMistakes();
  const have = new Set(list.map((m) => m.id));
  let added = 0;
  for (const mistake of found) {
    const id = mistakeId(mistake.fen, mistake.best);
    if (have.has(id)) continue;
    have.add(id);
    // a new one is ready to practise straight away
    list.push({ ...mistake, id, added: today(), due: today(), stage: 0 });
    added++;
  }
  if (added) saveAll(list);
  return added;
}

/** Keep how older positions came about, once found (by id). */
export function saveLines(found: Map<string, MistakeLine>) {
  if (!found.size) return;
  const list = loadMistakes();
  for (const mistake of list) {
    const line = found.get(mistake.id);
    if (line) mistake.line = line;
  }
  saveAll(list);
}

/** After an attempt: right first time moves it on; anything else starts it again tomorrow. */
export function recordAttempt(id: string, right: boolean): Mistake | undefined {
  const list = loadMistakes();
  const mistake = list.find((m) => m.id === id);
  if (!mistake) return undefined;
  if (right) {
    mistake.stage = Math.min(mistake.stage + 1, MASTERED);
    if (mistake.stage < MASTERED) mistake.due = today() + INTERVALS[mistake.stage - 1];
  } else {
    mistake.stage = 0;
    mistake.due = today() + 1;
  }
  saveAll(list);
  return mistake;
}

/** The ones waiting today (for a phase, or all), most overdue first. */
export function dueMistakes(phase?: MistakePhase): Mistake[] {
  const now = today();
  return loadMistakes()
    .filter((m) => m.due <= now && m.stage < MASTERED && (!phase || m.phase === phase))
    .sort((a, b) => a.due - b.due || a.added - b.added);
}

/** How far along they are: learning (0-1 right), nearly there (2-4), mastered. */
export function mistakeCounts(phase?: MistakePhase): { learning: number; nearly: number; mastered: number; due: number } {
  const now = today();
  const counts = { learning: 0, nearly: 0, mastered: 0, due: 0 };
  for (const m of loadMistakes()) {
    if (phase && m.phase !== phase) continue;
    if (m.stage >= MASTERED) counts.mastered++;
    else if (m.stage >= 2) counts.nearly++;
    else counts.learning++;
    if (m.due <= now && m.stage < MASTERED) counts.due++;
  }
  return counts;
}

/** Days until it comes back, in words. */
export function comesBack(mistake: Mistake): string {
  if (mistake.stage >= MASTERED) return "mastered: it won't come back unless you want it to";
  const days = mistake.due - today();
  return days <= 1 ? "tomorrow" : `in ${days} days`;
}
