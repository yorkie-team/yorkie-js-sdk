import { StreamConnectionStatus } from '@yorkie-js/sdk';

export type Status = 'connecting' | 'connected' | 'offline' | 'error' | 'full';

// The server rejects an attach beyond the project's "Max Attachments Per
// Document" with the Connect status `resource_exhausted` (code 8).
const RESOURCE_EXHAUSTED = 8;

/**
 * `isAttachmentLimitError` tells the "document is full" rejection apart from
 * other errors by its status code.
 */
export function isAttachmentLimitError(err: unknown): boolean {
  return (err as { code?: unknown } | undefined)?.code === RESOURCE_EXHAUSTED;
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
