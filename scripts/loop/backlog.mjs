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
 * @typedef {{ number: number, state: "OPEN" | "CLOSED" | "MERGED", retry: boolean }} Pr
 *   The newest PR from a head branch; `retry` when it carries the `retry` label
 */

/**
 * The first agent item, top to bottom, that is unticked, has every `after:` item ticked, and
 * hasn't been claimed: no `agent/<slug>` branch and no PR from it. The exception is a PR Dan
 * closed with the `retry` label: then the item starts again from scratch.
 *
 * @param {Item[]} items
 * @param {{ branches: Set<string>, prs: Map<string, Pr> }} github
 *   Branch names on origin, and the newest PR from each head branch
 * @returns {{
 *   item: Item | null,
 *   retryOf: number | null,   the closed PR the picked item replaces, if it's a retry
 *   rejected: { item: Item, pr: number }[],   closed without `retry`: Dan turned it down
 *   stranded: Item[],     a branch but no PR: a run died before opening one
 *   unknownAfter: { item: Item, slug: string }[],   an `after:` slug no item has
 * }}
 */
export function pickNext(items, { branches, prs }) {
  const done = new Set(
    items.filter((i) => i.done && i.slug).map((i) => i.slug),
  );
  const known = new Set(items.filter((i) => i.slug).map((i) => i.slug));
  const result = {
    item: null,
    retryOf: null,
    rejected: [],
    stranded: [],
    unknownAfter: [],
  };

  for (const item of items) {
    if (item.done || !item.slug) continue;
    for (const slug of item.after) {
      if (!known.has(slug)) result.unknownAfter.push({ item, slug });
    }
    const branch = `agent/${item.slug}`;
    const pr = prs.get(branch);
    const retrying = pr?.state === "CLOSED" && pr.retry;
    if (pr?.state === "CLOSED" && !retrying) {
      result.rejected.push({ item, pr: pr.number });
      continue;
    }
    if (branches.has(branch) && !pr) {
      result.stranded.push(item);
      continue;
    }
    // Open or merged: taken. A retry's old branch is fine; the driver deletes it.
    if (pr && !retrying) continue;
    if (!item.after.every((slug) => done.has(slug))) continue;
    if (!result.item) {
      result.item = item;
      result.retryOf = retrying ? pr.number : null;
    }
  }
  return result;
}
