import { parse } from "yaml";
import fs from "node:fs";
import path from "node:path";
import { siteContentSchema, type SiteContent } from "./schema";

export const loadSiteContent = (): SiteContent => {
  const filePath = path.join(process.cwd(), "content/site-content.yaml");

  const fileData = fs.readFileSync(filePath, "utf-8");
  const yamlData = parse(fileData);
  return siteContentSchema.parse(yamlData);
};
