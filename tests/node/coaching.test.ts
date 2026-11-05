// The coach's reasons: small positions where we know what the coach should
// spot and say, checked one by one. (A threat they had that the move didn't
// deal with; the weakness a quiet slip made.)
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";

import { Game } from "../../src/game";
import { asGerund, ignoredThreat, isTrade, narrateMove, stopsPawn, verdict } from "../../src/narrate";
import { positionalReason, reasonWords } from "../../src/reasons";
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
  // Taking back isn't ignoring a threat (busy with a trade): their rook took on e4, the bishop eyes the a4 knight
  const trade = (played: string) => {
    const before = Chess.fromSetup(parseFen("6k1/3b4/8/8/N3r3/8/8/4R1K1 w - - 0 1").unwrap()).unwrap();
    const after = before.clone();
    after.play(uci(played));
    const found = ignoredThreat(before, after, uci("d7a4"));
    return found ? found.victim : null;
  };
  check("Recapture", trade("e1e4"), null);
  check("Same, without taking", trade("g1h1"), "knight");
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

  // The weakness a quiet slip makes that the better move doesn't
  const reasonOf = (start: string[] | string, played: string, best: string) => {
    const before = typeof start === "string" ? Chess.fromSetup(parseFen(start).unwrap()).unwrap() : at([...start, played]).before;
    const found = positionalReason(before, uci(played), uci(best));
    return found ? { kind: found.kind, squares: found.squares, file: found.file } : null;
  };
  const italian = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6"];
  check("Holes in front of the king", reasonOf(italian, "g2g3", "d2d3"), { kind: "king-hole", squares: [23, 21] });
  check("Cover pawn pushed", reasonOf(italian, "h2h4", "d2d3"), { kind: "shield", squares: [31] });
  check("Open file at the king", reasonOf("6k1/5ppp/8/8/5p2/6P1/5P1P/6K1 w - - 0 1", "g3f4", "g1g2"), { kind: "open-file", squares: [], file: 6 });
  check("Isolated pawn", reasonOf(["e2e4", "e7e5", "d2d4", "e5d4", "c2c3", "d4c3"], "b2c3", "b1c3"), { kind: "isolated", squares: [8, 18], file: 0 });
  check("Doubled pawns", reasonOf(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "b1c3", "g8f6", "d2d3", "c6a5", "e1g1", "a5c4"], "d3c4", "a2a3"),
    { kind: "doubled", squares: [10, 26], file: 2 });
  check("Backward pawn", reasonOf(["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e6", "f1e2"], "e6e5", "a7a6"),
    { kind: "backward", squares: [43] });
  check("No weakness: a developing move", reasonOf(italian, "b1c3", "d2d3"), null);
  check("Said plainly", reasonWords({ kind: "isolated", squares: [8], file: 0 }, "white", "white"), "That leaves your a-pawn isolated.");
  check("Two isolated", reasonWords({ kind: "isolated", squares: [8, 18], file: 0 }, "white", "white"), "That leaves your a- and c-pawns isolated.");
  check("Said as your chance", reasonWords({ kind: "doubled", squares: [10, 26], file: 2 }, "white", "black"), "They've doubled their pawns on the c-file.");
  check("Said by colour", reasonWords({ kind: "king-hole", squares: [21], file: undefined }, "white", null), "That leaves a hole on f3, right in front of White's king.");

  // The better move, said as a coach would
  check("Gerund", asGerund("it brings the rook into play"), "bringing the rook into play");
  check("Gerund, two verbs", asGerund("it develops your knight and attacks their pawn"), "developing your knight and attacking their pawn");
  check("Gerund, doubling", asGerund("stops their b-pawn coming to b5"), "stopping their b-pawn coming to b5");
  // a4 stops ...b5 chasing the c4 bishop (after ...a6)
  const a4 = at(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6", "d2d3", "d7d6", "c2c3", "a7a6", "a2a4"]);
  check("Stops their pawn", stopsPawn(a4.before, uci("a2a4"), "white"), "stops their b-pawn coming to b5 to chase your bishop");
  check("Doesn't stop anything", stopsPawn(a4.before, uci("h2h3"), "white"), undefined);
  // Bxe6 fxe6 is a trade, not a win
  const swap = at(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6", "d2d3", "d7d6", "c2c3", "c8e6"]);
  check("A trade wins nothing", isTrade(swap.after, uci("c4e6")), true);
  check("A free take isn't a trade", isTrade(at(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "c6a5", "e1g1"]).after, uci("a5c4")), false);
  // A knight going back to make way for a pawn
  const back = at(["e2e4", "e7e5", "g1f3", "b8c6", "h2h3", "a7a6"]);
  check("Knight steps back", narrateMove(back.after, uci("f3h2"), "white"), "Your knight steps back, making way for your f-pawn.");

  // A knight joining the attack on the king (after ...Bh3 chased the rook to e1)
  const sample = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6", "g2g3", "d7d6", "d2d3", "e8g8", "c2c3", "a7a6",
    "h2h4", "c5a7", "b2b4", "h7h6", "a2a4", "c8h3", "f1e1"];
  check("Joins the attack", narrateMove(at(sample).after, uci("f6g4"), "white"), "Their knight joins the attack, eyeing f2 and h2 next to your king.");

  return { name: "Coaching reasons", checks, failures };
}
