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

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md) for details on submitting patches and the contribution workflow.

## Contributors ✨

Thanks goes to these incredible people:

<a href="https://github.com/yorkie-team/yorkie-js-sdk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yorkie-team/yorkie-js-sdk" />
</a>
