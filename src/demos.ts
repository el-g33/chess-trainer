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
  title: string; // "Main", or the variation's name, e.g. "Nf3 variation"
  about?: string; // a variation: how it differs, said first
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
    intro: "White sets up the same way against almost anything.",
    lines: [
      {
        title: "Main",
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
        title: "Nf3 variation",
        about: "In this variation the move order changes: the knight comes out before the bishop.",
        moves: "d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 Nbd2 e6 c3",
        notes: {
          "2.Nf3": "The older order: knight first, bishop next move.",
          "6.c3": "A different order, but the same setup.",
        },
      },
      {
        title: "...Qb6 variation",
        about: "Here Black's queen goes after b2, the pawn the bishop left behind. Watch the trap.",
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
        title: "King's Indian variation",
        about: "Black fianchettoes with ...g6 and ...Bg7 instead of ...d5. White keeps the same setup.",
        moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 d6 h3 O-O Be2",
        notes: {
          "4...d6": "Black is preparing ...e5.",
          "5.h3": "h3 gives the bishop a retreat on h2, so ...Nh5 can't chase it off. It also stops ...Bg4.",
          "6.Be2": "Be2 rather than Bd3: a bishop on d3 would be hit if Black pushes ...e5-e4.",
        },
      },
      {
        title: "...Bf5 variation",
        about: "Black copies the London idea with ...Bf5. White hits back with an early c4.",
        moves: "d4 d5 Bf4 Bf5 e3 e6 c4",
        notes: {
          "4.c4": "Black's bishop has left c8, so b7 is weak. c4 followed by Qb3 attacks it.",
        },
      },
    ],
  },
  {
    opening: "Rapport-Jobava System",
    intro: "Like the London, but the knight comes to c3 first, aiming for Nb5.",
    lines: [
      {
        title: "Main",
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
        title: "...Nf6 variation",
        about: "Black starts with ...Nf6. The moves come in a different order but reach the same setup.",
        moves: "d4 Nf6 Nc3 d5 Bf4 e6",
        notes: {},
      },
      {
        title: "Bf4 variation",
        about: "White starts like the London with Bf4, then switches to Nc3.",
        moves: "d4 d5 Bf4 Nf6 Nc3 e6",
        notes: {
          "3...e6": "A London move order that turns into the Jobava.",
        },
      },
      {
        title: "...c5 variation",
        about: "Black strikes back at d4 with ...c5 straight away.",
        moves: "d4 d5 Nc3 Nf6 Bf4 c5 e3 cxd4 exd4",
        notes: {
          "4.e3": "e3 keeps d4 defended.",
          "5.exd4": "Take back with the pawn: the e-file opens and the f1 bishop gets an open diagonal.",
        },
      },
      {
        title: "...Nc6 trap",
        about: "Here Black plays the natural ...Nc6, and Nb5 punishes it.",
        moves: "d4 d5 Nc3 Nf6 Bf4 c5 e3 Nc6 Nb5",
        notes: {
          "4...Nc6": "A natural move, but a mistake (+1.9).",
          "5.Nb5": "With Black's c-pawn gone from c7, Nc7+ would fork the king and rook, and Black has no good way to stop it (+2.0). After 5...e5 6.dxe5, White is still clearly better (+2.4).",
        },
      },
      {
        title: "...Bf5 variation",
        about: "Black copies with ...Bf5. White carries on with e3 and Nf3.",
        moves: "d4 d5 Nc3 Nf6 Bf4 Bf5 e3 e6 Nf3",
        notes: {
          "5.Nf3": "Just keep developing: Bd3 comes next, offering to swap Black's active bishop. Nb5 ideas stay in the air.",
        },
      },
      {
        title: "...a6 variation",
        about: "Black stops Nb5 with ...a6, so White changes plans.",
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
    intro: "White aims the bishop at f7, then builds up slowly before striking in the centre.",
    lines: [
      {
        title: "Main",
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
        title: "Two Knights variation",
        about: "Black answers with ...Nf6 instead of ...Bc5. White keeps it calm with d3.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3",
        notes: {
          "3...Nf6": "Black attacks e4 at once (the Two Knights Defence).",
          "4.d3": "The calm answer: d3 guards e4, and the setup stays the same.",
          "7.c3": "Castled, Re1, c3: the same plan as the main line.",
        },
      },
      {
        title: "Ng5 variation",
        about: "Against ...Nf6, White attacks f7 at once with Ng5. Sharp play follows.",
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
        title: "Fried Liver",
        about: "If Black takes back with ...Nxd5, a knight sacrifice on f7 punishes it.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3",
        notes: {
          "5...Nxd5": "This natural recapture is a mistake (5...Na5 is right).",
          "6.Nxf7": "The Fried Liver Attack: White gives up the knight to drag Black's king into the open.",
          "7.Qf3+": "The queen checks and hits the d5 knight. The king has to come forward to defend it.",
          "8.Nc3": "More pieces join the attack on the pinned d5 knight. Stockfish rates it only about +0.8, but in a real game Black's king is in serious danger.",
        },
      },
      {
        title: "Philidor variation",
        about: "Black defends e5 with ...d6. White takes the centre with d4.",
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
        title: "Petrov variation",
        about: "Black counterattacks e4 with ...Nf6 instead of defending e5.",
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
        title: "Petrov trap",
        about: "In the Petrov, taking back the pawn with ...Nxe4 too early runs into Qe2.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6 Nc6+",
        notes: {
          "3...Nxe4": "Copying White is a mistake.",
          "4.Qe2": "The queen attacks the e4 knight, and lines up on the e-file against Black's king. The only good answer is 4...Qe7.",
          "4...Nf6": "Retreating loses on the spot:",
          "5.Nc6+": "A discovered check from the queen on e2, and the knight attacks Black's queen. White wins it (+8).",
        },
      },
      {
        title: "Latvian Gambit",
        about: "Black sacrifices with ...f5. It's risky, and White's pieces punish it.",
        moves: "e4 e5 Nf3 f5 Nxe5 Qf6 d4 d6 Nc4 fxe4 Nc3",
        notes: {
          "2...f5": "The Latvian Gambit: very risky. Stockfish already rates it +1.5 for White.",
          "3.Nxe5": "Take the centre pawn.",
          "5.Nc4": "The knight steps back to safety.",
          "6.Nc3": "Develop and attack e4. White is clearly better.",
        },
      },
      {
        title: "...g6 variation",
        about: "Black gives up the centre with ...g6. White builds the ideal centre and develops.",
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
    intro: "White puts pressure on the knight that defends e5, then builds up slowly.",
    lines: [
      {
        title: "Main",
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
        title: "Exchange variation",
        about: "White gives up the bishop for the knight to damage Black's pawns.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4",
        notes: {
          "4.Bxc6": "Give up the bishop to damage Black's pawns.",
          "5.O-O": "Castle first: e5 can't be taken yet (see the next line).",
          "5...f6": "Black guards e5 with a pawn.",
          "7.Nxd4": "In an endgame White's healthy kingside pawns count for more than Black's doubled ones.",
        },
      },
      {
        title: "Nxe5 trap",
        about: "Why White can't win the e5 pawn straight away: ...Qd4 wins it back.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5 Qd4 Nf3 Qxe4+",
        notes: {
          "5.Nxe5": "Grabbing the pawn doesn't work yet:",
          "5...Qd4": "A fork: the queen hits the knight and the e4 pawn.",
          "6...Qxe4+": "Black wins the pawn back with check. That's why White castles first.",
        },
      },
      {
        title: "Berlin variation",
        about: "Black answers with ...Nf6 and heads for an early queen swap.",
        moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8",
        notes: {
          "3...Nf6": "The Berlin: Black hits e4 at once.",
          "4.O-O": "Castle and let Black take on e4.",
          "5.d4": "Hit back in the centre.",
          "8...Kxd8": "The famous Berlin endgame: queens are off and Black can't castle, but has the two bishops. Very solid for Black.",
        },
      },
      {
        title: "Schliemann Gambit",
        about: "Black hits back at once with ...f5. White stays calm with d3.",
        moves: "e4 e5 Nf3 Nc6 Bb5 f5 d3 fxe4 dxe4 Nf6 O-O",
        notes: {
          "3...f5": "The Schliemann: an aggressive strike at e4.",
          "4.d3": "Calm and good: support e4.",
          "6.O-O": "White is comfortable. Black's kingside has been loosened.",
        },
      },
      {
        title: "...Bc5 variation",
        about: "Black puts the bishop on c5. White prepares d4 with c3.",
        moves: "e4 e5 Nf3 Nc6 Bb5 Bc5 c3 Nf6 d4",
        notes: {
          "3...Bc5": "Black's bishop goes to its active diagonal.",
          "4.c3": "c3 prepares d4, gaining time on the bishop.",
          "5.d4": "The centre, with tempo.",
        },
      },
      {
        title: "Philidor variation",
        about: "Black defends e5 with ...d6 before ...Nc6. White takes the centre with d4.",
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
    intro: "White offers the c-pawn to pull Black's d-pawn out of the centre.",
    lines: [
      {
        title: "Main",
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
        title: "Elephant Trap",
        about: "Black sets a trap: grabbing the d5 pawn loses a piece.",
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
        title: "Accepted variation",
        about: "Black takes the c-pawn. White wins it back calmly with e3 and Bxc4.",
        moves: "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6",
        notes: {
          "2...dxc4": "Accepted. Don't rush to win the pawn back.",
          "3.Nf3": "Develop first. It also stops ...e5.",
          "5.Bxc4": "The pawn comes back naturally.",
          "6...a6": "A normal position: White has a little more freedom.",
        },
      },
      {
        title: "...b5 variation",
        about: "Black tries to keep the extra pawn with ...b5. a4 breaks it up.",
        moves: "d4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 Qf3",
        notes: {
          "3...b5": "Black tries to keep the extra pawn. It doesn't work:",
          "4.a4": "Hit the pawn chain from below.",
          "5...cxb5": "Natural, but a blunder:",
          "6.Qf3": "The long diagonal is open: the queen attacks the rook on a8, and Black can't hold everything. White wins material (+5.6).",
        },
      },
      {
        title: "e4 variation",
        about: "Against the Accepted, White grabs the centre with e4 at once.",
        moves: "d4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4",
        notes: {
          "3.e4": "Take the whole centre while Black's pawn is away on c4.",
          "5.Bxc4": "The pawn comes back and White is well developed.",
        },
      },
      {
        title: "Slav variation",
        about: "Black supports d5 with ...c6 instead of ...e6.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O",
        notes: {
          "2...c6": "The Slav: Black supports d5 with the c-pawn.",
          "4...dxc4": "Now Black takes, hoping to hold on with ...b5.",
          "5.a4": "Stop ...b5, so the pawn can't be held.",
          "7.Bxc4": "Pawn back. A normal position.",
        },
      },
      {
        title: "Albin Countergambit",
        about: "Black hits back with ...e5. White takes and develops calmly.",
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
        title: "Lasker Trap",
        about: "The natural e3 is a mistake here, and Black wins with a knight promotion.",
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
    intro: "Meet White's centre pawn with your own, then develop and castle.",
    lines: [
      {
        title: "Main",
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
        title: "Ruy Lopez variation",
        about: "White plays the Ruy Lopez with Bb5. Black chases the bishop with ...a6.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7",
        notes: {
          "3...a6": "Ask the bishop straight away.",
          "5...Be7": "Solid development. Castle next.",
        },
      },
      {
        title: "Scotch variation",
        about: "White opens the centre with d4 at once.",
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
        title: "Qh5 variation",
        about: "White brings the queen out early to attack f7. Calm defence handles it.",
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
        title: "King's Gambit",
        about: "White offers the f-pawn. Black takes it and hits back with ...d5.",
        moves: "e4 e5 f4 exf4 Nf3 d5 exd5 Nf6",
        notes: {
          "2.f4": "The King's Gambit. Stockfish already likes Black (-0.5).",
          "2...exf4": "Accept the pawn.",
          "3...d5": "Strike in the centre at once.",
          "4...Nf6": "Develop, and win d5 back later. Black is comfortable.",
        },
      },
      {
        title: "Falkbeer variation",
        about: "Black declines the King's Gambit with ...d5 straight away.",
        moves: "e4 e5 f4 d5 exd5 exf4 Nf3 Nf6",
        notes: {
          "2...d5": "Or answer the gambit with a counter-strike in the centre (Falkbeer).",
          "4...Nf6": "Quick development. Black has an easy game.",
        },
      },
      {
        title: "1.d4 variation",
        about: "Against 1.d4, Black answers with ...d5 and the Queen's Gambit Declined.",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7",
        notes: {
          "1...d5": "Meet d4 with ...d5.",
          "2...e6": "Declined: keep the pawn on d5.",
          "4...Be7": "Unpin calmly.",
          "6...Nbd7": "Solid and safe. Later ...c6 and ...dxc4 free your game. Beware the Elephant Trap ideas if White grabs d5.",
        },
      },
      {
        title: "London variation",
        about: "Against the London, Black hits back at once with ...c5.",
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
        title: "...Qb6 trap",
        about: "Against the London, ...Qb6 too early lets White gain time with Nc3.",
        moves: "d4 d5 Bf4 c5 e3 Qb6 Nc3",
        notes: {
          "3...Qb6": "Too early (+0.8 for White).",
          "4.Nc3": "If ...Qxb2 now, Nb5 threatens Nc7+, forking the king and rook. Get the knights out first.",
        },
      },
      {
        title: "Blackmar-Diemer Gambit",
        about: "White gives up a pawn with e4 for quick development.",
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
    intro: "Support ...d5 with ...c6, and get the light-squared bishop out before ...e6.",
    lines: [
      {
        title: "Main",
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
        title: "Advance variation",
        about: "White pushes e5 to grab space. Black gets the bishop out, then hits back with ...c5.",
        moves: "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5",
        notes: {
          "3.e5": "The Advance Variation: White grabs space.",
          "3...Bf5": "Bishop out first, as always.",
          "5...c5": "Hit the base of White's pawn chain.",
        },
      },
      {
        title: "Exchange variation",
        about: "White swaps on d5, leaving a symmetrical, calm position.",
        moves: "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4",
        notes: {
          "3...cxd5": "Take back with the c-pawn: that's what ...c6 prepared.",
          "6...Bg4": "The bishop comes out actively.",
        },
      },
      {
        title: "...Nd7 variation",
        about: "Black plays ...Nd7 instead of ...Bf5. Watch out for tricks on f7.",
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
        title: "Slav variation",
        about: "Against 1.d4 and c4, Black plays the same idea: ...c6 and ...d5.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O",
        notes: {
          "2...c6": "The Slav: support d5 with the c-pawn.",
          "4...dxc4": "Take the pawn.",
          "5...Bf5": "Bishop out before ...e6, as in the Caro-Kann.",
          "8...O-O": "Pawn returned, everything developed: a comfortable game.",
        },
      },
      {
        title: "Qb3 variation",
        about: "In the Slav, White attacks b7 with Qb3. Black meets it with ...Qb6.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Qb3 Qb6",
        notes: {
          "4...Bf5": "The bishop is out.",
          "5.Qb3": "With the bishop gone from c8, b7 is loose.",
          "5...Qb6": "Guard b7 and offer to swap queens.",
        },
      },
      {
        title: "Slav Exchange",
        about: "White swaps on d5 in the Slav. Black develops the knights.",
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
    intro: "Let White build a big centre, then strike back at it.",
    lines: [
      {
        title: "Main",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7",
        notes: {
          "2...g6": "The fianchetto: the bishop goes to g7.",
          "5...O-O": "Castle before opening the centre.",
          "6...e5": "The key strike at the centre.",
          "8...Ne7": "White closes the centre. Black's knights head for the kingside, ready for ...f5 (the Mar del Plata).",
        },
      },
      {
        title: "Sämisch variation",
        about: "White supports e4 with f3. Black hits back with ...c5.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 c5 dxc5 dxc5 Qxd8 Rxd8 Bxc5 Nc6",
        notes: {
          "5.f3": "The Sämisch: f3 supports e4 and prepares a kingside pawn storm.",
          "6...c5": "Strike at once, offering a pawn.",
          "9...Nc6": "Black has given a pawn, but White lags in development and the dark squares are weak. About equal.",
        },
      },
      {
        title: "Four Pawns variation",
        about: "White pushes four pawns into the centre. Black strikes at it with ...c5.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5",
        notes: {
          "5.f4": "Four pawns in the centre.",
          "6...c5": "Hit the centre before it rolls forward.",
        },
      },
      {
        title: "London variation",
        about: "Against the London, Black keeps the same setup and hits back with ...c5.",
        moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 d6 h3 O-O Be2 c5",
        notes: {
          "2.Bf4": "A London setup.",
          "6...c5": "Against the calm London, hit d4 with ...c5 rather than ...e5. It also opens your g7 bishop's diagonal.",
        },
      },
      {
        title: "Pirc variation",
        about: "Against 1.e4, Black uses the same setup: ...d6, ...Nf6 and ...g6.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6",
        notes: {
          "1...d6": "The Pirc: let White build a centre, then attack it.",
          "3...g6": "The same fianchetto as the King's Indian.",
          "6...c6": "Flexible: ...b5 or ...Bg4 next.",
        },
      },
      {
        title: "Austrian Attack",
        about: "In the Pirc, White grabs space with f4. Black answers with ...c5.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5",
        notes: {
          "4.f4": "The Austrian Attack: three pawns in the centre.",
          "5...c5": "Hit the centre at once.",
        },
      },
      {
        title: "150 Attack",
        about: "White aims Be3 and Qd2 at the king. Black counters on the queenside with ...c6 and ...b5.",
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
    intro: "Fight for d4 from the side with ...c5, then develop and castle.",
    lines: [
      {
        title: "Main",
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
        title: "Alapin ...Nf6 variation",
        about: "White prepares d4 with c3. Black hits the e4 pawn with ...Nf6.",
        moves: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6",
        notes: {
          "2.c3": "The Alapin: c3 prepares d4 for a full pawn centre.",
          "2...Nf6": "Hit e4 at once.",
          "6...d6": "Challenge White's advanced e5 pawn.",
        },
      },
      {
        title: "Alapin ...d5 variation",
        about: "Against c3, Black strikes with ...d5 at once.",
        moves: "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6",
        notes: {
          "2...d5": "Or strike with ...d5.",
          "3...Qxd5": "The queen is safe in the centre: Nc3 isn't possible, the c3 pawn is in the way.",
          "5...e6": "Solid development.",
        },
      },
      {
        title: "Bb5+ variation",
        about: "White checks with Bb5 and swaps bishops. Black takes back with the queen.",
        moves: "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O Nc6 c3 Nf6",
        notes: {
          "3.Bb5+": "A check from b5.",
          "3...Bd7": "Block it, offering to swap bishops.",
          "6...Nf6": "Normal development, and a comfortable game.",
        },
      },
      {
        title: "Grand Prix variation",
        about: "White plays f4 for a kingside attack. Black fianchettoes and hits back.",
        moves: "e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4",
        notes: {
          "3.f4": "The Grand Prix: White plans a kingside attack.",
          "3...g6": "Set up with ...g6 and ...Bg7.",
          "5...Nd4": "Jump into d4: the knight is strong there.",
        },
      },
      {
        title: "Smith-Morra Gambit",
        about: "White gives a pawn for quick development. Black takes it and develops.",
        moves: "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6",
        notes: {
          "3.c3": "The Smith-Morra Gambit.",
          "3...dxc3": "Accept it.",
          "5...d6": "Solid: a pawn up. Develop with ...e6, ...Nf6 and ...Be7.",
        },
      },
      {
        title: "1.d4 variation",
        about: "Against 1.d4, play the King's Indian.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5",
        notes: {
          "1...Nf6": "Against 1.d4 this repertoire uses the King's Indian. See that demo for more.",
          "6...e5": "The key strike at the centre.",
        },
      },
    ],
  },
  {
    opening: "Catalan Opening",
    intro: "Like the Queen's Gambit, but the bishop goes to g2 to press on the long diagonal.",
    lines: [
      {
        title: "Main",
        moves: "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O Nbd7 Qc2 c6 Nbd2 b6 e4",
        notes: {
          "3.g3": "The Catalan: g3 and Bg2 instead of Nc3.",
          "4.Bg2": "The bishop's long diagonal runs through d5 towards b7 and a8.",
          "6.O-O": "Castled. White's king is safe behind the g2 bishop.",
          "7.Qc2": "Qc2 guards c4 and supports e4.",
          "8...b6": "Black prepares ...Bb7 to fight the g2 bishop.",
          "9.e4": "White takes more of the centre. A small, lasting edge (about +0.3).",
        },
      },
      {
        title: "Qa4+ variation",
        about: "Black takes on c4 early. Qa4+ wins the pawn back at once.",
        moves: "d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Qa4+ Nbd7 Qxc4 a6 Qc2",
        notes: {
          "4...dxc4": "The Open Catalan: Black takes the pawn.",
          "5.Qa4+": "Win it back at once, with check.",
          "6.Qxc4": "Pawn regained.",
          "7.Qc2": "The queen steps back before ...b5 can kick it. About equal, with easy play for White.",
        },
      },
      {
        title: "...dxc4 variation",
        about: "Black takes on c4 after castling. White wins it back with Qc2.",
        moves: "d4 Nf6 c4 e6 Nf3 d5 g3 Be7 Bg2 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7",
        notes: {
          "6...dxc4": "Black takes after both sides have castled.",
          "7.Qc2": "No hurry: Qc2, then Qxc4.",
          "8...b5": "Black gains queenside space with tempo.",
          "9...Bb7": "Black's bishop fights for the long diagonal. White carries on with Bf4 or Bd2 and Rc1.",
        },
      },
      {
        title: "...Bb4+ variation",
        about: "Black checks with ...Bb4 to disturb White's development.",
        moves: "d4 Nf6 c4 e6 g3 Bb4+ Bd2 Be7 Bg2 d5 Nf3 O-O O-O",
        notes: {
          "3...Bb4+": "A check to disturb White's development.",
          "4.Bd2": "Block with the bishop.",
          "4...Be7": "Black drops back: the d2 bishop is a little passive now, but White is still fine.",
          "7.O-O": "Castled, with the usual Catalan setup.",
        },
      },
      {
        title: "...d5 variation",
        about: "Black starts with ...d5. The moves come in a different order but reach the same setup.",
        moves: "d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O",
        notes: {
          "4.g3": "Against ...d5 and ...e6 the Catalan works just the same.",
        },
      },
      {
        title: "Slav variation",
        about: "Against the Slav's ...c6, the bishop on g2 still presses on the long diagonal.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 g3 Bf5 Bg2 e6 O-O",
        notes: {
          "2...c6": "The Slav: Black's light-squared bishop can come out to f5.",
          "4.g3": "The Catalan setup still works.",
          "6.O-O": "About equal. White's plans include Nc3, Nh4 or Qb3.",
        },
      },
    ],
  },
  {
    opening: "Stafford Gambit",
    intro: "Trap practice: Black gives up a pawn for quick threats on f2. It's unsound, so learn the traps and the refutation.",
    lines: [
      {
        title: "Main",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5",
        notes: {
          "3.Nxe5": "White takes the e5 pawn.",
          "3...Nc6": "The Stafford Gambit: instead of winning the pawn back, Black develops and invites Nxc6.",
          "4...dxc6": "Take back towards the centre: the d-file and the c8 bishop open up.",
          "5...Bc5": "The bishop aims at f2, the weak point next to White's king.",
        },
      },
      {
        title: "Bg5 trap",
        about: "The greedy Bg5 walks into a mating attack.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#",
        notes: {
          "6.Bg5": "Pinning the knight to the queen looks natural, but it's a blunder:",
          "6...Nxe4": "Let the queen go!",
          "7.Bxd8": "Taking the queen loses at once. (After 7.dxe4 Qxg5 Black has won the pawn back.)",
          "7...Bxf2+": "Check, and the king has only one square.",
          "8...Bg4#": "Checkmate: the king on e2 has no escape. This is the trap that made the Stafford famous.",
        },
      },
      {
        title: "Bc4 trap",
        about: "Bc4 and castling fall for a strike on f2.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 Nc3 Bc5 Bc4 Ng4 O-O Qh4 h3 Nxf2 Rxf2 Qxf2+",
        notes: {
          "6.Bc4": "Natural but inaccurate: now Black's threats on f2 start (about -0.6).",
          "6...Ng4": "Two pieces hit f2.",
          "7.O-O": "Castling into it is the real blunder:",
          "7...Qh4": "Threatening Qxh2 mate.",
          "9...Qxf2+": "Black wins material and White's king is in trouble (about -6).",
        },
      },
      {
        title: "Be2 refutation",
        about: "The calm Be2 stops Black's tricks.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2",
        notes: {
          "6.Be2": "The calm Be2 takes the sting out of ...Ng4 and ...Bg4 ideas. White castles next and stays a pawn up (about +2). Expect strong players to answer like this.",
        },
      },
      {
        title: "d4 variation",
        about: "White plays d4 instead of taking on e5.",
        moves: "e4 e5 Nf3 Nf6 d4 Nxe4 Bd3 d5 Nxe5 Nd7",
        notes: {
          "3.d4": "No gambit: White opens the centre instead.",
          "3...Nxe4": "Take e4: it's Petrov theory now, and equal.",
          "5...Nd7": "Challenge the strong e5 knight.",
        },
      },
      {
        title: "Nc3 variation",
        about: "White develops with Nc3 instead.",
        moves: "e4 e5 Nf3 Nf6 Nc3 Nc6 Bb5 Bb4 O-O O-O",
        notes: {
          "3.Nc3": "White just develops (the Four Knights).",
          "4...Bb4": "Mirror White's setup. Equal.",
        },
      },
    ],
  },
  {
    opening: "Black Lion (Philidor, Hanham)",
    intro: "A compact setup that holds e5 firmly. Watch out for attacks on f7.",
    lines: [
      {
        title: "Main",
        moves: "e4 d6 d4 Nf6 Nc3 Nbd7 Nf3 e5 Bc4 Be7 O-O O-O a4 c6",
        notes: {
          "1...d6": "Start with ...d6.",
          "2...Nf6": "Attack e4 straight away.",
          "3...Nbd7": "The Lion: the knight goes to d7 to support ...e5.",
          "4...e5": "Now ...e5 is fully supported, and Black keeps a pawn in the centre.",
          "6...O-O": "Castled: f7 is much safer now.",
          "7...c6": "...c6 makes room for ...Qc7 and prepares ...b5 later. Solid (about +0.4 for White).",
        },
      },
      {
        title: "Bxf7+ variation",
        about: "White sacrifices on f7 too early, and Black comes out fine.",
        moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 Bxf7+ Kxf7 Ng5+ Kg8 Ne6 Qe8 Nxc7 Qg6",
        notes: {
          "6.Bxf7+": "A well-known trap, but it's a mistake if Black defends well (about -1.9).",
          "7...Kg8": "The right square. (7...Kg6? gives White a strong attack.)",
          "8.Ne6": "The knight hits the queen and c7.",
          "9.Nxc7": "It forks the queen and rook...",
          "9...Qg6": "...but Black counter-attacks g2 and e4, and White's knight on c7 is stranded. Black is better (-1.9). (9...Qd8? 10.Nxa8 gives White too much.)",
        },
      },
      {
        title: "Ng5 variation",
        about: "White aims Ng5 and Bxf7+ at Black's king. Black defends accurately.",
        moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 Ng5 O-O Bxf7+ Rxf7 Ne6 Qe8",
        notes: {
          "6.Ng5": "Knight and bishop both aim at f7.",
          "8.Ne6": "The queen is attacked...",
          "8...Qe8": "...and e8 is the only good square: about equal. Taking on e4 or d4 instead loses (+4.5 or more).",
        },
      },
      {
        title: "Hanham variation",
        about: "Why the Hanham move order (...Nd7 before ...Nf6) runs into trouble.",
        moves: "e4 e5 Nf3 d6 d4 Nd7 Bc4 c6 O-O Be7 dxe5 dxe5 Ng5 Bxg5 Qh5 Qe7 Qxg5",
        notes: {
          "3...Nd7": "The Hanham move order: ...Nd7 before ...Nf6.",
          "4.Bc4": "Now Bc4 with Ng5 ideas is awkward to meet.",
          "7.Ng5": "Strong: f7 is hit, and after ...Bxg5 the queen wins the piece back.",
          "9.Qxg5": "White is clearly better (+1.1). That's why this repertoire plays the Lion order, ...Nf6 first.",
        },
      },
      {
        title: "Hanham Ng5 variation",
        about: "In the Hanham, Ng5 is met by ...Nh6.",
        moves: "e4 e5 Nf3 d6 d4 Nd7 Bc4 c6 Ng5 Nh6",
        notes: {
          "5.Ng5": "Threatening Nxf7 or Bxf7+.",
          "5...Nh6": "Cover f7 with the knight. Black holds (about +0.9 for White).",
        },
      },
      {
        title: "1.d4 variation",
        about: "Against 1.d4, Black uses the same setup: the Old Indian.",
        moves: "d4 Nf6 c4 d6 Nc3 Nbd7 e4 e5 Nf3 Be7 Be2 O-O O-O c6",
        notes: {
          "2...d6": "The Old Indian: the same ...d6, ...Nbd7, ...e5 setup.",
          "4...e5": "The Lion's centre pawn.",
          "7...c6": "Solid but cramped (about +0.85 for White). Plans: ...a6, ...b5 or ...Re8 and ...Bf8.",
        },
      },
      {
        title: "f4 variation",
        about: "White grabs space with f4. Black hits back in the centre.",
        moves: "e4 d6 d4 Nf6 Nc3 Nbd7 f4 e5 Nf3 exd4 Qxd4 c6",
        notes: {
          "4.f4": "White grabs space with f4.",
          "4...e5": "Strike at once.",
          "5...exd4": "Take: holding e5 doesn't work here.",
          "6...c6": "...c6 and ...d5 next challenge the centre (about +0.7 for White).",
        },
      },
    ],
  },
  {
    opening: "Alien Gambit (vs the Caro-Kann)",
    intro: "Trap practice: White sacrifices a knight on f7 to drag Black's king out. It's unsound, so learn where Black goes wrong.",
    lines: [
      {
        title: "Main",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Bc4+ Be6 Bxe6+ Kxe6",
        notes: {
          "4...Nf6": "The gambit only works against this knight move.",
          "5.Ng5": "Heading for f7. Already slightly risky (about -0.3).",
          "5...h6": "Black asks the knight.",
          "6.Nxf7": "The Alien Gambit: a whole knight to expose Black's king (about -2.7).",
          "7.Bc4+": "Check, aiming at the e6 square and the king.",
          "7...Be6": "The best defence: Black blocks and gives back a little material.",
          "8...Kxe6": "Black's king is out, but Black is a piece for two pawns up and clearly better (-3.1).",
        },
      },
      {
        title: "...Kg6 trap",
        about: "Here Black's king steps forward with ...Kg6 and gets caught.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Bc4+ Kg6",
        notes: {
          "7...Kg6": "The natural-looking king move throws away Black's advantage: White's attack (Nf3, Ne5+, Bd3+) is now worth the knight. About equal. (7...Ke8 keeps Black better.)",
        },
      },
      {
        title: "...Bf5 variation",
        about: "Black plays ...Bf5 instead, so there's no gambit. Play the Classical.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7",
        notes: {
          "4...Bf5": "Black plays the Classical Caro-Kann instead: no gambit possible.",
          "5.Ng3": "Kick the bishop.",
          "6.h4": "Threatening h5 to trap the bishop.",
          "7...Nd7": "A normal, equal Caro-Kann. Develop with Bd3 and castle.",
        },
      },
      {
        title: "...Nd7 variation",
        about: "Black plays ...Nd7 instead, so there's no gambit.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Bc4 Ngf6 Ng5 e6 Qe2 Nb6",
        notes: {
          "4...Nd7": "Black prepares ...Ngf6 instead.",
          "6.Ng5": "The same f7 idea, but here there's no sacrifice: just pressure.",
          "7.Qe2": "Lining up on the e-file.",
          "7...Nb6": "Black kicks the bishop. Equal.",
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
      const where = `the ${seen.line === "Main" ? "main line" : seen.line} after ${seen.label}`;
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
