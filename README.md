# Yorkie JavaScript SDK

[![codecov](https://codecov.io/gh/yorkie-team/yorkie-js-sdk/branch/main/graph/badge.svg)](https://codecov.io/gh/yorkie-team/yorkie-js-sdk)

The Yorkie JavaScript SDK implements the client-side libraries.

## How to use JS SDK

To get started using Yorkie JavaScript SDK, see: https://yorkie.dev/docs/js-sdk

## How yorkie-js-sdk works

yorkie-js-sdk uses gRPC-web for communicating with Yorkie Server built on gRPC.

```
 +--Browser--+           +--Envoy---------+         +--Yorkie-----+
 |           |           |                |         |             |
 | gRPC-web  <- HTTP1.1 -> gRPC-web proxy <- HTTP2 -> gRPC server |
 |           |           |                |         |             |
 +-----------+           +----------------+         +-------------+
```

For more details: https://grpc.io/blog/state-of-grpc-web/

## Building and Testing the SDK

### Building yorkie-js-sdk

For building yorkie-js-sdk, You'll first need Node.js installed(Node.js version 16+ and npm version 7.10+ are required).

```bash
# install packages
$ npm install

# build
$ npm run build
```

For generating proto messages and the service client stub classes with protoc and the protoc-gen-grpc-web.

How to install protoc-gen-grpc-web: https://github.com/grpc/grpc-web#code-generator-plugin

```bash
# generate proto messages and the service client stub classes
$ npm run build:proto
```
> Primary "source of truth" location of protobuf message is in [yorkie](https://github.com/yorkie-team/yorkie/tree/main/api). We manage the messages in the repository.

### Testing yorkie-js-sdk with Envoy, Yorkie and MongoDB.

Start MongoDB, Yorkie and Envoy proxy in a terminal session.

```bash
$ docker-compose -f docker/docker-compose.yml up --build -d
```

Start the test in another terminal session.

```bash
$ npm run test
```

To get the latest server locally, run the command below then restart containers again:

```bash
$ docker pull yorkieteam/yorkie:latest
$ docker-compose -f docker/docker-compose.yml up --build -d
```

### Starting co-editing example with CodeMirror

Start MongoDB, Yorkie and Envoy proxy in a terminal session.

```bash
$ docker-compose -f docker/docker-compose.yml up --build -d
```

Start the webpack-dev-server in another terminal session.

```bash
$ npm run dev
```

Open the co-editing example page served by webpack-dev-server in your browser.

```bash
$ open http://0.0.0.0:9000/
```

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for details on submitting patches and the contribution workflow.


## Contributors ✨

Thanks goes to these incredible people:

<a href="https://github.com/yorkie-team/yorkie-js-sdk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yorkie-team/yorkie-js-sdk" />
</a>
