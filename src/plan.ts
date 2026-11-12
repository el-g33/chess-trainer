// Lesson plans: what a player's recent games say they should work on, the way
// a coach would read them. Each slip of yours gets a theme (a piece left
// loose, a fork walked into, a free piece you didn't take...), games where
// you were clearly winning and didn't win are looked at on their own, and so
// are your openings (how you come out of them, not only the results). The
// biggest costs, in points per game, become the plan's priorities.
//
// Pure: it takes positions and Stockfish's evaluations, so the app and the
// batch tools (tools/plan-test.mjs) work out exactly the same thing.

import type { Chess } from "chessops/chess";
import type { Color, NormalMove } from "chessops/types";
import { opposite } from "chessops/util";

import { afterMove as positionAfter, type Score } from "./coach";
import { dangerAfter, ignoredThreat, targetsOf } from "./narrate";
import { type Evaluation, type Review, fenOf, winningChance } from "./review";
import { forkOf, freeTake, playLine } from "./tactics";

/** What a slip of yours was about. Losses: what you let happen. Misses: what
 *  your opponent left you and you didn't take. */
export type Theme =
  | "hung" | "fork" | "pawn" | "mated" | "missed-mate" | "lost-other"
  | "missed-free" | "missed-fork" | "missed-tactic" | "missed-other";

export const THEME_WORDS: Record<Theme, string> = {
  hung: "Left a piece where it could be taken",
  fork: "Walked into a fork",
  pawn: "Left a pawn to be taken",
  mated: "Walked into a checkmate",
  "missed-mate": "Missed a checkmate",
  "lost-other": "A quieter slip",
  "missed-free": "Didn't take a piece they left loose",
  "missed-fork": "Missed a fork",
  "missed-tactic": "Missed a tactic that won material",
  "missed-other": "Missed a quieter chance",
};

export const SLIP_RATINGS = new Set(["Mistake", "Blunder", "Miss", "Missed Win"]);

const mateFor = (score: Score | undefined, side: Color) =>
  score?.mate !== undefined && (side === "white" ? score.mate > 0 : score.mate < 0);

/** The theme of one slip: the position before it, the move played, and
 *  Stockfish's view of the positions before and after. */
export function slipTheme(before: Chess, played: NormalMove, review: Review,
  beforeEval: Evaluation | undefined, afterEval: Evaluation | undefined): Theme {
  const mover = before.turn;
  const after = positionAfter(before, played);
  if (review.rating === "Miss" || review.rating === "Missed Win") {
    // what was there to take: a mate, a loose piece, a fork, or a line that wins material
    const best = beforeEval?.best;
    if (mateFor(beforeEval?.score, mover)) return "missed-mate";
    if (!best || !before.isLegal(best)) return "missed-other";
    const take = freeTake(before, best);
    if (take && take.free && take.victim !== "pawn") return "missed-free";
    if (forkOf(before, best)) return "missed-fork";
    const line = playLine(before, beforeEval?.line, mover, 8);
    if (line && (line.mate || line.net >= 2 || promotes(line, mover))) return take ? "missed-free" : "missed-tactic";
    return "missed-other";
  }
  if (mateFor(beforeEval?.score, mover) && !mateFor(afterEval?.score, mover)) return "missed-mate";
  if (mateFor(afterEval?.score, opposite(mover))) return "mated";
  const reply = afterEval?.best;
  if (reply && after.isLegal(reply) && targetsOf(positionAfter(after, reply), reply.to).length >= 2) return "fork";
  if (ignoredThreat(before, after, reply)) return "hung";
  const danger = dangerAfter(review, before, after, beforeEval, afterEval, false, mover);
  if (danger && /queen|piece|can be taken/.test(danger.text)) return "hung";
  if (danger && /pawn/.test(danger.text)) return "pawn";
  // nothing left loose: was there a winning tactic you didn't play (a check
  // or capture that wins material, or a pawn through to promote)?
  const best = beforeEval?.best;
  if (best && before.isLegal(best) && (best.from !== played.from || best.to !== played.to)) {
    const line = playLine(before, beforeEval?.line, mover, 8);
    if (line?.mate) return "missed-mate";
    if (line && (line.net >= 2 || promotes(line, mover))) return "missed-tactic";
  }
  return "lost-other";
}

const promotes = (line: { promoted: { side: Color }[] }, side: Color) => line.promoted.some((p) => p.side === side);

// -- A game, as the plan sees it ------------------------------------------------------

export type Phase = "opening" | "middlegame" | "endgame";

export interface PlanSlip {
  ply: number;
  rating: string;
  theme: Theme;
  phase: Phase;
  drop: number; // winning chance lost (0-100), or for a miss, the chance not taken
  winning: boolean; // you were clearly winning just before it
  clock?: number; // the share of your starting time left (0-1), when known
}

export interface PlanGame {
  id: string;
  colour: Color;
  result: "win" | "draw" | "loss";
  opening: string; // "White: 1.d4 d5", "Black: 1.e4 d6"
  openingChance?: number; // your winning chance after move 10 (0-100)
  peak: number; // your best winning chance during the game, after the opening's first moves
  timeout: boolean; // decided on time
  timeTrouble: boolean; // a slip with under a tenth of your time left
  slips: PlanSlip[];
}

export const CLEARLY_WINNING = 85; // a winning chance that should be a win

// -- The diagnosis ----------------------------------------------------------------------

export type Focus = "safety" | "tactics" | "conversion" | "opening" | "endgame" | "time";

export const FOCUS_WORDS: Record<Focus, string> = {
  safety: "Keep your pieces safe",
  tactics: "Spot what they leave",
  conversion: "Win won games",
  opening: "Your weakest opening",
  endgame: "Endgames",
  time: "Your clock",
};

const SAFETY = new Set<Theme>(["hung", "fork", "pawn", "mated"]);
const TACTICS = new Set<Theme>(["missed-free", "missed-fork", "missed-tactic", "missed-mate"]);

export interface OpeningRow {
  name: string;
  games: number;
  score: number; // points per game (0-1)
  chance?: number; // your average winning chance after move 10
}

export interface Priority {
  focus: Focus;
  cost: number; // points per game it costs you
  metric: string; // what it's measured by, in words
  value: number; // the measure now
  detail?: string; // e.g. the opening it's about
}

export interface Diagnosis {
  games: number;
  results: Record<PlanGame["result"], number>;
  perGame: Partial<Record<Theme, number>>;
  winning: number; // games where you were clearly winning
  thrown: number; // ...and didn't win
  thrownHow: Partial<Record<Theme | "timeout" | "unclear", number>>; // the first slip after you were winning
  openings: OpeningRow[];
  timeTroubleGames?: number; // when clocks are known
  priorities: Priority[];
  close: boolean; // the top two are within 15% of each other
}

const points = (result: PlanGame["result"]) => (result === "win" ? 1 : result === "draw" ? 0.5 : 0);

export function diagnose(games: PlanGame[]): Diagnosis {
  const n = Math.max(1, games.length);
  const results = { win: 0, draw: 0, loss: 0 };
  const perGame: Partial<Record<Theme, number>> = {};
  const cost: Partial<Record<Focus, number>> = {};
  const add = (focus: Focus, value: number) => (cost[focus] = (cost[focus] ?? 0) + value);
  let winning = 0;
  let thrown = 0;
  const thrownHow: Diagnosis["thrownHow"] = {};
  let clocked = 0;
  let troubled = 0;
  for (const game of games) {
    results[game.result]++;
    const won = game.peak >= CLEARLY_WINNING;
    const threw = won && game.result !== "win";
    if (won) winning++;
    if (threw) {
      thrown++;
      const first = game.slips.find((s) => s.winning && s.drop >= 10);
      const how = game.timeout ? "timeout" : first?.theme ?? "unclear";
      thrownHow[how] = (thrownHow[how] ?? 0) + 1;
      // the points let slip go to what let them slip: a piece left loose, a
      // tactic missed, the clock - or anything else, the craft of winning a won game
      const focus: Focus = how === "timeout" ? "time"
        : SAFETY.has(how as Theme) ? "safety" : TACTICS.has(how as Theme) ? "tactics" : "conversion";
      add(focus, 1 - points(game.result));
    }
    if (game.slips.some((s) => s.clock !== undefined)) clocked++;
    if (game.timeTrouble || (game.timeout && game.result !== "win")) troubled++;
    for (const slip of game.slips) {
      perGame[slip.theme] = (perGame[slip.theme] ?? 0) + 1 / n;
      // a slip in a won game that was then thrown counts once, under winning won games
      if (threw && slip.winning) continue;
      // (loose pieces and tactics wherever they happen; the endgame's own
      // technique is its quieter slips - a king or pawn move that loses)
      const value = slip.drop / 100;
      if (SAFETY.has(slip.theme)) add("safety", value);
      else if (TACTICS.has(slip.theme)) add("tactics", value);
      else if (slip.phase === "endgame") add("endgame", value);
    }
  }
  // Openings: by your colour and the first moves; the weakest with enough games
  const groups = new Map<string, PlanGame[]>();
  for (const game of games) groups.set(game.opening, [...(groups.get(game.opening) ?? []), game]);
  const openings: OpeningRow[] = [...groups].map(([name, list]) => {
    const chances = list.flatMap((g) => (g.openingChance === undefined ? [] : [g.openingChance]));
    return {
      name, games: list.length, score: list.reduce((s, g) => s + points(g.result), 0) / list.length,
      chance: chances.length ? chances.reduce((a, b) => a + b, 0) / chances.length : undefined,
    };
  }).sort((a, b) => b.games - a.games);
  const enough = openings.filter((o) => o.games >= Math.max(5, Math.round(n * 0.05)) && o.chance !== undefined);
  const weakest = [...enough].sort((a, b) => a.chance! - b.chance!)[0];
  const priorities: Priority[] = [
    { focus: "safety", cost: (cost.safety ?? 0) / n, metric: "Pieces left to be taken, a game",
      value: (perGame.hung ?? 0) + (perGame.fork ?? 0) + (perGame.mated ?? 0) },
    { focus: "tactics", cost: (cost.tactics ?? 0) / n, metric: "Free pieces and tactics missed, a game",
      value: (perGame["missed-free"] ?? 0) + (perGame["missed-fork"] ?? 0) + (perGame["missed-tactic"] ?? 0) + (perGame["missed-mate"] ?? 0) },
    { focus: "conversion", cost: (cost.conversion ?? 0) / n, metric: "Winning positions not won",
      value: winning ? thrown / winning : 0 },
    { focus: "endgame", cost: (cost.endgame ?? 0) / n, metric: "Endgame slips, a game",
      value: games.reduce((s, g) => s + g.slips.filter((x) => x.phase === "endgame" && !SAFETY.has(x.theme) && !TACTICS.has(x.theme)).length, 0) / n },
  ];
  if (weakest && weakest.chance! < 45) {
    // what coming out of the opening worse costs: the chance given away, times its share of your games
    priorities.push({ focus: "opening", cost: ((50 - weakest.chance!) / 100) * (weakest.games / n), metric: "Your chance after move 10",
      value: weakest.chance!, detail: weakest.name });
  }
  if (clocked >= n / 2) {
    // games lost on time, and slips with under a tenth of your time left
    priorities.push({ focus: "time", cost: ((cost.time ?? 0) + troubled * 0.1) / n, metric: "Games with time trouble", value: troubled / n });
  } else priorities[2].cost += (cost.time ?? 0) / n; // (no clocks: counted with winning won games)
  priorities.sort((a, b) => b.cost - a.cost);
  // two priorities this close: either could come first, so you choose
  const close = priorities.length > 1 && priorities[1].cost >= priorities[0].cost * 0.85;
  return {
    games: games.length, results, perGame, winning, thrown, thrownHow, openings, priorities, close,
    ...(clocked >= n / 2 ? { timeTroubleGames: troubled } : {}),
  };
}

/** Your winning chance from a score, for the plan's numbers. */
export const chanceOf = (score: Score | undefined, colour: Color) => (score ? winningChance(score, colour) : undefined);

// -- From a reviewed game -------------------------------------------------------------

/** A position from your games to practise: the move to find, and its theme. */
export interface PlanPosition {
  fen: string;
  best: string; // UCI
  theme: Theme;
  phase: Phase;
  game: string; // the game's id
  ply: number;
}

type Rated = Pick<Review, "rating" | "chanceBefore" | "chanceAfter"> | undefined;

/** One of your games as the plan sees it, and the positions from it to
 *  practise. `positions` are the game's positions (0 = the start), `moves`
 *  the moves played, `ratings` each move's review, `clocks` the time left
 *  after each move (seconds) when known, `base` the starting time. */
export function planGameOf(id: string, user: Color, result: PlanGame["result"], positions: Chess[], moves: NormalMove[], sans: string[],
  evals: Map<string, Evaluation>, ratings: Rated[], phaseOf: (ply: number) => Phase, timeout = false,
  clocks: (number | undefined)[] = [], base?: number): { game: PlanGame; positions: PlanPosition[] } {
  const chanceAt = (ply: number) => chanceOf(evals.get(fenOf(positions[ply]))?.score, user);
  const slips: PlanSlip[] = [];
  const practise: PlanPosition[] = [];
  ratings.forEach((rated, i) => {
    const before = positions[i];
    const played = moves[i];
    if (!rated || !before || !played || before.turn !== user || !SLIP_RATINGS.has(rated.rating)) return;
    const beforeEval = evals.get(fenOf(before));
    const afterEval = evals.get(fenOf(positions[i + 1]));
    const theme = slipTheme(before, played, rated as Review, beforeEval, afterEval);
    const clock = clocks[i];
    const slip: PlanSlip = {
      ply: i + 1, rating: rated.rating, theme, phase: phaseOf(i),
      drop: Math.max(0, rated.chanceBefore - rated.chanceAfter), winning: rated.chanceBefore >= CLEARLY_WINNING,
      ...(clock !== undefined && base ? { clock: clock / base } : {}),
    };
    slips.push(slip);
    // worth practising: a slip with a clear reason (not a quiet engine preference)
    const best = beforeEval?.best;
    if (best && theme !== "lost-other" && theme !== "missed-other" && slip.drop >= 10) {
      practise.push({ fen: fenOf(before), best: uciOf(best), theme, phase: slip.phase, game: id, ply: i + 1 });
    }
  });
  const chances = positions.slice(8).map((_, k) => chanceAt(k + 8)).filter((c): c is number => c !== undefined);
  const first = sans[0] ?? "";
  const second = sans[1] ?? "";
  return {
    game: {
      id, colour: user, result,
      opening: `${user === "white" ? "White" : "Black"}: 1.${first} ${second}`.trim(),
      openingChance: positions.length > 20 ? chanceAt(20) : undefined,
      peak: chances.length ? Math.max(...chances) : 50,
      timeout,
      timeTrouble: slips.some((s) => s.clock !== undefined && s.clock < 0.1 && s.drop >= 10),
      slips,
    },
    positions: practise,
  };
}

const uciOf = (move: NormalMove) => `${"abcdefgh"[move.from & 7]}${(move.from >> 3) + 1}${"abcdefgh"[move.to & 7]}${(move.to >> 3) + 1}${move.promotion ? (move.promotion === "knight" ? "n" : move.promotion[0]) : ""}`;

// -- The plan --------------------------------------------------------------------------

/** What a week works on: one focus, or the top two together under game conditions. */
export type WeekFocus = Focus | "together";

export interface PlanWeek {
  focus: WeekFocus;
  pair?: [Focus, Focus]; // for "together"
  baseline: number; // the focus's measure when the plan was made
  done: number; // sessions done (of SESSIONS)
  results: number[]; // the measure in each session's game
}

export interface NextStep {
  title: string;
  text: string;
  kind: "quiet" | "opening" | "endgame";
  detail?: string;
}

export type PuzzleBand = "first" | "beginner" | "club" | "advanced";

export interface LessonPlan {
  made: number; // when (ms)
  from: "games" | "goal";
  games: number; // games it was made from
  weeks: PlanWeek[];
  week: number; // the week you're on
  step: number; // the step of today's session you're on (0-4)
  next: NextStep[];
  band: PuzzleBand;
}

export const SESSIONS = 5;
export const STEPS = ["Warm-up", "Learn", "Drill", "Play", "Check"] as const;

export const WEEK_TITLES: Record<WeekFocus, string> = { ...FOCUS_WORDS, together: "Both, in your games" };

/** The 4-week plan: the biggest cost first, for two weeks when it's well
 *  ahead of the next; then the next; then the two together in games.
 *  `goal`, when you chose what to work on, comes first instead. */
export function buildPlan(diagnosis: Diagnosis, band: PuzzleBand, goal?: Focus, quietPerGame = 0): LessonPlan {
  const trainable = diagnosis.priorities.filter((p) => p.cost > 0.01);
  const ranked = goal ? [goal, ...trainable.map((p) => p.focus).filter((f) => f !== goal)] : trainable.map((p) => p.focus);
  const first = ranked[0] ?? "safety";
  const second = ranked.find((f) => f !== first) ?? (first === "safety" ? "tactics" : "safety");
  const cost = (focus: Focus) => diagnosis.priorities.find((p) => p.focus === focus)?.cost ?? 0;
  const value = (focus: Focus) => diagnosis.priorities.find((p) => p.focus === focus)?.value ?? 0;
  const well = cost(first) >= cost(second) * 1.4;
  const order: Focus[] = well ? [first, first, second] : [first, second, first];
  const weeks: PlanWeek[] = [
    ...order.map((focus) => ({ focus, baseline: value(focus), done: 0, results: [] })),
    { focus: "together", pair: [first, second], baseline: value(first), done: 0, results: [] },
  ];
  // What comes after: the quieter chances, your weakest opening, endgame technique
  const next: NextStep[] = [];
  if (quietPerGame >= 0.5) {
    next.push({ kind: "quiet", title: "Quieter chances",
      text: `About ${quietPerGame.toFixed(1)} a game: a better square, a pawn break, castling at the right moment. The next step once loose pieces are rare.` });
  }
  const shown = diagnosis.openings.filter((o) => o.games >= 5 && o.chance !== undefined);
  const weakest = [...shown].sort((a, b) => a.chance! - b.chance!)[0];
  if (weakest && weakest.chance! < 48) {
    next.push({ kind: "opening", title: "Your weakest opening", detail: weakest.name,
      text: `${weakest.name}: you come out of move 10 with about ${Math.round(weakest.chance!)}% winning chances (${weakest.games} games).` });
  }
  if (!weeks.some((w) => w.focus === "endgame")) {
    next.push({ kind: "endgame", title: "Endgame technique", text: "King activity, passed pawns and the key rook endings: the lessons on the Endgame tab." });
  }
  return { made: Date.now(), from: goal ? "goal" : "games", games: diagnosis.games, weeks, week: 0, step: 0, next, band };
}

/** Which part of the game a session's drill comes from: each phase in turn,
 *  so the same habits get practised in the opening, middlegame and endgame. */
export const SESSION_PHASES: (Phase | null)[] = ["opening", "middlegame", "endgame", "middlegame", null];

/** The themes of your own positions that fit a focus. */
export const FOCUS_THEMES: Record<Focus, Theme[]> = {
  safety: ["hung", "fork", "pawn", "mated"],
  tactics: ["missed-free", "missed-fork", "missed-tactic", "missed-mate"],
  conversion: ["hung", "missed-free", "missed-tactic"],
  endgame: ["hung", "missed-tactic", "missed-free", "pawn"],
  opening: ["hung", "pawn", "missed-free", "fork"],
  time: ["hung", "missed-free"],
};

/** Puzzle themes (Lichess's names) that train a focus. */
export const FOCUS_PUZZLES: Record<Focus, string[]> = {
  safety: ["defensiveMove", "hangingPiece", "fork"],
  tactics: ["hangingPiece", "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "trappedPiece", "capturingDefender", "mateIn1", "mateIn2", "backRankMate", "promotion"],
  conversion: ["hangingPiece", "fork", "mateIn2", "advancedPawn", "promotion"],
  endgame: ["advancedPawn", "promotion", "skewer", "fork", "mateIn2"],
  opening: ["attackingF2F7", "hangingPiece", "fork", "pin", "trappedPiece"],
  time: ["mateIn1", "hangingPiece", "fork"],
};

/** The lesson titles (from the Training tabs) for each focus's Learn step, in order. */
export const FOCUS_LESSONS: Record<Focus, string[]> = {
  safety: ["The blunder check", "Watch f7 and f2", "Spotting weaknesses", "The blunder check", "Calculating"],
  tactics: ["Checks, captures, threats", "Calculating", "Attacking the king", "Checks, captures, threats", "Using weaknesses"],
  conversion: ["When to trade", "Making a plan", "Improving your worst piece", "Passed pawns", "When to trade"],
  endgame: ["The active king", "The opposition", "The rule of the square", "Passed pawns", "Rooks behind passed pawns"],
  opening: ["Take the centre", "Develop your pieces", "Castle early", "Don't waste moves", "Connect your rooks"],
  time: ["The blunder check", "Calculating", "The blunder check", "Calculating", "The blunder check"],
};

/** A week's measure in one game (lower is better). */
export function measure(focus: Focus, game: PlanGame): number {
  const count = (themes: Theme[]) => game.slips.filter((s) => themes.includes(s.theme)).length;
  switch (focus) {
    case "safety": return count(["hung", "fork", "mated"]);
    case "tactics": return count(["missed-free", "missed-fork", "missed-tactic", "missed-mate"]);
    case "endgame": return game.slips.filter((s) => s.phase === "endgame" && !SAFETY.has(s.theme) && !TACTICS.has(s.theme)).length;
    case "conversion": return game.peak >= CLEARLY_WINNING && game.result !== "win" ? 1 : 0;
    case "opening": return 100 - (game.openingChance ?? 50);
    case "time": return game.timeTrouble ? 1 : 0;
  }
}
