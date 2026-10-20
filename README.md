# Municipio Editor Extensions

Advisory heading guidance in every TinyMCE editor in modern Municipio. Requires
PHP 8.2 and WordPress's TinyMCE 4.9.11. Activate the plugin; no editor setting
is needed. It does not modify saved content or block publishing.

Install the versioned Composer package
`municipio/wp-plugin-municipio-editor-extensions` from this repository.

Known context adapters live in `source/HeadingContext.php`. Custom renderers can
provide a contract through `Municipio/EditorExtensions/headingContext`; use
`null` for unknown context. Unknown fields still check internal heading jumps.

Run `npm ci`, `npm test`, and `npm run test:browser` (requires Playwright
Chromium). The test-only TinyMCE dependency matches WordPress; it is excluded
from releases.
