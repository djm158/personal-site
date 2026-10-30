// Open Graph tags let link previews (Slack, LinkedIn, iMessage…) show the page's title and description.
// Every page shares one image, `public/og.png`, shown as the large Twitter/X card.
export type MetaTag =
  | { property: string; content: string }
  | { name: string; content: string };

export const OG_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: "Illustrated avatar of Daniel McGrath beside the heading “Hi, I’m Dan.”",
};

interface OpenGraphInput {
  title: string;
  description: string;
  siteName: string;
  pathname: string;
  site: URL;
}

export function openGraphTags({
  title,
  description,
  siteName,
  pathname,
  site,
}: OpenGraphInput): MetaTag[] {
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: new URL(pathname, site).href },
    { property: "og:image", content: new URL(OG_IMAGE.path, site).href },
    { property: "og:image:width", content: String(OG_IMAGE.width) },
    { property: "og:image:height", content: String(OG_IMAGE.height) },
    { property: "og:image:alt", content: OG_IMAGE.alt },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}
