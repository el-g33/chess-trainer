// Checks src/openings.ts against the desktop app's openings.py, using the
// cases in opening-cases.json (made by make_opening_cases.py). Stockfish's
// answers are replayed from the recording, so both versions see exactly the
// same engine results. Open http://localhost:5173/tests/openings.html
import { Chess, normalizeMove } from "chessops/chess";
import type { NormalMove } from "chessops/types";
import { makeUci, parseUci } from "chessops/util";

import { standardUci, type Score } from "../src/coach";
import {
  OpeningBook,
  REPERTOIRE,
  chooseOpeningMove,
  coachOpeningMove,
  firstMoveOf,
  type OpeningEngine,
} from "../src/openings";
import { fenOf } from "../src/review";
import cases from "./opening-cases.json";

const summary = document.getElementById("summary")!;
const details = document.getElementById("details")!;
const failures: string[] = [];
const counts = { book: 0, choose: 0, coach: 0 };

const recorded = cases.engine as Record<string, unknown>;
const toMove = (position: Chess, uci: string) => normalizeMove(position, parseUci(uci)!) as NormalMove;

/** Stockfish, replayed from the desktop's recording. */
const replay: OpeningEngine = {
  async lines(position, _seconds, count) {
    const key = `lines ${fenOf(position)} ${count}`;
    const lines = recorded[key] as { move: string | null; score: Score }[] | undefined;
    if (!lines) throw new Error(`not recorded: ${key}`);
    return lines.map((l) => ({ move: l.move ? toMove(position, l.move) : undefined, score: l.score }));
  },
  async moveScore(position, move) {
    const key = `move ${fenOf(position)} ${standardUci(position, move)}`;
    const score = recorded[key] as Score | undefined;
    if (!score) throw new Error(`not recorded: ${key}`);
    return score;
  },
};

/** The position after these moves, and the moves themselves. */
function replayMoves(ucis: string[]): [Chess, NormalMove[]] {
  const position = Chess.default();
  const moves: NormalMove[] = [];
  for (const uci of ucis) {
    const move = toMove(position, uci);
    moves.push(move);
    position.play(move);
  }
  return [position, moves];
}

const book = await OpeningBook.load();
summary.textContent = "Comparing...";

// Book moves, opening names and notes
for (const [index, game] of cases.book.entries()) {
  const [, moves] = replayMoves(game.moves);
  const web = book.gameOpenings(Chess.default(), moves);
  web.forEach((info, i) => {
    counts.book++;
    const desktop = game.info[i];
    if (JSON.stringify(info) !== JSON.stringify(desktop)) {
      failures.push(`Book, game ${index + 1}, move ${i + 1}:\nDESKTOP: ${JSON.stringify(desktop)}\nWEB:     ${JSON.stringify(info)}`);
    }
  });
}

// Stockfish following its opening
for (const item of cases.choose) {
  counts.choose++;
  const [position, moves] = replayMoves(item.moves);
  const first = firstMoveOf(Chess.default(), moves);
  try {
    const web = await chooseOpeningMove(replay, position, REPERTOIRE[item.opening], book, item.level, first);
    const want = item.result;
    const wantMove = want.move ? makeUci(toMove(position, want.move)) : null;
    const gotMove = web.move ? makeUci(web.move) : null;
    if (gotMove !== wantMove || web.note !== want.note || web.finished !== want.finished) {
      failures.push(
        `Choose, ${REPERTOIRE[item.opening].name}, level ${item.level + 1}, after ${item.moves.join(" ") || "(start)"}:\n` +
          `DESKTOP: ${wantMove} ${want.finished} ${want.note}\nWEB:     ${gotMove} ${web.finished} ${web.note}`,
      );
    }
  } catch (error) {
    failures.push(`Choose, ${REPERTOIRE[item.opening].name}, after ${item.moves.join(" ")}: ${error}`);
  }
}

// Coaching your moves in your opening
for (const item of cases.coach) {
  counts.coach++;
  const [position, moves] = replayMoves(item.moves);
  const first = firstMoveOf(Chess.default(), moves);
  const web = coachOpeningMove(position, toMove(position, item.move), REPERTOIRE[item.opening], book, first) ?? null;
  if (web !== item.note) {
    failures.push(`Coach, ${REPERTOIRE[item.opening].name}, ${item.move} after ${item.moves.join(" ") || "(start)"}:\nDESKTOP: ${item.note}\nWEB:     ${web}`);
  }
}

const total = counts.book + counts.choose + counts.coach;
summary.textContent =
  `${total} checks (${counts.book} book, ${counts.choose} Stockfish opening moves, ${counts.coach} coaching notes): ` +
  `${total - failures.length} identical, ${failures.length} different.`;
for (const failure of failures.slice(0, 40)) {
  const pre = document.createElement("pre");
  pre.textContent = failure;
  details.append(pre);
}
(window as unknown as { openingCheck: unknown }).openingCheck = { counts, failures };
