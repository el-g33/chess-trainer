// PGN: the standard text format for chess games (what lichess, chess.com and
// every chess program use). Reading a file with one or more games, and
// writing a game so it can be downloaded.
import { makeFen, INITIAL_FEN } from "chessops/fen";
import { parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";
import type { NormalMove } from "chessops/types";

import { Game } from "./game";

export type Headers = Record<string, string>;

export interface PgnGame {
  headers: Headers;
  title: string; // "White - Black (1-0, 2026.10.18)" for choosing from a list
  load(): { game: Game; problem?: string };
}

/** All the games in a PGN text (only the main line of each; side
 *  variations and comments are left out). */
export function readPgn(text: string): PgnGame[] {
  return parsePgn(text).map((parsed) => {
    const headers: Headers = Object.fromEntries(parsed.headers);
    const white = headers.White && headers.White !== "?" ? headers.White : "White";
    const black = headers.Black && headers.Black !== "?" ? headers.Black : "Black";
    const extras = [headers.Result && headers.Result !== "*" ? headers.Result : "", cleanDate(headers.Date)]
      .filter(Boolean)
      .join(", ");
    return {
      headers,
      title: `${white} - ${black}${extras ? ` (${extras})` : ""}`,
      load() {
        const start = startingPosition(parsed.headers);
        if (start.isErr) return { game: new Game(), problem: "The game's starting position (FEN) isn't valid." };
        const position = start.value;
        const game = new Game(makeFen(position.toSetup()));
        for (const node of parsed.moves.mainline()) {
          const move = parseSan(game.position, node.san) as NormalMove | undefined;
          if (!move) {
            const number = Math.floor(game.length / 2) + 1;
            return { game, problem: `Move ${number} (${node.san}) isn't legal here, so the game stops just before it.` };
          }
          game.play(move);
        }
        return { game };
      },
    };
  });
}

const cleanDate = (date?: string) => (date && !date.includes("?") ? date : "");

/** A game as PGN text. */
export function writePgn(game: Game, headers: Headers): string {
  const start = game.positionAt(0);
  const all: Headers = {
    Event: headers.Event ?? "Chess Trainer game",
    Site: headers.Site ?? "https://el-g33.github.io/chess-trainer/",
    Date: headers.Date ?? today(),
    Round: headers.Round ?? "-",
    White: headers.White ?? "?",
    Black: headers.Black ?? "?",
    Result: headers.Result ?? "*",
    ...headers,
  };
  const fen = makeFen(start.toSetup());
  if (fen !== INITIAL_FEN) {
    all.SetUp = "1";
    all.FEN = fen;
  }
  const tags = Object.entries(all).map(([key, value]) => `[${key} "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`);

  // Moves: "1. e4 e5 2. Nf3", or "5... Nc6 6. d4" when the game starts with Black
  const words: string[] = [];
  game.moves.forEach((played, index) => {
    const position = game.positionAt(index);
    if (position.turn === "white") words.push(`${position.fullmoves}.`);
    else if (index === 0) words.push(`${position.fullmoves}...`);
    words.push(played.san);
  });
  words.push(all.Result);

  // Lines of at most 80 characters, as the PGN standard asks
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > 80) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return `${tags.join("\n")}\n\n${lines.join("\n")}\n`;
}

/** Today in PGN's date format, e.g. "2026.10.18". */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** Hands a text file to the viewer to save (downloads on a PC, Files on a phone). */
export function saveFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-chess-pgn" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
