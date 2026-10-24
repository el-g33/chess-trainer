// The checks against the desktop app that still apply as they are: the
// opening book and opening play, the strategy coach, and the opening
// adaptations. Each is the browser test page's own script (tests/*.ts), run
// with a stand-in page; it leaves its results on window.
export default async function run() {
  const failures: string[] = [];
  let checks = 0;
  const w = globalThis as unknown as {
    openingCheck?: { counts: Record<string, number>; failures: string[] };
    coachCheck?: { checks: number; failures: string[] };
    adaptCheck?: { found: number; total: number; lines: string[] };
  };

  await import("../openings-compare");
  const openings = w.openingCheck!;
  checks += Object.values(openings.counts).reduce((a, b) => a + b, 0);
  failures.push(...openings.failures.map((f) => `Openings: ${f}`));

  await import("../coach-compare");
  const coach = w.coachCheck!;
  checks += coach.checks;
  failures.push(...coach.failures.map((f) => `Coach: ${f}`));

  await import("../adaptations-check");
  const adapt = w.adaptCheck!;
  checks += adapt.total;
  failures.push(...adapt.lines.filter((l) => l.startsWith("MISS")).map((l) => `Adaptations: ${l}`));

  return { name: "Openings, coach and adaptations (vs the desktop app)", checks, failures };
}
