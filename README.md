# semantic-release-posthog

[semantic-release](https://github.com/semantic-release/semantic-release) plugin that creates a
[PostHog annotation](https://posthog.com/docs/data/annotations) for every release, so you can
correlate product metric changes with what actually shipped.

```text
🚀 v2.1.0 · minor — feat(chat): redesign; feat(filter): bottom sheet; +2 more
🩹 v2.1.1 · patch — fix(leaderboard): crash on empty state
💥 v3.0.0 · major — feat!: new api
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

| Option          | Default                 | Description                                                       |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| `projectId`     | `POSTHOG_PROJECT_ID` env | PostHog project id — prefer the env/secret over hardcoding        |
| `host`          | `https://us.posthog.com`| PostHog base URL                                                  |
| `scope`         | `"project"`             | Annotation scope (`project` or `organization`)                    |
| `emoji`         | by release type 💥/🚀/🩹/🏷️ | Force one emoji for all annotations                            |
| `maxFeatures`   | `3`                     | Max commit subjects listed before `, +N more`                      |
| `optional`      | `false`                 | Skip (instead of fail) when credentials are missing               |
| `analyzerConfig`| auto-detected           | Escape hatch: override the analyzer config used for classification |

## Failure behaviour

- Missing credentials fail the release **before** publishing (`verifyConditions`) unless `optional: true`.
- If PostHog is unreachable after a release has shipped, the annotation failure is logged but the
  release is not failed — shipping beats charting.

## License

MIT
