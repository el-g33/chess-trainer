"""
make_review_cases.py
--------------------
Makes test cases for the web version's move review (src/review.ts): the
desktop app's real Stockfish plays a few varied games, scores every position
(top two moves), and the desktop's move_review.py rates every move. The web
version must rate the same moves, from the same scores, with the same words.

Run with the desktop app's Python (needs python-chess and Stockfish):
    python tests/make_review_cases.py
Writes tests/review-cases.json; open http://localhost:5173/tests/ to compare.
"""

import json
import random
import sys
from pathlib import Path

DESKTOP = Path(r"C:\Chess\chess-trainer")
sys.path.insert(0, str(DESKTOP))

import chess  # noqa: E402
import chess.engine  # noqa: E402

import app_paths  # noqa: E402
import move_review  # noqa: E402

OUT = Path(__file__).with_name("review-cases.json")
GAMES = 8
THINK = 0.08


def score_json(score: chess.engine.PovScore) -> dict:
    white = score.white()
    return {"mate": white.mate()} if white.is_mate() else {"cp": white.score()}


def main():
    rng = random.Random(2026)
    engine = chess.engine.SimpleEngine.popen_uci(app_paths.find_stockfish())
    evals_py, evals_json, games = {}, {}, []
    try:
        for game_number in range(GAMES):
            board = chess.Board()
            moves = []
            while not board.is_game_over(claim_draw=True) and len(moves) < 120:
                fen = board.fen()
                if fen not in evals_py:
                    infos = engine.analyse(board, chess.engine.Limit(time=THINK), multipv=2)
                    entry = {"score": infos[0]["score"], "best": (infos[0].get("pv") or [None])[0]}
                    if len(infos) > 1 and infos[1].get("pv"):
                        entry.update(second=infos[1]["pv"][0], second_score=infos[1]["score"])
                    evals_py[fen] = entry
                    item = {"score": score_json(entry["score"])}
                    if entry["best"]:
                        item["best"] = entry["best"].uci()
                    if "second" in entry:
                        item["second"] = entry["second"].uci()
                        item["secondScore"] = score_json(entry["second_score"])
                    evals_json[fen] = item
                # Varied play: mostly decent moves, some random ones (to get mistakes)
                legal = list(board.legal_moves)
                roll = rng.random()
                if roll < 0.15:
                    move = rng.choice(legal)
                elif roll < 0.35 and "second" in evals_py[fen]:
                    move = evals_py[fen]["second"]
                else:
                    move = evals_py[fen]["best"] or rng.choice(legal)
                moves.append(move)
                board.push(move)

            replay = chess.Board()
            reviews = []
            for move in moves:
                reviews.append(move_review.review_move(replay, move, evals_py))
                replay.push(move)
            reviews = move_review.add_misses(reviews)
            games.append({
                "moves": [m.uci() for m in moves],
                "reviews": [None if r is None else {"rating": r["rating"], "symbol": r["symbol"], "text": r["text"]}
                            for r in reviews],
            })
            print(f"game {game_number + 1}: {len(moves)} moves, result {board.result(claim_draw=True)}")
    finally:
        engine.quit()

    OUT.write_text(json.dumps({"evals": evals_json, "games": games}, indent=1), encoding="utf-8")
    ratings = {}
    for g in games:
        for r in g["reviews"]:
            if r:
                ratings[r["rating"]] = ratings.get(r["rating"], 0) + 1
    print("ratings:", ratings)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
