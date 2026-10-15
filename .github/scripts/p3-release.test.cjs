const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir, platform, arch } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const script = path.resolve(__dirname, "../../scripts/p3-release.sh");

for (const version of [
  "",
  "latest",
  "1.2",
  "01.2.3",
  "1.2.3-preview.1",
  "1.2.3; touch should-not-exist",
  "1.2.3\nmalicious",
]) {
  test(`rejects invalid release version ${JSON.stringify(version)} before touching source`, () => {
    const result = spawnSync("bash", [script, version], { encoding: "utf8", cwd: tmpdir() });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage:/);
    assert.doesNotMatch(result.stderr, /not a git repository/);
  });
}

test(
  "refuses to package uncommitted changes",
  { skip: platform() !== "darwin" || arch() !== "arm64" },
  () => {
    const root = mkdtempSync(path.join(tmpdir(), "p3-release-test-"));
    try {
      assert.equal(spawnSync("git", ["init", root]).status, 0);
      const { writeFileSync } = require("node:fs");
      writeFileSync(path.join(root, "uncommitted.txt"), "work in progress");
      const result = spawnSync("bash", [script, "0.45.1"], { encoding: "utf8", cwd: root });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Commit changes before releasing/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
