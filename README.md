# yorkie-js-sdk

## Build yorkie-js-sdk


```
# install packages
npm install

# build
npm run build
```

For generating proto messages and the service client stub classes with protoc and the protoc-gen-grpc-web.
```
# make sure both executable(protoc, protoc-gen-grpc-web) are discoverable from your PATH.
sudo mv ~/Downloads/protoc-gen-grpc-web-1.0.7-darwin-x86_64 /usr/local/bin/protoc-gen-grpc-web
chmod +x /usr/local/bin/protoc-gen-grpc-web

# generate proto messages and the service client stub classes
npm run proto
```
