import { describe, expect, test } from "vitest";
import { openGraphTags } from "./open-graph";

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
      { name: "twitter:card", content: "summary" },
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
});
