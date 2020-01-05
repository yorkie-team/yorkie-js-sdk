import * as grpcWeb from 'grpc-web';

import {
  ActivateClientRequest,
  ActivateClientResponse,
  AttachDocumentRequest,
  AttachDocumentResponse,
  DeactivateClientRequest,
  DeactivateClientResponse,
  DetachDocumentRequest,
  DetachDocumentResponse,
  PushPullRequest,
  PushPullResponse,
  WatchDocumentsRequest,
  WatchDocumentsResponse} from './yorkie_pb';

export class YorkieClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: string; });

  activateClient(
    request: ActivateClientRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.Error,
               response: ActivateClientResponse) => void
  ): grpcWeb.ClientReadableStream<ActivateClientResponse>;

  deactivateClient(
    request: DeactivateClientRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.Error,
               response: DeactivateClientResponse) => void
  ): grpcWeb.ClientReadableStream<DeactivateClientResponse>;

  attachDocument(
    request: AttachDocumentRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.Error,
               response: AttachDocumentResponse) => void
  ): grpcWeb.ClientReadableStream<AttachDocumentResponse>;

  detachDocument(
    request: DetachDocumentRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.Error,
               response: DetachDocumentResponse) => void
  ): grpcWeb.ClientReadableStream<DetachDocumentResponse>;

  watchDocuments(
    request: WatchDocumentsRequest,
    metadata?: grpcWeb.Metadata
  ): grpcWeb.ClientReadableStream<WatchDocumentsResponse>;

  pushPull(
    request: PushPullRequest,
    metadata: grpcWeb.Metadata | undefined,
    callback: (err: grpcWeb.Error,
               response: PushPullResponse) => void
  ): grpcWeb.ClientReadableStream<PushPullResponse>;

}

export class YorkiePromiseClient {
  constructor (hostname: string,
               credentials?: null | { [index: string]: string; },
               options?: null | { [index: string]: string; });

  activateClient(
    request: ActivateClientRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<ActivateClientResponse>;

  deactivateClient(
    request: DeactivateClientRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<DeactivateClientResponse>;

  attachDocument(
    request: AttachDocumentRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<AttachDocumentResponse>;

  detachDocument(
    request: DetachDocumentRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<DetachDocumentResponse>;

  watchDocuments(
    request: WatchDocumentsRequest,
    metadata?: grpcWeb.Metadata
  ): grpcWeb.ClientReadableStream<WatchDocumentsResponse>;

  pushPull(
    request: PushPullRequest,
    metadata?: grpcWeb.Metadata
  ): Promise<PushPullResponse>;

}

