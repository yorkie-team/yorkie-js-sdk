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

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
    clientId: Uint8Array | string,
  }
}

export class DeactivateClientResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
  }
}

export class AttachDocumentResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
  }
}

export class DetachDocumentRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
    clientId: Uint8Array | string,
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

export class WatchDocumentsRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClient(): Client | undefined;
  setClient(value?: Client): void;
  hasClient(): boolean;
  clearClient(): void;

  getDocumentKeysList(): Array<DocumentKey>;
  setDocumentKeysList(value: Array<DocumentKey>): void;
  clearDocumentKeysList(): void;
  addDocumentKeys(value?: DocumentKey, index?: number): DocumentKey;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): WatchDocumentsRequest.AsObject;
  static toObject(includeInstance: boolean, msg: WatchDocumentsRequest): WatchDocumentsRequest.AsObject;
  static serializeBinaryToWriter(message: WatchDocumentsRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): WatchDocumentsRequest;
  static deserializeBinaryFromReader(message: WatchDocumentsRequest, reader: jspb.BinaryReader): WatchDocumentsRequest;
}

export namespace WatchDocumentsRequest {
  export type AsObject = {
    header?: RequestHeader.AsObject,
    client?: Client.AsObject,
    documentKeysList: Array<DocumentKey.AsObject>,
  }
}

export class WatchDocumentsResponse extends jspb.Message {
  getInitialization(): WatchDocumentsResponse.Initialization | undefined;
  setInitialization(value?: WatchDocumentsResponse.Initialization): void;
  hasInitialization(): boolean;
  clearInitialization(): void;

  getEvent(): WatchDocumentsResponse.Event | undefined;
  setEvent(value?: WatchDocumentsResponse.Event): void;
  hasEvent(): boolean;
  clearEvent(): void;

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
    event?: WatchDocumentsResponse.Event.AsObject,
  }

  export class Initialization extends jspb.Message {
    getPeersMapByDocMap(): jspb.Map<string, Clients>;
    clearPeersMapByDocMap(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Initialization.AsObject;
    static toObject(includeInstance: boolean, msg: Initialization): Initialization.AsObject;
    static serializeBinaryToWriter(message: Initialization, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Initialization;
    static deserializeBinaryFromReader(message: Initialization, reader: jspb.BinaryReader): Initialization;
  }

  export namespace Initialization {
    export type AsObject = {
      peersMapByDocMap: Array<[string, Clients.AsObject]>,
    }
  }


  export class Event extends jspb.Message {
    getClient(): Client | undefined;
    setClient(value?: Client): void;
    hasClient(): boolean;
    clearClient(): void;

    getEventType(): EventType;
    setEventType(value: EventType): void;

    getDocumentKeysList(): Array<DocumentKey>;
    setDocumentKeysList(value: Array<DocumentKey>): void;
    clearDocumentKeysList(): void;
    addDocumentKeys(value?: DocumentKey, index?: number): DocumentKey;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Event.AsObject;
    static toObject(includeInstance: boolean, msg: Event): Event.AsObject;
    static serializeBinaryToWriter(message: Event, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Event;
    static deserializeBinaryFromReader(message: Event, reader: jspb.BinaryReader): Event;
  }

  export namespace Event {
    export type AsObject = {
      client?: Client.AsObject,
      eventType: EventType,
      documentKeysList: Array<DocumentKey.AsObject>,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    INITIALIZATION = 1,
    EVENT = 2,
  }
}

export class PushPullRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): void;
  hasHeader(): boolean;
  clearHeader(): void;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
  }
}

export class PushPullResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): void;

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
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
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

  getSnapshot(): Uint8Array | string;
  getSnapshot_asU8(): Uint8Array;
  getSnapshot_asB64(): string;
  setSnapshot(value: Uint8Array | string): void;

  getChangesList(): Array<Change>;
  setChangesList(value: Array<Change>): void;
  clearChangesList(): void;
  addChanges(value?: Change, index?: number): Change;

  getMinSyncedTicket(): TimeTicket | undefined;
  setMinSyncedTicket(value?: TimeTicket): void;
  hasMinSyncedTicket(): boolean;
  clearMinSyncedTicket(): void;

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
    snapshot: Uint8Array | string,
    changesList: Array<Change.AsObject>,
    minSyncedTicket?: TimeTicket.AsObject,
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

export class ChangeID extends jspb.Message {
  getClientSeq(): number;
  setClientSeq(value: number): void;

  getLamport(): string;
  setLamport(value: string): void;

  getActorId(): Uint8Array | string;
  getActorId_asU8(): Uint8Array;
  getActorId_asB64(): string;
  setActorId(value: Uint8Array | string): void;

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
    actorId: Uint8Array | string,
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

  getMove(): Operation.Move | undefined;
  setMove(value?: Operation.Move): void;
  hasMove(): boolean;
  clearMove(): void;

  getRemove(): Operation.Remove | undefined;
  setRemove(value?: Operation.Remove): void;
  hasRemove(): boolean;
  clearRemove(): void;

  getEdit(): Operation.Edit | undefined;
  setEdit(value?: Operation.Edit): void;
  hasEdit(): boolean;
  clearEdit(): void;

  getSelect(): Operation.Select | undefined;
  setSelect(value?: Operation.Select): void;
  hasSelect(): boolean;
  clearSelect(): void;

  getRichEdit(): Operation.RichEdit | undefined;
  setRichEdit(value?: Operation.RichEdit): void;
  hasRichEdit(): boolean;
  clearRichEdit(): void;

  getStyle(): Operation.Style | undefined;
  setStyle(value?: Operation.Style): void;
  hasStyle(): boolean;
  clearStyle(): void;

  getIncrease(): Operation.Increase | undefined;
  setIncrease(value?: Operation.Increase): void;
  hasIncrease(): boolean;
  clearIncrease(): void;

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
    move?: Operation.Move.AsObject,
    remove?: Operation.Remove.AsObject,
    edit?: Operation.Edit.AsObject,
    select?: Operation.Select.AsObject,
    richEdit?: Operation.RichEdit.AsObject,
    style?: Operation.Style.AsObject,
    increase?: Operation.Increase.AsObject,
  }

  export class Set extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getKey(): string;
    setKey(value: string): void;

    getValue(): JSONElementSimple | undefined;
    setValue(value?: JSONElementSimple): void;
    hasValue(): boolean;
    clearValue(): void;

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
      parentCreatedAt?: TimeTicket.AsObject,
      key: string,
      value?: JSONElementSimple.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Add extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getPrevCreatedAt(): TimeTicket | undefined;
    setPrevCreatedAt(value?: TimeTicket): void;
    hasPrevCreatedAt(): boolean;
    clearPrevCreatedAt(): void;

    getValue(): JSONElementSimple | undefined;
    setValue(value?: JSONElementSimple): void;
    hasValue(): boolean;
    clearValue(): void;

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
      parentCreatedAt?: TimeTicket.AsObject,
      prevCreatedAt?: TimeTicket.AsObject,
      value?: JSONElementSimple.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Move extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getPrevCreatedAt(): TimeTicket | undefined;
    setPrevCreatedAt(value?: TimeTicket): void;
    hasPrevCreatedAt(): boolean;
    clearPrevCreatedAt(): void;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Move.AsObject;
    static toObject(includeInstance: boolean, msg: Move): Move.AsObject;
    static serializeBinaryToWriter(message: Move, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Move;
    static deserializeBinaryFromReader(message: Move, reader: jspb.BinaryReader): Move;
  }

  export namespace Move {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      prevCreatedAt?: TimeTicket.AsObject,
      createdAt?: TimeTicket.AsObject,
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


  export class Select extends jspb.Message {
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

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Select.AsObject;
    static toObject(includeInstance: boolean, msg: Select): Select.AsObject;
    static serializeBinaryToWriter(message: Select, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Select;
    static deserializeBinaryFromReader(message: Select, reader: jspb.BinaryReader): Select;
  }

  export namespace Select {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      from?: TextNodePos.AsObject,
      to?: TextNodePos.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class RichEdit extends jspb.Message {
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

    getAttributesMap(): jspb.Map<string, string>;
    clearAttributesMap(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RichEdit.AsObject;
    static toObject(includeInstance: boolean, msg: RichEdit): RichEdit.AsObject;
    static serializeBinaryToWriter(message: RichEdit, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RichEdit;
    static deserializeBinaryFromReader(message: RichEdit, reader: jspb.BinaryReader): RichEdit;
  }

  export namespace RichEdit {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      from?: TextNodePos.AsObject,
      to?: TextNodePos.AsObject,
      createdAtMapByActorMap: Array<[string, TimeTicket.AsObject]>,
      content: string,
      attributesMap: Array<[string, string]>,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Style extends jspb.Message {
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

    getAttributesMap(): jspb.Map<string, string>;
    clearAttributesMap(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Style.AsObject;
    static toObject(includeInstance: boolean, msg: Style): Style.AsObject;
    static serializeBinaryToWriter(message: Style, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Style;
    static deserializeBinaryFromReader(message: Style, reader: jspb.BinaryReader): Style;
  }

  export namespace Style {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      from?: TextNodePos.AsObject,
      to?: TextNodePos.AsObject,
      attributesMap: Array<[string, string]>,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class Increase extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): void;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): void;

    getValue(): JSONElementSimple | undefined;
    setValue(value?: JSONElementSimple): void;
    hasValue(): boolean;
    clearValue(): void;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): void;
    hasExecutedAt(): boolean;
    clearExecutedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Increase.AsObject;
    static toObject(includeInstance: boolean, msg: Increase): Increase.AsObject;
    static serializeBinaryToWriter(message: Increase, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Increase;
    static deserializeBinaryFromReader(message: Increase, reader: jspb.BinaryReader): Increase;
  }

  export namespace Increase {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      value?: JSONElementSimple.AsObject,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    SET = 1,
    ADD = 2,
    MOVE = 3,
    REMOVE = 4,
    EDIT = 5,
    SELECT = 6,
    RICH_EDIT = 7,
    STYLE = 8,
    INCREASE = 9,
  }
}

export class JSONElementSimple extends jspb.Message {
  getCreatedAt(): TimeTicket | undefined;
  setCreatedAt(value?: TimeTicket): void;
  hasCreatedAt(): boolean;
  clearCreatedAt(): void;

  getMovedAt(): TimeTicket | undefined;
  setMovedAt(value?: TimeTicket): void;
  hasMovedAt(): boolean;
  clearMovedAt(): void;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): void;
  hasRemovedAt(): boolean;
  clearRemovedAt(): void;

  getType(): ValueType;
  setType(value: ValueType): void;

  getValue(): Uint8Array | string;
  getValue_asU8(): Uint8Array;
  getValue_asB64(): string;
  setValue(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): JSONElementSimple.AsObject;
  static toObject(includeInstance: boolean, msg: JSONElementSimple): JSONElementSimple.AsObject;
  static serializeBinaryToWriter(message: JSONElementSimple, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): JSONElementSimple;
  static deserializeBinaryFromReader(message: JSONElementSimple, reader: jspb.BinaryReader): JSONElementSimple;
}

export namespace JSONElementSimple {
  export type AsObject = {
    createdAt?: TimeTicket.AsObject,
    movedAt?: TimeTicket.AsObject,
    removedAt?: TimeTicket.AsObject,
    type: ValueType,
    value: Uint8Array | string,
  }
}

export class JSONElement extends jspb.Message {
  getObject(): JSONElement.Object | undefined;
  setObject(value?: JSONElement.Object): void;
  hasObject(): boolean;
  clearObject(): void;

  getArray(): JSONElement.Array | undefined;
  setArray(value?: JSONElement.Array): void;
  hasArray(): boolean;
  clearArray(): void;

  getPrimitive(): JSONElement.Primitive | undefined;
  setPrimitive(value?: JSONElement.Primitive): void;
  hasPrimitive(): boolean;
  clearPrimitive(): void;

  getText(): JSONElement.Text | undefined;
  setText(value?: JSONElement.Text): void;
  hasText(): boolean;
  clearText(): void;

  getRichText(): JSONElement.RichText | undefined;
  setRichText(value?: JSONElement.RichText): void;
  hasRichText(): boolean;
  clearRichText(): void;

  getCounter(): JSONElement.Counter | undefined;
  setCounter(value?: JSONElement.Counter): void;
  hasCounter(): boolean;
  clearCounter(): void;

  getBodyCase(): JSONElement.BodyCase;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): JSONElement.AsObject;
  static toObject(includeInstance: boolean, msg: JSONElement): JSONElement.AsObject;
  static serializeBinaryToWriter(message: JSONElement, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): JSONElement;
  static deserializeBinaryFromReader(message: JSONElement, reader: jspb.BinaryReader): JSONElement;
}

export namespace JSONElement {
  export type AsObject = {
    object?: JSONElement.Object.AsObject,
    array?: JSONElement.Array.AsObject,
    primitive?: JSONElement.Primitive.AsObject,
    text?: JSONElement.Text.AsObject,
    richText?: JSONElement.RichText.AsObject,
    counter?: JSONElement.Counter.AsObject,
  }

  export class Object extends jspb.Message {
    getNodesList(): Array<RHTNode>;
    setNodesList(value: Array<RHTNode>): void;
    clearNodesList(): void;
    addNodes(value?: RHTNode, index?: number): RHTNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): void;
    hasMovedAt(): boolean;
    clearMovedAt(): void;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): void;
    hasRemovedAt(): boolean;
    clearRemovedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Object.AsObject;
    static toObject(includeInstance: boolean, msg: Object): Object.AsObject;
    static serializeBinaryToWriter(message: Object, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Object;
    static deserializeBinaryFromReader(message: Object, reader: jspb.BinaryReader): Object;
  }

  export namespace Object {
    export type AsObject = {
      nodesList: Array<RHTNode.AsObject>,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class Array extends jspb.Message {
    getNodesList(): Array<RGANode>;
    setNodesList(value: Array<RGANode>): void;
    clearNodesList(): void;
    addNodes(value?: RGANode, index?: number): RGANode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): void;
    hasMovedAt(): boolean;
    clearMovedAt(): void;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): void;
    hasRemovedAt(): boolean;
    clearRemovedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Array.AsObject;
    static toObject(includeInstance: boolean, msg: Array): Array.AsObject;
    static serializeBinaryToWriter(message: Array, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Array;
    static deserializeBinaryFromReader(message: Array, reader: jspb.BinaryReader): Array;
  }

  export namespace Array {
    export type AsObject = {
      nodesList: Array<RGANode.AsObject>,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class Primitive extends jspb.Message {
    getType(): ValueType;
    setType(value: ValueType): void;

    getValue(): Uint8Array | string;
    getValue_asU8(): Uint8Array;
    getValue_asB64(): string;
    setValue(value: Uint8Array | string): void;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): void;
    hasMovedAt(): boolean;
    clearMovedAt(): void;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): void;
    hasRemovedAt(): boolean;
    clearRemovedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Primitive.AsObject;
    static toObject(includeInstance: boolean, msg: Primitive): Primitive.AsObject;
    static serializeBinaryToWriter(message: Primitive, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Primitive;
    static deserializeBinaryFromReader(message: Primitive, reader: jspb.BinaryReader): Primitive;
  }

  export namespace Primitive {
    export type AsObject = {
      type: ValueType,
      value: Uint8Array | string,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class Text extends jspb.Message {
    getNodesList(): Array<TextNode>;
    setNodesList(value: Array<TextNode>): void;
    clearNodesList(): void;
    addNodes(value?: TextNode, index?: number): TextNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): void;
    hasMovedAt(): boolean;
    clearMovedAt(): void;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): void;
    hasRemovedAt(): boolean;
    clearRemovedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Text.AsObject;
    static toObject(includeInstance: boolean, msg: Text): Text.AsObject;
    static serializeBinaryToWriter(message: Text, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Text;
    static deserializeBinaryFromReader(message: Text, reader: jspb.BinaryReader): Text;
  }

  export namespace Text {
    export type AsObject = {
      nodesList: Array<TextNode.AsObject>,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class RichText extends jspb.Message {
    getNodesList(): Array<RichTextNode>;
    setNodesList(value: Array<RichTextNode>): void;
    clearNodesList(): void;
    addNodes(value?: RichTextNode, index?: number): RichTextNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): void;
    hasMovedAt(): boolean;
    clearMovedAt(): void;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): void;
    hasRemovedAt(): boolean;
    clearRemovedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): RichText.AsObject;
    static toObject(includeInstance: boolean, msg: RichText): RichText.AsObject;
    static serializeBinaryToWriter(message: RichText, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): RichText;
    static deserializeBinaryFromReader(message: RichText, reader: jspb.BinaryReader): RichText;
  }

  export namespace RichText {
    export type AsObject = {
      nodesList: Array<RichTextNode.AsObject>,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class Counter extends jspb.Message {
    getType(): ValueType;
    setType(value: ValueType): void;

    getValue(): Uint8Array | string;
    getValue_asU8(): Uint8Array;
    getValue_asB64(): string;
    setValue(value: Uint8Array | string): void;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): void;
    hasCreatedAt(): boolean;
    clearCreatedAt(): void;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): void;
    hasMovedAt(): boolean;
    clearMovedAt(): void;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): void;
    hasRemovedAt(): boolean;
    clearRemovedAt(): void;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Counter.AsObject;
    static toObject(includeInstance: boolean, msg: Counter): Counter.AsObject;
    static serializeBinaryToWriter(message: Counter, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Counter;
    static deserializeBinaryFromReader(message: Counter, reader: jspb.BinaryReader): Counter;
  }

  export namespace Counter {
    export type AsObject = {
      type: ValueType,
      value: Uint8Array | string,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export enum BodyCase { 
    BODY_NOT_SET = 0,
    OBJECT = 1,
    ARRAY = 2,
    PRIMITIVE = 3,
    TEXT = 4,
    RICH_TEXT = 5,
    COUNTER = 6,
  }
}

export class RHTNode extends jspb.Message {
  getKey(): string;
  setKey(value: string): void;

  getElement(): JSONElement | undefined;
  setElement(value?: JSONElement): void;
  hasElement(): boolean;
  clearElement(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RHTNode.AsObject;
  static toObject(includeInstance: boolean, msg: RHTNode): RHTNode.AsObject;
  static serializeBinaryToWriter(message: RHTNode, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RHTNode;
  static deserializeBinaryFromReader(message: RHTNode, reader: jspb.BinaryReader): RHTNode;
}

export namespace RHTNode {
  export type AsObject = {
    key: string,
    element?: JSONElement.AsObject,
  }
}

export class RGANode extends jspb.Message {
  getNext(): RGANode | undefined;
  setNext(value?: RGANode): void;
  hasNext(): boolean;
  clearNext(): void;

  getElement(): JSONElement | undefined;
  setElement(value?: JSONElement): void;
  hasElement(): boolean;
  clearElement(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RGANode.AsObject;
  static toObject(includeInstance: boolean, msg: RGANode): RGANode.AsObject;
  static serializeBinaryToWriter(message: RGANode, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RGANode;
  static deserializeBinaryFromReader(message: RGANode, reader: jspb.BinaryReader): RGANode;
}

export namespace RGANode {
  export type AsObject = {
    next?: RGANode.AsObject,
    element?: JSONElement.AsObject,
  }
}

export class TextNode extends jspb.Message {
  getId(): TextNodeID | undefined;
  setId(value?: TextNodeID): void;
  hasId(): boolean;
  clearId(): void;

  getValue(): string;
  setValue(value: string): void;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): void;
  hasRemovedAt(): boolean;
  clearRemovedAt(): void;

  getInsPrevId(): TextNodeID | undefined;
  setInsPrevId(value?: TextNodeID): void;
  hasInsPrevId(): boolean;
  clearInsPrevId(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TextNode.AsObject;
  static toObject(includeInstance: boolean, msg: TextNode): TextNode.AsObject;
  static serializeBinaryToWriter(message: TextNode, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TextNode;
  static deserializeBinaryFromReader(message: TextNode, reader: jspb.BinaryReader): TextNode;
}

export namespace TextNode {
  export type AsObject = {
    id?: TextNodeID.AsObject,
    value: string,
    removedAt?: TimeTicket.AsObject,
    insPrevId?: TextNodeID.AsObject,
  }
}

export class RichTextNodeAttr extends jspb.Message {
  getKey(): string;
  setKey(value: string): void;

  getValue(): string;
  setValue(value: string): void;

  getUpdatedAt(): TimeTicket | undefined;
  setUpdatedAt(value?: TimeTicket): void;
  hasUpdatedAt(): boolean;
  clearUpdatedAt(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RichTextNodeAttr.AsObject;
  static toObject(includeInstance: boolean, msg: RichTextNodeAttr): RichTextNodeAttr.AsObject;
  static serializeBinaryToWriter(message: RichTextNodeAttr, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RichTextNodeAttr;
  static deserializeBinaryFromReader(message: RichTextNodeAttr, reader: jspb.BinaryReader): RichTextNodeAttr;
}

export namespace RichTextNodeAttr {
  export type AsObject = {
    key: string,
    value: string,
    updatedAt?: TimeTicket.AsObject,
  }
}

export class RichTextNode extends jspb.Message {
  getId(): TextNodeID | undefined;
  setId(value?: TextNodeID): void;
  hasId(): boolean;
  clearId(): void;

  getAttributesMap(): jspb.Map<string, RichTextNodeAttr>;
  clearAttributesMap(): void;

  getValue(): string;
  setValue(value: string): void;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): void;
  hasRemovedAt(): boolean;
  clearRemovedAt(): void;

  getInsPrevId(): TextNodeID | undefined;
  setInsPrevId(value?: TextNodeID): void;
  hasInsPrevId(): boolean;
  clearInsPrevId(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RichTextNode.AsObject;
  static toObject(includeInstance: boolean, msg: RichTextNode): RichTextNode.AsObject;
  static serializeBinaryToWriter(message: RichTextNode, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RichTextNode;
  static deserializeBinaryFromReader(message: RichTextNode, reader: jspb.BinaryReader): RichTextNode;
}

export namespace RichTextNode {
  export type AsObject = {
    id?: TextNodeID.AsObject,
    attributesMap: Array<[string, RichTextNodeAttr.AsObject]>,
    value: string,
    removedAt?: TimeTicket.AsObject,
    insPrevId?: TextNodeID.AsObject,
  }
}

export class TextNodeID extends jspb.Message {
  getCreatedAt(): TimeTicket | undefined;
  setCreatedAt(value?: TimeTicket): void;
  hasCreatedAt(): boolean;
  clearCreatedAt(): void;

  getOffset(): number;
  setOffset(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TextNodeID.AsObject;
  static toObject(includeInstance: boolean, msg: TextNodeID): TextNodeID.AsObject;
  static serializeBinaryToWriter(message: TextNodeID, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TextNodeID;
  static deserializeBinaryFromReader(message: TextNodeID, reader: jspb.BinaryReader): TextNodeID;
}

export namespace TextNodeID {
  export type AsObject = {
    createdAt?: TimeTicket.AsObject,
    offset: number,
  }
}

export class Client extends jspb.Message {
  getId(): Uint8Array | string;
  getId_asU8(): Uint8Array;
  getId_asB64(): string;
  setId(value: Uint8Array | string): void;

  getMetadataMap(): jspb.Map<string, string>;
  clearMetadataMap(): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Client.AsObject;
  static toObject(includeInstance: boolean, msg: Client): Client.AsObject;
  static serializeBinaryToWriter(message: Client, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Client;
  static deserializeBinaryFromReader(message: Client, reader: jspb.BinaryReader): Client;
}

export namespace Client {
  export type AsObject = {
    id: Uint8Array | string,
    metadataMap: Array<[string, string]>,
  }
}

export class Clients extends jspb.Message {
  getClientsList(): Array<Client>;
  setClientsList(value: Array<Client>): void;
  clearClientsList(): void;
  addClients(value?: Client, index?: number): Client;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Clients.AsObject;
  static toObject(includeInstance: boolean, msg: Clients): Clients.AsObject;
  static serializeBinaryToWriter(message: Clients, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Clients;
  static deserializeBinaryFromReader(message: Clients, reader: jspb.BinaryReader): Clients;
}

export namespace Clients {
  export type AsObject = {
    clientsList: Array<Client.AsObject>,
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

export class TimeTicket extends jspb.Message {
  getLamport(): string;
  setLamport(value: string): void;

  getDelimiter(): number;
  setDelimiter(value: number): void;

  getActorId(): Uint8Array | string;
  getActorId_asU8(): Uint8Array;
  getActorId_asB64(): string;
  setActorId(value: Uint8Array | string): void;

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
    actorId: Uint8Array | string,
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
  RICH_TEXT = 11,
  INTEGER_CNT = 12,
  LONG_CNT = 13,
  DOUBLE_CNT = 14,
}
export enum EventType { 
  DOCUMENTS_CHANGED = 0,
  DOCUMENTS_WATCHED = 1,
  DOCUMENTS_UNWATCHED = 2,
}
