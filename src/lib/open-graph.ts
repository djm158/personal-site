// Open Graph tags let link previews (Slack, LinkedIn, iMessage…) show the page's title and description.
// There is no share image yet, so the Twitter/X card is the small "summary" one.
export type MetaTag =
  | { property: string; content: string }
  | { name: string; content: string };

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
    { name: "twitter:card", content: "summary" },
  ];
}
