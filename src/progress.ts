// Your progress: a short summary of every game you review as a player
// (accuracy overall and by phase, your slips and what kind they were, the
// opening, the result), kept on the device, and what they add up to: the
// trend, your strongest and weakest phase, your most common slips, your
// openings - and what to practise next.

export type SlipKind = "hanging" | "fork" | "miss" | "mated" | "missed-mate" | "pawn" | "other";
export type GamePhase = "opening" | "middlegame" | "endgame";

export interface GameSummary {
  key: string; // the game (see gameKey in main.ts)
  day: number; // when it was reviewed (days since 1970)
  colour: "white" | "black";
  opponent: string;
  result: "win" | "loss" | "draw" | "unknown";
  accuracy?: number;
  phases: Partial<Record<GamePhase, number>>;
  slips: SlipKind[]; // one per slip of yours (mistake, miss, blunder)
  opening?: string; // the opening's family name, e.g. "Caro-Kann Defense"
}

const KEY = "chess-trainer-progress";
const KEEP = 200; // games
export const PROGRESS_MIN = 3; // games before the picture means anything
const RECENT = 10; // games the picture is made of

export const SLIP_WORDS: Record<SlipKind, string> = {
  hanging: "Leaving a piece undefended",
  fork: "Walking into a fork",
  miss: "Not punishing their slip (a missed chance)",
  mated: "Walking into a checkmate",
  "missed-mate": "Missing a checkmate",
  pawn: "Dropping pawns",
  other: "Positional slips",
};

/** Puzzle themes that practise each kind of slip. */
export const SLIP_THEMES: Record<SlipKind, string[]> = {
  hanging: ["hangingPiece"],
  fork: ["fork"],
  miss: ["hangingPiece", "fork"],
  mated: ["mateIn1", "mateIn2"],
  "missed-mate": ["mateIn1", "mateIn2"],
  pawn: ["hangingPiece"],
  other: [],
};

export function loadSummaries(): GameSummary[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Keep a game's summary (a game reviewed again replaces its old one). */
export function saveSummary(summary: GameSummary) {
  const list = loadSummaries().filter((s) => s.key !== summary.key);
  list.push(summary);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-KEEP)));
  } catch {
    // storage full or blocked: the picture just doesn't include this game
  }
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined);

export interface Picture {
  games: number; // reviewed games so far (all of them)
  recent: GameSummary[]; // the ones the picture is made of, oldest first
  trend: number[]; // accuracy, game by game
  phases: Partial<Record<GamePhase, number>>; // average accuracy
  strongest?: GamePhase;
  weakest?: GamePhase;
  slips: { kind: SlipKind; games: number }[]; // most common first (counted once per game)
  openings: { name: string; colour: "white" | "black"; games: number; wins: number; accuracy?: number }[];
}

/** What the recent games add up to. */
export function picture(): Picture {
  const all = loadSummaries();
  const recent = all.slice(-RECENT);
  const trend = recent.flatMap((g) => (g.accuracy === undefined ? [] : [g.accuracy]));
  const phases: Partial<Record<GamePhase, number>> = {};
  for (const phase of ["opening", "middlegame", "endgame"] as GamePhase[]) {
    const average = mean(recent.flatMap((g) => (g.phases[phase] === undefined ? [] : [g.phases[phase]!])));
    if (average !== undefined) phases[phase] = average;
  }
  const ranked = (Object.entries(phases) as [GamePhase, number][]).sort((a, b) => b[1] - a[1]);
  const slipGames = new Map<SlipKind, number>();
  for (const game of recent) for (const kind of new Set(game.slips)) slipGames.set(kind, (slipGames.get(kind) ?? 0) + 1);
  const slips = [...slipGames].map(([kind, games]) => ({ kind, games }))
    .sort((a, b) => Number(a.kind === "other") - Number(b.kind === "other") || b.games - a.games);
  const byOpening = new Map<string, GameSummary[]>();
  for (const game of recent) {
    const name = `${game.opening ?? "Other openings"}|${game.colour}`;
    byOpening.set(name, [...(byOpening.get(name) ?? []), game]);
  }
  const openings = [...byOpening].map(([key, games]) => {
    const [name, colour] = key.split("|") as [string, "white" | "black"];
    return {
      name, colour, games: games.length, wins: games.filter((g) => g.result === "win").length,
      accuracy: mean(games.flatMap((g) => (g.accuracy === undefined ? [] : [g.accuracy]))),
    };
  }).sort((a, b) => b.games - a.games);
  return {
    games: all.length, recent, trend, phases,
    strongest: ranked.length > 1 ? ranked[0][0] : undefined,
    weakest: ranked.length > 1 ? ranked[ranked.length - 1][0] : undefined,
    slips, openings,
  };
}
