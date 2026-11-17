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
};

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
}: Props) {
  return (
    <nav className="rail" aria-label="Channels">
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
                disabled={offline && !open}
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
          You&rsquo;re alone here. Add a user or open this page in another tab.
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
