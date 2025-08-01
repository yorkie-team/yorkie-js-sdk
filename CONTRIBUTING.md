# Contributing

## How to contribute

Yorkie is Apache 2.0 licensed and accepts contributions via GitHub pull requests. This document outlines some of the
conventions on commit message formatting, contact points for developers, and other resources to help get contributions
into Yorkie.

### Contacts

If you have any questions along the way, please don’t hesitate to ask us

- Discord: [Yorkie Discord](https://discord.com/invite/MVEAwz9sBy).

### Getting started

- Fork the repository on GitHub
- Read
  the [CONTRIBUTING.md](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/CONTRIBUTING.md#building-yorkie-js-sdk)
  for build instructions

## Contribution flow

This is a rough outline of what a contributor's workflow looks like:

- Create a topic branch from where to base the contribution. This is usually main
- Make commits of logical units
- Make sure commit messages are in the proper format
- Push changes in a topic branch to a personal fork of the repository
- Submit a pull request to yorkie-team/yorkie-js-sdk
- The PR must receive a LGTM from maintainers

Thanks for contributing!

## Building and Testing the SDK

### Building yorkie-js-sdk

For building yorkie-js-sdk, You'll first need Node.js installed(Node.js version 18+ and pnpm version 9.6+ are required).

- [Node.js](https://nodejs.org/en) (version 18+)
- [pnpm](https://pnpm.io/) (version 9.6+)

```bash
# install packages

# In the root directory of the repository.
$ pnpm i

# build

# In the root directory of the repository.
$ pnpm sdk build
```

To generate proto messages, we use protoc-gen-connect-es, which is a code generator plugin for Protocol Buffer compilers, like buf and protoc. It generates both clients and server definitions from Protocol Buffer schema.

For more details, see [@connectrpc/protoc-gen-connect-es](https://github.com/connectrpc/connect-es/tree/main/packages/protoc-gen-connect-es).

```bash
# generate proto messages and the service client stub classes

# In the root directory of the repository.
$ pnpm sdk build:proto
```

> Primary "source of truth" location of protobuf message is
> in [yorkie](https://github.com/yorkie-team/yorkie/tree/main/api). We manage the messages in the repository.

### Testing yorkie-js-sdk with Yorkie and MongoDB.

Start MongoDB, Yorkie in a terminal session.

```bash
$ docker compose -f docker/docker-compose.yml up --build -d
```

Start the test in another terminal session.

```bash
# In the root directory of the repository.
$ pnpm sdk test
```

To get the latest server locally, run the command below then restart containers again:

```bash
$ docker pull yorkieteam/yorkie:latest
$ docker compose -f docker/docker-compose.yml up --build -d
```

To print specific console logs, delete the line `return false` in the `onConsoleLog()` function within [`vitest.config.ts`](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/vitest.config.ts#L16).

```ts
export default defineConfig({
  test: {
    include: ['**/*_{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/bench/*'],
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'text-summary'],
    },
    onConsoleLog() {
      return false; // <<------ delete here.
    },
    environment: 'custom-jsdom',
    globals: true,
    testTimeout: isCI ? 5000 : Infinity,
  },
  plugins: [tsconfigPaths()],
});
```

To run only specific suites or tests, use `.only` and execute the following command with the path to the desired test file.
Refer to [Test Filtering](https://vitest.dev/guide/filtering#selecting-suites-and-tests-to-run) in `vitest` for more details:

```bash
# In the root directory of the repository.
$ pnpm sdk test {test file path} # e.g. pnpm sdk test integration/tree_test.ts
```

### Starting co-editing example with CodeMirror

Start MongoDB and Yorkie in a terminal session.

```bash
$ docker compose -f docker/docker-compose.yml up --build -d
```

Start the webpack-dev-server in another terminal session.

```bash
# In the root directory of the repository.
$ pnpm sdk dev
```

Open the co-editing example page served by webpack-dev-server in your browser.

```bash
$ open http://0.0.0.0:9000/
```

### Code style

In order to format the code, we use [Husky](https://github.com/typicode/husky) to implement git hooks
and [Prettier](https://github.com/prettier/prettier)

### Format of the commit message

We follow a rough convention for commit messages that is designed to answer two questions: what changed and why. The
subject line should feature the what and the body of the commit should describe the why.

```
Remove the synced seq when detaching the document

To collect garbage like CRDT tombstones left on the document, all
the changes should be applied to other replicas before GC. For this
, if the document is no longer used by this client, it should be
detached.
```

The first line is the subject and should be no longer than 70 characters, the second line is always blank, and other
lines should be wrapped at 80 characters. This allows the message to be easier to read on GitHub as well as in various
git tools.

## Contributor License Agreement

We require that all contributors sign our Contributor License Agreement ("CLA") before we can accept the contribution.

### Signing the CLA

Open a pull request ("PR") to any of our open source projects to sign the CLA. A bot will comment on the PR asking you
to sign the CLA if you haven't already.

Follow the steps given by the bot to sign the CLA. This will require you to log in with GitHub. We will only use this
information for CLA tracking. You only have to sign the CLA once. Once you've signed the CLA, future contributions to
the project will not require you to sign again.

### Why Require a CLA?

Agreeing to a CLA explicitly states that you are entitled to provide a contribution, that you cannot withdraw permission
to use your contribution at a later date, and that Yorkie Team has permission to use your contribution.

This removes any ambiguities or uncertainties caused by not having a CLA and allows users and customers to confidently
adopt our projects. At the same time, the CLA ensures that all contributions to our open source projects are licensed
under the project's respective open source license, such as Apache-2.0 License.

Requiring a CLA is a common and well-accepted practice in open source. Major open source projects require CLAs such as
Apache Software Foundation projects, Facebook projects, Google projects, Python, Django, and more. Each of these
projects remains licensed under permissive OSS licenses such as MIT, Apache, BSD, and more.
