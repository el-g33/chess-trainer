// Stockfish running in a Web Worker in the browser. It speaks UCI, the
// standard chess-engine text protocol: we send commands like "go movetime
// 1000" and read lines like "bestmove e2e4".

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

export interface SearchLimits {
  skill?: number; // Stockfish "Skill Level", 0-20
  depth?: number; // how many moves deep it may look (undefined: no limit)
  movetime: number; // milliseconds it may think
}

export interface AnalysisLine {
  cp?: number; // centipawns, from the side to move's point of view
  mate?: number; // or moves to mate (negative: the side to move gets mated)
  pv: string[]; // the moves Stockfish expects, in UCI form
}

export class Engine {
  private worker = new Worker(ENGINE_URL);
  private listeners: ((line: string) => void)[] = [];
  // One search at a time: each request waits for the one before to finish.
  private queue: Promise<unknown>;

  constructor() {
    this.worker.onmessage = (event: MessageEvent) => {
      const line = String(event.data);
      for (const listener of [...this.listeners]) listener(line);
    };
    this.queue = this.waitFor("uciok", "uci").then(() => this.waitFor("readyok", "isready"));
  }

  get ready(): Promise<void> {
    return this.queue.then(() => {});
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  /** Sends a command and resolves with the first line starting with `prefix`. */
  private waitFor(prefix: string, command?: string): Promise<string> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        if (line.startsWith(prefix)) {
          this.listeners = this.listeners.filter((l) => l !== listener);
          resolve(line);
        }
      };
      this.listeners.push(listener);
      if (command) this.send(command);
    });
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.queue.then(job, job);
    this.queue = result.catch(() => {});
    return result;
  }

  /** Forget the previous game (Stockfish keeps notes between positions). */
  newGame(): Promise<void> {
    return this.enqueue(async () => {
      this.send("ucinewgame");
      await this.waitFor("readyok", "isready");
    });
  }

  /** Stockfish's chosen move (in UCI form, e.g. "e2e4") for a FEN position. */
  bestMove(fen: string, limits: SearchLimits): Promise<string> {
    return this.enqueue(async () => {
      this.send(`setoption name Skill Level value ${limits.skill ?? 20}`);
      this.send(`position fen ${fen}`);
      const depth = limits.depth ? ` depth ${limits.depth}` : "";
      const line = await this.waitFor("bestmove", `go${depth} movetime ${Math.round(limits.movetime)}`);
      return line.split(" ")[1];
    });
  }

  /** Stockfish's top `lines` moves for a position, each with its score from
   *  the point of view of the side to move and the line it expects. */
  analyse(fen: string, movetimeMs: number, lines = 2, onlyMoves?: string[], depth?: number): Promise<AnalysisLine[]> {
    return this.enqueue(async () => {
      this.send("setoption name Skill Level value 20");
      this.send(`setoption name MultiPV value ${lines}`);
      this.send(`position fen ${fen}`);
      // Only these moves (standard UCI, castling as e1g1) are looked at
      const searchmoves = onlyMoves?.length ? ` searchmoves ${onlyMoves.join(" ")}` : "";
      const found = new Map<number, AnalysisLine>();
      const collect = (line: string) => {
        // e.g. "info depth 14 seldepth 18 multipv 1 score cp 32 nodes ... pv e2e4 e7e5 g1f3"
        if (!line.startsWith("info ") || !line.includes(" pv ")) return;
        if (line.includes(" lowerbound") || line.includes(" upperbound")) return; // not a final score
        const words = line.split(" ");
        const at = (key: string) => words.indexOf(key);
        const multipv = at("multipv") >= 0 ? Number(words[at("multipv") + 1]) : 1;
        const kind = words[at("score") + 1];
        const value = Number(words[at("score") + 2]);
        found.set(multipv, {
          cp: kind === "cp" ? value : undefined,
          mate: kind === "mate" ? value : undefined,
          pv: words.slice(at("pv") + 1),
        });
      };
      this.listeners.push(collect);
      // A fixed depth gives the same answer every time, on any device (the time
      // is then only a safety limit); otherwise it thinks for the time given
      const limit = depth ? `depth ${depth} movetime ${Math.round(movetimeMs)}` : `movetime ${Math.round(movetimeMs)}`;
      await this.waitFor("bestmove", `go ${limit}${searchmoves}`);
      this.listeners = this.listeners.filter((l) => l !== collect);
      this.send("setoption name MultiPV value 1");
      return [...found.keys()].sort((a, b) => a - b).map((k) => found.get(k)!);
    });
  }

  quit() {
    this.worker.terminate();
  }
}
