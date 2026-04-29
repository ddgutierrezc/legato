---
name: starlight-docs
description: Creates and maintains professional open source documentation using Astro Starlight. Use when the user wants to scaffold a Starlight project, structure docs folders, write Getting Started or API Reference pages, configure the sidebar, use MDX components (Steps, Tabs, Aside, Card), set up GitHub Pages deployment, or decide what sections an open source project docs site needs.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: documentation
---

# Starlight Docs Skill

Guide for creating professional open source documentation with Astro Starlight.

## What I do

- Scaffold a new Starlight project inside a `/docs` folder
- Define the folder structure and sidebar configuration
- Write or improve any documentation page (Getting Started, Guides, Reference, Contributing, Changelog)
- Use Starlight MDX components correctly (Steps, Tabs, Aside, Card, FileTree, Code)
- Configure `astro.config.mjs` with sidebar, edit links, and social links
- Set up GitHub Actions to deploy to GitHub Pages

## When to use me

Use this skill whenever the user is working on documentation for an open source project with Starlight/Astro. Ask clarifying questions if the project type (library, CLI, app, API) or target audience is unclear — this affects which sections the docs need.

---

## Quick Reference

### Bootstrap the project

Run from the repo root:

```bash
npm create astro@latest docs -- --template starlight
```

### Folder structure

```
my-project/
├── src/                          # project source
├── docs/                         # Starlight lives here
│   ├── src/
│   │   └── content/
│   │       └── docs/
│   │           ├── index.mdx                  # landing page (template: splash)
│   │           ├── getting-started/
│   │           │   ├── installation.md
│   │           │   ├── quick-start.md
│   │           │   └── configuration.md
│   │           ├── guides/
│   │           ├── reference/
│   │           └── contributing/
│   ├── astro.config.mjs
│   └── package.json
└── README.md
```

### astro.config.mjs (recommended base)

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'My Project',
      description: 'Short project description for SEO',
      social: { github: 'https://github.com/youruser/my-project' },
      editLink: {
        baseUrl: 'https://github.com/youruser/my-project/edit/main/docs/',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
          ],
        },
        { label: 'Guides', autogenerate: { directory: 'guides' } },
        { label: 'Reference', autogenerate: { directory: 'reference' } },
        { label: 'Contributing', autogenerate: { directory: 'contributing' } },
      ],
    }),
  ],
});
```

### Page frontmatter

```yaml
---
title: Installation
description: How to install my-project in your project.
sidebar:
  order: 1
  badge:
    text: New
    variant: tip   # tip | caution | danger | success | note | default
---
```

### MDX component import

```mdx
import { Steps, Tabs, TabItem, Aside, Card, CardGrid, Badge, Code, FileTree, LinkCard } from '@astrojs/starlight/components';
```

### Required sections checklist

| Section | Required |
|---|---|
| Landing page (`index.mdx`) | ✅ |
| Getting Started (installation + quick start) | ✅ |
| Guides | ✅ |
| Reference | ✅ if public API |
| Contributing | ✅ |
| Changelog | ✅ |
| FAQ | Recommended |

### GitHub Actions deployment

Create `.github/workflows/deploy-docs.yml`:

```yaml
name: Deploy Docs
on:
  push:
    branches: [main]
    paths: ['docs/**']
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: docs/package-lock.json
      - run: npm ci
        working-directory: docs
      - run: npm run build
        working-directory: docs
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
```

Then enable: GitHub → Settings → Pages → Source: **GitHub Actions**

---

## Detailed references

Additional guidance is available in these instruction files (loaded via `opencode.json`):

- `.opencode/docs/doc-structure.md` — what to write in each section
- `.opencode/docs/components.md` — all MDX component examples
- `.opencode/docs/writing-guide.md` — writing style and conventions