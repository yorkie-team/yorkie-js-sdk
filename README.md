# Yorkie JavaScript SDK

[![codecov](https://codecov.io/gh/yorkie-team/yorkie-js-sdk/branch/master/graph/badge.svg)](https://codecov.io/gh/yorkie-team/yorkie-js-sdk)

The Yorkie JavaScript SDK implements the client-side libraries.

## How to use JS SDK

To get started using Yorkie JavaScript SDK, see: https://yorkie.dev/docs/master/js-sdk

## How yorkie-js-sdk works

yorkie-js-sdk uses gRPC-web for communicating with Yorkie agent built on gRPC.

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

```bash
# install packages
npm install

# build
npm run build
```

For generating proto messages and the service client stub classes with protoc and the protoc-gen-grpc-web.

How to install protoc-gen-grpc-web: https://github.com/grpc/grpc-web#code-generator-plugin

```bash
# generate proto messages and the service client stub classes
npm run build:proto
```

### Testing yorkie-js-sdk with Envoy, Yorkie and MongoDB.

Start MongoDB, Yorkie and Envoy proxy in a terminal session.

```bash
cd docker
docker-compose up
```

Start the test in another terminal session.

```bash
npm run test
```

### Starting co-editing example with CodeMirror

Start MongoDB, Yorkie and Envoy proxy in a terminal session.

```bash
cd docker
docker-compose up
```

Start the webpack-dev-server in another terminal session.

```bash
npm run start
```

Open the co-editing example page served by webpack-dev-server in your browser.

```bash
open http://0.0.0.0:9000/
```

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for details on submitting patches and the contribution workflow.
