# AGENTS.md

This file provides guidance for agents working on this repository. It is committed to the repository, which means agents from all contributors follow the same conventions.

Contributors are free to add their own custom guidance for their agents via `AGENTS_CUSTOM.md`, which is NOT committed to the repository.

Aside from guidelines on these files, also always take into consideration `CONTRIBUTING.md`, `RELEASE.md` and `README.md`.

Pay special attention to `CONTRIBUTING.md` when crafting git commits.

## Tests

Whenever adding or modifying tests, look for patterns and fixtures already established on other tests. Unit tests run on `node:test` and sit next to the code they cover, as `*.test.ts`.

Whenever a test covers code that consumes JDC or tProxy monitoring data, build its fixtures from representative upstream payloads, as `docs/monitoring-api-compatibility.md` asks, so that a change in the upstream response shape shows up in the tests.

## Generated files

`src/types/api-generated.ts` is generated from `shared/openapi.json` by `npm run generate:types`, and `shared/openapi.json` is a copy of the schema published by `sv2-apps`. Never edit either by hand: copy the schema from `sv2-apps`, regenerate, and commit both together.

## Cross-repo development

While [`stratum`](https://github.com/stratum-mining/stratum) contains low-level libraries and [`sv2-apps`](https://github.com/stratum-mining/sv2-apps) contains the applications built on them, `sv2-ui` generates configs for, runs, and monitors two of those applications, JD Client (JDC) and Translator Proxy (tProxy), as Docker containers.

Unlike `stratum` and `sv2-apps`, which are linked by the `stratum-core` crate, `sv2-ui` shares no code with `sv2-apps`. The two repositories are linked by three contracts instead:

- **Docker images.** `shared/src/images.ts` selects the `sv2-apps` images. On `main` they track the `:main` tags, so a breaking change merged on `sv2-apps` reaches `sv2-ui` without any change on this repository. Release branches pin release tags and digests instead (see `RELEASE.md`).
- **Config files.** `server/src/config-generator.ts` writes the TOML files that JDC and tProxy load. `npm run check:sv2-app-config` pulls the selected images and checks that they accept the generated configs. CI runs it on every PR.
- **Monitoring API.** `shared/openapi.json` is a copy of `stratum-apps/src/monitoring/openapi.json` from `sv2-apps`, and the dashboard's API types are generated from it. `docs/monitoring-api-compatibility.md` describes how to classify and absorb changes to it.

`sv2-apps` CI opens an issue on this repository whenever the config examples or the monitoring API schema change on its `main` branch, labelled `jdc-tproxy-config-change` or `monitoring-api-change`. Whenever working on one of those issues, start from the linked `sv2-apps` PR, and check whether `main` is already broken by it.

A `sv2-ui` change that depends on a `sv2-apps` change not yet merged cannot pass the config compatibility check, because the check runs against the published `:main` images. Link the `sv2-apps` PR in the description: the `sv2-ui` PR can only land once the `sv2-apps` one is merged and its `:main` images are published.

## Code comments

A comment block above a declaration describes the declaration that follows it, so inserting a new declaration directly below one steals it: the new declaration inherits a description written for something else, and the one it was written for is left with nothing. With a `/** */` block TypeScript makes that binding literal, and editors show the stolen doc on hover over the new declaration; with a plain `//` block nothing binds at all, which only makes the result easier to miss. Both forms are used here. Whenever adding a declaration to an existing file, look at what sits immediately above the insertion point, and whenever lifting a helper into a file from somewhere else, look again once it has landed.

A single uninterrupted run of comment lines carrying two separate summaries is the signature of this mistake, the second summary reading as the start of a fresh comment rather than a continuation of the first. It is cheap to introduce and easy to miss in review, because nothing fails to type-check and no lint catches it.

## Bug patching

Whenever patching bugs, always keep me informed about potential side-effect implications on non-trivial aspects of the project functionality (e.g.: the security of the backend, which holds the Docker socket and the operator's credentials; the accuracy of the dashboard numbers; compatibility with the selected `sv2-apps` images; new bugs or vulnerabilities).

Whenever writing documentation around bug fixes, always write the comment assuming the reader is simply trying to understand the code as is, not the past history of bugs that existed on that code.

## PR reviews

Whenever helping me review PRs, don't restrict the output to an analysis of the PR. Also help me understand the PR progressively across two axis:

- conceptual (taking issues and other related PRs into consideration)
- commit history

While listing findings, for each finding, give me a draft comment and the file/line where it would be appropriate to drop it. Also mention the finding severity, and whether you believe it's a blocker or not. This is deliberately designed to keep human reviewers on the loop, as opposed to blindly copypasting a huge "clanker review" body of text without ever looking into what each finding means.

Judge a PR against the problem and the expected outcome of the issues it closes. Everything else an issue lists, including suggested approaches and "Acceptance criteria" sections, is context: a PR that reaches the outcome another way is not a finding, as long as its description explains why. Flag a divergence only when part of the expected outcome is left unsolved, and say which part.

## Drafting issues

SRI repositories try to leverage github subissue clustering. When helping humans draft new github issues, always look for issues that might be either adjacent, correlated, duplicate. Also take into consideration umbrella issues that have already been closed. A security, correctness or robustness issue that falls within one of the area trackers listed under "Triaging audit findings" belongs under that tracker, with its area label.

Many problems that surface in the UI originate in `sv2-apps`: a JDC or tProxy behavior, a config field, a monitoring API response. Search `sv2-apps` issues too, and say whether the fix belongs there, here, or both. An issue here that cannot progress until `sv2-apps` changes gets the `awaiting sv2-apps feature` label.

You always draft github issues under human supervision. Your role here is to help human SRI contributors reason about the issues being reported, not create github noise.

Describe the problem and the outcome a fix must guarantee, observable from outside the code. Implementation and test ideas are suggestions for whoever picks the issue up, so mark them as non-binding: written as requirements, they make reviewers flag every PR that solves the problem another way.

## Triaging audit findings

SRI maintainers triage findings from the private Loupe audit repository `project-loupe/audit-sv2-ui` into public sv2-ui issues, so the work is tracked where it happens. Draft them from `.github/ISSUE_TEMPLATE/audit-finding.md`, and:

- Before publishing, check with the maintainer whether the finding is safe to disclose. A severe finding that can be exploited remotely stays in Loupe until its fix has landed.
- Open one issue per defect, listing every Loupe finding that reports it: Loupe often reports the same defect more than once.
- Check the frontend (`src/`), the backend (`server/`) and `shared/` for the same defect, and record the ones that are not affected along with the reason. Validation and parsing often exist on both sides of the API, so a defect in one can have a twin in the other.
- If the defect comes from something `sv2-ui` takes from `sv2-apps` (a key, a config default, a monitoring field), say so, and check whether `sv2-apps` needs its own issue.
- Make the issue a sub-issue of exactly one area tracker, and apply that tracker's area label. Trackers are split by area of the code rather than by layer, so a defect whose fix spans `src/` and `server/` still has a single home: the area that owns the invariant the fix restores. Each tracker carries the `tracker` label plus its area label:
  - `area:auth`, authentication and sessions: credential storage, login sessions, recovery keys, and their UI;
  - `area:http-boundary`, request origin and HTTP boundary: origin and host checks, and what the backend serves back from upstream APIs;
  - `area:config-files`, config directory and file handling: the config directory, managed and saved files, files read from the host, and what gets mounted into containers;
  - `area:docker`, Docker orchestration and generated configs: the Docker connection, container lifecycle, generated TOML and Noise keys, and the config compatibility check;
  - `area:logs`, logs, diagnostics and active-pool detection: container log reads and downloads, diagnostics, and pool detection from logs;
  - `area:dashboard`, dashboard metrics: monitoring API reads, aggregation, persisted metrics, and charts;
  - `area:setup`, setup and settings flows: the setup wizard, settings editing, pool and identity forms, and uploads.
- Look trackers up by the `tracker` label rather than by issue number. If none of them covers the defect, or the one it belongs to does not exist on GitHub, stop and tell the maintainer instead of stretching another tracker's scope or leaving the issue without a tracker. Propose the tracker it needs: title, area label, the code it covers, and the open issues that would move under it. The maintainer creates trackers and labels, and a new tracker comes with a PR that adds it to the list above, so the list keeps matching GitHub.
- Leave PR grouping to whoever picks the issue up. If two issues should land together, say why under "Related issues and PRs".
- Record progress in dated comments rather than by editing the issue body.

An issue and every Loupe finding it lists close together, with the PR that completes the fix. A PR that fixes only part of it references them with `ref` instead of `Closes`.

## Ponytail

If the plugin is not already installed into the coding agent harness, make sure to follow [Ponytail](https://ponytail.dev/) rules. But avoid installing it as a plugin, unless explicitly instructed to do so. This is only a repository-wide convention. Also avoid writing comments that reference "ponytail" in a compressed and implicit way, prefer explaining the actual rationale instead.
