// The opening lessons: every line plays legally, every note and arrow is on
// a move that's really in its line (a typo would silently drop it), arrows
// point between real squares, each lesson belongs to an opening in the
// repertoire, and its intro setup plays legally too.
import { Chess } from "chessops/chess";
import { parseSan } from "chessops/san";
import { parseSquare } from "chessops/util";

import { DEMOS, demoSteps, introMoves } from "../../src/demos";
import { REPERTOIRE } from "../../src/openings";

export default async function run() {
  const failures: string[] = [];
  let checks = 0;
  for (const demo of DEMOS) {
    checks++;
    if (!REPERTOIRE.some((o) => o.name === demo.opening)) failures.push(`${demo.opening}: no opening of that name in the repertoire`);
    const setup = Chess.default();
    for (const san of demo.setup.split(" ")) {
      const move = parseSan(setup, san);
      if (!move) {
        failures.push(`${demo.opening}: setup move ${san} isn't legal`);
        break;
      }
      setup.play(move);
    }
    demo.lines.forEach((line, index) => {
      checks++;
      let labels: string[] = [];
      try {
        labels = demoSteps(demo, index).map((step) => step.label);
        introMoves(demo, index);
      } catch (error) {
        failures.push(`${demo.opening}, ${line.title}: ${error}`);
        return;
      }
      for (const label of Object.keys(line.notes)) {
        checks++;
        if (!labels.includes(label)) failures.push(`${demo.opening}, ${line.title}: note on ${label}, which isn't a move of the line`);
      }
      for (const [label, arrows] of Object.entries(line.arrows ?? {})) {
        checks++;
        if (!labels.includes(label)) failures.push(`${demo.opening}, ${line.title}: arrows on ${label}, which isn't a move of the line`);
        for (const arrow of arrows) {
          const bare = arrow.replace(/!$/, "");
          const squares = bare.startsWith("@") ? [bare.slice(1)] : [bare.slice(0, 2), bare.slice(2, 4)];
          if (squares.some((s) => parseSquare(s) === undefined) || (!bare.startsWith("@") && bare.length !== 4)) {
            failures.push(`${demo.opening}, ${line.title}: arrow "${arrow}" on ${label} isn't two squares`);
          }
        }
      }
    });
  }
  return { name: "Opening lessons", checks, failures };
}
