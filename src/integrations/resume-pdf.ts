import type { AstroIntegration } from "astro";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const MAX_PAGES = 2;
const SOURCE = "resume/resume.typ";

// Bundled fonts only, so a local build and the Netlify build render the same PDF
const typst = async (args: string[]): Promise<string> => {
  try {
    const { stdout } = await run("typst", [...args, "--ignore-system-fonts"]);
    return stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "typst is not installed; install it to build resume.pdf (brew install typst)",
      );
    }
    throw error;
  }
};

// Builds dist/resume.pdf from resume.typ, which reads resume.yaml. The YAML is already
// validated by the time this runs, because the pages that load it build first.
export const resumePdf = (): AstroIntegration => ({
  name: "resume-pdf",
  hooks: {
    "astro:build:done": async ({ dir, logger }) => {
      const pages = Number(
        await typst([
          "eval",
          "query(<page-count>).first().value",
          "--in",
          SOURCE,
        ]),
      );
      // Written as !(<=) so output that isn't a number (NaN) also fails
      if (!(pages <= MAX_PAGES)) {
        throw new Error(
          `resume.pdf is ${pages} pages; trim resume/resume.yaml to fit ${MAX_PAGES}`,
        );
      }

      await typst([
        "compile",
        SOURCE,
        fileURLToPath(new URL("resume.pdf", dir)),
      ]);
      logger.info("resume.pdf built");
    },
  },
});
