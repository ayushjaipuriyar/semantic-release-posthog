export default {
  branches: ["main", { name: "beta", prerelease: true }],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/github",
    "@semantic-release/npm",
    // Dogfooding via file: self-dependency (switch to registry version after first publish).
    ["semantic-release-posthog", { optional: true }],
  ],
};
