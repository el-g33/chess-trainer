// Fundamentals: at beginner levels games are won and lost on loose pieces,
// not on the engine's top move. In this lens the coach looks only at what
// decides those games - a piece left loose, a free piece taken or left, a
// checkmate walked into or missed - and counts them for each side.

import { parseSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";

import { colourName } from "../coach";
import { analyser } from "../main";
import { type Review, fenOf } from "../review";

import { coachFocusBox } from "./dom";
import { SAVED_RATINGS, slipKind } from "./openingDemos";
import { game, puzzleLevel } from "./state";

export type FundamentalKind = "hung" | "fork" | "pawn" | "mated" | "mate-missed" | "took" | "left";

export interface Fundamental {
  ply: number;
  side: Color; // who made the move
  kind: FundamentalKind;
  role?: Role; // the piece it was about
}

/** Whether the coach looks at the fundamentals only: chosen in the settings,
 *  or (Automatic) at the beginner level found by "Find my level". */
export function fundamentalsOn(): boolean {
  if (coachFocusBox.value === "fundamentals") return true;
  if (coachFocusBox.value === "everything") return false;
  return puzzleLevel === "beginner";
}

const NAMES: Record<Role, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };
const LOSSES = new Set<FundamentalKind>(["hung", "fork", "pawn"]);

// Worked out once per move and its rating (a slip's kind takes a little work)
const known = new Map<string, Fundamental | null>();

/** The fundamentals of the game so far, in move order. */
export function fundamentalEvents(list: (Review | undefined)[]): Fundamental[] {
  const events: Fundamental[] = [];
  list.forEach((review, i) => {
    if (!review) return;
    const ply = i + 1;
    const key = `${fenOf(game.positionAt(i))} ${game.moves[i].san} ${review.rating}`;
    if (!known.has(key)) known.set(key, eventAt(ply, review, events[events.length - 1]));
    const event = known.get(key);
    if (event) events.push({ ...event, ply });
  });
  return events;
}

function eventAt(ply: number, review: Review, last: Fundamental | undefined): Fundamental | null {
  const side = game.moverOf(ply);
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  if (SAVED_RATINGS.has(review.rating)) {
    // what the move itself let them do comes first (a missed chance can also walk into a fork)
    const kind = slipKind(ply, { ...review, rating: "Mistake" });
    if (kind === "other" && (review.rating === "Miss" || review.rating === "Missed Win")) {
      // their piece was free: the better move simply takes it
      const best = review.bestSan ? (parseSan(before, review.bestSan) as NormalMove | undefined) : undefined;
      const target = best ? before.board.get(best.to) : undefined;
      return target && target.color !== side ? { ply, side, kind: "left", role: target.role } : null;
    }
    if (kind === "missed-mate") return { ply, side, kind: "mate-missed" };
    if (kind === "mated") return { ply, side, kind: "mated" };
    if (kind === "hanging" || kind === "fork" || kind === "pawn") {
      const reply = analyser.evals.get(fenOf(after))?.best;
      const role = reply ? after.board.get(reply.to)?.role : undefined;
      return { ply, side, kind: kind === "hanging" ? "hung" : kind, role };
    }
    return null;
  }
  // A free piece taken: they left one loose last move, and this move takes something
  const move = game.moves[ply - 1].move as NormalMove;
  const taken = before.board.get(move.to);
  if (last && last.ply === ply - 1 && LOSSES.has(last.kind) && taken && taken.color !== side) {
    return { ply, side, kind: "took", role: taken.role };
  }
  return null;
}

/** An event in a few words, from the viewer's side ("You left your knight loose"). */
export function fundamentalWords(event: Fundamental, viewer: Color | null): string {
  const you = viewer === null ? colourName(event.side) : event.side === viewer ? "You" : "They";
  const your = viewer === null ? `${colourName(event.side)}'s` : event.side === viewer ? "your" : "their";
  const their = viewer === null ? `${colourName(event.side === "white" ? "black" : "white")}'s` : event.side === viewer ? "their" : "your";
  const piece = event.role ? NAMES[event.role] : "piece";
  switch (event.kind) {
    case "hung": return `${you} left ${your} ${piece} loose`;
    case "fork": return `${you} walked into a fork`;
    case "pawn": return `${you} dropped a pawn`;
    case "mated": return `${you} walked into a checkmate`;
    case "mate-missed": return `${you} missed a checkmate`;
    case "took": return `Free ${piece}: ${viewer === null ? you : you.toLowerCase()} took it`;
    case "left": return `${their.charAt(0).toUpperCase()}${their.slice(1)} ${piece} was free`;
  }
}

/** The habit that would have saved a slip of this kind, in one line. */
export const HABITS: Partial<Record<FundamentalKind, string>> = {
  hung: "Before you move, check: is anything of mine attacked and undefended?",
  fork: "Before you move, check: can their next move attack two of my pieces at once?",
  pawn: "Before you move, check: are my pawns still defended?",
  mated: "Before you move, check every check they could give.",
  "mate-missed": "Look at your checks first: one of them might be checkmate.",
  left: "After their move, ask: did they leave anything free?",
};

/** Each side's count for the Fundamentals card. */
export interface FundamentalCount {
  hung: number; // pieces left loose (or forked)
  took: number; // free pieces taken
  left: number; // free pieces not taken
  matesMissed: number;
  safeRun: number; // the most moves in a row without a slip
}

export function fundamentalCounts(list: (Review | undefined)[]): Record<Color, FundamentalCount> {
  const events = fundamentalEvents(list);
  const count = (side: Color): FundamentalCount => {
    const mine = events.filter((e) => e.side === side);
    let run = 0;
    let best = 0;
    list.forEach((review, i) => {
      if (!review || game.moverOf(i + 1) !== side) return;
      run = SAVED_RATINGS.has(review.rating) ? 0 : run + 1;
      best = Math.max(best, run);
    });
    return {
      hung: mine.filter((e) => e.kind === "hung" || e.kind === "fork").length,
      took: mine.filter((e) => e.kind === "took").length,
      left: mine.filter((e) => e.kind === "left").length,
      matesMissed: mine.filter((e) => e.kind === "mate-missed").length,
      safeRun: best,
    };
  };
  return { white: count("white"), black: count("black") };
}
