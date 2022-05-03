import * as grpcWeb from 'grpc-web';

import * as yorkie_pb from './yorkie_pb';


export class YorkieClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  activateClient(
    request: yorkie_pb.ActivateClientRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.ActivateClientResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.ActivateClientResponse>;

  deactivateClient(
    request: yorkie_pb.DeactivateClientRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.DeactivateClientResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.DeactivateClientResponse>;

  updateMetadata(
    request: yorkie_pb.UpdateMetadataRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.UpdateMetadataResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.UpdateMetadataResponse>;

  attachDocument(
    request: yorkie_pb.AttachDocumentRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.AttachDocumentResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.AttachDocumentResponse>;

  detachDocument(
    request: yorkie_pb.DetachDocumentRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.DetachDocumentResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.DetachDocumentResponse>;

  watchDocuments(
    request: yorkie_pb.WatchDocumentsRequest,
    metadata?: grpcWeb.Metadata
  ): grpcWeb.ClientReadableStream<yorkie_pb.WatchDocumentsResponse>;

  pushPull(
    request: yorkie_pb.PushPullRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.PushPullResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.PushPullResponse>;

  listChanges(
    request: yorkie_pb.ListChangesRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: yorkie_pb.ListChangesResponse) => void
  ): grpcWeb.ClientReadableStream<yorkie_pb.ListChangesResponse>;

}

export class YorkiePromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  activateClient(
    request: yorkie_pb.ActivateClientRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.ActivateClientResponse>;

  deactivateClient(
    request: yorkie_pb.DeactivateClientRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.DeactivateClientResponse>;

  updateMetadata(
    request: yorkie_pb.UpdateMetadataRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.UpdateMetadataResponse>;

  attachDocument(
    request: yorkie_pb.AttachDocumentRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.AttachDocumentResponse>;

  detachDocument(
    request: yorkie_pb.DetachDocumentRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.DetachDocumentResponse>;

  watchDocuments(
    request: yorkie_pb.WatchDocumentsRequest,
    metadata?: grpcWeb.Metadata
  ): grpcWeb.ClientReadableStream<yorkie_pb.WatchDocumentsResponse>;

  pushPull(
    request: yorkie_pb.PushPullRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.PushPullResponse>;

  listChanges(
    request: yorkie_pb.ListChangesRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<yorkie_pb.ListChangesResponse>;

}

