import { describe, expect, it } from "vitest";
import { parseBacklog, pickNext } from "./backlog.mjs";

const backlog = `# Backlog

- \`(agent: <slug>)\`: the legend isn't an item

## Section

- [x] Done already (agent: first)
- [ ] Mine (me)
- [ ] Waits on second (agent: third) (after: second)
- [ ] Second (agent: second) (after: first)
- [ ] Untagged
- [ ] Two deps (agent: fourth) (after: first) (after: second)
`;

const none = { branches: new Set(), prs: new Map() };
const slugOf = (result) => result.item?.slug ?? null;

describe("parseBacklog", () => {
  it("reads checkbox items with their tags and skips everything else", () => {
    const items = parseBacklog(backlog);
    expect(items.map((i) => i.slug)).toEqual([
      "first",
      null,
      "third",
      "second",
      null,
      "fourth",
    ]);
    expect(items[0]).toMatchObject({ done: true, line: 7 });
    expect(items[5].after).toEqual(["first", "second"]);
  });
});

describe("pickNext", () => {
  const items = parseBacklog(backlog);

  it("takes the first unticked item whose after: items are all ticked", () => {
    expect(slugOf(pickNext(items, none))).toBe("second");
  });

  it("skips an item with an open PR or a branch", () => {
    const github = {
      branches: new Set(["agent/second"]),
      prs: new Map([["agent/second", "OPEN"]]),
    };
    expect(slugOf(pickNext(items, github))).toBe(null);
  });

  it("reports a closed, unmerged PR as rejected and moves on", () => {
    const result = pickNext(items, {
      branches: new Set(),
      prs: new Map([["agent/second", "CLOSED"]]),
    });
    expect(result.rejected.map((i) => i.slug)).toEqual(["second"]);
    expect(slugOf(result)).toBe(null);
  });

  it("reports a branch with no PR as stranded", () => {
    const result = pickNext(items, {
      branches: new Set(["agent/second"]),
      prs: new Map(),
    });
    expect(result.stranded.map((i) => i.slug)).toEqual(["second"]);
  });

  it("treats a merged PR whose item is still unticked as taken", () => {
    const result = pickNext(items, {
      branches: new Set(),
      prs: new Map([["agent/second", "MERGED"]]),
    });
    expect(slugOf(result)).toBe(null);
    expect(result.rejected).toEqual([]);
  });

  it("unlocks an item once its after: item is ticked", () => {
    const ticked = parseBacklog(
      backlog.replace("- [ ] Second", "- [x] Second"),
    );
    expect(slugOf(pickNext(ticked, none))).toBe("third");
  });

  it("reports an after: slug that no item has", () => {
    const result = pickNext(
      parseBacklog("- [ ] Typo (agent: a) (after: nope)"),
      none,
    );
    expect(result.unknownAfter).toEqual([
      { item: expect.objectContaining({ slug: "a" }), slug: "nope" },
    ]);
    expect(slugOf(result)).toBe(null);
  });
});
