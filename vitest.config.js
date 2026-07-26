import fs from 'node:fs';
import { defineConfig } from 'vitest/config';

const EXPOSE_QUERY = '?exposed';
const DECLARATION = /^(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * The app ships classic browser scripts (no modules, no exports). This plugin
 * loads such a script with a `?exposed` query and appends an export statement
 * for every top level binding so tests can exercise the internals directly.
 */
function exposeScriptGlobals() {
  return {
    name: 'expose-script-globals',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith(EXPOSE_QUERY)) return null;
      return this.resolve(source.slice(0, -EXPOSE_QUERY.length), importer, { skipSelf: true })
        .then((resolved) => (resolved ? resolved.id + EXPOSE_QUERY : null));
    },
    load(id) {
      if (!id.endsWith(EXPOSE_QUERY)) return null;
      const file = id.slice(0, -EXPOSE_QUERY.length);
      const code = fs.readFileSync(file, 'utf8');
      const names = [...code.matchAll(DECLARATION)].map((match) => match[1]);
      const unique = [...new Set(names)];
      return `${code}\nexport { ${unique.join(', ')} };\n`;
    }
  };
}

export default defineConfig({
  plugins: [exposeScriptGlobals()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['docs/**/*.js', 'frontend/**/*.js'],
      exclude: ['tests/**']
    }
  }
});
