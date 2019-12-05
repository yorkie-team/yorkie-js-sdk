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
npm run build
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
```
# make sure both executable(protoc, protoc-gen-grpc-web) are discoverable from your PATH.
sudo mv ~/Downloads/protoc-gen-grpc-web-1.0.7-darwin-x86_64 /usr/local/bin/protoc-gen-grpc-web
chmod +x /usr/local/bin/protoc-gen-grpc-web

# generate proto messages and the service client stub classes
npm run proto
```
