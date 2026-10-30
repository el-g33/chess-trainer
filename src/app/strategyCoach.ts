// The strategy coach

import { Chess } from "chessops/chess";
import type { NormalMove } from "chessops/types";

import { findBrilliant } from "../brilliant";
import { explainIdeas } from "../ideas";
import { type Insight, base, coachAnalysis, gameMoves, insights, quizScore, quizWaiting } from "../main";
import { middlegameNotes } from "../middlegame";
import { type OpeningPlan, type PlanMode, openingPlanAhead } from "../openingPlan";
import { firstMoveOf } from "../openings";
import { explainGuess } from "../quizExplain";
import { fenOf } from "../review";
import { play } from "../sounds";
import { type Plan, gradeGuess, planAhead, threatCheck } from "../strategy";

import { coachStatus } from "./dom";
import { refresh } from "./draw";
import { book, busy, busySince, busyTimer, game, match, preview, quiz, set, statusMessage } from "./state";

export type Task = "threat" | "plan" | "quiz" | "ideas" | "brilliant";

export async function startTask(kind: Task) {
  set.preview(null);
  set.errorText("");
  const position = base();
  const fen = fenOf(position);
  const insight = insights.get(fen) ?? {};
  const needThreat = kind !== "plan" && kind !== "brilliant" && !insight.threat;
  const needBrilliant = kind === "brilliant" && !insight.brilliant;
  const planMode = currentPlanMode(position);
  // A plan made in the other mode is made again (Explain the ideas uses whichever is there)
  const needPlan = (kind === "plan" && (!insight.plan || planModeOf(insight.plan) !== planMode)) ||
    (kind === "ideas" && !insight.plan);
  const needIdeas = kind === "ideas" && !insight.ideas;

  if (kind === "quiz") {
    if (position.isCheck()) {
      set.errorText("You're in check, so your opponent's idea is obvious: deal with the check first!");
      refresh();
      return;
    }
    set.quiz({ fen, threat: insight.threat, answered: false });
    checkQuizReady();
  }

  if (!(needThreat || needPlan || needIdeas || needBrilliant)) {
    refresh();
    return;
  }
  setBusy(true, "Let me think…");
  try {
    const found: Insight = { ...insight };
    if (needBrilliant) {
      set.statusMessage("Looking for a sacrifice that works…");
      found.brilliant = await findBrilliant(coachAnalysis, position);
      saveInsight(fen, found);
    }
    if (needThreat) {
      set.statusMessage("Looking for threats…");
      found.threat = await threatCheck(coachAnalysis, position);
      saveInsight(fen, found);
      if (quiz && quiz.fen === fen) {
        quiz.threat = found.threat;
        checkQuizReady();
      }
      refresh();
    }
    if (needPlan) {
      if (planMode === "best") {
        set.statusMessage("Working out the next few moves…");
        found.plan = await planAhead(coachAnalysis, position);
      } else {
        set.statusMessage("Checking your opening's moves…");
        const first = firstMoveOf(game.positionAt(0), gameMoves());
        found.plan = await openingPlanAhead(coachAnalysis, position, match!.myOpening!, book!, first, planMode);
      }
      saveInsight(fen, found);
      refresh();
    }
    if (needIdeas) {
      found.ideas = explainIdeas(position, found.threat!, found.plan!, middlegameNotes(position, position.turn));
      saveInsight(fen, found);
    }
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
  } finally {
    if (quiz && !quiz.threat) set.quiz(null); // the threat search failed
    setBusy(false);
    refresh();
  }
}

/** Which Plan ahead to make here: following your opening (if you're
 *  practising one, it's your move and the switch is on), or Stockfish's best. */
export function currentPlanMode(position: Chess): PlanMode {
  void position;
  return "best";
}

export const planModeOf = (plan: Plan): PlanMode => ("mode" in plan ? (plan as OpeningPlan).mode : "best");

export function saveInsight(fen: string, found: Insight) {
  insights.set(fen, { ...(insights.get(fen) ?? {}), ...found });
}


export function setBusy(on: boolean, text = "") {
  set.busy(on);
  set.busySince(performance.now());
  set.statusMessage(text);
  clearInterval(busyTimer);
  if (on) set.busyTimer(window.setInterval(drawStatus, 250));
  drawStatus();
}

export function drawStatus() {
  const seconds = Math.round((performance.now() - busySince) / 1000);
  coachStatus.textContent = busy ? `${statusMessage}  (${seconds}s)` : "";
}

/** Once the threat is known: if there's nothing to find, there's no question. */
export function checkQuizReady() {
  if (quiz?.threat && !quiz.threat.threatMove) set.quiz(null); // the threat text explains
}

export function onQuizButton() {
  if (quizWaiting()) {
    // Give up: reveal the answer
    quizScore[1] += 1;
    const answer = quiz!.threat!.threatSan;
    quiz!.answered = true;
    quiz!.guess = undefined;
    quiz!.result = [false, `The idea Stockfish found is ${answer} (orange arrow).`];
    refresh();
  } else {
    void startTask("quiz");
  }
}

export function answerQuiz(guess: NormalMove) {
  const [correct, text] = gradeGuess(quiz!.threat!, guess);
  quizScore[1] += 1;
  if (correct) quizScore[0] += 1;
  void play(correct ? "right" : "wrong");
  quiz!.answered = true;
  quiz!.guess = guess;
  quiz!.result = [correct, text];
  refresh();
  if (!correct) void explainWrongGuess(guess);
}

export async function explainWrongGuess(guess: NormalMove) {
  const asked = quiz;
  if (!asked?.threat) return;
  asked.explaining = true;
  setBusy(true, "Let me check your guess…");
  try {
    asked.explanation = await explainGuess(coachAnalysis, asked.threat, guess);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
  } finally {
    asked.explaining = false;
    setBusy(false);
    refresh();
  }
}

export function stepPreview(direction: number) {
  if (quiz?.explanation) {
    const last = quiz.explanation.line.length;
    quiz.lineStep = Math.max(0, Math.min((quiz.lineStep ?? 0) + direction, last));
    refresh();
    return;
  }
  const plan = insights.get(fenOf(base()))?.plan;
  if (!plan || busy) return;
  const step = Math.max(0, Math.min((preview?.step ?? 0) + direction, plan.steps.length));
  set.preview(step === 0 ? null : { baseFen: fenOf(base()), step });
  refresh();
}

export function exitPreview() {
  if (quiz) quiz.lineStep = 0;
  set.preview(null);
  refresh();
}
