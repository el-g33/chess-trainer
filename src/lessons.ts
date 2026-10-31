// Lessons on opening, middlegame and endgame principles: each is a few short steps,
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
export type LessonPhase = "opening" | TrainPhase; // opening lessons sit on the Openings tab

export const LESSONS: Record<LessonPhase, Lesson[]> = {
  opening: [
    {
      "title": "Take the centre",
      "summary": "Why the four middle squares matter most.",
      "themes": [],
      "steps": [
        {
          "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          "text": "The opening has three jobs: take the centre, bring your pieces out, and get your king safe. The centre comes first: the four squares in the middle.",
          "squares": [
            [
              "d4",
              "plan"
            ],
            [
              "e4",
              "plan"
            ],
            [
              "d5",
              "plan"
            ],
            [
              "e5",
              "plan"
            ]
          ]
        },
        {
          "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
          "text": "A pawn in the centre controls the squares in front of it. This one covers d5 and f5, and it opens lines for the queen and a bishop.",
          "arrows": [
            [
              "e4",
              "d5",
              "good"
            ],
            [
              "e4",
              "f5",
              "good"
            ],
            [
              "d1",
              "h5",
              "plan"
            ],
            [
              "f1",
              "a6",
              "plan"
            ]
          ]
        },
        {
          "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
          "text": "Pieces control the centre too. The knight attacks the pawn on e5 and guards d4, ready for the other centre pawn.",
          "arrows": [
            [
              "f3",
              "e5",
              "good"
            ],
            [
              "f3",
              "d4",
              "good"
            ]
          ]
        },
        {
          "fen": "rnbqkbnr/ppppppp1/7p/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2",
          "text": "If you ignore the centre, your opponent takes it all. Here Black played a pawn on the edge, and White has two pawns side by side in the middle.",
          "squares": [
            [
              "e4",
              "good"
            ],
            [
              "d4",
              "good"
            ],
            [
              "h6",
              "bad"
            ]
          ]
        }
      ]
    },
    {
      "title": "Develop your pieces",
      "summary": "A new piece out with almost every move.",
      "themes": [],
      "steps": [
        {
          "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
          "text": "Developing means bringing your pieces off the back rank, where they can do something. Knights first: each has one or two good squares.",
          "arrows": [
            [
              "g1",
              "f3",
              "good"
            ],
            [
              "b1",
              "c3",
              "good"
            ]
          ]
        },
        {
          "fen": "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
          "text": "Bring out a new piece with almost every move. Both sides have two pieces out here, and both are ready to castle.",
          "squares": [
            [
              "f3",
              "good"
            ],
            [
              "c4",
              "good"
            ],
            [
              "c6",
              "plan"
            ],
            [
              "c5",
              "plan"
            ]
          ]
        },
        {
          "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/3B4/PPPP1PPP/RNBQK1NR b KQkq - 1 2",
          "text": "Don't block your centre pawns. This bishop stands in front of the d-pawn, and that pawn now shuts in the other bishop.",
          "squares": [
            [
              "d3",
              "bad"
            ],
            [
              "d2",
              "bad"
            ],
            [
              "c1",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bqkbnr/1ppp1pp1/p1n4p/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 5",
          "text": "Count the pieces each side has out. White has three, Black only one. Material is level, but White is well ahead in the race.",
          "squares": [
            [
              "f3",
              "good"
            ],
            [
              "c4",
              "good"
            ],
            [
              "c3",
              "good"
            ],
            [
              "h6",
              "bad"
            ],
            [
              "a6",
              "bad"
            ]
          ]
        }
      ]
    },
    {
      "title": "Castle early",
      "summary": "King safe, rook in the game: two jobs in one move.",
      "themes": [
        "exposedKing",
        "castling"
      ],
      "steps": [
        {
          "fen": "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
          "text": "To castle, the squares between your king and rook must be empty. Your king can't be in check, or pass through a square that's attacked.",
          "arrows": [
            [
              "e1",
              "g1",
              "plan"
            ]
          ],
          "squares": [
            [
              "f1",
              "plan"
            ],
            [
              "g1",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4",
          "text": "Castling does two jobs in one move: the king tucks away behind its pawns, and the rook comes towards the centre.",
          "squares": [
            [
              "g1",
              "good"
            ],
            [
              "f1",
              "good"
            ]
          ]
        },
        {
          "fen": "r1bq1b1r/ppp2kpp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R w KQ - 0 7",
          "text": "Once your king has moved, castling is gone for good. Black's king had to take on f7, so it's stuck in the middle, where it's easy to attack.",
          "arrows": [
            [
              "d1",
              "f3",
              "plan"
            ]
          ],
          "squares": [
            [
              "f7",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bq1b1r/ppp3pp/2n1k3/3np3/2B5/5Q2/PPPP1PPP/RNB1K2R w KQ - 2 8",
          "text": "Here it's already being chased. Even if it walks to safety later, its rook stays shut in the corner.",
          "squares": [
            [
              "e6",
              "bad"
            ],
            [
              "h8",
              "bad"
            ]
          ]
        }
      ]
    },
    {
      "title": "Don't waste moves",
      "summary": "Early queen trips and moving a piece twice.",
      "themes": [
        "trappedPiece"
      ],
      "steps": [
        {
          "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
          "text": "Every move in the opening counts. A move that doesn't bring out a new piece, or fight for the centre, is a move your opponent gets for free."
        },
        {
          "fen": "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2",
          "text": "Bringing the queen out early is tempting: here it already attacks e5 and f7.",
          "arrows": [
            [
              "h5",
              "e5",
              "good"
            ],
            [
              "h5",
              "f7",
              "good"
            ]
          ]
        },
        {
          "fen": "r1bqkb1r/pppp1p1p/2n2np1/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 5",
          "text": "But the queen is easy to chase. Each time it moves away, Black brings out a new piece with tempo.",
          "squares": [
            [
              "f3",
              "bad"
            ],
            [
              "c6",
              "plan"
            ],
            [
              "f6",
              "plan"
            ],
            [
              "g6",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
          "text": "Moving a piece again is fine when it wins something or stops a threat. Otherwise, bring out a new one. Here White can castle, or bring out the other knight.",
          "arrows": [
            [
              "e1",
              "g1",
              "good"
            ],
            [
              "b1",
              "c3",
              "good"
            ]
          ]
        }
      ]
    },
    {
      "title": "Watch f7 and f2",
      "summary": "The weakest square at the start, and how to guard it.",
      "themes": [
        "attackingF2F7"
      ],
      "steps": [
        {
          "fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
          "text": "At the start, f7 is Black's weakest square, and f2 is White's: only the king guards them.",
          "squares": [
            [
              "f7",
              "bad"
            ],
            [
              "f2",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
          "text": "Bishop and queen both aim at f7. The threat is to take on f7 with the queen: checkmate.",
          "arrows": [
            [
              "c4",
              "f7",
              "good"
            ],
            [
              "h5",
              "f7",
              "good"
            ]
          ],
          "squares": [
            [
              "f7",
              "bad"
            ]
          ]
        },
        {
          "fen": "r1bqkbnr/pppp1p1p/2n3p1/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4",
          "text": "Black blocks the queen with a pawn, and now the queen is attacked and has to move again.",
          "arrows": [
            [
              "g6",
              "h5",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
          "text": "If Black misses it and brings out a knight instead, the queen takes on f7 and it's checkmate. Glance at f7 (or f2) on every move of the opening.",
          "squares": [
            [
              "f7",
              "bad"
            ],
            [
              "e8",
              "bad"
            ]
          ]
        }
      ]
    },
    {
      "title": "Connect your rooks",
      "summary": "How you know the opening is over.",
      "themes": [],
      "steps": [
        {
          "fen": "r1b2rk1/p1q2ppp/1pnbpn2/2pp4/3P1B2/2PBPN2/PP1NQPPP/R4RK1 w - - 0 10",
          "text": "The opening is over when your pieces are out and your king is safe. A simple test: can your two rooks see each other?",
          "arrows": [
            [
              "a1",
              "f1",
              "good"
            ]
          ]
        },
        {
          "fen": "r1b2rk1/p1q2ppp/1pnbpn2/2pp4/3P1B2/2PBPN2/PP1NQPPP/R4RK1 w - - 0 10",
          "text": "White's rooks are connected. Black still has a piece at home: the bishop on c8 sits between its rooks.",
          "squares": [
            [
              "c8",
              "bad"
            ],
            [
              "a8",
              "plan"
            ],
            [
              "f8",
              "plan"
            ]
          ]
        },
        {
          "fen": "r1b2rk1/p1q2ppp/1pnbpn2/2pp4/3P1B2/2PBPN2/PP1NQPPP/R4RK1 w - - 0 10",
          "text": "Now the middlegame starts: the rooks head for the open and central files. In short, take the centre, develop, castle, don't waste moves, watch f7, and connect your rooks.",
          "arrows": [
            [
              "f1",
              "d1",
              "plan"
            ],
            [
              "a1",
              "c1",
              "plan"
            ]
          ]
        }
      ]
    }
  ],
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
  endgame: [
    {
      "title": "The active king",
      "summary": "In the endgame, the king becomes a fighting piece.",
      "themes": [
        "pawnEndgame"
      ],
      "steps": [
        {
          "fen": "8/pp3kpp/8/3K4/8/8/PP4PP/8 w - - 0 1",
          "text": "With the queens gone, the king is safe to come out, and it becomes a strong piece. Here the pawns are equal, but White's king is in the centre and Black's is not.",
          "squares": [
            [
              "d5",
              "good"
            ],
            [
              "f7",
              "bad"
            ]
          ]
        },
        {
          "fen": "8/pp3kpp/8/3K4/8/8/PP4PP/8 w - - 0 1",
          "text": "White's king walks in via d6 and c7 to attack Black's queenside pawns. Black's king is too far away to defend them.",
          "arrows": [
            [
              "d5",
              "d6",
              "good"
            ],
            [
              "d6",
              "c7",
              "good"
            ]
          ],
          "squares": [
            [
              "b7",
              "bad"
            ],
            [
              "a7",
              "bad"
            ]
          ]
        },
        {
          "fen": "8/pp3kpp/8/3K4/8/8/PP4PP/8 w - - 0 1",
          "text": "So in the endgame, bring your king towards the centre early, and towards the pawns you want to win or stop."
        }
      ]
    },
    {
      "title": "The opposition",
      "summary": "The key to king and pawn endgames.",
      "themes": [
        "pawnEndgame",
        "zugzwang"
      ],
      "steps": [
        {
          "fen": "8/3k4/8/3K4/3P4/8/8/8 b - - 0 1",
          "text": "The kings face each other with one square between them: this is called the opposition. It's Black's move, and Black has to step aside.",
          "squares": [
            [
              "d5",
              "good"
            ],
            [
              "d7",
              "bad"
            ],
            [
              "d6",
              "plan"
            ]
          ]
        },
        {
          "fen": "8/2k5/4K3/8/3P4/8/8/8 b - - 2 2",
          "text": "After ...Kc7, Ke6 puts White's king in front of the pawn on the sixth rank. From there the pawn walks through to queen.",
          "arrows": [
            [
              "d4",
              "d8",
              "good"
            ]
          ]
        },
        {
          "fen": "8/3k4/8/3K4/3P4/8/8/8 w - - 0 1",
          "text": "The same position with White to move is only a draw. White's king has to give way, and Black's king stays in front of the pawn.",
          "squares": [
            [
              "d5",
              "bad"
            ],
            [
              "d7",
              "good"
            ]
          ]
        },
        {
          "fen": "8/3k4/8/3K4/3P4/8/8/8 w - - 0 1",
          "text": "So the side that doesn't have to move \"has the opposition\". With a pawn, take it to get your king in front. Without one, take it to block the way."
        }
      ]
    },
    {
      "title": "The rule of the square",
      "summary": "Can the king catch the pawn? Count without counting.",
      "themes": [
        "promotion",
        "advancedPawn"
      ],
      "steps": [
        {
          "fen": "8/8/8/5k2/P7/8/8/K7 b - - 0 1",
          "text": "Can Black's king catch the a-pawn? Draw a square from the pawn to its queening square. If the king can step inside, it catches the pawn.",
          "arrows": [
            [
              "a4",
              "e4",
              "plan"
            ],
            [
              "e4",
              "e8",
              "plan"
            ],
            [
              "a8",
              "e8",
              "plan"
            ]
          ]
        },
        {
          "fen": "8/8/8/5k2/P7/8/8/K7 b - - 0 1",
          "text": "Black to move: ...Ke5 steps into the square, so the pawn is caught.",
          "arrows": [
            [
              "f5",
              "e5",
              "good"
            ]
          ]
        },
        {
          "fen": "8/8/8/P4k2/8/8/8/K7 b - - 0 1",
          "text": "With White to move, a5 makes the square smaller, and Black's king can't get in. The pawn queens.",
          "arrows": [
            [
              "a5",
              "d5",
              "plan"
            ],
            [
              "d5",
              "d8",
              "plan"
            ],
            [
              "a8",
              "d8",
              "plan"
            ]
          ],
          "squares": [
            [
              "f5",
              "bad"
            ]
          ]
        },
        {
          "fen": "8/8/8/P4k2/8/8/8/K7 b - - 0 1",
          "text": "One catch: a pawn on its starting square can move two squares at once, so draw its square from the square in front of it."
        }
      ]
    },
    {
      "title": "Passed pawns",
      "summary": "Push them, and use them to pull the enemy king away.",
      "themes": [
        "advancedPawn",
        "promotion"
      ],
      "steps": [
        {
          "fen": "8/5kpp/8/8/P7/8/5KPP/8 w - - 0 1",
          "text": "A passed pawn has no enemy pawns in front of it or on the files beside it. White's a-pawn is passed, and it's far from the other pawns: an outside passed pawn.",
          "arrows": [
            [
              "a4",
              "a8",
              "good"
            ]
          ],
          "squares": [
            [
              "a4",
              "good"
            ]
          ]
        },
        {
          "fen": "8/5kpp/8/8/P7/8/5KPP/8 w - - 0 1",
          "text": "Black's king has to go and stop it. While it does, White's king walks over and eats Black's kingside pawns.",
          "arrows": [
            [
              "f7",
              "b6",
              "bad"
            ],
            [
              "f2",
              "f4",
              "good"
            ],
            [
              "f4",
              "g5",
              "good"
            ]
          ]
        },
        {
          "fen": "8/5kpp/8/8/P7/8/5KPP/8 w - - 0 1",
          "text": "Passed pawns must be pushed: the further they go, the more of the enemy army they tie down."
        }
      ]
    },
    {
      "title": "Rooks behind passed pawns",
      "summary": "The rook belongs behind the pawn, yours or theirs.",
      "themes": [
        "rookEndgame"
      ],
      "steps": [
        {
          "fen": "r5k1/5ppp/8/P7/8/8/5PPP/R5K1 w - - 0 1",
          "text": "White's rook is behind the passed a-pawn. Black's rook is in front of it, where its only job is to stop the pawn.",
          "arrows": [
            [
              "a1",
              "a5",
              "good"
            ]
          ],
          "squares": [
            [
              "a8",
              "bad"
            ]
          ]
        },
        {
          "fen": "r5k1/5ppp/8/P7/8/8/5PPP/R5K1 w - - 0 1",
          "text": "Each time the pawn moves, White's rook gets more room and Black's gets less. Black's rook is stuck on the a-file, while White's king is free to come forward.",
          "arrows": [
            [
              "g1",
              "f2",
              "good"
            ],
            [
              "f2",
              "e3",
              "good"
            ]
          ]
        },
        {
          "fen": "r5k1/5ppp/8/P7/8/8/5PPP/R5K1 w - - 0 1",
          "text": "The rule works for defending too: if your opponent has the passed pawn, put your rook behind it and keep it busy."
        }
      ]
    },
    {
      "title": "The Lucena position",
      "summary": "How to win with rook and pawn against rook.",
      "themes": [
        "rookEndgame",
        "promotion"
      ],
      "steps": [
        {
          "fen": "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1",
          "text": "This is the Lucena position. White's pawn is on the seventh, the king is in front of it, and the rook keeps Black's king cut off on the c-file. But Black's rook will check White's king if it comes out.",
          "arrows": [
            [
              "c1",
              "c8",
              "good"
            ]
          ],
          "squares": [
            [
              "b8",
              "good"
            ],
            [
              "d7",
              "bad"
            ]
          ]
        },
        {
          "fen": "1K6/1P2k3/8/8/8/8/r7/3R4 w - - 2 2",
          "text": "First, a check pushes Black's king one more file away.",
          "arrows": [
            [
              "c1",
              "d1",
              "good"
            ]
          ]
        },
        {
          "fen": "1K6/1P2k3/8/8/3R4/8/r7/8 b - - 3 2",
          "text": "Then the rook goes to the fourth rank. This is called building a bridge.",
          "arrows": [
            [
              "d4",
              "b4",
              "plan"
            ]
          ]
        },
        {
          "fen": "8/1P2k3/8/1K6/1R6/8/8/1r6 b - - 13 7",
          "text": "Now White's king comes out. When the checks run out, the rook blocks the last one on b4, and the pawn queens.",
          "squares": [
            [
              "b4",
              "good"
            ],
            [
              "b7",
              "good"
            ]
          ]
        }
      ]
    },
    {
      "title": "The Philidor defence",
      "summary": "How to draw a rook and pawn against rook.",
      "themes": [
        "rookEndgame",
        "defensiveMove"
      ],
      "steps": [
        {
          "fen": "4k3/1R6/r7/4PK2/8/8/8/8 b - - 0 1",
          "text": "To draw a rook endgame a pawn down, keep your king in front of the pawn and your rook on your third rank (here the sixth). White's king can't come forward.",
          "arrows": [
            [
              "a6",
              "h6",
              "good"
            ]
          ],
          "squares": [
            [
              "e8",
              "good"
            ]
          ]
        },
        {
          "fen": "4k3/1R6/2r1P3/5K2/8/8/8/8 b - - 0 2",
          "text": "Black's rook just waits on the sixth. Once the pawn steps to e6, White's king has lost its shelter from checks.",
          "squares": [
            [
              "e6",
              "plan"
            ]
          ]
        },
        {
          "fen": "4k3/1R6/4P3/5K2/8/8/8/2r5 w - - 1 3",
          "text": "Now the rook goes to the far end and checks from behind. The king can't escape the checks, and the game is drawn.",
          "arrows": [
            [
              "c1",
              "f1",
              "good"
            ]
          ]
        }
      ]
    },
    {
      "title": "When to trade",
      "summary": "Trade pieces when you're ahead, pawns when you're behind.",
      "themes": [
        "pawnEndgame",
        "advantage"
      ],
      "steps": [
        {
          "fen": "3r4/4kppp/8/8/8/8/P4PPP/3R2K1 w - - 0 1",
          "text": "White is a pawn up, and the extra pawn is an outside a-pawn. Swapping the rooks makes the win much easier.",
          "arrows": [
            [
              "d1",
              "d8",
              "good"
            ]
          ],
          "squares": [
            [
              "a2",
              "good"
            ]
          ]
        },
        {
          "fen": "3k4/5ppp/8/8/8/8/P4PPP/6K1 w - - 0 2",
          "text": "In the pawn endgame Black's king must deal with the a-pawn, and White's king gets to the kingside pawns.",
          "arrows": [
            [
              "a2",
              "a8",
              "good"
            ],
            [
              "g1",
              "f2",
              "good"
            ]
          ]
        },
        {
          "fen": "3k4/5ppp/8/8/8/8/P4PPP/6K1 w - - 0 2",
          "text": "So: when you're ahead, trade pieces but keep pawns. When you're behind, trade pawns and keep pieces. Bishops of opposite colours often draw even two pawns down."
        }
      ]
    },
    {
      "title": "Mate with king and rook",
      "summary": "Shrink the box, then mate on the edge.",
      "themes": [
        "mate",
        "mateIn2"
      ],
      "steps": [
        {
          "fen": "8/8/8/3k4/8/8/8/4K2R w - - 0 1",
          "text": "The rook cuts the enemy king off. Rh4 keeps Black's king in the top half of the board.",
          "arrows": [
            [
              "h1",
              "h4",
              "good"
            ]
          ]
        },
        {
          "fen": "8/8/8/4k3/7R/8/4K3/8 b - - 3 2",
          "text": "Then the king comes up to help. Each time the black king steps back, the rook takes away another rank.",
          "arrows": [
            [
              "e2",
              "e3",
              "plan"
            ]
          ]
        },
        {
          "fen": "3k4/8/3K4/8/8/8/8/7R w - - 0 1",
          "text": "In the end the kings face each other on the edge, and the rook checks along the back rank: Rh8 is mate.",
          "arrows": [
            [
              "h1",
              "h8",
              "good"
            ]
          ]
        },
        {
          "fen": "3k4/8/3K4/8/8/8/8/7R w - - 0 1",
          "text": "With a queen it's quicker: use the queen to shrink the box a knight's move away from the king, then bring your king to help. Take care not to give stalemate."
        }
      ]
    }
  ],
};
