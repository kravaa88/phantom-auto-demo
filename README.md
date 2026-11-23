# PHANTOM AUTO

An English-language PHNX Web Studio concept for an auto repair website in Elgin, IL. It includes a locally served 3D BMW M4 Competition, a scroll-driven hood inspection, compact service hotspots, opt-in synthesized garage sound, an appointment form, a Google Maps location preview and a Google Reviews section.

## Local preview

With Node.js 22 or newer, run these commands from the project root.

```sh
node seo.mjs
node preview.mjs
```

Open http://127.0.0.1:4173/. The project uses a browser import map and self-hosted Three.js. No package install or external 3D requests are required. See [model and dependency credits](ATTRIBUTION.md).

## Configure the workshop

Edit `config.js` to set the display name, logo path, business telephone, address, colors, available services, reviews URL and booking endpoint. Keep `verified: false` until the owner confirms the business details. When verified, the build generates AutoRepair structured data and adds the site URL to its sitemap. The demo uses `noindex,follow` and an empty sitemap. Review the descriptions in `index.html` if the target city or services change. Adjust the document language if translating the experience.

The booking endpoint receives a JSON POST with service, name, email, date and notes. It must validate the request, allow the deployed origin, persist accepted requests and return `{"accepted":true}` only on acceptance. The demo keeps submission disabled. The Google map loads after user interaction.

## GitHub Pages

Push this folder as the root of the new repository. Select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. Run the **Deploy GitHub Pages** workflow or push to `main`. The workflow builds with the site base returned by GitHub Pages and deploys `dist/`.

For another static host, run `node seo.mjs https://your-host.example/path/` and serve the generated `dist/` directory over HTTPS.
