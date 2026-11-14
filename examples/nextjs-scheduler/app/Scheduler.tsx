'use client';

import { useState } from 'react';
import Calendar from 'react-calendar';
import './styles/calendar.css';
import styles from './styles/page.module.css';
import { formatDate, toISODate, type CalendarEvent } from './types';

interface SchedulerProps {
  content: CalendarEvent[];
  actions: {
    addContent(date: string, text: string): void;
    deleteContent(date: string): void;
    updateContent(date: string, text: string): void;
  };
}

interface EventFormProps extends SchedulerProps {
  date: string;
}

function EventForm({ date, content, actions }: EventFormProps) {
  const existing = content.find((item) => item.date === date);
  const [text, setText] = useState(existing?.text ?? '');
  const canSave = text.trim().length > 0 && text.trim() !== existing?.text;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    if (existing) {
      actions.updateContent(date, text.trim());
    } else {
      actions.addContent(date, text.trim());
    }
  };

  return (
    <form className={styles.panel} onSubmit={handleSubmit}>
      <label className={styles.label} htmlFor="event-text">
        {formatDate(date)}
      </label>
      <textarea
        id="event-text"
        className={styles.textArea}
        placeholder="Describe the event…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
      />
      <div className={styles.buttonBar}>
        <button type="submit" className={styles.button} disabled={!canSave}>
          {existing ? 'Save changes' : 'Add event'}
        </button>
        {existing && (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => actions.deleteContent(date)}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

export default function Scheduler({ content, actions }: SchedulerProps) {
  const [value, setValue] = useState(() => new Date());
  const selected = toISODate(value);
  const hasEvent = content.some((item) => item.date === selected);

  return (
    <section className={styles.board}>
      <Calendar
        locale="en-US"
        showNeighboringMonth={false}
        value={value}
        onChange={(next) => next instanceof Date && setValue(next)}
        tileContent={({ date }) =>
          content.some((item) => item.date === toISODate(date)) ? (
            <span className="dot" aria-label="Has event" />
          ) : null
        }
      />
      {/* Remount the form when the day changes or its event is added or
          deleted (here or by a peer), so it starts from the stored text. */}
      <EventForm
        key={`${selected}-${hasEvent}`}
        date={selected}
        content={content}
        actions={actions}
      />
    </section>
  );
}
