import * as jspb from "google-protobuf"

export class RequestHeader extends jspb.Message {
  getVersion(): number;
  setVersion(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RequestHeader.AsObject;
  static toObject(includeInstance: boolean, msg: RequestHeader): RequestHeader.AsObject;
  static serializeBinaryToWriter(message: RequestHeader, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RequestHeader;
  static deserializeBinaryFromReader(message: RequestHeader, reader: jspb.BinaryReader): RequestHeader;
}

export namespace RequestHeader {
  export type AsObject = {
    version: number,
  }
}

export class ActivateClientRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientKey(): string;
  setClientKey(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ActivateClientRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ActivateClientRequest): ActivateClientRequest.AsObject;
  static serializeBinaryToWriter(message: ActivateClientRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ActivateClientRequest;
  static deserializeBinaryFromReader(message: ActivateClientRequest, reader: jspb.BinaryReader): ActivateClientRequest;
}

export namespace ActivateClientRequest {
  export type AsObject = {
    header?: RequestHeader.AsObject,
    clientKey: string,
  }
}

export class ActivateClientResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): void;

  getClientId(): string;
  setClientId(value: string): void;

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
    clientId: string,
  }
}

export class DeactivateClientRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): string;
  setClientId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DeactivateClientRequest.AsObject;
  static toObject(includeInstance: boolean, msg: DeactivateClientRequest): DeactivateClientRequest.AsObject;
  static serializeBinaryToWriter(message: DeactivateClientRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DeactivateClientRequest;
  static deserializeBinaryFromReader(message: DeactivateClientRequest, reader: jspb.BinaryReader): DeactivateClientRequest;
}

export namespace DeactivateClientRequest {
  export type AsObject = {
    header?: RequestHeader.AsObject,
    clientId: string,
  }
}

export class DeactivateClientResponse extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DeactivateClientResponse.AsObject;
  static toObject(includeInstance: boolean, msg: DeactivateClientResponse): DeactivateClientResponse.AsObject;
  static serializeBinaryToWriter(message: DeactivateClientResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DeactivateClientResponse;
  static deserializeBinaryFromReader(message: DeactivateClientResponse, reader: jspb.BinaryReader): DeactivateClientResponse;
}

export namespace DeactivateClientResponse {
  export type AsObject = {
    clientId: string,
  }
}

export class AttachDocumentRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): string;
  setClientId(value: string): void;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): void;
  hasChangePack(): boolean;
  clearChangePack(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AttachDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: AttachDocumentRequest): AttachDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: AttachDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AttachDocumentRequest;
  static deserializeBinaryFromReader(message: AttachDocumentRequest, reader: jspb.BinaryReader): AttachDocumentRequest;
}

export namespace AttachDocumentRequest {
  export type AsObject = {
    header?: RequestHeader.AsObject,
    clientId: string,
    changePack?: ChangePack.AsObject,
  }
}

export class AttachDocumentResponse extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): void;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): void;
  hasChangePack(): boolean;
  clearChangePack(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AttachDocumentResponse.AsObject;
  static toObject(includeInstance: boolean, msg: AttachDocumentResponse): AttachDocumentResponse.AsObject;
  static serializeBinaryToWriter(message: AttachDocumentResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AttachDocumentResponse;
  static deserializeBinaryFromReader(message: AttachDocumentResponse, reader: jspb.BinaryReader): AttachDocumentResponse;
}

export namespace AttachDocumentResponse {
  export type AsObject = {
    clientId: string,
    changePack?: ChangePack.AsObject,
  }
}

export class DetachDocumentRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): string;
  setClientId(value: string): void;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): void;
  hasChangePack(): boolean;
  clearChangePack(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DetachDocumentRequest.AsObject;
  static toObject(includeInstance: boolean, msg: DetachDocumentRequest): DetachDocumentRequest.AsObject;
  static serializeBinaryToWriter(message: DetachDocumentRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DetachDocumentRequest;
  static deserializeBinaryFromReader(message: DetachDocumentRequest, reader: jspb.BinaryReader): DetachDocumentRequest;
}

export namespace DetachDocumentRequest {
  export type AsObject = {
    header?: RequestHeader.AsObject,
    clientId: string,
    changePack?: ChangePack.AsObject,
  }
}

export class DetachDocumentResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): void;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): void;
  hasChangePack(): boolean;
  clearChangePack(): void;

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
    changePack?: ChangePack.AsObject,
  }
}

export class PushPullRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): string;
  setClientId(value: string): void;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): void;
  hasChangePack(): boolean;
  clearChangePack(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullRequest.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullRequest): PushPullRequest.AsObject;
  static serializeBinaryToWriter(message: PushPullRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullRequest;
  static deserializeBinaryFromReader(message: PushPullRequest, reader: jspb.BinaryReader): PushPullRequest;
}

export namespace PushPullRequest {
  export type AsObject = {
    header?: RequestHeader.AsObject,
    clientId: string,
    changePack?: ChangePack.AsObject,
  }
}

export class PushPullResponse extends jspb.Message {
  getClientId(): string;
  setClientId(value: string): void;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): void;
  hasChangePack(): boolean;
  clearChangePack(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PushPullResponse.AsObject;
  static toObject(includeInstance: boolean, msg: PushPullResponse): PushPullResponse.AsObject;
  static serializeBinaryToWriter(message: PushPullResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PushPullResponse;
  static deserializeBinaryFromReader(message: PushPullResponse, reader: jspb.BinaryReader): PushPullResponse;
}

export namespace PushPullResponse {
  export type AsObject = {
    clientId: string,
    changePack?: ChangePack.AsObject,
  }
}

export class DocumentKey extends jspb.Message {
  getCollection(): string;
  setCollection(value: string): void;

  getDocument(): string;
  setDocument(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DocumentKey.AsObject;
  static toObject(includeInstance: boolean, msg: DocumentKey): DocumentKey.AsObject;
  static serializeBinaryToWriter(message: DocumentKey, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DocumentKey;
  static deserializeBinaryFromReader(message: DocumentKey, reader: jspb.BinaryReader): DocumentKey;
}

export namespace DocumentKey {
  export type AsObject = {
    collection: string,
    document: string,
  }
}

export class ChangePack extends jspb.Message {
  getDocumentKey(): DocumentKey | undefined;
  setDocumentKey(value?: DocumentKey): void;
  hasDocumentKey(): boolean;
  clearDocumentKey(): void;

  getCheckpoint(): Checkpoint | undefined;
  setCheckpoint(value?: Checkpoint): void;
  hasCheckpoint(): boolean;
  clearCheckpoint(): void;

  getChangesList(): Array<Change>;
  setChangesList(value: Array<Change>): void;
  clearChangesList(): void;
  addChanges(value?: Change, index?: number): Change;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ChangePack.AsObject;
  static toObject(includeInstance: boolean, msg: ChangePack): ChangePack.AsObject;
  static serializeBinaryToWriter(message: ChangePack, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ChangePack;
  static deserializeBinaryFromReader(message: ChangePack, reader: jspb.BinaryReader): ChangePack;
}

export namespace ChangePack {
  export type AsObject = {
    documentKey?: DocumentKey.AsObject,
    checkpoint?: Checkpoint.AsObject,
    changesList: Array<Change.AsObject>,
  }
}

export class Checkpoint extends jspb.Message {
  getServerSeq(): string;
  setServerSeq(value: string): void;

  getClientSeq(): number;
  setClientSeq(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Checkpoint.AsObject;
  static toObject(includeInstance: boolean, msg: Checkpoint): Checkpoint.AsObject;
  static serializeBinaryToWriter(message: Checkpoint, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Checkpoint;
  static deserializeBinaryFromReader(message: Checkpoint, reader: jspb.BinaryReader): Checkpoint;
}

export namespace Checkpoint {
  export type AsObject = {
    serverSeq: string,
    clientSeq: number,
  }
}

export class ChangeID extends jspb.Message {
  getClientSeq(): number;
  setClientSeq(value: number): void;

  getLamport(): string;
  setLamport(value: string): void;

  getActorId(): string;
  setActorId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ChangeID.AsObject;
  static toObject(includeInstance: boolean, msg: ChangeID): ChangeID.AsObject;
  static serializeBinaryToWriter(message: ChangeID, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ChangeID;
  static deserializeBinaryFromReader(message: ChangeID, reader: jspb.BinaryReader): ChangeID;
}

export namespace ChangeID {
  export type AsObject = {
    clientSeq: number,
    lamport: string,
    actorId: string,
  }
}

export class TimeTicket extends jspb.Message {
  getLamport(): string;
  setLamport(value: string): void;

  getDelimiter(): number;
  setDelimiter(value: number): void;

  getActorId(): string;
  setActorId(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TimeTicket.AsObject;
  static toObject(includeInstance: boolean, msg: TimeTicket): TimeTicket.AsObject;
  static serializeBinaryToWriter(message: TimeTicket, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TimeTicket;
  static deserializeBinaryFromReader(message: TimeTicket, reader: jspb.BinaryReader): TimeTicket;
}

export namespace TimeTicket {
  export type AsObject = {
    lamport: string,
    delimiter: number,
    actorId: string,
  }
}

export class JSONElement extends jspb.Message {
  getCreatedAt(): TimeTicket | undefined;
  setCreatedAt(value?: TimeTicket): void;
  hasCreatedAt(): boolean;
  clearCreatedAt(): void;

  getUpdatedAt(): TimeTicket | undefined;
  setUpdatedAt(value?: TimeTicket): void;
  hasUpdatedAt(): boolean;
  clearUpdatedAt(): void;

  getType(): ValueType;
  setType(value: ValueType): void;

  getValue(): Uint8Array | string;
  getValue_asU8(): Uint8Array;
  getValue_asB64(): string;
  setValue(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): JSONElement.AsObject;
  static toObject(includeInstance: boolean, msg: JSONElement): JSONElement.AsObject;
  static serializeBinaryToWriter(message: JSONElement, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): JSONElement;
  static deserializeBinaryFromReader(message: JSONElement, reader: jspb.BinaryReader): JSONElement;
}

export namespace JSONElement {
  export type AsObject = {
    createdAt?: TimeTicket.AsObject,
    updatedAt?: TimeTicket.AsObject,
    type: ValueType,
    value: Uint8Array | string,
  }
}

export class TextNodePos extends jspb.Message {
  getCreatedAt(): TimeTicket | undefined;
  setCreatedAt(value?: TimeTicket): void;
  hasCreatedAt(): boolean;
  clearCreatedAt(): void;

  getOffset(): number;
  setOffset(value: number): void;

  getRelativeOffset(): number;
  setRelativeOffset(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TextNodePos.AsObject;
  static toObject(includeInstance: boolean, msg: TextNodePos): TextNodePos.AsObject;
  static serializeBinaryToWriter(message: TextNodePos, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TextNodePos;
  static deserializeBinaryFromReader(message: TextNodePos, reader: jspb.BinaryReader): TextNodePos;
}

export namespace TextNodePos {
  export type AsObject = {
    createdAt?: TimeTicket.AsObject,
    offset: number,
    relativeOffset: number,
  }
}

export class Operation extends jspb.Message {
  getSet(): Operation.Set | undefined;
  setSet(value?: Operation.Set): void;
  hasSet(): boolean;
  clearSet(): void;

  getAdd(): Operation.Add | undefined;
  setAdd(value?: Operation.Add): void;
  hasAdd(): boolean;
  clearAdd(): void;

  getRemove(): Operation.Remove | undefined;
  setRemove(value?: Operation.Remove): void;
  hasRemove(): boolean;
  clearRemove(): void;

  getEdit(): Operation.Edit | undefined;
  setEdit(value?: Operation.Edit): void;
  hasEdit(): boolean;
  clearEdit(): void;

  getBodyCase(): Operation.BodyCase;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Operation.AsObject;
  static toObject(includeInstance: boolean, msg: Operation): Operation.AsObject;
  static serializeBinaryToWriter(message: Operation, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Operation;
  static deserializeBinaryFromReader(message: Operation, reader: jspb.BinaryReader): Operation;
}

export namespace Operation {
  export type AsObject = {
    set?: Operation.Set.AsObject,
    add?: Operation.Add.AsObject,
    remove?: Operation.Remove.AsObject,
    edit?: Operation.Edit.AsObject,
  }

  export class Set extends jspb.Message {
    getKey(): string;
    setKey(value: string): void;

    getValue(): JSONElement | undefined;
    setValue(value?: JSONElement): void;
    hasValue(): boolean;
    clearValue(): void;

    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Set.AsObject;
    static toObject(includeInstance: boolean, msg: Set): Set.AsObject;
    static serializeBinaryToWriter(message: Set, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Set;
    static deserializeBinaryFromReader(message: Set, reader: jspb.BinaryReader): Set;
  }

  export namespace Set {
    export type AsObject = {
      key: string,
      value?: JSONElement.AsObject,
      parentCreatedAt?: TimeTicket.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Add extends jspb.Message {
    getValue(): JSONElement | undefined;
    setValue(value?: JSONElement): void;
    hasValue(): boolean;
    clearValue(): void;

    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getPrevCreatedAt(): TimeTicket | undefined;
    setPrevCreatedAt(value?: TimeTicket): void;
    hasPrevCreatedAt(): boolean;
    clearPrevCreatedAt(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Add.AsObject;
    static toObject(includeInstance: boolean, msg: Add): Add.AsObject;
    static serializeBinaryToWriter(message: Add, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Add;
    static deserializeBinaryFromReader(message: Add, reader: jspb.BinaryReader): Add;
  }

  export namespace Add {
    export type AsObject = {
      value?: JSONElement.AsObject,
      parentCreatedAt?: TimeTicket.AsObject,
      prevCreatedAt?: TimeTicket.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Remove extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Remove.AsObject;
    static toObject(includeInstance: boolean, msg: Remove): Remove.AsObject;
    static serializeBinaryToWriter(message: Remove, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Remove;
    static deserializeBinaryFromReader(message: Remove, reader: jspb.BinaryReader): Remove;
  }

  export namespace Remove {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      createdAt?: TimeTicket.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Edit extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getFrom(): TextNodePos | undefined;
    setFrom(value?: TextNodePos): void;
    hasFrom(): boolean;
    clearFrom(): void;

    getTo(): TextNodePos | undefined;
    setTo(value?: TextNodePos): void;
    hasTo(): boolean;
    clearTo(): void;

    getCreatedAtMapByActorMap(): jspb.Map<string, TimeTicket>;
    clearCreatedAtMapByActorMap(): void;

    getContent(): string;
    setContent(value: string): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Edit.AsObject;
    static toObject(includeInstance: boolean, msg: Edit): Edit.AsObject;
    static serializeBinaryToWriter(message: Edit, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Edit;
    static deserializeBinaryFromReader(message: Edit, reader: jspb.BinaryReader): Edit;
  }

  export namespace Edit {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      from?: TextNodePos.AsObject,
      to?: TextNodePos.AsObject,
      createdAtMapByActorMap: Array<[string, TimeTicket.AsObject]>,
      content: string,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    SET = 1,
    ADD = 2,
    REMOVE = 3,
    EDIT = 4,
  }
}

export class Change extends jspb.Message {
  getId(): ChangeID | undefined;
  setId(value?: ChangeID): void;
  hasId(): boolean;
  clearId(): void;

  getMessage(): string;
  setMessage(value: string): void;

  getOperationsList(): Array<Operation>;
  setOperationsList(value: Array<Operation>): void;
  clearOperationsList(): void;
  addOperations(value?: Operation, index?: number): Operation;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Change.AsObject;
  static toObject(includeInstance: boolean, msg: Change): Change.AsObject;
  static serializeBinaryToWriter(message: Change, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Change;
  static deserializeBinaryFromReader(message: Change, reader: jspb.BinaryReader): Change;
}

export namespace Change {
  export type AsObject = {
    id?: ChangeID.AsObject,
    message: string,
    operationsList: Array<Operation.AsObject>,
  }
}

export enum ValueType { 
  NULL = 0,
  BOOLEAN = 1,
  INTEGER = 2,
  LONG = 3,
  DOUBLE = 4,
  STRING = 5,
  BYTES = 6,
  DATE = 7,
  JSON_OBJECT = 8,
  JSON_ARRAY = 9,
  TEXT = 10,
}
