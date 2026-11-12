// The way back to your lesson plan from an activity it started (a practice
// set, a lesson, a game): while one of its steps is on, the activity's last
// button says "Back to your plan" instead of its usual one. Leaving for the
// menu any other way forgets it.

export let planReturn: (() => void) | null = null;
export const setPlanReturn = (run: (() => void) | null) => (planReturn = run);
