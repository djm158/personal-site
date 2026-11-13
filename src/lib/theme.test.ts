import { describe, expect, test } from "vitest";
import { readTheme, resolveTheme } from "./theme";

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
