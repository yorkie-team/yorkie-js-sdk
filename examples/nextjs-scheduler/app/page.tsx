// yorkie-js-sdk runs in the browser, so this page is a client component.
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import yorkie, { StreamConnectionStatus, type JSONArray } from '@yorkie-js/sdk';
import Header from './Header';
import Scheduler from './Scheduler';
import styles from './styles/page.module.css';
import {
  toISODate,
  type CalendarDoc,
  type CalendarEvent,
  type Peer,
  type Presence,
  type Status,
} from './types';

const API_ADDR =
  process.env.NEXT_PUBLIC_YORKIE_API_ADDR || 'http://localhost:8080';
const API_KEY = process.env.NEXT_PUBLIC_YORKIE_API_KEY || '';

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace'];

// Sample events for a new calendar, in the current month.
function defaultContent() {
  const month = toISODate(new Date()).slice(0, 7);
  return [
    { date: `${month}-01`, text: 'Payday' },
    { date: `${month}-17`, text: "Garry's birthday" },
  ] as JSONArray<CalendarEvent>;
}

function App() {
  // The calendar named by `?key=`, or a new one each day. The day is the UTC
  // date, so viewers in every time zone open the same calendar.
  const keyParam = useSearchParams().get('key');
  const [doc] = useState(
    () =>
      new yorkie.Document<CalendarDoc, Presence>(
        keyParam || `nextjs-scheduler-${new Date().toISOString().slice(0, 10)}`,
      ),
  );
  const docKey = doc.getKey();
  const [content, setContent] = useState<CalendarEvent[] | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [status, setStatus] = useState<Status>('connecting');

  useEffect(() => {
    const client = new yorkie.Client({ rpcAddr: API_ADDR, apiKey: API_KEY });

    const syncContent = () =>
      setContent(
        doc.getRoot().content.map(({ date, text }) => ({ date, text })),
      );

    const unsubscribers = [
      // Local and remote changes to the document.
      doc.subscribe(syncContent),
      // Peers joining, leaving or changing their presence.
      doc.subscribe('presence', () =>
        setPeers(
          doc
            .getPresences()
            // Skip presences that have not arrived yet.
            .filter(({ presence }) => presence.userName)
            .map(({ clientID, presence }) => ({
              clientID,
              userName: presence.userName,
              isMe: clientID === client.getActorID(),
            })),
        ),
      ),
      // The watch stream that delivers remote changes.
      doc.subscribe('connection', (event) =>
        setStatus(
          event.value === StreamConnectionStatus.Connected
            ? 'connected'
            : 'offline',
        ),
      ),
    ];

    async function attach() {
      await client.activate();
      await client.attach(doc, {
        initialPresence: {
          userName: NAMES[Math.floor(Math.random() * NAMES.length)],
        },
      });

      // The first client to open this calendar fills in sample events.
      doc.update((root) => {
        if (!root.content) {
          root.content = defaultContent();
        }
      }, 'create default content if not exists');
      syncContent();
      setStatus('connected');
    }

    const attached = attach().catch(() => setStatus('error'));

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      // Once setup settles, leave the document and end the session.
      attached.then(async () => {
        if (client.has(doc.getKey())) await client.detach(doc);
        if (client.isActive()) await client.deactivate();
      });
    };
  }, [doc]);

  const actions = {
    addContent(date: string, text: string) {
      doc.update((root) => {
        root.content.push({ date, text });
      });
    },

    deleteContent(date: string) {
      doc.update((root) => {
        const index = root.content.findIndex((item) => item.date === date);
        if (index !== -1) {
          root.content.delete?.(index);
        }
      });
    },

    updateContent(date: string, text: string) {
      doc.update((root) => {
        const target = root.content.find((item) => item.date === date);
        if (target) {
          target.text = text;
        }
      });
    },
  };

  return (
    <>
      <Header docKey={docKey} status={status} peers={peers} />
      <main className={styles.main}>
        {status === 'error' ? (
          <p className={styles.message} role="alert">
            Couldn&apos;t reach the Yorkie server at <code>{API_ADDR}</code>.
            Check that it&apos;s running, then reload.
          </p>
        ) : content === null ? (
          <p className={styles.message}>Loading the calendar…</p>
        ) : (
          <Scheduler content={content} actions={actions} />
        )}
      </main>
    </>
  );
}

export default function Page() {
  // `useSearchParams` needs a Suspense boundary in a static export.
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}
