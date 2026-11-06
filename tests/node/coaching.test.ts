// The coach's reasons: small positions where we know what the coach should
// spot and say, checked one by one. (A threat they had that the move didn't
// deal with; the weakness a quiet slip made.)
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";

import { pieceRoute } from "../../src/plans";
import { isSacrifice } from "../../src/review";
import { forkOf, freeTake, pinWins, replyWins } from "../../src/tactics";
import { Game } from "../../src/game";
import { asGerund, ignoredThreat, isTrade, narrateMove, stopsPawn, verdict } from "../../src/narrate";
import { positionalReason, reasonWords, recaptureReason } from "../../src/reasons";
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
  // The pieces: what the move did with them that the better one didn't
  const kindOf = (start: string[] | string, played: string, best: string) => reasonOf(start, played, best)?.kind ?? null;
  check("Queen out early", kindOf(["e2e4", "e7e5"], "d1h5", "g1f3"), "early-queen");
  check("King left in the centre", kindOf(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"], "a2a3", "e1g1"), "king-centre");
  check("Queen going home isn't early", kindOf(["e2e4", "d7d5", "e4d5", "d8d5", "b1c3", "d5a5", "d2d4", "c7c6", "g1f3"], "a5d8", "c8f5"), "same-piece");
  check("Same piece again", kindOf(["e2e4", "e7e5", "g1f3", "b8c6"], "f3g5", "f1c4"), "same-piece");
  check("Blocks the d-pawn", kindOf(["e2e4", "e7e5"], "f1d3", "g1f3"), "blocks-pawn");
  check("Blocks it, when the pawn should go there", kindOf(["e2e4", "e7e5", "g1f3", "b8c6"], "f1d3", "d2d3"), "blocks-pawn");
  check("Knight on the edge", kindOf(["e2e4", "e7e5"], "b1a3", "g1f3"), "rim");
  check("Piece does less", reasonOf("r4rk1/ppp2ppp/2n2n2/3p4/3P4/2NB1N2/PPP2PPP/R4RK1 w - - 0 12", "d3e2", "f1e1"),
    { kind: "passive", squares: [12], file: undefined });
  check("Said with its reach", reasonWords({ kind: "passive", squares: [12], role: "bishop", reach: [8, 5] }, "white", "white"),
    "That puts your bishop where it does less: it reaches 5 squares instead of 8.");
  check("Taking back is fine", kindOf(["e2e4", "e7e5", "g1f3", "d7d6", "f1c4", "c8g4", "b1c3", "g4f3"], "d1f3", "g2f3"), null);
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

  // A knight's route: d2, then f1, g3 and f5, where no pawn can chase it
  const routeStart = Chess.fromSetup(parseFen("6k1/pp3p1p/3p4/8/4P3/8/PP1N1PPP/6K1 b - - 0 1").unwrap()).unwrap();
  const route = pieceRoute(routeStart, uci("b1d2"), ["d2f1", "a7a6", "f1g3", "a6a5", "g3f5"].map(uci), "white", "white");
  check("Knight route", route?.text, "Your knight is on its way to f5, where no pawn can chase it away.");
  check("Route squares", route?.stops, [1, 11, 5, 22, 37]);
  check("No route for one hop", pieceRoute(routeStart, uci("b1d2"), ["a2a3"].map(uci), "white", "white"), undefined);

  // Which piece takes back: 7...Nxf6 frees the c8 bishop and keeps the queen home (7...Qxf6 can be hit by Bg5)
  const pirc = at(["e2e4", "d7d6", "f1e2", "g8f6", "b1c3", "b8d7", "e2c4", "e7e5", "c3d5", "f6e4", "d2d3", "e4f6", "d5f6"]);
  check("Take back with the knight", recaptureReason(pirc.after, uci("d8f6"), uci("d7f6")),
    { role: "knight", frees: { role: "bishop", square: 58 }, develops: false, queenHome: true });
  check("Same piece, no choice", recaptureReason(pirc.after, uci("d7f6"), uci("d7f6")), undefined);
  // the slower route of the King's Indian knight: g5, then e6
  const kid = Chess.fromSetup(parseFen("r1bq1rk1/pppnn1bp/3p2p1/3Ppp2/2P1P3/2N1BN1P/PP2BPP1/R2Q1RK1 w - - 0 11").unwrap()).unwrap();
  const kidAfter = kid.clone();
  kidAfter.play(uci("f3g5"));
  check("Knight to e6", pieceRoute(kidAfter, uci("f3g5"), ["a7a6", "g5e6"].map(uci), "white", "white")?.text,
    "Your knight is on its way to e6, where no pawn can chase it away.");

  // Tactics, from the Coach Check review of real games
  const fen = (text: string) => Chess.fromSetup(parseFen(text).unwrap()).unwrap();
  const played = (position: Chess, move: string) => { const next = position.clone(); next.play(uci(move)); return next; };
  // a rook trade is not a dropped rook
  const rookTrade = fen("3r1rk1/ppp2pbp/4bnp1/1N2B3/P3P3/1P5P/2P1BPP1/R2R2K1 b - - 0 15");
  check("Rook trade loses nothing", replyWins(rookTrade, uci("d8d1"), played(rookTrade, "d8d1"), uci("a1d1")), 0);
  // the queen out on h4 can just be taken
  check("Free queen", freeTake(fen("rnb1kbnr/pppp1ppp/4p3/8/3P3q/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3"), uci("f3h4")),
    { victim: "queen", square: 31, taker: "knight", free: true });
  // forks: the knight on f2, and a pawn taking on e5
  const knightFork = forkOf(fen("rn2k2r/pppbppbp/6p1/1B2P1N1/6n1/2N5/PPP2PPP/R1BK3R b kq - 4 9"), uci("g4f2"));
  check("Knight fork with check", knightFork && { check: knightFork.check, hits: knightFork.hits.map((h) => h.role) }, { check: true, hits: ["rook"] });
  const pawnFork = forkOf(fen("r1bqk2r/ppp2ppp/2nb1n2/4p3/2pP1B2/2N2NP1/PP2PPBP/R2QK2R w KQkq - 0 8"), uci("d4e5"));
  check("Pawn fork", pawnFork?.hits.map((h) => h.role).sort(), ["bishop", "knight"]);
  // a bishop pinning the queen to the king
  const pinned = fen("r4rk1/pp3ppp/n1n1b3/8/6q1/P1NQB1P1/1P3P1P/3R1K1R w - - 3 20");
  check("Pin wins the queen", pinWins(played(pinned, "c3b5"), uci("e6c4"))?.role, "queen");
  // a king move that hits their rook back isn't a sacrifice
  const kingBack = fen("2kr4/p5pp/PpR1b3/5p2/8/8/3rBPPP/4K2R b K - 0 26");
  check("Counter-attack is no sacrifice", isSacrifice(kingBack, uci("c8d7"), played(kingBack, "c8d7")), undefined);

  return { name: "Coaching reasons", checks, failures };
}
