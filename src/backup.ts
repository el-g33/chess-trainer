// Backups: everything the app keeps on the device (games, saved reviews,
// your mistakes, your progress, settings) in one small file, to keep
// somewhere safe or move to another device - and back again, either added to
// what's here (nothing lost) or replacing it.

const PREFIX = "chess-trainer-";
const NOTE_KEY = "chess-trainer-backup"; // when the last backup was made (not itself backed up)
const FORMAT = 1;

// What's in each part, and how two copies of it are put together
const LISTS: Record<string, string> = {
  "chess-trainer-history": "id", // your games
  "chess-trainer-mistakes": "id", // your mistakes, as puzzles
  "chess-trainer-progress": "key", // the summaries behind Your progress
};
const MAPS = new Set(["chess-trainer-analysis"]); // saved reviews, by game

interface BackupFile {
  app: "chess-trainer";
  format: number;
  made: string; // ISO date
  data: Record<string, string>; // storage key -> its stored text
}

export interface BackupContents {
  made: Date;
  games: number;
  newGames: number; // games in the backup that aren't on this device
  reviews: number;
  mistakes: number;
  data: Record<string, string>;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const parsed = <T>(text: string | null | undefined, fallback: T): T => {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

function ownKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && key !== NOTE_KEY) keys.push(key);
    }
  } catch {
    // storage blocked: nothing to back up
  }
  return keys;
}

/** How much is kept on this device (games: your own; ones from Lichess and
 *  chess.com can be got again, so they don't count towards the reminder). */
export function dataCounts(): { games: number; reviews: number; mistakes: number } {
  return {
    games: parsed<{ source?: string }[]>(read("chess-trainer-history"), []).filter((g) => !g.source).length,
    reviews: Object.keys(parsed<Record<string, unknown>>(read("chess-trainer-analysis"), {})).length,
    mistakes: parsed<unknown[]>(read("chess-trainer-mistakes"), []).length,
  };
}

/** The backup file, as text, and its name. */
export function makeBackup(): { name: string; text: string } {
  const data: Record<string, string> = {};
  for (const key of ownKeys()) data[key] = read(key) ?? "";
  const made = new Date();
  const file: BackupFile = { app: "chess-trainer", format: FORMAT, made: made.toISOString(), data };
  return { name: `chess-trainer-backup-${made.toISOString().slice(0, 10)}.json`, text: JSON.stringify(file) };
}

/** Note that a backup was made (for "last backup" and the reminder). */
export function noteBackup() {
  try {
    localStorage.setItem(NOTE_KEY, JSON.stringify({ ...backupNote(), made: Date.now(), games: dataCounts().games }));
  } catch {
    // storage blocked: the reminder may just come again
  }
}

export function backupNote(): { made?: number; games?: number; reminded?: number } {
  return parsed(read(NOTE_KEY), {});
}

/** The reminder: 10 or more games since the last backup, and not reminded in the last month. */
export function backupDue(): number {
  const note = backupNote();
  const games = dataCounts().games;
  const since = games - (note.games ?? 0);
  const month = 30 * 86_400_000;
  if (since < 10 || (note.reminded && Date.now() - note.reminded < month)) return 0;
  return since;
}

export function snoozeReminder() {
  try {
    localStorage.setItem(NOTE_KEY, JSON.stringify({ ...backupNote(), reminded: Date.now() }));
  } catch {
    // storage blocked
  }
}

/** Read a backup file: what's in it, or why it can't be used. */
export function readBackup(text: string): BackupContents | string {
  const file = parsed<Partial<BackupFile> | null>(text, null);
  if (!file || file.app !== "chess-trainer" || typeof file.data !== "object" || !file.data) {
    return "That isn't a Chess Trainer backup file.";
  }
  if ((file.format ?? 0) > FORMAT) return "That backup was made by a newer version of the app. Update the app first, then try again.";
  const data = file.data;
  const games = parsed<{ id?: string }[]>(data["chess-trainer-history"], []);
  const here = new Set(parsed<{ id?: string }[]>(read("chess-trainer-history"), []).map((g) => g.id));
  return {
    made: new Date(file.made ?? Date.now()),
    games: games.length,
    newGames: games.filter((g) => !here.has(g.id)).length,
    reviews: Object.keys(parsed<Record<string, unknown>>(data["chess-trainer-analysis"], {})).length,
    mistakes: parsed<unknown[]>(data["chess-trainer-mistakes"], []).length,
    data,
  };
}

/** Put a backup on this device: added to what's here, or replacing it all.
 *  Worked out in full first, so a failure leaves everything as it was. */
export function restoreBackup(backup: BackupContents, how: "add" | "replace"): boolean {
  const result: Record<string, string> = {};
  if (how === "replace") {
    Object.assign(result, backup.data);
  } else {
    for (const [key, incoming] of Object.entries(backup.data)) {
      const current = read(key);
      if (current === null) {
        result[key] = incoming;
        continue;
      }
      const id = LISTS[key];
      if (id) {
        // lists: everything here, plus what's missing from the backup
        const mine = parsed<Record<string, unknown>[]>(current, []);
        const have = new Set(mine.map((item) => item[id]));
        const merged = [...mine, ...parsed<Record<string, unknown>[]>(incoming, []).filter((item) => !have.has(item[id]))];
        // (games newest first, as the history lists them)
        if (key === "chess-trainer-history") merged.sort((x, y) => String(y.date).localeCompare(String(x.date)));
        result[key] = JSON.stringify(merged);
      } else if (MAPS.has(key)) {
        result[key] = JSON.stringify({ ...parsed<object>(incoming, {}), ...parsed<object>(current, {}) });
      }
      // anything else (settings, the tour): this device's own stays
    }
  }
  const before: Record<string, string> = {};
  for (const key of ownKeys()) before[key] = read(key) ?? "";
  try {
    if (how === "replace") for (const key of ownKeys()) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(result)) localStorage.setItem(key, value);
    return true;
  } catch {
    // full storage, say: put things back as they were
    try {
      for (const key of ownKeys()) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(before)) localStorage.setItem(key, value);
    } catch {
      // nothing more can be done
    }
    return false;
  }
}
