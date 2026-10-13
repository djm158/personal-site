import { parse } from "yaml";
import fs from "node:fs";
import path from "node:path";
import { Resume } from "./schema";

export const loadResume = (): Resume => {
  const filePath = path.join(process.cwd(), "resume/resume.yaml");
  const fileData = fs.readFileSync(filePath, "utf-8");
  const yamlData = parse(fileData);
  return Resume.parse(yamlData);
};
