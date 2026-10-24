// What the app keeps on the device: your mistakes and their schedule, the
// Your progress summary, and backups (made, read back, added and replaced).
import { addMistakes, dueMistakes, loadMistakes, MASTERED, recordAttempt, today } from "../../src/mistakes";
import { picture, saveSummary } from "../../src/progress";
import { makeBackup, readBackup, restoreBackup } from "../../src/backup";

export default async function run() {
  const failures: string[] = [];
  let checks = 0;
  const expect = (what: string, ok: boolean, detail = "") => {
    checks++;
    if (!ok) failures.push(`${what}${detail ? `: ${detail}` : ""}`);
  };
  localStorage.clear();

  // -- Your mistakes: added once, due at once, then 1, 3, 7, 21 days, then mastered
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
  const base = { fen, best: "g8f6", kind: "mistake" as const, phase: "opening" as const, source: "a test" };
  expect("a mistake is added", addMistakes([base]) === 1);
  expect("the same mistake isn't added twice", addMistakes([base]) === 0);
  expect("a new mistake is due today", dueMistakes().length === 1);
  const id = loadMistakes()[0].id;
  const gaps: number[] = [];
  for (let i = 0; i < 4; i++) gaps.push(recordAttempt(id, true)!.due - today());
  expect("right answers space it out 1, 3, 7, 21 days", JSON.stringify(gaps) === "[1,3,7,21]", JSON.stringify(gaps));
  expect("a fifth right answer masters it", recordAttempt(id, true)!.stage === MASTERED);
  expect("a mastered mistake isn't due", dueMistakes().length === 0);
  const wrong = recordAttempt(id, false)!;
  expect("a wrong answer starts it again tomorrow", wrong.stage === 0 && wrong.due - today() === 1);

  // -- Your progress: the picture from game summaries
  const game = (key: string, accuracy: number, middlegame: number, slips: ("hanging" | "fork" | "other")[], result: "win" | "loss") =>
    saveSummary({ key, day: today(), colour: "white", opponent: "x", result, accuracy, phases: { opening: 90, middlegame, endgame: 80 }, slips, opening: "Italian Game" });
  game("g1", 60, 50, ["hanging", "hanging"], "loss");
  game("g2", 70, 60, ["hanging", "fork"], "win");
  game("g3", 80, 70, ["other"], "win");
  game("g3", 82, 72, ["other"], "win"); // reviewed again: replaces the old one
  const seen = picture();
  expect("a game reviewed again is counted once", seen.games === 3, String(seen.games));
  expect("the trend follows the games", JSON.stringify(seen.trend) === "[60,70,82]", JSON.stringify(seen.trend));
  expect("the weakest phase is found", seen.weakest === "middlegame" && seen.strongest === "opening", `${seen.weakest} / ${seen.strongest}`);
  expect("slips count once per game, most common first", seen.slips[0]?.kind === "hanging" && seen.slips[0]?.games === 2);
  expect("positional slips come last", seen.slips[seen.slips.length - 1]?.kind === "other");
  expect("openings add up", seen.openings[0]?.games === 3 && seen.openings[0]?.wins === 2);

  // -- Backups: made, read back, added (nothing lost) and replaced
  localStorage.setItem("chess-trainer-history", JSON.stringify([{ id: "a", date: "2026-10-01" }]));
  localStorage.setItem("chess-trainer-settings", JSON.stringify({ soundOn: true }));
  const { text } = makeBackup();
  const backup = readBackup(text);
  expect("a backup reads back", typeof backup !== "string");
  expect("a file that isn't a backup is refused", typeof readBackup("{\"hello\":1}") === "string");
  if (typeof backup !== "string") {
    localStorage.setItem("chess-trainer-history", JSON.stringify([{ id: "b", date: "2026-10-05" }]));
    localStorage.setItem("chess-trainer-settings", JSON.stringify({ soundOn: false }));
    expect("adding works", restoreBackup(backup, "add"));
    const games = JSON.parse(localStorage.getItem("chess-trainer-history")!).map((g: { id: string }) => g.id);
    expect("adding keeps what's here and brings in what's missing, newest first", JSON.stringify(games) === '["b","a"]', JSON.stringify(games));
    expect("adding keeps this device's settings", JSON.parse(localStorage.getItem("chess-trainer-settings")!).soundOn === false);
    expect("replacing works", restoreBackup(backup, "replace"));
    const after = JSON.parse(localStorage.getItem("chess-trainer-history")!).map((g: { id: string }) => g.id);
    expect("replacing makes it match the backup", JSON.stringify(after) === '["a"]', JSON.stringify(after));
  }
  localStorage.clear();
  return { name: "Your mistakes, progress and backups", checks, failures };
}
