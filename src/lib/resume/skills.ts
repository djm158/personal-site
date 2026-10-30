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

// The line under the picker heading: where `skill` was used, given the places in role order
// ("React at A, B & C."), or a prompt when nothing is picked
export const skillNote = (
  skill: string | undefined,
  places: readonly string[],
): string => {
  if (!skill) return "Pick a skill to see where I used it.";
  if (!places.length) return `${skill}: part of the daily toolkit.`;
  const list =
    places.length > 1
      ? `${places.slice(0, -1).join(", ")} & ${places.at(-1)}`
      : places[0];
  return `${skill} at ${list}.`;
};

// Single select for now: picking the selected skill clears it, any other replaces it
export const toggleSkill = (selected: readonly string[], skill: string): string[] =>
  selected.includes(skill) ? [] : [skill];
