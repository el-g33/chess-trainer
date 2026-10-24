// Runs the tests in Node (no browser): `npm test`, or `npm run test:update` to
// accept the current results as the new known-good ones (tests/golden/).
// Vite loads the TypeScript just as the app does; a few browser things the
// code touches (storage, fetching the opening book, the test pages' text)
// are stood in for here.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, createServerModuleRunner } from "vite";

const update = process.argv.includes("--update");
const root = new URL("../../", import.meta.url);

// -- Stand-ins for the browser -----------------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
// The app fetches the opening book and puzzles from its own folder: read them from public/
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const path = String(url);
  if (/^https?:/.test(path)) return realFetch(url, options);
  const file = join(new URL("public/", root).pathname.replace(/^\/([A-Za-z]:)/, "$1"), path.replace(/^\.?\//, ""));
  const text = await readFile(file, "utf-8");
  return new Response(text, { status: 200 });
};
// The browser test pages write into the page and leave their results on window
const element = () => ({ textContent: "", append() {}, replaceChildren() {} });
globalThis.window = globalThis;
globalThis.document = { getElementById: element, createElement: element };

// -- Run each test ---------------------------------------------------------------
const server = await createServer({
  root: new URL(".", root).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false },
});
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
const tests = ["review", "desktop", "lessons", "data"];
let failed = 0;
for (const name of tests) {
  const { default: run } = await runner.import(`/tests/node/${name}.test.ts`);
  const started = performance.now();
  const result = await run({ update });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const ok = result.failures.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${result.name}: ${result.checks} checks, ${result.failures.length} failed (${seconds}s)`);
  for (const failure of result.failures.slice(0, 10)) console.log(`      ${failure.replace(/\n/g, "\n      ")}`);
  if (result.failures.length > 10) console.log(`      ... and ${result.failures.length - 10} more`);
}
await runner.close();
await server.close();
console.log(failed ? `\n${failed} of ${tests.length} test files failed.` : `\nAll ${tests.length} test files passed.`);
process.exit(failed ? 1 : 0);
