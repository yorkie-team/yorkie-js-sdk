import * as grpcWeb from 'grpc-web';

import * as src_api_yorkie_pb from '../../src/api/yorkie_pb';


export class YorkieClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  activateClient(
    request: src_api_yorkie_pb.ActivateClientRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.ActivateClientResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.ActivateClientResponse>;

  deactivateClient(
    request: src_api_yorkie_pb.DeactivateClientRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.DeactivateClientResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.DeactivateClientResponse>;

  updateMetadata(
    request: src_api_yorkie_pb.UpdateMetadataRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.UpdateMetadataResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.UpdateMetadataResponse>;

  attachDocument(
    request: src_api_yorkie_pb.AttachDocumentRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.AttachDocumentResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.AttachDocumentResponse>;

  detachDocument(
    request: src_api_yorkie_pb.DetachDocumentRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.DetachDocumentResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.DetachDocumentResponse>;

  watchDocuments(
    request: src_api_yorkie_pb.WatchDocumentsRequest,
    metadata?: grpcWeb.Metadata
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.WatchDocumentsResponse>;

  pushPull(
    request: src_api_yorkie_pb.PushPullRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.PushPullResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.PushPullResponse>;

  fetchHistory(
    request: src_api_yorkie_pb.FetchHistoryRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.FetchHistoryResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.FetchHistoryResponse>;

}

export class ClusterClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  broadcastEvent(
    request: src_api_yorkie_pb.BroadcastEventRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.RpcError,
               response: src_api_yorkie_pb.BroadcastEventResponse) => void
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.BroadcastEventResponse>;

}

export class YorkiePromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  activateClient(
    request: src_api_yorkie_pb.ActivateClientRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.ActivateClientResponse>;

  deactivateClient(
    request: src_api_yorkie_pb.DeactivateClientRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.DeactivateClientResponse>;

  updateMetadata(
    request: src_api_yorkie_pb.UpdateMetadataRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.UpdateMetadataResponse>;

  attachDocument(
    request: src_api_yorkie_pb.AttachDocumentRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.AttachDocumentResponse>;

  detachDocument(
    request: src_api_yorkie_pb.DetachDocumentRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.DetachDocumentResponse>;

  watchDocuments(
    request: src_api_yorkie_pb.WatchDocumentsRequest,
    metadata?: grpcWeb.Metadata
  ): grpcWeb.ClientReadableStream<src_api_yorkie_pb.WatchDocumentsResponse>;

  pushPull(
    request: src_api_yorkie_pb.PushPullRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.PushPullResponse>;

  fetchHistory(
    request: src_api_yorkie_pb.FetchHistoryRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.FetchHistoryResponse>;

}

export class ClusterPromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: any; });

  broadcastEvent(
    request: src_api_yorkie_pb.BroadcastEventRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<src_api_yorkie_pb.BroadcastEventResponse>;

}

