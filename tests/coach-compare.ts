// Checks src/strategy.ts and src/ideas.ts against the desktop app's
// strategy.py and ideas.py, using coach-cases.json (made by
// make_coach_cases.py). Stockfish's answers are replayed from the recording.
// Open http://localhost:5173/tests/coach.html
import { Chess, normalizeMove } from "chessops/chess";
import { parseFen } from "chessops/fen";
import type { NormalMove } from "chessops/types";
import { makeUci, parseUci } from "chessops/util";

import { afterMove, type Score } from "../src/coach";
import { explainIdeas } from "../src/ideas";
import { fenOf } from "../src/review";
import { gradeGuess, planAhead, threatCheck, type CoachEngine } from "../src/strategy";
import cases from "./coach-cases.json";

const summary = document.getElementById("summary")!;
const details = document.getElementById("details")!;
const failures: string[] = [];
let checks = 0;

type Recording = Record<string, { score: Score; pv: string[] }[]>;
const toMove = (position: Chess, uci: string) => normalizeMove(position, parseUci(uci)!) as NormalMove;

/** Stockfish, replayed from the desktop's recording for one position. */
const replayOf = (recorded: Recording): CoachEngine => ({
  async analyse(position, seconds, lines = 1) {
    const key = `${fenOf(position)}|${seconds}|${lines}`;
    const infos = recorded[key];
    if (!infos) throw new Error(`not recorded: ${key}`);
    return infos.map((info) => {
      let walk = position;
      const pv = info.pv.map((uci) => {
        const move = toMove(walk, uci);
        walk = afterMove(walk, move);
        return move;
      });
      return { score: info.score, pv };
    });
  },
});

function compare(label: string, desktop: unknown, web: unknown) {
  checks++;
  if (JSON.stringify(desktop) !== JSON.stringify(web)) {
    failures.push(`${label}\nDESKTOP: ${typeof desktop === "string" ? desktop : JSON.stringify(desktop)}\n` +
      `WEB:     ${typeof web === "string" ? web : JSON.stringify(web)}`);
  }
}

for (const item of cases.cases) {
  const position = Chess.fromSetup(parseFen(item.fen).unwrap()).unwrap();
  const replay = replayOf(item.engine as Recording);
  try {
    const threat = await threatCheck(replay, position);
    compare(`Threat text, ${item.fen}`, item.threat.text, threat.text);
    compare(`Threat facts, ${item.fen}`,
      { serious: item.threat.serious, move: item.threat.move && makeUci(toMove(threat.passed ?? position, item.threat.move)),
        good: item.threat.good.map((u) => makeUci(toMove(threat.passed!, u))).sort() },
      { serious: threat.serious, move: threat.threatMove ? makeUci(threat.threatMove) : null, good: [...threat.goodGuesses].sort() });
    const plan = await planAhead(replay, position);
    compare(`Plan text, ${item.fen}`, item.plan.text, plan.text);
    compare(`Ideas text, ${item.fen}`, item.ideas, explainIdeas(position, threat, plan));
    for (const grade of item.grades) {
      const guess = toMove(threat.passed!, grade.guess);
      compare(`Quiz grade ${grade.guess}, ${item.fen}`, grade.result, gradeGuess(threat, guess));
    }
  } catch (error) {
    failures.push(`${item.fen}: ${error}`);
  }
}

summary.textContent = `${cases.cases.length} positions, ${checks} checks: ${checks - failures.length} identical, ${failures.length} different.`;
for (const failure of failures.slice(0, 40)) {
  const pre = document.createElement("pre");
  pre.textContent = failure;
  details.append(pre);
}
(window as unknown as { coachCheck: unknown }).coachCheck = { checks, failures };
