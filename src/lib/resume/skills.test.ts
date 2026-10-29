import { describe, expect, test } from "vitest";
import { matchingRoles, toggleSkill } from "./skills";

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
