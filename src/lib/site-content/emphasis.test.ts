import { describe, expect, test } from "vitest";
import { splitEmphasis } from "./emphasis";

describe("splitEmphasis", () => {
  test("returns plain text as one segment", () => {
    expect(splitEmphasis("Say hello")).toEqual([
      { text: "Say hello", em: false },
    ]);
  });

  test("marks text between asterisks", () => {
    expect(splitEmphasis("Hi, I'm *Dan.*")).toEqual([
      { text: "Hi, I'm ", em: false },
      { text: "Dan.", em: true },
    ]);
  });

  test("keeps text on both sides of an emphasis", () => {
    expect(splitEmphasis("a *b* c *d*")).toEqual([
      { text: "a ", em: false },
      { text: "b", em: true },
      { text: " c ", em: false },
      { text: "d", em: true },
    ]);
  });

  test("leaves an unpaired asterisk as text", () => {
    expect(splitEmphasis("5 * 3")).toEqual([{ text: "5 * 3", em: false }]);
  });

  // Known limits: there is no escape character and no **bold**
  describe("limits", () => {
    test("a lone asterisk next to an emphasis pairs with the wrong one", () => {
      expect(splitEmphasis("5 * 3 and *x*")).toEqual([
        { text: "5 ", em: false },
        { text: " 3 and ", em: true },
        { text: "x*", em: false },
      ]);
    });

    test("double asterisks leave stray asterisks", () => {
      expect(splitEmphasis("**bold**")).toEqual([
        { text: "*", em: false },
        { text: "bold", em: true },
        { text: "*", em: false },
      ]);
    });
  });
});
