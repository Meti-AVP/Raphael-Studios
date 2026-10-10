// Static site: every page is plain HTML at build time; the browser only loads the JavaScript a part needs.
import { defineConfig } from 'astro/config';

// the site's address (its canonical links, the share picture, the structured data): SITE_URL when it is set; on
// Vercel, the project's production address (its own domain once one is attached); else the studio's domain
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site = process.env.SITE_URL || (vercel ? `https://${vercel}` : 'https://www.raphael-studios.com');

export default defineConfig({
  site,
  trailingSlash: 'ignore',
  compressHTML: true,
  devToolbar: { enabled: false },
  scopedStyleStrategy: 'class',
  build: {
    format: 'directory',
    inlineStylesheets: 'always',
    assets: 'assets',
  },
  image: {
    responsiveStyles: false,
  },
  vite: {
    build: {
      assetsInlineLimit: 2048,
      cssMinify: true,
      // three.js is one large module on purpose: it loads after the page is interactive
      chunkSizeWarningLimit: 900,
    },
  },
});
