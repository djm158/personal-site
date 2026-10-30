import { describe, expect, test } from "vitest";
import { poke, readTheme, toastFor } from "./theme";

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

describe("toastFor", () => {
  test("has a message for each theme", () => {
    expect(toastFor("night")).toBe("Night ride unlocked — lights on.");
    expect(toastFor("day")).toBe("Back to daylight.");
  });
});
