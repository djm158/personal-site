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
      // The line under the avatar after each click toward night mode, one per click from the first
      avatarHints: z.array(z.string()).optional(),
    }),
    // Words that scroll in the strip under the hero; the strip is left out until there are some
    marquee: z.array(z.string()).optional(),
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
    contact: z.strictObject({
      eyebrow: z.string(),
      heading: richText,
      intro: richText,
      links: z.array(z.strictObject({ label: z.string(), href: z.string() })),
      form: z.strictObject({
        topicLabel: z.string(),
        topics: z.array(z.string()).min(1),
        nameLabel: z.string(),
        namePlaceholder: z.string(),
        emailLabel: z.string(),
        emailPlaceholder: z.string(),
        messageLabel: z.string(),
        messagePlaceholder: z.string(),
        submit: z.string(),
        errors: z.strictObject({
          name: z.string(),
          email: z.string(),
          message: z.string(),
        }),
      }),
      success: z.strictObject({
        heading: z.string(),
        body: z.string(),
        reset: z.string(),
      }),
    }),
  }),
});

export const collections = { siteContent };
