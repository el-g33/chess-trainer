// The coach's reasons: small positions where we know what the coach should
// spot and say, checked one by one. (A threat they had that the move didn't
// deal with, so far.)
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import { Game } from "../../src/game";
import { ignoredThreat, verdict } from "../../src/narrate";
import type { Review } from "../../src/review";

const uci = (move: string) => parseUci(move) as NormalMove;

/** The game after these moves, with the last one as the move looked at. */
function at(moves: string[]) {
  const game = new Game();
  for (const move of moves) game.play(uci(move));
  const ply = game.length;
  return { before: game.positionAt(ply - 1), after: game.positionAt(ply), last: ply >= 2 ? uci(moves[ply - 2]) : undefined };
}

export default async function run() {
  const failures: string[] = [];
  let checks = 0;
  const check = (name: string, got: unknown, want: unknown) => {
    checks++;
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}\nWANT: ${JSON.stringify(want)}\nGOT:  ${JSON.stringify(got)}`);
  };
  const threatOf = (moves: string[], reply: string) => {
    const { before, after, last } = at(moves);
    const found = ignoredThreat(before, after, uci(reply), last);
    return found && { victim: found.victim, taker: found.taker, fresh: found.fresh };
  };

  // Their knight hits the e4 pawn; a3 ignores it
  check("Fresh threat ignored", threatOf(["e2e4", "e7e5", "g1f3", "g8f6", "a2a3"], "f6e4"), { victim: "pawn", taker: "knight", fresh: true });
  // Nc3 guards it: no threat left
  check("Threat dealt with", threatOf(["e2e4", "e7e5", "g1f3", "g8f6", "b1c3"], "f6e4"), null);
  // The bishop walks into the queen's reach itself: that's not a threat they had
  check("Move makes its own problem", threatOf(["d2d4", "e7e5", "c1g5"], "d8g5"), null);
  // The threat was already there before their last move
  check("Older threat ignored", threatOf(["e2e4", "e7e5", "g1f3", "g8f6", "a2a3", "a7a6", "h2h3"], "f6e4"), { victim: "pawn", taker: "knight", fresh: false });
  // (e5 opens the queen's way to the h4 pawn, which the knight cuts off from its rook)
  check("Discovered threat", threatOf(["h2h4", "a7a6", "g1h3", "e7e5", "a2a3"], "d8h4"), { victim: "pawn", taker: "queen", fresh: true });

  // The bubble says it, from each side
  const { before, after } = at(["e2e4", "e7e5", "g1f3", "g8f6", "a2a3"]);
  const review = { rating: "Mistake" } as Review;
  const evaluation = { score: { cp: -40 }, best: uci("f6e4") };
  check("Bubble, yours", verdict(review, before, after, evaluation, "white", 1), "You left your e4 pawn hanging.");
  check("Bubble, theirs", verdict(review, before, after, evaluation, "black", 1), "They left their e4 pawn hanging!");
  check("Bubble, watching", verdict(review, before, after, evaluation, null, 1, true), "White left the e4 pawn hanging.");

  return { name: "Coaching reasons", checks, failures };
}
