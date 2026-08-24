# semantic-release-posthog

[semantic-release](https://github.com/semantic-release/semantic-release) plugin that creates a
[PostHog annotation](https://posthog.com/docs/data/annotations) for every release, so you can
correlate product metric changes with what actually shipped.

**Release context for product analytics.** The annotation uses the same commit analysis that
semantic-release used to decide what shipped — never an independent interpretation.

```text
🚀 v2.1.0 · minor — feat(chat): redesign; feat(filter): bottom sheet; +2 more
🩹 v2.1.1 · patch — fix(leaderboard): crash on empty state
```

Or in multi-line format:

```text
💥 v3.0.0 · major

Changes
• feat(api): new auth flow

Breaking changes
• All endpoints now require Bearer tokens

Deployment
• Environment: production
• Provider: github-actions

Links
• Compare: https://github.com/acme/widget/compare/v2.0.0...v3.0.0
• Release: https://github.com/acme/widget/releases/tag/v3.0.0
```

## Analyzer parity (the interesting part)

This plugin does **not** re-implement commit classification. It finds the
`@semantic-release/commit-analyzer` entry in your `.releaserc` — including any custom `preset`,
`parserOpts`, and `releaseRules` — and runs that same analyzer on each commit to decide what the
annotation says. Whatever rules decided your version bump decide your annotation. If you extend a
shareable config (`"extends": [...]`), the resolved plugins are used.

## Install

```bash
npm install --save-dev semantic-release-posthog @semantic-release/commit-analyzer
```

## Usage

`.releaserc.mjs`:

```js
export default {
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/github",
    "semantic-release-posthog",
  ],
};
```

GitHub Actions (`.github/workflows/release.yml`):

```yaml
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx semantic-release@24
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          POSTHOG_TOKEN: ${{ secrets.POSTHOG_TOKEN }}
          POSTHOG_PROJECT_ID: ${{ secrets.POSTHOG_PROJECT_ID }}
```

Create a personal API key at https://us.posthog.com/settings/user-api-keys and store it as the
`POSTHOG_TOKEN` repository secret. Set `POSTHOG_PROJECT_ID` to your PostHog project id — keeping
both in secrets means nothing project-specific is committed to the repo.

## Options

### Core

| Option          | Default                  | Description                                                         |
| --------------- | ------------------------ | ------------------------------------------------------------------- |
| `projectId`     | `POSTHOG_PROJECT_ID` env | PostHog project id — prefer the env/secret over hardcoding          |
| `host`          | `https://us.posthog.com` | PostHog base URL                                                    |
| `scope`         | `"project"`              | Annotation scope (`project` or `organization`)                      |
| `optional`      | `false`                  | Skip (instead of fail) when credentials are missing                 |
| `analyzerConfig`| auto-detected            | Escape hatch: override the analyzer config used for classification  |

### Formatting

| Option              | Default                     | Description                                              |
| ------------------- | --------------------------- | -------------------------------------------------------- |
| `format`            | `"single-line"`             | `"multi-line"` renders sections (see example above)       |
| `emoji`             | by release type 💥/🚀/🩹/🏷️ | Force one emoji for all annotations                       |
| `emojiMap`          | —                           | Per-type overrides, e.g. `{ minor: "✨" }`                |
| `contentTemplate`   | —                           | Custom single-line template with `{emoji} {version} {type} {subjects}` tokens |
| `subjectsJoiner`    | `"; "`                      | Delimiter between subjects                               |
| `maxSubjects`       | `3`                         | Max subjects listed before `, +N more` (`maxFeatures` still honoured) |
| `maxSubjectLength`  | `80`                        | Per-subject truncation length                            |
| `include`           | varies                      | Toggle parts: `{ version, releaseType, subjects, breakingChanges, environment, links }` |

`environment` and `links` default to `false`; the rest default to `true`.

### Reliability

| Option                    | Default                    | Description                                                     |
| ------------------------- | -------------------------- | --------------------------------------------------------------- |
| `dryRun`                  | `false`                    | Log the exact annotation that would be created; POST nothing     |
| `debug`                   | `false`                    | Log resolved analyzer config + per-commit classification         |
| `idempotency.enabled`     | `true`                     | Detect duplicate annotations before creating one                 |
| `idempotency.strategy`    | `"version-environment"`    | `"version"` matches on version alone                             |
| `privacy.patterns`        | credential patterns        | Extra regexes redacted from every subject                        |
| `privacy.replacement`     | `"[REDACTED]"`             | Replacement string                                               |
| `privacy.disableDefaults` | `false`                    | Disable built-in `password=`/`token=`/`secret=` redaction        |

### Deployment awareness

| Option        | Default       | Description                                                          |
| ------------- | ------------- | -------------------------------------------------------------------- |
| `skipPatch`   | `false`       | Don't annotate patch releases at all                                  |
| `environment` | auto-detected | Manual environment override ("production", "staging", ...)            |

When `include.environment` is enabled, the deployment section is auto-filled from well-known CI
variables — GitHub Actions (`GITHUB_ACTIONS`, protected branches like `main` map to
`production`), Vercel (`VERCEL_ENV`, `VERCEL_URL`), Netlify (`CONTEXT`, `DEPLOY_PRIME_URL`),
GitLab CI (`CI_ENVIRONMENT_NAME`), and CircleCI (`CIRCLE_BRANCH`). An explicit `environment`
option always wins over detection.

## Failure behaviour

- Missing credentials fail the release **before** publishing (`verifyConditions`) unless `optional: true`.
- If PostHog is unreachable after a release has shipped, the annotation failure is logged but the
  release is not failed — shipping beats charting.
- API calls retry twice with exponential backoff on transient errors (5xx / network) and time out
  after 10 seconds.
- Reruns are safe: if an annotation for this version already exists, none is created.

## License

MIT
