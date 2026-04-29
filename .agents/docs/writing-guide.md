# Writing Guide for Open Source Documentation

## Core principles

### 1. One page, one question

Each page answers exactly one question or covers exactly one topic.

❌ Bad: "Installation, configuration, and first steps"
✅ Good: Three separate pages — Installation / Configuration / Quick Start

### 2. Show result first, explain after

❌ Bad:
> The `createClient` function receives a configuration object with the properties `url` of type string...

✅ Good:
> ```ts
> const client = createClient({ url: 'https://api.example.com' });
> const data = await client.get('/users');
> ```
> `createClient()` accepts an object with these options: ...

### 3. Code that works when copied and pasted

Every code example must:
- Be completely functional (imports included)
- Have replaceable values clearly marked (`YOUR_API_KEY`, `<your-url>`)
- Show the expected output when applicable
- Be tested — no invented examples

❌ Bad:
```ts
// import the client
const c = new Client(options);
```

✅ Good:
```ts
import { createClient } from 'my-project';

const client = createClient({
  url: 'https://api.example.com',  // Replace with your URL
  timeout: 5000,
});
```

### 4. Active voice, second person

❌ Bad: "The dependency should be installed before proceeding."
✅ Good: "Install the dependency before proceeding."

❌ Bad: "It is recommended that the user configure the environment variable."
✅ Good: "Set the `API_KEY` environment variable."

### 5. Never assume context

Every technical term is explained the first time it appears.

❌ Bad: "Configure the webhook in your provider."
✅ Good: "Configure the webhook (a URL your provider calls when an event occurs) in your account settings."

### 6. Explicit prerequisites

```markdown
## Before you begin

- Node.js 18 or higher ([see how to install](https://nodejs.org))
- An Example.com account ([sign up for free](https://example.com/signup))
- Basic knowledge of TypeScript
```

---

## Page type structures

### Installation page
1. Prerequisites with exact versions
2. Installation command (as short as possible)
3. Verification that it worked
4. Common errors with solutions

### Tutorial / Quick Start
1. What will be built (with screenshot or clear description)
2. Prerequisites
3. Steps using `<Steps>`, each with working code
4. Final result
5. "What's next" — links to more advanced guides

### Thematic guide
1. Title with a verb: "How to do X"
2. When to use this (context)
3. Step-by-step implementation
4. Common variations
5. Frequent errors and how to fix them

### API Reference entry
1. TypeScript signature
2. One-line description
3. Parameters table
4. Return value
5. Minimal example
6. Exceptions

---

## Words and phrases to avoid

| ❌ Avoid | ✅ Use instead |
|---|---|
| "Simply..." | (remove it) |
| "Easily..." | (remove it — subjective) |
| "Obviously..." | (remove it) |
| "Note that..." | Use `<Aside type="note">` |
| "As mentioned earlier..." | Repeat the info or add a link |
| "Etc." | List complete examples or use "among others" |
| "The user should..." | "You need to..." or just "Run..." |

---

## Formatting conventions

- **Inline code**: `createClient()`, `options.timeout`, `src/index.ts`
- **File paths**: `package.json`, `/src/components/Button.tsx`
- **Env variables**: `API_KEY`, `DATABASE_URL`
- **Terminal commands**: code block with `bash` language tag
- **First mention of project concepts**: **bold** — e.g., **AlertTemplate**

---

## Sidebar structure

- Maximum 2 levels of depth
- Labels are nouns or short phrases (not questions)
- First item in every section = introduction to that section
- Order from simplest to most complex

```
Getting Started
├── Introduction
├── Installation
├── Quick Start
└── Configuration

Guides
├── Use case A
├── Use case B
└── Migration

Reference
├── Main API
├── Configuration
└── CLI (if applicable)
```

---

## Checklist before publishing a page

- [ ] Title is descriptive and uses words users would search for
- [ ] Frontmatter `description` summarizes the page in one line (SEO)
- [ ] Code examples include necessary imports
- [ ] Code examples have been tested
- [ ] No typos
- [ ] Internal links work
- [ ] Steps use `<Steps>`
- [ ] Multiple options (npm/yarn) use `<Tabs>`
- [ ] Important warnings use `<Aside>`
- [ ] End with a link to "what's next" or related pages

---

## Keeping docs up to date

1. **Link docs to PRs** — if a PR changes public behavior, it must update the docs
2. **Version the Changelog** — update on every release with Added / Changed / Fixed / Removed
3. **Mark stale pages** — add `<Aside type="caution">This page is being updated.</Aside>`
4. **Doc issues label** — use a `documentation` label so the community can report gaps