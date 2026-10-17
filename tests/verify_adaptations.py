"""
verify_adaptations.py
---------------------
Checks the opening adaptations in tests/adaptation-cases.json with the
desktop app's full-strength Stockfish: for each position, how much winning
chance each suggested reply gives up compared with Stockfish's best move.
A reply passes if one of its moves is within PASS points of the best.

    python tests/verify_adaptations.py
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, r"C:\Chess\chess-trainer")

import chess  # noqa: E402
import chess.engine  # noqa: E402

import app_paths  # noqa: E402

HERE = Path(__file__).parent
THINK = 3.0
PASS = 5


def chance(score: chess.engine.PovScore, colour) -> float:
    cp = score.pov(colour).score(mate_score=100000)
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def main():
    cases = json.loads((HERE / "adaptation-cases.json").read_text(encoding="utf-8"))["cases"]
    engine = chess.engine.SimpleEngine.popen_uci(app_paths.find_stockfish())
    engine.configure({"Threads": 4, "Hash": 256})
    failures = 0
    try:
        for case in cases:
            board = chess.Board()
            for token in case["line"].split():
                if not token[0].isdigit():
                    board.push_san(token)
            me = board.turn
            best = engine.analyse(board, chess.engine.Limit(time=THINK))
            best_move, best_chance = best["pv"][0], chance(best["score"], me)
            losses = []
            for san in case["expect"]:
                try:
                    move = board.parse_san(san)
                except ValueError:
                    losses.append((san + " (illegal!)", 999.0))
                    continue
                info = engine.analyse(board, chess.engine.Limit(time=THINK), root_moves=[move])
                losses.append((san, best_chance - chance(info["score"], me)))
            ok = min(loss for _, loss in losses) <= PASS
            failures += not ok
            detail = ", ".join(f"{san} costs {max(0.0, loss):.1f}" for san, loss in losses)
            print(f"{'ok  ' if ok else 'FAIL'} {case['opening']}: {case['line']} -> best {board.san(best_move)}; {detail}")
    finally:
        engine.quit()
    print(f"\n{len(cases) - failures} of {len(cases)} adaptations confirmed (within {PASS} points of Stockfish's best)")


if __name__ == "__main__":
    main()
