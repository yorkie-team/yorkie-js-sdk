# yorkie-js-sdk

## Layout

yorkie-js-sdk uses gRPC-web for communicating with Yorkie agent built on gRPC.

```
 +--Browser--+           +--Envoy---------+         +--Yorkie-----+
 |           |           |                |         |             |
 | gRPC-web  <- HTTP1.1 -> gRPC-web proxy <- HTTP2 -> gRPC server |
 |           |           |                |         |             |
 +-----------+           +----------------+         +-------------+
```

For more details: https://grpc.io/blog/state-of-grpc-web/

## Build yorkie-js-sdk

```bash
cd ./yorkie-js-sdk

# install packages
npm install

# build
npm run build:dev
```

## Test yorkie-js-sdk with yorkie agent

```bash
# start mongoDB
./yorkie/docker-compose up

# start yorkie agent
./yorkie/bin/yorkie agent

# start envoy proxy
./yorkie-js-sdk/docker-compose up --build

# test
./yorkie-js-sdk/npm run test
```

For generating proto messages and the service client stub classes with protoc and the protoc-gen-grpc-web.

How to install protoc-gen-grpc-web: https://github.com/grpc/grpc-web#code-generator-plugin

```bash
# generate proto messages and the service client stub classes
npm run build:proto
```

## Test examples

```bash
# start mongoDB
./yorkie/docker-compose up

# start yorkie agent
./yorkie/bin/yorkie agent

# start envoy proxy
./yorkie-js-sdk/docker-compose up --build

# test
cd ./yorkie-js-sdk
npm run start:dev
```
