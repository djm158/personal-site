import { describe, expect, test } from "vitest";
import { loadSiteContent } from "./load";
import { siteContentSchema } from "./schema";

describe("site-content.yaml", () => {
  test("matches the schema", () => {
    expect(() => loadSiteContent()).not.toThrow();
  });

  test("the schema rejects unknown keys", () => {
    const content = loadSiteContent();
    expect(
      siteContentSchema.safeParse({ ...content, extra: "copy" }).success,
    ).toBe(false);
  });
});
