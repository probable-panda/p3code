# P3 releases

P3 ships one Apple Silicon macOS build. The upstream sync workflow updates source;
it does not install or release an app. Leave the inherited upstream Release
workflows disabled: they publish upstream npm packages and require upstream infrastructure.

Commit and push reviewed changes to `probable-panda/p3code`'s `p3` branch. From a
clean checkout on a Mac with a Developer ID Application signing identity, run:

```sh
bash scripts/p3-release.sh 0.45.1
```

Use a new stable three-part version for each release. The script builds the exact
commit in a temporary worktree, aligns all bundled versions, signs and verifies
the app, and publishes the DMG, update ZIP, blockmaps, checksums, and
`latest-mac.yml` to the fork. It leaves installers in `release/p3-<version>` and
never changes the installed app or live data. `CSC_NAME` can select a local
signing identity. Signing keys stay in the local keychain.

For hosted builds, run **P3 Apple Silicon release** on branch `p3` with the version.
Without `CSC_LINK` and `CSC_KEY_PASSWORD` repository secrets, it retains unsigned
build artifacts only; it never publishes an unsigned update. When those secrets
are configured, it signs and publishes automatically. Optional `APPLE_API_KEY`,
`APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` secrets enable notarization; the key
secret contains the `.p8` contents. Without notarization, use the managed SSH
installation path for the private fleet; browser downloads may need macOS approval.

Install the signed build manually once on each Mac to add the fork's update feed.
Quit P3 before replacing `/Applications/P3 Code.app`, preserve the old app and a
consistent backup of its state, then reopen. Subsequent releases use the in-app
updater on the stable track. Update a remote Mac first and the development host
last, after its active work has finished. Never restore only an older app over a
database that has been migrated without checking migration compatibility.

P3 keeps the existing T3 bundle ID and state directory. Do not run P3 and upstream
T3 against the same live state at the same time. Standalone CLI distribution and
Linux builds are outside this release train.
