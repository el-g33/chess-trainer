// The coach: the review spoken by a cartoon face (a strip above the board on
// phones; a feed of earlier moves and a speech bubble on desktops)

import type { DrawShape } from "@lichess-org/chessground/draw";
import type { Key } from "@lichess-org/chessground/types";
import { attacks } from "chessops/attacks";
import { Chess, normalizeMove } from "chessops/chess";
import { makeSan, parseSan } from "chessops/san";
import type { Color, NormalMove, Role as PieceRole } from "chessops/types";
import { makeSquare, makeUci, opposite } from "chessops/util";

import { accuracyRating, divide, gameAccuracy, phaseAccuracy, playedLike } from "../accuracy";
import { type Mood, avatarSvg, moodForRating } from "../avatar";
import {
  type BackupContents, backupDue, backupNote, dataCounts, makeBackup, noteBackup, readBackup, restoreBackup,
  snoozeReminder,
} from "../backup";
import { type Score, colourName, isCastling, pawns, scoreLeader, afterMove as positionAfter } from "../coach";
import { DEMOS, demoSteps } from "../demos";
import type { LikelyMove } from "../explore";
import { Game } from "../game";
import { icon } from "../icons";
import { LESSONS } from "../lessons";
import { LEVELS, shortName } from "../levels";
import {
  HINT_TEXT, type Mode, analyser, base, bestLine, brilliantShown, coachAnalysis, coachLine, currentPly, gameMoves, insights,
  previewPlan, quizLinePositions, quizScore, quizWaiting, ratingsOn,
} from "../main";
import { controlledSquares, dangerAfter, ignoredThreat, moveInWords, narrateMove, quietReason, stopsPawn, targetsOf, verdict, whyMove } from "../narrate";
import { REASON_LESSON, isKingHole, reasonWords, recaptureReason } from "../reasons";
import {
  type OpeningInfo, REPERTOIRE, firstMoveOf, goalWords, isStartPosition, mainFamily, systemFor,
} from "../openings";
import { SOURCE_NAMES, type Source } from "../online";
import { readPgn, writePgn } from "../pgn";
import { ratingName } from "../ratingNames";
import { type Review, fenOf, isDrawnPosition, isSacrifice, verdictWords, winningChance } from "../review";
import { pieceRoute } from "../plans";
import { type BetterPage, betterCard, betterWords, ideaWords, justAsGood, whyBetter } from "../better";
import { passMove, planAhead } from "../strategy";
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
import { HABITS, fundamentalCounts, fundamentalEvents, fundamentalsOn } from "./fundamentals";
import { keyMomentsCard, turningPlies } from "./keyMoments";
import { analysisLineText, goTo } from "./moves";
import {
  cap, depthButton, drillSays, lessonNotePages, openingShortName, practiceSays, scheduleDemo, showWhatYouGet, startDemoLine,
  lowerFirst, movePicture, practiseGameSlips,
} from "./openingDemos";
import { chooseHistoryFile, clearImportNote, importGames, importing, importNote, reviewImported } from "./onlineGames";
import { openPgnDialog, openSave } from "./pgnScreens";
import { MOVE_MARKS, barName, gameScores, ratingClass } from "./playerBars";
import { sidebarOn } from "./sidebar";
import { message } from "./popups";
import { analysisReview, moveReviews, openingInfo, reviewPly } from "./ratings";
import { moveSound, showMenu } from "./startMenu";
import { type HomeChoice, resetBoard, showScreen } from "./startScreens";
import {
  orientation, analysis, book, busy, canReview, clock, clockTimes, currentGameId, currentView, deepening, demo, drill, editor,
  errorText, explore, game, gameHeaders, gameOrigin, historyColour, lesson, match, mode, practice, preparing,
  preview, puzzle, quiz, result, reviewSide, reviewTitle, reviewing, savedFromReview, set, silentJump, speech,
  menuOpen, statsMore, statusMessage, stepper, stripButtons, thinking, viewPly, viewTrail,
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
  kind?: "accent" | "soft" | "hazard" | `hazard ${string}` | `sign ${string}`;
  more?: boolean; // the move's own button (it pulses while its card is worked out)
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

export const TELL_MORE: CoachButton = { ico: "dots", label: "Tell me more", run: () => openMore(), more: true };

/** The move's own button, as a sign of what kind of move it was: a warning
 *  for a slip (coloured by what it costs), a gift for their slip, a star for
 *  a masterstroke or key move, the bulb for a good move with a better one,
 *  an arrow for a move that sets something up. A quiet move gets none. */
export function moveButton(ply: number, review: Review): CoachButton | null {
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const viewer: Color | null = watching() ? null : listener();
  const theirs = viewer !== null && game.moverOf(ply) !== viewer;
  const run = () => openMore();
  if (WORTH_SHOWING.has(review.rating) && review.bestSan) {
    const danger = dangerAfter(review, before, after, analyser.evals.get(fenOf(before)), analyser.evals.get(fenOf(after)), !!openingInfo()[ply - 1]?.book, viewer);
    if (theirs) {
      // they missed a chance against you: you got away with it (no gift in that)
      if (review.rating === "Miss" || review.rating === "Missed Win") return { ico: "shield", label: "What you got away with", run, kind: "sign escape", more: true };
      // a slip of theirs is a gift only if it gives you something concrete; otherwise
      // (a mistake) it's the stronger move they missed, and a small one gets no sign
      if (!danger) return review.rating === "Inaccuracy" ? null : { ico: "shield", label: "What you got away with", run, kind: "sign escape", more: true };
      return { ico: "gift", label: "Your chance", run, kind: "sign chance", more: true };
    }
    // The hazard only when something concrete can be won from you (material, mate);
    // otherwise the move just left you worse placed: the bulb, a better move existed
    if (!danger) return { ico: "bulb", label: "A better move", run, kind: "sign idea", more: true };
    return { ico: "hazard", label: "What went wrong", run, kind: `hazard ${danger.level}`, more: true };
  }
  if (review.rating === "Brilliant" || review.rating === "Great") return { ico: "star", label: "Why it works", run, kind: "sign star", more: true };
  if (notTheBest(ply, review)) return { ico: "bulb", label: "See the best move", run: () => void showBestLine(ply), kind: "sign idea", more: true };
  const played = game.moves[ply - 1].move;
  if (!after.isEnd() && (after.isCheck() || targetsOf(after, played.to).length)) return { ico: "setup", label: "What it sets up", run, kind: "sign setup", more: true };
  return null;
}
export const STRATEGY: CoachButton = { ico: "target", label: "Strategy", run: () => void openStrategy(), kind: "accent" };

/** An opening lesson's first words: short, then play. */
export function lessonIntro(): string {
  if (!demo) return "";
  const lines = demo.demo.lines;
  if (demo.line > 0) return `Next, the ${lines[demo.line].title}. Whenever you're ready.`;
  const name = openingShortName(demo.demo.opening);
  return lines.length > 1
    ? `Let's go through the ${name}, its main lines and some variations. Whenever you're ready.`
    : `Let's go through the ${name} and its main line. Whenever you're ready.`;
}

/** A lesson's introduction in the middle of the screen (nothing is happening
 *  on the board yet, so the coach has room to talk); Play sends the coach back
 *  to the top and the line starts. */
export function showLessonIntro() {
  if (!demo) return;
  const about = demo.line === 0 ? demo.demo.intro : demo.demo.lines[demo.line].about ?? "";
  const play: CoachButton = { ico: "play", label: "Play the line", kind: "accent", run: () => { closeOverlay(false); startDemoLine(); } };
  showOverlay("talk", [para(lessonIntro()), ...(about ? [para(about)] : [])], [play]);
}

/** The first sentence of a note (the bubble's line; the whole note is behind the dots). */
export function firstSentence(note: string): string {
  return note.trim().split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
}

/** What the coach says about the position on screen. */
export function coachSays(reviews: (Review | undefined)[]): CoachSay {
  if (silentJump) return { mood: "talk", text: "", buttons: [], key: "silent" };
  if (busy) return { mood: "think", text: statusMessage || "Let me think…", buttons: [] };
  if (editor) return { mood: "talk", text: editor.pick
    ? "Tap squares to place it, or tap it again to put it away. Done when you're ready."
    : "Drag pieces to move them (off the board to remove), or pick a piece below to add. Done when you're ready.", buttons: [] };
  if (drill) return drillSays();
  if (practice) return practiceSays();
  if (puzzle) return puzzleSays();
  if (lesson) return { mood: "talk", text: LESSONS[lesson.phase][lesson.index].title, buttons: [] };
  if (demo?.intro) {
    // short, on the starting position: the opening's own words wait behind the dots
    const play: CoachButton = { ico: "play", label: "Play the line", run: startDemoLine, kind: "accent" };
    // (the introduction itself is in the middle of the screen; the dots bring it back)
    return { mood: "talk", text: "Ready when you are.", buttons: [play, TELL_MORE], key: `demo:${demo.line}:intro` };
  }
  if (demo) {
    const ply = currentPly();
    const step = ply ? demo.steps[ply - 1] : undefined;
    let text: string;
    let more = false; // the note says more than its first sentence: the rest behind the dots
    if (!ply && !demo.playing) {
      text = lessonIntro();
      more = true;
    } else if (!ply) {
      text = "Here we go.";
    } else if (step!.note) {
      text = firstSentence(step!.note);
      more = text.length < step!.note.trim().length;
    } else {
      // no note: what the move does, in a few words (the picture shows the rest)
      text = ideaWords(game.positionAt(ply - 1), step!.move, null);
    }
    const atEnd = ply >= game.length;
    const buttons: CoachButton[] = atEnd ? [{ ico: "bulb", label: "What you get", run: () => void showWhatYouGet(), kind: "accent" }] : [];
    if (more) buttons.push(TELL_MORE);
    return { mood: step?.note || !ply ? "talk" : "happy", text, buttons, key: `demo:${demo.line}:${ply}` };
  }
  if (mode === "play") {
    if (match) {
      const yours = game.position.turn === match.user;
      return thinking || !yours
        ? { mood: "think", text: "Let me think…", buttons: [] }
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
    const short = correct ? "Yes, that's their idea. Well spotted!"
      : quiz.guess ? "Not quite. Tap the dots and I'll show you." : "Here's their idea: tap the dots to see it.";
    void text;
    return { mood: correct ? "happy" : "worried", text: short, buttons: [TELL_MORE, { ico: "close", label: "Done", run: () => { set.quiz(null); refresh(); }, kind: "soft" }] };
  }
  if (analysis) {
    const review = ratingsOn() ? analysisReview() : undefined;
    if (!analysis.line.length) return { mood: "talk", text: "Try any move to see what would have happened.", buttons: [] };
    if (!review) return { mood: "think", text: "Let me check that move…", buttons: [] };
    const line = analysis.line;
    const before = line.positionAt(line.length - 1);
    const after = line.positionAt(line.length);
    return { mood: moodForRating(review.rating), text: verdict(review, before, after, analyser.evals.get(fenOf(after)), before.turn, line.length), buttons: [] };
  }
  if (explore) return exploreSays(reviews);
  if (findingAt !== null && reviewing && currentPly() === findingAt - 1 && !analysis) {
    return { mood: "talk", text: "Your turn: find a better move than last time, and play it on the board.", buttons: [], key: `find:${findingAt}` };
  }
  findingAt = null;
  const ply = reviewPly();
  if (!ratingsOn()) return { mood: "talk", text: "Move ratings are off.", buttons: [STRATEGY] };
  if (ply === 0) return { mood: "talk", text: game.length ? "The starting position." : "Make a move and I'll tell you what I think.", buttons: [STRATEGY] };
  const review = reviews[ply - 1];
  if (!review) return { mood: "think", text: "Let me check that move…", buttons: [STRATEGY] };
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  let text = verdict(review, before, after, analyser.evals.get(fenOf(after)), listener(), ply, watching(), analyser.evals.get(fenOf(before)));
  // the move's own button, a sign of what kind of move it was (none for a quiet one)
  const more = moveButton(ply, review);
  // (its card worked out while you read this, so it opens at once)
  if (more?.more && reviewing && (WORTH_SHOWING.has(review.rating) || review.rating === "Great")) prepareSlip(ply, review);
  const buttons = more ? [more, STRATEGY] : [STRATEGY];
  // Your slips saved as puzzles: said once, at the first, and offered at the end of the game
  const saved = reviewing && savedFromReview?.key === gameKey() ? savedFromReview : null;
  if (saved?.plies[0] === ply) text += " I've saved it to Your mistakes, with any others.";
  if (saved?.plies.length && ply === game.length) {
    const count = saved.plies.length;
    // (the end of the game: the offer alone, not a verdict on the last move as well)
    text = `That's the game. Try ${count === 1 ? "your slip" : `your ${count} slips`} now, while ${count === 1 ? "it's" : "they're"} fresh?`;
    // (the puzzle button in place of Strategy: the strip keeps its size, so the words keep their room)
    buttons.splice(0, buttons.length, { ico: "puzzle", label: "Try them now", run: practiseGameSlips, kind: "accent" }, more ?? STRATEGY);
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
  if (button.more) element.dataset.more = "";
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
  if (!asked.guess) return [idea ? `Here's their idea. ${idea}` : "There was no real threat here."];
  const kind = asked.explanation?.kind;
  const first = kind === "mistake" ? "That move wouldn't be a threat: it would be a mistake for them, and you could punish it."
    : kind === "smaller-threat" ? "That's a threat too, but a smaller one."
    : "That move doesn't threaten anything serious.";
  return idea ? [first, idea] : [first];
}

/** Tell me more: the full review of the move (or the demo note, or the quiz result). */
export function openMore() {
  if (demo?.intro) return showLessonIntro();
  if (demo) {
    // a move's note: a page per sentence, each with its own picture
    const pages = lessonNotePages();
    if (pages && pages.texts.length > 1) {
      demo.playing = false;
      const card = startStory(pages.frames[0], pages.texts[0], "talk", []);
      extendPages(card, pages.frames.slice(1), pages.texts.slice(1), 0);
      showStory(card);
      return;
    }
    const ply = currentPly();
    const note = ply ? demo.steps[ply - 1].note : demo.demo.lines[demo.line].about ?? demo.demo.intro;
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
  void explainGoodMove(ply, review);
}

/** Tell me more on a good move: one picture of what it does - the squares the
 *  piece now controls, the pawn chain, the square it takes away - and a few
 *  words. Only a move that sets something up (a check, or a piece it can now
 *  win) is played on, a few moves, to show what it sets up. */
export async function explainGoodMove(ply: number, review: Review) {
  const before = game.positionAt(ply - 1);
  const played = game.moves[ply - 1].move;
  const after = positionAfter(before, played);
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const yours = viewer === null || mover === viewer;
  const hits = after.isCheck() ? [] : targetsOf(after, played.to);
  const setsUp = after.isCheck() || hits.length > 0;
  const shapes: DrawShape[] = [
    ...movePicture(before, after, played, yours, viewer),
    ...hits.map((square): DrawShape => ({ orig: makeSquare(square) as Key, brush: "threat" })),
  ];
  const text = review.rating === "Book" ? `${ideaWords(before, played, viewer)} A known opening move.` : ideaWords(before, played, viewer);
  const card = startStory({ position: after, shapes }, text, moodForRating(review.rating), setsUp ? ["The move", "What it sets up"] : []);
  try {
    if (!setsUp || after.isEnd()) return;
    // what it sets up: the line from here, a few moves
    const next = await coachLine(after, 1.5);
    const line = wholeLine(after, next?.pv ?? [], 3);
    if (!next || !line.length) return;
    const pages = linePages(after, line, viewer);
    endWith(pages.texts, lineOutcome(after, line, next.score, mover, viewer));
    extendPages(card, pages.frames, pages.texts, 1);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  } finally {
    if (!card.chapterOf!.includes(1)) card.chapters = []; // (nothing it sets up after all: no heading)
    showStory(card);
  }
}

/** A good move that wasn't Stockfish's top choice. */
export function notTheBest(ply: number, review: Review | undefined): boolean {
  if (!review?.bestSan || !["Excellent", "Good"].includes(review.rating) || justAsGood(review)) return false;
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
const FILES = "abcdefgh";
const whose = (side: Color, viewer: Color | null) => (viewer === null ? `${colourName(side)}'s` : side === viewer ? "your" : "their");

/** The files beside `side`'s king that had a pawn of theirs at the start and
 *  none at the end: "The a- and b-files are now open in front of your king." */
function openedFiles(start: Chess, end: Chess, side: Color, viewer: Color | null): string {
  const king = end.board.kingOf(side);
  if (king === undefined) return "";
  const pawnOn = (position: Chess, file: number) => [...position.board.pieces(side, "pawn")].some((square) => (square & 7) === file);
  const files = [(king & 7) - 2, (king & 7) - 1, king & 7, (king & 7) + 1, (king & 7) + 2]
    .filter((file) => file >= 0 && file < 8 && pawnOn(start, file) && !pawnOn(end, file)).map((file) => FILES[file]);
  if (!files.length) return "";
  const named = files.length === 1 ? `The ${files[0]}-file is` : `The ${files.slice(0, -1).join("-, ")}- and ${files[files.length - 1]}-files are`;
  return `${named} now open in front of ${whose(side, viewer)} king.`;
}

/** A castle that puts the king where the other side's pawns can storm it
 *  (their line pushes pawns on the king's wing), above all next to one of
 *  the mover's own pushed pawns, which gives those pawns something to hit. */
function castledIntoStorm(before: Chess, played: NormalMove, after: Chess, line: NormalMove[], viewer: Color | null): string {
  if (!isCastling(before, played)) return "";
  const side = before.turn;
  const king = after.board.kingOf(side);
  if (king === undefined) return "";
  const near = (square: number) => Math.abs((square & 7) - (king & 7)) <= 2;
  const home = side === "white" ? 1 : 6;
  let position = after;
  let storms = false;
  let hook: number | undefined; // a pushed pawn of the mover's that the storm aims at
  for (const move of line) {
    const piece = position.board.get(move.from);
    position = positionAfter(position, move);
    if (piece?.role !== "pawn" || piece.color === side || !near(move.to)) continue;
    storms = true;
    // what the pawn attacks from there, or one step further on
    const ahead = move.to + (piece.color === "white" ? 8 : -8);
    const aims = attacks(piece, move.to, position.board.occupied)
      .union(ahead >= 0 && ahead < 64 ? attacks(piece, ahead, position.board.occupied) : attacks(piece, move.to, position.board.occupied));
    for (const square of aims.intersect(after.board.pieces(side, "pawn"))) {
      if (hook === undefined && square >> 3 !== home && near(square)) hook = square;
    }
  }
  if (!storms) return "";
  const yours = whose(side, viewer);
  const theirs = whose(opposite(side), viewer);
  return hook !== undefined
    ? `Castling here puts ${yours} king next to ${yours} pushed ${FILES[hook & 7]}-pawn, which ${theirs} pawns can attack to open lines towards it.`
    : `Castling here puts ${yours} king where ${theirs} pawns can storm towards it.`;
}

interface StoryPage {
  heading: string;
  frames: StepFrame[];
  texts: string[];
}

/** After a castle into their pawn storm, a short story instead of a long
 *  line, in plain words: why (the king beside a weak pawn, both circled, then
 *  their pawn on its way), your best (hitting back, and how the lines still
 *  open), and why blocking makes it worse. Null when there's no storm. */
async function stormStory(after: Chess, pv: NormalMove[], viewer: Color | null): Promise<StoryPage[] | null> {
  const side = opposite(after.turn);
  const king = after.board.kingOf(side);
  if (king === undefined) return null;
  const near = (square: number) => Math.abs((square & 7) - (king & 7)) <= 2;
  // the storm: their first pawn move on the king's side (a move or two of theirs may come first)
  let position = after;
  let storm: NormalMove | undefined;
  for (const move of pv) {
    const piece = position.board.get(move.from);
    if (piece?.role === "pawn" && piece.color !== side && near(move.to)) {
      storm = move;
      break;
    }
    position = positionAfter(position, move);
  }
  if (!storm || position.turn === side) return null;
  const stormPos = positionAfter(position, storm);
  const pawn = stormPos.board.get(storm.to)!;
  const ahead = storm.to + (pawn.color === "white" ? 8 : -8);
  const aimed = ahead >= 0 && ahead < 64 && !stormPos.board.occupied.has(ahead)
    ? [...attacks(pawn, ahead, stormPos.board.occupied).intersect(stormPos.board[side])] : [];
  const home = side === "white" ? 1 : 6;
  const hook = aimed.find((square) => after.board.get(square)?.role === "pawn" && square >> 3 !== home);
  const yours = whose(side, viewer);
  const theirs = whose(opposite(side), viewer);
  const circle = (square: number): DrawShape => ({ orig: makeSquare(square) as Key, brush: "threat" });
  const named = (square: number) => (after.board.get(square)?.role === "pawn" ? `${yours} ${makeSquare(square)} pawn` : `${yours} ${NAME[after.board.get(square)!.role]}`);
  const pages: StoryPage[] = [{
    heading: "Why",
    frames: [
      { position: after, shapes: [circle(king), ...(hook !== undefined ? [circle(hook)] : [])] },
      { position: stormPos, shapes: [...moveShapes(position, storm, viewer).slice(0, 1),
        ...(aimed.length ? [{ orig: makeSquare(storm.to) as Key, dest: makeSquare(ahead) as Key, brush: "them" } as DrawShape] : []), ...aimed.map(circle)] },
    ],
    texts: [
      hook !== undefined ? `${cap(yours)} king is now next to ${yours} weak ${makeSquare(hook)} pawn.` : `${cap(yours)} king is now where ${theirs} pawns can attack it.`,
      aimed.length ? `${cap(theirs)} ${FILES[storm.to & 7]}-pawn is coming: next it hits ${aimed.slice(0, 2).map(named).join(" and ")}.`
        : `${cap(theirs)} pawns are coming for ${yours} king.`,
    ],
  }];

  const sign = side === "white" ? 1 : -1;
  const value = (score: Score) => (score.mate !== undefined ? (score.mate * sign > 0 ? 10000 : -10000) : score.cp * sign);
  // your best: hit back; then their pawn carries on as the Why card warned
  // (it pushes to the square it was aiming at) and the best moves from there.
  // The words say only what this line shows.
  const answer = await coachLine(stormPos, 1);
  let best: { score: Score; pv: NormalMove[] } | undefined;
  if (answer?.pv.length) {
    const hit = answer.pv[0];
    const positions = [stormPos, positionAfter(stormPos, hit)];
    const line: NormalMove[] = [hit];
    let score = answer.score;
    // their pawn on: the push it was getting ready for, if it can still go
    const push = { from: storm.to, to: ahead };
    if (aimed.length && positions[1].turn !== side && positions[1].isLegal(push)) {
      line.push(push);
      positions.push(positionAfter(positions[1], push));
      // then the best two moves from there (usually a trade on that square)
      for (let i = 0; i < 2 && !positions[positions.length - 1].isEnd(); i++) {
        const step = await coachLine(positions[positions.length - 1], 0.6);
        if (!step?.pv.length) break;
        score = step.score;
        line.push(step.pv[0]);
        positions.push(positionAfter(positions[positions.length - 1], step.pv[0]));
      }
    }
    best = { score, pv: line };
    const end = positions[positions.length - 1];
    const pushed = line.length > 1;
    const opened = pushed ? openedFiles(after, end, side, viewer) : "";
    const first = narrateMove(stormPos, hit, viewer);
    // one page a move: your hit back, their pawn's push, the take, the retake
    const texts = line.map((move, i) => {
      if (i === 0) return `Best is to hit back: ${first.charAt(0).toLowerCase()}${first.slice(1)}`;
      // their pawn arrives: both of the things it hits (a pawn too, not only the pieces)
      if (i === 1 && aimed.length) return `${cap(theirs)} pawn arrives, hitting ${aimed.slice(0, 2).map(named).join(" and ")}.`;
      return narrateMove(positions[i], move, viewer);
    });
    if (pushed) {
      // where it leaves you: their small edge said plainly, and the open file for their pieces
      const edge = value(score);
      const standing = edge <= -150 ? coachVerdict(score, viewer) : edge < -15 ? `${theirs === "their" ? "they're" : `${cap(theirs).replace("'s", "")} is`} slightly better` : coachVerdict(score, viewer);
      texts[texts.length - 1] += opened
        ? ` ${opened} ${cap(theirs)} other pieces can now use it to attack, so ${standing}.`
        : ` Now ${standing}.`;
    }
    pages.push({
      heading: "Your best",
      // (each with what the move attacks circled: the push hits two things at once)
      frames: line.map((move, i) => ({ position: positions[i + 1], shapes: moveShapes(positions[i], move, viewer) })),
      texts,
    });
  }

  // blocking (or running) makes it worse: the clearest one Stockfish rates well below the best
  const top = best?.pv[0] ? makeUci(best.pv[0]) : "";
  const candidates: { move: NormalMove; kind: "king" | "pawn" }[] = [];
  for (const [from, dests] of stormPos.allDests()) {
    const piece = stormPos.board.get(from);
    if (!piece) continue;
    for (const to of dests) {
      const move = { from, to };
      if (makeUci(move) === top || stormPos.board.get(to)) continue; // (quiet moves only)
      if (piece.role === "pawn" && near(from)) candidates.push({ move, kind: "pawn" });
      else if (piece.role === "king" && Math.abs((to & 7) - (from & 7)) <= 1) candidates.push({ move, kind: "king" });
    }
  }
  candidates.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "pawn" ? -1 : 1)); // blocking first
  if (best) {
    for (const candidate of candidates.slice(0, 5)) {
      const line = await coachLine(stormPos, 0.6, [candidate.move]);
      if (!line?.pv[1] || value(best.score) - value(line.score) < 75) continue;
      const tried = positionAfter(stormPos, candidate.move);
      const answer = line.pv[1];
      pages.push({
        heading: candidate.kind === "pawn" ? "Don't block" : "Don't run",
        frames: [{ position: stormPos, shapes: [] }, { position: tried, shapes: moveShapes(stormPos, candidate.move, viewer).slice(0, 1) },
          { position: positionAfter(tried, answer), shapes: moveShapes(tried, answer, viewer).slice(0, 1) }],
        texts: [`Back to ${theirs} pawn push. What if you try to stop it?`, candidate.kind === "pawn" ? "Blocking with a pawn looks safe, but it leaves holes." : `Running with ${yours} king is too slow.`,
          `${narrateMove(tried, answer, viewer)} Now ${coachVerdict(line.score, viewer)}.`],
      });
      break;
    }
  }
  return pages;
}

export function linePages(start: Chess, line: NormalMove[], viewer: Color | null, previous?: NormalMove): { frames: StepFrame[]; texts: string[] } {
  const story = talkLine(start, line, viewer);
  const frames = line.map((move, i) => ({ position: story.positions[i + 1], shapes: moveShapes(story.positions[i], move, viewer) }));
  // a piece the move before attacked, stepping away without taking: "This forces your rook to move out of the way."
  line.forEach((move, i) => {
    const last = i ? line[i - 1] : previous;
    const position = story.positions[i];
    const piece = position.board.get(move.from);
    const chaser = last && position.board.get(last.to);
    if (!last || !piece || !chaser || chaser.color === piece.color || position.board.get(move.to) || piece.role === "pawn" || piece.role === "king") return;
    if (!attacks(chaser, last.to, position.board.occupied).has(move.from) || positionAfter(position, move).isCheck()) return;
    story.texts[i] = `This forces ${whose(piece.color, viewer)} ${NAME[piece.role]} to move out of the way.`;
  });
  return { frames, texts: story.texts };
}

/** More pages for a card that is still being put together, or still open. */
export function extendPages(card: Stepper | null, frames: StepFrame[], texts: string[], chapter: number) {
  if (!card || (stepper !== card && pending?.card !== card) || !frames.length) return;
  card.frames!.push(...frames);
  card.texts.push(...texts);
  card.chapterOf!.push(...frames.map(() => chapter));
  if (stepper === card) refresh();
}

/** A card still being worked out, and the move it was asked about: it opens
 *  only once every page is ready, and not at all if you've moved on. */
let pending: { card: Stepper; ply: number } | null = null;

/** A card of pages in parts ("Why", "What it allows", ...). It opens once
 *  `showStory` says all its pages are in; meanwhile "Tell me more" pulses. */
export function startStory(first: StepFrame, text: string, mood: Mood, chapters: string[]): Stepper {
  const card: Stepper = { positions: [], moves: [], texts: [text], step: 1, mood, frames: [first], chapters, chapterOf: [0] };
  if (dry) {
    card.dry = true;
    return card;
  }
  pending = { card, ply: currentPly() };
  document.body.classList.add("story-loading");
  return card;
}

/** Every page is in: open the card (if it's still the one asked for). */
export function showStory(card: Stepper) {
  if (card.dry || pending?.card !== card) return;
  const asked = pending.ply;
  pending = null;
  document.body.classList.remove("story-loading");
  if (currentPly() !== asked) return;
  closeOverlay(false);
  set.stepper(card);
  refresh();
}

// Working a card out ahead: while you read the bubble on a slip, the coach
// runs its searches, so the card opens at once when you tap. Only the latest
// one carries on (moving to another move, or opening a card, stops it).
let dry = false;
let ahead = 0; // the latest card being worked out ahead
let aheadOf = "";

/** Work out the card for a slip ahead, without showing it. */
export function prepareSlip(ply: number, review: Review) {
  const key = `${fenOf(game.positionAt(ply - 1))} ${makeUci(game.moves[ply - 1].move)} ${review.rating}`;
  const key_ = review.rating === "Great" || (WORTH_SHOWING.has(review.rating) && !!review.bestSan);
  if (key === aheadOf || !key_) return;
  aheadOf = key;
  const token = ++ahead;
  dry = true;
  try {
    void (review.rating === "Great" ? explainGreat(ply, token) : explainSlip(ply, review, token)).catch(() => {});
  } finally {
    dry = false; // (the card is made before its first search, so this covers it)
  }
}

/** A slip, told in as many pages as it needs. A simple take (they can just
 *  take something, and nothing takes back) is one page: the take, and why
 *  it's free. A real tactic plays out its moves. Then, for your own slip (or
 *  a big one of theirs), the better move - and its line only when the slip
 *  wasn't a simple one. The card never repeats what the bubble just said. */
export async function explainSlip(ply: number, review: Review, token?: number) {
  // (shown for real: a card being worked out ahead stops, its searches so far kept)
  if (token === undefined) {
    ahead++;
    aheadOf = "";
  }
  const stale = () => token !== undefined && token !== ahead;
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const mine = viewer === null || mover === viewer;
  const theirSlip = !mine && viewer !== null;
  if (theirSlip && (review.rating === "Miss" || review.rating === "Missed Win")) return void explainEscape(ply, review, stale);
  // their slip that gives you nothing concrete: what they missed, not a chance for you
  if (theirSlip && !dangerAfter(review, before, after, analyser.evals.get(fenOf(before)), analyser.evals.get(fenOf(after)), !!openingInfo()[ply - 1]?.book, viewer)) {
    return void explainEscape(ply, review, stale);
  }
  // taken back with the wrong piece, and nothing lost by it: straight to the better piece, and why
  const bestMove = parseSan(before, review.bestSan!) as NormalMove | undefined;
  if (!theirSlip && bestMove && recaptureReason(before, played as NormalMove, bestMove)
    && !dangerAfter(review, before, after, analyser.evals.get(fenOf(before)), analyser.evals.get(fenOf(after)), !!openingInfo()[ply - 1]?.book, viewer)) {
    return void showBestLine(ply, true);
  }
  const reply = after.isEnd() ? undefined : analyser.evals.get(fenOf(after))?.best;
  const shapes = moveShapes(before, played, viewer).slice(0, 1);
  const card = startStory({ position: after, shapes }, "", moodForRating(review.rating), []); // (filled in below, shown once ready)
  // Yours: at the end, a go at finding the better move yourself
  if (!theirSlip) card.extra = { ico: "target", label: "Find it yourself", kind: "accent", labelled: true, run: () => findItYourself(ply) };
  if (!card.dry) moveSound(makeSan(before, played), before.turn);
  const frames: StepFrame[] = [];
  const texts: string[] = [];
  const chapterOf: number[] = [];
  const chapters: string[] = [];
  const add = (heading: string, more: StepFrame[], words: string[]) => {
    if (!chapters.includes(heading)) chapters.push(heading);
    frames.push(...more);
    texts.push(...words);
    chapterOf.push(...more.map(() => chapters.indexOf(heading)));
  };
  let simple = false;
  let storyPages: StoryPage[] | null = null; // a king-safety story, told instead of the line
  // A threat they already had (often made by their last move), not dealt with:
  // the threat first, on the board before the move, then the move that ignores it
  const lastMove = ply >= 2 ? game.moves[ply - 2].move as NormalMove : undefined;
  const threat = ignoredThreat(before, after, reply, lastMove);
  if (threat) {
    const yours = whose(mover, viewer);
    const theirs = whose(opposite(mover), viewer);
    const what = threat.victim === "pawn" ? `${yours} ${makeSquare(threat.move.to)} pawn` : `${yours} ${NAME[threat.victim]}`;
    const taker = `${theirs} ${NAME[threat.taker]}`;
    const circle: DrawShape = { orig: makeSquare(threat.move.to) as Key, brush: "threat" };
    const arrow: DrawShape = { orig: makeSquare(threat.move.from) as Key, dest: makeSquare(threat.move.to) as Key, brush: "threat" };
    const lastWords = viewer === null ? `${colourName(opposite(mover))}'s last move` : mine ? "Their last move" : "Your last move";
    add("The threat", [{ position: before, shapes: [arrow, circle], last: threat.fresh ? lastMove : undefined }],
      [threat.fresh ? `${lastWords} made a threat: ${taker} can take ${what}.` : `${cap(taker)} was attacking ${what}.`]);
    const didnt = viewer === null ? `${colourName(mover)}'s move doesn't deal with it.` : mine ? "Your move doesn't deal with it." : "Their move doesn't deal with it.";
    add("The threat", [{ position: after, shapes }], [mine && viewer !== null ? `${didnt} Before every move, ask: what does their last move want?` : didnt]);
  }
  try {
    if (reply) {
      // their best reply and the line it starts, each move the best in its
      // position (after castling, just far enough to find their pawn storm)
      const castled = isCastling(before, played);
      const concrete = dangerAfter(review, before, after, analyser.evals.get(fenOf(before)), analyser.evals.get(fenOf(after)), !!openingInfo()[ply - 1]?.book, viewer);
      const punish = await bestLine(after, castled ? 4 : concrete ? 6 : 3, 0.6, stale);
      const pv = punish?.pv.length ? punish.pv : [reply];
      const victim = after.board.get(reply.to);
      const took = positionAfter(after, reply);
      const next = pv[1] ? normalizeMove(took, pv[1]) as NormalMove : undefined;
      // a simple take: it takes something of the mover's, and the answer neither takes back nor checks
      simple = !!victim && victim.color === mover && !(next && (took.board.get(next.to) || positionAfter(took, next).isCheck()));
      if (simple) {
        add("Why", [{ position: took, shapes: moveShapes(after, reply, viewer).slice(0, 1) }], [freeTakeWords(after, reply, mover, viewer)]);
      } else if (castled && (storyPages = await stormStory(after, pv, viewer))) {
        // a castle into their pawns: the idea, the tempting defences that fail, the answer
        for (const page of storyPages) add(page.heading, page.frames, page.texts);
      } else {
        // a real tactic: its moves, played on until the material is won
        const danger = dangerAfter(review, before, after, analyser.evals.get(fenOf(before)), analyser.evals.get(fenOf(after)), !!openingInfo()[ply - 1]?.book, viewer);
        const promised = danger ? promisedGain(danger.text) : 0;
        const won = promised ? lineToGain(after, pv, opposite(mover), promised) : undefined;
        const plain = wholeLine(after, pv, castled ? 7 : 3);
        const line = won && won.length > plain.length ? won : plain;
        const pages = linePages(after, line, viewer);
        // King safety: the lines it opens in front of the mover's king
        const end = line.reduce((position, move) => positionAfter(position, move), after);
        const opened = openedFiles(after, end, mover, viewer);
        if (opened && pages.texts.length) pages.texts[pages.texts.length - 1] += ` ${opened}`;
        if (punish) endWith(pages.texts, lineOutcome(after, line, punish.score, opposite(mover), viewer));
        // a castle into their pawns: said first, as what the slip was about
        const storm = castledIntoStorm(before, played, after, line, viewer);
        if (storm) add("Why", [{ position: after, shapes }], [storm]);
        // a quiet slip: the weakness it made, circled, and why it matters; then how they go after it
        // (only when it's the bubble's story: when the bubble named something else, like a
        // piece their reply attacks, that's what the card is about)
        const said = verdict(review, before, after, analyser.evals.get(fenOf(after)), listener(), ply, watching(), analyser.evals.get(fenOf(before)));
        const found = !storm && !threat && !danger ? quietReason(review, before, after) : undefined;
        const reason = found && reasonWords(found, mover, watching() ? null : listener()) === said ? found : undefined;
        if (reason) {
          const marks: DrawShape[] = reason.squares.map((square) => ({ orig: makeSquare(square) as Key, brush: "threat" }));
          if (reason.kind === "open-file" && reason.file !== undefined) {
            const ends = mover === "white" ? [reason.file, 56 + reason.file] : [56 + reason.file, reason.file];
            marks.push({ orig: makeSquare(ends[1]) as Key, dest: makeSquare(ends[0]) as Key, brush: "threat" });
          }
          // (the bubble has just said the reason: the card says why it matters)
          add("Why", [{ position: after, shapes: [...shapes, ...marks] }], [REASON_LESSON[reason.kind]]);
        }
        // (their line only when it goes after the weakness: a piece onto the hole or the
        // open file, or hitting the weak pawn; otherwise it would only be noise)
        const usesIt = () => {
          // (a piece reason is the lesson itself; only an early queen is shown being chased)
          if (["king-centre", "same-piece", "blocks-pawn", "rim", "passive"].includes(reason!.kind)) return false;
          let position = after;
          for (const move of line) {
            const piece = position.board.get(move.from);
            position = positionAfter(position, move);
            if (!piece || piece.color === mover) continue;
            if (reason!.kind === "early-queen") {
              const queen = [...position.board.pieces(mover, "queen")][0];
              if (queen !== undefined && attacks(piece, move.to, position.board.occupied).has(queen)) return true;
              continue;
            }
            if (reason!.kind === "open-file" ? (move.to & 7) === reason!.file && ["rook", "queen"].includes(piece.role)
              : reason!.squares.includes(move.to) || reason!.squares.some((square) => attacks(piece, move.to, position.board.occupied).has(square))) return true;
          }
          return false;
        };
        if (!reason || usesIt()) add("Why", pages.frames, pages.texts);
      }
    }
    if (!frames.length) add("Why", [{ position: after, shapes }], ["It's a small slip."]);
    if (storyPages) return; // (a king-safety story says it all)
    // With the fundamentals: the habit that would have saved it
    const basics = fundamentalsOn() && !theirSlip ? fundamentalEvents(reviews()).find((event) => event.ply === ply) : undefined;
    const habit = basics && !threat && HABITS[basics.kind];
    if (habit) add("The habit", [{ position: before, shapes: [] }], [habit]);
    // The better move: yours always; theirs only for a big slip that wasn't a simple take
    const best = parseSan(before, review.bestSan!) as NormalMove | undefined;
    if (!best || (theirSlip && (simple || review.rating !== "Blunder"))) return;
    const afterBest = positionAfter(before, best);
    if (basics) {
      // the simplest safe idea, not the engine's best line
      const loose = basics.kind === "hung" && basics.role ? `Keep your ${basics.role} safe: move it away, or defend it. ` : "";
      add("The safe choice", [{ position: afterBest, shapes: movePicture(before, afterBest, best, mine, viewer), last: best, from: before }],
        [loose + whyBetter(before, after, best, reply, viewer)]);
      return;
    }
    const heading = viewer === null ? "The better move" : theirSlip ? "Their better option" : "Your better option";
    // (straight to the better move, played in: its squares lit, and what it's for in one line)
    add(heading, [{ position: afterBest, shapes: movePicture(before, afterBest, best, mine, viewer), last: best, from: before }], [betterWords(before, after, best, reply, viewer, mine, analyser.evals.get(fenOf(before)))]);
    if (simple || storyPages) return; // (nothing more to see after a simple take, or a king-safety story)
    if (stopsPawn(before, best, viewer)) return; // (stopping their pawn is the point: the rest is ordinary play)
    // How it goes on: the better move's line, from their reply
    // (its line: the better move, then the best move in each position in turn)
    const then = await bestLine(afterBest, 3, 0.5, stale);
    const better = then && { score: then.score, pv: [best, ...then.pv] };
    const line = wholeLine(before, better?.pv.length ? better.pv : [best], 3);
    if (line.length < 2) return;
    // the next idea when it's a pawn push or two: what you'd play with a free move (whatever
    // they do, it's the plan), drawn as arrows, not played out
    const plan = afterBest.isCheck() ? undefined : await bestLine(passMove(afterBest), 7, 0.5, stale);
    // a piece on its way somewhere: its route drawn, and why it's going there
    const route = plan ? routePage(afterBest, best, plan.pv, mover, viewer) : undefined;
    if (route) {
      add("The plan", [route.frame], [route.text]);
      return;
    }
    const idea = plan ? nextIdea(afterBest, plan.pv.slice(0, 3), mover, viewer) : undefined;
    if (idea && better) {
      add("The idea", [idea.frame], [idea.text]);
      return;
    }
    const pages = linePages(afterBest, line.slice(1), viewer);
    if (better) endWith(pages.texts, lineOutcome(before, line, better.score, mover, viewer));
    add("How it goes on", pages.frames, pages.texts);
  } catch (error) {
    if (!card.dry) {
      set.errorText(`Something went wrong: ${error}`);
      refresh();
    }
  } finally {
    if (!frames.length) add("Why", [{ position: after, shapes }], ["It's a small slip."]);
    card.frames = frames;
    card.texts = texts;
    card.chapterOf = chapterOf;
    card.chapters = chapters.length > 1 ? chapters : []; // (one part needs no heading)
    showStory(card);
  }
}

/** Why a take is free, from the viewer's side: nothing guards it (or taking
 *  still wins), and no strong answer. (What's taken, the bubble has said.) */
function freeTakeWords(after: Chess, take: NormalMove, mover: Color, viewer: Color | null): string {
  const guarded = after.kingAttackers(take.to, mover, after.board.occupied).nonEmpty();
  const taker = opposite(mover);
  if (viewer === null) {
    return `${guarded ? "It's guarded, but taking still wins material" : `Nothing guards it, so ${colourName(taker)} can just take it`}, and ${colourName(mover)} has no good way to hit back.`;
  }
  if (viewer === taker) return guarded ? "It's guarded, but taking still wins material, and they've no good way to hit back." : "Nothing guards it, so it's yours, easy. And they've no good way to hit back.";
  return `${guarded ? "It was guarded, but taking still won them material" : "Nothing guarded it, so they could just take it"}, and you'd have no good way to hit back.`;
}

/** The plan after the better move (`pv`: the best line if they passed), when its next steps are pawn pushes: the
 *  board right after the better move (whatever they reply: it's a plan),
 *  with an arrow for each push and what it hits circled, and the idea in
 *  words ("Your next idea: your a-pawn to a4,
 *  which stops their b-pawn coming to b5 to chase your bishop."). */
function nextIdea(start: Chess, pv: NormalMove[], side: Color, viewer: Color | null): { frame: StepFrame; text: string } | undefined {
  if (!pv.length || start.isEnd()) return undefined;
  // (the plan: your moves as if they passed, starting with yours)
  let position = passMove(start);
  const shapes: DrawShape[] = [];
  const squares: string[] = []; // where the pawns go
  const aims: string[] = []; // what they go for
  let stop: string | undefined;
  for (let i = 0; i < Math.min(pv.length, 3); i++) {
    const move = pv[i];
    const piece = position.board.get(move.from);
    if (piece?.color === side) {
      if (piece.role !== "pawn" || position.board.get(move.to)) break; // (the plan stops at a piece move or a take)
      const next = positionAfter(position, move);
      stop ??= stopsPawn(position, move, viewer);
      const hits = [...attacks(piece, move.to, next.board.occupied).intersect(next.board[opposite(side)])].filter((square) => next.board.get(square)!.role !== "king");
      shapes.push({ orig: makeSquare(move.from) as Key, dest: makeSquare(move.to) as Key, brush: "you" });
      for (const square of hits) shapes.push({ orig: makeSquare(square) as Key, brush: "threat" });
      squares.push(makeSquare(move.to));
      for (const square of hits) {
        const role = NAME[next.board.get(square)!.role];
        if (!aims.includes(role)) aims.push(role);
      }
    }
    position = positionAfter(position, move);
  }
  if (!squares.length) return undefined;
  // said simply: "You have c3 and d4 ideas to attack their pawn and bishop."
  const who = viewer === null ? `${colourName(side)} has` : side === viewer ? "You have" : "They have";
  const an = (square: string) => (/^[aefh]/.test(square) ? "an" : "a");
  const ideas = squares.length === 1 ? `${an(squares[0])} ${squares[0]} idea` : `${squares.slice(0, -1).join(", ")} and ${squares[squares.length - 1]} ideas`;
  const their = whose(opposite(side), viewer);
  const centre = squares.some((square) => /^[de][45]$/.test(square));
  const why = stop ? stop.replace(/^stops (\S+) (\S+) coming to \S+ to chase/, "to stop $1 $2 chasing")
    : aims.length ? `to attack ${their} ${aims.slice(0, 2).join(" and ")}` : centre ? "to take the centre" : "to gain space";
  return { frame: { position: start, shapes }, text: `${who} ${ideas} ${why}.` };
}

/** A piece on its way somewhere (see plans.ts): its route drawn as arrows and
 *  the square circled, with why it goes there. */
function routePage(start: Chess, best: NormalMove, pv: NormalMove[], side: Color, viewer: Color | null): { frame: StepFrame; text: string } | undefined {
  const route = pieceRoute(start, best, pv, side, viewer);
  if (!route) return undefined;
  const { stops } = route;
  const shapes: DrawShape[] = [];
  for (let i = 1; i < stops.length - 1; i++) shapes.push({ orig: makeSquare(stops[i]) as Key, dest: makeSquare(stops[i + 1]) as Key, brush: "you" });
  shapes.push({ orig: makeSquare(stops[stops.length - 1]) as Key, brush: "best" });
  return { frame: { position: start, shapes }, text: route.text };
}

/** A chance they missed against you: what they could have played, shown
 *  played, and how it would have gone on. */
export async function explainEscape(ply: number, review: Review, stale?: () => boolean) {
  const before = game.positionAt(ply - 1);
  const best = parseSan(before, review.bestSan!) as NormalMove | undefined;
  if (!best) return;
  const mover = game.moverOf(ply);
  const viewer = listener();
  const afterBest = positionAfter(before, best);
  // straight to the move they missed, played in (its squares lit)
  // (a piece that would have jumped into a hole in front of the king: said so, the hole circled)
  const piece = before.board.get(best.from);
  const hole = piece && piece.role !== "pawn" && isKingHole(before, opposite(mover), best.to);
  const hits = hole ? targetsOf(afterBest, best.to).map((square) => `${whose(opposite(mover), viewer)} ${NAME[afterBest.board.get(square)!.role]}`) : [];
  const words = hole
    ? `${cap(whose(mover, viewer))} ${NAME[piece.role]} could jump into the hole on ${makeSquare(best.to)}, right in front of ${whose(opposite(mover), viewer)} king${hits.length ? `, hitting ${hits[0]}` : ""}.`
    : ideaWords(before, best, viewer);
  const shapes = movePicture(before, afterBest, best, false, viewer);
  if (hole) shapes.push({ orig: makeSquare(best.to) as Key, brush: "threat" });
  const card = startStory({ position: afterBest, shapes, last: best }, words, moodForRating(review.rating), ["What they missed", "How it would have gone"]);
  try {
    const then = await bestLine(afterBest, 2, 0.6, stale);
    const line = then && { score: then.score, pv: [best, ...then.pv] };
    const moves = wholeLine(before, line?.pv.length ? line.pv : [best], 3);
    if (moves.length < 2) return;
    const pages = linePages(afterBest, moves.slice(1), viewer, best);
    if (line) endWith(pages.texts, lineOutcome(before, moves, line.score, mover, viewer));
    extendPages(card, pages.frames, pages.texts, 1);
  } catch (error) {
    if (!card.dry) {
      set.errorText(`Something went wrong: ${error}`);
      refresh();
    }
  } finally {
    showStory(card);
  }
}

/** The material a warning promises: a pawn, a piece, the queen (0 for mate,
 *  the centre or a vague cost, where the plain line says it). */
function promisedGain(text: string): number {
  if (/queen/.test(text)) return 9;
  if (/pawn/.test(text)) return 1;
  if (/piece|rook|bishop|knight|can be taken|can take their/.test(text)) return 3;
  return 0;
}

/** A line played on until `side` is `amount` of material up on the start and
 *  the trade is over (the next move takes nothing); undefined if it never is. */
export function lineToGain(start: Chess, pv: NormalMove[], side: Color, amount: number): NormalMove[] | undefined {
  let walk = start;
  const line: NormalMove[] = [];
  for (const move of pv.slice(0, 12)) {
    line.push(move);
    walk = positionAfter(walk, move);
    const next = pv[line.length];
    const settled = !next || !walk.board.get(next.to);
    if (settled && materialFor(walk, side) - materialFor(start, side) >= amount) return line;
  }
  return undefined;
}

/** Find it yourself: back to just before the move, to play the better one
 *  (a what-if move on the board, rated like any other). */
export function findItYourself(ply: number) {
  closeStepper();
  findingAt = ply;
  goTo(ply - 1);
}

let findingAt: number | null = null; // the move being found again, while you look for it

/** See the best move: for a good move that wasn't the top one, a card that
 *  goes straight to the better move, played in from the position before, and
 *  why it's better. Only when there's no reason to give, how it goes on. */
export async function showBestLine(ply: number, slip = false) {
  const review = ratingsOn() ? reviews()[ply - 1] : undefined;
  if (!review?.bestSan) return;
  const before = game.positionAt(ply - 1);
  const best = parseSan(before, review.bestSan) as NormalMove | undefined;
  if (!best) return;
  const played = game.moves[ply - 1].move as NormalMove;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const mine = viewer === null || mover === viewer;
  const after = positionAfter(before, played);
  const afterBest = positionAfter(before, best);
  // how the two moves compare (see betterCard): what yours allowed, then the better move; or the better move alone
  const afterEval = analyser.evals.get(fenOf(after));
  const { tier, pages } = betterCard(before, played, best, analyser.evals.get(fenOf(before)), afterEval, viewer);
  const reply = afterEval?.best;
  const frameFor = (page: BetterPage): StepFrame => page.show === "reply" && reply
    ? { position: positionAfter(after, reply), shapes: moveShapes(after, reply, viewer), last: reply, from: after }
    : { position: afterBest, shapes: movePicture(before, afterBest, best, mine, viewer), last: best, from: before };
  const card = startStory(frameFor(pages[0]), pages[0].text, moodForRating(review.rating), pages.length > 1 ? ["What it allowed", "The better move"] : []);
  if (pages.length > 1) extendPages(card, pages.slice(1).map(frameFor), pages.slice(1).map((page) => page.text), 1);
  // a slip of yours: at the end, a go at finding the better move yourself
  if (slip && mine) card.extra = { ico: "target", label: "Find it yourself", kind: "accent", labelled: true, run: () => findItYourself(ply) };
  try {
    // (with the comparison made - what yours allowed, the better order, the right piece to take back with - no line to follow)
    if (["allowed", "order", "recapture"].includes(tier)) return;
    const line = await coachLine(before, 1.5, [best]);
    const moves = wholeLine(before, line?.pv.length ? line.pv : [best], 3);
    if (moves.length < 2) return;
    const pages = linePages(afterBest, moves.slice(1), viewer, best);
    if (line) endWith(pages.texts, lineOutcome(before, moves, line.score, mover, viewer));
    card.chapters = ["The better move", "How it goes on"];
    extendPages(card, pages.frames, pages.texts, 1);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  } finally {
    showStory(card);
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

/** "In the end, ..." on a line's last page (not when that page has just said checkmate). */
export function endWith(texts: string[], outcome: string) {
  const last = texts.length - 1;
  if (last < 0 || (outcome.includes("checkmate") && /checkmate/i.test(texts[last]))) return;
  texts[last] += ` In the end, ${outcome}`;
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
  if (gain >= 1) {
    const who = viewer === null ? colourName(side) : you ? "you" : "they";
    return `${who} ${viewer === null ? "comes" : "come"} out ${gain >= 2 ? "two pawns" : "a pawn"} up.`;
  }
  return `${coachVerdict(score, viewer)}.`;
}

/** Where a position stands, as a coach says it (not an engine's scale), from
 *  your side when you've picked one: "it's level", "you're a little better",
 *  "they're winning", "White can force checkmate". */
export function coachVerdict(score: Score, viewer: Color | null): string {
  const leader = scoreLeader(score);
  if (!leader) return "it's level";
  const side: Color = leader === "White" ? "white" : "black";
  const who = viewer === null ? leader : side === viewer ? "you" : "they";
  const be = viewer === null ? `${leader} is` : side === viewer ? "you're" : "they're";
  if (score.mate !== undefined) return `${who} can force checkmate`;
  const size = Math.abs(pawns(score.cp));
  if (size < 1) return `${be} a little better`;
  if (size < 2) return `${be} clearly better`;
  if (size < 4) return `${be} on top, close to winning`;
  return `${be} winning`;
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
  let first = `${intro} Bold, and it holds up.`;
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
      const texts = story.texts.map((text, i) => i === 0 ? `Say ${viewer === null ? colourName(opposite(mover)) : "they"} take${viewer === null ? "s" : ""} it. ${text}` : text);
      endWith(texts, lineOutcome(after, line, taken.score, mover, viewer));
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
    endWith(texts, lineOutcome(after, line, best.score, mover, viewer));
    extendStepper(card, story.positions.slice(1), line, texts);
  } catch (error) {
    set.errorText(`Something went wrong: ${error}`);
    refresh();
  }
}

/** Tell me more about a great move: it was the only good one, and the board
 *  plays out the opportunity it creates. The card opens at once. */
/** The key move (the only good one): why it, then why not something else (the
 *  next best move, and the answer that punishes it), then how it goes on. */
export async function explainGreat(ply: number, token?: number) {
  if (token === undefined) {
    ahead++;
    aheadOf = "";
  }
  const stale = () => token !== undefined && token !== ahead;
  const before = game.positionAt(ply - 1);
  const after = game.positionAt(ply);
  const played = game.moves[ply - 1].move as NormalMove;
  const mover = game.moverOf(ply);
  const viewer: Color | null = watching() ? null : listener() ?? mover;
  const why = whyMove(before, played, viewer);
  // why it had to be this move: the piece was under attack, or what it does
  const piece = before.board.get(played.from)!;
  const attacked = before.kingAttackers(played.from, opposite(mover), before.board.occupied).nonEmpty();
  const reason = attacked && piece.role !== "king" ? `It gets ${whoseOf(mover, viewer)} ${NAME[piece.role]} out of danger.` : why && why !== "it's a useful waiting move" ? `${cap(why)}.` : "";
  // (the board shows the move: the words say why it was the one)
  const intro = `The key move, and the only good one. ${reason}`.trim();
  const card = startStory({ position: after, shapes: moveShapes(before, played, viewer).slice(0, 1), last: played }, intro, "happy", []);
  if (!card.dry) moveSound(makeSan(before, played), before.turn);
  const frames: StepFrame[] = [...card.frames!];
  const texts: string[] = [...card.texts];
  const chapterOf: number[] = [0];
  const chapters = ["The key move"];
  const add = (heading: string, more: StepFrame[], words: string[]) => {
    if (!chapters.includes(heading)) chapters.push(heading);
    frames.push(...more);
    texts.push(...words);
    chapterOf.push(...more.map(() => chapters.indexOf(heading)));
  };
  try {
    // Why not something else: the next best move (much worse, or it wouldn't be the key move), and its answer
    const known = analyser.evals.get(fenOf(before));
    const alt = known?.second && makeUci(known.second) !== makeUci(played) ? known.second : undefined;
    if (alt && !stale()) {
      const afterAlt = positionAfter(before, alt);
      const answer = afterAlt.isEnd() ? undefined : await coachLine(afterAlt, 0.8);
      const reply = answer?.pv[0];
      if (answer && reply) {
        add("Why not something else", [{ position: afterAlt, shapes: moveShapes(before, alt, viewer).slice(0, 1), last: alt }],
          [`Anything else falls short. For example, ${lowerFirst(narrateMove(before, alt, viewer))}`]);
        add("Why not something else", [{ position: positionAfter(afterAlt, reply), shapes: moveShapes(afterAlt, reply, viewer).slice(0, 1) }],
          [`${narrateMove(afterAlt, reply, viewer)} Now ${coachVerdict(answer.score, viewer)}.`]);
      }
    }
    // How it goes on after the key move (each move the best in its position)
    const then = await bestLine(after, 2, 0.6, stale);
    const line = wholeLine(after, then?.pv ?? [], 2);
    if (then && line.length) {
      const pages = linePages(after, line, viewer, played);
      // still worse after the only move: it keeps you in the game
      const behind = winningChance(then.score, mover) < 45;
      pages.texts[pages.texts.length - 1] += behind
        ? ` ${cap(verdictWords(then.score))}, but this move keeps ${viewer === null ? colourName(mover) : mover === viewer ? "you" : "them"} in the game.`
        : ` In the end, ${lineOutcome(after, line, then.score, mover, viewer)}`;
      add("How it goes on", pages.frames, pages.texts);
    }
  } catch (error) {
    if (!card.dry) {
      set.errorText(`Something went wrong: ${error}`);
      refresh();
    }
  } finally {
    card.frames = frames;
    card.texts = texts;
    card.chapterOf = chapterOf;
    card.chapters = chapters.length > 1 ? chapters : [];
    showStory(card);
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
  dry?: boolean; // worked out ahead (to have its searches ready), never shown
}

export interface StepFrame {
  position: Chess;
  shapes: DrawShape[];
  odds?: LikelyMove[]; // their likely moves, with chances
  others?: number; // the chance of anything else
  last?: NormalMove; // the move to highlight, when it isn't the one from the page before
  from?: Chess; // shown first, then the move to this page is played on the board
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
  // the part of the story this page is about ("Why", "What it allows", ...): only that one
  const chapters = $("step-chapters");
  const heading = stepper.chapters?.[stepper.chapterOf?.[stepper.step - 1] ?? -1];
  chapters.hidden = !heading;
  chapters.textContent = heading ?? "";
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
  setBusy(true, "Let me find the best plan…");
  try {
    const lines = await coachAnalysis.analyse(position, 1.5, 5);
    const found = styleAlternative(position, lines, style);
    let positions: Chess[];
    let moves: NormalMove[];
    let texts: string[];
    if (known) {
      moves = known.moves;
      texts = [...known.texts];
      // (the opening's own words for its plan)
      positions = [position];
      for (const move of moves) positions.push(positionAfter(positions[positions.length - 1], move));
    } else {
      const plan = await planAhead(coachAnalysis, position);
      moves = plan.steps.slice(0, 4).map((step) => step.move);
      positions = plan.positions.slice(0, moves.length + 1);
      // spoken to the side to move, unless you've picked a side
      const viewer = listener() ?? position.turn;
      // the first move says what it's for; the rest play out; the last says where it leaves you
      texts = moves.map((move, i) => (i === 0 ? moveInWords : narrateMove)(positions[i], move, viewer));
      if (moves.length && isSacrifice(positions[0], moves[0], positions[1])) texts[0] = `A masterstroke! ${narrateMove(positions[0], moves[0], viewer)}`;
      if (moves.length > 1) endWith(texts, `${coachVerdict(plan.score, listener())}.`);
    }
    setBusy(false);
    // (the plan's own first move isn't an alternative to itself)
    const alternative = found && !(moves[0] && makeUci(found.move) === makeUci(moves[0])) ? found : undefined;
    const extra: CoachButton | undefined = alternative
      ? { ico: style === "attacking" ? "hazard" : "bulb", label: style === "attacking" ? "A sharper way" : "A more positional way",
          kind: "accent", labelled: true, run: () => showStyleAlternative(position, alternative.pv, style) }
      : reviewing ? undefined : QUIZ; // (the threat quiz is for a game going on, not a review)
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
    ? `${cap(moveInWords(position, line[0], viewer))} Nearly as strong, with more pressure on their king.`
    : `${cap(moveInWords(position, line[0], viewer))} Nearly as strong, and solid.`;
  startStepper(story.positions, line, texts, "talk", reviewing ? undefined : QUIZ);
}

// -- The move strip (phones) and the views (board, statistics, history) --------


export function drawMoveStrip(list: (Review | undefined)[], info: OpeningInfo[]) {
  const strip = $("move-strip");
  const current = currentPly();
  const turning = turningPlies();
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
    if (review && !info[i]?.book) button.classList.add(ratingClass(review.rating), mark ? "notable" : "graded");
    if (turning.includes(ply)) button.classList.add("turning"); // underlined while going through them
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
  // (on a computer the summary sits beside the board, so the board stays)
  const besideBoard = sidebarOn() && currentView === "stats";
  for (const panel of document.querySelectorAll<HTMLElement>("[data-view-panel]")) {
    panel.hidden = panel.dataset.viewPanel !== currentView && !(besideBoard && panel.classList.contains("board-area"));
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

let ratingInfo = false; // the level's explanation, shown with its i
let statsDetails = false; // the statistics beyond overall accuracy (Details)

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
  const levels = playedLike(start, scores);
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
    bar.append(element("span", "", "Checking every move…"), track);
    box.append(bar);
  }

  // Both players side by side (you first when it's your game)
  const first: Color = listener() ?? "white";
  const sides: Color[] = [first, opposite(first)];
  // Each column: who it is ("You" and "Opponent" in your game, the colours in
  // someone else's), with the full name under it
  const mine = watching() ? null : listener();
  const name = (colour: Color) => {
    const cell = element("span", "stats-cell stats-name");
    const who = element("b", "", mine ? (colour === mine ? "You" : "Opponent") : colour === "white" ? "White" : "Black");
    who.prepend(element("span", `side-dot ${colour}`));
    cell.append(who, element("small", "", barName(colour)));
    cell.title = barName(colour);
    return cell;
  };

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
      cell.textContent = value.toFixed(1); // (one decimal: 96.3)
      cell.classList.add(ratingClass(accuracyRating(value)));
    }
    return cell;
  };
  // The head: deep review (top left, beside the players), then the overall accuracy;
  // Details opens the rest
  row(reviewing ? depthButton(pending) : "", sides.map((c) => name(c)), "head");
  row("Accuracy", sides.map((c) => percent(overall[c], true)));
  if (statsDetails) {
    row("Opening", sides.map((c) => percent(phases.opening[c])));
    row("Middlegame", sides.map((c) => percent(phases.middlegame[c])));
    row("Endgame", sides.map((c) => percent(phases.endgame[c])));
    const ratingLabel = element("span", "stats-label", "Played like");
    const info = element("button", "stats-tag stats-info", "ⓘ");
    info.setAttribute("aria-label", "About this");
    info.type = "button";
    info.setAttribute("aria-expanded", String(ratingInfo));
    info.addEventListener("click", () => {
      ratingInfo = !ratingInfo;
      drawStats();
    });
    ratingLabel.append(info);
    row(ratingLabel, sides.map((c) => {
      const cell = element("span", "stats-cell");
      cell.append(element("span", "rating-block", pending ? "??" : levels[c] ?? "-"));
      return cell;
    }), "rating-row");
    if (ratingInfo) {
      const note = element("p", "stats-note stats-info-note",
        "From how much each side gave away, move by move: Beginner, Improver, Club player, Strong club or Expert. " +
        "One game is a small sample, so expect it to vary.");
      table.append(note);
    }
    // At beginner levels: what decides the game there, counted for each side
    if (fundamentalsOn()) {
      const counts = fundamentalCounts(list);
      const plain = (cells: string[]) => cells.map((cell) => element("span", "stats-cell", pending ? "??" : cell));
      row("Pieces left loose", plain(sides.map((c) => String(counts[c].hung))));
      row("Free pieces taken", plain(sides.map((c) => `${counts[c].took} of ${counts[c].took + counts[c].left}`)));
      row("Checkmates missed", plain(sides.map((c) => String(counts[c].matesMissed))));
      row("Safe moves in a row", plain(sides.map((c) => String(counts[c].safeRun))));
    }
    // Every grade counted (a further tap)
    const grades = element("button", "stats-more", statsMore ? "Every grade ▴" : "Every grade ▾");
    grades.addEventListener("click", () => {
      set.statsMore(!statsMore);
      drawStats();
    });
    row(grades, ["", ""]);
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
        }), "grade-row");
      }
    }
  }
  const details = element("button", "stats-more stats-details", statsDetails ? "Details ▴" : "Details ▾");
  details.addEventListener("click", () => {
    statsDetails = !statsDetails;
    drawStats();
  });
  row(details, ["", ""]);
  card.append(table);
  if (statsDetails && statsMore) {
    // Where each phase began, so the scores make sense
    const division = divide(positions);
    const moveNumber = (ply: number) => positions[ply].fullmoves;
    card.append(element("p", "stats-note", division.middle === undefined
      ? "The game stayed in the opening phase."
      : [`Middlegame from move ${moveNumber(division.middle)}`,
         division.end !== undefined ? `endgame from move ${moveNumber(division.end)}` : "no endgame"].join(" · ") +
        ". A phase needs 3 moves from a player to be scored."));
  }
  // the game's turning points, and the two ways in: just those, or every move
  if (reviewing) box.append(keyMomentsCard(withBook(list), startReview));
  box.append(card);
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
const KEEP_IMPORTED = 2000; // games from Lichess and chess.com (they can be got again)

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
  let imported = sorted.filter((g) => g.source).slice(0, KEEP_IMPORTED);
  for (;;) {
    const kept = new Set([...own, ...imported]);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(sorted.filter((g) => kept.has(g))));
      return;
    } catch {
      // storage full: the oldest games brought in make room (they can be got
      // again); with none left, or storage blocked, the record isn't kept
      if (!imported.length) return;
      imported = imported.slice(0, Math.floor(imported.length * 0.9));
    }
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
  // Back to Analyse a game (when you came from there), and the import button
  const top = element("div", "history-top");
  if (historyFromReview) {
    const back = element("button", "soft history-back", "");
    back.type = "button";
    back.innerHTML = `${icon("back", 16)} Analyse a game`;
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
  // Games from a .pgn file on this device
  const file = element("button", "history-get", "");
  file.type = "button";
  file.innerHTML = `${icon("upload", 16)} Import PGN`;
  file.title = "Add games from a .pgn file (Lichess or chess.com)";
  file.disabled = importing;
  file.addEventListener("click", chooseHistoryFile);
  top.append(file);
  const get = element("button", "history-get", "");
  get.type = "button";
  get.innerHTML = `${icon("download", 16)} ${importing ? "Getting..." : "Get my games"}`;
  get.disabled = importing;
  get.addEventListener("click", () => void importGames());
  top.append(get);
  box.append(top);
  if (importNote) {
    // what the last import did, until you close it
    const note = element("p", "stats-note history-import-note", importNote);
    const close = element("button", "round soft history-note-close", "");
    close.type = "button";
    close.innerHTML = icon("close", 14);
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => {
      clearImportNote();
      drawHistory();
    });
    note.append(close);
    box.append(note);
  }
  if (!games.length) {
    tabMessage(box, "No games yet. Play against me, get your games from Lichess, or import a .pgn file of your games, and your record builds up here.");
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
  // Month by month, the newest first: a page of games at a time
  const list = element("div", "history-list");
  let month = "";
  for (const saved of shown.slice(0, historyShown)) {
    const named = new Date(saved.date).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (named !== month) list.append(element("p", "history-month", (month = named)));
    list.append(historyRow(saved, sources.size > 1));
  }
  if (!shown.length) list.append(element("p", "stats-note", "No games match these filters."));
  box.append(...(where.childElementCount ? [where] : []), colours, record, list);
  if (shown.length > historyShown) {
    const more = element("button", "soft history-more", `Show more (${shown.length - historyShown} left)`);
    more.type = "button";
    more.addEventListener("click", () => {
      historyShown += HISTORY_PAGE;
      drawHistory();
    });
    box.append(more);
  }
  if (games.some((g) => g.source)) {
    const older = element("button", "link-button history-older", "Get older games");
    older.type = "button";
    older.disabled = importing;
    older.addEventListener("click", () => void importGames(true));
    box.append(older);
  }
}

let historySource: "all" | "app" | Source = "all";
const HISTORY_PAGE = 50;
let historyShown = HISTORY_PAGE; // games listed so far (Show more adds a page)
export let historyFromReview = false; // opened with See all games: the way back is to Analyse a game
export const setHistoryFromReview = (on: boolean) => (historyFromReview = on);

/** One game in the history (and on the Analyse a game screen): tap to replay or review it. */
/** A game in the history; where it came from shows when your games come from more than one place. */
export function historyRow(saved: SavedGame, showSource = true): HTMLButtonElement {
  const item = element("button", "history-game");
  item.type = "button";
  const mark = element("span", `history-mark ${saved.result}`, saved.result === "win" ? "W" : saved.result === "loss" ? "L" : "D");
  const text = element("span", "history-text");
  const title = element("span", "history-title", saved.source
    ? `${saved.opponent ?? "?"}${saved.opponentRating ? ` (${saved.opponentRating})` : ""}`
    : `vs the coach · ${shortName(LEVELS[saved.level] ?? LEVELS[0])}`);
  if (saved.source && showSource) title.append(element("span", `history-tag ${saved.source}`, SOURCE_NAMES[saved.source]));
  text.append(title, element("span", "history-meta", [saved.speed ?? "", saved.opening || "Game", saved.user === "white" ? "White" : "Black",
    saved.source ? "" : timeControlLabel(saved.timeControl), saved.accuracy !== undefined ? `${saved.accuracy}%` : ""].filter(Boolean).join(" · ")));
  item.append(mark, text, element("span", "history-date", shortDate(saved.date)));
  item.addEventListener("click", () => {
    const fromHistory = !menuOpen && currentView === "history";
    if (saved.source) reviewImported(saved);
    else openSavedGame(saved);
    // opened from Game history: Back goes back to it
    if (fromHistory) viewTrail.splice(0, viewTrail.length, "history");
  });
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
/** The New button's words for the mode you're in: in full, and shorter for a
 *  phone's narrow top bar (the arrow's menu spells it out). */
export function newLabel(): { full: string; phone: string } {
  switch (newWhat()) {
    case "match": return { full: "New match", phone: "New match" };
    case "review": return { full: "Review another game", phone: "New review" };
    case "drill": return { full: "Another drill", phone: "New drill" };
    case "lesson": return { full: "Next lesson", phone: "Next lesson" };
    case "puzzles": return { full: "More puzzles", phone: "More puzzles" };
    case "position": return { full: "New position", phone: "New position" };
    default: return { full: "New game", phone: "New game" };
  }
}

const MODES: [HomeChoice, string][] = [
  ["play", "Play against the coach"], ["practice", "Practice match"], ["analysis", "Analyse a game"], ["train", "Training"],
];

/** New's arrow: the next one in this mode, the other modes, and Home. */
export function toggleModesMenu(anchor: HTMLElement) {
  const box = $("help-menu");
  if (!box.hidden && box.dataset.for === "modes") {
    box.hidden = true;
    return;
  }
  box.replaceChildren();
  box.dataset.for = "modes";
  const item = (text: string, run: () => void, className = "") => {
    const button = element("button", className, text);
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.addEventListener("click", () => {
      box.hidden = true;
      run();
    });
    box.append(button);
  };
  const here: HomeChoice | null = gameOrigin === "learn" ? "train" : gameOrigin;
  item(newLabel().full, () => void onNewGame(), "menu-current");
  box.append(element("hr", "menu-line"));
  for (const [mode, label] of MODES) if (mode !== here) item(label, () => void switchMode(mode));
  box.append(element("hr", "menu-line"));
  item("Home", () => void switchMode(null), "menu-quiet");
  const rect = anchor.getBoundingClientRect();
  box.hidden = false;
  box.style.top = `${rect.bottom + 6}px`;
  box.style.right = "";
  box.style.left = `${Math.max(8, Math.min(rect.left - 120, window.innerWidth - 240))}px`;
}

/** Another mode (or Home), asking first if a game is being played. */
export async function switchMode(screen: HomeChoice | null) {
  if (inProgress() && !(await message("Leave this game?", "Are you sure? This game will end.", true))) return;
  endGame();
  showMenu();
  if (!screen) return;
  set.homeChoice(screen);
  showScreen(screen);
  drawTrainScreen();
}

export function newWhat(): string {
  switch (gameOrigin) {
    case "practice": return "match";
    case "analysis": return "review";
    case "learn": return drill ? "drill" : "lesson";
    case "train": return puzzle || practice ? "puzzles" : lesson ? "lesson" : "position";
    default: return "game";
  }
}

/** New game (or match, review...): the setup screen of the mode you're in.
 *  Back uses it too, asking "Leave this game?" instead. */
export async function onNewGame(ask = `New ${newWhat()}?`) {
  if (inProgress() && !(await message(ask, "Are you sure? This game will end.", true))) return;
  const learning = demo ? demo.demo.opening : drill ? drill.demo.opening : null;
  const inLesson = lesson;
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
  if (inLesson) showLessonList(); // back to the lessons you picked it from
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
    return `Preview (not played): move ${preview.step} of ${plan.steps.length}, ${who} ${step.san}`;
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
  const label = newLabel();
  newButton.querySelector(".ng-full")!.textContent = label.full;
  newButton.querySelector(".ng-phone")!.textContent = label.phone;
  newButton.setAttribute("aria-label", label.full);
  $<HTMLButtonElement>("new-more").disabled = busy;

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
      "Spot their idea",
      `If you skipped your move, what would ${them} play? Move one of their pieces on the board.` + "\n\n" +
        "Look at what each of their pieces attacks, and what's left unguarded on your side.",
      textBlock('Stuck? "Give up - show answer" shows it.', "coach-note"),
    );
  } else if (quiz?.answered) {
    // the same plain words as the bubble's card; the moves play out on the board
    const correct = quiz.result![0];
    const [first, ...rest] = quizInWords();
    const parts: HTMLElement[] = [textBlock(first, correct ? "coach-right" : "coach-wrong"), ...rest.map((line) => textBlock(line))];
    if (quiz.explaining) parts.push(textBlock("Let me see what your guess would do…", "coach-note"));
    if (quiz.explanation?.line.length) parts.push(textBlock("Use ‹ › below to play it out.", "coach-note"));
    section("Spot their idea", ...parts);
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
      section("The masterstroke", `${brilliant.text}\n\nThe line: ${brilliant.line}`);
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
