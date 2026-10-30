// Opening demos

import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Chess, normalizeMove } from "chessops/chess";
import { parseSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, makeUci, opposite, parseUci } from "chessops/util";

import { accuracyRating, divide, gameAccuracy, phaseAccuracy } from "../accuracy";
import { type Mood, avatarSvg } from "../avatar";
import { type Score, isCastling, afterMove as positionAfter } from "../coach";
import { DEMOS, type Demo, demoFor, demoSteps, introMoves } from "../demos";
import { Game } from "../game";
import { icon } from "../icons";
import type { TrainPhase } from "../lessons";
import { analyser, coachAnalysis, currentPly, gameMoves, ratingsOn } from "../main";
import {
  MASTERED, type Mistake, type MistakeKind, type MistakeLine, type MistakePhase, addMistakes, comesBack,
  today as dayNumber, dueMistakes, loadMistakes, mistakeCounts, mistakeId, recordAttempt, saveLines,
} from "../mistakes";
import { controlledSquares, dangerAfter, moveInWords, narrateMove, quietIdea, ratingWords, targetsOf } from "../narrate";
import { type Opening, REPERTOIRE, firstMoveOf, goalWords, menuName, setupProgress, systemFor } from "../openings";
import { type Mark, chainOf, whatYouGet } from "../outlook";
import { readPgn, today } from "../pgn";
import {
  type GamePhase, PROGRESS_MIN, SLIP_THEMES, SLIP_WORDS, type SlipKind, picture, saveSummary,
} from "../progress";
import { withRatingNames } from "../ratingNames";
import { type Review, fenOf, winningChance } from "../review";
import { play } from "../sounds";

import {
  type CoachButton, type CoachSay, type StepFrame, closeOverlay, closeStepper, element, listener, loadHistory, para,
  reviews, showOverlay,
} from "./coach";
import { $, colourBox, demoPick, menuCard, myOpeningBox, opponentBox } from "./dom";
import { arrowEnd, refresh } from "./draw";
import { gameKey, keepAnalysis, restoreAnalysis, savedAnalyses, useDepth, watching, withBook } from "./matches";
import { goTo } from "./moves";
import { gameScores, ratingClass } from "./playerBars";
import { message } from "./popups";
import { openingInfo } from "./ratings";
import { moveSound, showMenu } from "./startMenu";
import { hideMenu, resetBoard, showScreen } from "./startScreens";
import {
  orientation, busy, deepMoves, deepNeeded, deepening, demo, drill, game, gameHeaders, lastReviews, match, menuOpen,
  practice, puzzleLevel, replaying, reviewing, savedFromReview, set, trainTab, viewPly,
} from "./state";
import { setBusy } from "./strategyCoach";
import { PUZZLE_LEVELS, drawTrainScreen, showLessonList, startPuzzles } from "./train";

export const DEMO_MOVE_DELAY = 1100; // ms between moves while it plays on

export function startDemo(chosen: Demo, line = 0) {
  resetBoard(new Game(), { White: "White", Black: "Black", Event: `${chosen.opening} demo`, Date: today() });
  set.mode("practice");
  set.canReview(false);
  set.reviewing(false);
  // Black openings are shown from Black's side
  set.orientation(REPERTOIRE.find((o) => o.name === chosen.opening)?.colour ?? "white");
  set.demo({ demo: chosen, line: 0, steps: [], playing: false, interrupted: false, intro: true });
  set.gameOrigin("learn");
  demoPick.replaceChildren(...chosen.lines.map((l, i) => new Option(`${i + 1}. ${l.title}`, String(i))));
  if (menuOpen) hideMenu();
  loadDemoLine(line);
}

/** Set up one line of the demo from its first move, and start playing it. */
export function loadDemoLine(index: number, intro = true) {
  if (!demo) return;
  clearTimeout(demo.timer);
  demo.line = index;
  demo.steps = demoSteps(demo.demo, index);
  set.game(new Game());
  // the introduction shows the opening's basic setup; play brings the whole line
  for (const move of intro ? introMoves(demo.demo, index) : demo.steps.map((step) => step.move)) game.play(move);
  set.plyNotes(new Map());
  set.analysis(null);
  set.preview(null);
  set.quiz(null);
  demo.interrupted = false;
  demo.intro = intro;
  if (intro) {
    // the basic setup, while the coach introduces it; play starts the line
    set.viewPly(null);
    demo.playing = false;
    refresh();
    return;
  }
  set.viewPly(0);
  demo.playing = true;
  refresh(); // the moves follow once the coach has spoken
  scheduleDemo(800);
}

/** Play, after the introduction: back to the start, and the line plays out. */
export function startDemoLine() {
  if (!demo) return;
  demo.intro = false;
  demo.playing = true; // (before going back to the start, so the coach says "Here we go")
  demo.interrupted = false;
  set.game(new Game());
  for (const step of demo.steps) game.play(step.move);
  set.demoStepping(true);
  goTo(0);
  set.demoStepping(false);
  refresh();
  scheduleDemo(900);
}

export function scheduleDemo(delay = DEMO_MOVE_DELAY) {
  if (!demo) return;
  clearTimeout(demo.timer);
  if (demo.playing) demo.timer = window.setTimeout(demoAdvance, delay);
}

/** Autoplay: the next move, then a pause if it has a note. */
export function demoAdvance() {
  if (!demo || !demo.playing) return;
  const ply = currentPly();
  if (ply >= game.length) {
    demo.playing = false;
    refresh();
    return;
  }
  set.demoStepping(true);
  goTo(ply + 1);
  set.demoStepping(false);
  refresh(); // the next move follows once the coach has said what this one does (onSpoken)
}

export function onDemoPlay() {
  if (!demo) return;
  if (demo.intro) {
    startDemoLine();
    return;
  }
  if (currentPly() >= game.length) {
    loadDemoLine(demo.line, false); // watch it again
    return;
  }
  demo.playing = !demo.playing;
  demo.interrupted = false;
  refresh();
  scheduleDemo(demo.playing ? 400 : DEMO_MOVE_DELAY);
}

/** The demo's controls: play / pause / replay between the move buttons, the
 *  variation buttons, and the line's name as the heading. */
export function drawDemo() {
  document.body.classList.toggle("demo-on", demo !== null);
  document.body.classList.toggle("replay-on", canReplay());
  $("moves-heading").textContent = demo ? demoTitle() : "Moves";
  if (!demo && !canReplay()) return;
  const atEnd = currentPly() >= game.length && !demo?.intro;
  const playing = demo ? demo.playing : replaying;
  const [glyph, label] = atEnd ? ["replay", demo ? "Watch again" : "Play from the start"] : playing ? ["pause", "Pause"] : ["play", "Play"];
  document.body.classList.toggle("demo-intro", !!demo?.intro);
  for (const button of document.querySelectorAll<HTMLButtonElement>(".nav-play")) {
    button.title = label;
    button.setAttribute("aria-label", label);
    button.querySelector(".play-icon")!.innerHTML = icon(glyph, 20);
  }
  if (!demo) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".var-prev")) button.disabled = demo.line === 0;
  for (const button of document.querySelectorAll<HTMLButtonElement>(".var-next")) button.disabled = demo.line + 1 >= demo.demo.lines.length;
}

export const lowerFirst = (text: string) => (/^(White|Black)/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "London · Main", "London · Nf3 variation" */
export function demoTitle(): string {
  if (!demo) return "";
  return `${openingShortName(demo.demo.opening)} · ${demo.demo.lines[demo.line].title}`;
}

/** "London" from "London System", "Caro-Kann / Slav" from "Caro-Kann / Slav (...c6 and ...d5)" */
export function openingShortName(name: string): string {
  return name.replace(/ \(.*\)$/, "").replace(/ (System|Opening|Game|Defence|setup)$/, "");
}

/** On each move of a demo: what the piece now controls, the pawn chain it
 *  builds, and the square a quiet move takes away. At the start: where the
 *  pieces are heading. */
/** What a move does, as a picture: arrows to the squares the piece now
 *  controls (the centre, and pieces it hits), the pawn chain it builds, and
 *  the square it takes away from them. (The lessons, and Tell me more on a
 *  good move in a review.) */
export function movePicture(before: Chess, after: Chess, move: NormalMove, yours: boolean, viewer: Color | null): DrawShape[] {
  const shapes: DrawShape[] = [];
  const marked = new Set<number>();
  const mark = (square: number) => {
    if (marked.has(square)) return;
    marked.add(square);
    shapes.push({ orig: makeSquare(square) as Key, brush: yours ? "you" : "them" });
  };
  if (!isCastling(before, move)) {
    for (const square of controlledSquares(after, move.to)) {
      shapes.push({ orig: makeSquare(move.to) as Key, dest: makeSquare(square) as Key, brush: yours ? "control" : "controlThem" });
    }
  }
  for (const square of chainOf(after, move.to)) mark(square);
  for (const square of quietIdea(before, move, viewer)?.squares ?? []) mark(square);
  return shapes;
}

export function demoShapes(): DrawShape[] {
  if (!demo || demo.intro) return [];
  const ply = currentPly();
  if (ply === 0) return []; // the start: nothing drawn (the introduction showed where the pieces go)
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const move = game.moves[ply - 1].move;
  const yours = before.turn === orientation;
  const shapes = movePicture(before, after, move, yours, orientation);
  // The moves and squares this note talks about
  const label = demo.steps[ply - 1]?.label;
  for (const item of (label && demo.demo.lines[demo.line].arrows?.[label]) || []) {
    const threat = item.endsWith("!");
    const brush = threat ? "them" : "guess";
    const squares = item.replace(/[@!]/g, "");
    if (item.startsWith("@")) shapes.push({ orig: squares as Key, brush });
    else shapes.push({ orig: squares.slice(0, 2) as Key, dest: squares.slice(2, 4) as Key, brush });
  }
  return shapes;
}

/** The end of a line: the position you get, explained with Stockfish - its
 *  shape, its strengths and ideas, and what to watch out for. */
export async function showWhatYouGet() {
  if (!demo || busy) return;
  const position = game.position;
  setBusy(true, "Let me look at the position you get...");
  try {
    const pages = await whatYouGet(coachAnalysis, position, orientation);
    setBusy(false);
    if (!demo) return refresh();
    const brush = (mark: Mark) => (mark === "bad" ? "them" : mark === "plan" ? "guess" : "you");
    const frames: StepFrame[] = pages.map((page) => ({
      position,
      shapes: [
        ...page.arrows.map(([from, to, mark]): DrawShape => ({ orig: makeSquare(from) as Key, dest: arrowEnd(position, { from, to }), brush: brush(mark) })),
        ...page.squares.map(([square, mark]): DrawShape => ({ orig: makeSquare(square) as Key, brush: brush(mark) })),
      ],
    }));
    const line = demo.line;
    const more = line + 1 < demo.demo.lines.length;
    const chosen = demo.demo;
    const extra: CoachButton | CoachButton[] = more
      ? { ico: "next", label: "Next line", kind: "accent", run: () => { closeStepper(); loadDemoLine(line + 1); } }
      : [
          { ico: "target", label: "Drill it", kind: "accent", labelled: true, run: () => { closeStepper(); startDrill(chosen); } },
          { ico: "knight", label: "Practice match", labelled: true, run: () => { closeStepper(); onDemoTry(); } },
        ];
    set.stepper({ positions: frames.map((f) => f.position), moves: [], texts: pages.map((p) => p.text), step: 1, mood: "talk", extra, frames });
    refresh();
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    setBusy(false);
    refresh();
  }
}

// -- Playing a reviewed game through, move by move -------------------------------

export const REPLAY_STOPS = new Set(["Brilliant", "Great", "Inaccuracy", "Mistake", "Blunder", "Miss", "Missed Win"]);
export const REPLAY_MOVE_MS = 900; // an ordinary move, then the next
export const REPLAY_WAIT_MS = 6000; // the longest it waits for a move's rating
export const canReplay = () => !demo && reviewing && game.length > 0;

export function toggleReplay() {
  if (!canReplay()) return;
  if (replaying) {
    set.replaying(false);
    refresh();
    return;
  }
  set.replaying(true);
  if (currentPly() >= game.length) {
    set.replayStepping(true);
    goTo(0);
    set.replayStepping(false);
  }
  refresh();
  setTimeout(replayNext, 400);
}

/** The next move. Ordinary moves go by quickly; it stops on a brilliant move
 *  or an inaccuracy, mistake, miss or blunder, so it can be looked at. */
export function replayNext() {
  if (!replaying) return;
  const ply = currentPly();
  if (ply >= game.length) {
    set.replaying(false);
    refresh();
    return;
  }
  set.replayStepping(true);
  goTo(ply + 1);
  set.replayStepping(false);
  const shownAt = performance.now();
  const check = () => {
    if (!replaying || currentPly() !== ply + 1) return;
    const review = lastReviews[ply];
    const waited = performance.now() - shownAt;
    // wait for the rating (Stockfish may still be on it), but not for ever
    if (!review && ratingsOn() && waited < REPLAY_WAIT_MS) {
      setTimeout(check, 200);
      return;
    }
    if (review && REPLAY_STOPS.has(review.rating)) {
      set.replaying(false);
      refresh();
      return;
    }
    setTimeout(replayNext, Math.max(0, REPLAY_MOVE_MS - waited));
  };
  setTimeout(check, 200);
}

export function onNavPlay() {
  if (demo) onDemoPlay();
  else toggleReplay();
}

/** "Show me this opening" while practising it: leave the game for the demo. */
export async function onShowDemo() {
  const chosen = demoFor(match?.myOpening?.name);
  if (!chosen) return;
  if (game.length && !(await message("Opening demo", "Watch the demo of this opening? It ends your current game.", true))) return;
  startDemo(chosen);
}

/** Try it yourself: back to the menu, set up to practise this opening. */
export function onDemoTry() {
  if (demo) practiseOpening(demo.demo.opening);
}

// -- Opening drills: you play the lesson's moves -------------------------------
// Round 1 is the main line. Round 2 mixes it up: a few of the variations, and in
// most of them the opponent slips (an inaccuracy or a mistake) somewhere along
// the way, for you to spot and punish.

export const DRILL_VARIATIONS = 3; // lines in the mixed round
export const DRILL_SLIP_MIN = 8; // their slip costs them at least this much winning chance (an inaccuracy)...
export const DRILL_SLIP_MAX = 30; // ...and at most this much (a mistake, nothing silly)
export const DRILL_ANSWER = 5; // your answer to it counts within this of the best move ("Good" or better)
export const DRILL_MOVE_DELAY = 700; // ms before their move

export interface DrillScore {
  moves: number; // your moves
  right: number; // ...found first time
  slips: number; // their slips
  spotted: number; // ...that you punished first time
}

export interface DrillState {
  demo: Demo;
  opening?: Opening;
  user: Color;
  round: 1 | 2;
  queue: { line: number; slip: boolean }[]; // the mixed round's lines still to come
  line: number;
  script: NormalMove[]; // the line's moves
  slipAt?: number; // the ply where they slip (the mixed round)
  slipped: boolean; // they did: now find the answer
  best?: { move: NormalMove; chance: number }; // the best answer to their slip
  state: "playing" | "between" | "done";
  waiting: boolean; // the coach is thinking (the board waits)
  tries: number; // wrong tries at this move
  note: string;
  mood: Mood;
  scores: [DrillScore, DrillScore];
  token: number; // a new line cancels the old one's timers
}


export const newScore = (): DrillScore => ({ moves: 0, right: 0, slips: 0, spotted: 0 });
export const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
export const shuffled = <T,>(list: T[]): T[] => [...list].sort(() => Math.random() - 0.5);

/** Start the drill of an opening, from round 1. */
export function startDrill(chosen: Demo) {
  const opening = REPERTOIRE.find((o) => o.name === chosen.opening);
  const user = opening?.colour ?? "white";
  resetBoard(new Game(), { White: "White", Black: "Black", Event: `${chosen.opening} drill`, Date: today() });
  set.mode("play"); // no eval bar to give it away
  set.gameOrigin("learn");
  set.currentView("board");
  set.orientation(user);
  set.drill({
    demo: chosen, opening, user, round: 1, queue: [], line: 0, script: [], slipped: false, state: "playing",
    waiting: false, tries: 0, note: "", mood: "talk", scores: [newScore(), newScore()], token: 0,
  });
  if (menuOpen) hideMenu();
  void play("start");
  startDrillLine(0, false, "Round 1: the main line. You play your moves, I'll play theirs.");
}

/** One line of the drill, from the start. */
export function startDrillLine(line: number, slip: boolean, note: string) {
  const d = drill;
  if (!d) return;
  const token = ++d.token;
  d.line = line;
  d.script = demoSteps(d.demo, line).map((step) => step.move);
  d.slipped = false;
  d.best = undefined;
  d.slipAt = undefined;
  if (slip) {
    // their slip comes after their first move, somewhere in the line
    const theirs: number[] = [];
    for (let ply = 2; ply < d.script.length; ply++) if ((ply % 2 === 0 ? "white" : "black") !== d.user) theirs.push(ply);
    if (theirs.length) d.slipAt = pickOne(theirs);
  }
  d.state = "playing";
  d.waiting = false;
  d.tries = 0;
  d.note = note;
  d.mood = "talk";
  set.game(new Game());
  set.viewPly(null);
  set.analysis(null);
  set.preview(null);
  refresh();
  drillContinue(token, 1200);
}

/** After a move: their reply, the end of the line, or your turn. */
export function drillContinue(token: number, delay = DRILL_MOVE_DELAY) {
  const d = drill;
  if (!d || d.token !== token || d.state !== "playing") return;
  if (!d.slipped && game.length >= d.script.length) {
    drillLineDone();
    return;
  }
  if (game.position.turn === d.user) {
    refresh();
    return;
  }
  d.waiting = true;
  refresh();
  setTimeout(() => void drillTheirMove(token), delay);
}

export async function drillTheirMove(token: number) {
  const d = drill;
  if (!d || d.token !== token) return;
  const ply = game.length;
  let move = d.script[ply];
  let slipped = false;
  if (ply === d.slipAt) {
    const slip = await findSlip(game.position, move);
    if (drill !== d || d.token !== token) return;
    if (slip) [move, slipped] = [slip, true];
  }
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  if (!slipped) {
    d.waiting = false;
    drillContinue(token);
    return;
  }
  // Their slip: what's your best answer?
  d.slipped = true;
  d.scores[1].slips++;
  d.note = "That's not the move from the lesson. Look carefully: what does it change?";
  d.mood = "think";
  refresh();
  const [line] = await coachAnalysis.analyse(game.position, 1.2, 1);
  if (drill !== d || d.token !== token) return;
  if (!line?.pv[0]) {
    drillLineDone();
    return;
  }
  d.best = { move: line.pv[0], chance: winningChance(line.score, d.user) };
  d.waiting = false;
  refresh();
}

/** A move they could play instead of the lesson's: an inaccuracy or a
 *  mistake, not a silly blunder - something you need to spot. */
export async function findSlip(position: Chess, lessonMove: NormalMove): Promise<NormalMove | undefined> {
  const mover = position.turn;
  const lines = await coachAnalysis.analyse(position, 1, 12);
  if (!lines.length) return undefined;
  const best = Math.max(...lines.map((line) => winningChance(line.score, mover)));
  const fits = (chance: number) => best - chance >= DRILL_SLIP_MIN && best - chance <= DRILL_SLIP_MAX;
  const isLesson = (move: NormalMove) => makeUci(move) === makeUci(lessonMove);
  const listed = lines.filter((line) => line.pv[0] && !isLesson(line.pv[0]) && fits(winningChance(line.score, mover)));
  if (listed.length) return pickOne(listed).pv[0];
  // Not among the engine's top moves: try a few ordinary-looking ones
  const seen = new Set(lines.map((line) => (line.pv[0] ? makeUci(line.pv[0]) : "")));
  const others: NormalMove[] = [];
  for (const [from, dests] of position.allDests()) {
    if (position.board.get(from)?.role === "king") continue;
    for (const to of dests) {
      const move: NormalMove = { from, to };
      if (!seen.has(makeUci(move)) && !isLesson(move)) others.push(move);
    }
  }
  for (const move of shuffled(others).slice(0, 8)) {
    const score = await coachAnalysis.moveScore!(position, move, 0.3);
    if (fits(winningChance(score, mover))) return move;
  }
  return undefined;
}

/** Your move in a drill. */
export function drillMove(move: NormalMove) {
  const d = drill;
  if (!d || d.state !== "playing" || d.waiting) return;
  if (d.slipped) {
    void drillAnswer(move);
    return;
  }
  const before = game.position.clone();
  const expected = d.script[game.length];
  const score = d.scores[d.round - 1];
  if (makeUci(move) === makeUci(expected)) {
    if (d.tries === 0) score.right++;
    score.moves++;
    d.tries = 0;
    const played = game.play(move);
    moveSound(played.san, opposite(game.position.turn));
    const goal = goalDone(before, move);
    d.note = goal ? `Right: ${goal}, that's ticked off.` : pickOne(["Right.", "That's the move.", "Yes, that's the lesson's move.", "Good."]);
    d.mood = "happy";
    drillContinue(d.token);
    return;
  }
  void drillWrong(before, move, expected);
}

/** A wrong move: say how good it was, then take it back. */
export async function drillWrong(before: Chess, move: NormalMove, expected: NormalMove) {
  const d = drill!;
  const token = d.token;
  d.tries++;
  d.waiting = true;
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  d.note = "Let me check that...";
  d.mood = "think";
  refresh();
  const [best] = await coachAnalysis.analyse(before, 0.5, 1);
  const score = await coachAnalysis.moveScore!(before, move, 0.5);
  if (drill !== d || d.token !== token) return;
  const loss = best ? Math.max(0, winningChance(best.score, d.user) - winningChance(score, d.user)) : 0;
  const rating = loss < 2 ? "Excellent" : loss < 5 ? "Good" : loss < 10 ? "Inaccuracy" : loss < 20 ? "Mistake" : "Blunder";
  const verdictText = loss < 5
    ? `That's ${ratingWords(rating)} too, but it isn't the lesson's move.`
    : `That would be ${ratingWords(rating)}.`;
  if (d.tries === 1) {
    addMistakes([{ fen: fenOf(before), best: makeUci(expected), line: lineTo(before), kind: "drill", phase: "opening", source: `the ${openingShortName(d.demo.opening)} drill` }]);
  }
  const goal = goalDone(before, expected);
  const hint = d.tries >= 2 ? "The arrow shows the lesson's move." : goal ? `Think about your setup: ${goal}.` : "Think back to the lesson.";
  d.note = `${verdictText} ${hint}`;
  d.mood = loss < 5 ? "talk" : "worried";
  setTimeout(() => {
    if (drill !== d || d.token !== token) return;
    game.undo();
    void play("illegal");
    d.waiting = false;
    refresh();
  }, 900);
}

/** Your answer to their slip: good enough is good enough. */
export async function drillAnswer(move: NormalMove) {
  const d = drill!;
  const token = d.token;
  const before = game.position.clone();
  d.waiting = true;
  const played = game.play(move);
  moveSound(played.san, opposite(game.position.turn));
  d.note = "Let me check that...";
  d.mood = "think";
  refresh();
  const score = await coachAnalysis.moveScore!(before, move, 0.8);
  if (drill !== d || d.token !== token || !d.best) return;
  const good = makeUci(move) === makeUci(d.best.move) || winningChance(score, d.user) >= d.best.chance - DRILL_ANSWER;
  if (good) {
    if (d.tries === 0) d.scores[1].spotted++;
    void play("right");
    d.note = `Well spotted! ${moveInWords(before, move, d.user)}`;
    d.mood = "wow";
    d.waiting = false;
    drillLineDone(true);
    return;
  }
  d.tries++;
  if (d.tries === 1 && d.best) {
    addMistakes([{ fen: fenOf(before), best: makeUci(d.best.move), line: lineTo(before), kind: "miss", phase: "opening", source: `the ${openingShortName(d.demo.opening)} drill` }]);
  }
  d.note = d.tries >= 2
    ? "Not that either. The arrow shows the way to make them pay."
    : "There's something better. What did their last move leave open, or what does it threaten?";
  d.mood = "worried";
  setTimeout(() => {
    if (drill !== d || d.token !== token) return;
    game.undo();
    void play("illegal");
    d.waiting = false;
    refresh();
  }, 900);
}

/** The setup goal a move achieves, in words ("bishop to f4"), if any. */
export function goalDone(before: Chess, move: NormalMove): string | undefined {
  const d = drill;
  if (!d?.opening || before.turn !== d.user) return undefined;
  const setup = drillSystem()?.setup;
  if (!setup) return undefined;
  const [, missingBefore] = setupProgress(before, d.user, setup);
  const [, missingAfter] = setupProgress(positionAfter(before, move), d.user, setup);
  const done = missingBefore.find((goal) => !missingAfter.includes(goal));
  return done ? goalWords(done) : undefined;
}

/** The opening system the drill's line uses (its setup is the checklist). */
export function drillSystem() {
  const d = drill;
  if (!d?.opening) return undefined;
  return systemFor(d.opening, firstMoveOf(game.positionAt(0), gameMoves()));
}

/** The end of a line: on to the next one, or the result. */
export function drillLineDone(answered = false) {
  const d = drill;
  if (!d) return;
  d.waiting = false;
  if (d.round === 1) {
    const s = d.scores[0];
    d.state = "between";
    d.note = `Main line done: ${s.right} of ${s.moves} moves first time. Let's do that again, this time I'll mix it up - good luck!`;
    d.mood = "happy";
    refresh();
    return;
  }
  if (!d.queue.length) {
    drillDone();
    return;
  }
  d.state = "between";
  if (!answered) {
    d.note = d.tries === 0 && !d.slipped ? "That line's done. Ready for the next one?" : "That line's done. Next one?";
    d.mood = "happy";
  }
  refresh();
}

/** Round 2: some variations, most with a slip in them. */
export function startMixedRound() {
  const d = drill;
  if (!d) return;
  const variations = d.demo.lines.map((_, i) => i).slice(1);
  const lines = variations.length ? shuffled(variations).slice(0, DRILL_VARIATIONS) : [0, 0];
  // at least one slip; the others more often than not
  const slips = lines.map((_, i) => i === 0 || Math.random() < 0.6);
  d.queue = shuffled(lines.map((line, i) => ({ line, slip: slips[i] })));
  d.round = 2;
  nextDrillLine();
}

export function nextDrillLine() {
  const d = drill;
  if (!d) return;
  const next = d.queue.shift();
  if (!next) {
    drillDone();
    return;
  }
  const title = d.demo.lines[next.line].title;
  startDrillLine(next.line, next.slip, title === "Main" ? "The main line again, but stay alert." : `Next up: the ${title}. Stay alert.`);
}

export function drillDone() {
  const d = drill;
  if (!d) return;
  d.state = "done";
  d.waiting = false;
  const [one, two] = d.scores;
  const right = one.right + two.right;
  const moves = one.moves + two.moves;
  d.mood = right === moves && two.spotted === two.slips ? "wow" : right >= moves * 0.75 ? "happy" : "talk";
  d.note = "That's the drill done.";
  refresh();
  const words = [
    `Round 1, the main line: ${one.right} of ${one.moves} moves first time.`,
    `Round 2, mixed up: ${two.right} of ${two.moves} moves first time` +
      (two.slips ? `, and you spotted ${two.spotted} of ${two.slips} slip${two.slips === 1 ? "" : "s"}.` : "."),
    right === moves && two.spotted === two.slips ? "Perfect! You know this opening."
      : right >= moves * 0.75 ? "Nicely done. Another go will make it stick."
        : "A good start. Drill it again and it'll soon feel natural.",
  ];
  const name = d.demo.opening;
  showOverlay(d.mood, words.map((text) => para(text)), [
    { ico: "replay", label: "Drill again", kind: "accent", run: () => { closeOverlay(false); startDrill(d.demo); } },
    { ico: "knight", label: "Play a practice match with it", run: () => { closeOverlay(false); practiseOpening(name); } },
    { ico: "school", label: "Back to Training", kind: "soft", run: () => { closeOverlay(false); backToTraining(name); } },
  ]);
}

/** What the coach says during a drill. */
export function drillSays(): CoachSay {
  const d = drill!;
  if (d.state === "between") {
    const next: CoachButton = d.round === 1
      ? { ico: "play", label: "Round 2", kind: "accent", run: startMixedRound }
      : { ico: "skipNext", label: "Next line", kind: "accent", run: nextDrillLine };
    return { mood: d.mood, text: d.note, buttons: [next], key: `drill:${d.token}:between` };
  }
  if (d.state === "done") {
    const again: CoachButton = { ico: "replay", label: "See the result", kind: "accent", run: drillDone };
    return { mood: d.mood, text: d.note, buttons: [again], key: `drill:${d.token}:done` };
  }
  return { mood: d.mood, text: d.note, buttons: [], key: `drill:${d.token}:${game.length}:${d.tries}:${d.note}` };
}

/** After two wrong tries, the arrow shows the move. */
export function drillShapes(): DrawShape[] {
  const d = drill;
  if (!d || d.state !== "playing" || d.waiting || d.tries < 2 || game.position.turn !== d.user) return [];
  const move = d.slipped ? d.best?.move : d.script[game.length];
  return move ? [{ orig: makeSquare(move.from) as Key, dest: makeSquare(move.to) as Key, brush: "you" }] : [];
}

/** The setup checklist under the board: a tick for each part that's in place. */
export function drawDrillSetup() {
  const box = $("drill-setup");
  const system = drill ? drillSystem() : undefined;
  box.hidden = !drill || !system;
  document.body.classList.toggle("drilling", !!drill);
  if (!drill || !system) return;
  const [, missing] = setupProgress(game.position, drill.user, system.setup);
  const colour = drill.user;
  const roles: Record<string, Role> = { P: "pawn", N: "knight", B: "bishop", R: "rook", Q: "queen", K: "king" };
  box.replaceChildren(...system.setup.map((goal) => {
    const chip = document.createElement("span");
    chip.className = "setup-chip";
    chip.classList.toggle("done", !missing.includes(goal));
    chip.title = goalWords(goal);
    if (typeof goal === "string") {
      chip.innerHTML = `<span class="mini-piece king ${colour}"></span><span>castle</span>`;
    } else {
      const role = roles[goal[0]] ?? "pawn";
      chip.innerHTML = `<span class="mini-piece ${role} ${colour}"></span><span>${goal[1].join("/")}</span>`;
    }
    return chip;
  }));
}

/** Play a practice match with an opening: the practice screen, set up for it. */
export function practiseOpening(name: string) {
  const opening = REPERTOIRE.find((o) => o.name === name);
  resetBoard(new Game());
  const practice = menuCard.querySelector<HTMLInputElement>('input[name="mode"][value="practice"]');
  if (practice) practice.checked = true;
  opponentBox.selectedIndex = 0;
  if (opening) {
    colourBox.value = opening.colour === "white" ? "White" : "Black";
    set.matchColour(opening.colour);
    myOpeningBox.value = menuName(opening);
  }
  refresh();
  showMenu();
  set.homeChoice("practice");
  showScreen("practice");
}

/** Back to Training, on the Openings tab. */
export function backToTraining(name: string) {
  resetBoard(new Game());
  refresh();
  showMenu();
  set.homeChoice("train");
  set.trainTab("openings");
  set.learnOpening(name);
  set.learnColour(REPERTOIRE.find((o) => o.name === name)?.colour ?? "white");
  $("lesson-list").hidden = true;
  showScreen("train");
  drawTrainScreen();
}

// -- Your mistakes: positions from your own games and drills, as puzzles ------------

export interface Practice {
  list: Mistake[];
  index: number;
  tries: number; // wrong tries at this one
  hints: number;
  state: "solving" | "solved" | "shown" | "done";
  waiting: boolean; // checking a move
  note: string;
  mood: Mood;
  right: number; // right first time, this session
}

// The last review's slips, saved as puzzles: for the note under the statistics

export const SAVED_RATINGS = new Set(["Mistake", "Miss", "Missed Win", "Blunder"]);

/** After a review: your mistakes, misses and blunders become puzzles. */
export function saveGameMistakes(list: (Review | undefined)[]) {
  const you = listener();
  if (!you || watching() || !game.length) return;
  const positions = Array.from({ length: game.length + 1 }, (_, ply) => game.positionAt(ply));
  const division = divide(positions);
  const phaseOf = (ply: number): MistakePhase =>
    division.middle === undefined || ply < division.middle ? "opening"
      : division.end !== undefined && division.end <= ply ? "endgame" : "middlegame";
  const opponent = gameHeaders[you === "white" ? "Black" : "White"];
  const source = /^(Stockfish|Coach)\b/.test(opponent ?? "") ? "your game against the coach"
    : opponent && opponent !== "?" ? `your game against ${opponent}` : "one of your games";
  const plies: number[] = [];
  const found = list.flatMap((review, i) => {
    if (!review || !SAVED_RATINGS.has(review.rating) || !review.bestSan || game.moverOf(i + 1) !== you) return [];
    const before = positions[i];
    const best = parseSan(before, review.bestSan) as NormalMove | undefined;
    if (!best) return [];
    plies.push(i + 1);
    return [{
      fen: fenOf(before), best: makeUci(best), played: makeUci(game.moves[i].move),
      line: { start: game.fenAt(0), moves: game.moves.slice(0, i).map((m) => makeUci(m.move)) },
      kind: (review.rating === "Miss" || review.rating === "Missed Win" ? "miss" : "mistake") as MistakeKind,
      phase: phaseOf(i), source,
    }];
  });
  const earlier = savedFromReview?.key === gameKey() ? savedFromReview.ids.length : 0; // before a deeper look
  const added = addMistakes(found);
  set.savedFromReview({ key: gameKey(), ids: found.map((m) => mistakeId(m.fen, m.best)), added, plies });
  // New ones: say so once, to be acknowledged (the review marks each as you reach it)
  if (added) {
    const one = added === 1;
    void message(`${earlier ? `${added} more` : one ? "A" : added} slip${one ? "" : "s"} saved to Your mistakes`,
      (earlier ? `The deeper look found ${one ? "it" : "them"}. ` : "") +
      `I'll point ${one ? "it" : "them"} out as we go through the game, and you can try ${one ? "it as a puzzle" : "them as puzzles"} at the end.`);
  }
}

/** Try the slips saved from the game on the board, as puzzles. */
export function practiseGameSlips() {
  const saved = savedFromReview;
  if (!saved) return;
  const ids = new Set(saved.ids);
  startPractice(loadMistakes().filter((m) => ids.has(m.id)));
}

/** Practise these positions, one after another. */
export function startPractice(list: Mistake[]) {
  if (!list.length) return;
  findLines(list);
  resetBoard(new Game(), { White: "?", Black: "?", Event: "Your mistakes" });
  set.mode("play"); // no eval bar to give it away
  set.gameOrigin("train");
  set.currentView("board");
  set.practice({ list, index: -1, tries: 0, hints: 0, state: "solving", waiting: false, note: "", mood: "talk", right: 0 });
  if (menuOpen) hideMenu();
  showPracticePosition(0);
}

export function showPracticePosition(index: number) {
  const p = practice;
  if (!p) return;
  const mistake = p.list[index];
  if (!mistake) {
    p.state = "done";
    p.note = p.right === p.list.length
      ? `All ${p.list.length} right first time. Well done!`
      : `That's all for now: ${p.right} of ${p.list.length} right first time. The others come back tomorrow.`;
    p.mood = p.right === p.list.length ? "wow" : "happy";
    refresh();
    return;
  }
  // With the moves that led here: the moves to step back through, and it opens a
  // move early so their last move is played for you
  const line = mistake.line?.moves.length ? playLine(mistake.line) : null;
  set.game(line ?? new Game(mistake.fen));
  set.viewPly(line ? game.length - 1 : null);
  set.analysis(null);
  set.preview(null);
  set.orientation(game.position.turn);
  Object.assign(p, { index, tries: 0, hints: 0, state: "solving", waiting: false, mood: "talk" });
  const last = line ? `${narrateMove(game.positionAt(game.length - 1), game.moves[game.length - 1].move, game.position.turn)} ` : "";
  p.note = `From ${mistake.source}. ${last}` + (mistake.kind === "miss" ? "That was a slip. Can you punish it this time?"
    : mistake.kind === "drill" ? "What's the move here?"
      : "Last time this went wrong. Find a better move.");
  refresh();
  if (line) {
    setTimeout(() => {
      if (practice !== p || p.index !== index || viewPly !== game.length - 1) return;
      set.viewPly(null);
      moveSound(game.moves[game.length - 1].san, opposite(game.position.turn));
      refresh();
    }, PREVIOUS_MOVE_PAUSE);
  }
}

const PREVIOUS_MOVE_PAUSE = 700; // ms on the position before, before their move is played

/** A puzzle's game: its moves played from the start (null if they no longer lead to it). */
function playLine(line: MistakeLine): Game | null {
  try {
    const played = new Game(line.start);
    for (const uci of line.moves) {
      const move = parseUci(uci) as NormalMove | undefined;
      const legal = move && (normalizeMove(played.position, move) as NormalMove);
      if (!legal || !played.position.isLegal(legal)) return null;
      played.play(legal);
    }
    return played;
  } catch {
    return null;
  }
}

/** The moves of the game on the board up to a position in it (for a drill's slip). */
function lineTo(position: Chess): MistakeLine | undefined {
  const key = samePosition(fenOf(position));
  for (let ply = game.length; ply >= 0; ply--) {
    if (samePosition(fenOf(game.positionAt(ply))) === key) {
      return { start: game.fenAt(0), moves: game.moves.slice(0, ply).map((m) => makeUci(m.move)) };
    }
  }
  return undefined;
}

/** The moves (UCI) from one position to another through known positions only
 *  (breadth first, so the fewest moves), or undefined. */
function pathThrough(from: string, to: string, known: Set<string>): string[] | undefined {
  const target = samePosition(to);
  const start = new Game(from).position;
  const queue: [Chess, string[]][] = [[start, []]];
  const visited = new Set([samePosition(from)]);
  while (queue.length) {
    const [position, moves] = queue.shift()!;
    if (samePosition(fenOf(position)) === target) return moves;
    if (moves.length > 300) continue;
    for (const [from, dests] of position.allDests()) {
      for (const to of dests) {
        const promotes = position.board.get(from)?.role === "pawn" && (to < 8 || to >= 56);
        const move: NormalMove = promotes ? { from, to, promotion: "queen" } : { from, to };
        const next = position.clone();
        next.play(move);
        const key = samePosition(fenOf(next));
        if (!known.has(key) || visited.has(key)) continue;
        visited.add(key);
        queue.push([next, [...moves, makeUci(move)]]);
      }
    }
  }
  return undefined;
}

const samePosition = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** Positions saved before the moves were kept: look for them in your saved games
 *  your reviews and the opening lessons (and keep what's found). */
function findLines(list: Mistake[]) {
  const wanted = new Map(list.filter((m) => !m.line?.moves.length).map((m) => [samePosition(m.fen), m]));
  if (!wanted.size) return;
  const found = new Map<string, MistakeLine>();
  const search = (start: string, moves: NormalMove[]) => {
    const played = new Game(start);
    const look = () => {
      const mistake = wanted.get(samePosition(fenOf(played.position)));
      if (mistake && !found.has(mistake.id)) found.set(mistake.id, { start, moves: played.moves.map((m) => makeUci(m.move)) });
    };
    look();
    for (const move of moves) {
      if (!played.position.isLegal(move)) return;
      played.play(move);
      look();
    }
  };
  for (const saved of loadHistory()) {
    try {
      const loaded = readPgn(saved.pgn)[0]?.load().game;
      if (loaded) search(loaded.fenAt(0), loaded.moves.map((m) => m.move));
    } catch {
      // a game that won't read is skipped
    }
  }
  // Games reviewed but not saved (pasted in): their review keeps the positions;
  // the shortest way through them from the first is the game's own moves
  for (const saved of Object.values(savedAnalyses())) {
    const left = [...wanted.values()].filter((m) => !found.has(m.id));
    if (!left.length) break;
    const seen = new Set(saved.evals.map(([fen]) => samePosition(fen)));
    for (const mistake of left) {
      const moves = seen.has(samePosition(mistake.fen)) && saved.evals[0] ? pathThrough(saved.evals[0][0], mistake.fen, seen) : undefined;
      if (moves) found.set(mistake.id, { start: saved.evals[0][0], moves });
    }
  }
  const startFen = new Game().fenAt(0);
  for (const d of DEMOS) d.lines.forEach((_, i) => search(startFen, demoSteps(d, i).map((step) => step.move)));
  for (const mistake of wanted.values()) mistake.line = found.get(mistake.id) ?? mistake.line;
  saveLines(found);
}

/** Your move: the better move, or one nearly as good, solves it. */
export async function practiceMove(move: NormalMove) {
  const p = practice;
  if (!p || p.state !== "solving" || p.waiting) return;
  const mistake = p.list[p.index];
  const before = game.position.clone();
  const played = game.play(move);
  moveSound(played.san, before.turn);
  if (makeUci(move) === mistake.best) return practiceSolved(before, move);
  p.waiting = true;
  p.note = "Let me check that...";
  p.mood = "think";
  refresh();
  const [best] = await coachAnalysis.analyse(before, 0.6, 1);
  const score = await coachAnalysis.moveScore!(before, move, 0.6);
  if (practice !== p) return;
  if (best && winningChance(score, before.turn) >= winningChance(best.score, before.turn) - DRILL_ANSWER) {
    p.waiting = false;
    return practiceSolved(before, move);
  }
  p.tries++;
  p.note = p.tries >= 2 ? "Not that either. Tap the bulb for a hint, or the eye to see it."
    : mistake.kind === "drill" ? "Not quite. Think back to the lesson." : "Not quite. Have another look: what does their last move change?";
  p.mood = "worried";
  refresh();
  setTimeout(() => {
    if (practice !== p) return;
    game.undo();
    void play("illegal");
    p.waiting = false;
    refresh();
  }, 900);
}

export function practiceSolved(before: Chess, move: NormalMove) {
  const p = practice!;
  const mistake = p.list[p.index];
  const firstTime = p.tries === 0 && p.hints === 0;
  const updated = recordAttempt(mistake.id, firstTime);
  if (firstTime) p.right++;
  p.state = "solved";
  void play("right");
  const words = moveInWords(before, move, before.turn);
  p.note = firstTime
    ? `That's it! ${words} It comes back ${updated ? comesBack(updated) : "later"}.`
    : `That's it. ${words} It took a few tries, so it comes back ${updated ? comesBack(updated) : "tomorrow"}.`;
  p.mood = firstTime ? "wow" : "happy";
  refresh();
}

/** Show me: the better move, played on the board. It comes back tomorrow. */
export function practiceShow() {
  const p = practice;
  if (!p || p.state !== "solving" || p.waiting) return;
  const mistake = p.list[p.index];
  set.viewPly(null); // back to the puzzle, if stepping through the moves before it
  const before = game.position.clone();
  const best = normalizeMove(before, parseUci(mistake.best) as NormalMove) as NormalMove;
  if (!before.isLegal(best)) return;
  const played = game.play(best);
  moveSound(played.san, before.turn);
  recordAttempt(mistake.id, false);
  p.state = "shown";
  p.note = `This was the move: ${lowerFirst(moveInWords(before, best, before.turn))} It comes back tomorrow.`;
  p.mood = "talk";
  refresh();
}

export function practiceSays(): CoachSay {
  const p = practice!;
  const key = `practice:${p.index}:${p.state}:${p.tries}:${p.hints}:${p.note.length}`;
  if (p.state === "done") {
    return { mood: p.mood, text: p.note, key, buttons: [{ ico: "school", label: "Back to Training", kind: "accent", run: leavePractice }] };
  }
  if (p.state !== "solving") {
    const last = p.index + 1 >= p.list.length;
    return { mood: p.mood, text: p.note, key, buttons: [{ ico: "skipNext", label: last ? "Finish" : "Next puzzle", kind: "accent", run: () => showPracticePosition(p.index + 1) }] };
  }
  const hint: CoachButton = { ico: "bulb", label: "Hint", run: () => {
    set.viewPly(null); // the hint is for the puzzle, not a move before it
    p.hints++;
    p.note = "This piece moves.";
    refresh();
  } };
  const show: CoachButton = { ico: "eye", label: "Show me", kind: "soft", run: practiceShow };
  return { mood: p.mood, text: p.note, key, buttons: p.waiting ? [] : [hint, show] };
}

// -- Your progress: what your reviewed games add up to ------------------------------

/** What kind of slip a move was, from what it let the opponent do. */
export function slipKind(ply: number, review: Review): SlipKind {
  if (review.rating === "Miss" || review.rating === "Missed Win") return "miss";
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const mover = before.turn;
  const beforeEval = analyser.evals.get(fenOf(before));
  const afterEval = analyser.evals.get(fenOf(after));
  const mateFor = (score: Score | undefined, side: Color) =>
    score?.mate !== undefined && (side === "white" ? score.mate > 0 : score.mate < 0);
  if (mateFor(beforeEval?.score, mover) && !mateFor(afterEval?.score, mover)) return "missed-mate";
  if (mateFor(afterEval?.score, opposite(mover))) return "mated";
  const reply = afterEval?.best;
  if (reply && after.isLegal(reply) && targetsOf(positionAfter(after, reply), reply.to).length >= 2) return "fork";
  const danger = dangerAfter(review, before, after, beforeEval, afterEval, false, mover);
  if (danger && /queen|piece|can be taken/.test(danger.text)) return "hanging";
  if (danger && /pawn/.test(danger.text)) return "pawn";
  return "other";
}

/** After a review: a summary of the game for Your progress. */
export function saveGameSummary(list: (Review | undefined)[]) {
  const you = listener();
  if (!you || watching() || game.length < 6) return;
  const positions = Array.from({ length: game.length + 1 }, (_, ply) => game.positionAt(ply));
  const scores = gameScores();
  const start = positions[0].turn;
  const phases = phaseAccuracy(start, positions, scores);
  const result = gameHeaders.Result;
  const outcome = game.outcome();
  const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : result ? undefined : outcome?.winner;
  const info = openingInfo();
  const named = [...info].reverse().find((i) => i.opening)?.opening;
  const opponent = gameHeaders[you === "white" ? "Black" : "White"] ?? "";
  saveSummary({
    key: gameKey(),
    day: dayNumber(),
    colour: you,
    opponent: opponent === "?" ? "" : opponent,
    result: winner ? (winner === you ? "win" : "loss") : result === "1/2-1/2" || (outcome && !outcome.winner) ? "draw" : "unknown",
    accuracy: gameAccuracy(start, scores)[you],
    phases: { opening: phases.opening[you], middlegame: phases.middlegame[you], endgame: phases.endgame[you] },
    slips: list.flatMap((review, i) => (review && SAVED_RATINGS.has(review.rating) && game.moverOf(i + 1) === you ? [slipKind(i + 1, review)] : [])),
    opening: named ? named[1].split(":")[0] : undefined,
  });
}

export const PHASE_WORDS: Record<GamePhase, string> = { opening: "opening", middlegame: "middlegame", endgame: "endgame" };

/** The Your progress screen. */
export function drawProgress() {
  const box = $("progress");
  box.replaceChildren();
  const seen = picture();
  const say = (text: string) => {
    const card = element("div", "progress-card progress-say");
    const face = element("div", "coach-face small");
    face.innerHTML = avatarSvg("talk", 34);
    card.append(face, element("p", "", text));
    box.append(card);
  };
  if (seen.games < PROGRESS_MIN) {
    say(`Review ${PROGRESS_MIN} of your own games and your progress appears here: how your accuracy is going, ` +
      `your strongest and weakest phase, and what to practise next. So far: ${seen.games}.`);
    return;
  }
  // The coach's summing up
  const top = seen.slips[0];
  const parts: string[] = [];
  if (seen.strongest) parts.push(`Your ${PHASE_WORDS[seen.strongest]} is your strongest phase.`);
  if (seen.weakest) parts.push(`Most of your points slip away in the ${PHASE_WORDS[seen.weakest]}` +
    (top && top.kind !== "other" ? `, usually from ${lowerFirst(SLIP_WORDS[top.kind]).replace(/ \(a missed chance\)$/i, "")}.` : "."));
  say(parts.join(" ") || "Here's how your recent games add up.");

  // The trend
  const trend = element("div", "progress-card");
  trend.append(element("h3", "", "Accuracy"));
  if (seen.trend.length >= 2) {
    const width = 200;
    const height = 50;
    const low = Math.min(...seen.trend) - 5;
    const high = Math.max(...seen.trend) + 5;
    const points = seen.trend.map((value, i) =>
      `${(5 + (i * (width - 10)) / (seen.trend.length - 1)).toFixed(1)},${(height - 5 - ((value - low) / (high - low)) * (height - 10)).toFixed(1)}`);
    const last = points[points.length - 1].split(",");
    trend.insertAdjacentHTML("beforeend",
      `<svg class="progress-trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Accuracy over your last ${seen.trend.length} games">` +
      `<polyline points="${points.join(" ")}"/><circle cx="${last[0]}" cy="${last[1]}" r="3"/></svg>`);
    const first = seen.trend[0];
    const now = seen.trend[seen.trend.length - 1];
    const change = Math.round(now - first);
    const line = element("p", "progress-sub", `${first.toFixed(1)} → ${now.toFixed(1)} over your last ${seen.trend.length} games`);
    if (change) line.append(element("span", `progress-chip ${change > 0 ? "up" : "down"}`, `${change > 0 ? "up" : "down"} ${Math.abs(change)}`));
    trend.append(line);
  } else {
    trend.append(element("p", "progress-sub", "The trend shows once a few more games are reviewed."));
  }
  box.append(trend);

  // By phase
  const phases = element("div", "progress-card");
  phases.append(element("h3", "", "By phase"));
  for (const phase of ["opening", "middlegame", "endgame"] as GamePhase[]) {
    const value = seen.phases[phase];
    const row = element("div", "progress-bar");
    row.append(element("span", "", cap(PHASE_WORDS[phase])));
    const track = element("span", "progress-track");
    const fill = element("span", `progress-fill ${ratingClass(accuracyRating(value ?? 0))}`);
    fill.style.width = `${Math.max(0, Math.min(100, value ?? 0))}%`;
    track.append(fill);
    row.append(track, element("span", "progress-value", value === undefined ? "-" : value.toFixed(1)));
    phases.append(row);
  }
  box.append(phases);

  // Your most common slips
  if (seen.slips.length) {
    const slips = element("div", "progress-card");
    slips.append(element("h3", "", "Your most common slips"));
    for (const slip of seen.slips.slice(0, 4)) {
      const row = element("div", "progress-row");
      row.append(element("span", "", SLIP_WORDS[slip.kind]), element("span", "", `${slip.games} game${slip.games === 1 ? "" : "s"}`));
      slips.append(row);
    }
    box.append(slips);
  }

  // Your openings
  const openings = element("div", "progress-card");
  openings.append(element("h3", "", "Your openings"));
  for (const opening of seen.openings.slice(0, 4)) {
    const row = element("div", "progress-row");
    const side = opening.colour === "white" ? "White" : "Black";
    row.append(element("span", "", `${opening.name} (${side})`),
      element("span", "", `${opening.games} game${opening.games === 1 ? "" : "s"} · ${opening.wins} win${opening.wins === 1 ? "" : "s"}` +
        (opening.accuracy === undefined ? "" : ` · ${opening.accuracy.toFixed(1)}`)));
    openings.append(row);
  }
  box.append(openings);

  // What to do next
  const next = element("div", "progress-card");
  next.append(element("h3", "", "Recommended for you"));
  const suggest = (title: string, detail: string, label: string, run: () => void) => {
    const row = element("div", "progress-row");
    row.append(element("span", "", title), element("span", "", detail));
    const button = element("button", "accent progress-go", label);
    button.type = "button";
    button.addEventListener("click", run);
    next.append(row, button);
  };
  const due = dueMistakes();
  if (due.length) suggest("Your mistakes", `${due.length} due today`, `Practise ${due.length}`, () => startPractice(due));
  const themes = top ? SLIP_THEMES[top.kind] : [];
  if (top && themes.length) {
    const phase: TrainPhase = seen.weakest === "endgame" ? "endgame" : "middlegame";
    const level = PUZZLE_LEVELS.find(([v]) => v === puzzleLevel)?.[1] ?? "";
    suggest(`Puzzles: ${lowerFirst(SLIP_WORDS[top.kind]).replace(/ \(a missed chance\)$/i, "")}`, `${level} level`, "Start puzzles",
      () => void startPuzzles(phase, puzzleLevel, themes));
  }
  if (seen.weakest) {
    const weakest = seen.weakest;
    suggest(`Lessons: the ${PHASE_WORDS[weakest]}`, weakest === "opening" ? "Your openings" : cap(PHASE_WORDS[weakest]), "Open lessons", () => {
      set.trainTab(weakest === "opening" ? "openings" : weakest);
      if (weakest !== "opening") set.trainPhase(weakest);
      showScreen("train");
      $("lesson-list").hidden = true;
      $("train-cards").hidden = false;
      drawTrainScreen();
      if (weakest !== "opening") showLessonList();
    });
  }
  box.append(next);
  box.append(element("p", "progress-sub progress-foot",
    `Built from the last ${seen.recent.length} of the ${seen.games} games you've reviewed as a player, kept on your phone.`));
}

// -- A deeper review: every move checked again, with a longer search ------------------

// Looking deeper at the game on the board: the ratings before, to say what changed

/** Look deeper: the game's analysis again at the deep depth (kept, so it's quick next time). */
export function lookDeeper() {
  set.deepening({ before: withBook(reviews()).map((r) => r?.rating ?? ""), done: false, changes: [] });
  useDepth("deep");
  restoreAnalysis();
  refresh();
}

/** Stop: back to the quick review. */
export function stopDeeper() {
  set.deepening(null);
  useDepth("quick");
  restoreAnalysis();
  refresh();
}

/** Once the deeper look has finished: what changed, kept for next time. */
export function checkDeeper(list: (Review | undefined)[]) {
  if (!deepening || deepening.done) return;
  const { done, total } = analyser.progress();
  if (done < total || deepNeeded.length || deepMoves.length || !list.every(Boolean)) return;
  const graded = withBook(list);
  deepening.done = true;
  deepening.changes = graded.flatMap((review, i) => {
    const was = deepening!.before[i];
    if (!review || !was || was === review.rating) return [];
    const position = game.positionAt(i);
    return [`${position.fullmoves}${position.turn === "white" ? "." : "..."}${game.moves[i].san} ${was} → ${review.rating}`];
  });
  keepAnalysis();
  saveGameMistakes(graded);
  saveGameSummary(graded);
}

let depthOpen = false; // the deep review's changes (or the quick review's note), shown under the line

/** The statistics: which review this is, as one slim line - Look deeper, its
 *  progress while it runs, then what changed. */
export function depthCard(pending: boolean): HTMLElement {
  const box = element("div", "depth-box");
  const line = element("div", "depth-line");
  const deep = analyser.depth === "deep";
  const toggle = (label: string) => {
    const button = element("button", "depth-go", label);
    button.type = "button";
    button.setAttribute("aria-expanded", String(depthOpen));
    button.addEventListener("click", () => {
      depthOpen = !depthOpen;
      refresh();
    });
    return button;
  };
  let note = "";
  if (deepening && !deepening.done) {
    const { done, total } = analyser.progress();
    line.append(element("span", "depth-which", "Looking deeper"));
    const track = element("div", "depth-track");
    const fill = element("div", "depth-fill");
    fill.style.width = `${Math.round(100 * Math.min(1, total ? done / total : 0))}%`;
    track.append(fill);
    const stop = element("button", "round soft depth-stop", "");
    stop.type = "button";
    stop.innerHTML = icon("close", 14);
    stop.title = "Stop and keep the quick review";
    stop.setAttribute("aria-label", "Stop and keep the quick review");
    stop.addEventListener("click", stopDeeper);
    line.append(track, element("span", "depth-count", `${Math.min(done, total)} / ${total}`), stop);
  } else if (deep) {
    const which = element("span", "depth-which", "Deep review ");
    if (!pending) which.append(element("span", "depth-done", "✓"));
    line.append(which);
    const changes = deepening?.done ? deepening.changes : null;
    // the changes that matter in full; Good / Excellent / Best swapping places just counted
    const SMALL = /^\S+ (Best|Excellent|Good|Book|Forced) → (Best|Excellent|Good|Book|Forced)$/;
    const big = (changes ?? []).filter((c) => !SMALL.test(c));
    const small = (changes ?? []).length - big.length;
    const smallWords = small ? `${small} small one${small === 1 ? "" : "s"} (Solid, Strong and Top move swapping places)` : "";
    if (changes?.length) {
      line.append(toggle(`${changes.length} rating${changes.length === 1 ? "" : "s"} changed ${depthOpen ? "▴" : "›"}`));
      note = big.length ? `What changed: ${withRatingNames(big.join(", "))}.${small ? ` Also ${smallWords}.` : ""}` : `${cap(smallWords)}. None of the slips changed.`;
    } else {
      line.append(element("span", "depth-count", changes ? "no ratings changed" : "every move checked longer"));
    }
  } else {
    const info = toggle("ⓘ");
    info.classList.add("depth-info");
    info.setAttribute("aria-label", "About the quick review");
    line.append(element("span", "depth-which", "Quick review"), info);
    const button = element("button", "depth-go", "Look deeper ›");
    button.type = "button";
    button.title = "1-3 minutes";
    button.addEventListener("click", lookDeeper);
    line.append(button);
    note = "Your phone's Stockfish, at a quick depth. A longer look (1-3 minutes) may rate a few moves a step differently.";
  }
  box.append(line);
  if (depthOpen && note) box.append(element("p", "stats-note depth-note", note));
  return box;
}

/** Back to Training, on the tab you came from. */
export function leavePractice() {
  resetBoard(new Game());
  refresh();
  showMenu();
  set.homeChoice("train");
  $("lesson-list").hidden = true;
  showScreen("train");
  drawTrainScreen();
}

/** A hint circles the piece to move. */
export function practiceShapes(): DrawShape[] {
  const p = practice;
  if (!p || p.state !== "solving" || !p.hints) return [];
  const move = parseUci(p.list[p.index].best) as NormalMove | undefined;
  return move ? [{ orig: makeSquare(move.from) as Key, brush: "you" }] : [];
}

/** Training: the Your mistakes row, for the tab's phase - only while some are
 *  waiting, and marked when some are due today. */
export function drawMistakesCard() {
  const phase: MistakePhase = trainTab === "openings" ? "opening" : trainTab;
  const counts = mistakeCounts(phase);
  const waiting = counts.learning + counts.nearly;
  const row = $<HTMLButtonElement>("train-mistakes");
  row.hidden = !waiting;
  row.classList.toggle("due", counts.due > 0);
  $("mistakes-title").textContent = counts.due ? `${counts.due} ${counts.due === 1 ? "mistake" : "mistakes"} due` : "Your mistakes";
  $("mistakes-note").textContent = counts.due ? "" : "None due today";
  $("mistakes-go").textContent = counts.due ? "Practise" : "Practise ahead";
}

/** The card's button: today's, or (when none are due) the next ones coming up. */
export function practiseMistakes() {
  const phase: MistakePhase = trainTab === "openings" ? "opening" : trainTab;
  const due = dueMistakes(phase);
  const ahead = loadMistakes().filter((m) => m.phase === phase && m.stage < MASTERED).sort((a, b) => a.due - b.due).slice(0, 10);
  startPractice(due.length ? due : ahead);
}

export function onDemoExit() {
  resetBoard(new Game());
  refresh();
  showMenu();
}
