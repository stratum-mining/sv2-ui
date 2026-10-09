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

Usually the release process is as follows:

1. **Run Checks:** Make sure CI is green on `main`.
2. **Create Release Branch:** Create `release/vX.Y.Z` from the `main` branch.
3. **Pin the SV2 UI Image:** In `README.md`, replace `stratumv2/sv2-ui:main` with `stratumv2/sv2-ui:vX.Y.Z` in every `docker run` command. Commit as `pin sv2-ui release image to vX.Y.Z`.
4. **Pin the SV2 Applications Images:** In `shared/src/images.ts`, replace every `:main` image with the tag of the `sv2-apps` release this version ships with, followed by its multi-arch index digest (e.g. `stratumv2/translator_sv2:v0.8.0@sha256:...`). `docker buildx imagetools inspect <image>:<tag>` prints the digest. Update the "Docker Images Used" section of `README.md` to match, and commit as `pin sv2-apps images to vA.B.C`.
5. **Push Release Branch:** CI runs on pushes to `release/v*`, including the config compatibility check against the pinned images.
6. **Create GitHub Release:** Create the `vX.Y.Z` tag on the release branch, generate the release notes, and publish the release. Publishing triggers the Docker workflow, which runs the config compatibility check again and pushes the multi-arch image as `stratumv2/sv2-ui:vX.Y.Z` and `stratumv2/sv2-ui:latest`.

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
- `stratumv2/sv2-ui:vX.Y.Z` and `stratumv2/sv2-ui:latest` are published with each release, and run the pinned `sv2-apps` release images.

## Tags and Branches

- Changes to `main` branch should be added through a merge commit.
- The `main` branch is the default branch and it is always active.
- The `main` branch is protected and requires a pull request to merge changes
  with at least 1 approval.
- Each release is tagged with the version number of the release, and its
  `release/vX.Y.Z` branch is kept for future reference or fixes.
