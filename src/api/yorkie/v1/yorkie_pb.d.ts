import * as jspb from 'google-protobuf'

import * as yorkie_v1_resources_pb from '../../yorkie/v1/resources_pb';


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

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): AttachDocumentRequest;
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
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class AttachDocumentResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): AttachDocumentResponse;

  getDocumentId(): string;
  setDocumentId(value: string): AttachDocumentResponse;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): AttachDocumentResponse;
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
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class DetachDocumentRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): DetachDocumentRequest;

  getDocumentId(): string;
  setDocumentId(value: string): DetachDocumentRequest;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): DetachDocumentRequest;
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
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class DetachDocumentResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): DetachDocumentResponse;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): DetachDocumentResponse;
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
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class WatchDocumentRequest extends jspb.Message {
  getClient(): yorkie_v1_resources_pb.Client | undefined;
  setClient(value?: yorkie_v1_resources_pb.Client): WatchDocumentRequest;
  hasClient(): boolean;
  clearClient(): WatchDocumentRequest;

  getDocumentId(): string;
  setDocumentId(value: string): WatchDocumentRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): WatchDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: WatchDocumentRequest): WatchDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: WatchDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): WatchDocumentRequest;
  static deserializeBinaryFromReader(message: WatchDocumentRequest, reader: jspb.BinaryReader): WatchDocumentRequest;
}

export namespace WatchDocumentRequest {
  export type AsObject = {
    client?: yorkie_v1_resources_pb.Client.AsObject,
    documentId: string,
  }
}

export class WatchDocumentResponse extends jspb.Message {
  getInitialization(): WatchDocumentResponse.Initialization | undefined;
  setInitialization(value?: WatchDocumentResponse.Initialization): WatchDocumentResponse;
  hasInitialization(): boolean;
  clearInitialization(): WatchDocumentResponse;

  getEvent(): yorkie_v1_resources_pb.DocEvent | undefined;
  setEvent(value?: yorkie_v1_resources_pb.DocEvent): WatchDocumentResponse;
  hasEvent(): boolean;
  clearEvent(): WatchDocumentResponse;

  getBodyCase(): WatchDocumentResponse.BodyCase;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): WatchDocumentResponse.AsObject;
  static toObject(includeInstance: boolean, msg: WatchDocumentResponse): WatchDocumentResponse.AsObject;
  static serializeBinaryToWriter(message: WatchDocumentResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): WatchDocumentResponse;
  static deserializeBinaryFromReader(message: WatchDocumentResponse, reader: jspb.BinaryReader): WatchDocumentResponse;
}

export namespace WatchDocumentResponse {
  export type AsObject = {
    initialization?: WatchDocumentResponse.Initialization.AsObject,
    event?: yorkie_v1_resources_pb.DocEvent.AsObject,
  }

  export class Initialization extends jspb.Message {
    getPeersList(): Array<yorkie_v1_resources_pb.Client>;
    setPeersList(value: Array<yorkie_v1_resources_pb.Client>): Initialization;
    clearPeersList(): Initialization;
    addPeers(value?: yorkie_v1_resources_pb.Client, index?: number): yorkie_v1_resources_pb.Client;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Initialization.AsObject;
    static toObject(includeInstance: boolean, msg: Initialization): Initialization.AsObject;
    static serializeBinaryToWriter(message: Initialization, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Initialization;
    static deserializeBinaryFromReader(message: Initialization, reader: jspb.BinaryReader): Initialization;
  }

  export namespace Initialization {
    export type AsObject = {
      peersList: Array<yorkie_v1_resources_pb.Client.AsObject>,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    INITIALIZATION = 1,
    EVENT = 2,
  }
}

export class RemoveDocumentRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): RemoveDocumentRequest;

  getDocumentId(): string;
  setDocumentId(value: string): RemoveDocumentRequest;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): RemoveDocumentRequest;
  hasChangePack(): boolean;
  clearChangePack(): RemoveDocumentRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RemoveDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: RemoveDocumentRequest): RemoveDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: RemoveDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RemoveDocumentRequest;
  static deserializeBinaryFromReader(message: RemoveDocumentRequest, reader: jspb.BinaryReader): RemoveDocumentRequest;
}

export namespace RemoveDocumentRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class RemoveDocumentResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): RemoveDocumentResponse;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): RemoveDocumentResponse;
  hasChangePack(): boolean;
  clearChangePack(): RemoveDocumentResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RemoveDocumentResponse.AsObject;
  static toObject(includeInstance: boolean, msg: RemoveDocumentResponse): RemoveDocumentResponse.AsObject;
  static serializeBinaryToWriter(message: RemoveDocumentResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RemoveDocumentResponse;
  static deserializeBinaryFromReader(message: RemoveDocumentResponse, reader: jspb.BinaryReader): RemoveDocumentResponse;
}

export namespace RemoveDocumentResponse {
  export type AsObject = {
    clientKey: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class PushPullChangesRequest extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): PushPullChangesRequest;

  getDocumentId(): string;
  setDocumentId(value: string): PushPullChangesRequest;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): PushPullChangesRequest;
  hasChangePack(): boolean;
  clearChangePack(): PushPullChangesRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullChangesRequest.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullChangesRequest): PushPullChangesRequest.AsObject;
  static serializeBinaryToWriter(message: PushPullChangesRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullChangesRequest;
  static deserializeBinaryFromReader(message: PushPullChangesRequest, reader: jspb.BinaryReader): PushPullChangesRequest;
}

export namespace PushPullChangesRequest {
  export type AsObject = {
    clientId: Uint8Array | string,
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class PushPullChangesResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): PushPullChangesResponse;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): PushPullChangesResponse;
  hasChangePack(): boolean;
  clearChangePack(): PushPullChangesResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullChangesResponse.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullChangesResponse): PushPullChangesResponse.AsObject;
  static serializeBinaryToWriter(message: PushPullChangesResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullChangesResponse;
  static deserializeBinaryFromReader(message: PushPullChangesResponse, reader: jspb.BinaryReader): PushPullChangesResponse;
}

export namespace PushPullChangesResponse {
  export type AsObject = {
    clientId: Uint8Array | string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class UpdatePresenceRequest extends jspb.Message {
  getClient(): yorkie_v1_resources_pb.Client | undefined;
  setClient(value?: yorkie_v1_resources_pb.Client): UpdatePresenceRequest;
  hasClient(): boolean;
  clearClient(): UpdatePresenceRequest;

  getDocumentId(): string;
  setDocumentId(value: string): UpdatePresenceRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdatePresenceRequest.AsObject;
  static toObject(includeInstance: boolean, msg: UpdatePresenceRequest): UpdatePresenceRequest.AsObject;
  static serializeBinaryToWriter(message: UpdatePresenceRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdatePresenceRequest;
  static deserializeBinaryFromReader(message: UpdatePresenceRequest, reader: jspb.BinaryReader): UpdatePresenceRequest;
}

export namespace UpdatePresenceRequest {
  export type AsObject = {
    client?: yorkie_v1_resources_pb.Client.AsObject,
    documentId: string,
  }
}

export class UpdatePresenceResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdatePresenceResponse.AsObject;
  static toObject(includeInstance: boolean, msg: UpdatePresenceResponse): UpdatePresenceResponse.AsObject;
  static serializeBinaryToWriter(message: UpdatePresenceResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdatePresenceResponse;
  static deserializeBinaryFromReader(message: UpdatePresenceResponse, reader: jspb.BinaryReader): UpdatePresenceResponse;
}

export namespace UpdatePresenceResponse {
  export type AsObject = {
  }
}

