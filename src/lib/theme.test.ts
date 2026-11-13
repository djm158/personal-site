import { afterEach, describe, expect, test, vi } from "vitest";
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

describe("savedTheme", () => {
  // setTheme needs a page: stub the bits it touches, and a fresh module per test
  // so a choice kept by one test doesn't leak into the next
  const load = async (storage: Partial<Storage>) => {
    vi.resetModules();
    vi.stubGlobal("document", {
      documentElement: { dataset: {} },
      dispatchEvent: () => true,
    });
    vi.stubGlobal("localStorage", storage);
    return import("./theme");
  };
  const blocked = {
    getItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("with storage blocked, keeps the choice made on this page", async () => {
    const theme = await load(blocked);
    expect(theme.savedTheme()).toBeNull();
    theme.setTheme("night");
    expect(theme.savedTheme()).toBe("night");
    // so the system-follow listener leaves it alone when the OS turns light
    expect(theme.resolveTheme(theme.savedTheme(), false)).toBe("night");
  });

  test("a choice that wasn't saved doesn't count as one", async () => {
    const theme = await load(blocked);
    theme.setTheme("night", { save: false });
    expect(theme.savedTheme()).toBeNull();
  });

  test("when storage refuses a write, the newer choice beats the old saved one", async () => {
    const theme = await load({
      getItem: () => "day",
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    theme.setTheme("night");
    expect(theme.savedTheme()).toBe("night");
  });

  test("with storage working, reads the saved choice", async () => {
    const store = new Map<string, string>();
    const theme = await load({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
    });
    expect(theme.savedTheme()).toBeNull();
    theme.setTheme("night");
    expect(store.get(theme.THEME_KEY)).toBe("night");
    expect(theme.savedTheme()).toBe("night");
  });
});
