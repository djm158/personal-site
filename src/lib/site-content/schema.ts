import * as z from "zod";

export const siteContentSchema = z.strictObject({
  description: z.string(),
  hero: z.strictObject({
    status: z.string(),
    heading: z.string(),
    intro: z.string(),
    resumeLink: z.string(),
    emailLink: z.string(),
  }),
  about: z.strictObject({
    eyebrow: z.string(),
    lead: z.string(),
    body: z.string(),
  }),
  experience: z.strictObject({
    eyebrow: z.string(),
    heading: z.string(),
    resumeLink: z.string(),
  }),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
