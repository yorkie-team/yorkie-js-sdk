import { useEffect, useRef, useState } from 'react';
import type { ChannelInfo, ChatPresence } from './model';

type Props = {
  channels: Array<ChannelInfo>;
  people: Array<ChatPresence>;
  me: ChatPresence;
  openId: string;
  onOpen: (channelId: string) => void;
  /**
   * Switching needs the server, so it is off while the pane is offline. The
   * others cannot be seen either, so the online list says why.
   */
  offline: boolean;
  /**
   * Switching is also held while a channel is still opening or the pane is
   * going on or offline: leaving a channel mid-attach would leave it attached.
   */
  busy: boolean;
  /** Narrow panes show the rail over the channel; `open` moves focus into it. */
  open: boolean;
  onClose: () => void;
};

const leaveMs = 360;

type Leaving = { key: string; channelId: string; color: ChatPresence['color'] };

/**
 * `useLeavingDots` keeps a dot on the row someone just left (moved channel or
 * went away) for one exit animation, so the move reads as a move and not a
 * jump cut.
 */
function useLeavingDots(people: Array<ChatPresence>): Array<Leaving> {
  const before = useRef<Map<string, ChatPresence>>(new Map());
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [leaving, setLeaving] = useState<Array<Leaving>>([]);

  useEffect(() => {
    const now = new Map(people.map((p) => [p.userId, p]));
    const gone: Array<Leaving> = [];
    for (const [id, p] of before.current) {
      if (now.get(id)?.channelId !== p.channelId) {
        gone.push({
          key: `${id}-${p.channelId}-${Date.now()}`,
          channelId: p.channelId,
          color: p.color,
        });
      }
    }
    before.current = now;
    if (!gone.length) return;
    // Show the ghosts, then drop them after one exit. Neither timer is
    // cancelled by the next presence change, so a burst keeps every ghost.
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.current.delete(t);
        fn();
      }, ms);
      timers.current.add(t);
    };
    later(() => setLeaving((l) => [...l, ...gone]), 0);
    later(() => setLeaving((l) => l.filter((x) => !gone.includes(x))), leaveMs);
  }, [people]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return leaving;
}

function names(list: Array<ChatPresence>): string {
  return list.map((p) => p.name).join(', ');
}

/**
 * `ChannelRail` lists the channels with a dot for each person in them right
 * now, then who is online. Both come from the workspace document's presence.
 */
export default function ChannelRail({
  channels,
  people,
  me,
  openId,
  onOpen,
  offline,
  busy,
  open: shown,
  onClose,
}: Props) {
  const rail = useRef<HTMLElement>(null);
  const leaving = useLeavingDots(people);

  useEffect(() => {
    if (shown) {
      rail.current
        ?.querySelector<HTMLElement>('button:not(:disabled)')
        ?.focus();
    }
  }, [shown]);

  return (
    <nav
      ref={rail}
      className="rail"
      aria-label="Channels"
      onKeyDown={(e) => shown && e.key === 'Escape' && onClose()}
    >
      <h2 className="rail__heading">Channels</h2>
      <ul className="rail__list">
        {channels.map((channel) => {
          const here = people.filter((p) => p.channelId === channel.id);
          const open = channel.id === openId;
          return (
            <li key={channel.id}>
              <button
                type="button"
                className="rail__channel"
                aria-current={open ? 'page' : undefined}
                disabled={(offline || busy) && !open}
                title={
                  offline && !open ? 'Go online to switch channels' : undefined
                }
                onClick={() => onOpen(channel.id)}
              >
                <span className="rail__name">
                  <span className="rail__hash" aria-hidden="true">
                    #
                  </span>
                  {channel.name}
                </span>
                <span
                  className="dots"
                  role="img"
                  aria-label={
                    here.length ? `Here: ${names(here)}` : 'Nobody here'
                  }
                >
                  {here.map((p) => (
                    <span
                      key={p.userId}
                      className="dot"
                      data-color={p.color}
                      title={p.name}
                    />
                  ))}
                  {leaving
                    .filter((l) => l.channelId === channel.id)
                    .map((l) => (
                      <span
                        key={l.key}
                        className="dot"
                        data-color={l.color}
                        data-leaving=""
                      />
                    ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="rail__heading">
        {offline ? 'Online' : `Online · ${people.length}`}
      </h2>
      {offline ? (
        <p className="rail__alone">
          You&rsquo;re offline. Others can&rsquo;t see you, and you can&rsquo;t
          see them, until you go online.
        </p>
      ) : people.length <= 1 ? (
        <p className="rail__alone">
          You&rsquo;re alone here. Open this page in another tab to chat with
          yourself.
        </p>
      ) : (
        <ul className="rail__list">
          {people.map((p) => (
            <li key={p.userId} className="rail__person">
              <span className="dot" data-color={p.color} aria-hidden="true" />
              <span className="rail__person-name">
                {p.name}
                {p.userId === me.userId && (
                  <span className="rail__you"> (you)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
