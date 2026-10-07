const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const script = path.join(__dirname, "p3-sync-upstream.sh");

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "p3-sync-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const upstream = path.join(root, "upstream");
  const fork = path.join(root, "fork.git");
  const work = path.join(root, "runner");
  const output = path.join(root, "output");
  const git = (cwd, ...args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = (cwd, file, content) => {
    writeFileSync(path.join(cwd, file), content);
    git(cwd, "add", file);
    git(cwd, "commit", "-m", `Change ${file}`);
    return git(cwd, "rev-parse", "HEAD");
  };
  git(root, "init", "-b", "main", upstream);
  git(upstream, "config", "user.name", "Test");
  git(upstream, "config", "user.email", "test@example.com");
  const base = commit(upstream, "shared.txt", "base\n");
  git(root, "clone", "--bare", upstream, fork);
  git(root, "clone", fork, work);
  git(work, "config", "user.name", "Test");
  git(work, "config", "user.email", "test@example.com");
  git(work, "switch", "-c", "p3");
  commit(work, "branding.txt", "P3 Code\n");
  git(work, "push", "-u", "origin", "p3");
  const run = (phase, sha) =>
    spawnSync("bash", [script, phase], {
      cwd: work,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: output,
        P3_UPSTREAM_URL: upstream,
        P3_UPSTREAM_SHA: sha,
      },
    });
  const remote = (branch) => git(fork, "rev-parse", branch);
  return { upstream, fork, work, output, git, commit, base, run, remote };
}

test("a prepared merge preserves branding and leaves remote branches untouched until publish", (t) => {
  const f = fixture(t);
  const before = f.remote("p3");
  const latest = f.commit(f.upstream, "feature.txt", "upstream feature\n");
  const prepared = f.run("prepare");
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.match(readFileSync(f.output, "utf8"), /changed=true/);
  assert.equal(readFileSync(path.join(f.work, "branding.txt"), "utf8"), "P3 Code\n");
  assert.equal(readFileSync(path.join(f.work, "feature.txt"), "utf8"), "upstream feature\n");
  assert.equal(f.remote("main"), f.base);
  assert.equal(f.remote("p3"), before);
  const published = f.run("publish", latest);
  assert.equal(published.status, 0, published.stderr);
  assert.equal(f.remote("main"), latest);
  assert.equal(f.remote("p3"), f.git(f.work, "rev-parse", "HEAD"));
});

test("an up-to-date fork skips validation and publication", (t) => {
  const f = fixture(t);
  assert.equal(f.run("prepare").status, 0);
  assert.match(readFileSync(f.output, "utf8"), /changed=false/);
});

test("a merge conflict leaves both remote branches unchanged", (t) => {
  const f = fixture(t);
  f.commit(f.work, "shared.txt", "fork change\n");
  f.git(f.work, "push", "origin", "p3");
  const before = f.remote("p3");
  f.commit(f.upstream, "shared.txt", "upstream change\n");
  assert.notEqual(f.run("prepare").status, 0);
  assert.equal(f.remote("main"), f.base);
  assert.equal(f.remote("p3"), before);
});

test("a custom commit on mirror main is never overwritten", (t) => {
  const f = fixture(t);
  f.git(f.work, "switch", "main");
  const main = f.commit(f.work, "private.txt", "custom main\n");
  f.git(f.work, "push", "origin", "main");
  f.git(f.work, "switch", "p3");
  f.commit(f.upstream, "feature.txt", "upstream feature\n");
  const prepared = f.run("prepare");
  assert.notEqual(prepared.status, 0);
  assert.match(prepared.stderr, /Refusing to overwrite/);
  assert.equal(f.remote("main"), main);
});

test("a concurrent p3 push rejects the entire publication, including the main update", (t) => {
  const f = fixture(t);
  const latest = f.commit(f.upstream, "feature.txt", "upstream feature\n");
  assert.equal(f.run("prepare").status, 0);
  const other = path.join(path.dirname(f.work), "other");
  f.git(path.dirname(f.work), "clone", "-b", "p3", f.fork, other);
  f.git(other, "config", "user.name", "Test");
  f.git(other, "config", "user.email", "test@example.com");
  const concurrent = f.commit(other, "concurrent.txt", "new work\n");
  f.git(other, "push", "origin", "p3");
  assert.notEqual(f.run("publish", latest).status, 0);
  assert.equal(f.remote("main"), f.base);
  assert.equal(f.remote("p3"), concurrent);
});
