// Key moments: the few turning points of a reviewed game (the slips that cost
// most, the chances missed, the masterstrokes), listed on the summary, and a
// way through the review that stops only at those.

import type { Color } from "chessops/types";

import { colourName } from "../coach";
import { icon } from "../icons";
import { currentPly } from "../main";
import type { Review } from "../review";
import { listener, reviews } from "./coach";
import { $ } from "./dom";
import { refresh } from "./draw";
import { GRADE_JUMP_PAUSE, backToStats, watching, withBook } from "./matches";
import { goTo } from "./moves";
import { analysis, currentView, demo, game, reviewing, set } from "./state";

const MOST = 5;
const SLIPS = ["Mistake", "Blunder", "Miss", "Missed Win"];

/** The plies of the game's turning points, in move order: up to five, the
 *  biggest first (a masterstroke or key move always counts). */
export function keyMoments(list: (Review | undefined)[]): number[] {
  const scored = list.flatMap((review, i) => {
    if (!review) return [];
    if (review.rating === "Brilliant" || review.rating === "Great") return [{ ply: i + 1, size: 100 }];
    if (SLIPS.includes(review.rating) && review.bestSan) return [{ ply: i + 1, size: Math.abs(review.chanceBefore - review.chanceAfter) }];
    return [];
  });
  return scored.sort((a, b) => b.size - a.size).slice(0, MOST).map((m) => m.ply).sort((a, b) => a - b);
}

/** A moment in a few words, from your side: "Your key move", "Their slip: your chance". */
function momentWords(review: Review, viewer: Color | null, mover: Color): { text: string; sign: string; ico: string } {
  const whose = viewer === null ? `${colourName(mover)}'s` : mover === viewer ? "Your" : "Their";
  const theirs = viewer !== null && mover !== viewer;
  if (review.rating === "Brilliant") return { text: `${whose} masterstroke`, sign: "star", ico: "star" };
  if (review.rating === "Great") return { text: `${whose} key move`, sign: "star", ico: "star" };
  if (theirs) {
    const text = review.rating === "Miss" || review.rating === "Missed Win" ? "A chance they missed" : "Their slip: your chance";
    return { text, sign: "chance", ico: "gift" };
  }
  if (review.rating === "Miss") return { text: viewer === null ? `${whose} missed chance` : "A chance you missed", sign: "amber", ico: "hazard" };
  if (review.rating === "Missed Win") return { text: viewer === null ? `${whose} missed win` : "A win you missed", sign: "orange", ico: "hazard" };
  if (review.rating === "Blunder") return { text: `${whose} big slip`, sign: "red", ico: "hazard" };
  return { text: `${whose} slip`, sign: "orange", ico: "hazard" };
}

let moments: number[] | null = null; // going through the key moments only

export const keyMomentsOn = () => moments !== null && reviewing;

/** The summary's list of moments, with the two ways into the review. */
export function keyMomentsCard(list: (Review | undefined)[], startReview: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "key-moments";
  const plies = keyMoments(list);
  const viewer: Color | null = watching() ? null : listener();
  if (plies.length) {
    const title = document.createElement("p");
    title.className = "key-moments-title";
    title.textContent = "Key moments";
    box.append(title);
    for (const ply of plies) {
      const words = momentWords(list[ply - 1]!, viewer, game.moverOf(ply));
      const row = document.createElement("button");
      row.type = "button";
      row.className = "key-moment";
      row.innerHTML = `<span class="moment-sign ${words.sign}">${icon(words.ico, 16)}</span><span class="moment-words"><b></b> · <span></span></span><span class="moment-go">›</span>`;
      row.querySelector("b")!.textContent = `Move ${Math.ceil(ply / 2)}`;
      row.querySelector(".moment-words span")!.textContent = words.text;
      row.addEventListener("click", () => showMoment(ply, plies));
      box.append(row);
    }
  }
  const start = document.createElement("div");
  start.className = "stats-start";
  if (plies.length) start.append(startButton(`Key moments (${plies.length})`, "accent", () => showMoment(plies[0], plies)));
  start.append(startButton(plies.length ? "Every move" : "Start the review", plies.length ? "soft" : "accent", () => {
    moments = null;
    startReview();
  }));
  box.append(start);
  return box;
}

function startButton(label: string, kind: string, run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `round labelled ${kind}`;
  button.innerHTML = icon("play", 18);
  const words = document.createElement("span");
  words.textContent = label;
  button.append(words);
  button.addEventListener("click", run);
  return button;
}

/** On the board at a moment: the position before it, then the move plays in. */
export function showMoment(ply: number, plies: number[] = moments ?? []) {
  moments = plies;
  set.currentView("board");
  goTo(ply - 1);
  set.silentJump(true);
  refresh();
  setTimeout(() => {
    if (moments && currentPly() === ply - 1) goTo(ply);
  }, GRADE_JUMP_PAUSE);
}

/** Forward or back while going through the key moments: the next or the
 *  previous one (past the last: back to the summary). False if not in that mode. */
export function momentStep(where: "back" | "forward"): boolean {
  if (!keyMomentsOn()) return false;
  const list = moments!;
  const now = currentPly();
  if (where === "forward") {
    const next = list.find((ply) => ply > now);
    if (next) showMoment(next);
    else {
      moments = null;
      backToStats();
    }
  } else {
    const previous = [...list].reverse().find((ply) => ply < now - 1);
    if (previous) showMoment(previous);
  }
  return true;
}

/** The review bar above the board: back to the summary, and the switch
 *  between key moments only and every move (none for a game without any). */
export function drawMomentsBar() {
  if (!reviewing) moments = null;
  const show = reviewing && currentView === "board" && !analysis && !demo;
  $("review-bar").hidden = !show;
  if (!show) return;
  const plies = keyMoments(withBook(reviews()));
  $("review-mode").hidden = !plies.length;
  const on = keyMomentsOn();
  const at = on ? moments!.findIndex((ply) => ply >= currentPly()) : -1;
  $("mode-moments").textContent = on ? `Key moments ${at < 0 ? moments!.length : at + 1}/${moments!.length}` : "Key moments";
  $("mode-moments").classList.toggle("on", on);
  $("mode-every").classList.toggle("on", !on);
}

/** Every move: carry on from the move on screen, one at a time. */
export function everyMove() {
  moments = null;
  refresh();
}

/** Key moments only: from the move on screen if it's one, else the next one ahead. */
export function momentsOnly() {
  if (keyMomentsOn()) return;
  const plies = keyMoments(withBook(reviews()));
  if (!plies.length) return;
  const now = currentPly();
  if (plies.includes(now)) {
    moments = plies;
    refresh();
    return;
  }
  showMoment(plies.find((ply) => ply > now) ?? plies[plies.length - 1], plies);
}
