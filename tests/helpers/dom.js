import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Load the markup of a shipped page into the jsdom document under test. */
export function loadPage(relativeHtmlPath) {
  const html = fs.readFileSync(path.join(ROOT, relativeHtmlPath), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = body ? body[1] : html;
}

/** Freshly evaluate a classic browser script and return its top level bindings. */
export async function loadScript(relativeScriptPath) {
  return import(/* @vite-ignore */ `${path.join(ROOT, relativeScriptPath)}?exposed`);
}
