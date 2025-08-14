'use client';

import React, { useEffect, useMemo, useState } from 'react';
import './styles/calendar.css';
import styles from './styles/page.module.css';

import { EditorPropsTypes, CalendarValue } from './utils/types';
import { parseDate } from './utils/parseDate';
import Calendar from 'react-calendar';

/**
 * handle calendar component
 */
export default function Scheduler(props: EditorPropsTypes) {
  const { content, actions } = props;
  const [date, onChange] = useState<CalendarValue>(new Date());
  const [text, setText] = useState<string>('');

  const currentDate = date ? parseDate(new Date(date.toString())) : '';

  const existing = useMemo(
    () => content.find((item) => item.date === currentDate),
    [content, currentDate],
  );

  // If a date with an event is selected and editor empty, preload text
  useEffect(() => {
    if (existing && text === '') {
      setText(existing.text);
    }
    if (!existing) {
      setText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.date]);

  const canSave = !!currentDate && text.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    if (existing) {
      actions.updateContent(currentDate, text.trim());
    } else {
      actions.addContent(currentDate, text.trim());
    }
    setText('');
  };

  const handleDelete = () => {
    if (existing) {
      actions.deleteContent(currentDate);
      setText('');
    }
  };

  return (
    <section className={styles.board} aria-label="Scheduler board">
      <div className={styles.calendarWrapper}>
        <div className={styles.calendarWithDots}>
          <Calendar
            onChange={onChange}
            value={date}
            locale="en-EN"
            showNeighboringMonth={false}
            formatDay={(locale, date) =>
              date.toLocaleString('en', { day: 'numeric' })
            }
            tileContent={({ date }) => {
              const matched = content.some(
                (item) => item.date === parseDate(date),
              );
              return matched ? <span className="dot" /> : null;
            }}
          />
        </div>
      </div>
      <div className={styles.panel}>
        <p className={styles.muted}>
          Selected: <strong>{currentDate || '—'}</strong>
        </p>

        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor="event-text">
            {existing ? 'Edit Event' : 'New Event'}
          </label>
          <textarea
            id="event-text"
            placeholder={
              existing ? 'Update selected event…' : 'Describe the event…'
            }
            className={styles.textArea}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setText(e.target.value)
            }
            maxLength={500}
          />
        </div>
        <div className={styles.buttonBar}>
          <button
            className={styles.buttonPrimary}
            disabled={!canSave}
            onClick={handleSave}
            aria-disabled={!canSave}
          >
            {existing ? 'Save Changes' : 'Add Event'}
          </button>
          <button
            className={`${styles.buttonPrimary} ${styles.buttonDanger}`}
            disabled={!existing}
            onClick={handleDelete}
            aria-disabled={!existing}
          >
            Delete
          </button>
        </div>
      </div>
    </section>
  );
}
