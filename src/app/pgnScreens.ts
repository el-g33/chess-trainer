// PGN: reviewing a game from a file or pasted text, and downloading games

import type { Color } from "chessops/types";

import { readPgn, saveFile, today, writePgn } from "../pgn";

import { loadHistory } from "./coach";
import { $ } from "./dom";
import { refresh } from "./draw";
import { startPreparing } from "./matches";
import { playerName } from "./playerBars";
import { message } from "./popups";
import { showMenu } from "./startMenu";
import { drawHome, hideMenu, resetBoard, showScreen } from "./startScreens";
import { clockTimes, currentView, game, gameHeaders, menuOpen, pgnGames, set } from "./state";

export const pgnText = $<HTMLTextAreaElement>("pgn-text");
export const pgnPick = $<HTMLSelectElement>("pgn-pick");
export const pgnStatus = $("pgn-status");

/** "Open PGN": the Game review screen. */
export function openPgnDialog() {
  showMenu();
  set.homeChoice("analysis");
  showScreen("analysis");
  readPgnText();
  pgnText.focus();
}

/** Look for games in the text box (as you type or paste, or after opening a file). */
export function readPgnText() {
  const text = pgnText.value.trim();
  set.pgnGames(text ? readPgn(text).filter((g) => g.load().game.length > 0 || g.headers.FEN) : []);
  pgnPick.replaceChildren(...pgnGames.map((g, i) => new Option(`${i + 1}. ${g.title}`, String(i))));
  $("pgn-pick-row").hidden = pgnGames.length < 2;
  drawHome();
  pgnStatus.classList.toggle("problem", !!text && !pgnGames.length);
  pgnStatus.textContent = !text
    ? ""
    : !pgnGames.length
      ? "No game found in this text. A PGN game looks like: 1. e4 e5 2. Nf3 Nc6 ..."
      : pgnGames.length === 1
        ? `Found: ${pgnGames[0].title}`
        : `Found ${pgnGames.length} games - choose one.`;
}

export async function reviewPgnGame(event: Event) {
  event.preventDefault();
  const chosen = pgnGames[Number(pgnPick.value) || 0];
  if (!chosen) return;
  const { game: loaded, problem } = chosen.load();
  // Only finished games: a game still being played could be used to cheat
  const result = chosen.headers.Result;
  const outcome = loaded.outcome();
  const over = result === "1-0" || result === "0-1" || result === "1/2-1/2" || (outcome !== undefined && loaded.position.isEnd());
  if (!over) {
    await message("This game isn't finished",
      "It has no result yet, so it's still being played. To keep things fair, only finished games can be analysed. Come back once it's over.");
    return;
  }
  const side = await pickSide(chosen.headers);
  if (side === "cancel") return;
  set.mode("practice");
  resetBoard(loaded, chosen.headers);
  set.canReview(false);
  set.reviewing(true);
  set.reviewTitle(`Reviewing: ${chosen.title}`);
  set.reviewSide(side);
  set.gameOrigin("analysis");
  set.viewPly(loaded.length ? 0 : null); // start from the first position and step through
  set.orientation(side ?? "white");
  set.currentView("stats");
  if (menuOpen) hideMenu();
  startPreparing();
  refresh();
  if (problem) await message("PGN", problem);
}

/** Whose side are you on in this game? (A name that matches yours is suggested.) */
export async function pickSide(headers: Record<string, string>): Promise<Color | null | "cancel"> {
  const ask = $<HTMLDialogElement>("side-pick");
  const named = (value?: string) => (value && value !== "?" ? value : "");
  const white = named(headers.White);
  const black = named(headers.Black);
  const mine = playerName().trim().toLowerCase();
  $("side-pick-white").textContent = white ? `I'm White: ${white}` : "I'm White";
  $("side-pick-black").textContent = black ? `I'm Black: ${black}` : "I'm Black";
  $("side-pick-white").classList.toggle("accent", !!mine && white.toLowerCase() === mine);
  $("side-pick-black").classList.toggle("accent", !!mine && black.toLowerCase() === mine);
  const result = headers.Result === "1-0" ? "White won" : headers.Result === "0-1" ? "Black won" : headers.Result === "1/2-1/2" ? "A draw" : "";
  $("side-pick-note").textContent = [headers.Site && headers.Site !== "?" ? headers.Site : "", result].filter(Boolean).join(" · ") +
    (result ? ". " : "") + "I'll talk about the game from your side.";
  ask.showModal();
  return new Promise((resolve) => {
    const buttons = [...ask.querySelectorAll<HTMLButtonElement>("button[value]")];
    const done = (value: string) => {
      for (const button of buttons) button.onclick = null;
      ask.oncancel = null;
      ask.close();
      resolve(value === "white" || value === "black" ? value : value === "neither" ? null : "cancel");
    };
    for (const button of buttons) button.onclick = (event) => { event.preventDefault(); done(button.value); };
    ask.oncancel = (event) => { event.preventDefault(); done("cancel"); };
  });
}

/** What the download button saves: the game on screen, or (on the History
 *  tab) all your games. */
export function saveTarget(): { title: string; note: string; name: string; text: string } | null {
  if (currentView === "history") {
    const games = loadHistory();
    if (!games.length) return null;
    return {
      title: "Save all your games",
      note: `${games.length} game${games.length === 1 ? "" : "s"} against Stockfish, in one PGN.`,
      name: `chess-trainer-games-${today().replace(/\./g, "-")}.pgn`,
      text: games.map((g) => g.pgn.trim()).join("\n\n") + "\n",
    };
  }
  if (!game.length) return null;
  const outcome = game.outcome();
  const headers = { ...gameHeaders };
  if (!headers.Result || headers.Result === "*") {
    headers.Result = !outcome ? "*" : !outcome.winner ? "1/2-1/2" : outcome.winner === "white" ? "1-0" : "0-1";
  }
  const name = `${headers.White ?? "White"}-vs-${headers.Black ?? "Black"}-${(headers.Date ?? today()).replace(/\./g, "-")}`
    .replace(/[^A-Za-z0-9-]+/g, "_");
  return { title: "Save this game", note: `${game.length} moves, as PGN.`, name: `${name}.pgn`, text: writePgn(game, headers, clockTimes) };
}

export function openSave() {
  const target = saveTarget();
  if (!target) return;
  $("save-title").textContent = target.title;
  $("save-note").textContent = target.note;
  $("save-status").textContent = "";
  $<HTMLDialogElement>("save-dialog").showModal();
}

export async function saveCopy() {
  const target = saveTarget();
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target.text);
    $("save-status").textContent = "Copied. Paste it wherever you like (lichess, chess.com, a message...).";
  } catch {
    // No clipboard access (older browsers, or not allowed): select it for copying by hand
    const box = document.createElement("textarea");
    box.value = target.text;
    box.className = "save-text";
    box.readOnly = true;
    $("save-status").replaceChildren("Select all and copy:", box);
    box.select();
    // the older way of copying still works on plain-http pages
    try {
      if (document.execCommand("copy")) $("save-status").replaceChildren("Copied. Paste it wherever you like (lichess, chess.com, a message...).");
    } catch {
      // leave the text selected for copying by hand
    }
  }
}

export function saveDownload() {
  const target = saveTarget();
  if (!target) return;
  saveFile(target.name, target.text);
  $<HTMLDialogElement>("save-dialog").close();
}
