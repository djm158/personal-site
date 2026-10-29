import { atom } from "nanostores";

// The skills picked on /resume. Zero or one for now (see `toggleSkill`); the sidebar picker and
// SkillSheet both read and write it, so multi-select later is a UI change.
export const $selectedSkills = atom<string[]>([]);
