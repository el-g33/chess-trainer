import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

/** Every file in a folder, as paths relative to it ("assets/index-abc.js"). */
function filesIn(folder: string, top = folder): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? filesIn(path, top) : [relative(top, path).replaceAll("\\", "/")];
  });
}

/** After a build, writes dist/sw.js: a service worker that keeps a copy of
 *  every file of the site, so it works offline once it has been opened. Its
 *  version comes from the files' contents, so each new build replaces the
 *  old copy the next time the site is opened online. Each file also has its
 *  own content hash, so an update only downloads the files that changed. */
function offlineCopy(): Plugin {
  let outDir = "dist";
  return {
    name: "chess-trainer-offline",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = filesIn(outDir).filter((f) => f !== "sw.js").sort();
      const hash = createHash("sha256").update(SERVICE_WORKER);
      const own = (file: string) => createHash("sha256").update(readFileSync(join(outDir, file))).digest("hex").slice(0, 12);
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const version = hash.digest("hex").slice(0, 12);
      // [address, content hash]; the start page is saved as the site's own address
      const list = files.map((f) => [f === "index.html" ? "./" : f, own(f)]);
      const worker = SERVICE_WORKER.replaceAll("__VERSION__", version).replace("__FILES__", JSON.stringify(list));
      writeFileSync(join(outDir, "sw.js"), worker);
      console.log(`offline copy: ${files.length} files, version ${version}`);
    },
  };
}

const SERVICE_WORKER = `// Chess Trainer service worker (made by vite.config.ts at build time).
// Keeps a copy of every file of the site, so it works offline.
const CACHE = "chess-trainer-__VERSION__";
const FILES = __FILES__; // [address, content hash]

self.addEventListener("install", (event) => {
  // Each file saved with its content hash in its address. A file that hasn't
  // changed is copied from the last version's copy; the rest are fetched past
  // any copy the host's servers still hold from before (GitHub Pages can serve
  // the old start page for minutes after an update). Found again with ignoreSearch.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const older = (await caches.keys()).filter((n) => n.startsWith("chess-trainer-") && n !== CACHE);
    const olderCaches = await Promise.all(older.map((n) => caches.open(n)));
    await Promise.all(FILES.map(async ([file, hash]) => {
      const request = new Request(file + "?v=" + hash, { cache: "reload" });
      for (const old of olderCaches) {
        const kept = await old.match(request, { ignoreVary: true });
        if (kept) return cache.put(request, kept);
      }
      const response = await fetch(request);
      if (!response.ok) throw new Error(file + ": " + response.status); // all or nothing, as before
      return cache.put(request, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  // Remove copies made by older versions
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("chess-trainer-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Opening a page: its saved copy (the start page for the site's own address)
      if (request.mode === "navigate") {
        return (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) ||
          (await cache.match("./", { ignoreVary: true })) || fetch(request);
      }
      // ignoreVary: servers often say "Vary: Origin", which would stop the
      // saved copy matching the page's module-script requests
      return (await cache.match(request, { ignoreSearch: true, ignoreVary: true })) || fetch(request);
    }),
  );
});
`;

// "./" keeps every link relative, so the built site works from any web
// address (Netlify, GitHub Pages in a sub-folder) and later inside an
// Android app.
/** The version shown in Settings: package.json's number ("3.0", or "3.0.1"
 *  for a fix) and the day it was built, e.g. "3.0 · 24 Oct 2026". Bump the
 *  number with each publish: the minor part for new features, the last part
 *  for fixes. */
function buildVersion(): string {
  const { version } = JSON.parse(readFileSync("package.json", "utf-8")) as { version: string };
  const shown = version.replace(/\.0$/, "");
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${shown} · ${day}`;
}

export default defineConfig({
  base: "./",
  define: { __BUILD__: JSON.stringify(buildVersion()) },
  server: { port: 5173 },
  preview: { port: 4173 },
  plugins: [offlineCopy()],
});
