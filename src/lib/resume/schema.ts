import * as z from "zod";

export const linkSchema = z.strictObject({
  label: z.string(),
  url: z.url(),
});

export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: "Invalid format. Must be YYYY-MM (e.g., 2026-10)",
});

export const roleSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      "Invalid id. Use lowercase letters, digits and hyphens (e.g., vistar-media)",
  }),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  start: yearMonthSchema,
  end: yearMonthSchema.optional(),
  bullets: z.array(z.string()).min(1),
  tags: z.array(z.string()).optional(),
  short: z.string().optional(),
});

export const skillSchema = z.strictObject({
  name: z.string(),
  items: z.array(z.string()).min(1),
});

export const educationSchema = z.strictObject({
  school: z.string(),
  degree: z.string(),
  graduated: yearMonthSchema,
  gpa: z.string().optional(),
  honors: z.string().optional(),
});

export const resumeSchema = z.strictObject({
  name: z.string(),
  email: z.email(),
  links: z.array(linkSchema),
  summary: z.string(),
  roles: z.array(roleSchema).min(1),
  skills: z.array(skillSchema).min(1),
  education: z.array(educationSchema).min(1),
});

export type Link = z.infer<typeof linkSchema>;
export type YearMonth = z.infer<typeof yearMonthSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Resume = z.infer<typeof resumeSchema>;
