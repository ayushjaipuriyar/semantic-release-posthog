export default {
  branches: ["main", { name: "beta", prerelease: true }],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/github",
    "@semantic-release/npm",
    // Dogfooding via local dist path — resolves before first CI publish;
    // switch to the published version string once we want CI to test the shipped artifact.
    ["./dist/index.js", { optional: true }],
  ],
};
