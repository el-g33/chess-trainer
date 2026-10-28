// The coach: the review spoken by a cartoon face (a strip above the board on
// phones; a feed of earlier moves and a speech bubble on desktops)

import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { Chess } from "chessops/chess";
import { makeSan, parseSan } from "chessops/san";
import type { Color, NormalMove, Role as PieceRole } from "chessops/types";
import { makeSquare, makeUci, opposite } from "chessops/util";

import { accuracyRating, divide, estimateRating, gameAccuracy, phaseAccuracy, ratingFromAccuracy } from "../accuracy";
import { type Mood, avatarSvg, moodForRating } from "../avatar";
import {
  type BackupContents, backupDue, backupNote, dataCounts, makeBackup, noteBackup, readBackup, restoreBackup,
  snoozeReminder,
} from "../backup";
import { type Score, colourName, isCastling, afterMove as positionAfter } from "../coach";
import { DEMOS, demoSteps } from "../demos";
import type { LikelyMove } from "../explore";
import { Game } from "../game";
import { icon } from "../icons";
import { LESSONS } from "../lessons";
import { LEVELS, shortName } from "../levels";
import {
  HINT_TEXT, type Mode, analyser, base, brilliantShown, coachAnalysis, coachLine, currentPly, gameMoves, insights,
  previewPlan, quizLinePositions, quizScore, quizWaiting, ratingsOn,
} from "../main";
import { controlledSquares, dangerAfter, moveInWords, narrateMove, targetsOf, verdict, whyMove } from "../narrate";
import {
  type OpeningInfo, REPERTOIRE, firstMoveOf, goalWords, isStartPosition, mainFamily, systemFor,
} from "../openings";
import { SOURCE_NAMES, type Source } from "../online";
import { readPgn, writePgn } from "../pgn";
import { ratingName } from "../ratingNames";
import { type Review, fenOf, isDrawnPosition, isSacrifice, verdictWords, winningChance } from "../review";
import { planAhead } from "../strategy";
import { type Style, styleAlternative } from "../style";
import { Typer, fitsIn, readingTime, splitToFit } from "../talk";

import {
  $, coachText, exitAnalysisButton, gameInfo, lineBack, lineExit, lineForward, newButton, planModeBox,
  quizScoreLabel, resignButton, reviewButton, toolButtons, turnLabel, undoButton,
} from "./dom";
import { arrowEnd, refresh } from "./draw";
import {
  gameKey, jumpToGrade, onReviewGame, startReview, stopPreparing, watching, withBook, restoreAnalysis,
} from "./matches";
import { analysisLineText, goTo } from "./moves";
import {
  cap, depthCard, drillSays, lowerFirst, openingShortName, practiceSays, scheduleDemo, showWhatYouGet, startDemoLine,
  practiseGameSlips,
} from "./openingDemos";
import { importGames, importing, importNote, reviewImported } from "./onlineGames";
import { openPgnDialog, openSave } from "./pgnScreens";
import { MOVE_MARKS, barName, gameScores, ratingClass } from "./playerBars";
import { message } from "./popups";
import { analysisReview, moveReviews, openingInfo, reviewPly } from "./ratings";
import { moveSound, showMenu } from "./startMenu";
import { type HomeChoice, resetBoard, showScreen } from "./startScreens";
import {
  orientation, analysis, book, busy, canReview, clock, clockTimes, currentGameId, currentView, deepening, demo, drill, editor,
  errorText, explore, game, gameHeaders, gameOrigin, historyColour, lesson, match, mode, practice, preparing,
  preview, puzzle, quiz, result, reviewSide, reviewTitle, reviewing, savedFromReview, set, silentJump, speech,
  statsMore, statusMessage, stepper, stripButtons, thinking, viewPly,
} from "./state";
import { drawStatus, setBusy, startTask } from "./strategyCoach";
import { drawTrainScreen, exploreSays, puzzleSays, showLessonList } from "./train";

declare const __BUILD__: string; // see vite.config.ts
// The coach's bubble above the board is always the same size: one short,
// natural line (the board and its rating icon show which move), with icon
// buttons for more. "Tell me more" opens the overlay; lines of moves are
// talked through one move at a time by the stepper.

export interface CoachButton {
  ico: string;
  label: string;
  run: () => void;
  kind?: "accent" | "soft" | "hazard" | `hazard ${string}`;
  labelled?: boolean; // shows its label as well as the icon
}

export interface CoachSay {
  mood: Mood;
  text: string;
  buttons: CoachButton[];
  key?: string; // a new key means "say it (again)"; by default the move and the words
}

export const faces = new Map<HTMLElement, string>(); // what each face shows, so it's only redrawn on a change

export function setFace(element: HTMLElement, mood: Mood, size: number) {
  const key = `${mood}/${size}`;
  if (faces.get(element) === key) return;
  faces.set(element, key);
  element.innerHTML = avatarSvg(mood, size);
}

/** Who the coach is talking to: you in a match, otherwise nobody in particular. */
export function listener(): Color | null {
  if (explore) return explore.user;
  if (reviewing && reviewTitle) return reviewSide;
  if (match) return match.user;
  if (reviewing && !reviewTitle) return orientation; // your own finished game
  return null;
}

export const TELL_MORE: CoachButton = { ico: "dots", label: "Tell me more", run: () => openMore() };
export const STRATEGY: CoachButton = { ico: "target", label: "Strategy", run: () => void openStrategy(), kind: "accent" };

/** What the coach says about the position on screen. */
export function coachSays(reviews: (Review | undefined)[]): CoachSay {
  if (silentJump) return { mood: "talk", text: "", buttons: [], key: "silent" };
  if (busy) return { mood: "think", text: statusMessage || "Hmm, let me think...", buttons: [] };
  if (editor) return { mood: "talk", text: editor.pick
    ? "Tap squares to place it, or tap it again to put it away. Done when you're ready."
    : "Drag pieces to move them (off the board to remove), or pick a piece below to add. Done when you're ready.", buttons: [] };
  if (drill) return drillSays();
  if (practice) return practiceSays();
  if (puzzle) return puzzleSays();
  if (lesson) return { mood: "talk", text: LESSONS[lesson.phase][lesson.index].title, buttons: [] };
  if (demo?.intro) {
    const lines = demo.demo.lines;
    const count = lines.length === 1 ? "one line" : `${lines.length} lines`;
    const start = `The ${openingShortName(demo.demo.opening)} has ${count}. We'll go through all of them, starting with the main line.`;
    const text = demo.line === 0
      ? `${start} ${demo.demo.intro} Here's how it starts. Ready when you are: press play.`
      : `${lines[demo.line].about ?? demo.demo.intro} When you're ready, let's go: press play.`;
    const play: CoachButton = { ico: "play", label: "Play the line", run: startDemoLine, kind: "accent" };
    return { mood: "talk", text, buttons: [play], key: `demo:${demo.line}:intro` };
  }
  if (demo) {
    const ply = currentPly();
    const step = ply ? demo.steps[ply - 1] : undefined;
    const lines = demo.demo.lines;
    let text: string;
    if (!ply && !demo.playing) {
      const count = lines.length === 1 ? "one line" : `${lines.length} lines`;
      const start = `The ${openingShortName(demo.demo.opening)} has ${count}. We'll go through all of them, starting with the main line.`;
      text = demo.line === 0 ? `${start} ${demo.demo.intro}` : lines[demo.line].about ?? demo.demo.intro;
    } else if (!ply) {
      text = "Here we go.";
    } else {
      text = step!.note ?? narrateMove(game.positionAt(ply - 1), step!.move, null);
    }
    const atEnd = ply >= game.length;
    const buttons: CoachButton[] = atEnd ? [{ ico: "bulb", label: "What you get", run: () => void showWhatYouGet(), kind: "accent" }] : [];
    return { mood: step?.note || !ply ? "talk" : "happy", text, buttons, key: `demo:${demo.line}:${ply}` };
  }
  if (mode === "play") {
    if (match) {
      const yours = game.position.turn === match.user;
      return thinking || !yours
        ? { mood: "think", text: "Let me think...", buttons: [] }
        : { mood: "talk", text: game.length ? "Your move." : "Your move. Good luck!", buttons: [] };
    }
    if (canReview) return { mood: "happy", text: "Good game! Shall we go through it together?", buttons: [{ ico: "search", label: "Review the game", run: onReviewGame, kind: "accent" }] };
    return { mood: "talk", text: game.length ? "That's the end of the game." : "Press New game to start.", buttons: [] };
  }
  if (quizWaiting()) {
    return { mood: "think", text: "What are they threatening? Play their move on the board.", buttons: [{ ico: "close", label: "Stop the quiz", run: () => { set.quiz(null); refresh(); }, kind: "soft" }] };
  }
  if (quiz?.answered && quiz.result) {
    const [correct, text] = quiz.result;
    const short = correct ? "Yes, that's their idea. Well spotted!" : "Not quite. Tap the dots and I'll show you.";
    void text;
    return { mood: correct ? "happy" : "worried", text: short, buttons: [TELL_MORE, { ico: "close", label: "Done", run: () => { set.quiz(null); refresh(); }, kind: "soft" }] };
  }
  if (analysis) {
    const review = ratingsOn() ? analysisReview() : undefined;
    if (!analysis.line.length) return { mood: "talk", text: "Try any move to see what would have happened.", buttons: [] };
    if (!review) return { mood: "think", text: "Let me check that move...", buttons: [] };
    const line = analysis.line;
    const before = line.positionAt(line.length - 1);
    const after = line.positionAt(line.length);
    return { mood: moodForRating(review.rating), text: verdict(review, before, after, analyser.evals.get(fenOf(after)), before.turn, line.length), buttons: [] };
  }
  if (explore) return exploreSays(reviews);
  const ply = reviewPly();
  if (!ratingsOn()) return { mood: "talk", text: "Move ratings are off.", buttons: [STRATEGY] };
  if (ply === 0) return { mood: "talk", text: game.length ? "The starting position." : "Make a move and I'll tell you what I think.", buttons: [STRATEGY] };
  const review = reviews[ply - 1];
  if (!review) return { mood: "think", text: "Hmm, let me check that move...", buttons: [STRATEGY] };
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  let text = verdict(review, before, after, analyser.evals.get(fenOf(after)), listener(), ply, watching());
  // a good move that wasn't the best: the bulb (why it's good, then the best move) instead of Tell me more
  const more: CoachButton = notTheBest(ply, review) ? { ico: "bulb", label: "See the best move", run: () => void showBestLine(ply) } : TELL_MORE;
  const buttons = [more, STRATEGY];
  // Your slips saved as puzzles: said at each one, and offered at the end of the game
  const saved = reviewing && savedFromReview?.key === gameKey() ? savedFromReview : null;
  if (saved?.plies.includes(ply)) text += " I've saved this one to Your mistakes.";
  if (saved?.plies.length && ply === game.length) {
    const count = saved.plies.length;
    text += ` That's the game. Want to try ${count === 1 ? "your slip" : `your ${count} slips`} now, while ${count === 1 ? "it's" : "they're"} fresh?`;
    // (the puzzle button in place of Strategy: the strip keeps its size, so the words keep their room)
    buttons.splice(0, buttons.length, { ico: "puzzle", label: "Try them now", run: practiseGameSlips, kind: "accent" }, more);
  }
  return { mood: moodForRating(review.rating), text, buttons };
}

/** An icon button that also shows its words, when the button asks for it. */
export function labelledButton(button: CoachButton): HTMLButtonElement {
  const element = iconButton(button);
  if (button.labelled) {
    const words = document.createElement("span");
    words.textContent = button.label;
    element.append(words);
    element.classList.add("labelled");
  }
  return element;
}

export function iconButton(button: CoachButton, size = 18): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `round ${button.kind ?? ""}`;
  element.title = button.label;
  element.setAttribute("aria-label", button.label);
  element.innerHTML = icon(button.ico, size);
  element.addEventListener("click", button.run);
  return element;
}

export function drawCoachFace(reviews: (Review | undefined)[]) {
  set.lastReviews(reviews);
  const say = coachSays(reviews);
  setFace($("strip-face"), say.mood, 46);
  set.stripButtons(say.buttons);
  drawStripActions(true); // first, so the words are measured against the room the buttons leave
  speak(say.text, say.key ?? `${currentPly()}:${say.text}`);
  drawStripActions();
  drawStepper();
}

// -- The coach's bubble: words typed out, a piece at a time ----------------------

export interface Speech {
  key: string;
  pieces: string[];
  index: number;
  hold: number; // the timer before the next piece
  done: boolean; // every piece said (and read)
}

export const stripTyper = new Typer($("strip-text"), () => pieceTyped());

/** Say something in the bubble. Long words are cut into pieces that fit; each
 *  is typed out, stays up long enough to read, then the next one follows. */
export function speak(text: string, key: string) {
  if (key === speech.key) return;
  clearTimeout(speech.hold);
  const box = $("strip-text");
  set.speech({ key, pieces: splitToFit(text, (piece) => fitsIn(box, piece)), index: 0, hold: 0, done: false });
  stripTyper.type(speech.pieces[0], true);
}

export function pieceTyped() {
  const current = speech;
  clearTimeout(current.hold);
  current.hold = window.setTimeout(() => {
    if (speech !== current) return;
    if (current.index + 1 < current.pieces.length) showPiece(current.index + 1);
    else if (!current.done) {
      current.done = true;
      onSpoken();
    }
  }, readingTime(current.pieces[current.index] ?? ""));
}

export function showPiece(index: number) {
  speech.index = Math.max(0, Math.min(index, speech.pieces.length - 1));
  stripTyper.type(speech.pieces[speech.index], true);
  drawStripActions();
}

/** The bubble's buttons: ‹ › through the pieces (when there's more than one), then the coach's own. */
export function drawStripActions(roomForNav = false) {
  const nav: HTMLButtonElement[] = [];
  if (speech.pieces.length > 1 || roomForNav) {
    const back = iconButton({ ico: "back", label: "Back a sentence", run: () => showPiece(speech.index - 1), kind: "soft" }, 16);
    const next = iconButton({ ico: "next", label: "Next sentence", run: () => showPiece(speech.index + 1), kind: "soft" }, 16);
    back.disabled = speech.index === 0;
    next.disabled = speech.index + 1 >= speech.pieces.length;
    back.classList.add("piece-nav");
    next.classList.add("piece-nav");
    nav.push(back, next);
  }
  $("strip-actions").replaceChildren(...nav, ...stripButtons.map((b) => labelledButton(b)));
}

/** Everything in the bubble has been said: a demo or a replay moves on. */
export function onSpoken() {
  if (demo?.playing && !stepper && !busy) {
    if (currentPly() >= game.length) {
      demo.playing = false;
      refresh();
      void showWhatYouGet();
    } else {
      scheduleDemo(500);
    }
  }
}

// -- Tell me more: the board dims and the coach explains in full ----------------

export const overlay = () => $("coach-overlay");
export const overlayOpen = () => !overlay().hidden;

export function showOverlay(mood: Mood, content: (Node | string)[], buttons: CoachButton[]) {
  setFace($("overlay-face"), mood, 64);
  $("overlay-text").replaceChildren(...content);
  $("overlay-actions").replaceChildren(...buttons.map((b) => {
    const element = iconButton(b, 20);
    const label = document.createElement("span");
    label.textContent = b.label;
    element.append(label);
    element.classList.add("labelled");
    return element;
  }));
  overlay().hidden = false;
  refresh();
}

export function closeOverlay(redraw = true) {
  if (overlay().hidden) return;
  overlay().hidden = true;
  if (redraw) refresh();
}

export const para = (text: string, className = "") => {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
};

export const CLOSE: CoachButton = { ico: "close", label: "Back", run: () => closeOverlay(), kind: "soft" };

/** The quiz result in plain words: was it their idea, and if not, what their
 *  idea really is (the board's "Show me" plays it out). */
export function quizInWords(): string[] {
  const asked = quiz!;
  const threat = asked.threat!;
  const idea = threat.threatMove && threat.passed ? narrateMove(threat.passed, threat.threatMove, threat.you) : "";
  if (asked.result![0]) return [`Yes, that's their idea! ${idea}`.trim()];
  const kind = asked.explanation?.kind;
  const first = kind === "mistake" ? "That move wouldn't be a threat: it would be a mistake for them, and you could punish it."
    : kind === "smaller-threat" ? "That's a threat too, but a smaller one."
    : "That move doesn't threaten anything serious.";
  return idea ? [first, `Their real idea: ${lowerFirst(idea)}`] : [first];
}

/** Tell me more: the full review of the move (or the demo note, or the quiz result). */
export function openMore() {
  if (demo) {
    const ply = currentPly();
    const note = ply ? demo.steps[ply - 1].note : demo.demo.intro;
    showOverlay("talk", [para(note ?? "Watch how the line goes.")], [CLOSE]);
    return;
  }
  if (quiz?.answered && quiz.result) {
    const parts = quizInWords().map((text) => para(text));
    const buttons: CoachButton[] = [];
    const explanation = quiz.explanation;
    if (explanation?.line.length) {
      buttons.push({ ico: "hazard", label: "Show me", kind: "hazard", run: () => {
        closeOverlay(false);
        const positions = [explanation.start];
        for (const move of explanation.line) positions.push(positionAfter(positions[positions.length - 1], move));
        startStepper(positions, explanation.line, explanation.line.map((m, i) => narrateMove(positions[i], m, listener())), "worried");
      } });
    }
    buttons.push(CLOSE);
    showOverlay(quiz.result[0] ? "happy" : "talk", parts, buttons);
    return;
  }
  const ply = reviewPly();
  const review = ratingsOn() && ply > 0 ? reviews()[ply - 1] : undefined;
  if (!review) return;
  explainMove(ply, review);
}

// Ratings where the coach shows the better move
export const WORTH_SHOWING = new Set(["Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"]);

/** Tell me more about a move. A slip (inaccuracy, mistake, miss, blunder)
 *  gets a story in three parts: why it isn't the best, what it allows (played
 *  out), and the better move with how it goes on. A good move that isn't the
 *  best says why it's good, with a button to see the best move and its line. */
export function explainMove(ply: number, review: Review) {
  if (review.rating === "Brilliant") return void explainBrilliant(ply);
  if (review.rating === "Great") return void explainGreat(ply);
  if (WORTH_SHOWING.has(review.rating) && review.bestSan) return void explainSlip(ply, review);
  if (notTheBest(ply, review)) return void showBestLine(ply);
  const before = game.positionAt(ply - 1);
  const played = game.moves[ply - 1].move;
  const you = listener();
  const mine = !you || game.moverOf(ply) === you;
  const why = whyMove(before, played, mine ? game.moverOf(ply) : you);
  const text = `${review.rating === "Book" ? "A known opening move" : mine ? "Why it's good" : "Their idea"}: ${why}.`;
  startStepper([before, positionAfter(before, played)], [played], [text], moodForRating(review.rating), undefined, true);
}

/** A good move that wasn't Stockfish's top choice. */
export function notTheBest(ply: number, review: Review | undefined): boolean {
  if (!review?.bestSan || !["Excellent", "Good"].includes(review.rating)) return false;
  return makeSan(game.positionAt(ply - 1), game.moves[ply - 1].move) !== review.bestSan;
}

/** The arrow for a move (yours or theirs, from the viewer's side) and the
 *  pieces it then attacks. */
export function moveShapes(before: Chess, move: NormalMove, viewer: Color | null): DrawShape[] {
  const mover = before.board.get(move.from)?.color;
  const shapes: DrawShape[] = [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: mover === (viewer ?? orientation) ? "you" : "them" }];
  if (!isCastling(before, move)) {
    const after = positionAfter(before, move);
    for (const square of targetsOf(after, move.to)) shapes.push({ orig: makeSquare(square) as Key, brush: "threat" });
  }
  return shapes;
}

/** A line as pages: the board after each move, with its arrow and a sentence. */
export function linePages(start: Chess, line: NormalMove[], viewer: Color | null): { frames: StepFrame[]; texts: string[] } {
  const story = talkLine(start, line, viewer);
  const frames = line.map((move, i) => ({ position: story.positions[i + 1], shapes: moveShapes(story.positions[i], move, viewer) }));
  return { frames, texts: story.texts };
}

/** More pages for a card that is still open (a line Stockfish has just found). */
export function extendPages(card: Stepper | null, frames: StepFrame[], texts: string[], chapter: number) {
  if (!card || stepper !== card || !frames.length) return;
  card.frames!.push(...frames);
  card.texts.push(...texts);
  card.chapterOf!.push(...frames.map(() => chapter));
  refresh();
}

/** A card of pages in parts ("Why", "What it allows", ...), opening on its first page. */
export function startStory(first: StepFrame, text: string, mood: Mood, chapters: string[]): Stepper {
  closeOverlay(false);
  const card: Stepper = { positions: [], moves: [], texts: [text], step: 1, mood, frames: [first], chapters, chapterOf: [0] };
  set.stepper(card);
  refresh();
  return card;
}

/** A slip, in three parts: why it isn't the best, what it allows, better was. */
export async function explainSlip(ply: number, review: Review) {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const mine = viewer === null || mover === viewer;
  const beforeEval = analyser.evals.get(fenOf(before));
  const afterEval = analyser.evals.get(fenOf(after));
  const info = openingInfo();
  const danger = dangerAfter(review, before, after, beforeEval, afterEval, !!info[ply - 1]?.book, viewer);
  const reply = after.isEnd() ? undefined : afterEval?.best;
  // Why: what it costs in a few words; the arrow shows their idea, and Next plays it out
  // (the chips above the text name each part, so the text needn't)
  const why = danger ? danger.text : "It's a small slip.";
  const shapes = moveShapes(before, played, viewer).slice(0, 1);
  if (reply) {
    shapes.push({ orig: makeSquare(reply.from) as Key, dest: arrowEnd(after, reply), brush: mine ? "them" : "you" });
    if (after.board.get(reply.to)) shapes.push({ orig: makeSquare(reply.to) as Key, brush: "threat" });
  }
  const theirSlip = !mine && viewer !== null;
  const card = startStory({ position: after, shapes }, why, moodForRating(review.rating),
    theirSlip ? ["Why", "What you can do", "Better for them"] : ["Why", "What it allows", "Better was"]);
  moveSound(makeSan(before, played), before.turn);
  try {
    // What it allows: Stockfish's best line after the move
    if (reply) {
      const punish = await coachLine(after, 1.5);
      const line = wholeLine(after, punish?.pv ?? [], 3);
      if (punish && line.length) {
        const pages = linePages(after, line, viewer);
        pages.texts[pages.texts.length - 1] += ` In the end, ${lineOutcome(after, line, punish.score, opposite(mover), viewer)}`;
        extendPages(card, pages.frames, pages.texts, 1);
      }
    }
    // Better was: the best move, and how it goes on
    const best = parseSan(before, review.bestSan!) as NormalMove | undefined;
    if (!best) return;
    const better = await coachLine(before, 1.5, [best]);
    const line = wholeLine(before, better?.pv.length ? better.pv : [best], 3);
    const pages = linePages(before, line, viewer);
    pages.texts[0] = cap(moveInWords(before, best, viewer));
    if (better && line.length > 1) pages.texts[pages.texts.length - 1] += ` In the end, ${lineOutcome(before, line, better.score, mover, viewer)}`;
    extendPages(card, pages.frames, pages.texts, 2);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  }
}

/** See the best move: for a good move that wasn't the top one, a card that
 *  says why the move is good, then (one tap on) the best move and how the
 *  game would go on. */
export async function showBestLine(ply: number) {
  const review = ratingsOn() ? reviews()[ply - 1] : undefined;
  if (!review?.bestSan) return;
  const before = game.positionAt(ply - 1);
  const best = parseSan(before, review.bestSan) as NormalMove | undefined;
  if (!best) return;
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const mine = viewer === null || mover === viewer;
  const why = `${cap(whyMove(before, played, viewer))}.`;
  const card = startStory({ position: positionAfter(before, played), shapes: moveShapes(before, played, viewer) }, why,
    moodForRating(review.rating), [mine ? "Why it's good" : "Their idea", "Best move"]);
  try {
    const line = await coachLine(before, 1.5, [best]);
    const moves = wholeLine(before, line?.pv.length ? line.pv : [best], 3);
    const pages = linePages(before, moves, viewer);
    pages.texts[0] = cap(moveInWords(before, best, viewer));
    if (line && moves.length > 1) pages.texts[pages.texts.length - 1] += ` In the end, ${lineOutcome(before, moves, line.score, mover, viewer)}`;
    extendPages(card, pages.frames, pages.texts, 1);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  }
}

export const MATERIAL: Record<string, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
export const NAME: Record<string, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };

/** Material of one side minus the other's. */
export function materialFor(position: Chess, side: Color): number {
  let total = 0;
  for (const square of position.board.occupied) {
    const piece = position.board.get(square)!;
    total += (piece.color === side ? 1 : -1) * MATERIAL[piece.role];
  }
  return total;
}

/** How a line ends for `side`, in words: checkmate, the biggest piece won, or
 *  the verdict ("you" when `side` is the viewer's, "they" when it isn't). */
export function lineOutcome(start: Chess, line: NormalMove[], score: Score, side: Color, viewer: Color | null): string {
  const you = side === viewer;
  const positions = [start];
  for (const move of line) positions.push(positionAfter(positions[positions.length - 1], move));
  const end = positions[positions.length - 1];
  if (end.isCheckmate()) return "it's checkmate!";
  const gain = materialFor(end, side) - materialFor(start, side);
  if (gain >= 3) {
    // the most valuable piece of theirs that went missing
    const them = opposite(side);
    const lost = (["queen", "rook", "bishop", "knight"] as PieceRole[]).find((role) => end.board.pieces(them, role).size() < start.board.pieces(them, role).size());
    const named = viewer === null; // watching: "White wins Black's queen"
    const who = named ? colourName(side) : you ? "you" : "they";
    const win = named ? "wins" : "win";
    const come = named ? "comes" : "come";
    if (lost === "queen") return `${who} ${win} ${whoseOf(them, viewer)} queen.`;
    return gain >= 5 ? `${who} ${come} out well ahead in material.` : `${who} ${come} out a ${lost ? NAME[lost] : "piece"} up.`;
  }
  return `${verdictWords(score)}.`;
}

/** The first `count` moves of a line, carried on while pieces are still
 *  being taken, so it never stops in the middle of an exchange. */
export function wholeLine(start: Chess, pv: NormalMove[], count: number): NormalMove[] {
  let walk = start;
  const line: NormalMove[] = [];
  for (const move of pv) {
    const capture = walk.board.get(move.to) !== undefined;
    if (line.length >= count && !capture) break;
    if (line.length >= count + 3) break;
    line.push(move);
    walk = positionAfter(walk, move);
  }
  return line;
}

/** "your" / "their" from the viewer's side, or "White's" / "Black's" when watching. */
export function whoseOf(side: Color, viewer: Color | null): string {
  if (viewer === null) return side === "white" ? "White's" : "Black's";
  return side === viewer ? "your" : "their";
}

/** The moves of a line from a position, with a sentence for each. */
export function talkLine(start: Chess, line: NormalMove[], viewer: Color | null): { positions: Chess[]; texts: string[] } {
  const positions = [start];
  const texts: string[] = [];
  for (const move of line) {
    texts.push(narrateMove(positions[positions.length - 1], move, viewer));
    positions.push(positionAfter(positions[positions.length - 1], move));
  }
  return { positions, texts };
}

/** Add more moves (and what's said about them) to the open step-through card,
 *  if it's still the one they belong to. */
export function extendStepper(card: Stepper | null, positions: Chess[], moves: NormalMove[], texts: string[]) {
  if (!card || stepper !== card || !moves.length) return;
  card.positions.push(...positions);
  card.moves.push(...moves);
  card.texts.push(...texts);
  refresh();
}

/** Tell me more about a brilliant move: the piece it offers, and what
 *  happens if they take it - the trap it sets, played out on the board.
 *  The card opens at once with the move; Stockfish's line follows. */
export async function explainBrilliant(ply: number) {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const offered = isSacrifice(before, played, after);
  const piece = offered !== undefined ? after.board.get(offered) : undefined;
  const takes: NormalMove[] = [];
  if (offered !== undefined) {
    for (const [from, dests] of after.allDests()) if (dests.has(offered)) takes.push({ from, to: offered });
  }
  const whose = whoseOf(mover, viewer);
  const intro = `A masterstroke! ${narrateMove(before, played, viewer)}`;
  const trapped = piece !== undefined && takes.length > 0;
  let first = `${intro} A bold move that Stockfish confirms.`;
  if (trapped) {
    // who can take it: the cheapest piece that can
    const taker = takes.map((m) => after.board.get(m.from)!.role).sort((a, b) => MATERIAL[a] - MATERIAL[b])[0];
    const theirs = whoseOf(opposite(mover), viewer);
    first = offered === played.to
      ? `A masterstroke! ${cap(whose)} ${NAME[piece!.role]} goes where ${theirs} ${NAME[taker]} can take it, but taking it is a trap.`
      : `${intro} It leaves ${whose} ${NAME[piece!.role]} to be taken, but taking it is a trap.`;
  }
  startStepper([before, after], [played], [first], "happy");
  const card = stepper;
  try {
    const taken = trapped ? await coachLine(after, 1.5, takes) : undefined;
    if (taken?.pv.length) {
      const line = wholeLine(after, taken.pv, 5);
      const story = talkLine(after, line, viewer);
      const best = await coachLine(after, 1);
      const trap = best?.pv[0] && makeUci(best.pv[0]) !== makeUci(line[0]);
      const texts = story.texts.map((text, i) => i === 0 ? `If ${viewer === null ? colourName(opposite(mover)) : "they"} take${viewer === null ? "s" : ""} it: ${lowerFirst(text)}` : text);
      texts[texts.length - 1] += ` In the end, ${lineOutcome(after, line, taken.score, mover, viewer)}`;
      if (trap) texts[texts.length - 1] += viewer === null ? ` So ${colourName(opposite(mover))} shouldn't take it.` : " So they shouldn't take it.";
      extendStepper(card, story.positions.slice(1), line, texts);
      return;
    }
    // no piece to take: show what the move sets up
    const best = await coachLine(after, 1.5);
    if (!best?.pv.length) return;
    const line = wholeLine(after, best.pv, 4);
    const story = talkLine(after, line, viewer);
    const texts = [...story.texts];
    texts[texts.length - 1] += ` In the end, ${lineOutcome(after, line, best.score, mover, viewer)}`;
    extendStepper(card, story.positions.slice(1), line, texts);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  }
}

/** Tell me more about a great move: it was the only good one, and the board
 *  plays out the opportunity it creates. The card opens at once. */
export async function explainGreat(ply: number) {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const why = whyMove(before, played, viewer);
  // why it had to be this move: the piece was under attack, or what it does
  const piece = before.board.get(played.from)!;
  const attacked = before.kingAttackers(played.from, opposite(mover), before.board.occupied).nonEmpty();
  const reason = attacked && piece.role !== "king" ? `It gets ${whoseOf(mover, viewer)} ${NAME[piece.role]} out of danger.` : why && why !== "it's a useful waiting move" ? `${cap(why)}.` : "";
  const intro = `The key move! ${narrateMove(before, played, viewer)} ${reason} It was the only good move here: everything else was clearly worse.`.replace(/  +/g, " ");
  startStepper([before, after], [played], [intro], "happy");
  const card = stepper;
  try {
    const best = await coachLine(after, 1.5);
    const line = wholeLine(after, best?.pv ?? [], 3);
    if (!best || !line.length) return;
    const story = talkLine(after, line, viewer);
    const texts = [...story.texts];
    // still worse after the only move: it keeps you in the game
    const behind = winningChance(best.score, mover) < 45;
    texts[texts.length - 1] += behind
      ? ` ${cap(verdictWords(best.score))}, but this move keeps ${viewer === null ? colourName(mover) : mover === viewer ? "you" : "them"} in the game.`
      : ` In the end, ${lineOutcome(after, line, best.score, mover, viewer)}`;
    extendStepper(card, story.positions.slice(1), line, texts);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  }
}

/** The reviews of the game's moves (the same ones the move list shows). */
export function reviews(): (Review | undefined)[] {
  return moveReviews();
}

// -- The stepper: a line of moves, talked through one move at a time -----------

export interface Stepper {
  positions: Chess[]; // before the first move, then after each
  moves: NormalMove[];
  texts: string[];
  step: number; // 1 = after the first move
  mood: Mood;
  extra?: CoachButton | CoachButton[];
  illustration?: boolean; // one move, with what the piece controls
  frames?: StepFrame[]; // lesson pages (or illustrations) instead of moves
  chapters?: string[]; // the parts of the story ("Why", "What it allows", "Better was")
  chapterOf?: number[]; // each page's part
}

export interface StepFrame {
  position: Chess;
  shapes: DrawShape[];
  odds?: LikelyMove[]; // their likely moves, with chances
  others?: number; // the chance of anything else
}


export function startStepper(positions: Chess[], moves: NormalMove[], texts: string[], mood: Mood, extra?: CoachButton, illustration = false) {
  if (!moves.length) return;
  closeOverlay(false);
  set.stepper({ positions, moves, texts, step: 1, mood, extra, illustration });
  moveSound(makeSan(positions[0], moves[0]), positions[0].turn);
  refresh();
}

export const stepCount = () => (stepper?.frames ? stepper.frames.length : stepper?.moves.length ?? 0);

export function stepTo(step: number) {
  if (!stepper) return;
  const next = Math.max(1, Math.min(step, stepCount()));
  if (next > stepper.step && !stepper.frames) moveSound(makeSan(stepper.positions[next - 1], stepper.moves[next - 1]), stepper.positions[next - 1].turn);
  stepper.step = next;
  refresh();
}

export function closeStepper() {
  set.stepper(null);
  set.silentJump(false);
  if (lesson) {
    // leaving a lesson goes back to the list
    set.lesson(null);
    showMenu();
    set.homeChoice("train");
    showScreen("train");
    showLessonList();
    return;
  }
  refresh();
}

export const stepTyper = new Typer($("step-text"));

export function drawStepper() {
  const box = $("stepper");
  const area = document.querySelector<HTMLElement>(".board-area")!;
  area.classList.toggle("stepping", stepper !== null);
  box.hidden = !stepper;
  if (!stepper) return;
  $("step-count").textContent = stepCount() > 1 ? `${stepper.step}/${stepCount()}` : "";
  // the parts of the story, the current one lit (a tap jumps to it)
  const chapters = $("step-chapters");
  const card = stepper;
  chapters.hidden = !card.chapters;
  chapters.replaceChildren(...(card.chapters ?? []).map((label, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    const first = card.chapterOf?.indexOf(i) ?? -1;
    chip.classList.toggle("on", card.chapterOf?.[card.step - 1] === i);
    chip.disabled = first < 0; // (still being worked out)
    chip.addEventListener("click", () => stepTo(first + 1));
    return chip;
  }));
  for (const id of ["step-back", "step-next"]) $(id).hidden = stepCount() < 2;
  stepTyper.type(stepper.texts[stepper.step - 1] ?? "");
  const frame = stepper.frames?.[stepper.step - 1];
  const odds = $("step-odds");
  odds.hidden = !frame?.odds?.length;
  odds.replaceChildren(...(frame?.odds ?? []).map((o) => {
    const row = document.createElement("div");
    row.className = "odds-row";
    row.innerHTML = `<b></b><span class="odds-bar"><i style="width:${o.chance}%"></i></span><span>${o.chance}%</span>`;
    row.querySelector("b")!.textContent = `${frame!.position.turn === "black" ? "..." : ""}${o.san}`;
    return row;
  }));
  if (frame?.odds?.length && frame.others) {
    const row = document.createElement("div");
    row.className = "odds-row others";
    row.innerHTML = `<b>Others</b><span class="odds-bar"><i style="width:${frame.others}%"></i></span><span>${frame.others}%</span>`;
    odds.append(row);
  }
  setFace($("step-face"), stepper.mood, 34);
  $<HTMLButtonElement>("step-back").disabled = stepper.step <= 1;
  $<HTMLButtonElement>("step-next").disabled = stepper.step >= stepCount();
  // the extra button (e.g. "Try it") only on the last page of a lesson
  const extra = stepper.extra && (!stepper.frames || stepper.step >= stepCount()) ? [stepper.extra].flat().map(labelledButton) : [];
  $("step-extra").replaceChildren(...extra);
}

/** On the board while stepping: the move just played, and what it hits. */
export function stepperShapes(): DrawShape[] {
  if (stepper?.frames) return stepper.frames[stepper.step - 1].shapes;
  if (!stepper || stepper.step < 1) return [];
  const before = stepper.positions[stepper.step - 1];
  const after = stepper.positions[stepper.step];
  const move = stepper.moves[stepper.step - 1];
  const mover = before.board.get(move.from)?.color;
  const yours = mover === (listener() ?? orientation);
  const shapes: DrawShape[] = [{ orig: makeSquare(move.from) as Key, dest: arrowEnd(before, move), brush: yours ? "you" : "them" }];
  const landing = isCastling(before, move) ? undefined : move.to;
  if (landing !== undefined && stepper.illustration) {
    // What the piece controls from its new square
    for (const square of controlledSquares(after, landing)) {
      shapes.push({ orig: makeSquare(landing) as Key, dest: makeSquare(square) as Key, brush: "control" });
    }
  } else if (landing !== undefined) {
    for (const square of targetsOf(after, landing)) shapes.push({ orig: makeSquare(square) as Key, brush: "threat" });
  }
  return shapes;
}

// -- Strategy: straight to the main idea --------------------------------------

/** If the position is in one of the opening demos, the next few moves of
 *  that line (with the demo's notes where it has them). */
export function demoLineFrom(position: Chess): { moves: NormalMove[]; texts: string[]; name: string } | undefined {
  const key = fenOf(position).split(" ").slice(0, 4).join(" ");
  const preferred = match?.myOpening?.name;
  const order = [...DEMOS].sort((a, b) => Number(b.opening === preferred) - Number(a.opening === preferred));
  for (const d of order) {
    for (let i = 0; i < d.lines.length; i++) {
      const steps = demoSteps(d, i);
      let board = Chess.default();
      for (let k = 0; k < steps.length; k++) {
        if (fenOf(board).split(" ").slice(0, 4).join(" ") === key) {
          const rest = steps.slice(k, k + 4);
          const positions = [position];
          for (const step of rest) positions.push(positionAfter(positions[positions.length - 1], step.move));
          return {
            name: d.opening,
            moves: rest.map((step) => step.move),
            texts: rest.map((step, n) => step.note?.replace(/Transposition:.*$/, "").trim() || narrateMove(positions[n], step.move, listener())),
          };
        }
        board = positionAfter(board, steps[k].move);
      }
    }
  }
  return undefined;
}

export const QUIZ: CoachButton = { ico: "quiz", label: "Quiz me: spot their idea", run: () => { closeStepper(); void startTask("quiz"); }, kind: "accent" };

/** The playing style chosen in the settings (positional unless changed). */
export const playStyle = (): Style => (planModeBox.value === "attacking" ? "attacking" : "positional");

/** Strategy: the opening's main line if we're in one, otherwise Stockfish's
 *  plan - then, where there is one, a good alternative in your playing style. */
export async function openStrategy() {
  if (busy) return;
  const position = base();
  const style = playStyle();
  const known = demoLineFrom(position);
  setBusy(true, "Let me find the best plan...");
  try {
    const lines = await coachAnalysis.analyse(position, 1.5, 5);
    const found = styleAlternative(position, lines, style);
    let positions: Chess[];
    let moves: NormalMove[];
    let texts: string[];
    if (known) {
      moves = known.moves;
      texts = [...known.texts];
      texts[0] = `The ${known.name.replace(/ \(.*\)$/, "")} plan: ${lowerFirst(texts[0])}`;
      positions = [position];
      for (const move of moves) positions.push(positionAfter(positions[positions.length - 1], move));
    } else {
      const plan = await planAhead(coachAnalysis, position);
      moves = plan.steps.slice(0, 4).map((step) => step.move);
      positions = plan.positions.slice(0, moves.length + 1);
      // spoken to the side to move, unless you've picked a side
      const viewer = listener() ?? position.turn;
      texts = moves.map((move, i) => narrateMove(positions[i], move, viewer));
      if (moves.length && isSacrifice(positions[0], moves[0], positions[1])) texts[0] = `There's a masterstroke here! ${texts[0]}`;
      else if (texts.length) texts[0] = `The best plan: ${lowerFirst(texts[0])}`;
    }
    setBusy(false);
    // (the plan's own first move isn't an alternative to itself)
    const alternative = found && !(moves[0] && makeUci(found.move) === makeUci(moves[0])) ? found : undefined;
    const extra: CoachButton = alternative
      ? { ico: style === "attacking" ? "hazard" : "bulb", label: style === "attacking" ? "A sharper way" : "A more positional way",
          kind: "accent", labelled: true, run: () => showStyleAlternative(position, alternative.pv, style) }
      : QUIZ;
    if (alternative && texts.length) texts[texts.length - 1] += ` There's also a ${style === "attacking" ? "sharper" : "more positional"} way that's nearly as good.`;
    startStepper(positions, moves, texts, "talk", extra);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    setBusy(false);
    refresh();
  }
}

/** The playing style's alternative, played out: nearly as strong as the best
 *  move, and closer to how you like to play. */
export function showStyleAlternative(position: Chess, pv: NormalMove[], style: Style) {
  const viewer = listener() ?? position.turn;
  const line = wholeLine(position, pv, 3);
  if (!line.length) return;
  const story = talkLine(position, line, viewer);
  const texts = [...story.texts];
  texts[0] = style === "attacking"
    ? `A sharper way: ${lowerFirst(moveInWords(position, line[0], viewer))} It's nearly as strong, and it puts more pressure on their king.`
    : `A more positional way: ${lowerFirst(moveInWords(position, line[0], viewer))} It's nearly as strong, and it keeps your position solid.`;
  startStepper(story.positions, line, texts, "talk", QUIZ);
}

// -- The move strip (phones) and the views (board, statistics, history) --------


export function drawMoveStrip(list: (Review | undefined)[], info: OpeningInfo[]) {
  const strip = $("move-strip");
  const current = currentPly();
  strip.replaceChildren(...game.moves.map((played, i) => {
    const ply = i + 1;
    const position = game.positionAt(i);
    const button = document.createElement("button");
    button.type = "button";
    const number = position.turn === "white" ? `${position.fullmoves}.` : "";
    const review = list[i];
    const mark = review && !info[i]?.book ? MOVE_MARKS[review.rating] : undefined; // book moves stay plain
    if (number) button.append(Object.assign(document.createElement("span"), { className: "ms-num", textContent: number }));
    button.append(`${played.san}${mark && !played.san.endsWith("#") ? mark : ""}`);
    button.className = ply === current ? "cur" : "";
    if (mark !== undefined) button.classList.add(ratingClass(review!.rating));
    button.addEventListener("click", () => goTo(ply));
    return button;
  }));
  strip.hidden = game.length === 0;
  strip.querySelector(".cur")?.scrollIntoView({ inline: "center", block: "nearest" });
}

export function applyView() {

  for (const tab of document.querySelectorAll<HTMLButtonElement>(".view-tabs button")) {
    tab.classList.toggle("on", tab.dataset.view === currentView);
  }
  for (const panel of document.querySelectorAll<HTMLElement>("[data-view-panel]")) {
    panel.hidden = panel.dataset.viewPanel !== currentView;
  }
  document.body.dataset.view = currentView;
  if (currentView === "stats") drawStats();
  if (currentView === "history") drawHistory();
}

// -- Statistics: accuracy per phase, every grade counted, an estimated rating ---

export const GRADES = ["Brilliant", "Great", "Best", "Excellent", "Good", "Book", "Forced", "Inaccuracy", "Mistake", "Miss", "Missed Win", "Blunder"];

export const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** A message from the coach in a tab with nothing to show yet. */
export function tabMessage(box: HTMLElement, text: string, button?: CoachButton) {
  const say = element("div", "tab-message");
  const face = element("div", "coach-face big");
  face.innerHTML = avatarSvg("talk", 64);
  say.append(face, element("p", "", text));
  if (button) {
    const action = iconButton(button, 18);
    action.classList.add("labelled");
    action.append(element("span", "", button.label));
    say.append(action);
  }
  box.append(say);
}

let ratingInfo = false; // the rating's explanation, shown with its i

export function drawStats() {
  const box = $("stats");
  box.replaceChildren();
  if (mode === "play") {
    if (match) tabMessage(box, "Your statistics appear when the game is over. No peeking during a real game!");
    else if (canReview) tabMessage(box, "Shall we go through the game? Then your statistics appear here.", { ico: "search", label: "Review the game", run: onReviewGame, kind: "accent" });
    else tabMessage(box, "Play a game and your statistics appear here.");
    return;
  }
  if (game.length < 4) {
    tabMessage(box, "Play a few moves and I'll show the statistics here.");
    return;
  }
  const list = reviews();
  const positions = Array.from({ length: game.length + 1 }, (_, ply) => game.positionAt(ply));
  const scores = gameScores();
  const start = positions[0].turn;
  const overall = gameAccuracy(start, scores);
  const phases = phaseAccuracy(start, positions, scores);
  const ratings = estimateRating(start, scores);
  // With the players' ratings in the game's details: from those and the accuracy (as chess.com does)
  for (const colour of ["white", "black"] as const) {
    const elo = Number(gameHeaders[colour === "white" ? "WhiteElo" : "BlackElo"]);
    const accuracy = overall[colour];
    if (elo > 0 && accuracy !== undefined && !Number.isNaN(accuracy)) ratings[colour] = ratingFromAccuracy(elo, accuracy);
  }
  const { done, total } = analyser.progress();
  // Until Stockfish has checked every move, show ?? rather than numbers that keep changing
  const pending = done < total || scores.some((score) => !score) || list.some((review) => !review);
  if (pending && !(deepening && !deepening.done)) {
    const bar = element("div", "stats-progress");
    const fill = element("div", "stats-progress-fill");
    const fraction = total ? done / total : 0;
    fill.style.width = `${Math.round(fraction * 100)}%`;
    const track = element("div", "stats-progress-track");
    track.append(fill);
    bar.append(element("span", "", "Stockfish is checking the game..."), track);
    box.append(bar);
  }

  // Both players side by side (you first when it's your game)
  const first: Color = listener() ?? "white";
  const sides: Color[] = [first, opposite(first)];
  const name = (colour: Color) => barName(colour);

  const card = element("div", "stats-card");
  const table = element("div", "stats-table");
  const row = (label: string | HTMLElement, cells: (HTMLElement | string)[], className = "") => {
    const line = element("div", `stats-row ${className}`);
    line.append(typeof label === "string" ? element("span", "stats-label", label) : label);
    for (const cell of cells) line.append(typeof cell === "string" ? element("span", "stats-cell", cell) : cell);
    table.append(line);
  };
  const percent = (value: number | undefined, big = false) => {
    const cell = element("span", `stats-cell ${big ? "big" : ""}`);
    if (pending) cell.textContent = "??";
    else if (value === undefined || Number.isNaN(value)) cell.textContent = "-";
    else {
      cell.textContent = value.toFixed(1); // (like chess.com: 96.3)
      cell.classList.add(ratingClass(accuracyRating(value)));
    }
    return cell;
  };
  row("", sides.map((c) => element("span", "stats-cell stats-name", name(c))), "head");
  row("Accuracy", sides.map((c) => percent(overall[c], true)));
  row("Opening", sides.map((c) => percent(phases.opening[c])));
  row("Middlegame", sides.map((c) => percent(phases.middlegame[c])));
  row("Endgame", sides.map((c) => percent(phases.endgame[c])));
  const fromRatings = ["WhiteElo", "BlackElo"].some((tag) => Number(gameHeaders[tag]) > 0);
  const ratingLabel = element("span", "stats-label", "Rating");
  const info = element("button", "stats-tag stats-info", "estimate ⓘ");
  info.type = "button";
  info.setAttribute("aria-expanded", String(ratingInfo));
  info.addEventListener("click", () => {
    ratingInfo = !ratingInfo;
    drawStats();
  });
  ratingLabel.append(info);
  row(ratingLabel, sides.map((c) => {
    const cell = element("span", "stats-cell");
    cell.append(element("span", "rating-block", pending ? "??" : ratings[c] ? String(ratings[c]) : "-"));
    return cell;
  }), "rating-row");
  if (ratingInfo) {
    const note = element("p", "stats-note stats-info-note",
      `An estimate from how accurately each side played${fromRatings ? ", starting from their ratings" : ""}. ` +
      "One game is a small sample: expect it to vary a few hundred points.");
    table.append(note);
  }

  // More: how many moves got each grade
  const toggle = element("button", "stats-more", statsMore ? "More ▴" : "More ▾");
  toggle.addEventListener("click", () => {
    set.statsMore(!statsMore);
    drawStats();
  });
  row(toggle, ["", ""]);
  if (statsMore) {
    const counts: Record<Color, Record<string, number>> = { white: {}, black: {} };
    const graded = withBook(list);
    graded.forEach((review, i) => {
      if (!review) return;
      const colour = game.moverOf(i + 1);
      counts[colour][review.rating] = (counts[colour][review.rating] ?? 0) + 1;
    });
    for (const grade of GRADES) {
      const label = element("span", "stats-label stats-grade");
      label.append(element("span", `grade-dot ${ratingClass(grade)}`), element("span", "", ratingName(grade)));
      row(label, sides.map((c) => {
        const cell = element("span", "stats-cell");
        const chip = element("span", `count-chip ${ratingClass(grade)}`, pending ? "??" : String(counts[c][grade] ?? 0));
        if (!pending && counts[c][grade]) {
          // tap: the board at the first such move, illustrated; tap again for the next
          chip.classList.add("tappable");
          chip.setAttribute("role", "button");
          chip.tabIndex = 0;
          chip.addEventListener("click", () => jumpToGrade(c, grade, graded));
        }
        cell.append(chip);
        return cell;
      }));
    }
  }
  card.append(table);
  if (statsMore) {
    // Where each phase began, so the scores make sense
    const division = divide(positions);
    const moveNumber = (ply: number) => positions[ply].fullmoves;
    card.append(element("p", "stats-note", division.middle === undefined
      ? "The game stayed in the opening phase."
      : [`Middlegame from move ${moveNumber(division.middle)}`,
         division.end !== undefined ? `endgame from move ${moveNumber(division.end)}` : "no endgame"].join(" · ") +
        ". A phase needs 3 moves from a player to be scored."));
  }
  if (reviewing) {
    const start = element("div", "stats-start");
    const button = iconButton({ ico: "play", label: "Start the review", run: startReview, kind: "accent" }, 18);
    button.classList.add("labelled");
    button.append(element("span", "", "Start the review"));
    start.append(button);
    box.append(start);
  }

  box.append(card);
  if (reviewing) box.append(depthCard(pending));
  // Save this game: as a PGN, for elsewhere (Lichess, chess.com, a friend)
  const save = element("button", "link-button stats-save", "Save this game (PGN)");
  save.type = "button";
  save.addEventListener("click", openSave);
  box.append(save);
  updateHistoryAccuracy(overall);
}

// -- Game history: your games against Stockfish (and from Lichess and chess.com), on this device

export interface SavedGame {
  id: string;
  date: string; // ISO
  pgn: string;
  user: Color;
  level: number;
  opening: string;
  timeControl: string;
  result: "win" | "draw" | "loss";
  accuracy?: number;
  mode: Mode;
  // Games brought in from Lichess or chess.com
  source?: Source;
  opponent?: string;
  opponentRating?: number;
  speed?: string; // "Blitz", "Rapid"...
}

const KEEP_OWN = 500; // your games here
const KEEP_IMPORTED = 300; // games from Lichess and chess.com (they can be got again)

export const HISTORY_KEY = "chess-trainer-history";
export const historyResults = new Set<SavedGame["result"]>();

export function loadHistory(): SavedGame[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveHistory(games: SavedGame[]) {
  // newest first; games brought in never push out your own
  const sorted = [...games].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const own = sorted.filter((g) => !g.source).slice(0, KEEP_OWN);
  const imported = sorted.filter((g) => g.source).slice(0, KEEP_IMPORTED);
  const kept = new Set([...own, ...imported]);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sorted.filter((g) => kept.has(g))));
  } catch {
    // storage full or blocked: the record just isn't kept
  }
}

/** The opening's family name, e.g. "Italian Game" from "C50 Italian Game: ...". */
export function openingFamily(): string {
  if (!book || !isStartPosition(game.positionAt(0))) return "";
  const named = book.gameOpenings(game.positionAt(0), gameMoves()).map((i) => i.opening).filter(Boolean);
  const last = named[named.length - 1];
  return last ? mainFamily([last[1]]) : "";
}

/** A match has ended: keep it in the game history. */
export function recordGame() {
  if (!match || game.length === 0) return;
  const result = gameHeaders.Result;
  const winner = result === "1-0" ? "white" : result === "0-1" ? "black" : result === "1/2-1/2" ? null : undefined;
  if (winner === undefined) return;
  const outcome: SavedGame["result"] = winner === null ? "draw" : winner === match.user ? "win" : "loss";
  const entry: SavedGame = {
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    pgn: writePgn(game, gameHeaders, clockTimes),
    user: match.user,
    level: match.level,
    opening: openingFamily(),
    timeControl: gameHeaders.TimeControl ?? "",
    result: outcome,
    mode,
  };
  set.currentGameId(entry.id);
  saveHistory([entry, ...loadHistory()]);
}

/** Once Stockfish has checked the game, note your accuracy in the history. */
export function updateHistoryAccuracy(overall: Partial<Record<Color, number>>) {
  if (!currentGameId) return;
  const { done, total } = analyser.progress();
  if (done < total) return;
  const games = loadHistory();
  const entry = games.find((g) => g.id === currentGameId);
  if (!entry || entry.accuracy !== undefined) return;
  const accuracy = overall[entry.user];
  if (accuracy === undefined) return;
  entry.accuracy = Math.round(accuracy);
  saveHistory(games);
}

export function timeControlLabel(value: string): string {
  if (!value) return "no clock";
  const [base, inc] = value.split("+").map(Number);
  return `${Math.round(base / 60 * 10) / 10}+${inc}`;
}

export function shortDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function drawHistory() {
  const box = $("history");
  box.replaceChildren();
  const unsaved = backupDue();
  if (unsaved) {
    const note = element("div", "backup-note");
    note.append(element("span", "", `${unsaved} new games since your last backup.`));
    const now = element("button", "accent", "Back up");
    now.type = "button";
    now.addEventListener("click", () => void backUp().then(refresh));
    const later = element("button", "round soft", "");
    later.type = "button";
    later.setAttribute("aria-label", "Not now");
    later.innerHTML = icon("close", 16);
    later.addEventListener("click", () => {
      snoozeReminder();
      refresh();
    });
    note.append(now, later);
    box.append(note);
  }
  const games = loadHistory();
  // Back to Game review (when you came from there), and the import button
  const top = element("div", "history-top");
  if (historyFromReview) {
    const back = element("button", "soft history-back", "");
    back.type = "button";
    back.innerHTML = `${icon("back", 16)} Game review`;
    back.addEventListener("click", () => {
      setHistoryFromReview(false);
      openPgnDialog();
    });
    top.append(back);
  }
  top.append(element("span", "history-gap"));
  // Save all your games, in one PGN
  if (games.length) {
    const save = element("button", "round soft history-save", "");
    save.type = "button";
    save.innerHTML = icon("download", 16);
    save.title = "Save all your games (PGN)";
    save.setAttribute("aria-label", "Save all your games (PGN)");
    save.addEventListener("click", openSave);
    top.append(save);
  }
  const get = element("button", "history-get", "");
  get.type = "button";
  get.innerHTML = `${icon("download", 16)} ${importing ? "Getting..." : "Get my games"}`;
  get.disabled = importing;
  get.addEventListener("click", () => void importGames());
  top.append(get);
  box.append(top);
  if (importNote) box.append(element("p", "stats-note history-import-note", importNote));
  if (!games.length) {
    tabMessage(box, "No games yet. Play against me, or get your games from Lichess, and your record builds up here.");
    return;
  }
  // Where from: all, this app, Lichess, chess.com (when there are games from more than one place)
  const sources = new Set(games.map((g) => g.source ?? "app"));
  if (historySource !== "all" && !sources.has(historySource)) historySource = "all";
  const where = element("div", "seg history-sources");
  if (sources.size > 1) {
    for (const [value, label] of [["all", "All"], ["app", "This app"], ["lichess", "Lichess"], ["chesscom", "chess.com"]] as const) {
      if (value !== "all" && !sources.has(value)) continue;
      const button = element("button", value === historySource ? "on" : "", label);
      button.addEventListener("click", () => {
        historySource = value;
        drawHistory();
      });
      where.append(button);
    }
  }
  const fromHere = games.filter((g) => historySource === "all" || (g.source ?? "app") === historySource);
  // Colour: all, White or Black
  const colours = element("div", "seg history-colours");
  for (const [value, label] of [["all", "All"], ["white", "White"], ["black", "Black"]] as const) {
    const button = element("button", value === historyColour ? "on" : "", label);
    button.addEventListener("click", () => {
      set.historyColour(value);
      drawHistory();
    });
    colours.append(button);
  }
  // Results: wins, draws and losses, as filters that combine with the colour
  const ofColour = fromHere.filter((g) => historyColour === "all" || g.user === historyColour);
  const record = element("div", "history-record");
  for (const [value, label] of [["win", "Wins"], ["draw", "Draws"], ["loss", "Losses"]] as const) {
    const button = element("button", `history-result ${value} ${historyResults.has(value) ? "on" : ""}`);
    button.append(element("b", "", String(ofColour.filter((g) => g.result === value).length)), element("span", "", label));
    button.setAttribute("aria-pressed", String(historyResults.has(value)));
    button.addEventListener("click", () => {
      if (historyResults.has(value)) historyResults.delete(value);
      else historyResults.add(value);
      drawHistory();
    });
    record.append(button);
  }
  const shown = ofColour.filter((g) => !historyResults.size || historyResults.has(g.result));
  const list = element("div", "history-list");
  for (const saved of shown) list.append(historyRow(saved));
  if (!shown.length) list.append(element("p", "stats-note", "No games match these filters."));
  box.append(...(where.childElementCount ? [where] : []), colours, record, list);
  if (games.some((g) => g.source)) {
    const older = element("button", "link-button history-older", "Get older games");
    older.type = "button";
    older.disabled = importing;
    older.addEventListener("click", () => void importGames(true));
    box.append(older);
  }
}

let historySource: "all" | "app" | Source = "all";
export let historyFromReview = false; // opened with See all games: the way back is to Game review
export const setHistoryFromReview = (on: boolean) => (historyFromReview = on);

/** One game in the history (and on the Game review screen): tap to replay or review it. */
export function historyRow(saved: SavedGame): HTMLButtonElement {
  const item = element("button", "history-game");
  item.type = "button";
  const mark = element("span", `history-mark ${saved.result}`, saved.result === "win" ? "W" : saved.result === "loss" ? "L" : "D");
  const text = element("span", "history-text");
  const title = element("span", "history-title", saved.source
    ? `${saved.opponent ?? "?"}${saved.opponentRating ? ` (${saved.opponentRating})` : ""}`
    : `vs the coach · ${shortName(LEVELS[saved.level] ?? LEVELS[0])}`);
  if (saved.source) title.append(element("span", `history-tag ${saved.source}`, SOURCE_NAMES[saved.source]));
  text.append(title, element("span", "history-meta", [saved.speed ?? "", saved.opening || "Game", saved.user === "white" ? "White" : "Black",
    saved.source ? "" : timeControlLabel(saved.timeControl), saved.accuracy !== undefined ? `${saved.accuracy}%` : ""].filter(Boolean).join(" · ")));
  item.append(mark, text, element("span", "history-date", shortDate(saved.date)));
  item.addEventListener("click", () => (saved.source ? reviewImported(saved) : openSavedGame(saved)));
  return item;
}

/** Replay a saved game with the coach. */
export function openSavedGame(saved: SavedGame) {
  const [parsed] = readPgn(saved.pgn);
  if (!parsed) return;
  const { game: loaded } = parsed.load();
  set.mode("practice");
  resetBoard(loaded, parsed.headers);
  set.currentGameId(saved.id);
  set.canReview(false);
  set.reviewing(true);
  set.reviewTitle("");
  set.orientation(saved.user);
  set.gameOrigin(saved.mode === "play" ? "play" : "practice");
  set.viewPly(loaded.length ? 0 : null);
  restoreAnalysis();
  set.currentView("board");
  refresh();
}

export const inProgress = () => match !== null && game.length > 0 && !game.outcome();

/** What New starts again, in the mode you're in: "game", "match", "review"... */
export function newWhat(): string {
  switch (gameOrigin) {
    case "practice": return "match";
    case "analysis": return "review";
    case "learn": return drill ? "drill" : "lesson";
    case "train": return puzzle || practice ? "puzzles" : lesson ? "lesson" : "position";
    default: return "game";
  }
}

/** New game (or match, review...): the setup screen of the mode you're in. */
export async function onNewGame() {
  if (inProgress() && !(await message(`New ${newWhat()}?`, "Are you sure? This game will end.", true))) return;
  const learning = demo ? demo.demo.opening : drill ? drill.demo.opening : null;
  const screen: HomeChoice | null = gameOrigin === "learn" ? "train" : gameOrigin;
  if (screen === "train") $("lesson-list").hidden = true;
  endGame();
  showMenu();
  if (!screen) return;
  set.homeChoice(screen);
  if (gameOrigin === "learn") {
    set.trainTab("openings");
    if (learning) {
      set.learnOpening(learning);
      set.learnColour(REPERTOIRE.find((o) => o.name === learning)?.colour ?? "white");
    }
  }
  showScreen(screen);
  drawTrainScreen();
}

// -- Updates: check for a new version, and restart into it -------------------------


/** Once a new version has finished downloading: true when it's ready to use. */
export function installed(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const settled = () => {
      if (worker.state === "activated") resolve(true);
      else if (worker.state === "redundant") resolve(false);
      else return false;
      return true;
    };
    if (settled()) return;
    worker.addEventListener("statechange", () => void settled());
  });
}

/** Restart the app (or reload the page) into the new version - asking first
 *  if a game is being played. */
export async function restartIntoUpdate() {
  if (inProgress() && !(await message("Restart now?", "The new version is ready, but restarting ends this game.", true))) return;
  location.reload();
}

/** Settings: check for a new version now; if there is one, it downloads and the app restarts into it. */
export async function checkForUpdates() {
  const button = $<HTMLButtonElement>("check-updates");
  const label = button.querySelector<HTMLElement>(".cu-label")!;
  const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (!registration) {
    void message("Updates", `Updates come by themselves on the website. This is version ${__BUILD__}.`);
    return;
  }
  set.checkingUpdates(true);
  button.disabled = true;
  label.textContent = "Checking...";
  try {
    await registration.update();
    const incoming = registration.installing ?? registration.waiting;
    if (!incoming) {
      void message("Updates", `You're up to date (version ${__BUILD__}).`);
      return;
    }
    label.textContent = "Updating...";
    if (await installed(incoming)) await restartIntoUpdate();
    else void message("Updates", "The update didn't finish downloading. Try again in a moment.");
  } catch {
    void message("Updates", "Couldn't check for updates. Are you online? The app keeps working as it is.");
  } finally {
    set.checkingUpdates(false);
    button.disabled = false;
    label.textContent = "Check for updates";
  }
}

// -- Your data: back up and restore ---------------------------------------------------

/** Settings: how much is kept, and when it was last backed up. */
export function drawDataCounts() {
  const counts = dataCounts();
  const made = backupNote().made;
  const days = made ? Math.floor((Date.now() - made) / 86_400_000) : undefined;
  const rows: [string, string][] = [
    ["Games", String(counts.games)],
    ["Saved reviews", String(counts.reviews)],
    ["Your mistakes", String(counts.mistakes)],
    ["Last backup", days === undefined ? "never" : days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`],
  ];
  $("data-counts").replaceChildren(...rows.map(([label, value]) => {
    const row = element("div", "data-row");
    row.append(element("span", "", label), element("span", "", value));
    return row;
  }));
}

/** Back up: the phone's share sheet (Drive, email...), or a download on a computer. */
export async function backUp() {
  const { name, text } = makeBackup();
  const file = new File([text], name, { type: "application/json" });
  const phone = matchMedia("(pointer: coarse)").matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Chess Trainer backup" });
      noteBackup();
    } catch (error) {
      if ((error as Error).name !== "AbortError") void message("Back up", "Sharing didn't work here, so the file is downloading instead.").then(() => download(file));
    }
  } else {
    download(file);
    noteBackup();
  }
  drawDataCounts();
}

export function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Restore: read the chosen file, show what's in it, then add it or replace with it. */
export async function restoreFromFile() {
  const input = $<HTMLInputElement>("data-file");
  const chosen = input.files?.[0];
  input.value = ""; // (the same file can be chosen again)
  if (!chosen) return;
  const backup = readBackup(await chosen.text());
  if (typeof backup === "string") {
    void message("Restore", backup);
    return;
  }
  const how = await askRestore(backup);
  if (!how) return;
  if (!restoreBackup(backup, how)) {
    void message("Restore", "There wasn't room on this device to restore it, so nothing was changed.");
    return;
  }
  await message("Restore", how === "add" ? "Done: the backup has been added. The app restarts to load it." : "Done: this device now matches the backup. The app restarts to load it.");
  location.reload();
}

/** The restore dialog: what's in the backup, and add or replace. */
export function askRestore(backup: BackupContents): Promise<"add" | "replace" | null> {
  const dialog = $<HTMLDialogElement>("restore-dialog");
  const rows: [string, string][] = [
    ["From", backup.made.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })],
    ["Games", `${backup.games}${backup.newGames ? ` (${backup.newGames} not on this device)` : ""}`],
    ["Saved reviews", String(backup.reviews)],
    ["Your mistakes", String(backup.mistakes)],
  ];
  $("restore-summary").replaceChildren(...rows.map(([label, value]) => {
    const row = element("div", "data-row");
    row.append(element("span", "", label), element("span", "", value));
    return row;
  }));
  let how: "add" | "replace" = "add";
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("#restore-how button")];
  const draw = () => {
    for (const button of buttons) button.classList.toggle("on", button.dataset.how === how);
    $("restore-note").textContent = how === "add"
      ? "Adding keeps everything on this device and brings in what's missing."
      : "Replacing makes this device match the backup exactly: anything not in it is gone.";
  };
  for (const button of buttons) {
    button.onclick = () => {
      how = button.dataset.how as "add" | "replace";
      draw();
    };
  }
  draw();
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.onclose = () => resolve(dialog.returnValue === "restore" ? how : null);
  });
}

/** Home: the coach's welcome. It ends whatever was on the board (asking
 *  first if a game is still being played). */
export async function onHome() {
  if (inProgress() && !(await message("Leave this game?", "Are you sure? This game will end.", true))) return;
  endGame();
  showMenu();
}

/** Leave the game for good: the clock stops and the board is cleared. */
export function endGame() {
  if (preparing) stopPreparing();
  clock?.stop();
  resetBoard(new Game());
  refresh();
}

export function drawTurn() {
  if (demo) {
    turnLabel.textContent = `${demo.demo.opening} - ${demo.demo.lines[demo.line].title}`;
    return;
  }
  turnLabel.textContent = turnText();
  if (analysis) gameInfo.textContent = "Exploring a different move";
  else if (match) {
    const colour = match.user === "white" ? "White" : "Black";
    gameInfo.textContent = `vs the coach (${shortName(LEVELS[match.level])}), you play ${colour}`;
  } else if (canReview && mode === "play") gameInfo.textContent = "Game over. See how every move rated:";
  else if (mode === "practice" && reviewing) gameInfo.textContent = reviewTitle || "Reviewing your game against the coach";
  else if (mode === "practice") gameInfo.textContent = "Free board: you move both sides";
  else gameInfo.textContent = game.length ? "Match over" : "";
}

export function turnText(): string {
  if (analysis && !preview) {
    const line = analysisLineText();
    const side = colourName(base().turn);
    return line ? `Analysis (${side} to move): ${line}` : `Analysis: make any move for ${side} to see what would have happened`;
  }
  const quizLine = quizLinePositions();
  if (quizLine && quiz?.lineStep) {
    const total = quiz.explanation!.line.length;
    const move = quiz.explanation!.line[quiz.lineStep - 1];
    const san = makeSan(quizLine[quiz.lineStep - 1], move);
    const who = quiz.lineStep === 1 ? "their guessed move" : quiz.lineStep % 2 === 0 ? "you answer" : "they play";
    return `Your guess played out (not the game): move ${quiz.lineStep} of ${total}, ${who} ${san}`;
  }
  const plan = previewPlan();
  if (plan && preview) {
    const step = plan.steps[preview.step - 1];
    const who = step.who === "You" ? "you play" : "your opponent plays";
    return `Previewing Stockfish's line (not played): move ${preview.step} of ${plan.steps.length}, ${who} ${step.san}`;
  }
  if (viewPly !== null) return "Looking back - the game itself is unchanged";
  if (quizWaiting()) return `Quiz: move one of ${colourName(quiz!.threat!.them)}'s pieces to show their idea`;
  if (result) return result;
  const position = game.position;
  const side = colourName(position.turn);
  const outcome = game.outcome();
  if (outcome?.reason === "checkmate") return `Checkmate - ${colourName(outcome.winner!)} wins`;
  if (outcome) return "Game over - draw";
  if (match) {
    if (position.turn === match.user) return `Your move (${side})${position.isCheck() ? " - you're in check!" : ""}`;
    return "The coach is thinking...";
  }
  return position.isCheck() ? `${side} to move - in check!` : `${side} to move`;
}

/** Grey out buttons that can't be used right now. */
export function drawButtons() {
  const waiting = busy || thinking;
  const looking = viewPly !== null || preview !== null || analysis !== null;
  const position = base();
  const gameOver = position.isEnd() || isDrawnPosition(position);
  const quizOpen = quiz !== null && !quiz.answered;

  for (const button of [toolButtons.threat, toolButtons.plan, toolButtons.ideas, toolButtons.brilliant]) {
    button.disabled = waiting || gameOver || quizOpen;
  }
  toolButtons.quiz.disabled = waiting || gameOver || preview !== null;
  toolButtons.quiz.textContent = quizOpen ? "Give up - show answer" : "Spot their idea (quiz)";

  const plan = insights.get(fenOf(position))?.plan;
  const step = preview?.step ?? 0;
  if (quiz?.explanation) {
    const quizStep = quiz.lineStep ?? 0;
    lineBack.disabled = waiting || quizStep === 0;
    lineForward.disabled = waiting || quizStep >= quiz.explanation.line.length;
    lineExit.disabled = quizStep === 0;
  } else {
    lineBack.disabled = waiting || step === 0;
    lineForward.disabled = waiting || !plan || quizOpen || step >= (plan?.steps.length ?? 0);
    lineExit.disabled = preview === null;
  }

  // No take-backs while looking back or previewing: Undo only works on the live game.
  undoButton.disabled = waiting || looking || quizOpen || !game.length;
  newButton.disabled = busy;
  const what = newWhat();
  newButton.querySelector(".ng-long")!.textContent = ` ${what}`;
  newButton.setAttribute("aria-label", `New ${what}`);

  resignButton.hidden = !(match && !analysis);
  resignButton.disabled = busy;
  reviewButton.hidden = !(canReview && mode === "play" && !match && !analysis);
  exitAnalysisButton.hidden = !analysis;
}

/** Fill the coach's text box for the position being looked at. */
export function drawCoach() {
  if (mode !== "practice") return;
  coachText.replaceChildren();
  const insight = insights.get(fenOf(base())) ?? {};

  const section = (heading: string, ...body: (string | HTMLElement)[]) => {
    const block = document.createElement("div");
    block.className = "coach-section";
    const title = document.createElement("p");
    title.className = "coach-heading";
    title.textContent = heading;
    block.append(title, ...body.map((part) => (typeof part === "string" ? textBlock(part) : part)));
    coachText.append(block);
  };
  const textSection = (text: string) => {
    const [heading, ...rest] = text.split("\n");
    section(heading, rest.join("\n"));
  };

  if (errorText) section("Something needs attention", errorText);

  if (quiz && !quiz.threat) {
    section("Quiz", "Preparing the question...");
  } else if (quiz && !quiz.answered) {
    const them = colourName(quiz.threat!.them);
    section(
      "Quiz: spot your opponent's idea",
      `Imagine you skip your move and ${them} gets to play again. What would they play?\n\n` +
        `Click one of ${them}'s pieces, then the square it would move to.\n\n` +
        `Take your time: look at what each of ${them}'s pieces attacks, and what is undefended on your side.`,
      textBlock('Stuck? Click "Give up - show answer".', "coach-note"),
    );
  } else if (quiz?.answered) {
    const [correct, text] = quiz.result!;
    const parts: HTMLElement[] = [textBlock(text, correct ? "coach-right" : "coach-wrong")];
    if (quiz.explaining) parts.push(textBlock("Stockfish is checking what your guess would do...", "coach-note"));
    if (quiz.explanation) {
      parts.push(textBlock(quiz.explanation.text));
      parts.push(textBlock("Blue arrow: your guess. Green arrow: your best answer. Use the ‹ › buttons below to play it out.", "coach-note"));
    }
    section("Quiz result", ...parts);
  }

  // No spoilers while a quiz question is open
  const hidden = quiz !== null && !quiz.answered;
  if (insight.ideas && !hidden) {
    // The summary goes first; its sub-headings are in bold too
    const [heading, ...rest] = insight.ideas.split("\n");
    const parts: HTMLElement[] = [];
    for (const paragraph of rest.join("\n").split("\n\n")) {
      const [first, ...body] = paragraph.split("\n");
      if (first.startsWith("Watch for:")) {
        const p = textBlock("");
        const bold = document.createElement("strong");
        bold.textContent = "Watch for:";
        p.append(bold, first.slice("Watch for:".length));
        parts.push(p);
      } else if (body.length) {
        const sub = textBlock(first, "coach-subheading");
        parts.push(sub, textBlock(body.join("\n")));
      } else if (first) {
        parts.push(textBlock(first, first.startsWith("Move numbers") ? "coach-note" : ""));
      }
    }
    section(heading, ...parts);
  }
  if (insight.brilliant && !hidden) {
    const brilliant = insight.brilliant;
    const fen = fenOf(base());
    if (!brilliant.found) {
      section("Is there a masterstroke?", brilliant.text);
    } else if (!brilliantShown.has(fen)) {
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "coach-reveal";
      reveal.textContent = "Show the move";
      reveal.addEventListener("click", () => {
        brilliantShown.add(fen);
        refresh();
      });
      section(
        "Is there a masterstroke? Yes!",
        "There's a sacrifice here that works: you can offer up a piece and still come out on top.\n\n" +
          `Look at what your ${brilliant.role} can do: which move gives something away but opens the enemy king, ` +
          "forks, or wins more back? Check every capture, check and threat - and calculate what happens if they take.",
        reveal,
      );
    } else {
      section("The masterstroke", `${brilliant.text}\n\nStockfish's line: ${brilliant.line}`);
    }
  }
  if (insight.threat && !hidden) textSection(insight.threat.text);
  if (insight.plan && !hidden) {
    textSection(insight.plan.text);
    // Known opening theory from this position, from the opening database
    const theory = book ? [...book.bookMoves(base()).values()] : [];
    if (theory.length) {
      // Main lines first: the more named lines continue from a move, the more established it is.
      const ranked = theory.sort((a, b) => b.names.size - a.names.size).slice(0, 5);
      const items = ranked.map((entry) => `• ${makeSan(base(), entry.move)} (${mainFamily(entry.names)})`);
      section("Known opening theory from here", items.join("\n"));
    }
  }

  if (!coachText.childElementCount && match && (match.sfOpening || match.myOpening)) {
    // Start of a match: the plans of the openings being played
    const first = firstMoveOf(game.positionAt(0), gameMoves());
    for (const [who, opening] of [["Your opening", match.myOpening], ["The coach's opening", match.sfOpening]] as const) {
      if (!opening) continue;
      const system = systemFor(opening, first);
      section(`${who}: ${opening.name}`, `${opening.plan}\nSetup: ${system.setup.map(goalWords).join(", ")}.`);
    }
  }
  if (!coachText.childElementCount) textSection(HINT_TEXT);

  const [right, asked] = quizScore;
  quizScoreLabel.textContent = asked ? `Quiz score: ${right} / ${asked}` : "";
  drawStatus();
}

export function textBlock(text: string, className = ""): HTMLElement {
  const p = document.createElement("p");
  p.className = `coach-body ${className}`.trim();
  p.textContent = text;
  return p;
}
