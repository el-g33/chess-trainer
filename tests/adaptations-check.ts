// For each position in adaptation-cases.json: does the opening plan offer
// one of the expected answers, as an adaptation (or as a book/setup move)?
// Open http://localhost:5173/tests/adaptations.html
import { Chess } from "chessops/chess";
import { makeSan, parseSan } from "chessops/san";
import type { NormalMove } from "chessops/types";

import { openingCandidates } from "../src/openingPlan";
import { OpeningBook, REPERTOIRE, firstMoveOf, systemFor } from "../src/openings";
import cases from "./adaptation-cases.json";

const summary = document.getElementById("summary")!;
const details = document.getElementById("details")!;
const book = await OpeningBook.load();
const lines: string[] = [];
let found = 0;

for (const item of cases.cases) {
  const position = Chess.default();
  const moves: NormalMove[] = [];
  for (const token of item.line.split(" ")) {
    if (!token || /^\d/.test(token)) continue;
    const move = parseSan(position, token) as NormalMove;
    moves.push(move);
    position.play(move);
  }
  const opening = REPERTOIRE.find((o) => o.name === item.opening)!;
  const system = systemFor(opening, firstMoveOf(Chess.default(), moves));
  const offered = openingCandidates(position, system, book).map((c) => ({ san: makeSan(position, c.move), kind: c.kind }));
  const hits = offered.filter((o) => item.expect.includes(o.san));
  if (hits.length) found++;
  lines.push(
    `${hits.length ? "ok  " : "MISS"} ${item.opening} [${system.label}]: ${item.line} -> ` +
      (hits.length ? hits.map((h) => `${h.san} (${h.kind})`).join(", ") : `offered: ${offered.map((o) => o.san).join(" ")}`),
  );
}

summary.textContent = `${found} of ${cases.cases.length} situations spotted.`;
details.textContent = lines.join("\n");
(window as unknown as { adaptCheck: unknown }).adaptCheck = { found, total: cases.cases.length, lines };
