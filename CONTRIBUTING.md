<!-- omit in toc -->
# Contributing to SV2 UI

First off, thanks for taking the time to contribute! ❤️

All types of contributions are encouraged and valued. See the [Table of Contents](#table-of-contents) for different ways to help and details about how this project handles them. Please make sure to read the relevant section before making your contribution. It will make it a lot easier for us maintainers and smooth out the experience for all involved. The community looks forward to your contributions. 🎉

> And if you like the project, but just don't have time to contribute, that's fine. There are other easy ways to support the project and show your appreciation, which we would also be very happy about:
> - Star the project
> - Tweet about it
> - Refer this project in your project's readme
> - Mention the project at local meetups and tell your friends/colleagues

<!-- omit in toc -->
## Table of Contents

- [I Have a Question](#i-have-a-question)
- [What Should I Know Before I Get Started](#what-should-i-know-before-i-get-started)
  - [Important Resources About SV2 UI](#important-resources-about-sv2-ui)
  - [Project Communications](#project-communications)
- [I Want To Contribute](#i-want-to-contribute)
  - [Project Structure](#project-structure)
  - [Contribution workflow](#contribution-workflow)
  - [Monitoring API Schema](#monitoring-api-schema)
  - [SV2 Applications Images and Configs](#sv2-applications-images-and-configs)
  - [Your First Code Contribution](#your-first-code-contribution)


## I Have a Question

> If you want to ask a question, we assume that you have read the documentation available at [stratumprotocol.org/docs](https://stratumprotocol.org).

Best way to ask a question is to hop onto our community [Discord](https://discord.com/invite/fsEW23wFYs). Two most suitable places to post a question are:
- #newbies-qs and
- #dev, for technical questions, suitable for developers building on top of SRI, or contributing to it.

If you then still feel the need to ask a question and need clarification, we recommend the following:

- Open an [Issue](https://github.com/stratum-mining/sv2-ui/issues/new).
- Provide as much context as you can about what you're running into.

We will then take care of the issue as soon as possible.

## What Should I Know Before I Get Started

### Important Resources About SV2 UI

In order to have a better overview about what SV2 UI covers, have a look at the following resources before getting started with contributions.

  - Stratum V2 Protocol [Specifications](https://github.com/stratum-mining/sv2-spec).
    - Studying SV2 specs can take some time and requires effort, but it's the best way to properly understand what SV2 is about and how it's composed.
  - SRI [Getting-started](https://stratumprotocol.org/getting-started/) guide.
    - This can be explored in the meantime of SV2 protocol study, so that it can help getting a general overview about SV2. Moreover, it's the best way to really understand the setups that SV2 UI configures for its users.
  - [SV2 Applications Repository](https://github.com/stratum-mining/sv2-apps).
    - This repository contains the JD Client and Translator Proxy that SV2 UI configures, runs, and monitors.
  - Stratum V2 [Master Degree Thesis](https://github.com/GitGab19/Stratum-V2-Master-Degree-Thesis) (by [@gitgab19](https://github.com/GitGab19/)).
    - This resource can be useful to get some knowledge about Bitcoin mining, pooled mining protocols history, and Stratum V2.
  - Stratum V2 Explained - [Videos Playlist](https://www.youtube.com/playlist?list=PLZXAi8dsUIn0GmElOcmqUtgA5psfFIZoO) (by [@plebhash](https://github.com/plebhash)).
    - This is a series of videos explaining Stratum V2 in depth, which cover the aforementioned topics.

### Project Communications

Most project communications happen in our [Discord](https://discord.gg/fsEW23wFYs) server. Communications related to general development typically happen under [dev](https://discord.com/channels/950687892169195530/958814900770205739) channel.

Discussion about specific codebase work happens in GitHub [issues](https://github.com/stratum-mining/sv2-ui/issues/) and on [pull requests](https://github.com/stratum-mining/sv2-ui/pulls/). For discussions about the applications themselves, see the [SV2 Applications repository](https://github.com/stratum-mining/sv2-apps).

Our dev calls are scheduled every Tuesday at 16:00 UTC. You can see them in the sidebar under Events on Discord and subscribe to them to be notified.

## I Want To Contribute
> When contributing to this project, you must agree that you have authored 100% of the content, that you have the necessary rights to the content and that the content you contribute may be provided under the project license.

### Project Structure
This repository is part of the broader SRI ecosystem. You can contribute to different aspects of Stratum V2:
  - [SV2 UI](https://github.com/stratum-mining/sv2-ui) (this repository)
    - This repo contains the setup wizard and monitoring dashboard that run the miner-side SV2 applications (JD Client and Translator Proxy) as Docker containers. All packages belong to a single npm workspace rooted at the repository root:
      - `src/` - React frontend: setup wizard, dashboard, and settings
      - `server/` - Express backend: authentication, config generation, Docker orchestration, and log diagnostics
      - `shared/` - Code used by both the frontend and the backend (validation, pool presets, `sv2-apps` image selection), and the monitoring API schema
      - `docs/` - Design notes, such as the monitoring API contract
  - [SV2 Applications](https://github.com/stratum-mining/sv2-apps)
    - This repo contains the pool and miner applications (Pool, Job Declarator Server, Job Declarator Client, Translator Proxy) built on top of SRI.
  - [Stratum V2 Reference Implementation](https://github.com/stratum-mining/stratum)
    - This repo contains the core SV2 protocol implementation, libraries, and primitives written in Rust.
  - [Stratum V2 Specifications](https://github.com/stratum-mining/sv2-spec)
    - This repo contains the entire SV2 protocol specifications.
  - [SRI website - stratumprotocol.org](https://github.com/stratum-mining/stratumprotocol.org)
    - This repo manages our website, containing docs, specs, and getting-started guides.

### Contribution workflow

The SRI project follows an open contributor model, where anyone is welcome to contribute through reviews, documentation, testing, and patches. Follow these steps to contribute:

1. **Fork the Repository**

2. **Create a Branch**

3. **Make Your Changes**

    These guidelines should be kept in mind:
    - Use Node.js 24, the version CI and the Docker image use. See [README.md](README.md#development) to run the app locally.
    - When touching TypeScript code, document non-obvious behavior with concise comments. Avoid unnecessary verbosity.
    - When adding or modifying features, check whether some corresponding documentation on .md files needs to be updated accordingly.
    - Make sure to run what CI runs on your changes: `npm run lint`, `npm run typecheck`, `npm run test:all` and `npm run build:all`.
    - When changing the generated configs or the selected `sv2-apps` images, also run `npm run check:sv2-app-config`. It needs a running Docker daemon, since it pulls the selected images and starts them against the generated configs.

4. **Commit Your Changes**

    These guidelines should be kept in mind:
    - Progressive commit history, with clear separation of concerns.
    - Avoid individual commits that address specific review findings, which breaks commit history cohesion. Always fold review findings into the original commit.
    - Commit messages should provide a clear and concise explanation of the solution's rationale.
    - If the specific commit closes some specific github issue, include the issue URL in the commit message.
    - If possible, sign your commits with your GPG key.
    - Writing style: [chris.beams.io/posts/git-commit](https://chris.beams.io/posts/git-commit/)
    - Structure: [conventionalcommits.org](https://www.conventionalcommits.org/)

5. **Submit a Pull Request**

    Once you're satisfied with your changes, submit a pull request to this repository. Provide a clear and concise description of the changes you've made. If your pull request addresses an existing issue, reference the issue number in the description. If it depends on a `sv2-apps` change that is not merged yet, link that PR too. Every PR must be opened against the `main` branch.

6. **Review and Iterate**

7. **Merge and Close**

    Once your pull request has been approved and all discussions have been resolved, a project maintainer will merge your changes into the `main` branch. Your contribution will then be officially part of the project. The pull request will be closed, marking the completion of your contribution.

### Monitoring API Schema

The dashboard reads the monitoring APIs that JD Client and Translator Proxy expose. Their schema is generated by `sv2-apps` in `stratum-apps/src/monitoring/openapi.json`, and this repository keeps a copy of it in `shared/openapi.json`. TypeScript types and React Query hooks are generated from that copy into `src/types/api-generated.ts`, which is never edited by hand.

When `sv2-apps` changes the schema on its `main` branch, its CI opens an issue here labelled `monitoring-api-change`. To pick it up:

1. Copy the new `openapi.json` from `sv2-apps` into `shared/openapi.json`.
2. Regenerate the types with `npm run generate:types`.
3. Classify the change and adapt the code as described in the [Monitoring API contract](docs/monitoring-api-compatibility.md).
4. Commit the schema and the generated types together.

### SV2 Applications Images and Configs

`shared/src/images.ts` selects the `sv2-apps` Docker images that SV2 UI runs. On `main` they always track the `:main` tags; only release branches pin them to release tags (see [RELEASE.md](RELEASE.md)).

`server/src/config-generator.ts` writes the TOML configs those images load. When `sv2-apps` changes the JD Client or Translator Proxy config examples on its `main` branch, its CI opens an issue here labelled `jdc-tproxy-config-change`. Review the config generator against the new examples, and run `npm run check:sv2-app-config` to confirm the selected images still accept the generated configs.

### Your First Code Contribution
>In order to contribute, a basic learning about git and github is needed. If you're not familiar with them, have a look at https://docs.github.com/en/get-started/start-your-journey/git-and-github-learning-resources to dig into and learn how to use them.

Unsure where to begin contributing to SV2 UI? You can start by looking through [good first issue](https://github.com/stratum-mining/sv2-ui/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) issues, which should only require a few lines of code, and a test or two.

Another way to better understand where to focus your contribution is by looking at our roadmap: https://github.com/orgs/stratum-mining/projects/5
