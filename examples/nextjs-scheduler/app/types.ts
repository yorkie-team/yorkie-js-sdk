import type { JSONArray } from '@yorkie-js/sdk';

// An event on a calendar day. `date` is 'YYYY-MM-DD', so every viewer reads
// the same day whatever their time zone.
export interface CalendarEvent {
  date: string;
  text: string;
}

export type CalendarDoc = { content: JSONArray<CalendarEvent> };
export type Presence = { userName: string };

export type Status = 'connecting' | 'connected' | 'offline' | 'error';

export interface Peer {
  clientID: string;
  userName: string;
  isMe: boolean;
}

/**
 * `toISODate` returns the calendar day of `date` as 'YYYY-MM-DD'.
 */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * `formatDate` formats a 'YYYY-MM-DD' day for display, e.g. 'Sat, Nov 14, 2026'.
 */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
