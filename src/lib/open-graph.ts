// Open Graph tags let link previews (Slack, LinkedIn, iMessage…) show the page's title and description.
// Pages share `public/og.png`, shown as the large Twitter/X card, unless they pass their own image.
export type MetaTag =
  | { property: string; content: string }
  | { name: string; content: string };

export interface OgImage {
  /** Path under `public/`, made absolute against the site URL */
  path: string;
  width: number;
  height: number;
  alt: string;
}

export const OG_IMAGE: OgImage = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: "Illustrated avatar of Daniel McGrath beside the heading “Hi, I’m Dan.”",
};

export const RESUME_OG_IMAGE: OgImage = {
  path: "/og-resume.png",
  width: 1200,
  height: 630,
  alt: "The heading “Résumé” beside Daniel McGrath’s roles from 2020 to 2026: Wizard AI, Commsor, Nearform and WizeHive.",
};

interface OpenGraphInput {
  title: string;
  description: string;
  siteName: string;
  pathname: string;
  site: URL;
  image?: OgImage;
}

export function openGraphTags({
  title,
  description,
  siteName,
  pathname,
  site,
  image = OG_IMAGE,
}: OpenGraphInput): MetaTag[] {
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: new URL(pathname, site).href },
    { property: "og:image", content: new URL(image.path, site).href },
    { property: "og:image:width", content: String(image.width) },
    { property: "og:image:height", content: String(image.height) },
    { property: "og:image:alt", content: image.alt },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}
