import { describe, expect, test } from "vitest";
import { OG_IMAGE, openGraphTags } from "./open-graph";

const site = new URL("https://danielmcgrath.xyz");

describe("openGraphTags", () => {
  test("describes the page for link previews", () => {
    expect(
      openGraphTags({
        title: "Résumé · Daniel McGrath",
        description: "Roles and skills.",
        siteName: "Daniel McGrath",
        pathname: "/resume/",
        site,
      }),
    ).toEqual([
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Daniel McGrath" },
      { property: "og:title", content: "Résumé · Daniel McGrath" },
      { property: "og:description", content: "Roles and skills." },
      { property: "og:url", content: "https://danielmcgrath.xyz/resume/" },
      { property: "og:image", content: "https://danielmcgrath.xyz/og.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: OG_IMAGE.alt },
      { name: "twitter:card", content: "summary_large_image" },
    ]);
  });

  test("gives the home page the bare site URL", () => {
    const tags = openGraphTags({
      title: "Daniel McGrath",
      description: "Hi.",
      siteName: "Daniel McGrath",
      pathname: "/",
      site,
    });
    expect(tags).toContainEqual({
      property: "og:url",
      content: "https://danielmcgrath.xyz/",
    });
  });

  test("uses an absolute image URL whatever the page", () => {
    const tags = openGraphTags({
      title: "Daniel McGrath",
      description: "Hi.",
      siteName: "Daniel McGrath",
      pathname: "/resume/",
      site: new URL("https://deploy-preview-1--example.netlify.app"),
    });
    expect(tags).toContainEqual({
      property: "og:image",
      content: "https://deploy-preview-1--example.netlify.app/og.png",
    });
  });
});
