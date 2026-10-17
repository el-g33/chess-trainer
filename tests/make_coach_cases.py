"""
make_coach_cases.py
-------------------
Makes test cases for the web version's strategy coach (src/strategy.ts and
src/ideas.ts) from the desktop app's strategy.py and ideas.py: for positions
from the move-review test games, the threat check, plan ahead, "explain the
ideas" text and some quiz answers. Every Stockfish answer is recorded, so the
web version can be replayed with exactly the same results.

Run with the desktop app's Python (needs python-chess and Stockfish), after
make_review_cases.py:
    python tests/make_coach_cases.py
Writes tests/coach-cases.json; open http://localhost:5173/tests/coach.html
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
import ideas  # noqa: E402
import strategy  # noqa: E402

HERE = Path(__file__).parent
OUT = HERE / "coach-cases.json"
EVERY = 6   # every 6th position of each game


def score_json(score: chess.engine.PovScore) -> dict:
    white = score.white()
    return {"mate": white.mate()} if white.is_mate() else {"cp": white.score()}


class RecordingEngine:
    """Passes analyse() calls to Stockfish and remembers every answer."""

    def __init__(self, engine, record: dict):
        self.engine = engine
        self.record = record

    def analyse(self, board, limit, multipv=None):
        result = self.engine.analyse(board, limit, multipv=multipv)
        infos = result if multipv else [result]
        self.record[f"{board.fen()}|{limit.time}|{multipv or 1}"] = [
            {"score": score_json(i["score"]), "pv": [m.uci() for m in i.get("pv", [])]} for i in infos]
        return result


def main():
    rng = random.Random(11)
    games = json.loads((HERE / "review-cases.json").read_text(encoding="utf-8"))["games"]
    stockfish = chess.engine.SimpleEngine.popen_uci(app_paths.find_stockfish())
    cases = []
    try:
        for game_index, game in enumerate(games):
            board = chess.Board()
            for ply, uci in enumerate(game["moves"]):
                if ply % EVERY == 3 and not board.is_game_over():
                    # Each position keeps its own recording (the same position
                    # can come up in several games, with different answers)
                    record = {}
                    engine = RecordingEngine(stockfish, record)
                    threat = strategy.threat_check(engine, board)
                    plan = strategy.plan_ahead(engine, board)
                    text = ideas.explain_ideas(board, threat, plan)
                    grades = []
                    if threat["threat_move"]:
                        passed = threat["passed"]
                        guesses = [threat["threat_move"], *threat["good_guesses"]]
                        guesses += rng.sample(list(passed.legal_moves), min(2, passed.legal_moves.count()))
                        for guess in guesses:
                            grades.append({"guess": guess.uci(), "result": list(strategy.grade_guess(threat, guess))})
                    cases.append({
                        "fen": board.fen(),
                        "engine": record,
                        "threat": {"text": threat["text"], "serious": threat["serious"],
                                   "move": threat["threat_move"].uci() if threat["threat_move"] else None,
                                   "good": sorted(m.uci() for m in threat["good_guesses"])},
                        "plan": {"text": plan["text"], "moves": [s["move"].uci() for s in plan["steps"]]},
                        "ideas": text,
                        "grades": grades,
                    })
                board.push(chess.Move.from_uci(uci))
            print(f"game {game_index + 1}: {len(cases)} positions so far")
    finally:
        stockfish.quit()

    OUT.write_text(json.dumps({"cases": cases}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(cases)} positions, wrote {OUT}")


if __name__ == "__main__":
    main()
