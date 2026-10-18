// Opening demonstrations: Stockfish plays an opening's main line and its
// important variations, pausing to explain the ideas, the move-order changes
// and the transpositions. Each line was checked with full-strength
// Stockfish (depth 18-20); the numbers in the notes are its evaluations
// (+ = White is better). Notes are keyed by the move they follow, written
// as in a game score ("2.Bf4", "4...c5").
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import type { NormalMove } from "chessops/types";

export interface DemoLine {
  title: string;
  moves: string; // the line in SAN, e.g. "d4 d5 Bf4 Nf6"
  notes: Record<string, string>;
}

export interface Demo {
  opening: string; // the REPERTOIRE name it belongs to
  intro: string;
  lines: DemoLine[];
}

export const DEMOS: Demo[] = [
  {
    opening: "London System",
    intro: "White sets up the same way against almost anything: pawn to d4, the bishop to f4 BEFORE e3, then e3, Nf3, c3, Bd3, Nbd2 and castling.",
    lines: [
      {
        title: "Main line: against ...d5, ...e6 and ...c5",
        moves: "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3",
        notes: {
          "1.d4": "A pawn in the centre.",
          "2.Bf4": "The London bishop comes out first, before e3 shuts it in.",
          "3.e3": "Now e3 supports d4 and frees the other bishop. The f4 bishop is already outside the pawn chain.",
          "4...c5": "Black's most common plan: attack d4 with the c-pawn.",
          "5.c3": "c3 completes the pyramid (c3-d4-e3). If Black takes on d4, White takes back with a pawn and keeps the centre.",
          "6.Nbd2": "The knight goes to d2, not c3, because the pawn is there. From d2 it backs up the f3 knight and a later e4.",
          "6...Bd6": "Black offers to swap off White's best bishop.",
          "7.Bg3": "Keep it with Bg3 (+0.2; swapping on d6 is about equal). If ...Bxg3, hxg3 opens the h-file for White's rook.",
          "8.Bd3": "Every piece is out. White castles next, and Ne5 is a typical follow-up.",
        },
      },
      {
        title: "Move order: Nf3 before Bf4",
        moves: "d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 Nbd2 e6 c3",
        notes: {
          "2.Nf3": "The older order: knight first, bishop next move.",
          "6.c3": "A different order, but the same setup.",
        },
      },
      {
        title: "...Qb6, attacking b2 (and the trap)",
        moves: "d4 d5 Bf4 Nf6 e3 c5 Nf3 Qb6 Nc3 Qxb2 Nb5 Na6 a3",
        notes: {
          "4...Qb6": "With the bishop gone from c1, nothing guards b2, and Black's queen attacks it.",
          "5.Nc3": "Nc3 leaves b2 hanging on purpose. (5.Qc1 simply guards it, but is a bit passive, about -0.2.)",
          "5...Qxb2": "Taking is a big mistake (+4.7).",
          "6.Nb5": "This threatens Nc7+, forking the king and rook.",
          "7.a3": "Now Ra2 next traps the queen: it has no safe square. White is winning (+5.5).",
        },
      },
      {
        title: "Against a King's Indian setup (...g6, ...Bg7, ...d6)",
        moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 d6 h3 O-O Be2",
        notes: {
          "4...d6": "Black is preparing ...e5.",
          "5.h3": "h3 gives the bishop a retreat on h2, so ...Nh5 can't chase it off. It also stops ...Bg4.",
          "6.Be2": "Be2 rather than Bd3: a bishop on d3 would be hit if Black pushes ...e5-e4.",
        },
      },
      {
        title: "When Black copies with ...Bf5",
        moves: "d4 d5 Bf4 Bf5 e3 e6 c4",
        notes: {
          "4.c4": "Black's bishop has left c8, so b7 is weak. c4 followed by Qb3 attacks it.",
        },
      },
    ],
  },
  {
    opening: "Rapport-Jobava System",
    intro: "Like the London, but the queen's knight comes to c3 first (before any c4), and the bishop goes to f4. It's sharper: the key idea is Nb5, attacking c7.",
    lines: [
      {
        title: "Main line",
        moves: "d4 d5 Nc3 Nf6 Bf4 e6 Nb5 Na6 e3 Be7 Nf3 O-O Be2",
        notes: {
          "2.Nc3": "Nc3 blocks the c-pawn, which is unusual in a d4 opening, but it develops fast and eyes b5.",
          "3.Bf4": "The \"Jobava London\": the bishop and knight work together against c7.",
          "4.Nb5": "Bf4 already hits c7, and Nb5 attacks it a second time, so Black must defend.",
          "4...Na6": "The main defence (...Bb4+ is also played).",
          "7.Be2": "A comfortable setup. The b5 knight is a nuisance and can always go back to c3.",
        },
      },
      {
        title: "Move order: 1...Nf6 first",
        moves: "d4 Nf6 Nc3 d5 Bf4 e6",
        notes: {},
      },
      {
        title: "Move order: from the London",
        moves: "d4 d5 Bf4 Nf6 Nc3 e6",
        notes: {
          "3...e6": "A London move order that turns into the Jobava.",
        },
      },
      {
        title: "...c5, striking back",
        moves: "d4 d5 Nc3 Nf6 Bf4 c5 e3 cxd4 exd4",
        notes: {
          "4.e3": "e3 keeps d4 defended.",
          "5.exd4": "Take back with the pawn: the e-file opens and the f1 bishop gets an open diagonal.",
        },
      },
      {
        title: "The trap: 4...Nc6?",
        moves: "d4 d5 Nc3 Nf6 Bf4 c5 e3 Nc6 Nb5",
        notes: {
          "4...Nc6": "A natural move, but a mistake (+1.9).",
          "5.Nb5": "With Black's c-pawn gone from c7, Nc7+ would fork the king and rook, and Black has no good way to stop it (+2.0). After 5...e5 6.dxe5, White is still clearly better (+2.4).",
        },
      },
      {
        title: "Black copies with ...Bf5",
        moves: "d4 d5 Nc3 Nf6 Bf4 Bf5 e3 e6 Nf3",
        notes: {
          "5.Nf3": "Just keep developing: Bd3 comes next, offering to swap Black's active bishop. Nb5 ideas stay in the air.",
        },
      },
      {
        title: "...a6, stopping Nb5",
        moves: "d4 d5 Nc3 Nf6 Bf4 a6 e3 e6 Nf3 c5 dxc5 Bxc5 Bd3",
        notes: {
          "3...a6": "Black spends a move to stop Nb5.",
          "6.dxc5": "Taking on c5 is best here (about equal). 6.Bd3 lets Black take on d4 with a good game.",
          "7.Bd3": "Quick development and castling next.",
        },
      },
    ],
  },
];

export const demoFor = (opening: string | undefined) => DEMOS.find((d) => d.opening === opening);

export interface DemoStep {
  move: NormalMove;
  label: string; // "2.Bf4" or "4...c5"
  note?: string; // pause here and explain
}

/** A line's moves, each with its label and note; transpositions to an
 *  earlier line of the demo are found and explained automatically. */
export function demoSteps(demo: Demo, lineIndex: number): DemoStep[] {
  const earlier = new Map<string, { line: string; label: string; path: string }>();
  for (let i = 0; i < lineIndex; i++) {
    for (const visit of walk(demo.lines[i])) {
      if (!earlier.has(visit.key)) earlier.set(visit.key, { line: demo.lines[i].title, label: visit.step.label, path: visit.path });
    }
  }
  const steps: DemoStep[] = [];
  let transposed = false;
  for (const visit of walk(demo.lines[lineIndex])) {
    const step = visit.step;
    const seen = earlier.get(visit.key);
    // The same position reached by a different order of moves
    if (!transposed && seen && seen.path !== visit.path) {
      transposed = true;
      const where = `the ${seen.line.toLowerCase().startsWith("main line") ? "main line" : `"${seen.line}" line`} after ${seen.label}`;
      const said = `Transposition: this is the same position as in ${where}.`;
      step.note = step.note ? `${step.note} ${said}` : said;
    }
    steps.push(step);
  }
  return steps;
}

function* walk(line: DemoLine) {
  const position = Chess.default();
  const sans: string[] = [];
  for (const san of line.moves.split(" ")) {
    const move = parseSan(position, san) as NormalMove | undefined;
    if (!move) throw new Error(`demo "${line.title}": ${san} isn't legal`);
    const label = position.turn === "white" ? `${position.fullmoves}.${san}` : `${position.fullmoves}...${san}`;
    position.play(move);
    sans.push(san);
    const key = makeFen(position.toSetup()).split(" ").slice(0, 4).join(" ");
    // the moves in order, so a common start isn't counted as a transposition
    yield { key, path: sans.join(" "), step: { move, label, note: line.notes[label] } as DemoStep };
  }
}
