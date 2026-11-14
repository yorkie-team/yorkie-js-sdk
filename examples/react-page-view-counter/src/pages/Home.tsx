import { TOPICS } from '../topics';

export function Home({ onSelect }: { onSelect: (topicId: string) => void }) {
  return (
    <section className="home">
      <h1>Topics</h1>
      <p className="lede">
        Opening a topic adds one view to today's count for that page.
      </p>
      <ul className="topic-list">
        {TOPICS.map((t) => (
          <li key={t.id}>
            <button
              className="topic-link"
              type="button"
              onClick={() => onSelect(t.id)}
            >
              {t.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
