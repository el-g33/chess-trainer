// After a wrong quiz guess: what would really happen if your opponent played
// it? Stockfish plays it out (they move, then you reply), and the answer says
// whether the guess was harmless, a mistake you could punish, or a real but
// smaller threat.
import type { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { NormalMove } from "chessops/types";

import { afterMove, colourName, describeMove, moveIdeas, variationSan } from "./coach";
import { moveTactics } from "./ideas";
import { winningChance } from "./review";
import type { CoachEngine, Threat } from "./strategy";

const THINK = 1.0; // seconds
const MISTAKE_GAIN = 3; // you'd be this much better off after their move: it's a mistake
const THREAT_COST = 10; // it would cost you this much: a real threat (as in the threat check)

export interface GuessExplanation {
  kind: "harmless" | "mistake" | "smaller-threat";
  text: string;
  reply?: NormalMove; // your best answer to the guessed move
  line: NormalMove[]; // the guess, your answer and what Stockfish expects next
  start: Chess; // the position the line starts from (your move skipped)
}

export async function explainGuess(engine: CoachEngine, threat: Threat, guess: NormalMove): Promise<GuessExplanation> {
  const passed = threat.passed!;
  const you = threat.you;
  const them = colourName(threat.them);
  const guessSan = makeSan(passed, guess);
  const afterGuess = afterMove(passed, guess);
  const [line] = await engine.analyse(afterGuess, THINK);
  const reply = line?.pv[0];
  const pv = line?.pv.slice(0, 4) ?? [];

  const chanceNow = winningChance(threat.nowScore ?? { cp: 0 }, you);
  const chanceGuess = line ? winningChance(line.score, you) : chanceNow;
  const chanceThreat = winningChance(threat.threatScore ?? { cp: 0 }, you);
  const cost = chanceNow - chanceGuess; // what their guessed move would cost you
  const threatCost = chanceNow - chanceThreat;

  const replySan = reply ? makeSan(afterGuess, reply) : "";
  const replyWords = reply ? describeMove(afterGuess, reply) : "";
  const idea = moveIdeas(passed, guess)[0]?.replace(/\.$/, "").replace(/^It /, "it ");
  const lineText = pv.length ? variationSan(afterGuess, pv) : "";
  const result = { reply, line: [guess, ...pv], start: passed };

  if (cost <= -MISTAKE_GAIN && reply) {
    const tactics = moveTactics(afterGuess, reply, you);
    const why = tactics.length ? ` - it ${tactics.join(" and ")}` : "";
    return {
      ...result,
      kind: "mistake",
      text:
        `${guessSan} isn't a threat - it would actually be a mistake for ${them}. ` +
        `You could punish it with ${replySan} (${replyWords})${why}, and you'd be about ${Math.round(-cost)}% better off than now.` +
        (lineText ? `\nStockfish's line after ${guessSan}: ${lineText}` : ""),
    };
  }
  if (cost >= THREAT_COST) {
    return {
      ...result,
      kind: "smaller-threat",
      text:
        `${guessSan} is a threat too${idea ? ` (${idea})` : ""} - it would cost you about ${Math.round(cost)}% of your winning chances. ` +
        `But ${threat.threatSan} is bigger: about ${Math.round(threatCost)}%. ` +
        (reply ? `If they did play ${guessSan}, your best answer would be ${replySan} (${replyWords}).` : ""),
    };
  }
  return {
    ...result,
    kind: "harmless",
    text:
      `${guessSan} doesn't threaten anything serious${idea ? `: ${idea}, but` : " -"} ` +
      (reply
        ? `you'd simply answer ${replySan} (${replyWords}) and be just as well off.`
        : "you'd be just as well off.") +
      ` The idea to watch for is ${threat.threatSan}.`,
  };
}
