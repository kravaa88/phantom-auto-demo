import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { shop } from './config.js';

const target = new URL(process.argv[2] || 'http://localhost:4173/');
if (!['http:', 'https:'].includes(target.protocol) || /[?#]/.test(target.href)) throw new Error('Provide the full site base URL.');
if (!target.pathname.endsWith('/')) target.pathname += '/';

await mkdir('dist', { recursive: true });
for (const path of ['assets', 'style.css', 'main.js', 'viewer.js', 'config.js', 'ATTRIBUTION.md']) {
  await cp(path, 'dist/' + path, { recursive: true });
}

const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const base = escape(target.href);
const shopName = escape(shop.name);
let html = (await readFile('index.html', 'utf8')).replaceAll('PHANTOM AUTO', shopName);
html = html.replace('</head>', `<link rel="canonical" href="${base}">
<meta property="og:url" content="${base}">
<meta property="og:image" content="${base}assets/bmw-preview.webp">
</head>`);

if (shop.verified) {
  html = html.replace('noindex,follow', 'index,follow');
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: shop.name,
    url: target.href,
    address: { '@type': 'PostalAddress', streetAddress: shop.address },
    ...(shop.phone && { telephone: shop.phone }),
    ...(shop.logo && { logo: new URL(shop.logo, target).href }),
  }).replaceAll('<', '\\u003c');
  html = html.replace('</head>', `<script type="application/ld+json">${json}</script>\n</head>`);
}
await writeFile('dist/index.html', html);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${target.href}sitemap.xml\n`);
const entry = shop.verified ? `<url><loc>${base}</loc></url>` : '';
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entry}</urlset>\n`);
await writeFile('dist/.nojekyll', '');
