import { readFile, readdir, mkdir, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { shop } from './config.js';

const target = new URL(process.argv[2] || 'http://localhost:4173/');
if (!['http:', 'https:'].includes(target.protocol) || /[?#]/.test(target.href)) throw new Error('Provide the full site base URL.');
if (!target.pathname.endsWith('/')) target.pathname += '/';

const modules = ['main.js', 'viewer.js', 'paint.js', 'workshop.js', 'arrival.js', 'arrival-film.js', 'hood.js', 'garage-audio.js', 'config.js'];
const assets = (await readdir('assets')).sort().map((name) => 'assets/' + name);
const files = ['index.html', 'style.css', ...modules, ...assets];
const fingerprint = createHash('sha256');
for (const file of files) fingerprint.update(file).update(await readFile(file));
const revision = fingerprint.digest('hex').slice(0, 12);
const versionPaths = (content) => content.replace(/(["'])(\.{1,2}\/[^"'\s]+\.(?:js|css|webp|mp4|jpg|hdr|svg|glb|bin|json))\1/g,
  (_, quote, path) => quote + path + '?v=' + revision + quote);

await mkdir('dist', { recursive: true });
for (const path of ['assets', 'style.css', 'ATTRIBUTION.md']) await cp(path, 'dist/' + path, { recursive: true });
for (const path of [...modules, ...assets.filter((file) => file.endsWith('.js'))]) {
  await writeFile('dist/' + path, versionPaths(await readFile(path, 'utf8')));
}

const escape = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const base = escape(target.href);
const shopName = escape(shop.name);
let html = versionPaths((await readFile('index.html', 'utf8')).replaceAll('PHANTOM AUTO', shopName));
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
