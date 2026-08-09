# Keisuke Karijuku Apps

Static app and privacy-policy pages built with Astro.

Site: [https://ifapmzadu6.github.io/](https://ifapmzadu6.github.io/)

## Development

```sh
npm ci
npm run dev
```

Run all type, build-output, metadata, privacy, and internal-link checks with:

```sh
npm test
```

`npm run build` writes the production site to `dist/`. Pushes to `master`
deploy that output to GitHub Pages through the Astro deployment workflow.

App metadata lives in `src/data/apps.ts`. Shared layouts and page content live
under `src/layouts/` and `src/components/`; public static assets live in
`public/`.
