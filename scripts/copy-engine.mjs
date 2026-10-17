// Copies the browser build of Stockfish (lite, single-threaded: ~1.8 MB,
// needs no special server headers) from node_modules into public/stockfish,
// so it is served as plain files beside the app. Runs after `npm install`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "stockfish");
const target = join(root, "public", "stockfish");

const files = [
  // The .js finds its .wasm by its own file name, so both keep their names.
  ["bin/stockfish-19-lite-single.js", "stockfish-19-lite-single.js"],
  ["bin/stockfish-19-lite-single.wasm", "stockfish-19-lite-single.wasm"],
  ["Copying.txt", "Copying.txt"],
];

if (!existsSync(source)) {
  console.log("copy-engine: stockfish package not installed yet, skipping");
  process.exit(0);
}
mkdirSync(target, { recursive: true });
for (const [from, to] of files) {
  copyFileSync(join(source, from), join(target, to));
}
console.log("copy-engine: Stockfish copied to public/stockfish");
