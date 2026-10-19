// Lessons on middlegame and endgame principles: each is a few short steps,
// a position with arrows and highlighted squares, and a sentence or two.
// Every position is checked with Stockfish before it goes in (see
// tests/lessons in the scratchpad notes). "themes" picks the "Try it"
// puzzles from public/puzzles/<phase>.json.

export interface LessonStep {
  fen: string;
  text: string;
  arrows?: [from: string, to: string, kind?: "good" | "bad" | "plan"][];
  squares?: [square: string, kind?: "good" | "bad" | "plan"][];
}

export interface Lesson {
  title: string;
  summary: string;
  themes: string[]; // lichess puzzle themes for "Try it"
  steps: LessonStep[];
}

export type TrainPhase = "middlegame" | "endgame";

export const LESSONS: Record<TrainPhase, Lesson[]> = {
  middlegame: [
    {
      "title": "Reading a position",
      "summary": "Four questions to ask before you choose a move.",
      "themes": [
        "quietMove",
        "advantage"
      ],
      "steps": [
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Before you choose a move, read the position. Ask four questions: what's the material, how safe are the kings, what are the pawns doing, and whose pieces are working?"
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Material first. Every piece and pawn is still on the board, so material is level."
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "King safety. Both kings have castled behind pawns that haven't moved. Neither king can be attacked yet.",
          "squares": [
            [
              "g1",
              "good"
            ],
            [
              "g8",
              "good"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Pawns. White's c4 pawn presses on d5. Black's pawns on c6, d5 and e6 are a solid wall, but they also shut in Black's own bishop.",
          "squares": [
            [
              "c4",
              "good"
            ],
            [
              "d4",
              "good"
            ],
            [
              "c6",
              "plan"
            ],
            [
              "d5",
              "plan"
            ],
            [
              "e6",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Pieces. White's bishop on d3 points at Black's king. Black's bishop on c8 can't move at all: it's Black's problem piece.",
          "arrows": [
            [
              "d3",
              "h7",
              "good"
            ]
          ],
          "squares": [
            [
              "c8",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "So the position is about equal, and the plans follow from what you found. White keeps developing with b3 and Bb2. Black frees the c8 bishop with ...b6 and ...Bb7.",
          "arrows": [
            [
              "b2",
              "b3",
              "good"
            ],
            [
              "c1",
              "b2",
              "good"
            ],
            [
              "b7",
              "b6",
              "plan"
            ],
            [
              "c8",
              "b7",
              "plan"
            ]
          ]
        }
      ]
    },
    {
      "title": "Spotting weaknesses",
      "summary": "Holes, weak pawns and loose pieces.",
      "themes": [
        "hangingPiece",
        "fork"
      ],
      "steps": [
        {
          "fen": "r1bqk2r/1p2bppp/p1np1n2/4p3/4P3/1NN1B3/PPP1BPPP/R2QK2R w KQkq - 0 9",
          "text": "A weakness is something that can't easily be fixed. After ...e5, no black pawn can ever cover d5: it's a hole. The d6 pawn behind it is backward, stuck where no pawn can support it.",
          "squares": [
            [
              "d5",
              "bad"
            ],
            [
              "d6",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp2bppp/2n1pn2/8/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10",
          "text": "An isolated pawn has no pawns beside it to protect it. White's d4 pawn has to be guarded by pieces, and the square in front of it, d5, is a safe home for a black piece.",
          "squares": [
            [
              "d4",
              "bad"
            ],
            [
              "d5",
              "plan"
            ]
          ]
        },
        {
          "fen": "6k1/5pp1/7p/1b6/8/4n3/6PP/3Q2K1 w - - 0 1",
          "text": "Loose pieces are pieces that nobody defends. Here Black's bishop on b5 and knight on e3 are both loose.",
          "squares": [
            [
              "b5",
              "bad"
            ],
            [
              "e3",
              "bad"
            ]
          ]
        },
        {
          "fen": "6k1/5pp1/7p/1b6/8/4n3/6PP/3Q2K1 w - - 0 1",
          "text": "Loose pieces drop off. Look for one move that attacks both.",
          "arrows": [
            [
              "d1",
              "b3",
              "good"
            ]
          ]
        },
        {
          "fen": "6k1/5pp1/7p/1b6/8/1Q2n3/6PP/6K1 b - - 1 1",
          "text": "Qb3 hits the bishop and the knight at once, and Black can only save one. Make it a habit: after every move, ask which pieces are undefended, yours and theirs.",
          "arrows": [
            [
              "b3",
              "b5",
              "bad"
            ],
            [
              "b3",
              "e3",
              "bad"
            ]
          ]
        }
      ]
    },
    {
      "title": "Using weaknesses",
      "summary": "Outposts, piling up and open files.",
      "themes": [
        "advantage",
        "trappedPiece"
      ],
      "steps": [
        {
          "fen": "r1bqk2r/1p2bppp/p1np1n2/4p3/4P3/1NN1B3/PPP1BPPP/R2QK2R w KQkq - 0 9",
          "text": "Once you've found a hole, put a piece in it. A knight on d5 can never be chased away by a pawn.",
          "arrows": [
            [
              "c3",
              "d5",
              "good"
            ]
          ],
          "squares": [
            [
              "d5",
              "good"
            ]
          ]
        },
        {
          "fen": "r1bqk2r/1p2bppp/p1np1n2/3Np3/4P3/1N2B3/PPP1BPPP/R2QK2R b KQkq - 1 9",
          "text": "From d5 the knight reaches c7, e7, f6 and b6. If Black swaps it off with ...Nxd5, White takes back with the e-pawn and gains space.",
          "arrows": [
            [
              "d5",
              "c7",
              "good"
            ],
            [
              "d5",
              "e7",
              "good"
            ],
            [
              "d5",
              "f6",
              "good"
            ],
            [
              "d5",
              "b6",
              "good"
            ]
          ]
        },
        {
          "fen": "2rq1rk1/pp3ppp/2n1bn2/3p4/8/2N1BN2/PP2QPPP/3R1RK1 w - - 0 15",
          "text": "Against a weak pawn that can't move, pile up. Black's isolated d5 pawn is attacked by White's knight and rook, and defended by Black's knight, bishop and queen.",
          "arrows": [
            [
              "c3",
              "d5",
              "good"
            ],
            [
              "d1",
              "d5",
              "good"
            ]
          ],
          "squares": [
            [
              "d5",
              "bad"
            ]
          ]
        },
        {
          "fen": "2rq1rk1/pp3ppp/2n1bn2/3p4/8/2N1BN2/PP2QPPP/3R1RK1 w - - 0 15",
          "text": "So bring more attackers and remove the defenders: Nd4 goes after the e6 bishop, and Bg5 can take the f6 knight. A pawn falls when it's attacked more often than it's defended.",
          "arrows": [
            [
              "f3",
              "d4",
              "good"
            ],
            [
              "e3",
              "g5",
              "plan"
            ]
          ],
          "squares": [
            [
              "e6",
              "bad"
            ],
            [
              "f6",
              "bad"
            ]
          ]
        },
        {
          "fen": "3r2k1/pp3pp1/4p2p/8/8/4P2P/PP3PP1/2R3K1 w - - 0 25",
          "text": "Open files are targets too. White's rook takes the c-file, with nothing in its way to the seventh rank.",
          "arrows": [
            [
              "c1",
              "c7",
              "good"
            ]
          ]
        },
        {
          "fen": "3r2k1/ppR2pp1/4p2p/8/8/4P2P/PP3PP1/6K1 b - - 1 25",
          "text": "A rook on the seventh attacks pawns from the side, where they're hard to defend. Note h3: the king has a square, so Black has no back-rank check.",
          "arrows": [
            [
              "c7",
              "b7",
              "good"
            ],
            [
              "c7",
              "f7",
              "good"
            ]
          ],
          "squares": [
            [
              "h2",
              "good"
            ]
          ]
        }
      ]
    },
    {
      "title": "Improving your worst piece",
      "summary": "When nothing is happening, find the piece doing least.",
      "themes": [
        "quietMove"
      ],
      "steps": [
        {
          "fen": "r2q1rk1/pp1b1ppp/2n1pn2/3p4/2PP4/N4N2/PP2BPPP/R2Q1RK1 w - - 0 11",
          "text": "When there's nothing to attack, find your worst piece and make it better. Here it's the knight on a3: on the edge of the board it does very little.",
          "squares": [
            [
              "a3",
              "bad"
            ]
          ]
        },
        {
          "fen": "r2q1rk1/pp1b1ppp/2n1pn2/3p4/2PP4/N4N2/PP2BPPP/R2Q1RK1 w - - 0 11",
          "text": "Give it a route back to the centre. Nc2 and Ne3 bring it to a square where it presses on d5.",
          "arrows": [
            [
              "a3",
              "c2",
              "good"
            ],
            [
              "c2",
              "e3",
              "good"
            ],
            [
              "e3",
              "d5",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bqk2r/pp1nbppp/2n1p3/2ppP3/3P4/2PB1N2/PP3PPP/RNBQK2R b KQkq - 0 7",
          "text": "Now Black's turn. Black's worst piece is the bishop on c8, locked in by its own pawns on e6 and d5.",
          "squares": [
            [
              "c8",
              "bad"
            ],
            [
              "e6",
              "plan"
            ],
            [
              "d5",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bqk2r/pp1nbppp/2n1p3/2ppP3/3P4/2PB1N2/PP3PPP/RNBQK2R b KQkq - 0 7",
          "text": "Sometimes you improve a piece by changing the pawns. ...f6 attacks White's e5 pawn and opens lines.",
          "arrows": [
            [
              "f7",
              "f6",
              "good"
            ],
            [
              "f6",
              "e5",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bqk2r/pp2b1pp/2n1pn2/2pp4/3P4/2PB1N2/PP3PPP/RNBQK2R w KQkq - 0 9",
          "text": "After ...Nxf6 the knight is back on a good square and the f-file is half open. Next, ...e5 would free the c8 bishop at last.",
          "arrows": [
            [
              "e6",
              "e5",
              "plan"
            ],
            [
              "c8",
              "g4",
              "plan"
            ]
          ]
        }
      ]
    },
    {
      "title": "Calculating",
      "summary": "Checks, captures and threats, in that order.",
      "themes": [
        "fork",
        "discoveredAttack",
        "pin"
      ],
      "steps": [
        {
          "fen": "r3k3/ppp5/8/1N6/8/8/PPP5/4K3 w - - 0 1",
          "text": "When you calculate, start with the forcing moves: checks, then captures, then threats. They leave your opponent few replies, so you can see where they lead."
        },
        {
          "fen": "r3k3/ppp5/8/1N6/8/8/PPP5/4K3 w - - 0 1",
          "text": "List the checks: Nd6+ and Nxc7+. Nd6+ leads nowhere, but Nxc7+ is a check and a capture.",
          "arrows": [
            [
              "b5",
              "d6",
              "plan"
            ],
            [
              "b5",
              "c7",
              "good"
            ]
          ]
        },
        {
          "fen": "r3k3/ppN5/8/8/8/8/PPP5/4K3 b - - 0 1",
          "text": "The knight checks the king and attacks the rook at the same time. Once the king moves, Nxa8 wins the rook.",
          "arrows": [
            [
              "c7",
              "e8",
              "bad"
            ],
            [
              "c7",
              "a8",
              "bad"
            ]
          ]
        },
        {
          "fen": "r3k3/ppN5/8/8/8/8/PPP5/4K3 b - - 0 1",
          "text": "Then do the same from your opponent's side: what checks, captures and threats would they have after your move? That one question saves most blunders."
        }
      ]
    },
    {
      "title": "Making a plan",
      "summary": "Let the pawns tell you where to play.",
      "themes": [
        "queensideAttack",
        "advantage"
      ],
      "steps": [
        {
          "fen": "r2q1rk1/pp1nbppp/2p2n2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10",
          "text": "Plans come from the pawns. On the queenside, White has two pawns (a and b) against Black's three (a, b and c).",
          "squares": [
            [
              "a2",
              "good"
            ],
            [
              "b2",
              "good"
            ],
            [
              "a7",
              "plan"
            ],
            [
              "b7",
              "plan"
            ],
            [
              "c6",
              "plan"
            ]
          ]
        },
        {
          "fen": "r2q1rk1/pp1nbppp/2p2n2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10",
          "text": "White's plan is the minority attack: push b4 and b5 to swap the b-pawn for Black's c-pawn.",
          "arrows": [
            [
              "b2",
              "b4",
              "good"
            ],
            [
              "b4",
              "b5",
              "good"
            ],
            [
              "b5",
              "c6",
              "good"
            ]
          ]
        },
        {
          "fen": "r2q1rk1/pp1nbppp/2p2n2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10",
          "text": "When the pawns swap on c6, Black is left with a weak pawn on c6 (or d5), and White's pieces can use the c-file and the c5 square.",
          "squares": [
            [
              "c6",
              "bad"
            ],
            [
              "c5",
              "good"
            ]
          ]
        },
        {
          "fen": "r2q1rk1/pp1nbppp/2p2n2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10",
          "text": "Black has a plan too, on the other side: a knight to e4, then ...f5, aiming at White's king.",
          "arrows": [
            [
              "f6",
              "e4",
              "plan"
            ],
            [
              "f7",
              "f5",
              "plan"
            ]
          ]
        },
        {
          "fen": "r2q1rk1/pp1nbppp/2p2n2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10",
          "text": "Once you have a plan, make each move serve it: Rb1, b4, a4 and b5. A move that doesn't help the plan needs a good reason.",
          "arrows": [
            [
              "a1",
              "b1",
              "good"
            ],
            [
              "b2",
              "b4",
              "good"
            ],
            [
              "a2",
              "a4",
              "good"
            ]
          ]
        }
      ]
    },
    {
      "title": "Playing equal positions",
      "summary": "Small improvements, prophylaxis and keeping the tension.",
      "themes": [
        "quietMove",
        "defensiveMove"
      ],
      "steps": [
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Most positions are roughly equal. There's nothing to win yet, so the job is to improve a little every move and wait for your opponent's mistakes."
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Improve your pieces. Qc2 and Rd1 put them on better squares, and small steps add up.",
          "arrows": [
            [
              "d1",
              "c2",
              "good"
            ],
            [
              "f1",
              "d1",
              "good"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Ask what your opponent wants. Black would like ...dxc4 and ...c5 to free the position. Stopping that before it happens is called prophylaxis.",
          "arrows": [
            [
              "d5",
              "c4",
              "plan"
            ],
            [
              "c6",
              "c5",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Keep the tension. cxd5 exd5 would open the diagonal for Black's c8 bishop, so don't swap pawns unless it helps you.",
          "arrows": [
            [
              "c4",
              "d5",
              "bad"
            ],
            [
              "c8",
              "f5",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bq1rk1/pp1nbppp/2p1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQ1RK1 w - - 0 8",
          "text": "Trade when it helps: swap your bad pieces for their good ones, and head for an endgame when your pawns are better than theirs."
        }
      ]
    },
    {
      "title": "Attacking the king",
      "summary": "When to attack, and the classic bishop sacrifice.",
      "themes": [
        "kingsideAttack",
        "sacrifice",
        "mateIn2"
      ],
      "steps": [
        {
          "fen": "rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7",
          "text": "Attack the king when your pieces near it outnumber its defenders. White's e5 pawn has driven Black's knight from f6, so only the king guards h7.",
          "arrows": [
            [
              "d3",
              "h7",
              "good"
            ]
          ],
          "squares": [
            [
              "h7",
              "bad"
            ]
          ]
        },
        {
          "fen": "rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7",
          "text": "That's the setting for the classic bishop sacrifice: Bxh7+, then Ng5+ and Qh5.",
          "arrows": [
            [
              "d3",
              "h7",
              "good"
            ],
            [
              "f3",
              "g5",
              "good"
            ],
            [
              "d1",
              "h5",
              "good"
            ]
          ]
        },
        {
          "fen": "rnbq1r2/pppn1ppk/4p3/3pP1N1/1b1P4/2N5/PPP2PPP/R1BQK2R b KQ - 1 8",
          "text": "After Bxh7+ Kxh7 Ng5+, the king has to choose. If it goes back with ...Kg8, the queen comes to h5.",
          "arrows": [
            [
              "g5",
              "h7",
              "bad"
            ],
            [
              "d1",
              "h5",
              "good"
            ]
          ]
        },
        {
          "fen": "rnbq1rk1/pppn1pp1/4p3/3pP1NQ/1b1P4/2N5/PPP2PPP/R1B1K2R b KQ - 3 9",
          "text": "Now Qh7 mate is threatened. Black's best defence is ...Qxg5, giving up the queen for the knight.",
          "arrows": [
            [
              "h5",
              "h7",
              "bad"
            ],
            [
              "g5",
              "h7",
              "good"
            ]
          ]
        },
        {
          "fen": "rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7",
          "text": "Before you sacrifice, check: a bishop on d3, a knight that can reach g5, a queen that can reach h5, and no black piece able to come back and defend. When all of that holds, the sacrifice usually works."
        }
      ]
    }
  ],
  endgame: [],
};
