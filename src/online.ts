// Your games on Lichess and chess.com, read from their public APIs by
// username (both allow it from a web page, with no login). Only reads: the
// app never posts anything. Lichess gives the latest games in one request;
// chess.com keeps them in monthly archives, read newest month first.

import type { Color } from "chessops/types";

import { type PgnGame, writePgn } from "./pgn";

export type Source = "lichess" | "chesscom";

export const SOURCE_NAMES: Record<Source, string> = { lichess: "Lichess", chesscom: "chess.com" };

export interface OnlineGame {
  source: Source;
  id: string; // "lichess:abcd1234", "chesscom:123456789"
  date: string; // ISO, when it ended (chess.com) or started (Lichess)
  pgn: string;
  user: Color;
  opponent: string;
  opponentRating?: number;
  speed: string; // "Bullet", "Blitz", "Rapid", "Classical", "Daily"
  timeControl: string; // "600+5", "" for daily games
  result: "win" | "draw" | "loss";
  opening: string; // the family, e.g. "Italian Game"
}

/** Which games to get: the newest (max), only newer than `since`, or older than `before` (ms). */
export interface Wanted {
  max: number;
  since?: number;
  before?: number;
}

export class OnlineError extends Error {}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// -- Lichess ---------------------------------------------------------------------

interface LichessGame {
  id: string;
  variant: string;
  speed: string;
  createdAt: number;
  status: string;
  winner?: Color;
  players: Record<Color, { user?: { name: string }; rating?: number; aiLevel?: number }>;
  clock?: { initial: number; increment: number };
  opening?: { name: string };
  pgn?: string;
}

export function fromLichess(game: LichessGame, username: string): OnlineGame | null {
  if (game.variant !== "standard" || !game.pgn) return null;
  const user: Color | null = same(game.players.white.user?.name ?? "", username) ? "white"
    : same(game.players.black.user?.name ?? "", username) ? "black" : null;
  if (!user || game.status === "created" || game.status === "started") return null; // only finished games
  const them = game.players[user === "white" ? "black" : "white"];
  return {
    source: "lichess",
    id: `lichess:${game.id}`,
    date: new Date(game.createdAt).toISOString(),
    pgn: game.pgn,
    user,
    opponent: them.user?.name ?? (them.aiLevel ? `Stockfish level ${them.aiLevel}` : "Anonymous"),
    opponentRating: them.rating,
    speed: game.speed === "correspondence" ? "Daily" : cap(game.speed),
    timeControl: game.clock ? `${game.clock.initial}+${game.clock.increment}` : "",
    result: !game.winner ? "draw" : game.winner === user ? "win" : "loss",
    opening: game.opening?.name.split(":")[0] ?? "",
  };
}

export async function fetchLichess(username: string, wanted: Wanted, get: Fetch = fetch): Promise<OnlineGame[]> {
  const query = new URLSearchParams({ max: String(wanted.max), pgnInJson: "true", opening: "true", clocks: "false", evals: "false" });
  if (wanted.since) query.set("since", String(wanted.since + 1));
  if (wanted.before) query.set("until", String(wanted.before - 1));
  const response = await reach("Lichess", () =>
    get(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${query}`, { headers: { Accept: "application/x-ndjson" } }));
  if (response.status === 404) throw new OnlineError(`There's no Lichess player called "${username}".`);
  if (response.status === 429) throw new OnlineError("Lichess asks us to wait a minute before getting more games.");
  if (!response.ok) throw new OnlineError(`Lichess didn't answer properly (error ${response.status}). Try again later.`);
  const text = await response.text();
  return text.split("\n").filter((line) => line.trim())
    .map((line) => fromLichess(JSON.parse(line) as LichessGame, username))
    .filter((game): game is OnlineGame => game !== null);
}

// -- chess.com --------------------------------------------------------------------

interface ChesscomPlayer {
  username: string;
  rating?: number;
  result: string;
}

interface ChesscomGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number; // seconds
  time_class: string;
  rules: string;
  white: ChesscomPlayer;
  black: ChesscomPlayer;
}

const DRAWS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
const FAMILY_ENDS = new Set(["Game", "Opening", "Defense", "Defence", "Gambit", "Attack", "System", "Countergambit"]);

/** The opening family from the PGN's ECOUrl ("…/openings/Italian-Game-Giuoco-Piano…" → "Italian Game"). */
export function chesscomOpening(pgn: string): string {
  const slug = pgn.match(/\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/)?.[1];
  if (!slug) return "";
  const words: string[] = [];
  for (const word of slug.split("-")) {
    if (/^\d/.test(word)) break; // the moves start
    words.push(word);
    if (FAMILY_ENDS.has(word)) break;
  }
  return words.join(" ").replace(/^Queens /, "Queen's ").replace(/^Kings /, "King's ").replace(/^Caro Kann/, "Caro-Kann");
}

export function fromChesscom(game: ChesscomGame, username: string): OnlineGame | null {
  if (game.rules !== "chess" || !game.pgn) return null;
  const user: Color | null = same(game.white.username, username) ? "white" : same(game.black.username, username) ? "black" : null;
  if (!user) return null;
  const me = game[user];
  const them = game[user === "white" ? "black" : "white"];
  return {
    source: "chesscom",
    id: `chesscom:${game.url.split("/").pop()}`,
    date: new Date(game.end_time * 1000).toISOString(),
    pgn: game.pgn,
    user,
    opponent: them.username,
    opponentRating: them.rating,
    speed: cap(game.time_class),
    timeControl: game.time_class === "daily" ? "" : game.time_control.includes("+") ? game.time_control : `${game.time_control}+0`,
    result: me.result === "win" ? "win" : DRAWS.has(me.result) ? "draw" : "loss",
    opening: chesscomOpening(game.pgn),
  };
}

export async function fetchChesscom(username: string, wanted: Wanted, get: Fetch = fetch): Promise<OnlineGame[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games`;
  const archives = await reach("chess.com", () => get(`${base}/archives`));
  if (archives.status === 404) throw new OnlineError(`There's no chess.com player called "${username}".`);
  if (!archives.ok) throw new OnlineError(`chess.com didn't answer properly (error ${archives.status}). Try again later.`);
  const months: string[] = ((await archives.json()) as { archives?: string[] }).archives ?? [];
  const found: OnlineGame[] = [];
  for (const month of [...months].reverse()) {
    // a month that ended before what's wanted can be skipped without reading it
    const [year, number] = month.split("/").slice(-2).map(Number);
    const monthEnd = Date.UTC(year, number, 1);
    if (wanted.since && monthEnd <= wanted.since) break;
    if (wanted.before && Date.UTC(year, number - 1, 1) >= wanted.before) continue;
    const response = await reach("chess.com", () => get(month));
    if (!response.ok) break;
    const games = ((await response.json()) as { games?: ChesscomGame[] }).games ?? [];
    for (const game of games.sort((a, b) => b.end_time - a.end_time)) {
      const ended = game.end_time * 1000;
      if ((wanted.since && ended <= wanted.since) || (wanted.before && ended >= wanted.before)) continue;
      const made = fromChesscom(game, username);
      if (made) found.push(made);
      if (found.length >= wanted.max) return found;
    }
  }
  return found;
}

async function reach(site: string, ask: () => Promise<Response>): Promise<Response> {
  try {
    return await ask();
  } catch {
    throw new OnlineError(`Couldn't reach ${site}. Check your connection and try again.`);
  }
}

// -- A PGN file -----------------------------------------------------------------
// Games downloaded from Lichess or chess.com as a .pgn file, brought into Game
// history from the file itself: the app doesn't contact either site.

/** Who you are in a file of games: one of your names if it plays in them,
 *  otherwise the one player in every game (a file of your own games). */
export function youIn(games: Record<string, string>[], known: string[]): string | null {
  const names = known.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const count = new Map<string, number>();
  for (const headers of games) {
    for (const name of new Set([headers.White, headers.Black].map((n) => (n ?? "").toLowerCase()))) {
      if (name && name !== "?") count.set(name, (count.get(name) ?? 0) + 1);
    }
  }
  const mine = names.filter((n) => count.has(n)).sort((a, b) => count.get(b)! - count.get(a)!)[0];
  if (mine) return mine;
  const everywhere = [...count].filter(([, n]) => n === games.length).map(([name]) => name);
  return games.length > 1 && everywhere.length === 1 ? everywhere[0] : null;
}

/** A PGN date and time ("2026.10.31", "12:34:56", in UTC) as ISO. */
function isoFrom(date?: string, time?: string): string | null {
  if (!date || !/^\d{4}\.\d{2}\.\d{2}$/.test(date)) return null;
  const when = new Date(`${date.replace(/\./g, "-")}T${time && /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : "00:00:00"}Z`);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/** How fast: the base time plus 40 moves' increments, as each site counts it. */
function speedOf(source: Source, timeControl: string, daily: boolean): string {
  if (daily || !/^\d+(\+\d+)?$/.test(timeControl)) return "Daily";
  const [base, increment = 0] = timeControl.split("+").map(Number);
  const estimate = base + 40 * increment;
  if (estimate < 180) return "Bullet";
  if (source === "chesscom") return estimate < 600 ? "Blitz" : "Rapid";
  return estimate < 480 ? "Blitz" : estimate < 1500 ? "Rapid" : "Classical";
}

/** The games in a file that are yours, finished, standard chess, from Lichess
 *  or chess.com, ready for Game history (the moves without the clock times). */
export function fromPgnFile(games: PgnGame[], you: string): { games: OnlineGame[]; skipped: number } {
  const found: OnlineGame[] = [];
  for (const parsed of games) {
    const h = parsed.headers;
    const source: Source | null = /lichess\.org/i.test(h.Site ?? "") ? "lichess"
      : /chess\.com/i.test(`${h.Site ?? ""} ${h.Link ?? ""}`) ? "chesscom" : null;
    const user: Color | null = same(h.White ?? "", you) ? "white" : same(h.Black ?? "", you) ? "black" : null;
    const result = h.Result;
    if (!source || !user || !["1-0", "0-1", "1/2-1/2"].includes(result ?? "") || (h.Variant && !/^standard$/i.test(h.Variant))) continue;
    const { game, problem } = parsed.load();
    if (problem || !game.length) continue;
    const date = source === "chesscom"
      ? isoFrom(h.EndDate, h.EndTime) ?? isoFrom(h.UTCDate, h.UTCTime) ?? isoFrom(h.Date)
      : isoFrom(h.UTCDate, h.UTCTime) ?? isoFrom(h.Date);
    if (!date) continue;
    const site = source === "lichess" ? (h.GameId || (h.Site ?? "").split("/").pop()) : (h.Link ?? "").split("/").pop();
    const them: Color = user === "white" ? "black" : "white";
    const rating = parseInt(them === "white" ? h.WhiteElo : h.BlackElo, 10);
    const timeControl = h.TimeControl ?? "";
    const daily = /\/daily\//.test(h.Link ?? "") || timeControl.includes("/");
    found.push({
      source,
      id: `${source}:${site || `${date}-${h.White}-${h.Black}`}`,
      date,
      pgn: writePgn(game, h),
      user,
      opponent: (them === "white" ? h.White : h.Black) || "Anonymous",
      ...(Number.isFinite(rating) ? { opponentRating: rating } : {}),
      speed: speedOf(source, timeControl, daily),
      timeControl: daily || !/^\d+(\+\d+)?$/.test(timeControl) ? "" : timeControl.includes("+") ? timeControl : `${timeControl}+0`,
      result: result === "1/2-1/2" ? "draw" : (result === "1-0") === (user === "white") ? "win" : "loss",
      opening: source === "chesscom" ? chesscomOpening(`[ECOUrl "${h.ECOUrl ?? ""}"]`) : (h.Opening ?? "").split(":")[0],
    });
  }
  return { games: found, skipped: games.length - found.length };
}
