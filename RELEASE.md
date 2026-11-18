# SV2 UI Release Process

## Changelog

The changelog is a list of notable changes for each version of SV2 UI.
It is a way to keep track of the project's progress and to communicate
the changes to the users and the community.

The changelog is automatically generated on each release page, and extra contextual
information is added as needed, such as:
 - General release information.
 - Breaking changes, such as setup steps users have to repeat after upgrading.
 - Notable changes.
 - The `sv2-apps` release whose images this version runs.

## Release Process

Each release is cut from `main` into a `release/vX.Y.Z` branch. The release branch
turns a development build, which tracks the `sv2-apps` `:main` images, into a
release build pinned to a `sv2-apps` release. Its pin commits never go back to
`main`, and the branch is kept afterwards for future reference or fixes.

A release is not published straight away: it is first cut as a **release
candidate**, which the SRI team and the community run on mainnet during a test
period. Only a candidate that gets through that period without a blocking problem
becomes the release.

Releases are coordinated with [`stratum`](https://github.com/stratum-mining/stratum)
and [`sv2-apps`](https://github.com/stratum-mining/sv2-apps), always in the order
`stratum`, `sv2-apps`, `sv2-ui`, because each one is built on the one before it.
An SV2 UI candidate runs the images of a `sv2-apps` candidate, which makes it the
simplest way to run the whole candidate stack. `main` is never frozen: whatever
merges there after the release branch was created belongs to the next release.

### Cutting a Release Candidate

A candidate is tagged `vX.Y.Z-rc.N`, starting at `rc.1`. The `sv2-apps` candidate
whose images it runs has to be published first.

1. **Run Checks:** Make sure CI is green on `main`.
2. **Create Release Branch:** For the first candidate, create `release/vX.Y.Z` from the `main` branch.
3. **Pin the SV2 UI Image:** In `README.md`, set the tag of `stratumv2/sv2-ui` to `vX.Y.Z-rc.N` in every `docker run` command. Commit as `pin sv2-ui release image to vX.Y.Z-rc.N`.
4. **Pin the SV2 Applications Images:** In `shared/src/images.ts`, set the tag of every image to the `sv2-apps` candidate this one runs, followed by its multi-arch index digest (e.g. `stratumv2/translator_sv2:v0.10.0-rc.1@sha256:...`). `docker buildx imagetools inspect <image>:<tag>` prints the digest. Update the "Docker Images Used" section of `README.md` to match, and commit as `pin sv2-apps images to vA.B.C-rc.M`.
5. **Push Release Branch:** CI runs on pushes to `release/v*`, including the config compatibility check against the pinned images.
6. **Publish the Candidate:** Once CI passes on the release branch, create the `vX.Y.Z-rc.N` tag on it and publish it as a GitHub **pre-release**. Publishing triggers the Docker workflow, which runs the config compatibility check again and pushes the multi-arch image as `stratumv2/sv2-ui:vX.Y.Z-rc.N`. `stratumv2/sv2-ui:latest` does not move.
7. **Announce:** Announce the candidate together with the `sv2-apps` candidate it runs.

### Test Period

The test period lasts 7 days, counted from the publication of the newest
candidate among `stratum`, `sv2-apps` and `sv2-ui`, since the three are released
together.

- The SRI team and community members run the candidate on mainnet, against as many different pools as possible.
- A problem is reported as an issue that names the candidate tag it was found on. Many problems that surface in the UI originate in `sv2-apps`, where the issue then belongs.
- Maintainers decide whether a reported problem blocks the release. A regression from the previous release blocks it, and so does anything that risks lost work or funds. Everything else moves to the next milestone.
- The period ends after 7 days without an open blocking problem.

### Fixing a Blocking Problem

1. **Fix on `main`:** Merge the fix on `main` first, through a regular PR.
2. **Backport:** Open a PR against `release/vX.Y.Z` that cherry-picks the fix. If `main` has changed the same code since the branch was created, adapt the fix in this PR. A fix that only applies to the release branch still has to be checked against `main`, and ported there if `main` is affected.
3. **Cut the Next Candidate:** Repeat steps 3 to 7 of [Cutting a Release Candidate](#cutting-a-release-candidate) with the next `rc.N`. When the fix is in `sv2-apps` or `stratum`, the next `sv2-apps` candidate is published first, and step 4 pins its images.
4. **Restart the Test Period:** A new candidate starts a new 7 days.

### Final Release

Once the test period ends, and the `sv2-apps` release is published:

1. **Pin the SV2 UI Image:** In `README.md`, set the tag of `stratumv2/sv2-ui` to `vX.Y.Z` in every `docker run` command. Commit as `pin sv2-ui release image to vX.Y.Z`.
2. **Pin the SV2 Applications Images:** In `shared/src/images.ts`, set every image to the tag of the `sv2-apps` release, followed by its multi-arch index digest. Update the "Docker Images Used" section of `README.md` to match, and commit as `pin sv2-apps images to vA.B.C`.
3. **Push Release Branch:** These two commits are all that separates the release from the last candidate, and CI has to pass on them.
4. **Create GitHub Release:** Once CI passes on the release branch, create the `vX.Y.Z` tag on it, generate the release notes, and publish the release. Publishing triggers the Docker workflow, which runs the config compatibility check again and pushes the multi-arch image as `stratumv2/sv2-ui:vX.Y.Z` and `stratumv2/sv2-ui:latest`.

### Patch Releases

A patch release follows the same process, with these differences:

- Its release branch is created from the tag of the release it patches, not from `main`.
- It only takes fixes. Each one is merged on `main` first and then backported, as in [Fixing a Blocking Problem](#fixing-a-blocking-problem).
- Its test period lasts at least 48 hours, and has to include a confirmation of the fix by whoever reported the problem.
- A patch release that only moves to a `sv2-apps` patch release pins the candidate images of that release, and shares its test period.

A fix for a vulnerability that has to stay private until it ships does not go
through a public candidate, which would disclose it. It is tested privately by
the maintainers and released directly.

## Versioning

SV2 UI is released as a whole, under a single `vX.Y.Z` version carried by the git
tag and the Docker image tag. It is independent from the `sv2-apps` version: for
example, SV2 UI `v0.7.0` runs the `sv2-apps` `v0.8.0` images. The `version` fields
in the `package.json` files are not part of the release and are not bumped.

The version is changed under the following criteria:
- If a release includes only bug fixes and minor improvements, then `Z` is bumped.
- If a release includes new features, or moves to a new `sv2-apps` release, then `Y` is bumped.
- If a release marks a major milestone (e.g., significant architectural changes or breaking changes to the setup), then `X` is bumped.

## Docker Images

- `stratumv2/sv2-ui:main` is published on every push to `main`, and runs the `sv2-apps` `:main` images.
- `stratumv2/sv2-ui:vX.Y.Z-rc.N` is published with each release candidate, and runs the pinned `sv2-apps` candidate images.
- `stratumv2/sv2-ui:vX.Y.Z` and `stratumv2/sv2-ui:latest` are published with each release, and run the pinned `sv2-apps` release images.

## Tags and Branches

- Changes to `main` branch MUST be added through a merge commit.
- The `main` branch is the default branch and it is always active.
- The `main` branch is protected and requires a pull request to merge changes
  with at least 1 approval.
- Each release is tagged with the version number of the release, and its
  `release/vX.Y.Z` branch is kept for future reference or fixes.
- Each release candidate is tagged `vX.Y.Z-rc.N` on the release branch of its
  release.
- Changes to a release branch are added through a pull request against it. The
  one exception is the pin commits this document lists for a release candidate
  and for the final release, which maintainers push directly.
