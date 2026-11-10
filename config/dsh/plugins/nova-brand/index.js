/**
 * Nova brand marker plugin (host side).
 * Loaded via config/dsh/nova-brand.cordis.yml. CSS tokens live in brand.css
 * for a future client dual-face injection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const name = "nova-brand";

export function apply(ctx) {
  const cssPath = path.join(__dirname, "brand.css");
  const msg = `[nova-brand] Nova Studio overlay loaded css=${fs.existsSync(cssPath) ? "yes" : "no"}`;
  try {
    ctx.logger?.info?.(msg);
  } catch {
    /* ignore */
  }
  console.error(msg);
}
