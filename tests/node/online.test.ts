// Games from Lichess and chess.com: read from answers shaped like theirs (no
// network): your side, the result, the opening, and which games are wanted.
import { chesscomOpening, fetchChesscom, fetchLichess, fromChesscom, fromLichess, fromPgnFile, youIn } from "../../src/online";
import { readPgn } from "../../src/pgn";

const PGN = '[Event "x"]\n[ECOUrl "https://www.chess.com/openings/Italian-Game-Giuoco-Piano-4.c3"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0';

const lichess = (id: string, createdAt: number, white: string, black: string, winner?: "white" | "black") => ({
  id, variant: "standard", speed: "blitz", createdAt, status: winner ? "mate" : "draw", winner,
  players: { white: { user: { name: white }, rating: 1500 }, black: { user: { name: black }, rating: 1450 } },
  clock: { initial: 180, increment: 2 }, opening: { name: "Italian Game: Giuoco Piano" }, pgn: PGN,
});

const chesscom = (id: number, end: number, white: string, wResult: string, black: string, bResult: string) => ({
  url: `https://www.chess.com/game/live/${id}`, pgn: PGN, time_control: "600", end_time: end, time_class: "rapid", rules: "chess",
  white: { username: white, rating: 1520, result: wResult }, black: { username: black, rating: 1480, result: bResult },
});

const answer = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

export default async function run() {
  const failures: string[] = [];
  let checks = 0;
  const expect = (what: string, ok: boolean, detail = "") => {
    checks++;
    if (!ok) failures.push(`${what}${detail ? `: ${detail}` : ""}`);
  };

  // -- Lichess
  const li = fromLichess(lichess("ab12", Date.UTC(2026, 9, 20), "Bob", "Me_Here", "white"), "me_here")!;
  expect("Lichess: your side (any case)", li.user === "black");
  expect("Lichess: a loss", li.result === "loss");
  expect("Lichess: the opponent and rating", li.opponent === "Bob" && li.opponentRating === 1500);
  expect("Lichess: the opening family", li.opening === "Italian Game", li.opening);
  expect("Lichess: speed and clock", li.speed === "Blitz" && li.timeControl === "180+2");
  expect("Lichess: a draw", fromLichess(lichess("cd", 0, "me", "x"), "me")!.result === "draw");
  expect("Lichess: other variants left out", fromLichess({ ...lichess("v", 0, "me", "x"), variant: "chess960" }, "me") === null);
  let asked = "";
  const games = await fetchLichess("me", { max: 2, since: 1000 }, async (url) => {
    asked = url;
    return answer([lichess("a", 5000, "me", "x", "white"), lichess("b", 4000, "x", "me", "white")].map((g) => JSON.stringify(g)).join("\n") + "\n");
  });
  expect("Lichess: games read", games.length === 2 && games[0].result === "win" && games[1].result === "loss");
  expect("Lichess: asks only for newer games", asked.includes("since=1001") && asked.includes("max=2"), asked);
  let message = "";
  try {
    await fetchLichess("nobody", { max: 5 }, async () => answer({ error: "Not found" }, 404));
  } catch (error) {
    message = String((error as Error).message);
  }
  expect("Lichess: an unknown username is explained", message.includes("no Lichess player"), message);

  // -- chess.com
  expect("chess.com: opening from the ECO link", chesscomOpening(PGN) === "Italian Game", chesscomOpening(PGN));
  expect("chess.com: Queen's Gambit", chesscomOpening('[ECOUrl "https://www.chess.com/openings/Queens-Gambit-Declined-2...e6"]') === "Queen's Gambit");
  const cc = fromChesscom(chesscom(99, 1_760_000_000, "Me", "win", "Anna", "resigned"), "me")!;
  expect("chess.com: your side and a win", cc.user === "white" && cc.result === "win");
  expect("chess.com: id, opponent and clock", cc.id === "chesscom:99" && cc.opponent === "Anna" && cc.timeControl === "600+0");
  expect("chess.com: a draw", fromChesscom(chesscom(1, 0, "x", "agreed", "me", "agreed"), "me")!.result === "draw");
  const months = ["https://api.chess.com/pub/player/me/games/2026/09", "https://api.chess.com/pub/player/me/games/2026/10"];
  const read: string[] = [];
  const fake = async (url: string) => {
    read.push(url);
    if (url.endsWith("/archives")) return answer({ archives: months });
    if (url.endsWith("2026/10")) return answer({ games: [chesscom(3, Date.UTC(2026, 9, 3) / 1000, "me", "win", "a", "lose"), chesscom(4, Date.UTC(2026, 9, 9) / 1000, "b", "win", "me", "checkmated")] });
    return answer({ games: [chesscom(1, Date.UTC(2026, 8, 5) / 1000, "me", "win", "c", "resigned")] });
  };
  const latest = await fetchChesscom("Me", { max: 2 }, fake);
  expect("chess.com: newest first, stops at max", latest.map((g) => g.id).join() === "chesscom:4,chesscom:3", latest.map((g) => g.id).join());
  expect("chess.com: older months not read when not needed", !read.some((u) => u.endsWith("2026/09")));
  read.length = 0;
  const older = await fetchChesscom("me", { max: 5, before: Date.UTC(2026, 9, 1) }, fake);
  expect("chess.com: older games only", older.map((g) => g.id).join() === "chesscom:1" && !read.some((u) => u.endsWith("2026/10")), older.map((g) => g.id).join());
  read.length = 0;
  const newer = await fetchChesscom("me", { max: 5, since: Date.UTC(2026, 9, 5) }, fake);
  expect("chess.com: newer games only", newer.map((g) => g.id).join() === "chesscom:4" && !read.some((u) => u.endsWith("2026/09")), newer.map((g) => g.id).join());

  // -- A .pgn file downloaded from chess.com or Lichess
  const tags = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `[${k} "${v}"]`).join("\n");
  const file = [
    tags({ Event: "Live Chess", Site: "Chess.com", White: "Me_Here", Black: "Ann", Result: "0-1", WhiteElo: "900", BlackElo: "950",
      TimeControl: "300", EndDate: "2026.10.31", EndTime: "12:00:00", Link: "https://www.chess.com/game/live/111",
      ECOUrl: "https://www.chess.com/openings/Italian-Game-Giuoco-Piano-4.c3" }) + "\n\n1. e4 {[%clk 0:04:59]} e5 {[%clk 0:04:58]} 0-1",
    tags({ Event: "Let's Play", Site: "Chess.com", White: "Bo", Black: "me_here", Result: "1/2-1/2", TimeControl: "1/259200",
      EndDate: "2026.10.01", Link: "https://www.chess.com/game/daily/222" }) + "\n\n1. d4 d5 1/2-1/2",
    tags({ Event: "Rated Blitz game", Site: "https://lichess.org/abcd1234", White: "me_here", Black: "Cy", Result: "1-0", TimeControl: "180+2",
      UTCDate: "2026.09.02", UTCTime: "08:00:00", Opening: "Sicilian Defense: Najdorf" }) + "\n\n1. e4 c5 1-0",
    tags({ Event: "Live Chess", Site: "Chess.com", White: "me_here", Black: "Dee", Result: "*", Link: "https://www.chess.com/game/live/333" }) + "\n\n1. e4 *",
    tags({ Event: "Live Chess", Site: "Chess.com", White: "me_here", Black: "Ed", Result: "1-0", Variant: "Chess960",
      Link: "https://www.chess.com/game/live/444", FEN: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", SetUp: "1" }) + "\n\n1. e4 1-0",
  ].join("\n\n");
  const parsed = readPgn(file);
  expect("File: you, the player in every game", youIn(parsed.map((g) => g.headers), []) === "me_here");
  expect("File: you, from your names", youIn(parsed.slice(0, 1).map((g) => g.headers), ["", "ann"]) === "ann");
  expect("File: one game and no names, unknown", youIn(parsed.slice(0, 1).map((g) => g.headers), []) === null);
  const { games: got, skipped } = fromPgnFile(parsed, "ME_HERE");
  expect("File: unfinished and variant games left out", got.length === 3 && skipped === 2, `${got.length} ${skipped}`);
  const [live, daily, li2] = got;
  expect("File: chess.com id as its import made it", live.id === "chesscom:111" && li2.id === "lichess:abcd1234", `${live.id} ${li2.id}`);
  expect("File: side, result and opponent", live.user === "white" && live.result === "loss" && live.opponent === "Ann" && live.opponentRating === 950);
  expect("File: date from when it ended", live.date === "2026-10-31T12:00:00.000Z", live.date);
  expect("File: speed and clock", live.speed === "Blitz" && live.timeControl === "300+0" && daily.speed === "Daily" && daily.timeControl === "" && li2.speed === "Blitz");
  expect("File: draws, and Black's side", daily.user === "black" && daily.result === "draw");
  expect("File: openings", live.opening === "Italian Game" && li2.opening === "Sicilian Defense", `${live.opening} / ${li2.opening}`);
  expect("File: clock times left out of what's kept", !live.pgn.includes("%clk") && live.pgn.includes("1. e4 e5"));
  return { name: "Games from Lichess and chess.com", checks, failures };
}
