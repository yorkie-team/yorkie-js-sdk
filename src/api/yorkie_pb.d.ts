import * as jspb from 'google-protobuf'

import * as resources_pb from './resources_pb';


export class ActivateClientRequest extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): ActivateClientRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ActivateClientRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ActivateClientRequest): ActivateClientRequest.AsObject;
  static serializeBinaryToWriter(message: ActivateClientRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ActivateClientRequest;
  static deserializeBinaryFromReader(message: ActivateClientRequest, reader: jspb.BinaryReader): ActivateClientRequest;
}

export namespace ActivateClientRequest {
  export type AsObject = {
    clientKey: string,
  }
}

export class ActivateClientResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): ActivateClientResponse;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): ActivateClientResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ActivateClientResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ActivateClientResponse): ActivateClientResponse.AsObject;
  static serializeBinaryToWriter(message: ActivateClientResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ActivateClientResponse;
  static deserializeBinaryFromReader(message: ActivateClientResponse, reader: jspb.BinaryReader): ActivateClientResponse;
}

export namespace ActivateClientResponse {
  export type AsObject = {
    clientKey: string,
    clientId: Uint8Array | string,
  }
}

export class DeactivateClientRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): DeactivateClientRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DeactivateClientRequest.AsObject;
  static toObject(includeInstance: boolean, msg: DeactivateClientRequest): DeactivateClientRequest.AsObject;
  static serializeBinaryToWriter(message: DeactivateClientRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DeactivateClientRequest;
  static deserializeBinaryFromReader(message: DeactivateClientRequest, reader: jspb.BinaryReader): DeactivateClientRequest;
}

export namespace DeactivateClientRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
  }
}

export class DeactivateClientResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): DeactivateClientResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DeactivateClientResponse.AsObject;
  static toObject(includeInstance: boolean, msg: DeactivateClientResponse): DeactivateClientResponse.AsObject;
  static serializeBinaryToWriter(message: DeactivateClientResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DeactivateClientResponse;
  static deserializeBinaryFromReader(message: DeactivateClientResponse, reader: jspb.BinaryReader): DeactivateClientResponse;
}

export namespace DeactivateClientResponse {
  export type AsObject = {
    clientId: Uint8Array | string,
  }
}

export class AttachDocumentRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): AttachDocumentRequest;

  getChangePack(): resources_pb.ChangePack | undefined;
  setChangePack(value?: resources_pb.ChangePack): AttachDocumentRequest;
  hasChangePack(): boolean;
  clearChangePack(): AttachDocumentRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AttachDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: AttachDocumentRequest): AttachDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: AttachDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AttachDocumentRequest;
  static deserializeBinaryFromReader(message: AttachDocumentRequest, reader: jspb.BinaryReader): AttachDocumentRequest;
}

export namespace AttachDocumentRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
    changePack?: resources_pb.ChangePack.AsObject,
  }
}

export class AttachDocumentResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): AttachDocumentResponse;

  getChangePack(): resources_pb.ChangePack | undefined;
  setChangePack(value?: resources_pb.ChangePack): AttachDocumentResponse;
  hasChangePack(): boolean;
  clearChangePack(): AttachDocumentResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AttachDocumentResponse.AsObject;
  static toObject(includeInstance: boolean, msg: AttachDocumentResponse): AttachDocumentResponse.AsObject;
  static serializeBinaryToWriter(message: AttachDocumentResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AttachDocumentResponse;
  static deserializeBinaryFromReader(message: AttachDocumentResponse, reader: jspb.BinaryReader): AttachDocumentResponse;
}

export namespace AttachDocumentResponse {
  export type AsObject = {
    clientId: Uint8Array | string,
    changePack?: resources_pb.ChangePack.AsObject,
  }
}

export class DetachDocumentRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): DetachDocumentRequest;

  getChangePack(): resources_pb.ChangePack | undefined;
  setChangePack(value?: resources_pb.ChangePack): DetachDocumentRequest;
  hasChangePack(): boolean;
  clearChangePack(): DetachDocumentRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DetachDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: DetachDocumentRequest): DetachDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: DetachDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DetachDocumentRequest;
  static deserializeBinaryFromReader(message: DetachDocumentRequest, reader: jspb.BinaryReader): DetachDocumentRequest;
}

export namespace DetachDocumentRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
    changePack?: resources_pb.ChangePack.AsObject,
  }
}

export class DetachDocumentResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): DetachDocumentResponse;

  getChangePack(): resources_pb.ChangePack | undefined;
  setChangePack(value?: resources_pb.ChangePack): DetachDocumentResponse;
  hasChangePack(): boolean;
  clearChangePack(): DetachDocumentResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DetachDocumentResponse.AsObject;
  static toObject(includeInstance: boolean, msg: DetachDocumentResponse): DetachDocumentResponse.AsObject;
  static serializeBinaryToWriter(message: DetachDocumentResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DetachDocumentResponse;
  static deserializeBinaryFromReader(message: DetachDocumentResponse, reader: jspb.BinaryReader): DetachDocumentResponse;
}

export namespace DetachDocumentResponse {
  export type AsObject = {
    clientKey: string,
    changePack?: resources_pb.ChangePack.AsObject,
  }
}

export class WatchDocumentsRequest extends jspb.Message {
  getClient(): resources_pb.Client | undefined;
  setClient(value?: resources_pb.Client): WatchDocumentsRequest;
  hasClient(): boolean;
  clearClient(): WatchDocumentsRequest;

  getDocumentKeysList(): Array<string>;
  setDocumentKeysList(value: Array<string>): WatchDocumentsRequest;
  clearDocumentKeysList(): WatchDocumentsRequest;
  addDocumentKeys(value: string, index?: number): WatchDocumentsRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): WatchDocumentsRequest.AsObject;
  static toObject(includeInstance: boolean, msg: WatchDocumentsRequest): WatchDocumentsRequest.AsObject;
  static serializeBinaryToWriter(message: WatchDocumentsRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): WatchDocumentsRequest;
  static deserializeBinaryFromReader(message: WatchDocumentsRequest, reader: jspb.BinaryReader): WatchDocumentsRequest;
}

export namespace WatchDocumentsRequest {
  export type AsObject = {
    client?: resources_pb.Client.AsObject,
    documentKeysList: Array<string>,
  }
}

export class WatchDocumentsResponse extends jspb.Message {
  getInitialization(): WatchDocumentsResponse.Initialization | undefined;
  setInitialization(value?: WatchDocumentsResponse.Initialization): WatchDocumentsResponse;
  hasInitialization(): boolean;
  clearInitialization(): WatchDocumentsResponse;

  getEvent(): resources_pb.DocEvent | undefined;
  setEvent(value?: resources_pb.DocEvent): WatchDocumentsResponse;
  hasEvent(): boolean;
  clearEvent(): WatchDocumentsResponse;

  getBodyCase(): WatchDocumentsResponse.BodyCase;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): WatchDocumentsResponse.AsObject;
  static toObject(includeInstance: boolean, msg: WatchDocumentsResponse): WatchDocumentsResponse.AsObject;
  static serializeBinaryToWriter(message: WatchDocumentsResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): WatchDocumentsResponse;
  static deserializeBinaryFromReader(message: WatchDocumentsResponse, reader: jspb.BinaryReader): WatchDocumentsResponse;
}

export namespace WatchDocumentsResponse {
  export type AsObject = {
    initialization?: WatchDocumentsResponse.Initialization.AsObject,
    event?: resources_pb.DocEvent.AsObject,
  }

  export class Initialization extends jspb.Message {
    getPeersMapByDocMap(): jspb.Map<string, resources_pb.Clients>;
    clearPeersMapByDocMap(): Initialization;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Initialization.AsObject;
    static toObject(includeInstance: boolean, msg: Initialization): Initialization.AsObject;
    static serializeBinaryToWriter(message: Initialization, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Initialization;
    static deserializeBinaryFromReader(message: Initialization, reader: jspb.BinaryReader): Initialization;
  }

  export namespace Initialization {
    export type AsObject = {
      peersMapByDocMap: Array<[string, resources_pb.Clients.AsObject]>,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    INITIALIZATION = 1,
    EVENT = 2,
  }
}

export class PushPullRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): PushPullRequest;

  getChangePack(): resources_pb.ChangePack | undefined;
  setChangePack(value?: resources_pb.ChangePack): PushPullRequest;
  hasChangePack(): boolean;
  clearChangePack(): PushPullRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullRequest.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullRequest): PushPullRequest.AsObject;
  static serializeBinaryToWriter(message: PushPullRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullRequest;
  static deserializeBinaryFromReader(message: PushPullRequest, reader: jspb.BinaryReader): PushPullRequest;
}

export namespace PushPullRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
    changePack?: resources_pb.ChangePack.AsObject,
  }
}

export class PushPullResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): PushPullResponse;

  getChangePack(): resources_pb.ChangePack | undefined;
  setChangePack(value?: resources_pb.ChangePack): PushPullResponse;
  hasChangePack(): boolean;
  clearChangePack(): PushPullResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullResponse.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullResponse): PushPullResponse.AsObject;
  static serializeBinaryToWriter(message: PushPullResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullResponse;
  static deserializeBinaryFromReader(message: PushPullResponse, reader: jspb.BinaryReader): PushPullResponse;
}

export namespace PushPullResponse {
  export type AsObject = {
    clientId: Uint8Array | string,
    changePack?: resources_pb.ChangePack.AsObject,
  }
}

export class UpdateMetadataRequest extends jspb.Message {
  getClient(): resources_pb.Client | undefined;
  setClient(value?: resources_pb.Client): UpdateMetadataRequest;
  hasClient(): boolean;
  clearClient(): UpdateMetadataRequest;

  getDocumentKeysList(): Array<string>;
  setDocumentKeysList(value: Array<string>): UpdateMetadataRequest;
  clearDocumentKeysList(): UpdateMetadataRequest;
  addDocumentKeys(value: string, index?: number): UpdateMetadataRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateMetadataRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateMetadataRequest): UpdateMetadataRequest.AsObject;
  static serializeBinaryToWriter(message: UpdateMetadataRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateMetadataRequest;
  static deserializeBinaryFromReader(message: UpdateMetadataRequest, reader: jspb.BinaryReader): UpdateMetadataRequest;
}

export namespace UpdateMetadataRequest {
  export type AsObject = {
    client?: resources_pb.Client.AsObject,
    documentKeysList: Array<string>,
  }
}

export class UpdateMetadataResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdateMetadataResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdateMetadataResponse): UpdateMetadataResponse.AsObject;
  static serializeBinaryToWriter(message: UpdateMetadataResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdateMetadataResponse;
  static deserializeBinaryFromReader(message: UpdateMetadataResponse, reader: jspb.BinaryReader): UpdateMetadataResponse;
}

export namespace UpdateMetadataResponse {
  export type AsObject = {
  }
}

export class ListChangesRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): ListChangesRequest;

  getDocumentKey(): string;
  setDocumentKey(value: string): ListChangesRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ListChangesRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ListChangesRequest): ListChangesRequest.AsObject;
  static serializeBinaryToWriter(message: ListChangesRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ListChangesRequest;
  static deserializeBinaryFromReader(message: ListChangesRequest, reader: jspb.BinaryReader): ListChangesRequest;
}

export namespace ListChangesRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
    documentKey: string,
  }
}

export class ListChangesResponse extends jspb.Message {
  getChangesList(): Array<resources_pb.Change>;
  setChangesList(value: Array<resources_pb.Change>): ListChangesResponse;
  clearChangesList(): ListChangesResponse;
  addChanges(value?: resources_pb.Change, index?: number): resources_pb.Change;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ListChangesResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ListChangesResponse): ListChangesResponse.AsObject;
  static serializeBinaryToWriter(message: ListChangesResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ListChangesResponse;
  static deserializeBinaryFromReader(message: ListChangesResponse, reader: jspb.BinaryReader): ListChangesResponse;
}

export namespace ListChangesResponse {
  export type AsObject = {
    changesList: Array<resources_pb.Change.AsObject>,
  }
}

