# Android Maven Central Operator Guide

This guide documents the **working operator flow** for the first real Android publication of Legato's native core to Maven Central.

It is intentionally practical and explicit. It focuses on what has **worked** in this repo and on the operational boundaries between:

- repository-owned automation,
- maintainer-owned secrets,
- Gradle/Maven Central publication,
- and local machine setup.

> Scope note:
> - Android only.
> - iOS remains on the `release:ios:preflight` + manual handoff path in the current milestone.
> - This guide does **not** replace the release runbook in `docs/releases/publication-pipeline-v1.md`; it complements it with operator detail.

---

## 1. What this guide is for

Use this guide when you need to:

1. prepare a local machine to publish `dev.dgutierrez:legato-android-core`,
2. understand every required secret and where it comes from,
3. understand which files are source-of-truth vs local-only,
4. run `preflight -> publish -> verify` safely,
5. know what to do if a secret is missing or a signing key is lost.

This guide is written for the **maintainer/operator** running the publish.

---

## 2. Current publication target

The current Android artifact target is:

- **Group**: `dev.dgutierrez`
- **Artifact**: `legato-android-core`
- **Version**: read from `packages/capacitor/native-artifacts.json`

Current release flow:

1. `npm run release:android:preflight`
2. `npm run release:android:publish`
3. `npm run release:android:verify`

Run those from:

```bash
cd apps/capacitor-demo
```

---

## 3. Source of truth vs local-only files

### Repository source-of-truth

These are committed files and should be treated as authoritative:

- `packages/capacitor/native-artifacts.json`
- `native/android/core/build.gradle`
- `native/android/core/scripts/release-android.mjs`
- `docs/releases/publication-pipeline-v1.md`
- `docs/releases/publication-pipeline-v1-validation.md`

### Local-only files

These should **never** be committed with real secrets:

- `~/.gradle/gradle.properties`
- `packages/capacitor/legato-publish-env.sh` (real local copy, not the example)
- any local file that stores your armored private key

### File that should stay minimal

`native/android/core/gradle.properties` should remain minimal and non-secret.

At this time it should only need:

```properties
android.useAndroidX=true
```

Do **not** put Maven Central credentials or signing secrets there unless you fully understand the precedence and local risk.

---

## 4. Required tooling by operating system

You need all of these, regardless of OS:

- Node.js
- npm
- Java / JDK compatible with the Android Gradle toolchain
- Gradle (system Gradle is used today if no wrapper is present in `native/android/core`)
- GPG / GNU Privacy Guard
- network access to Maven Central / Sonatype Central Portal

### 4.1 macOS

Recommended checks:

```bash
node --version
npm --version
java -version
gradle --version
gpg --version
```

If `gpg` is missing:

```bash
brew install gnupg
```

### 4.2 Linux

Recommended checks:

```bash
node --version
npm --version
java -version
gradle --version
gpg --version
```

If `gpg` is missing, install it with your package manager. Example on Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y gnupg
```

### 4.3 Windows

You need equivalents for:

- Node/npm
- Java/JDK
- Gradle
- GPG

Recommended checks in PowerShell:

```powershell
node --version
npm --version
java -version
gradle --version
gpg --version
```

If `gpg` is missing, install Gpg4win or another supported GPG distribution and ensure `gpg` is available in PATH.

---

## 5. Maven Central credentials — what they are and where they come from

The Android publish path requires two Maven Central values:

- `mavenCentralUsername`
- `mavenCentralPassword`

### Important

These are **not always** your normal website login password.

They should come from the Maven Central / Central Portal account that owns the namespace:

- `dev.dgutierrez`

### What they mean

- `mavenCentralUsername`: the publish identity/user
- `mavenCentralPassword`: the publish secret/token/password for that identity

### Where to get them

From your Maven Central / Central Portal account settings / user-token area.

If you are not sure whether your account uses a token or password flow, verify it in the portal before attempting publish.

---

## 6. GPG signing key — what it is and where it comes from

This is the key pair used to sign your Android artifact publication.

### Concepts

- **Private key**: used locally by you to sign
- **Public key**: uploaded publicly so Maven Central can verify signatures
- **Passphrase**: the password protecting the private key

### What the project uses today

The most robust current path is:

- local GPG key installed on your machine,
- Gradle using `signing.gnupg.*`,
- `useGpgCmd()` in the Android publish build.

This is preferred over pushing large multiline private-key blobs through env vars.

### How to check whether you already have a key

```bash
gpg --list-secret-keys --keyid-format LONG
```

You should see a fingerprint or key id like:

```text
sec   rsa4096 ...
      6CDBE1618CFE6A2EEA87CE1EB324E2CAC4AF5580
```

### What values matter to Gradle

- `signing.gnupg.keyName`
- `signing.gnupg.passphrase`
- optionally `signing.gnupg.executable`
- optionally `signing.gnupg.homeDir`

---

## 7. Exact meaning of each variable/property

### Maven Central

#### `MAVEN_CENTRAL_USERNAME`
Maintainer-owned Maven Central publish identity.

#### `MAVEN_CENTRAL_PASSWORD`
Maintainer-owned Maven Central publish secret/token/password.

#### `ORG_GRADLE_PROJECT_mavenCentralUsername`
Gradle-compatible alias of the Maven username. The Node release script expects Maven creds via env, and Gradle reads these as project properties.

#### `ORG_GRADLE_PROJECT_mavenCentralPassword`
Gradle-compatible alias of the Maven password/token.

---

### GPG local-signing path (preferred)

#### `SIGNING_GNUPG_KEY_NAME`
Your GPG key id / fingerprint identifier. Example:

```text
B324E2CAC4AF5580
```

#### `SIGNING_GNUPG_PASSPHRASE`
The passphrase that unlocks the private key.

#### `SIGNING_GNUPG_EXECUTABLE`
Optional. Path or command name for `gpg`. Example:

```text
gpg
```

#### `SIGNING_GNUPG_HOME_DIR`
Optional. Path to your `.gnupg` home. Example:

```text
/Users/davidgutierrez/.gnupg
```

> The current script understands these simple env vars and maps them into Gradle's `signing.gnupg.*` properties.

---

### In-memory key path (fallback only)

These exist but are **not the preferred path** for the first real release anymore:

- `SIGNING_KEY`
- `SIGNING_KEY_FILE`
- `SIGNING_PASSWORD`
- `ORG_GRADLE_PROJECT_signingInMemoryKey...`

Use them only if you know why you are bypassing the local GPG backend.

---

## 8. Recommended configuration on your machine

### 8.1 `native/android/core/gradle.properties`

Keep it minimal:

```properties
android.useAndroidX=true
```

### 8.2 `~/.gradle/gradle.properties`

Recommended values:

```properties
mavenCentralUsername=YOUR_MAVEN_USERNAME
mavenCentralPassword=YOUR_MAVEN_PASSWORD

signing.gnupg.executable=gpg
signing.gnupg.homeDir=/Users/your-user/.gnupg
signing.gnupg.keyName=YOUR_KEY_ID
signing.gnupg.passphrase=YOUR_GPG_PASSPHRASE
```

### 8.3 Local helper script (optional, recommended)

Create and load a local helper file such as:

- `packages/capacitor/legato-publish-env.sh`

with values like:

```bash
export MAVEN_CENTRAL_USERNAME='YOUR_MAVEN_USERNAME'
export MAVEN_CENTRAL_PASSWORD='YOUR_MAVEN_PASSWORD'

export SIGNING_GNUPG_KEY_NAME='YOUR_KEY_ID'
export SIGNING_GNUPG_PASSPHRASE='YOUR_GPG_PASSPHRASE'
export SIGNING_GNUPG_EXECUTABLE='gpg'
export SIGNING_GNUPG_HOME_DIR='/Users/your-user/.gnupg'

export ORG_GRADLE_PROJECT_mavenCentralUsername="$MAVEN_CENTRAL_USERNAME"
export ORG_GRADLE_PROJECT_mavenCentralPassword="$MAVEN_CENTRAL_PASSWORD"
```

Then load it with:

```bash
source packages/capacitor/legato-publish-env.sh
```

> Do **not** commit that real file.

---

## 9. Step-by-step Android publication flow

Run everything from:

```bash
cd apps/capacitor-demo
```

### Step 1 — Preflight

```bash
npm run release:android:preflight
```

Expected outcome:

- `Mode: preflight`
- `Overall: PASS`
- expected and resolved coordinates match

If this fails, **do not** publish yet.

### Step 2 — Publish

```bash
npm run release:android:publish
```

Expected success outcome:

- `Mode: publish`
- `Overall: PASS`
- expected coordinate shown
- POM URL shown
- Portal namespace shown

### Step 3 — Verify

```bash
npm run release:android:verify
```

Possible outcomes:

#### PASS
Great: the artifact is now visible/resolvable.

#### FAIL with 404
This can be normal **temporarily** while Maven Central propagates.

If it fails with 404:
- wait a bit,
- rerun `verify`,
- repeat within the agreed retry window.

---

## 10. What if the release fails?

### If `preflight` fails
Do not publish. Fix config first.

### If `publish` fails with credential/signing issues
Fix credentials/signing locally first.

### If `publish` succeeds but `verify` still fails temporarily
Treat it as propagation until enough time has passed.

### If publish is truly broken after publication attempt
Do **not** assume rollback exists.
For Maven Central, the professional stance is usually:

## **forward-only recovery**

Meaning:
- if `0.1.0` is bad, fix and publish `0.1.1`

---

## 11. What if the RSA / private key is lost?

This is important.

### If you lose the private key completely
You will no longer be able to sign **future releases with that key**.

### What that means practically
- already published artifacts remain published
- their signatures remain historically tied to the old key
- but you cannot keep publishing new versions with that same signing identity

### Then what?
You need to:
1. generate a new GPG key
2. publish the new public key
3. update your local Gradle/GPG config to the new key
4. document the signing identity change

### What it does NOT mean
It does **not** mean existing released artifacts stop existing.

### Why this matters
For continuity and trust, losing the key is painful, because:
- signature continuity is broken
- release history now spans multiple keys

So:
## back up your private key securely

and never paste it into chats, tickets, or committed files.

---

## 12. Security rules

### Never commit
- `~/.gradle/gradle.properties`
- real local publish env scripts
- armored private keys
- tokens/passwords

### Prefer
- local GPG backend
- local machine secrets
- ephemeral env loading per terminal session

### Rotate secrets if exposed
If credentials or private key material were exposed:
1. rotate Maven Central credentials/tokens
2. consider rotating GPG key if private material leaked

---

## 13. Minimum known-good operator checklist

Before publish:

- [ ] `gpg --list-secret-keys --keyid-format LONG` shows your key
- [ ] `~/.gradle/gradle.properties` contains valid Maven + signing.gnupg config
- [ ] `native/android/core/gradle.properties` only contains `android.useAndroidX=true`
- [ ] local env helper is sourced in the current shell (if using one)
- [ ] `npm run release:android:preflight` passes

Publish:

- [ ] `npm run release:android:publish`

After publish:

- [ ] `npm run release:android:verify`
- [ ] rerun verify if Central still propagating
- [ ] capture evidence in release docs/runbook

---

## 14. Current status of this repo

At the end of the work so far:

- the publication **foundation** is implemented ✅
- the Android publish path is now wired for **local GPG backend** ✅
- the first real publish still depends on **your maintainer secrets and execution** ✅

This means the repo is now in a good place to perform the first real Android publication, but the act of publishing still remains an operator-owned step.
