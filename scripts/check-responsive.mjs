import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "apps", "web", "src");

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  }));
  return nested.flat();
}

const failures = [];
for (const path of await cssFiles(sourceRoot)) {
  const css = await readFile(path, "utf8");
  for (const element of ["header", "main"]) {
    const unscoped = new RegExp(`(^|[},])\\s*${element}\\s*\\{`, "gm");
    if (unscoped.test(css)) {
      failures.push(`${relative(process.cwd(), path)} contains an unscoped ${element} selector`);
    }
  }
}

const learningCss = await readFile(join(sourceRoot, "learning-management.css"), "utf8");
if (!learningCss.includes("@media(max-width:700px){.lms-hero{align-items:flex-start;gap:18px;flex-direction:column}")) {
  failures.push("Learning Management must switch its hero to a column at the same 700px breakpoint used by its full-width action button");
}

if (failures.length) {
  console.error("Responsive CSS regression check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Responsive CSS regression check passed.");
