import * as jspb from 'google-protobuf'

import * as google_protobuf_timestamp_pb from 'google-protobuf/google/protobuf/timestamp_pb';
import * as google_protobuf_wrappers_pb from 'google-protobuf/google/protobuf/wrappers_pb';


export class ChangePack extends jspb.Message {
  getDocumentKey(): string;
  setDocumentKey(value: string): ChangePack;

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

  getIsRemoved(): boolean;
  setIsRemoved(value: boolean): ChangePack;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ChangePack.AsObject;
  static toObject(includeInstance: boolean, msg: ChangePack): ChangePack.AsObject;
  static serializeBinaryToWriter(message: ChangePack, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ChangePack;
  static deserializeBinaryFromReader(message: ChangePack, reader: jspb.BinaryReader): ChangePack;
}

export namespace ChangePack {
  export type AsObject = {
    documentKey: string,
    checkpoint?: Checkpoint.AsObject,
    snapshot: Uint8Array | string,
    changesList: Array<Change.AsObject>,
    minSyncedTicket?: TimeTicket.AsObject,
    isRemoved: boolean,
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

  getServerSeq(): string;
  setServerSeq(value: string): ChangeID;

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
    serverSeq: string,
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

  getStyle(): Operation.Style | undefined;
  setStyle(value?: Operation.Style): Operation;
  hasStyle(): boolean;
  clearStyle(): Operation;

  getIncrease(): Operation.Increase | undefined;
  setIncrease(value?: Operation.Increase): Operation;
  hasIncrease(): boolean;
  clearIncrease(): Operation;

  getTreeEdit(): Operation.TreeEdit | undefined;
  setTreeEdit(value?: Operation.TreeEdit): Operation;
  hasTreeEdit(): boolean;
  clearTreeEdit(): Operation;

  getTreeStyle(): Operation.TreeStyle | undefined;
  setTreeStyle(value?: Operation.TreeStyle): Operation;
  hasTreeStyle(): boolean;
  clearTreeStyle(): Operation;

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
    style?: Operation.Style.AsObject,
    increase?: Operation.Increase.AsObject,
    treeEdit?: Operation.TreeEdit.AsObject,
    treeStyle?: Operation.TreeStyle.AsObject,
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

    getAttributesMap(): jspb.Map<string, string>;
    clearAttributesMap(): Edit;

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
      attributesMap: Array<[string, string]>,
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


  export class TreeEdit extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): TreeEdit;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): TreeEdit;

    getFrom(): TreePos | undefined;
    setFrom(value?: TreePos): TreeEdit;
    hasFrom(): boolean;
    clearFrom(): TreeEdit;

    getTo(): TreePos | undefined;
    setTo(value?: TreePos): TreeEdit;
    hasTo(): boolean;
    clearTo(): TreeEdit;

    getContentList(): Array<TreeNode>;
    setContentList(value: Array<TreeNode>): TreeEdit;
    clearContentList(): TreeEdit;
    addContent(value?: TreeNode, index?: number): TreeNode;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): TreeEdit;
    hasExecutedAt(): boolean;
    clearExecutedAt(): TreeEdit;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TreeEdit.AsObject;
    static toObject(includeInstance: boolean, msg: TreeEdit): TreeEdit.AsObject;
    static serializeBinaryToWriter(message: TreeEdit, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TreeEdit;
    static deserializeBinaryFromReader(message: TreeEdit, reader: jspb.BinaryReader): TreeEdit;
  }

  export namespace TreeEdit {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      from?: TreePos.AsObject,
      to?: TreePos.AsObject,
      contentList: Array<TreeNode.AsObject>,
      executedAt?: TimeTicket.AsObject,
    }
  }


  export class TreeStyle extends jspb.Message {
    getParentCreatedAt(): TimeTicket | undefined;
    setParentCreatedAt(value?: TimeTicket): TreeStyle;
    hasParentCreatedAt(): boolean;
    clearParentCreatedAt(): TreeStyle;

    getFrom(): TreePos | undefined;
    setFrom(value?: TreePos): TreeStyle;
    hasFrom(): boolean;
    clearFrom(): TreeStyle;

    getTo(): TreePos | undefined;
    setTo(value?: TreePos): TreeStyle;
    hasTo(): boolean;
    clearTo(): TreeStyle;

    getAttributesMap(): jspb.Map<string, string>;
    clearAttributesMap(): TreeStyle;

    getExecutedAt(): TimeTicket | undefined;
    setExecutedAt(value?: TimeTicket): TreeStyle;
    hasExecutedAt(): boolean;
    clearExecutedAt(): TreeStyle;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): TreeStyle.AsObject;
    static toObject(includeInstance: boolean, msg: TreeStyle): TreeStyle.AsObject;
    static serializeBinaryToWriter(message: TreeStyle, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): TreeStyle;
    static deserializeBinaryFromReader(message: TreeStyle, reader: jspb.BinaryReader): TreeStyle;
  }

  export namespace TreeStyle {
    export type AsObject = {
      parentCreatedAt?: TimeTicket.AsObject,
      from?: TreePos.AsObject,
      to?: TreePos.AsObject,
      attributesMap: Array<[string, string]>,
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
    STYLE = 7,
    INCREASE = 8,
    TREE_EDIT = 9,
    TREE_STYLE = 10,
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

  getCounter(): JSONElement.Counter | undefined;
  setCounter(value?: JSONElement.Counter): JSONElement;
  hasCounter(): boolean;
  clearCounter(): JSONElement;

  getTree(): JSONElement.Tree | undefined;
  setTree(value?: JSONElement.Tree): JSONElement;
  hasTree(): boolean;
  clearTree(): JSONElement;

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
    counter?: JSONElement.Counter.AsObject,
    tree?: JSONElement.Tree.AsObject,
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


  export class Tree extends jspb.Message {
    getNodesList(): Array<TreeNode>;
    setNodesList(value: Array<TreeNode>): Tree;
    clearNodesList(): Tree;
    addNodes(value?: TreeNode, index?: number): TreeNode;

    getCreatedAt(): TimeTicket | undefined;
    setCreatedAt(value?: TimeTicket): Tree;
    hasCreatedAt(): boolean;
    clearCreatedAt(): Tree;

    getMovedAt(): TimeTicket | undefined;
    setMovedAt(value?: TimeTicket): Tree;
    hasMovedAt(): boolean;
    clearMovedAt(): Tree;

    getRemovedAt(): TimeTicket | undefined;
    setRemovedAt(value?: TimeTicket): Tree;
    hasRemovedAt(): boolean;
    clearRemovedAt(): Tree;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): Tree.AsObject;
    static toObject(includeInstance: boolean, msg: Tree): Tree.AsObject;
    static serializeBinaryToWriter(message: Tree, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): Tree;
    static deserializeBinaryFromReader(message: Tree, reader: jspb.BinaryReader): Tree;
  }

  export namespace Tree {
    export type AsObject = {
      nodesList: Array<TreeNode.AsObject>,
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
    TEXT = 5,
    COUNTER = 6,
    TREE = 7,
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

export class NodeAttr extends jspb.Message {
  getValue(): string;
  setValue(value: string): NodeAttr;

  getUpdatedAt(): TimeTicket | undefined;
  setUpdatedAt(value?: TimeTicket): NodeAttr;
  hasUpdatedAt(): boolean;
  clearUpdatedAt(): NodeAttr;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): NodeAttr.AsObject;
  static toObject(includeInstance: boolean, msg: NodeAttr): NodeAttr.AsObject;
  static serializeBinaryToWriter(message: NodeAttr, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): NodeAttr;
  static deserializeBinaryFromReader(message: NodeAttr, reader: jspb.BinaryReader): NodeAttr;
}

export namespace NodeAttr {
  export type AsObject = {
    value: string,
    updatedAt?: TimeTicket.AsObject,
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

  getAttributesMap(): jspb.Map<string, NodeAttr>;
  clearAttributesMap(): TextNode;

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
    attributesMap: Array<[string, NodeAttr.AsObject]>,
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

export class TreeNode extends jspb.Message {
  getPos(): TreePos | undefined;
  setPos(value?: TreePos): TreeNode;
  hasPos(): boolean;
  clearPos(): TreeNode;

  getType(): string;
  setType(value: string): TreeNode;

  getValue(): string;
  setValue(value: string): TreeNode;

  getRemovedAt(): TimeTicket | undefined;
  setRemovedAt(value?: TimeTicket): TreeNode;
  hasRemovedAt(): boolean;
  clearRemovedAt(): TreeNode;

  getInsPrevPos(): TreePos | undefined;
  setInsPrevPos(value?: TreePos): TreeNode;
  hasInsPrevPos(): boolean;
  clearInsPrevPos(): TreeNode;

  getDepth(): number;
  setDepth(value: number): TreeNode;

  getAttributesMap(): jspb.Map<string, NodeAttr>;
  clearAttributesMap(): TreeNode;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TreeNode.AsObject;
  static toObject(includeInstance: boolean, msg: TreeNode): TreeNode.AsObject;
  static serializeBinaryToWriter(message: TreeNode, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TreeNode;
  static deserializeBinaryFromReader(message: TreeNode, reader: jspb.BinaryReader): TreeNode;
}

export namespace TreeNode {
  export type AsObject = {
    pos?: TreePos.AsObject,
    type: string,
    value: string,
    removedAt?: TimeTicket.AsObject,
    insPrevPos?: TreePos.AsObject,
    depth: number,
    attributesMap: Array<[string, NodeAttr.AsObject]>,
  }
}

export class TreePos extends jspb.Message {
  getCreatedAt(): TimeTicket | undefined;
  setCreatedAt(value?: TimeTicket): TreePos;
  hasCreatedAt(): boolean;
  clearCreatedAt(): TreePos;

  getOffset(): number;
  setOffset(value: number): TreePos;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): TreePos.AsObject;
  static toObject(includeInstance: boolean, msg: TreePos): TreePos.AsObject;
  static serializeBinaryToWriter(message: TreePos, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): TreePos;
  static deserializeBinaryFromReader(message: TreePos, reader: jspb.BinaryReader): TreePos;
}

export namespace TreePos {
  export type AsObject = {
    createdAt?: TimeTicket.AsObject,
    offset: number,
  }
}

export class User extends jspb.Message {
  getId(): string;
  setId(value: string): User;

  getUsername(): string;
  setUsername(value: string): User;

  getCreatedAt(): google_protobuf_timestamp_pb.Timestamp | undefined;
  setCreatedAt(value?: google_protobuf_timestamp_pb.Timestamp): User;
  hasCreatedAt(): boolean;
  clearCreatedAt(): User;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): User.AsObject;
  static toObject(includeInstance: boolean, msg: User): User.AsObject;
  static serializeBinaryToWriter(message: User, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): User;
  static deserializeBinaryFromReader(message: User, reader: jspb.BinaryReader): User;
}

export namespace User {
  export type AsObject = {
    id: string,
    username: string,
    createdAt?: google_protobuf_timestamp_pb.Timestamp.AsObject,
  }
}

export class Project extends jspb.Message {
  getId(): string;
  setId(value: string): Project;

  getName(): string;
  setName(value: string): Project;

  getPublicKey(): string;
  setPublicKey(value: string): Project;

  getSecretKey(): string;
  setSecretKey(value: string): Project;

  getAuthWebhookUrl(): string;
  setAuthWebhookUrl(value: string): Project;

  getAuthWebhookMethodsList(): Array<string>;
  setAuthWebhookMethodsList(value: Array<string>): Project;
  clearAuthWebhookMethodsList(): Project;
  addAuthWebhookMethods(value: string, index?: number): Project;

  getClientDeactivateThreshold(): string;
  setClientDeactivateThreshold(value: string): Project;

  getCreatedAt(): google_protobuf_timestamp_pb.Timestamp | undefined;
  setCreatedAt(value?: google_protobuf_timestamp_pb.Timestamp): Project;
  hasCreatedAt(): boolean;
  clearCreatedAt(): Project;

  getUpdatedAt(): google_protobuf_timestamp_pb.Timestamp | undefined;
  setUpdatedAt(value?: google_protobuf_timestamp_pb.Timestamp): Project;
  hasUpdatedAt(): boolean;
  clearUpdatedAt(): Project;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Project.AsObject;
  static toObject(includeInstance: boolean, msg: Project): Project.AsObject;
  static serializeBinaryToWriter(message: Project, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Project;
  static deserializeBinaryFromReader(message: Project, reader: jspb.BinaryReader): Project;
}

export namespace Project {
  export type AsObject = {
    id: string,
    name: string,
    publicKey: string,
    secretKey: string,
    authWebhookUrl: string,
    authWebhookMethodsList: Array<string>,
    clientDeactivateThreshold: string,
    createdAt?: google_protobuf_timestamp_pb.Timestamp.AsObject,
    updatedAt?: google_protobuf_timestamp_pb.Timestamp.AsObject,
  }
}

export class UpdatableProjectFields extends jspb.Message {
  getName(): google_protobuf_wrappers_pb.StringValue | undefined;
  setName(value?: google_protobuf_wrappers_pb.StringValue): UpdatableProjectFields;
  hasName(): boolean;
  clearName(): UpdatableProjectFields;

  getAuthWebhookUrl(): google_protobuf_wrappers_pb.StringValue | undefined;
  setAuthWebhookUrl(value?: google_protobuf_wrappers_pb.StringValue): UpdatableProjectFields;
  hasAuthWebhookUrl(): boolean;
  clearAuthWebhookUrl(): UpdatableProjectFields;

  getAuthWebhookMethods(): UpdatableProjectFields.AuthWebhookMethods | undefined;
  setAuthWebhookMethods(value?: UpdatableProjectFields.AuthWebhookMethods): UpdatableProjectFields;
  hasAuthWebhookMethods(): boolean;
  clearAuthWebhookMethods(): UpdatableProjectFields;

  getClientDeactivateThreshold(): google_protobuf_wrappers_pb.StringValue | undefined;
  setClientDeactivateThreshold(value?: google_protobuf_wrappers_pb.StringValue): UpdatableProjectFields;
  hasClientDeactivateThreshold(): boolean;
  clearClientDeactivateThreshold(): UpdatableProjectFields;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): UpdatableProjectFields.AsObject;
  static toObject(includeInstance: boolean, msg: UpdatableProjectFields): UpdatableProjectFields.AsObject;
  static serializeBinaryToWriter(message: UpdatableProjectFields, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): UpdatableProjectFields;
  static deserializeBinaryFromReader(message: UpdatableProjectFields, reader: jspb.BinaryReader): UpdatableProjectFields;
}

export namespace UpdatableProjectFields {
  export type AsObject = {
    name?: google_protobuf_wrappers_pb.StringValue.AsObject,
    authWebhookUrl?: google_protobuf_wrappers_pb.StringValue.AsObject,
    authWebhookMethods?: UpdatableProjectFields.AuthWebhookMethods.AsObject,
    clientDeactivateThreshold?: google_protobuf_wrappers_pb.StringValue.AsObject,
  }

  export class AuthWebhookMethods extends jspb.Message {
    getMethodsList(): Array<string>;
    setMethodsList(value: Array<string>): AuthWebhookMethods;
    clearMethodsList(): AuthWebhookMethods;
    addMethods(value: string, index?: number): AuthWebhookMethods;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): AuthWebhookMethods.AsObject;
    static toObject(includeInstance: boolean, msg: AuthWebhookMethods): AuthWebhookMethods.AsObject;
    static serializeBinaryToWriter(message: AuthWebhookMethods, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): AuthWebhookMethods;
    static deserializeBinaryFromReader(message: AuthWebhookMethods, reader: jspb.BinaryReader): AuthWebhookMethods;
  }

  export namespace AuthWebhookMethods {
    export type AsObject = {
      methodsList: Array<string>,
    }
  }

}

export class DocumentSummary extends jspb.Message {
  getId(): string;
  setId(value: string): DocumentSummary;

  getKey(): string;
  setKey(value: string): DocumentSummary;

  getSnapshot(): string;
  setSnapshot(value: string): DocumentSummary;

  getCreatedAt(): google_protobuf_timestamp_pb.Timestamp | undefined;
  setCreatedAt(value?: google_protobuf_timestamp_pb.Timestamp): DocumentSummary;
  hasCreatedAt(): boolean;
  clearCreatedAt(): DocumentSummary;

  getAccessedAt(): google_protobuf_timestamp_pb.Timestamp | undefined;
  setAccessedAt(value?: google_protobuf_timestamp_pb.Timestamp): DocumentSummary;
  hasAccessedAt(): boolean;
  clearAccessedAt(): DocumentSummary;

  getUpdatedAt(): google_protobuf_timestamp_pb.Timestamp | undefined;
  setUpdatedAt(value?: google_protobuf_timestamp_pb.Timestamp): DocumentSummary;
  hasUpdatedAt(): boolean;
  clearUpdatedAt(): DocumentSummary;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DocumentSummary.AsObject;
  static toObject(includeInstance: boolean, msg: DocumentSummary): DocumentSummary.AsObject;
  static serializeBinaryToWriter(message: DocumentSummary, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DocumentSummary;
  static deserializeBinaryFromReader(message: DocumentSummary, reader: jspb.BinaryReader): DocumentSummary;
}

export namespace DocumentSummary {
  export type AsObject = {
    id: string,
    key: string,
    snapshot: string,
    createdAt?: google_protobuf_timestamp_pb.Timestamp.AsObject,
    accessedAt?: google_protobuf_timestamp_pb.Timestamp.AsObject,
    updatedAt?: google_protobuf_timestamp_pb.Timestamp.AsObject,
  }
}

export class Presence extends jspb.Message {
  getClock(): number;
  setClock(value: number): Presence;

  getDataMap(): jspb.Map<string, string>;
  clearDataMap(): Presence;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Presence.AsObject;
  static toObject(includeInstance: boolean, msg: Presence): Presence.AsObject;
  static serializeBinaryToWriter(message: Presence, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Presence;
  static deserializeBinaryFromReader(message: Presence, reader: jspb.BinaryReader): Presence;
}

export namespace Presence {
  export type AsObject = {
    clock: number,
    dataMap: Array<[string, string]>,
  }
}

export class Client extends jspb.Message {
  getId(): Uint8Array | string;
  getId_asU8(): Uint8Array;
  getId_asB64(): string;
  setId(value: Uint8Array | string): Client;

  getPresence(): Presence | undefined;
  setPresence(value?: Presence): Client;
  hasPresence(): boolean;
  clearPresence(): Client;

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
    presence?: Presence.AsObject,
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

export class DocEvent extends jspb.Message {
  getType(): DocEventType;
  setType(value: DocEventType): DocEvent;

  getPublisher(): Client | undefined;
  setPublisher(value?: Client): DocEvent;
  hasPublisher(): boolean;
  clearPublisher(): DocEvent;

  getDocumentId(): string;
  setDocumentId(value: string): DocEvent;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DocEvent.AsObject;
  static toObject(includeInstance: boolean, msg: DocEvent): DocEvent.AsObject;
  static serializeBinaryToWriter(message: DocEvent, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DocEvent;
  static deserializeBinaryFromReader(message: DocEvent, reader: jspb.BinaryReader): DocEvent;
}

export namespace DocEvent {
  export type AsObject = {
    type: DocEventType,
    publisher?: Client.AsObject,
    documentId: string,
  }
}

export enum ValueType { 
  VALUE_TYPE_NULL = 0,
  VALUE_TYPE_BOOLEAN = 1,
  VALUE_TYPE_INTEGER = 2,
  VALUE_TYPE_LONG = 3,
  VALUE_TYPE_DOUBLE = 4,
  VALUE_TYPE_STRING = 5,
  VALUE_TYPE_BYTES = 6,
  VALUE_TYPE_DATE = 7,
  VALUE_TYPE_JSON_OBJECT = 8,
  VALUE_TYPE_JSON_ARRAY = 9,
  VALUE_TYPE_TEXT = 10,
  VALUE_TYPE_INTEGER_CNT = 11,
  VALUE_TYPE_LONG_CNT = 12,
  VALUE_TYPE_TREE = 13,
}
export enum DocEventType { 
  DOC_EVENT_TYPE_DOCUMENTS_CHANGED = 0,
  DOC_EVENT_TYPE_DOCUMENTS_WATCHED = 1,
  DOC_EVENT_TYPE_DOCUMENTS_UNWATCHED = 2,
  DOC_EVENT_TYPE_PRESENCE_CHANGED = 3,
}
