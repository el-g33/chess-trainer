// "Plan ahead" that follows the opening you're practising. Your moves in the
// line come from your opening (book moves, setup moves in any sensible order,
// and the standard adaptations in openings.ts), each checked with Stockfish:
//
//   "stick"   - Stick to the opening: play the opening move unless it costs
//               real winning chances, then leave the plan and say why.
//   "chances" - Take chances: play Stockfish's best whenever it gains
//               something over the opening move, but still show the opening
//               move and why it isn't best here.
//
// Your opponent's moves are Stockfish's best replies. The same rules also
// judge your moves afterwards, in the Move review (reviewOpeningChoice).
import type { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { NormalMove } from "chessops/types";
import { makeUci } from "chessops/util";

import { afterMove, colourName, describeMove, materialBalance, moveIdeas } from "./coach";
import { moveTactics } from "./ideas";
import {
  OPENING_MOVES,
  adaptationMoves,
  goalWords,
  setupMoves,
  setupProgress,
  systemFor,
  type Adaptation,
  type Opening,
  type OpeningBook,
  type OpeningSystem,
} from "./openings";
import { formatScore, verdictWords, winningChance } from "./review";
import type { CoachEngine, Plan, PlanStep } from "./strategy";
import { PLAN_TIME } from "./strategy";

export type PlanMode = "best" | "stick" | "chances";

// How much an opening move may cost (points of winning chance) before
// "Stick to the opening" leaves the plan.
export const STICK_LIMIT = 8;
// How much Stockfish's best must gain before "Take chances" leaves the plan.
export const CHANCE_GAIN = 3;
// An adaptation is preferred over the plain setup move when it is at least this much better.
const ADAPT_EDGE = 2;
// In the Move review: an opening move that loses this much, when something
// else was clearly better, is a missed chance.
export const MISSED_CHANCE = 6;

const PLIES = 6;
const LINES = 5; // Stockfish's top moves looked at for each of your moves
const MOVE_TIME = 0.6; // seconds per position
const CANDIDATE_TIME = 0.2; // seconds for each opening move Stockfish didn't list

export type MoveKind = "book" | "setup" | "adapt";

export interface OpeningCandidate {
  move: NormalMove;
  kind: MoveKind;
  adaptation?: Adaptation;
}

/** Your step in the line: what the opening says, and what was chosen. */
export interface OpeningChoice {
  kind: MoveKind | "deviate" | "free"; // free: the opening phase is over
  opening?: OpeningCandidate; // the opening's move here
  openingCost?: number; // what it gives up compared with Stockfish's best
  best: NormalMove; // Stockfish's best move
  note: string;
}

export interface OpeningPlan extends Plan {
  mode: PlanMode;
  choices: (OpeningChoice | undefined)[]; // for your steps
}

/** The opening-consistent moves in a position: book first, then the setup
 *  in plan order, then the adaptations that fit. */
export function openingCandidates(position: Chess, system: OpeningSystem, book: OpeningBook): OpeningCandidate[] {
  const found: OpeningCandidate[] = [];
  const add = (candidate: OpeningCandidate) => {
    if (!found.some((f) => makeUci(f.move) === makeUci(candidate.move))) found.push(candidate);
  };
  for (const entry of book.bookMoves(position, system.families).values()) add({ move: entry.move, kind: "book" });
  for (const move of setupMoves(position, system.setup)) add({ move, kind: "setup" });
  for (const { move, adaptation } of adaptationMoves(position, system)) add({ move, kind: "adapt", adaptation });
  return found;
}

/** Is the opening phase still on for this side? */
export function openingActive(position: Chess, system: OpeningSystem, book: OpeningBook): boolean {
  if (position.fullmoves > OPENING_MOVES) return false;
  const [, missing] = setupProgress(position, position.turn, system.setup);
  return missing.length > 0 || book.bookMoves(position, system.families).size > 0 || adaptationMoves(position, system).length > 0;
}

/** Why a move is good, in a few words: its tactics, else its first idea. */
function reasonFor(position: Chess, move: NormalMove): string {
  const tactics = moveTactics(position, move, position.turn);
  if (tactics.length) return `it ${tactics.join(" and ")}`;
  const ideas = moveIdeas(position, move);
  return ideas.length ? ideas[0].replace(/^It /, "it ").replace(/\.$/, "").replace(/^The /, "the ") : describeMove(position, move);
}

function kindWords(candidate: OpeningCandidate, system: OpeningSystem): string {
  if (candidate.kind === "book") return `${system.label} theory`;
  if (candidate.kind === "adapt") return `adapting: ${candidate.adaptation!.name}`;
  return `${system.label} setup`;
}

/** Picks your move in the opening: book or setup move, or an adaptation when
 *  it's clearly better; Stockfish's best when the opening move costs too much
 *  (stick) or when the best gains something (chances). */
async function chooseMove(
  engine: CoachEngine, position: Chess, system: OpeningSystem, book: OpeningBook, mode: PlanMode,
): Promise<OpeningChoice> {
  const me = position.turn;
  const lines = await engine.analyse(position, MOVE_TIME, LINES);
  const best = lines[0].pv[0];
  const bestChance = winningChance(lines[0].score, me);
  if (!openingActive(position, system, book)) {
    return { kind: "free", best, note: "" };
  }

  const known = new Map<string, number>();
  for (const line of lines) if (line.pv[0]) known.set(makeUci(line.pv[0]), winningChance(line.score, me));
  const cost = async (move: NormalMove) => {
    const uci = makeUci(move);
    if (!known.has(uci) && engine.moveScore) {
      known.set(uci, winningChance(await engine.moveScore(position, move, CANDIDATE_TIME), me));
    }
    return known.has(uci) ? Math.max(0, bestChance - known.get(uci)!) : Infinity;
  };

  const candidates = openingCandidates(position, system, book).slice(0, 10);
  const costed: { candidate: OpeningCandidate; cost: number }[] = [];
  for (const candidate of candidates) costed.push({ candidate, cost: await cost(candidate.move) });

  // The opening's move: book, then setup in plan order - but the move order
  // may vary: a later opening move that is clearly cheaper goes first. An
  // adaptation that fits the position wins when it's clearly better still.
  const plain = costed.filter((c) => c.candidate.kind !== "adapt");
  const cheapest = Math.min(...plain.map((c) => c.cost));
  const firstPlain = plain.find((c) => c.cost <= cheapest + ADAPT_EDGE);
  const adapts = costed.filter((c) => c.candidate.kind === "adapt").sort((a, b) => a.cost - b.cost);
  let pick = firstPlain;
  if (adapts[0] && (!pick || adapts[0].cost + ADAPT_EDGE <= pick.cost)) pick = adapts[0];
  if (!pick) return { kind: "deviate", best, note: `No ${system.label} move fits here, so play what the position needs.` };

  const openingSan = makeSan(position, pick.candidate.move);
  const bestSan = makeSan(position, best);
  const sameAsBest = makeUci(pick.candidate.move) === makeUci(best);
  // Sticking to the opening never means handing back material
  const dropsMaterial = !sameAsBest && (await materialDrop(engine, position, pick.candidate.move)) > 0;
  const deviate = !sameAsBest &&
    (mode === "chances" ? pick.cost >= CHANCE_GAIN : pick.cost > STICK_LIMIT || dropsMaterial);
  const reorder = pick.candidate.kind === "setup" && makeUci(pick.candidate.move) !== makeUci(plain.find((c) => c.candidate.kind === "setup")?.candidate.move ?? pick.candidate.move);

  let note: string;
  if (sameAsBest) {
    note = pick.candidate.kind === "adapt"
      ? `Adapt: ${pick.candidate.adaptation!.why}`
      : `${capital(kindWords(pick.candidate, system))} - and the strongest move too.`;
  } else if (deviate) {
    const drop = dropsMaterial ? ` - and after ${openingSan} your opponent could win material back` : "";
    note =
      `Leave the plan: ${bestSan} is about ${Math.round(pick.cost)}% better than the opening move ${openingSan} ` +
      `(${kindWords(pick.candidate, system)})${drop}. ${capital(bestSan)} is better because ${reasonFor(position, best)}.`;
  } else {
    note = pick.candidate.kind === "adapt"
      ? `Adapt: ${pick.candidate.adaptation!.why}`
      : `${capital(kindWords(pick.candidate, system))}${reorder ? ", in a different move order" : ""}.`;
    if (pick.cost >= 1) note += ` (Stockfish slightly prefers ${bestSan}, about ${Math.round(pick.cost)}% better.)`;
  }
  return { kind: deviate ? "deviate" : pick.candidate.kind, opening: pick.candidate, openingCost: pick.cost, best, note };
}

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** How much material you'd be down after this move, your opponent's best
 *  reply and your best answer (so plain exchanges don't count), compared
 *  with now (0 when nothing is lost). */
async function materialDrop(engine: CoachEngine, position: Chess, move: NormalMove): Promise<number> {
  const sign = position.turn === "white" ? 1 : -1;
  const now = materialBalance(position) * sign;
  let walk = afterMove(position, move);
  for (let reply = 0; reply < 2 && !walk.isEnd(); reply++) {
    const [line] = await engine.analyse(walk, CANDIDATE_TIME);
    if (!line?.pv[0]) break;
    walk = afterMove(walk, line.pv[0]);
  }
  return Math.max(0, now - materialBalance(walk) * sign);
}

/** Stockfish's next few moves, with your moves following your opening. */
export async function openingPlanAhead(
  engine: CoachEngine, position: Chess, opening: Opening, book: OpeningBook,
  firstMove: string | null, mode: PlanMode,
): Promise<OpeningPlan> {
  const you = position.turn;
  const system = systemFor(opening, firstMove);
  let current = position.clone();
  const positions = [current.clone()];
  const steps: PlanStep[] = [];
  const choices: (OpeningChoice | undefined)[] = [];
  let firstScore = undefined as Plan["score"] | undefined;

  for (let ply = 0; ply < PLIES && !current.isEnd(); ply++) {
    let move: NormalMove | undefined;
    let choice: OpeningChoice | undefined;
    if (current.turn === you) {
      choice = await chooseMove(engine, current, system, book, mode);
      move = choice.kind === "deviate" || choice.kind === "free" || !choice.opening ? choice.best : choice.opening.move;
    } else {
      const [line] = await engine.analyse(current, MOVE_TIME);
      move = line?.pv[0];
    }
    if (!move) break;
    if (ply === 0) {
      const [line] = await engine.analyse(position, PLAN_TIME / 3);
      firstScore = line?.score;
    }
    steps.push({
      number: ply + 1,
      move,
      side: current.turn,
      who: current.turn === you ? "You" : "Opponent",
      san: makeSan(current, move),
      description: describeMove(current, move),
      ideas: moveIdeas(current, move),
    });
    choices.push(choice);
    current = afterMove(current, move);
    positions.push(current.clone());
  }

  const score = firstScore ?? { cp: 0 };
  const label = mode === "stick" ? "stick to it" : "take chances";
  const lines = [
    `Plan ahead with your opening (${system.label}, ${label}): next ${steps.length} moves`,
    "Arrows: green = your opening plan, gold = leave the plan, red = your opponent; " +
      "dashed = Stockfish's own choice for your next move, where it differs. Use ‹ › below to step through.",
  ];
  steps.forEach((step, i) => {
    const choice = choices[i];
    if (step.who === "Opponent" || !choice || choice.kind === "free") {
      const idea = step.ideas.length ? ` ${step.ideas[0]}` : "";
      lines.push(`${step.number}. ${step.who}: ${step.san} - ${step.description}.${idea}`);
    } else {
      lines.push(`${step.number}. You: ${step.san} - ${choice.note}`);
    }
  });
  const setupLeft = setupProgress(current, you, system.setup)[1];
  lines.push(
    setupLeft.length
      ? `Still to do for your setup after this: ${setupLeft.map(goalWords).join(", ")}.`
      : `Your ${system.label} setup would be complete.`,
  );
  lines.push(`Stockfish's verdict now: ${verdictWords(score)} (${formatScore(score)}).`);

  return { steps, positions, score, text: lines.join("\n"), mode, choices };
}

/** After you've moved: how the move fits your opening, using Stockfish's
 *  ratings. Returns a note, or undefined when there's nothing to add. */
export function reviewOpeningChoice(
  before: Chess, move: NormalMove, loss: number, bestMove: NormalMove | undefined,
  opening: Opening, book: OpeningBook, firstMove: string | null,
): string | undefined {
  const system = systemFor(opening, firstMove);
  if (!openingActive(before, system, book) || !bestMove) return undefined;
  const candidates = openingCandidates(before, system, book);
  const played = candidates.find((c) => makeUci(c.move) === makeUci(move));
  const bestFits = candidates.find((c) => makeUci(c.move) === makeUci(bestMove));
  const bestSan = makeSan(before, bestMove);
  const them = colourName(before.turn === "white" ? "black" : "white");

  if (played?.kind === "adapt" && loss < CHANCE_GAIN) return `Good adaptation: ${played.adaptation!.why}`;
  if (loss < MISSED_CHANCE || makeUci(move) === makeUci(bestMove)) return undefined;
  if (bestFits) {
    // The better move was part of the opening too
    const why = bestFits.kind === "adapt" ? ` ${bestFits.adaptation!.why}` : "";
    return `${bestSan} (${kindWords(bestFits, system)}) was the better way to continue your opening here.${why}`;
  }
  if (played) {
    return `Missed chance: you stuck to the ${system.label}, but ${them} gave you something better - ` +
      `${bestSan}, because ${reasonFor(before, bestMove)}. Leaving the plan was worth it here.`;
  }
  return undefined;
}
