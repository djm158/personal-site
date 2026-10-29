import type { Role } from "./schema";

type TaggedRole = Pick<Role, "id" | "tags">;

// Roles tagged with every one of `skills` (AND). With no skills nothing is picked, so nothing
// matches.
export const matchingRoles = <R extends TaggedRole>(
  roles: R[],
  skills: readonly string[],
): R[] =>
  skills.length
    ? roles.filter((role) => skills.every((skill) => role.tags?.includes(skill)))
    : [];

// Single select for now: picking the selected skill clears it, any other replaces it
export const toggleSkill = (selected: readonly string[], skill: string): string[] =>
  selected.includes(skill) ? [] : [skill];
