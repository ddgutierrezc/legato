# Starlight MDX Components

Import at the top of every `.mdx` file that uses them:

```mdx
import { Steps, Tabs, TabItem, Aside, Card, CardGrid, Badge, Code, FileTree, LinkCard, LinkButton } from '@astrojs/starlight/components';
```

---

## `<Steps>` — Numbered steps

Use for installations, tutorials, sequential processes.

```mdx
<Steps>

1. Install the dependency:

   ```bash
   npm install my-project
   ```

2. Import in your code:

   ```ts
   import { createClient } from 'my-project';
   ```

3. Initialize:

   ```ts
   const client = createClient({ url: 'https://api.example.com' });
   ```

</Steps>
```

Step content must be indented with 3 spaces.

---

## `<Tabs>` + `<TabItem>` — Content per variant

Use for the same content across package managers, languages, or OS.

```mdx
<Tabs>
  <TabItem label="npm">
    ```bash
    npm install my-project
    ```
  </TabItem>
  <TabItem label="pnpm">
    ```bash
    pnpm add my-project
    ```
  </TabItem>
  <TabItem label="yarn">
    ```bash
    yarn add my-project
    ```
  </TabItem>
</Tabs>
```

Sync tabs across the whole site with `syncKey`:

```mdx
<Tabs syncKey="pkg-manager">
  <TabItem label="npm">...</TabItem>
  <TabItem label="pnpm">...</TabItem>
</Tabs>
```

---

## `<Aside>` — Notes and warnings

```mdx
<Aside>Generic note.</Aside>

<Aside type="tip">Useful tip for the user.</Aside>

<Aside type="caution">Something that can go wrong if not careful.</Aside>

<Aside type="danger">Action that may cause data loss or security issues.</Aside>
```

Shorthand (no import needed):

```markdown
:::note
Note.
:::

:::tip
Tip.
:::

:::caution
Caution.
:::

:::danger
Danger.
:::
```

When to use each:
- `note` → non-critical additional info
- `tip` → shortcuts, best practices
- `caution` → unexpected behavior, deprecations
- `danger` → data loss, breaking changes, security

---

## `<Card>` + `<CardGrid>` — Grid of cards

Ideal for landing pages and section index pages.

```mdx
<CardGrid>
  <Card title="Fast" icon="rocket">
    No overhead, no magic. Just code.
  </Card>
  <Card title="TypeScript" icon="seti:typescript">
    Types included. No extra `@types/` packages.
  </Card>
</CardGrid>
```

Common icons: `rocket`, `setting`, `open-book`, `puzzle`, `star`, `github`,
`seti:typescript`, `seti:dart`, `information`, `warning`, `approve-check`.

---

## `<LinkCard>` — Card with a link

```mdx
<CardGrid>
  <LinkCard
    title="Installation"
    description="How to install and set up the project."
    href="/getting-started/installation/"
  />
  <LinkCard
    title="Quick Start"
    description="Your first project in 5 minutes."
    href="/getting-started/quick-start/"
  />
</CardGrid>
```

---

## `<FileTree>` — File tree

```mdx
<FileTree>

- src/
  - components/
    - Button.tsx
    - Input.tsx
  - pages/
    - index.astro
- astro.config.mjs
- package.json

</FileTree>
```

Highlight important files with bold:

```mdx
<FileTree>
- src/
  - **config.ts**
  - index.ts
</FileTree>
```

---

## `<Code>` — Code with metadata

```mdx
<Code
  code={`const client = createClient({ url: 'https://api.example.com' });
const result = await client.fetch('/users');
console.log(result);`}
  lang="ts"
  title="Basic example"
  mark={[2]}
/>
```

Import a real file instead of copy-pasting:

```mdx
import myCode from '/src/examples/example.ts?raw';
<Code code={myCode} lang="ts" title="src/example.ts" />
```

---

## `<Badge>` — Inline badge

```mdx
### `createClient()` <Badge text="New in v2" variant="tip" />

### `legacyMethod()` <Badge text="Deprecated" variant="caution" />
```

Variants: `default`, `note`, `danger`, `caution`, `tip`, `success`.

---

## `<LinkButton>` — Button with link

```mdx
<LinkButton href="/getting-started/installation/">Get started</LinkButton>
<LinkButton href="https://github.com/your/repo" variant="secondary" icon="github">
  View on GitHub
</LinkButton>
```

Variants: `primary`, `secondary`, `minimal`.

---

## Quick reference table

| Component | When to use |
|---|---|
| `<Steps>` | Installations, step-by-step tutorials |
| `<Tabs>` | Same content in multiple variants |
| `<Aside>` | Notes, tips, warnings, dangers |
| `<Card>` + `<CardGrid>` | Landing page, section index pages |
| `<LinkCard>` | Navigation to other pages |
| `<FileTree>` | Folder structure visualization |
| `<Code>` | Code with highlighted lines or from real file |
| `<Badge>` | "New", "Deprecated", "Beta" in headings |
| `<LinkButton>` | CTAs inside content |