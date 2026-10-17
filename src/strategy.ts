// The strategy coach: tools for seeing your opponent's ideas and thinking a
// few moves ahead - a port of the desktop app's strategy.py (same wording).
// Stockfish does all the chess work; this turns it into plain words.
//
//   threatCheck() - What is my opponent threatening right now? Works by
//                   imagining you "pass" (skip your move) and asking Stockfish
//                   what your opponent would play if they could move twice in
//                   a row. That move is their threat.
//   planAhead()   - Stockfish's expected next few moves for both sides.
//   gradeGuess()  - Marks your answer in the "spot the idea" quiz.
import type { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { Color, NormalMove } from "chessops/types";
import { makeUci, opposite } from "chessops/util";

import {
  afterMove,
  colourName,
  describeMove,
  materialBalance,
  moveIdeas,
  scoreLeader,
  variationSan,
  type Score,
} from "./coach";
import { formatScore, verdictWords, winningChance } from "./review";

// How long Stockfish thinks for each tool, in seconds.
export const THREAT_TIME = 0.7;
export const PLAN_TIME = 1.5;

// How many moves (both sides counted) "Plan ahead" shows.
const PLAN_PLIES = 6;

// In the quiz, a guess counts as correct if it is nearly as strong as the
// opponent's best idea (within this many percentage points of winning chance).
const QUIZ_CLOSE_ENOUGH = 5;

/** What the coach needs from Stockfish: its top lines, scores from White's
 *  point of view, and each line's moves (already chessops moves). */
export interface CoachEngine {
  analyse(position: Chess, seconds: number, lines?: number): Promise<{ score: Score; pv: NormalMove[] }[]>;
}

const bullets = (ideas: string[]) => ideas.map((idea) => `• ${idea}`);

function materialGain(before: Chess, after: Chess, side: Color): number {
  const change = materialBalance(after) - materialBalance(before);
  return side === "white" ? change : -change;
}

function describeGain(gain: number, sideName: string): string {
  if (gain > 0) return `${sideName} would win ${gain} point(s) of material.`;
  if (gain < 0) return `${sideName} would lose ${-gain} point(s) of material.`;
  return "Material would stay the same.";
}

/** The position if the side to move skipped its move (a "null move"). */
export function passMove(position: Chess): Chess {
  const passed = position.clone();
  if (passed.turn === "black") passed.fullmoves += 1;
  passed.halfmoves += 1;
  passed.epSquare = undefined;
  passed.turn = opposite(passed.turn);
  return passed;
}

export interface Threat {
  you: Color;
  them: Color;
  inCheck: boolean;
  serious: boolean;
  severity?: string;
  threatMove?: NormalMove;
  threatSan?: string;
  passed?: Chess; // the position with your move skipped
  goodGuesses: Set<string>; // quiz answers that count (UCI)
  text: string;
}

/** What does the side that just moved threaten to do next? */
export async function threatCheck(engine: CoachEngine, position: Chess): Promise<Threat> {
  const you = position.turn;
  const them = opposite(you);
  const themName = colourName(them);
  const result: Threat = { you, them, inCheck: false, serious: false, goodGuesses: new Set(), text: "" };

  if (position.isCheck()) {
    result.text =
      `Threat check\nYou're in check! The threat is right in front of you: ` +
      `${themName} is attacking your king, so deal with the check first.`;
    result.inCheck = true;
    return result;
  }

  // Imagine you pass, so it's your opponent's move again.
  const passed = passMove(position);
  const [now] = await engine.analyse(position, THREAT_TIME);
  const infos = await engine.analyse(passed, THREAT_TIME, 3);
  const best = infos[0];
  if (!best?.pv.length) {
    result.text = `Threat check\n${themName} has no moves to threaten anything with.`;
    return result;
  }

  const threat = best.pv[0];
  const line = best.pv.slice(0, 4);
  // How much worse your position gets if you ignore the threat.
  const loss = Math.max(0, winningChance(now.score, you) - winningChance(best.score, you));
  const themMate = best.score.mate !== undefined ? (them === "white" ? best.score.mate : -best.score.mate) : 0;
  const mateIn = themMate > 0 ? themMate : undefined;

  // Skipping a move always costs a little (a "tempo"), so small losses don't count.
  let severity: string | undefined;
  if (mateIn) severity = `Checkmate threat! ${themName} threatens mate in ${mateIn}`;
  else if (loss < 10) severity = undefined;
  else if (loss < 20) severity = "A small threat";
  else if (loss < 35) severity = "A serious threat";
  else severity = "A big threat";

  // What the threat line would win
  let afterLine = passed.clone();
  for (const move of line) afterLine = afterMove(afterLine, move);
  const gain = materialGain(passed, afterLine, them);

  // Quiz answers that count as correct: the threat, or anything nearly as strong.
  const bestChance = winningChance(best.score, them);
  for (const info of infos) {
    if (info.pv.length && bestChance - winningChance(info.score, them) <= QUIZ_CLOSE_ENOUGH) {
      result.goodGuesses.add(makeUci(info.pv[0]));
    }
  }

  const san = makeSan(passed, threat);
  const description = describeMove(passed, threat);
  const ideas = moveIdeas(passed, threat);
  const lineSan = variationSan(passed, line);

  const lines = [`Threat check: what ${themName} wants`];
  if (severity === undefined) {
    lines.push(`No real threat right now. If ${themName} could move again, their most useful idea would be ${san} (${description}).`);
    lines.push(...bullets(ideas));
  } else {
    lines.push(`${severity}: ${san} (${description}).`);
    lines.push(...bullets(ideas));
    if (gain) lines.push(describeGain(gain, themName));
    lines.push(`If you ignore it, Stockfish expects: ${lineSan}`);
  }

  return {
    ...result,
    serious: severity !== undefined,
    severity,
    threatMove: threat,
    threatSan: san,
    passed,
    text: lines.join("\n"),
  };
}

export interface PlanStep {
  number: number;
  move: NormalMove;
  side: Color;
  who: "You" | "Opponent";
  san: string;
  description: string;
  ideas: string[];
}

export interface Plan {
  steps: PlanStep[];
  positions: Chess[]; // the position before each step, and after the last
  score: Score;
  leader?: string;
  text: string;
}

/** Stockfish's expected next few moves, described one by one. */
export async function planAhead(engine: CoachEngine, position: Chess): Promise<Plan> {
  const you = position.turn;
  const [info] = await engine.analyse(position, PLAN_TIME);
  let line = (info?.pv ?? []).slice(0, PLAN_PLIES);

  // Stockfish sometimes reports only the first couple of moves of its line;
  // if so, continue it from where it stops.
  for (let i = 0; i < 3; i++) {
    if (line.length >= PLAN_PLIES) break;
    let end = position.clone();
    for (const move of line) end = afterMove(end, move);
    if (end.isEnd()) break;
    const [more] = await engine.analyse(end, PLAN_TIME / 3);
    if (!more?.pv.length) break;
    line = [...line, ...more.pv].slice(0, PLAN_PLIES);
  }

  let current = position.clone();
  const positions = [current.clone()];
  const steps: PlanStep[] = [];
  line.forEach((move, index) => {
    steps.push({
      number: index + 1,
      move,
      side: current.turn,
      who: current.turn === you ? "You" : "Opponent",
      san: makeSan(current, move),
      description: describeMove(current, move),
      ideas: moveIdeas(current, move),
    });
    current = afterMove(current, move);
    positions.push(current.clone());
  });

  const score = info?.score ?? { cp: 0 };
  const gain = materialGain(position, current, you);
  const verdict = `${verdictWords(score)} (${formatScore(score)})`;
  const outcome = `After these moves: ${describeGain(gain, "you").toLowerCase().slice(0, -1)}, and ${verdict}.`;

  const lines = [
    `Plan ahead: Stockfish's next ${steps.length} moves`,
    "Arrows on the board: green = you, red = your opponent. Use ‹ › below to step through the line.",
  ];
  for (const step of steps) {
    const idea = step.ideas.length ? ` ${step.ideas[0]}` : "";
    lines.push(`${step.number}. ${step.who}: ${step.san} - ${step.description}.${idea}`);
  }
  lines.push(outcome);

  return { steps, positions, score, leader: scoreLeader(score), text: lines.join("\n") };
}

/** Mark a quiz answer: [correct, message]. */
export function gradeGuess(threat: Threat, guess: NormalMove): [boolean, string] {
  const passed = threat.passed!;
  const guessSan = makeSan(passed, guess);
  const answer = threat.threatSan;
  const uci = makeUci(guess);
  if (threat.threatMove && uci === makeUci(threat.threatMove)) {
    return [true, `Correct! ${answer} is exactly the idea Stockfish found.`];
  }
  if (threat.goodGuesses.has(uci)) {
    return [true, `Good spot! ${guessSan} is nearly as strong as Stockfish's top idea, ${answer}.`];
  }
  if (!threat.serious) {
    return [false, `Not quite. There was no real threat here, so this was about spotting their most useful plan: ${answer}. You guessed ${guessSan}.`];
  }
  return [false, `Not quite. You guessed ${guessSan}; the threat Stockfish found is ${answer}.`];
}
