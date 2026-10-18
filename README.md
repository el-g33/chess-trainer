# Chess Trainer (web version)

The browser version of the Chess Trainer: play and practise against
Stockfish on a desktop or a phone. Everything runs in the browser - Stockfish
included - so the site is just static files with no server behind it.

**Play it:** https://el-g33.github.io/chess-trainer/ (installable, works offline)

The site is unlisted: `index.html` asks search engines not to list it
(`<meta name="robots" content="noindex, nofollow">`). To make it findable,
remove that line (and the one in `public/about.html`) and register the address
with Google Search Console.

Every upload to the `main` branch rebuilds and republishes the site
automatically (`.github/workflows/pages.yml`, GitHub Actions + GitHub Pages).

The desktop (Python) version is a separate program and isn't part of this
repository.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Setup: Node.js, project, board, chess rules, Stockfish in the browser | done |
| 2 | Start menu, play vs Stockfish (levels, colour), move list, phone layout | done |
| 3 | Move review (ratings, "Better was ...") - "Review this game" after a match | done |
| 4 | Openings (lichess database, Stockfish's / your opening, Book moves) | done |
| 5 | Practice mode: eval bar, live ratings, undo, FEN, free board, "what if" analysis, strategy coach | done |
| 6 | Polish: board themes, marker font, falling king, installable + offline (PWA) | done |
| 7 | Put online (GitHub Pages), publish source | done |

## Installing it and playing offline

The built site (`npm run build`, then put online) is an installable web app:

- **Android (Chrome):** menu ⋮ > **Add to Home screen** / **Install app**.
- **iPhone / iPad (Safari):** Share > **Add to Home Screen**.
- **Windows / Mac (Chrome, Edge):** the install icon in the address bar.

It then opens full-screen with its own icon. After the first visit it keeps
a copy of all its files (about 3 MB, Stockfish included), so it works with no
internet connection. A new version is picked up the next time it is opened
online.

Installing and offline need a secure (`https://`) address - or `localhost`
on this PC. Over home Wi-Fi (`http://192.168.x.x`) the site works but phones
won't offer to install it or keep it offline; that needs the online address
from stage 7.

How it works: `vite.config.ts` writes `dist/sw.js` (a service worker) after
each build, listing every file of the site with a version made from their
contents. `public/manifest.webmanifest` describes the app (name, icon, colours).
The icons in `public/icons/` are made by `scripts/make_icons.py` (needs the
desktop app's Python: Tk 9 draws SVG).

## Trying it

Open PowerShell in this folder (`C:\Chess\chess-trainer-web`):

```
npm run dev          # on this PC:  http://localhost:5173
npm run dev:phone    # also on your phone over home Wi-Fi (prints a 192.168.x.x link)
npm run build        # makes the finished site in dist\
npm run preview:phone  # tries the finished site, on this PC and your phone
```

The first time you use a `:phone` command, Windows Firewall asks about
Node.js: allow **Private networks** only.

## How it is built

- `index.html` - the page layout: start menu, board, move list, game panel
- `src/main.ts` - the start menu, matches against Stockfish, move list, buttons
- `src/game.ts` - one game: moves, positions, how it ended (checkmate, draws)
- `src/levels.ts` - Stockfish's 8 levels (same as the desktop app)
- `src/engine.ts` - talks to Stockfish (UCI protocol) in a Web Worker
- `src/review.ts` - rates every move (port of the desktop's move_review.py)
- `src/coach.ts` - moves and scores in plain words (from explain_position.py)
- `src/strategy.ts` - the strategy coach: threat check, plan ahead, quiz (port of strategy.py)
- `src/ideas.ts` - "Explain the ideas": tactics, targets and position notes (port of ideas.py)
- `src/openings.ts` - the opening book, the repertoire, Stockfish's opening play and
  coaching for your opening (port of the desktop's openings.py)
- `src/analyser.ts` - a second Stockfish that scores the game's positions in the background
- `public/openings/` - the lichess opening database (CC0), read in the browser at start-up
- `src/badge.ts` - the hand-drawn rating icon on the board
- `src/pieces.ts` - recolours the Merida pieces cream / near-black, and the falling king
- `src/style.css` - the look (Sun Valley style, wood board) and the phone layout
- `public/pieces/` - the Merida pieces (copied from the desktop app)
- `public/boards/wood.png` - the wood board (made by the desktop app's theme.py)
- `public/stockfish/` - Stockfish 19 "lite, single-threaded" WASM build
  (~1.8 MB). Copied from `node_modules/stockfish` by
  `scripts/copy-engine.mjs`, which runs automatically after `npm install`.

Building blocks (exact versions in `package.json`):
- [Vite](https://vite.dev) (MIT) and TypeScript (Apache-2.0) - build tools
- [@lichess-org/chessground](https://github.com/lichess-org/chessground) (GPL-3.0+) - the board
- [chessops](https://github.com/niklasf/chessops) (GPL-3.0+) - chess rules
- [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0) - Stockfish 19 for browsers
- [Permanent Marker](https://fonts.google.com/specimen/Permanent+Marker) via @fontsource
  (Apache-2.0) - the marker-pen font for ?! marks where Windows' "Ink Free" isn't installed

## Checking against the desktop app

The web version is checked against the desktop's own code. Each Python script
(run with the desktop app's Python) saves what the desktop does; the matching
page (with `npm run dev` running) makes the web version do the same and lists
any difference. The tests folder isn't part of the built site.

| Script | Page | Checks | Last run |
|---|---|---|---|
| `tests/make_review_cases.py` | http://localhost:5173/tests/ | move ratings and texts (`move_review.py`) | 761 / 761 identical |
| `tests/make_opening_cases.py` | http://localhost:5173/tests/openings.html | book moves, opening names, Stockfish's opening choices, opening coaching (`openings.py`) | 1845 / 1845 identical |
| `tests/make_coach_cases.py` | http://localhost:5173/tests/coach.html | threat check, plan ahead, explain the ideas, quiz marking (`strategy.py`, `ideas.py`) | 1143 / 1143 identical |
| `tests/verify_adaptations.py` | http://localhost:5173/tests/adaptations.html | the opening adaptations (web only, no desktop version): full-strength Stockfish confirms each answer; the page checks the web version spots each situation | 35 / 35 confirmed, 35 / 35 spotted |

## Also in the web version only

- **Sound effects** (`src/sounds.ts`): wooden knock, capture slap, metal click
  for check, cloth swish for castling, bell at game end, quiz tones. On/off and
  volume next to the Board choice.
- **PGN** (`src/pgn.ts`): "Open PGN..." (or "Review a game from a PGN file" in
  the start menu) to paste or open a game and review it with every tool;
  "Download PGN" saves the current game.
- **Brilliant moves** (`src/brilliant.ts`): "Is there a brilliant move?" in the
  coach gives a hint first, then shows the sacrifice; the Move review adds
  "Missed brilliant" when the best move was a working sacrifice.
- **Middlegame notes** (`src/middlegame.ts`) in Explain the ideas: outposts,
  weak squares, bad bishops, rooks on the 7th, the isolated queen's pawn, the
  minority attack.
- **Accuracy** (`src/accuracy.ts`): the Game report in the Move review shows each
  side's accuracy for the opening, middlegame, endgame and the whole game
  (lichess's formulas and phase divider), coloured like the move ratings.
  Doubtful ratings get a deeper second look (2 s) so a shallow eval doesn't
  call a winning move a mistake.
- **Quiz explanations** (`src/quizExplain.ts`): after a wrong guess, Stockfish
  explains why it isn't a threat (or how it would be punished), with arrows and
  the line to step through.
- **Player bars**: names (your name from the menu, Stockfish's level, or the PGN
  names and ratings), captured pieces and the material lead, above and below
  the board.
- **Time control** (`src/clock.ts`): presets from 1 minute to 30 minutes plus
  custom, with increment. Stockfish takes human-like time (quick book moves,
  longer thinks in tricky positions, faster when short of time). Running out of
  time loses, or draws if the other side can't mate. Practice mode pauses the
  clock while the coach works, while looking back or analysing; Undo restores
  the clocks. PGN downloads include TimeControl and [%clk].
- **Opening demos** (`src/demos.ts`): "Learn an opening" in the menu, or "Show
  me this opening" while practising it. Stockfish plays the main line and the
  variations, pausing at each note; Back/Next, Resume autoplay, Next
  variation, Try it yourself. Transpositions are found automatically. Every
  opening in the app has one (67 lines in all); every line was checked with
  full-strength Stockfish, and Black openings are shown from Black's side.
- **Themes** (`src/themes.css`): Warm stone (default), Classic, Midnight ember,
  Violet glass, each with a matching board and piece colours; the Pieces box
  adds four lichess sets (Chessnut, MPChess, Staunty, Spatial - see About).
- **Feature tour** (`src/tour.ts`): callouts shown the first time each mode is
  used, with Back / Next / No thanks and "Don't show this again"; can be watched
  again from the menu or the panel.

## Plan ahead with your opening (web only)

While practising an opening, Plan ahead can follow it ("Plan ahead:" in the
coach panel): **stick to it** keeps to the opening unless that costs more than
8 points of winning chance or gives back material; **take chances** leaves the
opening whenever Stockfish's best gains 3 points or more, and says what the
opening move would have been and why it isn't best. Your moves come from the
opening's book moves, its setup (in whatever order works best) and the
adaptations in `src/openings.ts` (standard answers to the opponent's
deviations, each from a lichess line - e.g. 1. d4 e5 2. dxe5 against the
Englund Gambit). The Move review then notes good adaptations and missed
chances. Code: `src/openingPlan.ts`. The desktop app doesn't have this.

The opening and coach tests record every Stockfish answer the desktop asked
for, so the web version is replayed with exactly the same engine results.
(`make_coach_cases.py` needs `review-cases.json` from the first script.)

## Licences

This project is GPL-3.0-or-later, because chessground, chessops and
Stockfish are GPL. When it is put online, its source code must be published
too (stage 7: a public GitHub repository).

- Stockfish: GPL-3.0 - `public/stockfish/Copying.txt`, https://github.com/official-stockfish/Stockfish
- Merida pieces: GPL-2.0-or-later - `public/pieces/CREDITS.txt`
- lichess opening names: CC0
- Permanent Marker font: Apache-2.0 (`node_modules/@fontsource/permanent-marker/LICENSE`)
- Sound effects: Kenney (kenney.nl), CC0 - `public/sounds/CREDITS.txt`
- App icon: the Merida knight (GPL-2.0-or-later), drawn by `scripts/make_icons.py`
