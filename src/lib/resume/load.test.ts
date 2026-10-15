import { describe, expect, test } from "vitest";
import { loadResume } from "./load";

const resume = loadResume();
const skills = new Set(resume.skills.flatMap((group) => group.items));

describe("resume.yaml", () => {
  test.each(resume.roles.map((role) => [role.id, role.tags ?? []] as const))(
    "every %s tag is in a skill group",
    (_id, tags) => {
      expect(tags.filter((tag) => !skills.has(tag))).toEqual([]);
    },
  );
});
