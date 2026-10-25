// Games from Lichess and chess.com: read from answers shaped like theirs (no
// network): your side, the result, the opening, and which games are wanted.
import { chesscomOpening, fetchChesscom, fetchLichess, fromChesscom, fromLichess } from "../../src/online";

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

  return { name: "Games from Lichess and chess.com", checks, failures };
}
