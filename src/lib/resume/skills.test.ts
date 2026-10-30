import { describe, expect, test } from "vitest";
import { matchingRoles, skillNote, toggleSkill } from "./skills";

const roles = [
  { id: "a", tags: ["React", "TypeScript"] },
  { id: "b", tags: ["React", "Go"] },
  { id: "c", tags: ["Python"] },
  { id: "d" },
];

const ids = (matches: { id: string }[]) => matches.map((role) => role.id);

describe("matchingRoles", () => {
  test("no skills matches no roles", () => {
    expect(matchingRoles(roles, [])).toEqual([]);
  });

  test("one skill matches every role tagged with it, in order", () => {
    expect(ids(matchingRoles(roles, ["React"]))).toEqual(["a", "b"]);
  });

  test("a skill no role uses matches nothing", () => {
    expect(matchingRoles(roles, ["Rust"])).toEqual([]);
  });

  test("several skills match roles tagged with all of them", () => {
    expect(ids(matchingRoles(roles, ["React", "Go"]))).toEqual(["b"]);
  });

  test("roles without tags never match", () => {
    expect(ids(matchingRoles([{ id: "d" }], ["React"]))).toEqual([]);
  });
});

describe("skillNote", () => {
  test("prompts to pick when no skill is picked", () => {
    expect(skillNote(undefined, [])).toBe("Pick a skill to see where I used it.");
  });

  test("names the one place a skill was used", () => {
    expect(skillNote("React", ["Acme"])).toBe("React at Acme.");
  });

  test("joins two places with an ampersand", () => {
    expect(skillNote("React", ["Acme", "Globex"])).toBe("React at Acme & Globex.");
  });

  test("joins three or more places with commas and a final ampersand", () => {
    expect(skillNote("React", ["Acme", "Globex", "Initech"])).toBe(
      "React at Acme, Globex & Initech.",
    );
  });

  test("falls back when no role uses the skill", () => {
    expect(skillNote("Rust", [])).toBe("Rust: part of the daily toolkit.");
  });
});

describe("toggleSkill", () => {
  test("picks a skill when none is selected", () => {
    expect(toggleSkill([], "React")).toEqual(["React"]);
  });

  test("replaces the selected skill with another", () => {
    expect(toggleSkill(["React"], "Go")).toEqual(["Go"]);
  });

  test("clears the selection when the selected skill is picked again", () => {
    expect(toggleSkill(["React"], "React")).toEqual([]);
  });
});
