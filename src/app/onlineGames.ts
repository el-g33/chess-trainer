// Your games from Lichess and chess.com: brought into Game history with the
// Get my games button, and reviewed from there (or from the Game review screen)

import { OnlineError, SOURCE_NAMES, type OnlineGame, type Source, type Wanted, fetchChesscom, fetchLichess } from "../online";
import { readPgn } from "../pgn";

import { type SavedGame, drawDataCounts, historyRow, loadHistory, saveHistory, setHistoryFromReview } from "./coach";
import { $, chesscomUserBox, lichessUserBox, settingsDialog } from "./dom";
import { refresh } from "./draw";
import { startPreparing } from "./matches";
import { hideMenu, resetBoard } from "./startScreens";
import { menuOpen, set } from "./state";

const FIRST_IMPORT = 50; // games per site the first time (and per "Get older games")
const NEWER_MAX = 200; // the most new games per site in one go

export let importing = false;
export let importNote = ""; // what the last import found (or what went wrong)

const usernames = (): Partial<Record<Source, string>> => ({
  ...(lichessUserBox.value.trim() ? { lichess: lichessUserBox.value.trim() } : {}),
  ...(chesscomUserBox.value.trim() ? { chesscom: chesscomUserBox.value.trim() } : {}),
});

/** Get my games: what's new since the last import (or, with `older`, the 50
 *  before the oldest you have). No usernames yet: Settings, to add them. */
export async function importGames(older = false) {
  const names = usernames();
  if (!Object.keys(names).length) {
    openAccounts();
    return;
  }
  if (importing) return;
  importing = true;
  importNote = older ? "Getting older games..." : "Getting your games...";
  drawYourGames();
  refresh();
  const history = loadHistory();
  const counts: string[] = [];
  const problems: string[] = [];
  for (const [source, name] of Object.entries(names) as [Source, string][]) {
    const dates = history.filter((g) => g.source === source).map((g) => Date.parse(g.date));
    const wanted: Wanted = !dates.length ? { max: FIRST_IMPORT }
      : older ? { max: FIRST_IMPORT, before: Math.min(...dates) }
        : { max: NEWER_MAX, since: Math.max(...dates) };
    try {
      const games = source === "lichess" ? await fetchLichess(name, wanted) : await fetchChesscom(name, wanted);
      const added = addToHistory(games);
      counts.push(`${added} from ${SOURCE_NAMES[source]}`);
    } catch (error) {
      problems.push(error instanceof OnlineError ? error.message : `Something went wrong with ${SOURCE_NAMES[source]}.`);
    }
  }
  importing = false;
  const total = counts.reduce((sum, c) => sum + parseInt(c, 10), 0);
  importNote = [
    counts.length ? (total ? `${older ? "Older games" : "New games"}: ${counts.join(", ")}.` : older ? "No older games found." : "No new games since last time.") : "",
    ...problems,
  ].filter(Boolean).join(" ");
  drawYourGames();
  refresh();
}

/** Into the history, leaving out games already there. Returns how many are new. */
function addToHistory(games: OnlineGame[]): number {
  const history = loadHistory();
  const have = new Set(history.map((g) => g.id));
  const fresh: SavedGame[] = games.filter((g) => !have.has(g.id)).map((g) => ({
    id: g.id, date: g.date, pgn: g.pgn, user: g.user, level: 0, opening: g.opening, timeControl: g.timeControl,
    result: g.result, mode: "practice", source: g.source, opponent: g.opponent, opponentRating: g.opponentRating, speed: g.speed,
  }));
  if (fresh.length) saveHistory([...fresh, ...history]);
  return fresh.length;
}

/** Settings, scrolled to the username boxes. */
export function openAccounts() {
  drawDataCounts();
  settingsDialog.showModal();
  $("online-accounts").scrollIntoView({ block: "center" });
  (lichessUserBox.value ? chesscomUserBox : lichessUserBox).focus();
}

/** Review a game from Lichess or chess.com: your side is known, so straight in. */
export function reviewImported(saved: SavedGame) {
  const [parsed] = readPgn(saved.pgn);
  if (!parsed) return;
  const { game: loaded } = parsed.load();
  set.mode("practice");
  resetBoard(loaded, parsed.headers);
  set.currentGameId(saved.id);
  set.canReview(false);
  set.reviewing(true);
  set.reviewTitle(`Reviewing: ${parsed.title}`);
  set.reviewSide(saved.user);
  set.gameOrigin("analysis");
  set.viewPly(loaded.length ? 0 : null); // start from the first position and step through
  set.orientation(saved.user);
  set.currentView("stats");
  if (menuOpen) hideMenu();
  startPreparing();
  refresh();
}

/** See all games: the history, with the way back to Game review. */
export function showAllGames() {
  setHistoryFromReview(true);
  if (menuOpen) hideMenu();
  set.currentView("history");
  refresh();
}

export function setupOnlineGames() {
  $("your-games-get").addEventListener("click", () => void importGames());
  $("your-games-all").addEventListener("click", showAllGames);
}

/** The Game review screen: your three latest games, to review with a tap. */
export function drawYourGames() {
  const box = $("your-games");
  const games = loadHistory().slice(0, 3);
  const list = box.querySelector<HTMLElement>(".your-games-list")!;
  list.replaceChildren(...games.map((saved) => historyRow(saved)));
  $("your-games-empty").hidden = games.length > 0;
  $("your-games-all").hidden = !games.length;
  const get = $<HTMLButtonElement>("your-games-get");
  get.disabled = importing;
  get.lastChild!.textContent = importing ? " Getting..." : " Get my games";
  $("your-games-note").textContent = importNote;
}
