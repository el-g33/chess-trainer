// Page elements

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const menu = $("menu");
export const menuCard = $<HTMLFormElement>("menu-card");
export const settingsDialog = $<HTMLDialogElement>("settings-dialog");
export const profileDialog = $<HTMLDialogElement>("profile-dialog");
export const opponentBox = $<HTMLSelectElement>("opponent");
export const levelBox = $<HTMLSelectElement>("level");
export const colourBox = $<HTMLSelectElement>("colour");
export const timeControlBox = $<HTMLSelectElement>("time-control");
export const tcMinutes = $<HTMLInputElement>("tc-minutes");
export const tcIncrement = $<HTMLInputElement>("tc-increment");
export const clockTickBox = $<HTMLInputElement>("clock-tick");
export const sfOpeningBox = $<HTMLSelectElement>("sf-opening");
export const myOpeningBox = $<HTMLSelectElement>("my-opening");
export const engineStatus = $("engine-status");
export const moveList = $("move-list");
export const viewLabel = $("view-label");
export const openingLabel = $("opening-label");
export const repertoireLabel = $("repertoire-label");
export const turnLabel = $("turn");
export const gameInfo = $("game-info");
export const resignButton = $<HTMLButtonElement>("resign");
export const reviewButton = $<HTMLButtonElement>("review-game");
export const exitAnalysisButton = $<HTMLButtonElement>("exit-analysis");
export const reviewArea = $("review-area");
export const reviewBox = $("review");
export const reviewProgress = $("review-progress");
export const rateMovesBox = $<HTMLInputElement>("rate-moves");
export const replyButton = $<HTMLButtonElement>("reply-button");
export const modeTitle = $("mode-title");
export const evalBar = $("eval-bar");
export const evalCheck = $<HTMLInputElement>("eval-check");
export const coachPanel = $("coach");
export const demoPanel = $("demo-panel");
export const showDemoButton = $<HTMLButtonElement>("show-demo");
export const demoPlay = $<HTMLButtonElement>("demo-play");
export const demoPick = $<HTMLSelectElement>("demo-pick");
export const coachText = $("coach-text");
export const coachStatus = $("coach-status");
export const quizScoreLabel = $("quiz-score");
export const toolButtons = {
  threat: $<HTMLButtonElement>("threat-button"),
  plan: $<HTMLButtonElement>("plan-button"),
  quiz: $<HTMLButtonElement>("quiz-button"),
  ideas: $<HTMLButtonElement>("ideas-button"),
  brilliant: $<HTMLButtonElement>("brilliant-button"),
};
export const lineBack = $<HTMLButtonElement>("line-back");
export const lineForward = $<HTMLButtonElement>("line-forward");
export const lineExit = $<HTMLButtonElement>("line-exit");
export const undoButton = $<HTMLButtonElement>("undo");
export const newButton = $<HTMLButtonElement>("new-game");
export const fenInput = $<HTMLInputElement>("fen");
export const themeBox = $<HTMLSelectElement>("board-theme");
export const soundOn = $<HTMLInputElement>("sound-on");
export const soundVolume = $<HTMLInputElement>("sound-volume");
export const soundStyleBox = $<HTMLSelectElement>("sound-style");
export const playerNameBox = $<HTMLInputElement>("player-name");
export const lichessUserBox = $<HTMLInputElement>("lichess-user");
export const chesscomUserBox = $<HTMLInputElement>("chesscom-user");
export const uiThemeBox = $<HTMLSelectElement>("ui-theme");
export const piecesBox = $<HTMLSelectElement>("pieces");
export const planModeBox = $<HTMLSelectElement>("plan-mode");
export const reviewDepthBox = $<HTMLSelectElement>("review-depth");
export const arrowStyleBox = $<HTMLSelectElement>("arrow-style");
export const coachSpeedBox = $<HTMLSelectElement>("coach-speed");
export const coachFocusBox = $<HTMLSelectElement>("coach-focus"); // fundamentals only, everything, or by level
export const planModeRow = $("plan-mode-row");
// « ‹ › » - above the move list, and (on phones) right under the board
export const navButtons = [...document.querySelectorAll<HTMLButtonElement>("button[data-nav]")];
