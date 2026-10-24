// Matches against Stockfish

import type { Color, NormalMove } from "chessops/types";
import { opposite, parseUci } from "chessops/util";

import type { ReviewDepth, SavedAnalysis } from "../analyser";
import { Clock, type TimeControl, parseTimeControl, thinkTime, timeControlTag } from "../clock";
import { afterMove as positionAfter } from "../coach";
import { Game, type Outcome } from "../game";
import { LEVELS, OPPONENT_MIN_DELAY, shortName } from "../levels";
import { startLoadAnimation } from "../loading";
import {
  NO_OPENING, STOCKFISH_DECIDES, analyser, bookReady, currentPly, engine, gameMoves, openingEngine, reviewCache,
} from "../main";
import {
  type Opening, REPERTOIRE, chooseOpeningMove, coachOpeningMove, firstMoveOf, menuName, suggestedFor,
} from "../openings";
import { today } from "../pgn";
import { type Review, fenOf } from "../review";
import { play } from "../sounds";

import { applyView, closeOverlay, explainMove, recordGame } from "./coach";
import {
  $, colourBox, levelBox, myOpeningBox, rateMovesBox, reviewDepthBox, sfOpeningBox, tcIncrement, tcMinutes,
  timeControlBox,
} from "./dom";
import { refresh } from "./draw";
import { goTo } from "./moves";
import { saveGameMistakes, saveGameSummary } from "./openingDemos";
import { legalMoveCount, playerName } from "./playerBars";
import { message } from "./popups";
import { openingInfo } from "./ratings";
import { moveSound } from "./startMenu";
import { resetBoard } from "./startScreens";
import {
  analysis, book, canReview, clock, clockHistory, clockTimes, currentView, deepMoves, deepNeeded, demo, fromStats,
  game, gameHeaders, gradeJump, match, matchCounter, mode, plyNotes, prepProgress, prepWatch, prepWorked, preparing,
  preparingSince, reviewSide, reviewTitle, reviewing, set, silentJump, stepper, stopLoading, thinking,
} from "./state";

export function startMatch() {
  let colour = colourBox.value;
  if (colour === "Random") colour = Math.random() < 0.5 ? "White" : "Black";
  const user: Color = colour === "White" ? "white" : "black";
  resetBoard(new Game());
  void play("start");
  const level = levelBox.selectedIndex;
  const sfOpening = pickOpening(sfOpeningBox.value, opposite(user), level);
  const myOpening = pickOpening(myOpeningBox.value, user, level);
  set.match({
    id: set.matchCounter(matchCounter + 1), user, level,
    sfOpening, sfActive: sfOpening !== null, sfMisses: 0,
    // Opening coaching is a training tool, so Play mode doesn't have it
    myOpening: mode === "practice" ? myOpening : null,
    myActive: mode === "practice" && myOpening !== null,
  });
  const stockfish = `Stockfish (${shortName(LEVELS[level])})`;
  const you = playerName();
  set.gameHeaders({ White: user === "white" ? you : stockfish, Black: user === "white" ? stockfish : you, Date: today() });
  set.orientation(user); // your pieces at the bottom
  const control = mode === "play" ? menuTimeControl() : undefined;
  if (control) {
    const started = new Clock(control);
    set.clock(started);
    started.start("white");
    set.clockHistory([started.snapshot()]);
    gameHeaders.TimeControl = timeControlTag(control);
  }
  void engine.newGame();
}

/** The time control chosen in the menu (undefined = no clock). */
export function menuTimeControl(): TimeControl | undefined {
  if (timeControlBox.value !== "custom") return parseTimeControl(timeControlBox.value);
  const minutes = Math.min(180, Math.max(0.25, Number(tcMinutes.value) || 10));
  const increment = Math.min(60, Math.max(0, Math.round(Number(tcIncrement.value) || 0)));
  return { base: Math.round(minutes * 60), increment };
}

/** Turn a choice from an opening box into an opening for this colour (or null). */
export function pickOpening(choice: string, colour: Color, level: number): Opening | null {
  if (choice === STOCKFISH_DECIDES || choice === NO_OPENING || !choice) return null;
  let chosen = REPERTOIRE.find((o) => menuName(o) === choice);
  if (!chosen || chosen.colour !== colour) {
    // "Suggested", or an opening for the other colour (e.g. after a random
    // colour): pick one suited to this level instead.
    const suited = suggestedFor(colour, level);
    chosen = suited[Math.floor(Math.random() * suited.length)];
  }
  return chosen;
}

/** Before your move is played: note how it fits the opening you're practising. */
export function coachMyOpening(move: NormalMove) {
  if (!match?.myActive || !match.myOpening || !book) return;
  const first = firstMoveOf(game.positionAt(0), gameMoves());
  const note = coachOpeningMove(game.position, move, match.myOpening, book, first);
  if (note === undefined) match.myActive = false; // the opening phase is over
  else plyNotes.set(game.length + 1, [`Your opening: ${note}`]);
}

/** Called after every move of the game, yours or Stockfish's. */
export function afterMove() {
  set.stepper(null);
  closeOverlay(false);
  if (match && clock?.running()) {
    clockTimes[game.length - 1] = clock.moved();
    clockHistory[game.length] = clock.snapshot();
    if (game.outcome()) clock.stop();
  }
  const last = game.moves[game.length - 1];
  if (last) moveSound(last.san, opposite(game.position.turn));
  // (checkmate has its own sound)
  if (!match && game.outcome() && !last?.san.includes("#")) setTimeout(() => void play("gameover"), 350);
  set.viewPly(null);
  set.preview(null);
  set.analysis(null);
  set.showReply(false); // the review goes back to your move
  refresh();
  if (!match) return;
  if (game.outcome()) {
    // A short wait first, so the last move can be seen before the message
    const id = match.id;
    setTimeout(() => match?.id === id && finishMatch(), 900);
  } else {
    void maybeOpponentMove();
  }
}

export async function maybeOpponentMove() {
  if (!match || thinking || game.position.turn === match.user || game.outcome()) return;
  const { id, level: levelIndex } = match;
  const level = LEVELS[levelIndex];
  set.thinking(true);
  refresh();
  const started = performance.now();
  try {
    // While it follows an opening, Stockfish plays book moves or builds the
    // opening's setup in a sensible order - unless that would be a real
    // mistake, in which case it plays what the position needs.
    let move: NormalMove | undefined;
    let note: string | undefined;
    let openingOver = false;
    let misses = match.sfMisses;
    const position = game.position;
    if (match.sfActive && match.sfOpening) {
      await bookReady;
      if (book) {
        const first = firstMoveOf(game.positionAt(0), gameMoves());
        const choice = await chooseOpeningMove(openingEngine, position, match.sfOpening, book, levelIndex, first);
        ({ move, note } = choice);
        if (move === undefined) {
          // Finished with the opening, or had to drop the plan twice in a row
          misses += 1;
          openingOver = choice.finished || misses >= 2;
        } else {
          misses = 0;
        }
      }
    }
    const gameClock = clock;
    const target = gameClock
      ? thinkTime({
          left: gameClock.timeLeft(position.turn),
          increment: gameClock.control.increment,
          fullmoves: position.fullmoves,
          legalMoves: legalMoveCount(position),
          inCheck: position.isCheck(),
          book: move !== undefined,
        })
      : 0;
    if (move === undefined) {
      const uci = await engine.bestMove(fenOf(position), {
        skill: level.skill,
        depth: level.depth,
        // with a clock it mustn't think longer than a person would
        movetime: gameClock ? Math.min(level.seconds * 1000, Math.max(50, target * 0.7)) : level.seconds * 1000,
      });
      const parsed = parseUci(uci);
      if (!parsed || !("from" in parsed)) throw new Error(`unexpected answer "${uci}"`);
      move = parsed;
    }
    if (gameClock) {
      // Its clock runs while it "thinks" (and stops while yours is paused)
      while (match?.id === id && clock === gameClock && gameClock.running() === position.turn && gameClock.usedThisMove() < target) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } else {
      const wait = OPPONENT_MIN_DELAY * 1000 - (performance.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    // Ignore a move meant for a match that has since been stopped or changed (Undo)
    if (match?.id !== id || fenOf(game.position) !== fenOf(position)) {
      set.thinking(false);
      refresh();
      void maybeOpponentMove();
      return;
    }
    set.thinking(false);
    match.sfMisses = misses;
    if (openingOver) match.sfActive = false;
    if (note) plyNotes.set(game.length + 1, [`Stockfish's opening: ${note}`]);
    game.play(move);
    afterMove();
  } catch (error) {
    if (match?.id !== id) return;
    set.thinking(false);
    set.match(null);
    set.errorText(`Stockfish couldn't make its move: ${error}`);
    refresh();
  }
}

export function finishMatch() {
  const outcome = game.outcome() as Outcome;
  let text: string;
  gameHeaders.Result = !outcome.winner ? "1/2-1/2" : outcome.winner === "white" ? "1-0" : "0-1";
  if (!outcome.winner) text = `It's a draw (${outcome.reason}).`;
  else if (outcome.winner === match!.user) text = "You won! Well played.";
  else text = "Stockfish won this time.";
  endMatch(text);
}

/** Out of time: a loss - or a draw if the other side can't possibly checkmate. */
export function onFlag(colour: Color) {
  if (!match || !clock) return;
  clock.stop();
  const other = opposite(colour);
  const draw = game.position.hasInsufficientMaterial(other);
  const you = colour === match.user;
  gameHeaders.Result = draw ? "1/2-1/2" : other === "white" ? "1-0" : "0-1";
  gameHeaders.Termination = "Time forfeit";
  set.result(draw ? "Out of time - a draw" : you ? "You ran out of time - Stockfish wins" : "Stockfish ran out of time - you win");
  const text = draw
    ? `${you ? "You" : "Stockfish"} ran out of time, but ${you ? "Stockfish" : "you"} can't checkmate with the pieces left, so it's a draw.`
    : you ? "You ran out of time - Stockfish wins." : "Stockfish ran out of time - you win!";
  endMatch(text);
}

/** The match is over: Play games can then be reviewed in Practice mode. */
export function endMatch(text: string) {
  recordGame();
  clock?.stop();
  if (!game.moves[game.length - 1]?.san.includes("#")) void play("gameover"); // (checkmate has its own sound)
  set.match(null);
  set.thinking(false);
  set.canReview(mode === "play" && game.length > 0);
  refresh();
  const hint =
    mode === "play"
      ? canReview ? '\n\nClick "Review this game" to see how every move rated.' : ""
      : "\n\nStep back through the moves to see where the game turned - the Move review rates every move.";
  void message("Match over", text + hint);
}

/** After a Play game: switch to Practice to see the ratings and the coach. */
export function onReviewGame() {
  set.reviewTitle("");
  set.mode("practice");
  set.canReview(false);
  set.reviewing(true);
  set.currentView("stats"); // the statistics first, then the review from move 1
  set.viewPly(game.length ? 0 : null);
  startPreparing();
  refresh();
}

/** Watching a game you didn't play: the coach says "White" and "Black", not "you". */
export const watching = () => reviewing && reviewTitle !== "" && reviewSide === null;

// -- The load screen: Stockfish checks everything before the review --------------

export const PREP_MIN_MS = 2500; // long enough to see the animation once Stockfish has work to do
export const PREP_STALL_MS = 30000; // no progress for this long: show what's ready rather than wait for ever
export const PREP_MAX_MS = 90000; // ...and never longer than this, progress or not

export function startPreparing() {
  if (!rateMovesBox.checked) return;
  set.deepening(null);
  useDepth(reviewDepthBox.value === "deep" ? "deep" : "quick");
  restoreAnalysis();
  set.prepWorked(false);
  set.prepProgress({ key: "", since: performance.now() });
  $("prep-progress").textContent = "";
  clearInterval(prepWatch);
  set.prepWatch(window.setInterval(refresh, 5000));
  set.preparing(true);
  set.preparingSince(performance.now());
  stopLoading?.();
  set.stopLoading(startLoadAnimation($("prep-stage"), $("prep-caption")));
  $("prep-screen").hidden = false;
}

export function stopPreparing() {
  set.preparing(false);
  clearInterval(prepWatch);
  stopLoading?.();
  set.stopLoading(null);
  $("prep-screen").hidden = true;
}

/** Once every move has its final rating (the second looks included), the
 *  load screen gives way to the statistics. */
export function drawPrep(list: (Review | undefined)[]) {
  if (!preparing) return;
  const { done, total } = analyser.progress();
  const finished = done >= total && !deepNeeded.length && !deepMoves.length && list.every(Boolean);
  if (!finished) {
    set.prepWorked(true);
    const closer = deepNeeded.length + deepMoves.length;
    $("prep-progress").textContent = `Checked ${Math.min(done, total)} of ${total} positions` +
      (closer ? ` · a closer look at ${closer} move${closer === 1 ? "" : "s"}` : "") +
      ` · ${list.filter(Boolean).length} of ${list.length} moves rated`;
    // Stuck (no progress for a long time, or far too long): show what's ready rather than wait for ever
    const key = `${done}/${total}/${deepNeeded.length}/${deepMoves.length}/${list.filter(Boolean).length}`;
    if (key !== prepProgress.key) set.prepProgress({ key, since: performance.now() });
    const slower = analyser.depth === "deep" ? 4 : 1;
    const stalled = performance.now() - prepProgress.since >= PREP_STALL_MS * slower;
    const tooLong = performance.now() - preparingSince >= PREP_MAX_MS * slower;
    if (!stalled && !tooLong) return;
  }
  const wait = prepWorked ? PREP_MIN_MS - (performance.now() - preparingSince) : 0;
  if (wait > 0) {
    setTimeout(refresh, wait);
    return;
  }
  keepAnalysis();
  saveGameMistakes(withBook(list));
  saveGameSummary(withBook(list));
  stopPreparing();
  set.currentView("stats");
  applyView();
}

// -- Games reviewed before: their analysis is kept, so they open at once -----------

export const ANALYSIS_KEY = "chess-trainer-analysis"; // { game key: SavedAnalysis }, oldest first
export const ANALYSIS_KEEP = 40; // games

/** The positions of the game on the board. */
export function gameFens(): Set<string> {
  const fens = new Set<string>();
  for (let ply = 0; ply <= game.length; ply++) fens.add(fenOf(game.positionAt(ply)));
  return fens;
}

/** A short key for the game: its positions, hashed. */
export function gameKey(): string {
  let hash = 2166136261;
  const text = [...gameFens()].join("|");
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `g${(hash >>> 0).toString(36)}-${game.length}`;
}

export function savedAnalyses(): Record<string, SavedAnalysis> {
  try {
    return JSON.parse(localStorage.getItem(ANALYSIS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** A game reviewed before: what Stockfish found then. */
export function restoreAnalysis() {
  if (!game.length) return;
  const saved = savedAnalyses()[analysisKey()];
  if (saved) analyser.restore(saved);
}

/** The game's key for its kept analysis: one for each depth. */
export const analysisKey = () => `${gameKey()}${analyser.depth === "deep" ? ":deep" : ""}`;

/** Look at the game at this depth from now on (forgetting the other depth's results). */
export function useDepth(depth: ReviewDepth) {
  if (analyser.depth === depth) return;
  analyser.depth = depth;
  analyser.forget();
  reviewCache.clear();
}

/** Keep this game's analysis (the most recent games only). */
export function keepAnalysis() {
  if (!game.length) return;
  const all = savedAnalyses();
  const key = analysisKey();
  delete all[key];
  // the game's positions, and the ones after each best (and second best) move, which the ratings use too
  const fens = gameFens();
  for (let ply = 0; ply <= game.length; ply++) {
    const position = game.positionAt(ply);
    const found = analyser.evals.get(fenOf(position));
    for (const move of [found?.best, found?.second]) if (move && position.isLegal(move)) fens.add(fenOf(positionAfter(position, move)));
  }
  all[key] = analyser.save(fens);
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - ANALYSIS_KEEP))) delete all[old];
  try {
    localStorage.setItem(ANALYSIS_KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: the game just takes a moment to check next time
  }
}


/** The move ratings with the opening's known moves rated Book, as the board's badges show them. */
export function withBook(list: (Review | undefined)[]): (Review | undefined)[] {
  const info = openingInfo();
  return list.map((review, i) => (review && info[i]?.book ? { ...review, rating: "Book" } : review));
}

/** From the statistics: the next move of this grade by this side, on the board, explained. */
export function jumpToGrade(colour: Color, grade: string, list: (Review | undefined)[]) {
  const plies = list.flatMap((review, i) => (review?.rating === grade && game.moverOf(i + 1) === colour ? [i + 1] : []));
  if (!plies.length) return;
  const key = `${colour}:${grade}`;
  if (gradeJump.key !== key) set.gradeJump({ key, next: 0 });
  const ply = plies[gradeJump.next % plies.length];
  gradeJump.next++;
  set.currentView("board");
  set.stepper(null);
  // the position before the move first, then the move plays in with its explanation
  goTo(ply - 1);
  set.silentJump(true);
  set.fromStats(true);
  refresh();
  const review = list[ply - 1]!;
  setTimeout(() => {
    if (silentJump && currentPly() === ply - 1 && !stepper) explainMove(ply, review);
  }, GRADE_JUMP_PAUSE);
}

export const GRADE_JUMP_PAUSE = 1000; // ms on the position before the move

/** The bar back to the statistics, while you're on the board after a jump. */
export function drawStatsBack() {
  if (!reviewing) set.fromStats(false);
  const show = fromStats && currentView === "board" && !analysis && !demo;
  $("stats-back-bar").hidden = !show;
  document.querySelector(".board-area")!.classList.toggle("statsback", show);
}

export function backToStats() {
  set.fromStats(false);
  set.silentJump(false);
  set.stepper(null);
  set.currentView("stats");
  refresh();
}

/** Start going through the game, from the first move. */
export function startReview() {
  set.currentView("board");
  set.stepper(null);
  goTo(0);
}

export async function onResign() {
  if (!match) return;
  if (!(await message("Resign?", "Are you sure you want to resign this game?", true))) return;
  set.result("You resigned - Stockfish wins");
  gameHeaders.Result = match.user === "white" ? "0-1" : "1-0";
  gameHeaders.Termination = `${match.user === "white" ? "White" : "Black"} resigns`;
  endMatch("You resigned.");
}
