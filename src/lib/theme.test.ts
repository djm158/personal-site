import { describe, expect, test } from "vitest";
import { hintFor, poke, readTheme, resolveTheme, toastFor } from "./theme";

describe("poke", () => {
  test("counts up without toggling before the fifth poke", () => {
    expect(poke(0)).toEqual({ count: 1, toggle: false });
    expect(poke(3)).toEqual({ count: 4, toggle: false });
  });

  test("the fifth poke toggles and starts the count again", () => {
    expect(poke(4)).toEqual({ count: 0, toggle: true });
  });

  test("five pokes from zero toggle exactly once", () => {
    let count = 0;
    let toggles = 0;
    for (let i = 0; i < 5; i++) {
      const next = poke(count);
      count = next.count;
      if (next.toggle) toggles++;
    }
    expect(toggles).toBe(1);
    expect(count).toBe(0);
  });
});

describe("readTheme", () => {
  test("only a stored night is night", () => {
    expect(readTheme("night")).toBe("night");
    expect(readTheme("day")).toBe("day");
    expect(readTheme(null)).toBe("day");
    expect(readTheme("dark")).toBe("day");
  });
});

describe("resolveTheme", () => {
  test("a saved choice wins over the system", () => {
    expect(resolveTheme("day", true)).toBe("day");
    expect(resolveTheme("night", false)).toBe("night");
  });

  test("with nothing saved, the system decides", () => {
    expect(resolveTheme(null, true)).toBe("night");
    expect(resolveTheme(null, false)).toBe("day");
  });

  test("an unknown saved value is ignored", () => {
    expect(resolveTheme("dark", true)).toBe("night");
    expect(resolveTheme("dark", false)).toBe("day");
  });
});

describe("toastFor", () => {
  test("has a message for each theme", () => {
    expect(toastFor("night")).toBe("Night ride unlocked — lights on.");
    expect(toastFor("day")).toBe("Back to daylight.");
  });
});

describe("hintFor", () => {
  const hints = ["one", "two", "three", "four"];

  test("no hint before the first poke or after a toggle", () => {
    expect(hintFor(0, hints)).toBe("");
  });

  test("one hint per count, starting at the first poke", () => {
    expect(hintFor(1, hints)).toBe("one");
    expect(hintFor(4, hints)).toBe("four");
  });

  test("a count past the end of the list has no hint", () => {
    expect(hintFor(2, ["one"])).toBe("");
    expect(hintFor(1, [])).toBe("");
  });
});
