import * as z from "zod";

export const Link = z.strictObject({
  label: z.string(),
  url: z.url(),
});

export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: "Invalid format. Must be YYYY-MM (e.g., 2026-10)",
});

export const Role = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      "Invalid id. Use lowercase letters, digits and hyphens (e.g., vistar-media)",
  }),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  start: YearMonth,
  end: YearMonth.optional(),
  bullets: z.array(z.string()).min(1),
  tags: z.array(z.string()).optional(),
  short: z.string().optional(),
});

export const Skill = z.strictObject({
  name: z.string(),
  items: z.array(z.string()).min(1),
});

export const Education = z.strictObject({
  school: z.string(),
  degree: z.string(),
  graduated: YearMonth,
  gpa: z.string().optional(),
  honors: z.string().optional(),
});

export const Resume = z.strictObject({
  name: z.string(),
  email: z.email(),
  links: z.array(Link),
  summary: z.string(),
  roles: z.array(Role).min(1),
  skills: z.array(Skill).min(1),
  education: z.array(Education).min(1),
});

export type Resume = z.infer<typeof Resume>;
