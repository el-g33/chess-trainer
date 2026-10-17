"""
make_opening_cases.py
---------------------
Makes test cases for the web version's openings (src/openings.ts) from the
desktop app's openings.py:

  * book   - opening name, book flag and notes for every move of some games
  * choose - Stockfish playing each repertoire opening (choose_opening_move),
             with every Stockfish answer it asked for recorded, so the web
             version can be replayed with exactly the same answers
  * coach  - the feedback (coach_opening_move) on the other side's moves,
             while it practises one of its own repertoire openings

Run with the desktop app's Python (needs python-chess and Stockfish):
    python tests/make_opening_cases.py
Writes tests/opening-cases.json; open http://localhost:5173/tests/openings.html
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
import openings  # noqa: E402

OUT = Path(__file__).with_name("opening-cases.json")
LEVELS = [0, 6]          # an easy level (tolerant) and a hard one (strict)
THINK = 0.05             # think time for the multipv=5 search (any value works: answers are recorded)


def score_json(score: chess.engine.PovScore) -> dict:
    white = score.white()
    return {"mate": white.mate()} if white.is_mate() else {"cp": white.score()}


class RecordingEngine:
    """Passes analyse() calls to Stockfish and remembers every answer."""

    def __init__(self, engine, record: dict):
        self.engine = engine
        self.record = record

    def analyse(self, board, limit, multipv=None, root_moves=None):
        if root_moves:
            info = self.engine.analyse(board, limit, root_moves=root_moves)
            self.record[f"move {board.fen()} {root_moves[0].uci()}"] = score_json(info["score"])
            return info
        infos = self.engine.analyse(board, limit, multipv=multipv)
        self.record[f"lines {board.fen()} {multipv}"] = [
            {"move": info["pv"][0].uci() if info.get("pv") else None, "score": score_json(info["score"])}
            for info in infos
        ]
        return infos


def info_json(info: dict) -> dict:
    return {"book": info["book"], "opening": list(info["opening"]) if info["opening"] else None,
            "notes": info["notes"]}


def main():
    rng = random.Random(7)
    book = openings.OpeningBook()
    stockfish = chess.engine.SimpleEngine.popen_uci(app_paths.find_stockfish())
    record = {}
    recording = RecordingEngine(stockfish, record)
    choose_cases, coach_cases, book_games = [], [], []
    try:
        for opening_index, opening in enumerate(openings.REPERTOIRE):
            for level in LEVELS:
                sf_colour = opening["colour"]
                # The other side practises one of its own colour's openings
                theirs = openings.openings_for(not sf_colour)
                practised = theirs[(opening_index + level) % len(theirs)]
                board = chess.Board()
                active, misses = True, 0
                my_active = True
                while len(board.move_stack) < 36 and not board.is_game_over(claim_draw=True):
                    first = openings.first_move_of(chess.Board(), board.move_stack)
                    if board.turn == sf_colour:
                        move = None
                        if active:
                            move, note, finished = openings.choose_opening_move(
                                recording, board, opening, book, level, first, think_time=THINK)
                            choose_cases.append({
                                "moves": [m.uci() for m in board.move_stack],
                                "opening": opening_index, "level": level,
                                "result": {"move": move.uci() if move else None, "note": note,
                                           "finished": finished},
                            })
                            if move is None:
                                misses += 1
                                active = not (finished or misses >= 2)
                            else:
                                misses = 0
                        if move is None:
                            move = stockfish.play(board, chess.engine.Limit(time=0.02)).move
                    else:
                        # Varied opponent: Stockfish's top moves, sometimes a random one
                        if rng.random() < 0.2:
                            move = rng.choice(list(board.legal_moves))
                        else:
                            infos = stockfish.analyse(board, chess.engine.Limit(time=0.02), multipv=3)
                            move = rng.choice([i["pv"][0] for i in infos if i.get("pv")])
                        if my_active:
                            note = openings.coach_opening_move(board, move, practised, book, first)
                            coach_cases.append({
                                "moves": [m.uci() for m in board.move_stack], "move": move.uci(),
                                "opening": openings.REPERTOIRE.index(practised), "note": note,
                            })
                            if note is None:
                                my_active = False
                    board.push(move)
                book_games.append({
                    "moves": [m.uci() for m in board.move_stack],
                    "info": [info_json(i) for i in book.game_openings(chess.Board(), board.move_stack)],
                })
                print(f"{opening['name']} at level {level + 1}: {len(board.move_stack)} moves")
    finally:
        stockfish.quit()

    # The varied games from the move review test too, for openings outside the repertoire
    review_cases = Path(__file__).with_name("review-cases.json")
    if review_cases.exists():
        for game in json.loads(review_cases.read_text(encoding="utf-8"))["games"]:
            moves = [chess.Move.from_uci(u) for u in game["moves"]]
            book_games.append({"moves": game["moves"],
                               "info": [info_json(i) for i in book.game_openings(chess.Board(), moves)]})

    OUT.write_text(json.dumps({"engine": record, "choose": choose_cases, "coach": coach_cases,
                               "book": book_games}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{len(choose_cases)} choose cases, {len(coach_cases)} coach cases, {len(book_games)} games")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
