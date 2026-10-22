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
  // For a note that talks about a coming move: arrows on the board, by the
  // move's label. "e2e4" an idea (blue), "e2e4!" a threat (red), "@f7" a square.
  arrows?: Record<string, string[]>;
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
          "2.Bf4": "The London bishop comes out first, before the e-pawn shuts it in.",
          "3.e3": "Now the pawn supports the centre and frees the other bishop. The first bishop is already outside the pawn chain.",
          "4...c5": "Black's most common plan: attack White's centre pawn with the c-pawn.",
          "5.c3": "This completes the pawn pyramid. If Black takes in the centre, White takes back with a pawn and keeps it.",
          "6.Nbd2": "The knight comes out here, not next to the c-pawn, because the pawn is in the way. It backs up the other knight and a later e-pawn push.",
          "6...Bd6": "Black offers to swap off White's best bishop.",
          "7.Bg3": "Keep the bishop by stepping back. If Black swaps it off, White takes back towards the centre and the rook gets the open h-file.",
          "8.Bd3": "Every piece is out. White castles next, and a knight jump into the centre is a typical follow-up.",
        },
        arrows: { "2.Bf4": ["e2e3"], "3.e3": ["f1d3"], "4...c5": ["c5d4!"], "5.c3": ["c5d4!", "e3d4"], "6.Nbd2": ["e3e4"], "7.Bg3": ["d6g3!", "h2g3"], "8.Bd3": ["e1g1", "f3e5"] },
      },
      {
        title: "Nf3 variation",
        about: "In this variation the move order changes: the knight comes out before the bishop.",
        moves: "d4 d5 Nf3 Nf6 Bf4 c5 e3 Nc6 Nbd2 e6 c3",
        notes: {
          "2.Nf3": "The older order: knight first, bishop next move.",
          "6.c3": "A different order, but the same setup.",
        },
        arrows: { "2.Nf3": ["c1f4"] },
      },
      {
        title: "...Qb6 variation",
        about: "Here Black's queen goes after the b-pawn, which the bishop left behind. Watch the trap.",
        moves: "d4 d5 Bf4 Nf6 e3 c5 Nf3 Qb6 Nc3 Qxb2 Nb5 Na6 a3",
        notes: {
          "4...Qb6": "With the bishop gone, nothing guards the b-pawn, and Black's queen attacks it.",
          "5.Nc3": "White leaves the pawn hanging on purpose. Guarding it with the queen is fine too, but a bit passive.",
          "5...Qxb2": "Taking is a big mistake.",
          "6.Nb5": "This threatens a knight check that forks the king and rook.",
          "7.a3": "Now the rook steps up next and traps the queen: it has no safe square. White is winning.",
        },
        arrows: { "4...Qb6": ["b6b2!", "@b2!"], "5.Nc3": ["d1c1"], "6.Nb5": ["b5c7"], "7.a3": ["a1a2"] },
      },
      {
        title: "King's Indian variation",
        about: "Black puts the bishop on the long diagonal instead of pushing the d-pawn. White keeps the same setup.",
        moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 d6 h3 O-O Be2",
        notes: {
          "4...d6": "Black is preparing to push the e-pawn.",
          "5.h3": "This gives the bishop a square to retreat to, so Black's knight can't chase it off. It also stops Black's bishop from pinning the knight.",
          "6.Be2": "The bishop stays modest: further forward it could be hit when Black's e-pawn pushes on.",
        },
        arrows: { "4...d6": ["e7e5!"], "5.h3": ["f4h2", "f6h5!", "c8g4!"], "6.Be2": ["e7e5!", "e5e4!"] },
      },
      {
        title: "...Bf5 variation",
        about: "Black copies the London idea with the bishop. White hits back with an early c-pawn push.",
        moves: "d4 d5 Bf4 Bf5 e3 e6 c4",
        notes: {
          "4.c4": "Black's bishop has left home, so the pawn behind it is weak. This pawn strike, then the queen coming out, goes after it.",
        },
        arrows: { "4.c4": ["d1b3", "@b7"] },
      },
    ],
  },
  {
    opening: "Rapport-Jobava System",
    intro: "Like the London, but the queen's knight comes out first, aiming to jump forward.",
    lines: [
      {
        title: "Main",
        moves: "d4 d5 Nc3 Nf6 Bf4 e6 Nb5 Na6 e3 Be7 Nf3 O-O Be2",
        notes: {
          "2.Nc3": "The knight blocks the c-pawn, which is unusual in this kind of opening, but it develops fast and eyes a jump forward.",
          "3.Bf4": "The \"Jobava London\": the bishop and knight work together against the pawn on c7.",
          "4.Nb5": "The bishop already hits c7, and the knight attacks it a second time, so Black must defend.",
          "4...Na6": "The main defence. A bishop check is also played.",
          "7.Be2": "A comfortable setup. The forward knight is a nuisance and can always go back.",
        },
        arrows: { "2.Nc3": ["c3b5"], "3.Bf4": ["@c7"], "4.Nb5": ["f4c7", "b5c7"], "4...Na6": ["f8b4"], "7.Be2": ["b5c3"] },
      },
      {
        title: "...Nf6 variation",
        about: "Black starts with the knight. The moves come in a different order but reach the same setup.",
        moves: "d4 Nf6 Nc3 d5 Bf4 e6",
        notes: {},
      },
      {
        title: "Bf4 variation",
        about: "White starts like the London with the bishop, then brings the knight out.",
        moves: "d4 d5 Bf4 Nf6 Nc3 e6",
        notes: {
          "3...e6": "A London move order that turns into the Jobava.",
        },
      },
      {
        title: "...c5 variation",
        about: "Black strikes back at the centre with the c-pawn straight away.",
        moves: "d4 d5 Nc3 Nf6 Bf4 c5 e3 cxd4 exd4",
        notes: {
          "4.e3": "This keeps the centre pawn defended.",
          "5.exd4": "Take back with the pawn: the e-file opens and the other bishop gets an open diagonal.",
        },
        arrows: { "5.exd4": ["f1d3"] },
      },
      {
        title: "...Nc6 trap",
        about: "Here Black brings the knight out naturally, and White's knight jump punishes it.",
        moves: "d4 d5 Nc3 Nf6 Bf4 c5 e3 Nc6 Nb5",
        notes: {
          "4...Nc6": "A natural move, but a mistake.",
          "5.Nb5": "With Black's c-pawn gone, a knight check would fork the king and rook, and Black has no good way to stop it. Even after Black's central counter, White stays clearly better.",
        },
        arrows: { "5.Nb5": ["b5c7"] },
      },
      {
        title: "...Bf5 variation",
        about: "Black copies with the bishop. White just carries on developing.",
        moves: "d4 d5 Nc3 Nf6 Bf4 Bf5 e3 e6 Nf3",
        notes: {
          "5.Nf3": "Just keep developing: the bishop comes out next, offering to swap Black's active bishop. The knight jump stays in the air.",
        },
        arrows: { "5.Nf3": ["f1d3", "c3b5"] },
      },
      {
        title: "...a6 variation",
        about: "Black stops the knight jump with a pawn move, so White changes plans.",
        moves: "d4 d5 Nc3 Nf6 Bf4 a6 e3 e6 Nf3 c5 dxc5 Bxc5 Bd3",
        notes: {
          "3...a6": "Black spends a move to stop the knight jump.",
          "6.dxc5": "Taking is best here. Developing the bishop instead lets Black take in the centre with a good game.",
          "7.Bd3": "Quick development and castling next.",
        },
        arrows: { "3...a6": ["c3b5!"] },
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
          "4.c3": "This prepares a later d-pawn push, to build a big pawn centre.",
          "5.d3": "The calm way: the pawn guards the e-pawn, so White can castle and build up slowly.",
          "7.Re1": "The rook backs up the e-pawn and supports a later d-pawn push.",
          "7...a6": "This makes a home for Black's bishop, out of reach of White's pawn pushes.",
          "8.Bb3": "White does the same: the bishop steps back, safe from Black's pawn and knight.",
          "9.h3": "This stops a bishop pin or a knight jump. Next the knight goes on a long trip towards Black's king.",
        },
        arrows: { "3.Bc4": ["c4f7", "@f7"], "4.c3": ["d2d4"], "7.Re1": ["d3d4"], "7...a6": ["c5a7!", "b2b4", "d3d4"], "8.Bb3": ["d6d5!", "c6a5!"], "9.h3": ["c8g4!", "b1d2", "d2f1", "f1g3"] },
      },
      {
        title: "Two Knights variation",
        about: "Black brings the knight out instead of the bishop. White keeps it calm.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3",
        notes: {
          "3...Nf6": "Black attacks the e-pawn at once: the Two Knights Defence.",
          "4.d3": "The calm answer: the pawn guards the e-pawn, and the setup stays the same.",
          "7.c3": "Castled, rook out, c-pawn up: the same plan as the main line.",
        },
        arrows: { "3...Nf6": ["f6e4!"] },
      },
      {
        title: "Ng5 variation",
        about: "Against the knight, White attacks f7 at once. Sharp play follows.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5",
        notes: {
          "4.Ng5": "The sharp way: the knight and bishop both hit f7.",
          "4...d5": "Black must block the bishop's diagonal.",
          "5...Na5": "Best: chase the bishop instead of taking back the pawn. Black gives a pawn for quick development.",
          "9...e4": "Black's pawn sacrifice gives lots of activity: the position is about equal.",
          "10.Ne5": "White is a pawn up but must defend carefully. Many players prefer the calm pawn move instead.",
        },
        arrows: { "4.Ng5": ["g5f7", "c4f7"], "5...Na5": ["a5c4!"] },
      },
      {
        title: "Fried Liver",
        about: "If Black takes back with the knight, a knight sacrifice on f7 punishes it.",
        moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3",
        notes: {
          "5...Nxd5": "This natural recapture is a mistake. Chasing the bishop was right.",
          "6.Nxf7": "The Fried Liver Attack: White gives up the knight to drag Black's king into the open.",
          "7.Qf3+": "The queen checks and hits the knight. The king has to come forward to defend it.",
          "8.Nc3": "More pieces join the attack on the pinned knight. Black can hold with perfect defence, but in a real game Black's king is in serious danger.",
        },
        arrows: { "7.Qf3+": ["f3d5"], "8.Nc3": ["c3d5"] },
      },
      {
        title: "Philidor variation",
        about: "Black defends the e-pawn with the d-pawn. White takes the centre.",
        moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O",
        notes: {
          "2...d6": "The Philidor: solid but a little passive.",
          "3.d4": "Strike at once: Black's pawn shuts in its own bishop.",
          "4...Nbd7": "Black keeps the pawn in the centre: the Lion setup.",
          "5.Bc4": "The Italian bishop still finds its diagonal.",
          "6...O-O": "White has more space and an easy game; Black is solid but cramped.",
        },
      },
      {
        title: "Petrov variation",
        about: "Black counterattacks White's e-pawn instead of defending its own.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3",
        notes: {
          "2...Nf6": "Petrov's Defence: Black counter-attacks the e-pawn instead of defending its own.",
          "3.Nxe5": "Take first.",
          "3...d6": "Correct: kick the knight before taking the pawn.",
          "4.Nf3": "Back it goes. Now Black can safely take the pawn.",
          "6.Bd3": "Normal development, with a small edge for White.",
        },
        arrows: { "2...Nf6": ["f6e4!"], "4.Nf3": ["f6e4!"] },
      },
      {
        title: "Petrov trap",
        about: "In the Petrov, taking back the pawn too early runs into a queen move.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6 Nc6+",
        notes: {
          "3...Nxe4": "Copying White is a mistake.",
          "4.Qe2": "The queen attacks the knight and lines up against Black's king. The only good answer is to block with the queen.",
          "4...Nf6": "Retreating loses on the spot:",
          "5.Nc6+": "A discovered check from the queen, and the knight attacks Black's queen. White wins it.",
        },
        arrows: { "4.Qe2": ["d8e7"], "5.Nc6+": ["c6d8"] },
      },
      {
        title: "Latvian Gambit",
        about: "Black sacrifices the f-pawn. It's risky, and White's pieces punish it.",
        moves: "e4 e5 Nf3 f5 Nxe5 Qf6 d4 d6 Nc4 fxe4 Nc3",
        notes: {
          "2...f5": "The Latvian Gambit: very risky, and already clearly better for White.",
          "3.Nxe5": "Take the centre pawn.",
          "5.Nc4": "The knight steps back to safety.",
          "6.Nc3": "Develop and attack the e-pawn. White is clearly better.",
        },
        arrows: { "6.Nc3": ["c3e4"] },
      },
      {
        title: "...g6 variation",
        about: "Black gives up the centre. White builds the ideal centre and develops.",
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
    intro: "White puts pressure on the knight that defends Black's e-pawn, then builds up slowly.",
    lines: [
      {
        title: "Main",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3",
        notes: {
          "3.Bb5": "The Spanish bishop attacks the knight that guards Black's e-pawn.",
          "3...a6": "Black asks the bishop straight away.",
          "4.Ba4": "Keep the pressure: the bishop stays on the same diagonal.",
          "5.O-O": "Castle first. The e-pawn isn't really hanging: if Black takes it, White wins it back with the d-pawn or the rook.",
          "6.Re1": "Now the e-pawn is guarded, and taking the knight, then the e-pawn, becomes a real threat.",
          "7.Bb3": "From here the bishop aims at f7.",
          "8.c3": "This prepares the d-pawn push, and gives the bishop a home.",
          "9.h3": "This stops the bishop pin before White pushes the d-pawn.",
        },
        arrows: { "3.Bb5": ["b5c6"], "5.O-O": ["f6e4!", "d2d4", "f1e1"], "6.Re1": ["a4c6", "f3e5"], "7.Bb3": ["b3f7", "@f7"], "8.c3": ["d2d4", "b3c2"], "9.h3": ["c8g4!", "d2d4"] },
      },
      {
        title: "Exchange variation",
        about: "White gives up the bishop for the knight to damage Black's pawns.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4",
        notes: {
          "4.Bxc6": "Give up the bishop to damage Black's pawns.",
          "5.O-O": "Castle first: the e-pawn can't be taken yet (see the next line).",
          "5...f6": "Black guards the e-pawn with a pawn.",
          "7.Nxd4": "In an endgame White's healthy kingside pawns count for more than Black's doubled ones.",
        },
      },
      {
        title: "Nxe5 trap",
        about: "Why White can't win Black's e-pawn straight away: the queen wins it back.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5 Qd4 Nf3 Qxe4+",
        notes: {
          "5.Nxe5": "Grabbing the pawn doesn't work yet:",
          "5...Qd4": "A fork: the queen hits the knight and the e-pawn.",
          "6...Qxe4+": "Black wins the pawn back with check. That's why White castles first.",
        },
        arrows: { "5...Qd4": ["d4e5!", "d4e4!"] },
      },
      {
        title: "Berlin variation",
        about: "Black brings the knight out and heads for an early queen swap.",
        moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8",
        notes: {
          "3...Nf6": "The Berlin: Black hits the e-pawn at once.",
          "4.O-O": "Castle and let Black take the pawn.",
          "5.d4": "Hit back in the centre.",
          "8...Kxd8": "The famous Berlin endgame: queens are off and Black can't castle, but has the two bishops. Very solid for Black.",
        },
        arrows: { "3...Nf6": ["f6e4!"] },
      },
      {
        title: "Schliemann Gambit",
        about: "Black hits back at once with the f-pawn. White stays calm.",
        moves: "e4 e5 Nf3 Nc6 Bb5 f5 d3 fxe4 dxe4 Nf6 O-O",
        notes: {
          "3...f5": "The Schliemann: an aggressive strike at the e-pawn.",
          "4.d3": "Calm and good: support the e-pawn.",
          "6.O-O": "White is comfortable. Black's kingside has been loosened.",
        },
        arrows: { "3...f5": ["f5e4!"] },
      },
      {
        title: "...Bc5 variation",
        about: "Black brings the bishop out actively. White prepares the d-pawn push.",
        moves: "e4 e5 Nf3 Nc6 Bb5 Bc5 c3 Nf6 d4",
        notes: {
          "3...Bc5": "Black's bishop goes to its active diagonal.",
          "4.c3": "This prepares the d-pawn push, gaining time on the bishop.",
          "5.d4": "The centre, with tempo.",
        },
        arrows: { "4.c3": ["d2d4"] },
      },
      {
        title: "Philidor variation",
        about: "Black defends the e-pawn with the d-pawn first. White takes the centre.",
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
          "2...e6": "Declined: Black keeps the pawn in the centre by supporting it.",
          "4.Bg5": "Pin the knight, so it can't defend the centre pawn so well.",
          "7.Rc1": "The rook goes to the c-file, where Black's c-pawn will open it.",
          "8.Bd3": "Develop the bishop...",
          "9.Bxc4": "...and it takes back the pawn without losing a move.",
        },
      },
      {
        title: "Elephant Trap",
        about: "Black sets a trap: grabbing the centre pawn loses a piece.",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Kxd8",
        notes: {
          "4...Nbd7": "This sets the Elephant Trap.",
          "6.Nxd5": "It looks like this wins a pawn because the knight is pinned. It isn't really pinned:",
          "6...Nxd5": "Black takes back and lets the queen go!",
          "7...Bb4+": "Check, and White must give the queen back.",
          "8...Kxd8": "Black takes the queen next and comes out a piece up.",
        },
        arrows: { "8...Kxd8": ["b4d2!"] },
      },
      {
        title: "Accepted variation",
        about: "Black takes the c-pawn. White wins it back calmly.",
        moves: "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6",
        notes: {
          "2...dxc4": "Accepted. Don't rush to win the pawn back.",
          "3.Nf3": "Develop first. It also stops Black's e-pawn push.",
          "5.Bxc4": "The pawn comes back naturally.",
          "6...a6": "A normal position: White has a little more freedom.",
        },
        arrows: { "3.Nf3": ["e7e5!"] },
      },
      {
        title: "...b5 variation",
        about: "Black tries to keep the extra pawn with the b-pawn. White's a-pawn breaks it up.",
        moves: "d4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 Qf3",
        notes: {
          "3...b5": "Black tries to keep the extra pawn. It doesn't work:",
          "4.a4": "Hit the pawn chain from below.",
          "5...cxb5": "Natural, but a blunder:",
          "6.Qf3": "The long diagonal is open: the queen attacks the rook in the corner, and Black can't hold everything. White wins material.",
        },
        arrows: { "6.Qf3": ["f3a8"] },
      },
      {
        title: "e4 variation",
        about: "Against the Accepted, White grabs the centre with the e-pawn at once.",
        moves: "d4 d5 c4 dxc4 e4 e5 Nf3 exd4 Bxc4",
        notes: {
          "3.e4": "Take the whole centre while Black's pawn is away.",
          "5.Bxc4": "The pawn comes back and White is well developed.",
        },
      },
      {
        title: "Slav variation",
        about: "Black supports the centre pawn with the c-pawn instead of the e-pawn.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O",
        notes: {
          "2...c6": "The Slav: Black supports the centre pawn with the c-pawn.",
          "4...dxc4": "Now Black takes, hoping to hold on with the b-pawn.",
          "5.a4": "Stop that, so the pawn can't be held.",
          "7.Bxc4": "Pawn back. A normal position.",
        },
        arrows: { "4...dxc4": ["b7b5!"] },
      },
      {
        title: "Albin Countergambit",
        about: "Black hits back with the e-pawn. White takes and develops calmly.",
        moves: "d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Nge7 Bg2 Ng6 O-O",
        notes: {
          "2...e5": "The Albin Countergambit: a pawn for activity.",
          "3.dxe5": "Take it.",
          "3...d4": "The advanced pawn cramps White and sets traps (see the next line).",
          "5.g3": "The bishop goes on the long diagonal and White castles.",
          "7.O-O": "White keeps the extra pawn safely.",
        },
        arrows: { "5.g3": ["f1g2"] },
      },
      {
        title: "Lasker Trap",
        about: "The natural e-pawn move is a mistake here, and Black wins with a knight promotion.",
        moves: "d4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+",
        notes: {
          "4.e3": "Natural, but it walks into a famous trap.",
          "6.Bxb4": "Grabbing the bishop loses. Taking the pawn was the move:",
          "7...fxg1=N+": "Promoting to a knight, with check! Black wins material.",
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
          "1...e5": "Meet White's centre pawn with your own.",
          "2...Nc6": "Develop and defend your e-pawn.",
          "3...Bc5": "The bishop goes to its best diagonal, aiming at f2.",
          "4...Nf6": "Hit the e-pawn.",
          "5...d6": "Support your e-pawn and open the way for the other bishop.",
          "6...O-O": "Castled and ready. A pawn step and a bishop retreat come next.",
        },
        arrows: { "3...Bc5": ["c5f2", "@f2"], "4...Nf6": ["f6e4"], "6...O-O": ["a7a6", "c5a7"] },
      },
      {
        title: "Ruy Lopez variation",
        about: "White plays the Ruy Lopez. Black chases the bishop with a pawn.",
        moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7",
        notes: {
          "3...a6": "Ask the bishop straight away.",
          "5...Be7": "Solid development. Castle next.",
        },
      },
      {
        title: "Scotch variation",
        about: "White opens the centre with the d-pawn at once.",
        moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 Bd3 d5",
        notes: {
          "3.d4": "White opens the centre.",
          "3...exd4": "Take it. Holding on with the d-pawn is passive.",
          "4...Nf6": "Hit the e-pawn at once.",
          "5...bxc6": "Take back towards the centre.",
          "6...d5": "Strike back in the centre: Black is fine.",
        },
        arrows: { "4...Nf6": ["f6e4"] },
      },
      {
        title: "Qh5 variation",
        about: "White brings the queen out early to attack f7. Calm defence handles it.",
        moves: "e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 Ne2 Bg7",
        notes: {
          "2.Qh5": "An early queen raid aiming at f7. It isn't good: Black is already slightly better.",
          "2...Nc6": "Defend your e-pawn first.",
          "3.Bc4": "Threat: the queen takes on f7, and it's checkmate!",
          "3...g6": "Block the queen, and attack it.",
          "4.Qf3": "Threatening f7 again.",
          "4...Nf6": "The knight shuts the f-file: f7 is safe.",
          "5...Bg7": "Black develops while the queen has wasted time.",
        },
        arrows: { "2.Qh5": ["h5f7!", "@f7"], "3.Bc4": ["h5f7!", "c4f7!"], "4.Qf3": ["f3f7!"] },
      },
      {
        title: "King's Gambit",
        about: "White offers the f-pawn. Black takes it and hits back in the centre.",
        moves: "e4 e5 f4 exf4 Nf3 d5 exd5 Nf6",
        notes: {
          "2.f4": "The King's Gambit. Black is already slightly better.",
          "2...exf4": "Accept the pawn.",
          "3...d5": "Strike in the centre at once.",
          "4...Nf6": "Develop, and win the pawn back later. Black is comfortable.",
        },
        arrows: { "4...Nf6": ["f6d5"] },
      },
      {
        title: "Falkbeer variation",
        about: "Black declines the King's Gambit with a counter-strike in the centre.",
        moves: "e4 e5 f4 d5 exd5 exf4 Nf3 Nf6",
        notes: {
          "2...d5": "Or answer the gambit with a counter-strike in the centre (Falkbeer).",
          "4...Nf6": "Quick development. Black has an easy game.",
        },
      },
      {
        title: "1.d4 variation",
        about: "Against the d-pawn, Black meets it with its own and plays the Queen's Gambit Declined.",
        moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7",
        notes: {
          "1...d5": "Meet White's centre pawn with your own.",
          "2...e6": "Declined: keep your pawn in the centre.",
          "4...Be7": "Unpin calmly.",
          "6...Nbd7": "Solid and safe. Later the c-pawn and a capture free your game. Beware the Elephant Trap if White grabs your centre pawn.",
        },
        arrows: { "6...Nbd7": ["c7c6", "d5c4"] },
      },
      {
        title: "London variation",
        about: "Against the London, Black hits back at once with the c-pawn.",
        moves: "d4 d5 Bf4 c5 e3 Nc6 Nf3 Nf6 c3 Qb6 Qb3 c4 Qxb6 axb6",
        notes: {
          "2...c5": "White's bishop has left home, so the b-pawn is loose. Hit the centre with your c-pawn.",
          "4...Nf6": "Develop first. The queen comes out once the knights are out.",
          "5...Qb6": "Now the queen hits the b-pawn.",
          "6...c4": "Push past, gaining space.",
          "7...axb6": "Black is comfortable: the a-file is open for the rook.",
        },
        arrows: { "2...c5": ["@b2"], "4...Nf6": ["d8b6"], "5...Qb6": ["b6b2"] },
      },
      {
        title: "...Qb6 trap",
        about: "Against the London, bringing the queen out too early lets White gain time.",
        moves: "d4 d5 Bf4 c5 e3 Qb6 Nc3",
        notes: {
          "3...Qb6": "Too early.",
          "4.Nc3": "If you grab the pawn now, the knight jumps in and threatens a fork of king and rook. Get your knights out first.",
        },
        arrows: { "4.Nc3": ["b6b2", "c3b5!", "b5c7!"] },
      },
      {
        title: "Blackmar-Diemer Gambit",
        about: "White gives up a pawn for quick development.",
        moves: "d4 d5 e4 dxe4 Nc3 Nf6 f3 exf3 Nxf3 e6",
        notes: {
          "2.e4": "The Blackmar-Diemer Gambit: Black is already better.",
          "2...dxe4": "Take the pawn.",
          "4...exf3": "Take again.",
          "5...e6": "Solid: Black is a pawn up and develops normally.",
        },
      },
    ],
  },
  {
    opening: "Caro-Kann / Slav (...c6 and ...d5)",
    intro: "Support your centre pawn with the c-pawn, and get the light-squared bishop out before the e-pawn moves.",
    lines: [
      {
        title: "Main",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3",
        notes: {
          "1...c6": "Prepare the d-pawn push, so you can take back with a pawn.",
          "4...Bf5": "The bishop comes out before the e-pawn shuts it in.",
          "5...Bg6": "Keep the bishop.",
          "6...h6": "Give the bishop a home, so White's h-pawn can't trap it.",
          "10.Qxd3": "Solid: next the e-pawn, the knight and castling.",
        },
        arrows: { "1...c6": ["d7d5"], "4...Bf5": ["e7e6"], "6...h6": ["g6h7", "h4h5!"], "10.Qxd3": ["e7e6", "g8f6"] },
      },
      {
        title: "Advance variation",
        about: "White pushes the e-pawn to grab space. Black gets the bishop out, then hits back with the c-pawn.",
        moves: "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5",
        notes: {
          "3.e5": "The Advance Variation: White grabs space.",
          "3...Bf5": "Bishop out first, as always.",
          "5...c5": "Hit the base of White's pawn chain.",
        },
      },
      {
        title: "Exchange variation",
        about: "White swaps in the centre, leaving a symmetrical, calm position.",
        moves: "e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4",
        notes: {
          "3...cxd5": "Take back with the c-pawn: that's what your first move prepared.",
          "6...Bg4": "The bishop comes out actively.",
        },
      },
      {
        title: "...Nd7 variation",
        about: "Black brings a knight out instead of the bishop. Watch out for tricks on f7.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Bc4 Ngf6 Ng5 e6 Qe2 Nb6",
        notes: {
          "4...Nd7": "Another way: this prepares the other knight's development.",
          "6.Ng5": "Knight and bishop both aim at f7.",
          "6...e6": "Block the bishop.",
          "7.Qe2": "The queen lines up on the e-file against Black's king.",
          "7...Nb6": "Kick the bishop away: the accurate answer.",
        },
        arrows: { "4...Nd7": ["g8f6"], "6.Ng5": ["g5f7!", "c4f7!"] },
      },
      {
        title: "Slav variation",
        about: "Against the Queen's Gambit, Black plays the same idea: the c-pawn supports the centre pawn.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O",
        notes: {
          "2...c6": "The Slav: support your centre pawn with the c-pawn.",
          "4...dxc4": "Take the pawn.",
          "5...Bf5": "Bishop out before the e-pawn moves, as in the Caro-Kann.",
          "8...O-O": "Pawn returned, everything developed: a comfortable game.",
        },
      },
      {
        title: "Qb3 variation",
        about: "In the Slav, White's queen attacks the b-pawn. Black meets it with the queen.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 e3 Bf5 Qb3 Qb6",
        notes: {
          "4...Bf5": "The bishop is out.",
          "5.Qb3": "With the bishop gone, the pawn behind it is loose.",
          "5...Qb6": "Guard the pawn and offer to swap queens.",
        },
        arrows: { "5.Qb3": ["b3b7!", "@b7!"] },
      },
      {
        title: "Slav Exchange",
        about: "White swaps in the centre in the Slav. Black develops the knights.",
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
          "2...g6": "The fianchetto: the bishop goes to the long diagonal.",
          "5...O-O": "Castle before opening the centre.",
          "6...e5": "The key strike at the centre.",
          "8...Ne7": "White closes the centre. Black's knights head for the kingside, ready for a pawn strike there.",
        },
        arrows: { "2...g6": ["f8g7"], "8...Ne7": ["f7f5"] },
      },
      {
        title: "Sämisch variation",
        about: "White supports the e-pawn with the f-pawn. Black hits back with the c-pawn.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 c5 dxc5 dxc5 Qxd8 Rxd8 Bxc5 Nc6",
        notes: {
          "5.f3": "The Sämisch: the pawn supports the e-pawn and prepares a kingside pawn storm.",
          "6...c5": "Strike at once, offering a pawn.",
          "9...Nc6": "Black has given a pawn, but White lags in development and the dark squares are weak. About equal.",
        },
      },
      {
        title: "Four Pawns variation",
        about: "White pushes four pawns into the centre. Black strikes at it with the c-pawn.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5",
        notes: {
          "5.f4": "Four pawns in the centre.",
          "6...c5": "Hit the centre before it rolls forward.",
        },
      },
      {
        title: "London variation",
        about: "Against the London, Black keeps the same setup and hits back with the c-pawn.",
        moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 d6 h3 O-O Be2 c5",
        notes: {
          "2.Bf4": "A London setup.",
          "6...c5": "Against the calm London, hit the centre with the c-pawn rather than the e-pawn. It also opens your bishop's long diagonal.",
        },
      },
      {
        title: "Pirc variation",
        about: "Against the e-pawn, Black uses the same setup.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6",
        notes: {
          "1...d6": "The Pirc: let White build a centre, then attack it.",
          "3...g6": "The same fianchetto as the King's Indian.",
          "6...c6": "Flexible: a queenside push or a bishop pin can come next.",
        },
        arrows: { "6...c6": ["b7b5", "c8g4"] },
      },
      {
        title: "Austrian Attack",
        about: "In the Pirc, White grabs space with the f-pawn. Black answers with the c-pawn.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5",
        notes: {
          "4.f4": "The Austrian Attack: three pawns in the centre.",
          "5...c5": "Hit the centre at once.",
        },
      },
      {
        title: "150 Attack",
        about: "White aims the bishop and queen at your king. Black counters on the queenside with pawn pushes.",
        moves: "e4 d6 d4 Nf6 Nc3 g6 Be3 c6 Qd2 b5",
        notes: {
          "4.Be3": "White's plan: the queen comes up, then the bishop goes forward to swap off your long-diagonal bishop.",
          "5...b5": "Counterplay on the queenside.",
        },
        arrows: { "4.Be3": ["d1d2!", "e3h6!"] },
      },
    ],
  },
  {
    opening: "Sicilian Defence",
    intro: "Fight for the centre from the side with the c-pawn, then develop and castle.",
    lines: [
      {
        title: "Main",
        moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Be2 e6 O-O Be7",
        notes: {
          "1...c5": "The Sicilian: fight for the centre from the side.",
          "3...cxd4": "Swap the c-pawn for White's d-pawn: you keep two centre pawns, White only one.",
          "4...Nf6": "Hit the e-pawn.",
          "6...e6": "A small centre that's hard to break.",
          "7...Be7": "Castle next. Black plays on the queenside with pawn pushes.",
        },
        arrows: { "4...Nf6": ["f6e4"], "7...Be7": ["a7a6", "b7b5"] },
      },
      {
        title: "Alapin ...Nf6 variation",
        about: "White prepares a full centre with the c-pawn. Black hits the e-pawn with the knight.",
        moves: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6",
        notes: {
          "2.c3": "The Alapin: the pawn prepares a d-pawn push for a full centre.",
          "2...Nf6": "Hit the e-pawn at once.",
          "6...d6": "Challenge White's advanced pawn.",
        },
        arrows: { "2.c3": ["d2d4!"], "2...Nf6": ["f6e4"] },
      },
      {
        title: "Alapin ...d5 variation",
        about: "Against the c-pawn move, Black strikes in the centre at once.",
        moves: "e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 e6",
        notes: {
          "2...d5": "Or strike in the centre with the d-pawn.",
          "3...Qxd5": "The queen is safe in the centre: White's knight can't come out to hit it, because the pawn is in the way.",
          "5...e6": "Solid development.",
        },
      },
      {
        title: "Bb5+ variation",
        about: "White checks with the bishop and swaps bishops. Black takes back with the queen.",
        moves: "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O Nc6 c3 Nf6",
        notes: {
          "3.Bb5+": "A bishop check.",
          "3...Bd7": "Block it, offering to swap bishops.",
          "6...Nf6": "Normal development, and a comfortable game.",
        },
      },
      {
        title: "Grand Prix variation",
        about: "White pushes the f-pawn for a kingside attack. Black puts the bishop on the long diagonal and hits back.",
        moves: "e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bb5 Nd4",
        notes: {
          "3.f4": "The Grand Prix: White plans a kingside attack.",
          "3...g6": "Set up with the fianchetto.",
          "5...Nd4": "Jump into the centre: the knight is strong there.",
        },
        arrows: { "3...g6": ["f8g7"] },
      },
      {
        title: "Smith-Morra Gambit",
        about: "White gives a pawn for quick development. Black takes it and develops.",
        moves: "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6",
        notes: {
          "3.c3": "The Smith-Morra Gambit.",
          "3...dxc3": "Accept it.",
          "5...d6": "Solid: a pawn up. Develop with the e-pawn, the knight and the bishop.",
        },
        arrows: { "5...d6": ["e7e6", "g8f6", "f8e7"] },
      },
      {
        title: "1.d4 variation",
        about: "Against 1.d4, play the King's Indian.",
        moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5",
        notes: {
          "1...Nf6": "Against the d-pawn this repertoire plays the King's Indian. See that lesson for more.",
          "6...e5": "The key strike at the centre.",
        },
      },
    ],
  },
  {
    opening: "Catalan Opening",
    intro: "Like the Queen's Gambit, but the bishop goes on the long diagonal to press on the centre.",
    lines: [
      {
        title: "Main",
        moves: "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O Nbd7 Qc2 c6 Nbd2 b6 e4",
        notes: {
          "3.g3": "The Catalan: the bishop goes to the long diagonal instead of the knight coming out.",
          "4.Bg2": "The bishop's long diagonal runs through the centre towards the far corner.",
          "6.O-O": "Castled. White's king is safe behind the bishop.",
          "7.Qc2": "The queen guards the c-pawn and supports an e-pawn push.",
          "8...b6": "Black prepares to fight the long-diagonal bishop.",
          "9.e4": "White takes more of the centre: a small, lasting edge.",
        },
        arrows: { "3.g3": ["f1g2"], "4.Bg2": ["g2a8"], "7.Qc2": ["e2e4"], "8...b6": ["c8b7!"] },
      },
      {
        title: "Qa4+ variation",
        about: "Black takes the c-pawn early. A queen check wins it back at once.",
        moves: "d4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Qa4+ Nbd7 Qxc4 a6 Qc2",
        notes: {
          "4...dxc4": "The Open Catalan: Black takes the pawn.",
          "5.Qa4+": "Win it back at once, with check.",
          "6.Qxc4": "Pawn regained.",
          "7.Qc2": "The queen steps back before the b-pawn can kick it. About equal, with easy play for White.",
        },
        arrows: { "7.Qc2": ["b7b5!"] },
      },
      {
        title: "...dxc4 variation",
        about: "Black takes the c-pawn after castling. White's queen wins it back.",
        moves: "d4 Nf6 c4 e6 Nf3 d5 g3 Be7 Bg2 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7",
        notes: {
          "6...dxc4": "Black takes after both sides have castled.",
          "7.Qc2": "No hurry: the queen takes the pawn back next.",
          "8...b5": "Black gains queenside space with tempo.",
          "9...Bb7": "Black's bishop fights for the long diagonal. White carries on developing the other bishop and the rook.",
        },
        arrows: { "7.Qc2": ["c2c4"], "9...Bb7": ["c1f4", "a1c1"] },
      },
      {
        title: "...Bb4+ variation",
        about: "Black checks with the bishop to disturb White's development.",
        moves: "d4 Nf6 c4 e6 g3 Bb4+ Bd2 Be7 Bg2 d5 Nf3 O-O O-O",
        notes: {
          "3...Bb4+": "A check to disturb White's development.",
          "4.Bd2": "Block with the bishop.",
          "4...Be7": "Black drops back: White's bishop is a little passive now, but White is still fine.",
          "7.O-O": "Castled, with the usual Catalan setup.",
        },
      },
      {
        title: "...d5 variation",
        about: "Black starts with the d-pawn. The moves come in a different order but reach the same setup.",
        moves: "d4 d5 c4 e6 Nf3 Nf6 g3 Be7 Bg2 O-O O-O",
        notes: {
          "4.g3": "Against this setup the Catalan works just the same.",
        },
      },
      {
        title: "Slav variation",
        about: "Against the Slav, the long-diagonal bishop still presses on the centre.",
        moves: "d4 d5 c4 c6 Nf3 Nf6 g3 Bf5 Bg2 e6 O-O",
        notes: {
          "2...c6": "The Slav: Black's light-squared bishop can come out.",
          "4.g3": "The Catalan setup still works.",
          "6.O-O": "About equal. White's plans include the knight coming out, a knight jump, or the queen stepping out.",
        },
        arrows: { "2...c6": ["c8f5!"], "6.O-O": ["b1c3", "f3h4", "d1b3"] },
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
          "3.Nxe5": "White takes the e-pawn.",
          "3...Nc6": "The Stafford Gambit: instead of winning the pawn back, Black develops and invites the swap of knights.",
          "4...dxc6": "Take back towards the centre: the d-file and your bishop open up.",
          "5...Bc5": "The bishop aims at f2, the weak point next to White's king.",
        },
        arrows: { "3...Nc6": ["e5c6!"], "5...Bc5": ["c5f2", "@f2"] },
      },
      {
        title: "Bg5 trap",
        about: "The greedy bishop pin walks into a mating attack.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#",
        notes: {
          "6.Bg5": "Pinning the knight to the queen looks natural, but it's a blunder:",
          "6...Nxe4": "Let the queen go!",
          "7.Bxd8": "Taking the queen loses at once. Taking the knight instead gets the pawn back for Black.",
          "7...Bxf2+": "Check, and the king has only one square.",
          "8...Bg4#": "Checkmate: the king has no escape. This is the trap that made the Stafford famous.",
        },
      },
      {
        title: "Bc4 trap",
        about: "Developing the bishop and castling fall for a strike on f2.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 Nc3 Bc5 Bc4 Ng4 O-O Qh4 h3 Nxf2 Rxf2 Qxf2+",
        notes: {
          "6.Bc4": "Natural but inaccurate: now Black's threats on f2 start.",
          "6...Ng4": "Two pieces hit f2.",
          "7.O-O": "Castling into it is the real blunder:",
          "7...Qh4": "Threatening mate on h2.",
          "9...Qxf2+": "Black wins material and White's king is in trouble.",
        },
        arrows: { "6.Bc4": ["@f2"], "6...Ng4": ["g4f2", "c5f2"], "7...Qh4": ["h4h2"] },
      },
      {
        title: "Be2 refutation",
        about: "A calm bishop move stops Black's tricks.",
        moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Be2",
        notes: {
          "6.Be2": "The calm bishop move takes the sting out of Black's knight and bishop jumps. White castles next and stays a pawn up. Expect strong players to answer like this.",
        },
        arrows: { "6.Be2": ["f6g4!", "c8g4!"] },
      },
      {
        title: "d4 variation",
        about: "White pushes the d-pawn instead of taking Black's e-pawn.",
        moves: "e4 e5 Nf3 Nf6 d4 Nxe4 Bd3 d5 Nxe5 Nd7",
        notes: {
          "3.d4": "No gambit: White opens the centre instead.",
          "3...Nxe4": "Take the pawn: it's Petrov theory now, and equal.",
          "5...Nd7": "Challenge the strong knight in the centre.",
        },
      },
      {
        title: "Nc3 variation",
        about: "White just develops the knight instead.",
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
    intro: "A compact setup that holds the centre firmly. Watch out for attacks on f7.",
    lines: [
      {
        title: "Main",
        moves: "e4 d6 d4 Nf6 Nc3 Nbd7 Nf3 e5 Bc4 Be7 O-O O-O a4 c6",
        notes: {
          "1...d6": "Start with the d-pawn.",
          "2...Nf6": "Attack the e-pawn straight away.",
          "3...Nbd7": "The Lion: the knight comes out to support the e-pawn push.",
          "4...e5": "Now the push is fully supported, and Black keeps a pawn in the centre.",
          "6...O-O": "Castled: f7 is much safer now.",
          "7...c6": "This makes room for the queen and prepares a queenside push later. Solid.",
        },
        arrows: { "2...Nf6": ["f6e4"], "3...Nbd7": ["e7e5"], "6...O-O": ["@f7"], "7...c6": ["d8c7", "b7b5"] },
      },
      {
        title: "Bxf7+ variation",
        about: "White sacrifices on f7 too early, and Black comes out fine.",
        moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 Bxf7+ Kxf7 Ng5+ Kg8 Ne6 Qe8 Nxc7 Qg6",
        notes: {
          "6.Bxf7+": "A well-known trap, but it's a mistake if Black defends well.",
          "7...Kg8": "The right square. Going forward instead gives White a strong attack.",
          "8.Ne6": "The knight hits the queen and the c-pawn.",
          "9.Nxc7": "It forks the queen and rook...",
          "9...Qg6": "...but Black counter-attacks White's pawns, and the knight in the corner is stranded. Black is better.",
        },
        arrows: { "8.Ne6": ["e6d8!", "e6c7!"], "9...Qg6": ["g6g2", "g6e4"] },
      },
      {
        title: "Ng5 variation",
        about: "White aims a knight jump and a bishop sacrifice at Black's king. Black defends accurately.",
        moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 Ng5 O-O Bxf7+ Rxf7 Ne6 Qe8",
        notes: {
          "6.Ng5": "Knight and bishop both aim at f7.",
          "8.Ne6": "The queen is attacked...",
          "8...Qe8": "...and this is the only good square: about equal. Taking a pawn instead loses.",
        },
        arrows: { "6.Ng5": ["g5f7!", "c4f7!"] },
      },
      {
        title: "Hanham variation",
        about: "Why the Hanham move order, with the other knight first, runs into trouble.",
        moves: "e4 e5 Nf3 d6 d4 Nd7 Bc4 c6 O-O Be7 dxe5 dxe5 Ng5 Bxg5 Qh5 Qe7 Qxg5",
        notes: {
          "3...Nd7": "The Hanham move order: this knight comes out before the other one.",
          "4.Bc4": "Now the bishop, with knight jumps in the air, is awkward to meet.",
          "7.Ng5": "Strong: f7 is hit, and if Black takes the knight, the queen wins the piece back.",
          "9.Qxg5": "White is clearly better. That's why this repertoire plays the Lion order, with the knight to f6 first.",
        },
        arrows: { "3...Nd7": ["g8f6"], "4.Bc4": ["f3g5!"], "7.Ng5": ["g5f7!", "e7g5"] },
      },
      {
        title: "Hanham Ng5 variation",
        about: "In the Hanham, White's knight jump is met by a knight on the edge.",
        moves: "e4 e5 Nf3 d6 d4 Nd7 Bc4 c6 Ng5 Nh6",
        notes: {
          "5.Ng5": "Threatening to take on f7 with the knight or the bishop.",
          "5...Nh6": "Cover f7 with the knight. Black holds.",
        },
        arrows: { "5.Ng5": ["g5f7!", "c4f7!"] },
      },
      {
        title: "1.d4 variation",
        about: "Against 1.d4, Black uses the same setup: the Old Indian.",
        moves: "d4 Nf6 c4 d6 Nc3 Nbd7 e4 e5 Nf3 Be7 Be2 O-O O-O c6",
        notes: {
          "2...d6": "The Old Indian: the same Lion setup.",
          "4...e5": "The Lion's centre pawn.",
          "7...c6": "Solid but cramped. Plans: queenside pawn pushes, or the rook and bishop regrouping.",
        },
        arrows: { "2...d6": ["b8d7", "e7e5"], "7...c6": ["a7a6", "b7b5", "f8e8"] },
      },
      {
        title: "f4 variation",
        about: "White grabs space with the f-pawn. Black hits back in the centre.",
        moves: "e4 d6 d4 Nf6 Nc3 Nbd7 f4 e5 Nf3 exd4 Qxd4 c6",
        notes: {
          "4.f4": "White grabs space with the f-pawn.",
          "4...e5": "Strike at once.",
          "5...exd4": "Take: holding the centre pawn doesn't work here.",
          "6...c6": "Next the d-pawn push challenges the centre.",
        },
        arrows: { "6...c6": ["d6d5"] },
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
          "5.Ng5": "Heading for f7. Already slightly risky.",
          "5...h6": "Black asks the knight.",
          "6.Nxf7": "The Alien Gambit: a whole knight to expose Black's king.",
          "7.Bc4+": "Check, aiming at the king.",
          "7...Be6": "The best defence: Black blocks and gives back a little material.",
          "8...Kxe6": "Black's king is out, but Black is a piece for two pawns up and clearly better.",
        },
        arrows: { "5.Ng5": ["g5f7"] },
      },
      {
        title: "...Kg6 trap",
        about: "Here Black's king steps forward and gets caught.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Bc4+ Kg6",
        notes: {
          "7...Kg6": "The natural-looking king move throws away Black's advantage: White's knight and checks are now worth the piece. About equal. Stepping back keeps Black better.",
        },
        arrows: { "7...Kg6": ["g1f3"] },
      },
      {
        title: "...Bf5 variation",
        about: "Black brings the bishop out instead, so there's no gambit. Play the Classical.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7",
        notes: {
          "4...Bf5": "Black plays the Classical Caro-Kann instead: no gambit possible.",
          "5.Ng3": "Kick the bishop.",
          "6.h4": "Threatening to push on and trap the bishop.",
          "7...Nd7": "A normal, equal Caro-Kann. Develop the bishop and castle.",
        },
        arrows: { "6.h4": ["h4h5"], "7...Nd7": ["f1d3"] },
      },
      {
        title: "...Nd7 variation",
        about: "Black brings a knight out instead, so there's no gambit.",
        moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Bc4 Ngf6 Ng5 e6 Qe2 Nb6",
        notes: {
          "4...Nd7": "Black prepares to bring the other knight out instead.",
          "6.Ng5": "The same f7 idea, but here there's no sacrifice: just pressure.",
          "7.Qe2": "Lining up on the e-file.",
          "7...Nb6": "Black kicks the bishop. Equal.",
        },
        arrows: { "4...Nd7": ["g8f6!"], "6.Ng5": ["@f7"] },
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
      const where = seen.line === "Main" ? "the main line" : `the ${seen.line}`;
      const said = `This is the same position as in ${where}, reached in a different order.`;
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
