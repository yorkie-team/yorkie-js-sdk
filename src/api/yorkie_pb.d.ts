import * as jspb from "google-protobuf"

export class RequestHeader extends jspb.Message {
  getVersion(): number;
  setVersion(value: number): RequestHeader;

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
  setHeader(value?: RequestHeader): ActivateClientRequest;
  hasHeader(): boolean;
  clearHeader(): ActivateClientRequest;

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
    header?: RequestHeader.AsObject,
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
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): DeactivateClientRequest;
  hasHeader(): boolean;
  clearHeader(): DeactivateClientRequest;

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
    header?: RequestHeader.AsObject,
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
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): AttachDocumentRequest;
  hasHeader(): boolean;
  clearHeader(): AttachDocumentRequest;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): AttachDocumentRequest;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): AttachDocumentRequest;
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
    header?: RequestHeader.AsObject,
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
  }
}

export class AttachDocumentResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): AttachDocumentResponse;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): AttachDocumentResponse;
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
    changePack?: ChangePack.AsObject,
  }
}

export class DetachDocumentRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): DetachDocumentRequest;
  hasHeader(): boolean;
  clearHeader(): DetachDocumentRequest;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): DetachDocumentRequest;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): DetachDocumentRequest;
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
    header?: RequestHeader.AsObject,
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
  }
}

export class DetachDocumentResponse extends jspb.Message {
  getClientKey(): string;
  setClientKey(value: string): DetachDocumentResponse;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): DetachDocumentResponse;
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
    changePack?: ChangePack.AsObject,
  }
}

export class WatchDocumentsRequest extends jspb.Message {
  getHeader(): RequestHeader | undefined;
  setHeader(value?: RequestHeader): WatchDocumentsRequest;
  hasHeader(): boolean;
  clearHeader(): WatchDocumentsRequest;

  getClient(): Client | undefined;
  setClient(value?: Client): WatchDocumentsRequest;
  hasClient(): boolean;
  clearClient(): WatchDocumentsRequest;

  getDocumentKeysList(): Array<DocumentKey>;
  setDocumentKeysList(value: Array<DocumentKey>): WatchDocumentsRequest;
  clearDocumentKeysList(): WatchDocumentsRequest;
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
  setInitialization(value?: WatchDocumentsResponse.Initialization): WatchDocumentsResponse;
  hasInitialization(): boolean;
  clearInitialization(): WatchDocumentsResponse;

  getEvent(): WatchDocumentsResponse.Event | undefined;
  setEvent(value?: WatchDocumentsResponse.Event): WatchDocumentsResponse;
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
    event?: WatchDocumentsResponse.Event.AsObject,
  }

  export class Initialization extends jspb.Message {
    getPeersMapByDocMap(): jspb.Map<string, Clients>;
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
      peersMapByDocMap: Array<[string, Clients.AsObject]>,
    }
  }


  export class Event extends jspb.Message {
    getClient(): Client | undefined;
    setClient(value?: Client): Event;
    hasClient(): boolean;
    clearClient(): Event;

    getEventType(): EventType;
    setEventType(value: EventType): Event;

    getDocumentKeysList(): Array<DocumentKey>;
    setDocumentKeysList(value: Array<DocumentKey>): Event;
    clearDocumentKeysList(): Event;
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
  setHeader(value?: RequestHeader): PushPullRequest;
  hasHeader(): boolean;
  clearHeader(): PushPullRequest;

  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): PushPullRequest;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): PushPullRequest;
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
    header?: RequestHeader.AsObject,
    clientId: Uint8Array | string,
    changePack?: ChangePack.AsObject,
  }
}

export class PushPullResponse extends jspb.Message {
  getClientId(): Uint8Array | string;
  getClientId_asU8(): Uint8Array;
  getClientId_asB64(): string;
  setClientId(value: Uint8Array | string): PushPullResponse;

  getChangePack(): ChangePack | undefined;
  setChangePack(value?: ChangePack): PushPullResponse;
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
    changePack?: ChangePack.AsObject,
  }
}

export class ChangePack extends jspb.Message {
  getDocumentKey(): DocumentKey | undefined;
  setDocumentKey(value?: DocumentKey): ChangePack;
  hasDocumentKey(): boolean;
  clearDocumentKey(): ChangePack;

  getCheckpoint(): Checkpoint | undefined;
  setCheckpoint(value?: Checkpoint): ChangePack;
  hasCheckpoint(): boolean;
  clearCheckpoint(): ChangePack;

  getSnapshot(): Uint8Array | string;
  getSnapshot_asU8(): Uint8Array;
  getSnapshot_asB64(): string;
  setSnapshot(value: Uint8Array | string): ChangePack;

  getChangesList(): Array<Change>;
  setChangesList(value: Array<Change>): ChangePack;
  clearChangesList(): ChangePack;
  addChanges(value?: Change, index?: number): Change;

  getMinSyncedTicket(): TimeTicket | undefined;
  setMinSyncedTicket(value?: TimeTicket): ChangePack;
  hasMinSyncedTicket(): boolean;
  clearMinSyncedTicket(): ChangePack;

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
  setId(value?: ChangeID): Change;
  hasId(): boolean;
  clearId(): Change;

  getMessage(): string;
  setMessage(value: string): Change;

  getOperationsList(): Array<Operation>;
  setOperationsList(value: Array<Operation>): Change;
  clearOperationsList(): Change;
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
  setClientSeq(value: number): ChangeID;

  getLamport(): string;
  setLamport(value: string): ChangeID;

  getActorId(): Uint8Array | string;
  getActorId_asU8(): Uint8Array;
  getActorId_asB64(): string;
  setActorId(value: Uint8Array | string): ChangeID;

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
  setSet(value?: Operation.Set): Operation;
  hasSet(): boolean;
  clearSet(): Operation;

  getAdd(): Operation.Add | undefined;
  setAdd(value?: Operation.Add): Operation;
  hasAdd(): boolean;
  clearAdd(): Operation;

  getMove(): Operation.Move | undefined;
  setMove(value?: Operation.Move): Operation;
  hasMove(): boolean;
  clearMove(): Operation;

  getRemove(): Operation.Remove | undefined;
  setRemove(value?: Operation.Remove): Operation;
  hasRemove(): boolean;
  clearRemove(): Operation;

  getEdit(): Operation.Edit | undefined;
  setEdit(value?: Operation.Edit): Operation;
  hasEdit(): boolean;
  clearEdit(): Operation;

  getSelect(): Operation.Select | undefined;
  setSelect(value?: Operation.Select): Operation;
  hasSelect(): boolean;
  clearSelect(): Operation;

  getRichEdit(): Operation.RichEdit | undefined;
  setRichEdit(value?: Operation.RichEdit): Operation;
  hasRichEdit(): boolean;
  clearRichEdit(): Operation;

  getStyle(): Operation.Style | undefined;
  setStyle(value?: Operation.Style): Operation;
  hasStyle(): boolean;
  clearStyle(): Operation;

  getIncrease(): Operation.Increase | undefined;
  setIncrease(value?: Operation.Increase): Operation;
  hasIncrease(): boolean;
  clearIncrease(): Operation;

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
    setParentCreatedAt(value?: TimeTicket): Set;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Set;

    getKey(): string;
    setKey(value: string): Set;

    getValue(): JSONElementSimple | undefined;
    setValue(value?: JSONElementSimple): Set;
    hasValue(): boolean;
    clearValue(): Set;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Set;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Set;

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
    setParentCreatedAt(value?: TimeTicket): Add;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Add;

    getPrevCreatedAt(): TimeTicket | undefined;
    setPrevCreatedAt(value?: TimeTicket): Add;
    hasPrevCreatedAt(): boolean;
    clearPrevCreatedAt(): Add;

    getValue(): JSONElementSimple | undefined;
    setValue(value?: JSONElementSimple): Add;
    hasValue(): boolean;
    clearValue(): Add;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Add;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Add;

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
    setParentCreatedAt(value?: TimeTicket): Move;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Move;

    getPrevCreatedAt(): TimeTicket | undefined;
    setPrevCreatedAt(value?: TimeTicket): Move;
    hasPrevCreatedAt(): boolean;
    clearPrevCreatedAt(): Move;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): Move;
    hasCreatedAt(): boolean;
    clearCreatedAt(): Move;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Move;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Move;

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
    setParentCreatedAt(value?: TimeTicket): Remove;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Remove;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): Remove;
    hasCreatedAt(): boolean;
    clearCreatedAt(): Remove;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Remove;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Remove;

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
    setParentCreatedAt(value?: TimeTicket): Edit;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Edit;

    getFrom(): TextNodePos | undefined;
    setFrom(value?: TextNodePos): Edit;
    hasFrom(): boolean;
    clearFrom(): Edit;

    getTo(): TextNodePos | undefined;
    setTo(value?: TextNodePos): Edit;
    hasTo(): boolean;
    clearTo(): Edit;

    getCreatedAtMapByActorMap(): jspb.Map<string, TimeTicket>;
    clearCreatedAtMapByActorMap(): Edit;

    getContent(): string;
    setContent(value: string): Edit;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Edit;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Edit;

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
    setParentCreatedAt(value?: TimeTicket): Select;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Select;

    getFrom(): TextNodePos | undefined;
    setFrom(value?: TextNodePos): Select;
    hasFrom(): boolean;
    clearFrom(): Select;

    getTo(): TextNodePos | undefined;
    setTo(value?: TextNodePos): Select;
    hasTo(): boolean;
    clearTo(): Select;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Select;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Select;

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
    setParentCreatedAt(value?: TimeTicket): RichEdit;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): RichEdit;

    getFrom(): TextNodePos | undefined;
    setFrom(value?: TextNodePos): RichEdit;
    hasFrom(): boolean;
    clearFrom(): RichEdit;

    getTo(): TextNodePos | undefined;
    setTo(value?: TextNodePos): RichEdit;
    hasTo(): boolean;
    clearTo(): RichEdit;

    getCreatedAtMapByActorMap(): jspb.Map<string, TimeTicket>;
    clearCreatedAtMapByActorMap(): RichEdit;

    getContent(): string;
    setContent(value: string): RichEdit;

    getAttributesMap(): jspb.Map<string, string>;
    clearAttributesMap(): RichEdit;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): RichEdit;
    hasExecutedAt(): boolean;
    clearExecutedAt(): RichEdit;

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
    setParentCreatedAt(value?: TimeTicket): Style;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Style;

    getFrom(): TextNodePos | undefined;
    setFrom(value?: TextNodePos): Style;
    hasFrom(): boolean;
    clearFrom(): Style;

    getTo(): TextNodePos | undefined;
    setTo(value?: TextNodePos): Style;
    hasTo(): boolean;
    clearTo(): Style;

    getAttributesMap(): jspb.Map<string, string>;
    clearAttributesMap(): Style;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Style;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Style;

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
    setParentCreatedAt(value?: TimeTicket): Increase;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): Increase;

    getValue(): JSONElementSimple | undefined;
    setValue(value?: JSONElementSimple): Increase;
    hasValue(): boolean;
    clearValue(): Increase;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): Increase;
    hasExecutedAt(): boolean;
    clearExecutedAt(): Increase;

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
  setCreatedAt(value?: TimeTicket): JSONElementSimple;
  hasCreatedAt(): boolean;
  clearCreatedAt(): JSONElementSimple;

  getMovedAt(): TimeTicket | undefined;
  setMovedAt(value?: TimeTicket): JSONElementSimple;
  hasMovedAt(): boolean;
  clearMovedAt(): JSONElementSimple;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): JSONElementSimple;
  hasRemovedAt(): boolean;
  clearRemovedAt(): JSONElementSimple;

  getType(): ValueType;
  setType(value: ValueType): JSONElementSimple;

  getValue(): Uint8Array | string;
  getValue_asU8(): Uint8Array;
  getValue_asB64(): string;
  setValue(value: Uint8Array | string): JSONElementSimple;

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
  getJsonObject(): JSONElement.JSONObject | undefined;
  setJsonObject(value?: JSONElement.JSONObject): JSONElement;
  hasJsonObject(): boolean;
  clearJsonObject(): JSONElement;

  getJsonArray(): JSONElement.JSONArray | undefined;
  setJsonArray(value?: JSONElement.JSONArray): JSONElement;
  hasJsonArray(): boolean;
  clearJsonArray(): JSONElement;

  getPrimitive(): JSONElement.Primitive | undefined;
  setPrimitive(value?: JSONElement.Primitive): JSONElement;
  hasPrimitive(): boolean;
  clearPrimitive(): JSONElement;

  getText(): JSONElement.Text | undefined;
  setText(value?: JSONElement.Text): JSONElement;
  hasText(): boolean;
  clearText(): JSONElement;

  getRichText(): JSONElement.RichText | undefined;
  setRichText(value?: JSONElement.RichText): JSONElement;
  hasRichText(): boolean;
  clearRichText(): JSONElement;

  getCounter(): JSONElement.Counter | undefined;
  setCounter(value?: JSONElement.Counter): JSONElement;
  hasCounter(): boolean;
  clearCounter(): JSONElement;

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
    jsonObject?: JSONElement.JSONObject.AsObject,
    jsonArray?: JSONElement.JSONArray.AsObject,
    primitive?: JSONElement.Primitive.AsObject,
    text?: JSONElement.Text.AsObject,
    richText?: JSONElement.RichText.AsObject,
    counter?: JSONElement.Counter.AsObject,
  }

  export class JSONObject extends jspb.Message {
    getNodesList(): Array<RHTNode>;
    setNodesList(value: Array<RHTNode>): JSONObject;
    clearNodesList(): JSONObject;
    addNodes(value?: RHTNode, index?: number): RHTNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): JSONObject;
    hasCreatedAt(): boolean;
    clearCreatedAt(): JSONObject;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): JSONObject;
    hasMovedAt(): boolean;
    clearMovedAt(): JSONObject;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): JSONObject;
    hasRemovedAt(): boolean;
    clearRemovedAt(): JSONObject;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): JSONObject.AsObject;
    static toObject(includeInstance: boolean, msg: JSONObject): JSONObject.AsObject;
    static serializeBinaryToWriter(message: JSONObject, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): JSONObject;
    static deserializeBinaryFromReader(message: JSONObject, reader: jspb.BinaryReader): JSONObject;
  }

  export namespace JSONObject {
    export type AsObject = {
      nodesList: Array<RHTNode.AsObject>,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class JSONArray extends jspb.Message {
    getNodesList(): Array<RGANode>;
    setNodesList(value: Array<RGANode>): JSONArray;
    clearNodesList(): JSONArray;
    addNodes(value?: RGANode, index?: number): RGANode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): JSONArray;
    hasCreatedAt(): boolean;
    clearCreatedAt(): JSONArray;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): JSONArray;
    hasMovedAt(): boolean;
    clearMovedAt(): JSONArray;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): JSONArray;
    hasRemovedAt(): boolean;
    clearRemovedAt(): JSONArray;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): JSONArray.AsObject;
    static toObject(includeInstance: boolean, msg: JSONArray): JSONArray.AsObject;
    static serializeBinaryToWriter(message: JSONArray, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): JSONArray;
    static deserializeBinaryFromReader(message: JSONArray, reader: jspb.BinaryReader): JSONArray;
  }

  export namespace JSONArray {
    export type AsObject = {
      nodesList: Array<RGANode.AsObject>,
      createdAt?: TimeTicket.AsObject,
      movedAt?: TimeTicket.AsObject,
      removedAt?: TimeTicket.AsObject,
    }
  }


  export class Primitive extends jspb.Message {
    getType(): ValueType;
    setType(value: ValueType): Primitive;

    getValue(): Uint8Array | string;
    getValue_asU8(): Uint8Array;
    getValue_asB64(): string;
    setValue(value: Uint8Array | string): Primitive;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): Primitive;
    hasCreatedAt(): boolean;
    clearCreatedAt(): Primitive;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): Primitive;
    hasMovedAt(): boolean;
    clearMovedAt(): Primitive;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): Primitive;
    hasRemovedAt(): boolean;
    clearRemovedAt(): Primitive;

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
    setNodesList(value: Array<TextNode>): Text;
    clearNodesList(): Text;
    addNodes(value?: TextNode, index?: number): TextNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): Text;
    hasCreatedAt(): boolean;
    clearCreatedAt(): Text;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): Text;
    hasMovedAt(): boolean;
    clearMovedAt(): Text;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): Text;
    hasRemovedAt(): boolean;
    clearRemovedAt(): Text;

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
    setNodesList(value: Array<RichTextNode>): RichText;
    clearNodesList(): RichText;
    addNodes(value?: RichTextNode, index?: number): RichTextNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): RichText;
    hasCreatedAt(): boolean;
    clearCreatedAt(): RichText;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): RichText;
    hasMovedAt(): boolean;
    clearMovedAt(): RichText;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): RichText;
    hasRemovedAt(): boolean;
    clearRemovedAt(): RichText;

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
    setType(value: ValueType): Counter;

    getValue(): Uint8Array | string;
    getValue_asU8(): Uint8Array;
    getValue_asB64(): string;
    setValue(value: Uint8Array | string): Counter;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): Counter;
    hasCreatedAt(): boolean;
    clearCreatedAt(): Counter;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): Counter;
    hasMovedAt(): boolean;
    clearMovedAt(): Counter;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): Counter;
    hasRemovedAt(): boolean;
    clearRemovedAt(): Counter;

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
    JSON_OBJECT = 1,
    JSON_ARRAY = 2,
    PRIMITIVE = 3,
    TEXT = 4,
    RICH_TEXT = 5,
    COUNTER = 6,
  }
}

export class RHTNode extends jspb.Message {
  getKey(): string;
  setKey(value: string): RHTNode;

  getElement(): JSONElement | undefined;
  setElement(value?: JSONElement): RHTNode;
  hasElement(): boolean;
  clearElement(): RHTNode;

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
  setNext(value?: RGANode): RGANode;
  hasNext(): boolean;
  clearNext(): RGANode;

  getElement(): JSONElement | undefined;
  setElement(value?: JSONElement): RGANode;
  hasElement(): boolean;
  clearElement(): RGANode;

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
  setId(value?: TextNodeID): TextNode;
  hasId(): boolean;
  clearId(): TextNode;

  getValue(): string;
  setValue(value: string): TextNode;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): TextNode;
  hasRemovedAt(): boolean;
  clearRemovedAt(): TextNode;

  getInsPrevId(): TextNodeID | undefined;
  setInsPrevId(value?: TextNodeID): TextNode;
  hasInsPrevId(): boolean;
  clearInsPrevId(): TextNode;

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
  setKey(value: string): RichTextNodeAttr;

  getValue(): string;
  setValue(value: string): RichTextNodeAttr;

  getUpdatedAt(): TimeTicket | undefined;
  setUpdatedAt(value?: TimeTicket): RichTextNodeAttr;
  hasUpdatedAt(): boolean;
  clearUpdatedAt(): RichTextNodeAttr;

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
  setId(value?: TextNodeID): RichTextNode;
  hasId(): boolean;
  clearId(): RichTextNode;

  getAttributesMap(): jspb.Map<string, RichTextNodeAttr>;
  clearAttributesMap(): RichTextNode;

  getValue(): string;
  setValue(value: string): RichTextNode;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): RichTextNode;
  hasRemovedAt(): boolean;
  clearRemovedAt(): RichTextNode;

  getInsPrevId(): TextNodeID | undefined;
  setInsPrevId(value?: TextNodeID): RichTextNode;
  hasInsPrevId(): boolean;
  clearInsPrevId(): RichTextNode;

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
  setCreatedAt(value?: TimeTicket): TextNodeID;
  hasCreatedAt(): boolean;
  clearCreatedAt(): TextNodeID;

  getOffset(): number;
  setOffset(value: number): TextNodeID;

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
  setId(value: Uint8Array | string): Client;

  getMetadataMap(): jspb.Map<string, string>;
  clearMetadataMap(): Client;

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
  setClientsList(value: Array<Client>): Clients;
  clearClientsList(): Clients;
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
  setCollection(value: string): DocumentKey;

  getDocument(): string;
  setDocument(value: string): DocumentKey;

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
  setServerSeq(value: string): Checkpoint;

  getClientSeq(): number;
  setClientSeq(value: number): Checkpoint;

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
  setCreatedAt(value?: TimeTicket): TextNodePos;
  hasCreatedAt(): boolean;
  clearCreatedAt(): TextNodePos;

  getOffset(): number;
  setOffset(value: number): TextNodePos;

  getRelativeOffset(): number;
  setRelativeOffset(value: number): TextNodePos;

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
  setLamport(value: string): TimeTicket;

  getDelimiter(): number;
  setDelimiter(value: number): TimeTicket;

  getActorId(): Uint8Array | string;
  getActorId_asU8(): Uint8Array;
  getActorId_asB64(): string;
  setActorId(value: Uint8Array | string): TimeTicket;

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
