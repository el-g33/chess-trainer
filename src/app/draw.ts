// Drawing everything

import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Chess } from "chessops/chess";
import { chessgroundDests } from "chessops/compat";
import type { NormalMove } from "chessops/types";
import { makeSquare, makeUci, parseSquare } from "chessops/util";

import { badgeSvg } from "../badge";
import { isCastling, afterMove as positionAfter } from "../coach";
import { demoFor } from "../demos";
import { syncDropdowns } from "../dropdown";
import {
  ARROWS_AT_ONCE, BRILLIANT_ARROW, DEVIATE_ARROW, GUESS_ARROW, OPPONENT_ARROW, THREAT_ARROW, YOUR_ARROW, analyser,
  base, bendKnightArrows, brilliantShown, currentPly, evalOn, ground, insights, markThreats, previewPlan, quizLinePositions,
  quizWaiting, ratingsOn, shown, tidyState,
} from "../main";
import type { OpeningPlan } from "../openingPlan";
import type { OpeningInfo } from "../openings";
import { FALL_ANGLES, fallenKing } from "../pieces";
import { type Review, fenOf, formatScore, isDrawnPosition } from "../review";

import {
  applyView, drawButtons, drawCoach, drawCoachFace, drawMoveStrip, drawTurn, listener, stepperShapes,
} from "./coach";
import {
  $, coachPanel, demoPanel, evalBar, modeTitle, planModeRow, reviewArea, showDemoButton, undoButton,
} from "./dom";
import { drawMomentsBar } from "./keyMoments";
import { drawPrep, drawStatsBack } from "./matches";
import { drawWhatIf, movableColour, premoveColour } from "./moves";
import { checkDeeper, demoShapes, drawDemo, drawDrillSetup, drillShapes, practiceShapes } from "./openingDemos";
import { clockShouldPause, drawClocks, drawMoveList, drawPlayerBars, drawReview } from "./playerBars";
import { analysisReview, moveReviews, openingInfo, requestEval, reviewPly } from "./ratings";
import {
  orientation, analysis, clock, demo, drill, editor, fall, game, lastFraction, match, mode, practice, preview,
  puzzle, quiz, replaying, set, stepper, viewPly,
} from "./state";
import { planModeOf } from "./strategyCoach";
import { drawEditor, puzzleShapes } from "./train";

export function refresh() {
  tidyState();
  const reviews = moveReviews();
  requestEval(); // (before drawing, so the review's progress line is current)
  checkDeeper(reviews); // (and so a finished deeper look shows as finished)
  const info = openingInfo();
  applyMode();
  drawBoard(reviews, info);
  drawPlayerBars();
  clock?.setPaused(clockShouldPause());
  drawClocks();
  drawEvalBar();
  drawMoveList(reviews, info);
  drawReview(reviews, info);
  drawCoachFace(reviews);
  drawEditor();
  drawDrillSetup();
  drawWhatIf();
  drawMoveStrip(reviews, info);
  syncDropdowns();
  applyView();
  drawTurn();
  drawButtons();
  drawCoach();
  drawDemo();
  drawPrep(reviews);
  drawStatsBack();
  drawMomentsBar();
}

/** Show the parts of the page that belong to the current mode. */
export function applyMode() {
  const practice = mode === "practice";
  document.body.classList.toggle("practice", practice);
  modeTitle.textContent = practice ? "Practice" : "Play";
  for (const element of [coachPanel, reviewArea]) element.hidden = !practice || demo !== null;
  undoButton.hidden = !practice || demo !== null || !match;
  demoPanel.hidden = demo === null;
  if (demo) modeTitle.textContent = "Opening demo";
  showDemoButton.hidden = !(practice && match?.myOpening && demoFor(match.myOpening.name));
  planModeRow.hidden = !(practice && match?.myOpening);
  $("eval-check-label").hidden = !practice;
  evalBar.hidden = !evalOn();
}

/** Where an arrow for a move ends: for castling, on the king's square. */
export function arrowEnd(position: Chess, move: NormalMove): Key {
  if (isCastling(position, move)) return makeSquare((move.from & ~7) + (move.to > move.from ? 6 : 2)) as Key;
  return makeSquare(move.to) as Key;
}

/** The coach's arrows: Stockfish's line (numbered), the threat, your quiz guess. */
/** During a replay: the move just played, as an arrow. */
export function replayShapes(): DrawShape[] {
  const ply = currentPly();
  if (!replaying || !ply || analysis) return [];
  const before = game.positionAt(ply - 1);
  const move = game.moves[ply - 1].move;
  const mine = before.turn === (listener() ?? orientation);
  return [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: mine ? "you" : "them" }];
}

export function arrowShapes(): DrawShape[] {
  const insight = insights.get(fenOf(base())) ?? {};
  const hidden = quiz !== null && !quiz.answered; // no spoilers
  const shapes: DrawShape[] = [];
  if (insight.plan && !hidden) {
    // The next few moves of the line from where you are in it
    const first = preview?.step ?? 0;
    const you = base().turn;
    const choices = planModeOf(insight.plan) === "best" ? [] : (insight.plan as OpeningPlan).choices;
    insight.plan.steps.slice(first, first + ARROWS_AT_ONCE).forEach((step, i) => {
      const before = insight.plan!.positions[first + i];
      const choice = choices[first + i];
      const deviating = step.side === you && choice?.kind === "deviate";
      const brush = step.side !== you ? "them" : deviating ? "deviate" : "you";
      const fill = step.side !== you ? OPPONENT_ARROW : deviating ? DEVIATE_ARROW : YOUR_ARROW;
      shapes.push({
        orig: makeSquare(step.move.from) as Key,
        dest: arrowEnd(before, step.move),
        brush,
        label: { text: String(step.number), fill },
      });
      // Your next move: where the opening plan differs from Stockfish's own choice, show that too
      if (i === 0 && step.side === you && choice && makeUci(choice.best) !== makeUci(step.move)) {
        shapes.push({ orig: makeSquare(choice.best.from) as Key, dest: arrowEnd(before, choice.best), brush: "best" });
      }
    });
  }
  if (insight.brilliant?.found && insight.brilliant.move && brilliantShown.has(fenOf(base())) && !hidden && !preview) {
    shapes.push({
      orig: makeSquare(insight.brilliant.move.from) as Key,
      dest: arrowEnd(base(), insight.brilliant.move),
      brush: "brilliant",
      label: { text: "!!", fill: BRILLIANT_ARROW },
    });
  }
  const threat = insight.threat;
  if (threat?.threatMove && threat.passed && !hidden && !preview) {
    shapes.push({
      orig: makeSquare(threat.threatMove.from) as Key,
      dest: arrowEnd(threat.passed, threat.threatMove),
      brush: "threat",
      label: { text: "!", fill: THREAT_ARROW },
    });
  }
  if (quiz?.answered && quiz.guess && quiz.threat?.passed && makeUci(quiz.guess) !== makeUci(quiz.threat.threatMove!)) {
    shapes.push({
      orig: makeSquare(quiz.guess.from) as Key,
      dest: arrowEnd(quiz.threat.passed, quiz.guess),
      brush: "guess",
      label: { text: "?", fill: GUESS_ARROW },
    });
    const reply = quiz.explanation?.reply;
    if (reply && !quiz.lineStep) {
      const afterGuess = positionAfter(quiz.threat.passed, quiz.guess);
      shapes.push({ orig: makeSquare(reply.from) as Key, dest: arrowEnd(afterGuess, reply), brush: "you" });
    }
  }
  return shapes;
}

/** The rating badge on the piece that made the move being reviewed. */
export function badgeShapes(reviews: (Review | undefined)[], info: OpeningInfo[]): DrawShape[] {
  if (preview || !ratingsOn()) return [];
  let rating: string;
  let square: string;
  if (analysis) {
    const review = analysisReview();
    if (!review) return [];
    square = analysis.line.moves[analysis.line.length - 1].to;
    rating = review.symbol === "#" ? "Checkmate" : review.rating;
  } else {
    const ply = reviewPly();
    if (ply === 0) return [];
    square = game.moves[ply - 1].to;
    const piece = shown().board.get(parseSquare(square)!);
    if (!piece || piece.color !== game.moverOf(ply)) return []; // that piece has since been captured
    const review = reviews[ply - 1];
    if (info[ply - 1]?.book) rating = "Book";
    else if (review) rating = review.symbol === "#" ? "Checkmate" : review.rating;
    else return [];
  }
  return [{ orig: square as Key, customSvg: { html: badgeSvg(rating) } }];
}

export function drawBoard(reviews: (Review | undefined)[], info: OpeningInfo[]) {
  const position = shown();
  let last: [Key, Key] | undefined;
  const plan = previewPlan();
  const quizLine = quizLinePositions();
  if (stepper?.frames) {
    last = undefined;
  } else if (stepper && stepper.step > 0) {
    const move = stepper.moves[stepper.step - 1];
    last = [makeSquare(move.from) as Key, arrowEnd(stepper.positions[stepper.step - 1], move)];
  } else if (quizLine && quiz?.lineStep) {
    const move = quiz.explanation!.line[quiz.lineStep - 1];
    last = [makeSquare(move.from) as Key, arrowEnd(quizLine[quiz.lineStep - 1], move)];
  } else if (plan && preview) {
    const step = plan.steps[preview.step - 1];
    last = [makeSquare(step.move.from) as Key, arrowEnd(plan.positions[preview.step - 1], step.move)];
  } else if (analysis && analysis.line.length) {
    const played = analysis.line.moves[analysis.line.length - 1];
    last = [played.from as Key, played.to as Key];
  } else if (!analysis && currentPly() > 0) {
    const played = game.moves[currentPly() - 1];
    last = [played.from as Key, played.to as Key];
  }
  const colour = movableColour();
  const premoving = colour ? undefined : premoveColour(); // your move set up while the coach thinks
  const movesFrom = quizWaiting() ? quiz!.threat!.passed! : position;
  ground.setAutoShapes(bendKnightArrows(markThreats(stepper ? stepperShapes() : drill ? drillShapes() : practice ? practiceShapes() : puzzle ? puzzleShapes() : editor ? [] : demo ? demoShapes() : [...badgeShapes(reviews, info), ...arrowShapes(), ...replayShapes()])));
  if (editor || demo?.intro) last = undefined;
  ground.set({
    fen: fenOf(position),
    orientation,
    turnColor: quizWaiting() ? quiz!.threat!.them : position.turn,
    lastMove: last,
    check: quizWaiting() ? false : position.isCheck(),
    movable: editor && !editor.pick
      ? { color: "both", free: true, showDests: false }
      : { color: colour ?? premoving, free: false, showDests: true, dests: colour ? chessgroundDests(movesFrom) : new Map() },
    premovable: { enabled: !!premoving || (!!colour && !!clock && mode === "play" && !!match) },
    draggable: { deleteOnDropOff: !!editor && !editor.pick },
  });
  // In analysis the board gets a blue frame, so it's clear the moves aren't the game
  $("board").classList.toggle("analysis", analysis !== null);
  drawFallingKing(position);
}

// -- The checkmated king falls over ---------------------------------------------

export const FALL_PAUSE_MS = 180; // a short pause before it topples
export const FALL_SPEED_MS = 45; // time between pictures
export const fallStyle = document.createElement("style");
document.head.append(fallStyle);

export function drawFallingKing(position: Chess) {
  if (!position.isCheckmate()) {
    if (fall) clearTimeout(fall.timer);
    set.fall(null);
    fallStyle.textContent = "";
    return;
  }
  const fen = fenOf(position);
  if (fall?.fen === fen) return; // already falling (or fallen)
  if (fall) clearTimeout(fall.timer);
  const falling: NonNullable<typeof fall> = { fen, colour: position.turn, step: 0 };
  set.fall(falling);
  showFallFrame();
  falling.timer = window.setTimeout(advanceFall, FALL_PAUSE_MS);
}

export function advanceFall() {
  if (!fall || fall.step >= FALL_ANGLES.length - 1) return;
  fall.step++;
  showFallFrame();
  fall.timer = window.setTimeout(advanceFall, FALL_SPEED_MS);
}

export function showFallFrame() {
  if (!fall) return;
  const url = fallenKing(fall.colour, FALL_ANGLES[fall.step]);
  // (more specific than the normal piece pictures, so it wins)
  fallStyle.textContent = url ? `:root[data-pieces] .cg-wrap cg-board piece.king.${fall.colour} { background-image: url("${url}"); }` : "";
}

/** Stockfish's verdict on the position on screen, as White's share of the bar. */
export function drawEvalBar() {
  if (!evalOn()) return;
  const position = shown();
  let fraction: number | undefined;
  let label = "";
  if (position.isCheckmate()) {
    [fraction, label] = position.turn === "black" ? [1, "1-0"] : [0, "0-1"];
  } else if (isDrawnPosition(position) || (!analysis && !preview && viewPly === null && game.outcome())) {
    [fraction, label] = [0.5, "½"];
  } else {
    const score = analyser.evals.get(fenOf(position))?.score;
    if (score?.mate !== undefined) {
      [fraction, label] = [score.mate > 0 ? 1 : 0, `M${Math.abs(score.mate)}`];
    } else if (score) {
      // Same formula lichess uses: the bar moves a lot for the first few pawns
      fraction = 1 / (1 + Math.exp(-0.00368208 * score.cp));
      label = formatScore(score);
    }
  }
  if (fraction === undefined) [fraction, label] = [lastFraction, "..."];
  set.lastFraction(fraction);
  // White's share sits on White's side of the board
  evalBar.classList.toggle("flipped", orientation === "black");
  evalBar.style.setProperty("--white", `${fraction * 100}%`);
  const tag = evalBar.querySelector<HTMLElement>(".eval-label")!;
  tag.textContent = label;
  tag.classList.toggle("on-white", fraction >= 0.5);
}
