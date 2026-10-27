// The feature tour

import { type TourStep, runTour, tourOpen } from "../tour";

import { $ } from "./dom";
import { refresh } from "./draw";
import { currentView, demo, menuOpen, mode } from "./state";

export const TOUR_KEY = "chess-trainer-tour";

export const BOARD_STEPS: TourStep[] = [
  { target: "#board", title: "The board",
    text: "Drag a piece to move it, or tap it and then tap where it should go." },
  { target: "#coach-strip", title: "Your coach",
    text: "I sit up here and say what I think of each move in a line. The rating icon on the board shows which move I mean." },
  { target: "#bar-top", title: "The players",
    text: "Names, the pieces each side has captured, and who is ahead in material. With a time control, the clocks are here too." },
];

export const PRACTICE_TOUR: TourStep[] = [
  ...BOARD_STEPS,
  { target: "#strip-actions", title: "Tell me more, and Strategy",
    text: "The dots open the full explanation, and what your opponent can do next. The target shows the main idea: your opening's plan or Stockfish's, one move at a time, with a quiz." },
  { target: "#eval-bar", title: "Eval bar",
    text: "Who is better according to Stockfish. You can switch it off in the settings." },
  { target: ".board-controls", title: "Moving through the game",
    text: "Step back and forward, take back your move, flip the board, or resign with the white flag." },
  { target: "#move-strip", title: "The moves",
    text: "Swipe sideways to see every move; tap one to go to it." },
  { target: ".moves-area", title: "The moves",
    text: "Every move of the game, coloured by its rating. Click one to go to it." },
  { target: ".view-tabs", title: "Statistics and history",
    text: "See each player's accuracy and an estimated rating for this game, and your record against Stockfish." },
  { target: ".game-top .gear-button", title: "Settings",
    text: "Theme, board, pieces, sounds, your name, and more." },
  { target: "#new-game", title: "New game",
    text: "Start again in the mode you're in: a new game, match, review or lesson. The feature tour is in the settings if you'd like to see it again." },
];

export const DEMO_TOUR: TourStep[] = [
  { target: "#bar-top", title: "The line",
    text: "The opening and the line you're watching, for example the main line or a variation." },
  { target: "#coach-strip", title: "Your coach",
    text: "I explain each idea as the moves are played. Tap the dots to read the full note." },
  { target: "#board", title: "The board", text: "The moves play out here, one at a time." },
  { target: ".board-controls", title: "Play, pause and step",
    text: "Step back and forward, play or pause in the middle, and jump to the previous or next variation." },
  { target: ".list-nav", title: "Play, pause and step",
    text: "Step back and forward, with play and pause in the middle." },
  { target: ".demo-vars", title: "Variations", text: "Jump to the previous or next variation of this opening." },
  { target: "#new-game", title: "New game", text: "Choose another opening, or practise this one in a match." },
];

export const STATS_TOUR: TourStep[] = [
  { target: ".stats-card", title: "Accuracy",
    text: "How accurately each player played: over the whole game, then the opening, middlegame and endgame. Tap More for a count of every grade." },
  { target: ".rating-row", title: "Rating",
    text: "Roughly how strongly each side played in this game, judged by how much they gave away move by move." },
  { target: ".stats-start", title: "The review", text: "Go through the game move by move, from the start." },
  { target: ".view-tabs", title: "Tabs", text: "Back to the board, or on to your game history." },
];

export const HISTORY_TOUR: TourStep[] = [
  { target: ".history-colours", title: "Your colour", text: "Show all your games, or only those as White or Black." },
  { target: ".history-record", title: "Your record",
    text: "Wins, draws and losses. Tap them to show only those games; they combine with the colour." },
  { target: ".history-list", title: "Your games", text: "Tap a game to replay it with me." },
];

export const PLAY_TOUR: TourStep[] = [
  ...BOARD_STEPS,
  { target: ".board-controls", title: "Moving through the game",
    text: "Step back to look at earlier moves, flip the board, or resign with the white flag." },
  { target: ".view-tabs", title: "Statistics and history",
    text: "After the game: accuracy and an estimated rating, and your record against Stockfish." },
  { target: ".game-top .gear-button", title: "Settings",
    text: "Theme, board, pieces, sounds, your name, and more." },
  { target: "#new-game", title: "New game",
    text: "Back to the start. After a game I'll offer to go through it with you." },
];

export function tourSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOUR_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** The tour for the mode on screen: automatically only the first time
 *  (unless "No thanks" was pressed without the tick), or when asked for. */
export async function showTour(asked: boolean) {
  if (menuOpen || tourOpen() || (demo && !asked)) return;
  const which = mode;
  const seen = tourSeen();
  if (!asked && seen[which]) return;
  const [steps, title] = currentView === "stats" ? [STATS_TOUR, "Statistics"]
    : currentView === "history" ? [HISTORY_TOUR, "Game history"]
    : demo ? [DEMO_TOUR, "Learn an opening"]
    : which === "practice" ? [PRACTICE_TOUR, "Practice mode tour"] : [PLAY_TOUR, "Play mode tour"];
  const end = await runTour(steps, title);
  if (end.finished || end.neverAgain || asked) {
    try {
      localStorage.setItem(TOUR_KEY, JSON.stringify({ ...seen, [which]: end.neverAgain ? "never" : "seen" }));
    } catch {
      // storage blocked: it may be offered again next time
    }
  }
  refresh();
}

/** The ? button: About, and (in a game) a tour of the screen you're on. */
export function toggleHelp(anchor: HTMLElement) {
  const box = $("help-menu");
  if (!box.hidden) {
    box.hidden = true;
    return;
  }
  box.replaceChildren();
  const item = (text: string, run: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = text;
    button.addEventListener("click", () => {
      box.hidden = true;
      run();
    });
    box.append(button);
  };
  if (!menuOpen) item("Show me around this screen", () => void showTour(true));
  item("About and licences", () => window.open("./about.html", "_blank"));
  const rect = anchor.getBoundingClientRect();
  box.hidden = false;
  box.style.top = `${rect.bottom + 6}px`;
  box.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
}
