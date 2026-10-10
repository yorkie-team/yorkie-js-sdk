/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export enum Code {
  // Ok is returned when the operation completed successfully.
  Ok = 'ok',

  // ErrClientNotActivated is returned when the client is not active.
  ErrClientNotActivated = 'ErrClientNotActivated',

  // ErrClientNotFound is returned when the client is not found.
  ErrClientNotFound = 'ErrClientNotFound',

  // ErrUnimplemented is returned when the operation is not implemented.
  ErrUnimplemented = 'ErrUnimplemented',

  // ErrInvalidType is returned when the type is invalid.
  ErrInvalidType = 'ErrInvalidType',

  // ErrDummy is used to verify errors for testing purposes.
  ErrDummy = 'ErrDummy',

  // ErrNotAttached is returned when the resource is not attached.
  ErrNotAttached = 'ErrNotAttached',

  // ErrNotDetached is returned when the resource is not detached.
  ErrNotDetached = 'ErrNotDetached',

  // ErrAlreadyAttached is returned when a document with the same key is
  // already attached (or being attached) to this client.
  ErrAlreadyAttached = 'ErrAlreadyAttached',

  // ErrSessionNotFound is returned when the server no longer recognises a
  // channel session_id (e.g. reclaimed after TTL). Callers should treat this
  // as "session expired" and retry as a first-call (empty session_id).
  ErrSessionNotFound = 'ErrSessionNotFound',

  // ErrDocumentRemoved is returned when the document is removed.
  ErrDocumentRemoved = 'ErrDocumentRemoved',

  // ErrDocumentSizeExceedsLimit is returned when the document size exceeds the limit.
  ErrDocumentSizeExceedsLimit = 'ErrDocumentSizeExceedsLimit',

  // ErrChangeTooLarge is returned when a single change is too large to store.
  ErrChangeTooLarge = 'ErrChangeTooLarge',

  // ErrDocumentSchemaValidationFailed is returned when the document schema validation failed.
  ErrDocumentSchemaValidationFailed = 'ErrDocumentSchemaValidationFailed',

  // InvalidObjectKey is returned when the object key is invalid.
  ErrInvalidObjectKey = 'ErrInvalidObjectKey',

  // ErrInvalidArgument is returned when the argument is invalid.
  ErrInvalidArgument = 'ErrInvalidArgument',

  // ErrNotInitialized is returned when required initialization has not been completed.
  ErrNotInitialized = 'ErrNotInitialized',

  // ErrNotReady is returned when execution of following actions is not ready.
  ErrNotReady = 'ErrNotReady',

  // ErrRefused is returned when the execution is rejected.
  ErrRefused = 'ErrRefused',

  // ErrContextNotProvided is returned when a required React context is missing
  ErrContextNotProvided = 'ErrContextNotProvided',

  // ErrPermissionDenied is returned when the authorization webhook denies the request.
  ErrPermissionDenied = 'ErrPermissionDenied',

  // ErrUnauthenticated is returned when the request does not have valid authentication credentials.
  ErrUnauthenticated = 'ErrUnauthenticated',

  // ErrTooManySubscribers is returned when the number of subscribers exceeds the limit.
  ErrTooManySubscribers = 'ErrTooManySubscribers',

  // ErrTooManyAttachments is returned when the number of attachments exceeds the limit.
  ErrTooManyAttachments = 'ErrTooManyAttachments',

  // ErrEpochMismatch is returned when the document has been compacted
  // and the client's epoch no longer matches the server's epoch.
  ErrEpochMismatch = 'ErrEpochMismatch',

  // ErrDocumentOpenElsewhere is returned when an offline-persistence attach
  // cannot take the single-active-session lock because another session — in
  // practice another tab of the same client — already holds it for this
  // document. It is its own code so a consumer can fall back to a
  // non-persisting client on exactly this condition without matching on
  // message text.
  ErrDocumentOpenElsewhere = 'ErrDocumentOpenElsewhere',

  // ErrChangeApplyFailed is returned when a change cannot be applied to a
  // document. The checkpoint only advances after the changes in a pack have
  // been applied, so the server redelivers a pack whose change throws: the
  // document stops making progress until the cause is fixed. This code names
  // that condition so it is diagnosable instead of surfacing as whatever the
  // failing operation happened to throw.
  ErrChangeApplyFailed = 'ErrChangeApplyFailed',

  // ErrWatchStreamIdle is reported when a watch stream stays silent for longer
  // than the heartbeat interval the server advertised allows, which is how a
  // half-open connection is told from a quiet document.
  ErrWatchStreamIdle = 'ErrWatchStreamIdle',
}

/**
 * `YorkieError` is an error returned by a Yorkie operation.
 */
export class YorkieError extends Error {
  name = 'YorkieError';
  stack?: string;

  constructor(
    readonly code: Code,
    readonly message: string,
  ) {
    super(message);
    this.toString = (): string => `[code=${this.code}]: ${this.message}`;
  }
}

/**
 * `ChangeApplyDetail` describes which change, and which operation of it,
 * could not be applied. `docKey` is unknown at the throw site inside the
 * change itself and is filled in by the document; `opIndex` and `operation`
 * are absent when the failure was not raised by a single operation.
 *
 * `operation` names the operation — its type and the element it targets —
 * and MUST NOT carry the operation's payload: this detail is spliced into a
 * message that is thrown to application code and logged at the default level,
 * so a payload there would publish plaintext document content.
 */
export type ChangeApplyDetail = {
  docKey?: string;
  changeID: string;
  opIndex?: number;
  operation?: string;
  cause: unknown;
};

/**
 * `ChangeApplyError` is thrown when a change cannot be applied to a document.
 *
 * It names the document, the change and the operation that failed, and keeps
 * the original error in `cause`. Without it the only signal is whatever the
 * operation threw, which says nothing about which change is stuck — and
 * because the checkpoint does not advance past a change that throws, the
 * server keeps redelivering it.
 */
export class ChangeApplyError extends YorkieError {
  name = 'ChangeApplyError';

  readonly docKey?: string;
  readonly changeID: string;
  readonly opIndex?: number;
  readonly operation?: string;
  readonly cause: unknown;

  constructor(detail: ChangeApplyDetail) {
    const { docKey, changeID, opIndex, operation, cause } = detail;
    const where = docKey === undefined ? '' : ` of document "${docKey}"`;
    const which =
      opIndex === undefined ? '' : ` at operation ${opIndex} (${operation})`;
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      Code.ErrChangeApplyFailed,
      `failed to apply change ${changeID}${where}${which}: ${reason}`,
    );

    this.docKey = docKey;
    this.changeID = changeID;
    this.opIndex = opIndex;
    this.operation = operation;
    this.cause = cause;
  }

  /**
   * `withDocKey` returns this error named with the given document key. The
   * change knows which operation failed but not which document it belongs
   * to, so the document adds its key as the error passes through.
   */
  public withDocKey(docKey: string): ChangeApplyError {
    if (this.docKey === docKey) {
      return this;
    }

    return new ChangeApplyError({
      docKey,
      changeID: this.changeID,
      opIndex: this.opIndex,
      operation: this.operation,
      cause: this.cause,
    });
  }
}
