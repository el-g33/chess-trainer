// Opening demonstrations (one for every opening in the app): Stockfish plays an opening's main line and its
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
  {
    opening: "Italian Game",
    intro: "Pawn to e4, knight to f3 and the bishop to c4, aiming at f7 - the square only Black's king defends. Then castle, d3 and c3, and build slowly before d4.",
    lines: [
      {
        title: "Main line: the quiet Giuoco Pianissimo",
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3",
        notes: {
          "3.Bc4": "The Italian bishop aims at f7, the weakest point in Black's camp: only the king guards it.",
          "4.c3": "c3 prepares d4 later, to build a big pawn centre.",
          "5.d3": "The calm way: d3 guards e4, so White can castle and build up slowly.",
          "7.Re1": "The rook backs up e4 and supports a later d4.",
          "7...a6": "...a6 makes a home for the bishop on a7, out of reach of b4 and d4 ideas.",
          "8.Bb3": "White does the same: the bishop steps back to b3, safe from ...d5 and ...Na5.",
          "9.h3": "h3 stops ...Bg4 and ...Ng4. Next comes Nbd2-f1-g3, a slow manoeuvre towards Black's king.",
        },
      },
      {
        title: "Two Knights: 3...Nf6 and the calm 4.d3",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3",
        notes: {
          "3...Nf6": "Black attacks e4 at once (the Two Knights Defence).",
          "4.d3": "The calm answer: d3 guards e4, and the setup stays the same.",
          "7.c3": "Castled, Re1, c3: the same plan as the main line.",
        },
      },
      {
        title: "Two Knights: the sharp 4.Ng5",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5",
        notes: {
          "4.Ng5": "The sharp way: the knight and bishop both hit f7.",
          "4...d5": "Black must block the bishop's diagonal.",
          "5...Na5": "Best: chase the bishop instead of taking back on d5. Black gives a pawn for quick development.",
          "9...e4": "Black's pawn sacrifice gives lots of activity: Stockfish calls it equal.",
          "10.Ne5": "White is a pawn up but must defend carefully. Many players prefer the calm 4.d3.",
        },
      },
      {
        title: "The Fried Liver: punishing 5...Nxd5?",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3",
        notes: {
          "5...Nxd5": "This natural recapture is a mistake (5...Na5 is right).",
          "6.Nxf7": "The Fried Liver Attack: White gives up the knight to drag Black's king into the open.",
          "7.Qf3+": "The queen checks and hits the d5 knight. The king has to come forward to defend it.",
          "8.Nc3": "More pieces join the attack on the pinned d5 knight. Stockfish rates it only about +0.8, but in a real game Black's king is in serious danger.",
        },
      },
      {
        title: "Philidor Defence: 2...d6",
        moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O",
        notes: {
          "2...d6": "The Philidor: solid but a little passive (+0.6 for White).",
          "3.d4": "Strike at once: the d6 pawn shuts in Black's bishop.",
          "4...Nbd7": "Black keeps the pawn on e5: the Lion setup (the Black Lion).",
          "5.Bc4": "The Italian bishop still finds its diagonal.",
          "6...O-O": "White has more space and an easy game; Black is solid but cramped.",
        },
      },
      {
        title: "Petrov's Defence: 2...Nf6",
        moves: "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3",
        notes: {
          "2...Nf6": "Petrov's Defence: Black counter-attacks e4 instead of defending e5.",
          "3.Nxe5": "Take first.",
          "3...d6": "Correct: kick the knight before taking on e4.",
          "4.Nf3": "Back it goes. Now ...Nxe4 is safe for Black.",
          "6.Bd3": "Normal development, with a small edge for White.",
        },
      },
      {
        title: "Petrov trap: 3...Nxe4? 4.Qe2!",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6 Nc6+",
        notes: {
          "3...Nxe4": "Copying White is a mistake.",
          "4.Qe2": "The queen attacks the e4 knight, and lines up on the e-file against Black's king. The only good answer is 4...Qe7.",
          "4...Nf6": "Retreating loses on the spot:",
          "5.Nc6+": "A discovered check from the queen on e2, and the knight attacks Black's queen. White wins it (+8).",
        },
      },
      {
        title: "Latvian Gambit: 2...f5",
        moves: "e4 e5 Nf3 f5 Nxe5 Qf6 d4 d6 Nc4 fxe4 Nc3",
        notes: {
          "2...f5": "The Latvian Gambit: very risky. Stockfish already rates it +1.5 for White.",
          "3.Nxe5": "Take the centre pawn.",
          "5.Nc4": "The knight steps back to safety.",
          "6.Nc3": "Develop and attack e4. White is clearly better.",
        },
      },
      {
        title: "When Black gives up the centre: 1...g6",
        moves: "e4 g6 d4 Bg7 Nf3 d6 Bc4 Nf6 Qe2 O-O O-O",
        notes: {
          "1...g6": "Black lets you have the centre (the Modern Defence).",
          "2.d4": "Take it: two pawns side by side in the centre.",
          "4.Bc4": "Your Italian bishop still fits.",
          "6.O-O": "A comfortable position with more space for White.",
        },
      },
    ],
  },
  {
    opening: "Ruy Lopez",
    intro: "Bishop to b5 attacks the knight that defends e5. Castle, Re1 and c3 follow, then d4. A slow, deep opening played at every level.",
    lines: [
      {
        title: "Main line: the Closed Ruy Lopez",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
        notes: {
          "3.Bb5": "The Spanish bishop attacks the knight that guards e5.",
          "3...a6": "Black asks the bishop straight away.",
          "4.Ba4": "Keep the pressure: the bishop stays on the same diagonal.",
          "5.O-O": "Castle first. e4 isn't really hanging: after ...Nxe4, d4 or Re1 wins it back.",
          "6.Re1": "Now e4 is guarded, and Bxc6 followed by Nxe5 becomes a real threat.",
          "7.Bb3": "From b3 the bishop aims at f7.",
          "8.c3": "Prepares d4, and gives the bishop a home on c2.",
          "9.h3": "Stops ...Bg4 before White plays d4.",
        },
      },
      {
        title: "Exchange Variation: 4.Bxc6",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4",
        notes: {
          "4.Bxc6": "Give up the bishop to damage Black's pawns.",
          "5.O-O": "Castle first: e5 can't be taken yet (see the next line).",
          "5...f6": "Black guards e5 with a pawn.",
          "7.Nxd4": "In an endgame White's healthy kingside pawns count for more than Black's doubled ones.",
        },
      },
      {
        title: "Why not 5.Nxe5? straight away",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5 Qd4 Nf3 Qxe4+",
        notes: {
          "5.Nxe5": "Grabbing the pawn doesn't work yet:",
          "5...Qd4": "A fork: the queen hits the knight and the e4 pawn.",
          "6...Qxe4+": "Black wins the pawn back with check. That's why White castles first.",
        },
      },
      {
        title: "Berlin Defence: 3...Nf6",
        moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8",
        notes: {
          "3...Nf6": "The Berlin: Black hits e4 at once.",
          "4.O-O": "Castle and let Black take on e4.",
          "5.d4": "Hit back in the centre.",
          "8...Kxd8": "The famous Berlin endgame: queens are off and Black can't castle, but has the two bishops. Very solid for Black.",
        },
      },
      {
        title: "Schliemann Gambit: 3...f5",
        moves: "e4 e5 Nf3 Nc6 Bb5 f5 d3 fxe4 dxe4 Nf6 O-O",
        notes: {
          "3...f5": "The Schliemann: an aggressive strike at e4.",
          "4.d3": "Calm and good: support e4.",
          "6.O-O": "White is comfortable. Black's kingside has been loosened.",
        },
      },
      {
        title: "Classical: 3...Bc5",
        moves: "e4 e5 Nf3 Nc6 Bb5 Bc5 c3 Nf6 d4",
        notes: {
          "3...Bc5": "Black's bishop goes to its active diagonal.",
          "4.c3": "c3 prepares d4, gaining time on the bishop.",
          "5.d4": "The centre, with tempo.",
        },
      },
      {
        title: "Against the Philidor: 2...d6",
        moves: "e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Bf4",
        notes: {
          "2...d6": "Black avoids the Ruy Lopez altogether.",
          "3.d4": "Take the centre at once.",
          "3...exd4": "Black gives up the centre.",
          "6.Bf4": "Free development and more space for White.",
        },
      },
    ],
  },
  {
    opening: "Queen's Gambit",
    intro: "Offer the c-pawn with 2.c4 to pull Black's d-pawn away from the centre. Knights to c3 and f3, the bishops out actively, then castle.",
    lines: [
      {
        title: "Main line: Queen's Gambit Declined",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4",
        notes: {
          "2.c4": "The Queen's Gambit: offer the c-pawn to lure Black's d-pawn away from the centre.",
          "2...e6": "Declined: Black keeps the pawn on d5 by supporting it with ...e6.",
          "4.Bg5": "Pin the knight, so it can't defend d5 so well.",
          "7.Rc1": "The rook goes to the c-file, where Black's c-pawn will open it.",
          "8.Bd3": "Develop the bishop...",
          "9.Bxc4": "...and it recaptures on c4 without losing a move.",
        },
      },
      {
        title: "The Elephant Trap: don't grab d5",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Kxd8",
        notes: {
          "4...Nbd7": "This sets the Elephant Trap.",
          "6.Nxd5": "It looks like this wins a pawn because the f6 knight is pinned. It isn't really pinned:",
          "6...Nxd5": "Black takes back and lets the queen go!",
          "7...Bb4+": "Check, and White must give the queen back.",
          "8...Kxd8": "Black takes the queen on d2 next and comes out a piece up (-5.6).",
        },
      },
      {
        title: "Queen's Gambit Accepted: 2...dxc4",
        moves: "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6",
        notes: {
          "2...dxc4": "Accepted. Don't rush to win the pawn back.",
          "3.Nf3": "Develop first. It also stops ...e5.",
          "5.Bxc4": "The pawn comes back naturally.",
          "6...a6": "A normal position: White has a little more freedom.",
        },
      },
      {
        title: "Accepted: if Black hangs on with ...b5",
        moves: "d4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 Qf3",
        notes: {
          "3...b5": "Black tries to keep the extra pawn. It doesn't work:",
          "4.a4": "Hit the pawn chain from below.",
          "5...cxb5": "Natural, but a blunder:",
          "6.Qf3": "The long diagonal is open: the queen attacks the rook on a8, and Black can't hold everything. White wins material (+5.6).",
        },
      },
      {
        title: "Accepted: the Central Variation 3.e4",
        moves: "d4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4",
        notes: {
          "3.e4": "Take the whole centre while Black's pawn is away on c4.",
          "5.Bxc4": "The pawn comes back and White is well developed.",
        },
      },
      {
        title: "Slav Defence: 2...c6",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O",
        notes: {
          "2...c6": "The Slav: Black supports d5 with the c-pawn.",
          "4...dxc4": "Now Black takes, hoping to hold on with ...b5.",
          "5.a4": "Stop ...b5, so the pawn can't be held.",
          "7.Bxc4": "Pawn back. A normal position.",
        },
      },
      {
        title: "Albin Countergambit: 2...e5",
        moves: "d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Nge7 Bg2 Ng6 O-O",
        notes: {
          "2...e5": "The Albin Countergambit: a pawn for activity (+0.7 for White).",
          "3.dxe5": "Take it.",
          "3...d4": "The d4 pawn cramps White and sets traps (see the next line).",
          "5.g3": "The bishop goes to g2 and White castles.",
          "7.O-O": "White keeps the extra pawn safely.",
        },
      },
      {
        title: "The Lasker Trap: 4.e3?",
        moves: "d4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+",
        notes: {
          "4.e3": "Natural, but it walks into a famous trap.",
          "6.Bxb4": "Grabbing the bishop loses (6.fxe3 was the move):",
          "7...fxg1=N+": "Promoting to a knight, with check! Black wins material and is winning.",
        },
      },
    ],
  },
  {
    opening: "Classical centre (...e5 / ...d5)",
    intro: "Answer White's centre pawn with your own: ...e5 against 1.e4, ...d5 against 1.d4. Knights before bishops, castle early.",
    lines: [
      {
        title: "Against the Italian",
        moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O",
        notes: {
          "1...e5": "Meet e4 with your own centre pawn.",
          "2...Nc6": "Develop and defend e5.",
          "3...Bc5": "The bishop goes to its best diagonal, aiming at f2.",
          "4...Nf6": "Hit e4.",
          "5...d6": "Support e5 and open the way for the c8 bishop.",
          "6...O-O": "Castled and ready. ...a6 and ...Ba7 come next.",
        },
      },
      {
        title: "Against the Ruy Lopez",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7",
        notes: {
          "3...a6": "Ask the bishop straight away.",
          "5...Be7": "Solid development. Castle next.",
        },
      },
      {
        title: "Scotch Game: 3.d4",
        moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 Bd3 d5",
        notes: {
          "3.d4": "White opens the centre.",
          "3...exd4": "Take it. Holding on with ...d6 is passive.",
          "4...Nf6": "Hit e4 at once.",
          "5...bxc6": "Take back towards the centre.",
          "6...d5": "Strike back in the centre: Black is fine.",
        },
      },
      {
        title: "The early queen attack: 2.Qh5",
        moves: "e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 Ne2 Bg7",
        notes: {
          "2.Qh5": "An early queen raid aiming at f7. It isn't good (Black is already slightly better).",
          "2...Nc6": "Defend e5 first.",
          "3.Bc4": "Threat: Qxf7 checkmate!",
          "3...g6": "Block the queen, and attack it.",
          "4.Qf3": "Threatening f7 again.",
          "4...Nf6": "The knight shuts the f-file: f7 is safe.",
          "5...Bg7": "Black develops while the queen has wasted time.",
        },
      },
      {
        title: "King's Gambit: 2.f4",
        moves: "e4 e5 f4 exf4 Nf3 d5 exd5 Nf6",
        notes: {
          "2.f4": "The King's Gambit. Stockfish already likes Black (-0.5).",
          "2...exf4": "Accept the pawn.",
          "3...d5": "Strike in the centre at once.",
          "4...Nf6": "Develop, and win d5 back later. Black is comfortable.",
        },
      },
      {
        title: "King's Gambit: the Falkbeer 2...d5",
        moves: "e4 e5 f4 d5 exd5 exf4 Nf3 Nf6",
        notes: {
          "2...d5": "Or answer the gambit with a counter-strike in the centre (Falkbeer).",
          "4...Nf6": "Quick development. Black has an easy game.",
        },
      },
      {
        title: "Against 1.d4: Queen's Gambit Declined",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7",
        notes: {
          "1...d5": "Meet d4 with ...d5.",
          "2...e6": "Declined: keep the pawn on d5.",
          "4...Be7": "Unpin calmly.",
          "6...Nbd7": "Solid and safe. Later ...c6 and ...dxc4 free your game. Beware the Elephant Trap ideas if White grabs d5.",
        },
      },
      {
        title: "Against the London: hit back with ...c5",
        moves: "d4 d5 Bf4 c5 e3 Nc6 Nf3 Nf6 c3 Qb6 Qb3 c4 Qxb6 axb6",
        notes: {
          "2...c5": "White's bishop has left c1, so b2 is loose. Hit the centre with ...c5.",
          "4...Nf6": "Develop first. ...Qb6 is strongest once the knights are out.",
          "5...Qb6": "Now ...Qb6 hits b2.",
          "6...c4": "Push past, gaining space.",
          "7...axb6": "Black is comfortable (-0.4): the a-file is open for the rook.",
        },
      },
      {
        title: "Against the London: too early 3...Qb6?",
        moves: "d4 d5 Bf4 c5 e3 Qb6 Nc3",
        notes: {
          "3...Qb6": "Too early (+0.8 for White).",
          "4.Nc3": "If ...Qxb2 now, Nb5 threatens Nc7+, forking the king and rook. Get the knights out first.",
        },
      },
      {
        title: "Blackmar-Diemer Gambit: 2.e4",
        moves: "d4 d5 e4 dxe4 Nc3 Nf6 f3 exf3 Nxf3 e6",
        notes: {
          "2.e4": "The Blackmar-Diemer Gambit (-0.7 for White).",
          "2...dxe4": "Take the pawn.",
          "4...exf3": "Take again.",
          "5...e6": "Solid: Black is a pawn up and develops normally.",
        },
      },
    ],
  },
  {
    opening: "Caro-Kann / Slav (...c6 and ...d5)",
    intro: "Support ...d5 with ...c6 so you can take back with a pawn. Get the light-squared bishop out to f5 or g4 BEFORE ...e6, then ...e6, ...Nd7 and castle.",
    lines: [
      {
        title: "Caro-Kann: Classical Variation",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3",
        notes: {
          "1...c6": "Prepare ...d5, so you can take back with a pawn.",
          "4...Bf5": "The bishop comes out BEFORE ...e6 shuts it in.",
          "5...Bg6": "Keep the bishop.",
          "6...h6": "Give the bishop a home on h7, so h5 can't trap it.",
          "10.Qxd3": "Solid: next ...e6, ...Ngf6 and castling.",
        },
      },
      {
        title: "Caro-Kann: Advance Variation 3.e5",
        moves: "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5",
        notes: {
          "3.e5": "The Advance Variation: White grabs space.",
          "3...Bf5": "Bishop out first, as always.",
          "5...c5": "Hit the base of White's pawn chain.",
        },
      },
      {
        title: "Caro-Kann: Exchange Variation 3.exd5",
        moves: "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4",
        notes: {
          "3...cxd5": "Take back with the c-pawn: that's what ...c6 prepared.",
          "6...Bg4": "The bishop comes out actively.",
        },
      },
      {
        title: "Caro-Kann: 4...Nd7 and the f7 danger",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Bc4 Ngf6 Ng5 e6 Qe2 Nb6",
        notes: {
          "4...Nd7": "Another way: ...Nd7 prepares ...Ngf6.",
          "6.Ng5": "Knight and bishop both aim at f7.",
          "6...e6": "Block the bishop.",
          "7.Qe2": "The queen lines up on the e-file against Black's king.",
          "7...Nb6": "Kick the bishop away: the accurate answer.",
        },
      },
      {
        title: "Slav Defence",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O",
        notes: {
          "2...c6": "The Slav: support d5 with the c-pawn.",
          "4...dxc4": "Take the pawn.",
          "5...Bf5": "Bishop out before ...e6, as in the Caro-Kann.",
          "8...O-O": "Pawn returned, everything developed: a comfortable game.",
        },
      },
      {
        title: "Slav: when White plays Qb3",
        moves: "d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Qb3 Qb6",
        notes: {
          "4...Bf5": "The bishop is out.",
          "5.Qb3": "With the bishop gone from c8, b7 is loose.",
          "5...Qb6": "Guard b7 and offer to swap queens.",
        },
      },
      {
        title: "Slav: Exchange Variation",
        moves: "d4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6",
        notes: {
          "3...cxd5": "Recapture with the c-pawn.",
          "5...Nc6": "Symmetrical and safe.",
        },
      },
    ],
  },
  {
    opening: "King's Indian / Pirc setup",
    intro: "Let White build a big centre: knight to f6, bishop to g7, ...d6 and castle. Then strike back with ...e5 or ...c5.",
    lines: [
      {
        title: "King's Indian: Classical",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
        notes: {
          "2...g6": "The fianchetto: the bishop goes to g7.",
          "5...O-O": "Castle before opening the centre.",
          "6...e5": "The key strike at the centre.",
          "8...Ne7": "White closes the centre. Black's knights head for the kingside, ready for ...f5 (the Mar del Plata).",
        },
      },
      {
        title: "King's Indian: Sämisch 5.f3",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 c5 dxc5 dxc5 Qxd8 Rxd8 Bxc5 Nc6",
        notes: {
          "5.f3": "The Sämisch: f3 supports e4 and prepares a kingside pawn storm.",
          "6...c5": "Strike at once, offering a pawn.",
          "9...Nc6": "Black has given a pawn, but White lags in development and the dark squares are weak. About equal.",
        },
      },
      {
        title: "King's Indian: Four Pawns Attack",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5",
        notes: {
          "5.f4": "Four pawns in the centre.",
          "6...c5": "Hit the centre before it rolls forward.",
        },
      },
      {
        title: "Against the London",
        moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 d6 h3 O-O Be2 c5",
        notes: {
          "2.Bf4": "A London setup.",
          "6...c5": "Against the calm London, hit d4 with ...c5 rather than ...e5. It also opens your g7 bishop's diagonal.",
        },
      },
      {
        title: "Pirc: Classical",
        moves: "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6",
        notes: {
          "1...d6": "The Pirc: let White build a centre, then attack it.",
          "3...g6": "The same fianchetto as the King's Indian.",
          "6...c6": "Flexible: ...b5 or ...Bg4 next.",
        },
      },
      {
        title: "Pirc: Austrian Attack 4.f4",
        moves: "e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5",
        notes: {
          "4.f4": "The Austrian Attack: three pawns in the centre.",
          "5...c5": "Hit the centre at once.",
        },
      },
      {
        title: "Pirc: the 150 Attack",
        moves: "e4 d6 d4 Nf6 Nc3 g6 Be3 c6 Qd2 b5",
        notes: {
          "4.Be3": "Be3, Qd2 and Bh6 next, to swap off your g7 bishop.",
          "5...b5": "Counterplay on the queenside.",
        },
      },
    ],
  },
  {
    opening: "Sicilian Defence",
    intro: "1...c5 fights for d4 from the side. Swap your c-pawn for White's d-pawn, then ...d6, ...Nf6, ...Nc6, ...e6, ...Be7 and castle. Against 1.d4: the King's Indian.",
    lines: [
      {
        title: "Open Sicilian",
        moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Be2 e6 O-O Be7",
        notes: {
          "1...c5": "The Sicilian: fight for d4 from the side.",
          "3...cxd4": "Swap the c-pawn for White's d-pawn: you keep two centre pawns, White only one.",
          "4...Nf6": "Hit e4.",
          "6...e6": "A small centre (d6 and e6) that's hard to break.",
          "7...Be7": "Castle next. Black plays on the queenside with ...a6 and ...b5.",
        },
      },
      {
        title: "Alapin: 2.c3 ...Nf6",
        moves: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6",
        notes: {
          "2.c3": "The Alapin: c3 prepares d4 for a full pawn centre.",
          "2...Nf6": "Hit e4 at once.",
          "6...d6": "Challenge White's advanced e5 pawn.",
        },
      },
      {
        title: "Alapin: 2.c3 ...d5",
        moves: "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6",
        notes: {
          "2...d5": "Or strike with ...d5.",
          "3...Qxd5": "The queen is safe in the centre: Nc3 isn't possible, the c3 pawn is in the way.",
          "5...e6": "Solid development.",
        },
      },
      {
        title: "Moscow Variation: 3.Bb5+",
        moves: "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O Nc6 c3 Nf6",
        notes: {
          "3.Bb5+": "A check from b5.",
          "3...Bd7": "Block it, offering to swap bishops.",
          "6...Nf6": "Normal development, and a comfortable game.",
        },
      },
      {
        title: "Grand Prix Attack: 3.f4",
        moves: "e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4",
        notes: {
          "3.f4": "The Grand Prix: White plans a kingside attack.",
          "3...g6": "Set up with ...g6 and ...Bg7.",
          "5...Nd4": "Jump into d4: the knight is strong there.",
        },
      },
      {
        title: "Smith-Morra Gambit: 2.d4 cxd4 3.c3",
        moves: "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6",
        notes: {
          "3.c3": "The Smith-Morra Gambit.",
          "3...dxc3": "Accept it.",
          "5...d6": "Solid: a pawn up. Develop with ...e6, ...Nf6 and ...Be7.",
        },
      },
      {
        title: "Against 1.d4: the King's Indian",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5",
        notes: {
          "1...Nf6": "Against 1.d4 this repertoire uses the King's Indian. See that demo for more.",
          "6...e5": "The key strike at the centre.",
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
