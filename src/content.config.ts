import { defineCollection } from "astro:content";
import { file } from "astro/loaders";
import { z } from "astro/zod";
import { parse } from "yaml";
import { splitEmphasis } from "./lib/site-content/emphasis";

// Prose that can mark words in *asterisks* for the accent italic
const richText = z.string().transform(splitEmphasis);

const siteContent = defineCollection({
  // file() makes each top-level key an entry, so wrap the whole document in one "home" entry
  loader: file("src/content/site-content.yaml", {
    parser: (text) => ({ home: parse(text) }),
  }),
  schema: z.strictObject({
    description: z.string(),
    hero: z.strictObject({
      status: richText,
      heading: richText,
      intro: richText,
      resumeLink: z.string(),
      emailLink: z.string(),
    }),
    about: z.strictObject({
      eyebrow: z.string(),
      lead: richText,
      body: richText,
    }),
    experience: z.strictObject({
      eyebrow: z.string(),
      heading: richText,
      resumeLink: z.string(),
    }),
  }),
});

export const collections = { siteContent };
