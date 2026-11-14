import { StreamConnectionStatus } from '@yorkie-js/sdk';

export type Status = 'connecting' | 'connected' | 'offline' | 'error' | 'full';

// The server rejects an attach beyond the project's "Max Attachments Per
// Document" with the Connect status `resource_exhausted` (code 8). The same
// status also covers other limits, such as a document or change that is too
// large, and the server attaches no Yorkie error code to this rejection, so
// the message is the only way to tell them apart. A dedicated error code on
// the server would make this check cleaner.
const RESOURCE_EXHAUSTED = 8;
const ATTACHMENT_LIMIT_MESSAGE = 'attachment limit exceeded';

/**
 * `isAttachmentLimitError` tells the "document is full" rejection apart from
 * other errors by its status code and message.
 */
export function isAttachmentLimitError(err: unknown): boolean {
  const { code, rawMessage } = (err ?? {}) as {
    code?: unknown;
    rawMessage?: unknown;
  };
  return (
    code === RESOURCE_EXHAUSTED &&
    typeof rawMessage === 'string' &&
    rawMessage.includes(ATTACHMENT_LIMIT_MESSAGE)
  );
}

/**
 * `statusOf` maps the document's state to what the header shows. When the
 * project's "Max Subscribers Per Document" is reached, the client stays
 * attached but its watch stream is refused, so it shows Offline while the SDK
 * retries every second.
 */
export function statusOf(
  loading: boolean,
  error: Error | undefined,
  connection: StreamConnectionStatus,
): Status {
  if (loading) return 'connecting';
  if (error) return isAttachmentLimitError(error) ? 'full' : 'error';
  return connection === StreamConnectionStatus.Connected
    ? 'connected'
    : 'offline';
}
