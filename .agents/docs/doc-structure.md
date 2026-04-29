# Documentation Structure for Open Source Projects

## Section map

### 1. Landing Page (`index.mdx`)

Not technical documentation — it is a presentation page.
Must answer in seconds: what does this do? why do I need it?

```mdx
---
title: My Project
description: One line that explains what the project does.
template: splash
hero:
  tagline: Expanded description in 2-3 lines.
  actions:
    - text: Get Started
      link: /getting-started/installation/
      icon: right-arrow
      variant: primary
    - text: View on GitHub
      link: https://github.com/youruser/my-project
      icon: github
---

import { Card, CardGrid } from '@astrojs/starlight/components';

## Why My Project

<CardGrid>
  <Card title="Fast" icon="rocket">Benefit 1.</Card>
  <Card title="Simple" icon="puzzle">Benefit 2.</Card>
  <Card title="Flexible" icon="setting">Benefit 3.</Card>
  <Card title="Open Source" icon="open-book">Benefit 4.</Card>
</CardGrid>
```

---

### 2. Getting Started

Most important section. A new user reads it first.
Goal: reach a working result in under 5 minutes.

#### `introduction.md`
- What the project is (1 paragraph)
- Who it is for
- When to use it and when NOT to (be honest about limitations)
- Brief comparison with alternatives (optional)

#### `installation.md`
- Prerequisites with exact versions
- Installation command (as short as possible)
- Verification that it worked
- Common installation errors and fixes

#### `quick-start.md`
- The project's "Hello World"
- Simplest example that shows value — must work by copy-paste
- End with "what's next" links

#### `configuration.md`
- All configuration options
- Default values clearly marked
- Examples of common configurations

---

### 3. Guides

Task-oriented tutorials. Answer "how do I do X".

Difference from Reference: guides have context, explanations, and narrative flow.
Reference is just data/API without context.

**Structure of a well-written guide:**
1. Title with a verb: "How to Integrate with X", "Migrate from v1"
2. What will be achieved at the end (1-2 lines)
3. Prerequisites (if any)
4. Steps using `<Steps>`
5. Final result with example
6. Links to related topics

**Typical guides for open source projects:**
- Integration with popular frameworks (Next.js, NestJS, etc.)
- Advanced use cases
- Migration from alternatives or older versions
- Testing with the library
- Production deployment

---

### 4. Reference (API Reference)

Exhaustive technical documentation. Users consult it when they already know what they need.
No need to explain "why" — only "what" and "how".

**For each public API element:**
- Name and one-line description
- TypeScript signature / types
- Parameters table: name, type, required, description, default
- Returns: type and description
- Usage example
- Exceptions it may throw
- Since which version (if applicable)

**Template:**

```mdx
## `createClient(options)`

Creates a new client instance.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url` | `string` | ✅ | Base API URL |
| `timeout` | `number` | No | Timeout in ms. Default: `5000` |

**Returns**: `Client`

**Example**

```ts
import { createClient } from 'my-project';

const client = createClient({ url: 'https://api.example.com' });
```
```

---

### 5. Contributing

#### `contributing/index.md`
- How to report a bug (issue template)
- How to propose a feature
- How to open a PR
- Code of conduct

#### `contributing/development.md`
- How to clone and run locally
- How to run tests
- How to run linter/formatter
- Project structure explained

#### `contributing/conventions.md`
- Naming conventions
- Commit format (Conventional Commits if used)
- How to write tests
- PR review process

---

### 6. Changelog

```markdown
# Changelog

## [Unreleased]
### Added
- New feature not yet released

## [1.2.0] - 2025-04-27
### Added
- New `createBatch()` function
### Fixed
- Bug where `connect()` failed with negative timeout (#123)
### Breaking Changes
- `oldMethod()` removed. Use `newMethod()` instead.
```

---

### 7. FAQ (optional but recommended)

One page with frequently asked questions. Reduces repetitive issues.

Common questions:
- "Does it work with [popular framework]?"
- "What is the difference between X and Y?"
- "Is it compatible with [older version]?"

---

## Minimum documentation checklist

- [ ] Landing page with clear tagline
- [ ] Installation in 3 steps or fewer
- [ ] Quick Start that works by copy-paste
- [ ] At least 2-3 guides covering real use cases
- [ ] Public API reference (if applicable)
- [ ] CONTRIBUTING.md / Contributing section
- [ ] CHANGELOG.md
- [ ] LICENSE in the repo root
- [ ] README.md in the repo root