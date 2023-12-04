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
  getClientId(): string;
  setClientId(value: string): ActivateClientResponse;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ActivateClientResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ActivateClientResponse): ActivateClientResponse.AsObject;
  static serializeBinaryToWriter(message: ActivateClientResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ActivateClientResponse;
  static deserializeBinaryFromReader(message: ActivateClientResponse, reader: jspb.BinaryReader): ActivateClientResponse;
}

export namespace ActivateClientResponse {
  export type AsObject = {
    clientId: string,
  }
}

export class DeactivateClientRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): DeactivateClientRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DeactivateClientRequest.AsObject;
  static toObject(includeInstance: boolean, msg: DeactivateClientRequest): DeactivateClientRequest.AsObject;
  static serializeBinaryToWriter(message: DeactivateClientRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DeactivateClientRequest;
  static deserializeBinaryFromReader(message: DeactivateClientRequest, reader: jspb.BinaryReader): DeactivateClientRequest;
}

export namespace DeactivateClientRequest {
  export type AsObject = {
    clientId: string,
  }
}

export class DeactivateClientResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DeactivateClientResponse.AsObject;
  static toObject(includeInstance: boolean, msg: DeactivateClientResponse): DeactivateClientResponse.AsObject;
  static serializeBinaryToWriter(message: DeactivateClientResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DeactivateClientResponse;
  static deserializeBinaryFromReader(message: DeactivateClientResponse, reader: jspb.BinaryReader): DeactivateClientResponse;
}

export namespace DeactivateClientResponse {
  export type AsObject = {
  }
}

export class AttachDocumentRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): AttachDocumentRequest;

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
    clientId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class AttachDocumentResponse extends jspb.Message {
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
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class DetachDocumentRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): DetachDocumentRequest;

  getDocumentId(): string;
  setDocumentId(value: string): DetachDocumentRequest;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): DetachDocumentRequest;
  hasChangePack(): boolean;
  clearChangePack(): DetachDocumentRequest;

  getRemoveIfNotAttached(): boolean;
  setRemoveIfNotAttached(value: boolean): DetachDocumentRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DetachDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: DetachDocumentRequest): DetachDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: DetachDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DetachDocumentRequest;
  static deserializeBinaryFromReader(message: DetachDocumentRequest, reader: jspb.BinaryReader): DetachDocumentRequest;
}

export namespace DetachDocumentRequest {
  export type AsObject = {
    clientId: string,
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
    removeIfNotAttached: boolean,
  }
}

export class DetachDocumentResponse extends jspb.Message {
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
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class WatchDocumentRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): WatchDocumentRequest;

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
    clientId: string,
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
    getClientIdsList(): Array<string>;
    setClientIdsList(value: Array<string>): Initialization;
    clearClientIdsList(): Initialization;
    addClientIds(value: string, index?: number): Initialization;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Initialization.AsObject;
    static toObject(includeInstance: boolean, msg: Initialization): Initialization.AsObject;
    static serializeBinaryToWriter(message: Initialization, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Initialization;
    static deserializeBinaryFromReader(message: Initialization, reader: jspb.BinaryReader): Initialization;
  }

  export namespace Initialization {
    export type AsObject = {
      clientIdsList: Array<string>,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    INITIALIZATION = 1,
    EVENT = 2,
  }
}

export class RemoveDocumentRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): RemoveDocumentRequest;

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
    clientId: string,
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class RemoveDocumentResponse extends jspb.Message {
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
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class PushPullChangesRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): PushPullChangesRequest;

  getDocumentId(): string;
  setDocumentId(value: string): PushPullChangesRequest;

  getChangePack(): yorkie_v1_resources_pb.ChangePack | undefined;
  setChangePack(value?: yorkie_v1_resources_pb.ChangePack): PushPullChangesRequest;
  hasChangePack(): boolean;
  clearChangePack(): PushPullChangesRequest;

  getPushOnly(): boolean;
  setPushOnly(value: boolean): PushPullChangesRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullChangesRequest.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullChangesRequest): PushPullChangesRequest.AsObject;
  static serializeBinaryToWriter(message: PushPullChangesRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullChangesRequest;
  static deserializeBinaryFromReader(message: PushPullChangesRequest, reader: jspb.BinaryReader): PushPullChangesRequest;
}

export namespace PushPullChangesRequest {
  export type AsObject = {
    clientId: string,
    documentId: string,
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
    pushOnly: boolean,
  }
}

export class PushPullChangesResponse extends jspb.Message {
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
    changePack?: yorkie_v1_resources_pb.ChangePack.AsObject,
  }
}

export class BroadcastRequest extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): BroadcastRequest;

  getDocumentId(): string;
  setDocumentId(value: string): BroadcastRequest;

  getTopic(): string;
  setTopic(value: string): BroadcastRequest;

  getPayload(): Uint8Array | string;
  getPayload_asU8(): Uint8Array;
  getPayload_asB64(): string;
  setPayload(value: Uint8Array | string): BroadcastRequest;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): BroadcastRequest.AsObject;
  static toObject(includeInstance: boolean, msg: BroadcastRequest): BroadcastRequest.AsObject;
  static serializeBinaryToWriter(message: BroadcastRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): BroadcastRequest;
  static deserializeBinaryFromReader(message: BroadcastRequest, reader: jspb.BinaryReader): BroadcastRequest;
}

export namespace BroadcastRequest {
  export type AsObject = {
    clientId: string,
    documentId: string,
    topic: string,
    payload: Uint8Array | string,
  }
}

export class BroadcastResponse extends jspb.Message {
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): BroadcastResponse.AsObject;
  static toObject(includeInstance: boolean, msg: BroadcastResponse): BroadcastResponse.AsObject;
  static serializeBinaryToWriter(message: BroadcastResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): BroadcastResponse;
  static deserializeBinaryFromReader(message: BroadcastResponse, reader: jspb.BinaryReader): BroadcastResponse;
}

export namespace BroadcastResponse {
  export type AsObject = {
  }
}

