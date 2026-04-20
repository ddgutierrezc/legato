---
name: capacitor-ios-spm
description: >
  Keep Capacitor iOS Swift Package Manager plugins aligned with the official package shape and sync workflow.
  Trigger: When wiring or debugging Capacitor iOS SPM plugins, CapApp-SPM autoload, package naming, packageClassList, or `UNIMPLEMENTED` plugin issues.
license: Apache-2.0
compatibility: opencode
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- When adding or fixing a Capacitor iOS plugin that must work with `npx cap sync ios`
- When `CapApp-SPM`, `packageClassList`, or `UNIMPLEMENTED` issues appear on iOS
- When comparing a local plugin package against official Capacitor / Capawesome SPM conventions

## Critical Patterns

- Follow the official Capacitor plugin SPM shape: standard `.library(...)`, no custom `type: .dynamic` unless proven necessary by upstream docs.
- Treat `ios/App/CapApp-SPM/Package.swift` as CLI-generated — never hand-edit it.
- The effective package/product naming is whatever `CapApp-SPM` requests; `Package.swift` in the plugin must expose the exact same package/product names.
- Keep plugin discovery class-based: `@objc(PluginClassName)` + `CAPPlugin, CAPBridgedPlugin` + `identifier`, `jsName`, `pluginMethods`.
- Verify `ios/App/App/capacitor.config.json` contains the plugin class in `packageClassList` after `npx cap sync ios`.
- For monorepo local path dependencies, validate `Package.swift` paths from the real consumer entrypoint (`node_modules/...`), not just from the plugin folder itself.
- Prefer official patterns from `create-capacitor-plugin`, Capacitor docs, and Capawesome plugins before introducing custom packaging behavior.
- If Xcode shows `Missing package product 'CapApp-SPM'`, inspect the real SwiftPM resolution error first; it is usually a downstream symptom.

## Commands

```bash
cd apps/capacitor-demo
npm run cap:sync
open "ios/App/App.xcodeproj"
xcodebuild -resolvePackageDependencies -project "apps/capacitor-demo/ios/App/App.xcodeproj"
```

## Resources

- OpenCode skills docs: use `.opencode/skills/<name>/SKILL.md` or compatible `.agents/skills/<name>/SKILL.md`
- Capacitor official plugin template: `create-capacitor-plugin`
- Capacitor plugin docs: `https://capacitorjs.com/docs/plugins/creating-plugins`
