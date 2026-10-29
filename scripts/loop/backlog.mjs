// Reads BACKLOG.md and decides which item the loop takes next. Pure functions, so the rules
// are tested in backlog.test.mjs. The tags are explained at the top of BACKLOG.md.

const ITEM = /^- \[( |x)\] (.*)$/;
const AGENT = /\(agent: ([a-z0-9-]+)\)/;
const AFTER = /\(after: ([a-z0-9-]+)\)/g;

/**
 * @typedef {{ line: number, text: string, done: boolean, slug: string | null, after: string[] }} Item
 * @param {string} markdown
 * @returns {Item[]}
 */
export function parseBacklog(markdown) {
  return markdown.split("\n").flatMap((raw, index) => {
    const match = ITEM.exec(raw);
    if (!match) return [];
    const text = match[2];
    return [
      {
        line: index + 1,
        text,
        done: match[1] === "x",
        slug: AGENT.exec(text)?.[1] ?? null,
        after: [...text.matchAll(AFTER)].map((m) => m[1]),
      },
    ];
  });
}

/**
 * The first agent item, top to bottom, that is unticked, has every `after:` item ticked, and
 * hasn't been claimed: no `agent/<slug>` branch and no PR from it, open or closed.
 *
 * @param {Item[]} items
 * @param {{ branches: Set<string>, prs: Map<string, "OPEN" | "CLOSED" | "MERGED"> }} github
 *   Branch names on origin, and the state of the PR from each head branch
 * @returns {{
 *   item: Item | null,
 *   rejected: Item[],     closed without merging: Dan turned it down, so retag or reword it
 *   stranded: Item[],     a branch but no PR: a run died before opening one
 *   unknownAfter: { item: Item, slug: string }[],   an `after:` slug no item has
 * }}
 */
export function pickNext(items, { branches, prs }) {
  const done = new Set(
    items.filter((i) => i.done && i.slug).map((i) => i.slug),
  );
  const known = new Set(items.filter((i) => i.slug).map((i) => i.slug));
  const result = { item: null, rejected: [], stranded: [], unknownAfter: [] };

  for (const item of items) {
    if (item.done || !item.slug) continue;
    for (const slug of item.after) {
      if (!known.has(slug)) result.unknownAfter.push({ item, slug });
    }
    const branch = `agent/${item.slug}`;
    const pr = prs.get(branch);
    if (pr === "CLOSED") {
      result.rejected.push(item);
      continue;
    }
    if (branches.has(branch) && !pr) {
      result.stranded.push(item);
      continue;
    }
    if (pr || branches.has(branch)) continue;
    if (!item.after.every((slug) => done.has(slug))) continue;
    result.item ??= item;
  }
  return result;
}
