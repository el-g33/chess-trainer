// Buttons and keys

import { opposite } from "chessops/util";

import { drawIcons } from "../icons";
import { applyArrowStyle, currentPly, ground } from "../main";
import { setPalette } from "../pieces";
import { play, unlockSounds } from "../sounds";
import { setTypeSpeed } from "../talk";
import { tourOpen } from "../tour";

import {
  backUp, checkForUpdates, closeOverlay, closeStepper, drawDataCounts, onHome, onNewGame, openMore, overlay,
  overlayOpen, restartIntoUpdate, restoreFromFile, setHistoryFromReview, stepTo, stepTyper, stripTyper,
} from "./coach";
import { drawLookRows } from "./lookPickers";
import { setupOnlineGames } from "./onlineGames";
import {
  $, arrowStyleBox, coachSpeedBox, demoPick, demoPlay, evalCheck, exitAnalysisButton, fenInput, lineBack, lineExit,
  lineForward, navButtons, newButton, piecesBox, planModeBox, playerNameBox, lichessUserBox, chesscomUserBox,
  rateMovesBox, replyButton, resignButton,
  reviewButton, reviewDepthBox, settingsDialog, showDemoButton, soundOn, soundStyleBox, soundVolume, themeBox,
  toolButtons, uiThemeBox, undoButton,
} from "./dom";
import { refresh } from "./draw";
import { toggleHelp } from "./featureTour";
import { backToStats, onResign, onReviewGame, stopPreparing } from "./matches";
import { exitAnalysis, goTo, navigate, onUndo, readFen } from "./moves";
import { loadDemoLine, onDemoExit, onDemoPlay, onDemoTry, onNavPlay, onShowDemo } from "./openingDemos";
import { openPgnDialog, openSave, pgnText, readPgnText, saveCopy, saveDownload, saveTarget } from "./pgnScreens";
import { clockTick } from "./playerBars";
import { closeDialog, dialog } from "./popups";
import { saveSettings, setupSettingsTabs } from "./settings";
import { THEME_BOARDS, applySound, applyTheme, applyUiTheme, showMenu } from "./startMenu";
import { drawHome } from "./startScreens";
import { orientation, currentView, demo, menuOpen, preview, set, showReply, stepper } from "./state";
import { exitPreview, onQuizButton, startTask, stepPreview } from "./strategyCoach";
import { noteLevelCheck, startLevelCheck } from "./train";

export function wireButtons() {
  setupOnlineGames();
  setupSettingsTabs();
  $("dialog-ok").addEventListener("click", (event) => {
    event.preventDefault();
    closeDialog(true);
  });
  $("dialog-cancel").addEventListener("click", (event) => {
    event.preventDefault();
    closeDialog(false);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault(); // Escape
    closeDialog(false);
  });

  for (const button of navButtons) button.addEventListener("click", () => navigate(button.dataset.nav as "first" | "back" | "forward" | "last"));
  $("whatif-exit").addEventListener("click", exitAnalysis);
  piecesBox.addEventListener("change", () => {
    setPalette(piecesBox.value);
    saveSettings();
    refresh();
  });
  uiThemeBox.addEventListener("change", () => {
    applyUiTheme();
    themeBox.value = THEME_BOARDS[uiThemeBox.value] ?? themeBox.value;
    applyTheme();
    piecesBox.value = uiThemeBox.value; // each theme has its own piece colours
    setPalette(piecesBox.value);
    saveSettings();
    refresh();
  });
  $("flip").addEventListener("click", () => {
    set.orientation(opposite(orientation));
    refresh();
  });
  newButton.addEventListener("click", () => void onNewGame());
  undoButton.addEventListener("click", onUndo);
  resignButton.addEventListener("click", () => void onResign());
  reviewButton.addEventListener("click", onReviewGame);
  exitAnalysisButton.addEventListener("click", exitAnalysis);
  replyButton.addEventListener("click", () => {
    set.showReply(!showReply);
    refresh();
  });
  rateMovesBox.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  evalCheck.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  fenInput.addEventListener("input", () => {
    readFen();
    drawHome();
  });
  $("settings-save").addEventListener("click", () => {
    settingsDialog.close();
    openSave();
  });
  $("save-copy").addEventListener("click", () => void saveCopy());
  $("save-file").addEventListener("click", saveDownload);
  window.setInterval(clockTick, 100);
  for (const control of [soundOn, soundVolume]) {
    control.addEventListener("input", () => {
      applySound();
      saveSettings();
    });
  }
  soundVolume.addEventListener("change", () => void play("move")); // let you hear the new volume
  soundStyleBox.addEventListener("change", () => {
    applySound();
    saveSettings();
    void play("move"); // let you hear the new style
  });
  // Browsers only play sound after the page has been touched or clicked
  document.addEventListener("pointerdown", unlockSounds, { once: true });
  document.addEventListener("keydown", unlockSounds, { once: true });
  $("open-pgn").addEventListener("click", openPgnDialog);
  for (const gear of document.querySelectorAll(".gear-button")) {
    gear.addEventListener("click", () => {
      // Saving the game is only offered in a game with something to save
      const target = menuOpen ? null : saveTarget();
      const save = $("settings-save");
      save.hidden = !target;
      save.lastChild!.textContent = currentView === "history" ? " Save all your games (PGN)" : " Save this game (PGN)";
      drawDataCounts();
      drawLookRows(); // the pieces' pictures may have loaded since
      settingsDialog.showModal();
    });
  }
  settingsDialog.addEventListener("close", () => refresh());
  for (const box of [playerNameBox, lichessUserBox, chesscomUserBox]) {
    box.addEventListener("change", () => {
      saveSettings();
      refresh();
    });
  }
  for (const help of document.querySelectorAll<HTMLElement>(".help-button")) {
    help.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHelp(help);
    });
  }
  document.addEventListener("pointerdown", (event) => {
    const menuBox = $("help-menu");
    if (!menuBox.hidden && !menuBox.contains(event.target as Node) && !(event.target as Element).closest?.(".help-button")) menuBox.hidden = true;
  });

  showDemoButton.addEventListener("click", () => void onShowDemo());
  demoPlay.addEventListener("click", onDemoPlay);
  $("demo-back").addEventListener("click", () => goTo(currentPly() - 1));
  $("demo-next").addEventListener("click", () => goTo(currentPly() + 1));
  $("demo-next-line").addEventListener("click", () => demo && loadDemoLine(demo.line + 1));
  demoPick.addEventListener("change", () => loadDemoLine(Number(demoPick.value)));
  $("demo-try").addEventListener("click", onDemoTry);
  $("strip-face").addEventListener("click", () => openMore());
  for (const button of document.querySelectorAll(".nav-play")) button.addEventListener("click", onNavPlay);
  for (const button of document.querySelectorAll(".var-prev")) button.addEventListener("click", () => demo && demo.line > 0 && loadDemoLine(demo.line - 1));
  for (const button of document.querySelectorAll(".var-next")) button.addEventListener("click", () => demo && demo.line + 1 < demo.demo.lines.length && loadDemoLine(demo.line + 1));
  $("home-button").addEventListener("click", () => void onHome());
  $("check-updates").addEventListener("click", () => void checkForUpdates());
  $("data-backup").addEventListener("click", () => void backUp());
  $("data-restore").addEventListener("click", () => $<HTMLInputElement>("data-file").click());
  $("data-file").addEventListener("change", () => void restoreFromFile());
  $("update-restart").addEventListener("click", () => void restartIntoUpdate());
  $("update-later").addEventListener("click", () => { $("update-toast").hidden = true; });
  $("prep-back").addEventListener("click", () => { stopPreparing(); showMenu(); });
  $("stats-back").addEventListener("click", backToStats);
  for (const tab of document.querySelectorAll<HTMLButtonElement>(".view-tabs button")) {
    tab.addEventListener("click", () => {
      set.currentView(tab.dataset.view as typeof currentView);
      setHistoryFromReview(false);
      refresh();
    });
  }
  $("step-back").addEventListener("click", () => stepper && stepTo(stepper.step - 1));
  $("step-next").addEventListener("click", () => stepper && stepTo(stepper.step + 1));
  $("step-close").addEventListener("click", closeStepper);
  overlay().addEventListener("click", (event) => {
    if (event.target === overlay()) closeOverlay();
  });
  drawIcons();
  $("demo-exit").addEventListener("click", onDemoExit);

  pgnText.addEventListener("input", readPgnText);
  $<HTMLInputElement>("pgn-file").addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    $("pgn-file-name").textContent = file.name;
    pgnText.value = await file.text();
    readPgnText();
  });
  reviewDepthBox.addEventListener("change", saveSettings); // (used from the next review)
  arrowStyleBox.addEventListener("change", () => {
    applyArrowStyle();
    saveSettings();
    refresh();
  });
  coachSpeedBox.addEventListener("change", () => {
    setTypeSpeed(Number(coachSpeedBox.value));
    saveSettings();
  });
  // Tap the coach's bubble: the whole sentence at once
  $("strip-text").addEventListener("click", () => stripTyper.finish());
  $("step-text").addEventListener("click", () => stepTyper.finish());
  $("level-check-start").addEventListener("click", () => void startLevelCheck());
  $("level-check-skip").addEventListener("click", () => {
    noteLevelCheck("skipped");
    drawHome();
  });
  planModeBox.addEventListener("change", () => {
    saveSettings();
    refresh();
  });
  themeBox.addEventListener("change", () => {
    applyTheme();
    saveSettings();
  });
  toolButtons.threat.addEventListener("click", () => void startTask("threat"));
  toolButtons.plan.addEventListener("click", () => void startTask("plan"));
  toolButtons.ideas.addEventListener("click", () => void startTask("ideas"));
  toolButtons.brilliant.addEventListener("click", () => void startTask("brilliant"));
  toolButtons.quiz.addEventListener("click", onQuizButton);
  lineBack.addEventListener("click", () => stepPreview(-1));
  lineForward.addEventListener("click", () => stepPreview(1));
  lineExit.addEventListener("click", exitPreview);

  document.addEventListener("keydown", (event) => {
    if (menuOpen || dialog.open || tourOpen()) return;
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement || settingsDialog.open) return;
    if (event.key === " " && event.target instanceof HTMLButtonElement) return; // the button's own click
    if (stepper && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Escape")) {
      event.preventDefault();
      if (event.key === "Escape") closeStepper();
      else stepTo(stepper.step + (event.key === "ArrowRight" ? 1 : -1));
      return;
    }
    if (overlayOpen() && event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
      return;
    }
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (preview ? stepPreview(-1) : navigate("back")),
      ArrowRight: () => (preview ? stepPreview(1) : navigate("forward")),
      Home: () => navigate("first"),
      End: () => navigate("last"),
      Escape: exitAnalysis,
      " ": () => demo && onDemoPlay(),
    };
    if (keys[event.key]) {
      event.preventDefault();
      keys[event.key]();
    }
  });

  // Redraw the board when its size changes (window resized, phone turned)
  new ResizeObserver(() => ground.redrawAll()).observe($("board"));
}
