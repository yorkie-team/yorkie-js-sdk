'use client';

import React, { useState } from 'react';
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
  const [text, setText] = useState<string>('Enter text here!');

  const currentDate = date ? parseDate(new Date(date.toString())) : '';

  const eventHandler = (event: string) => {
    let flag = false;
    switch (event) {
      case 'PUSH':
        flag = false;
        content.forEach((item) => {
          if (item.date === currentDate) {
            flag = !flag;
            return 0;
          }
        });

        flag
          ? actions.updateContent(currentDate, text)
          : actions.addContent(currentDate, text);

        setText('Enter text here!');
        break;
      case 'DELETE':
        actions.deleteContent(currentDate);
        break;
    }
  };

  return (
    <article>
      <div>
        <Calendar
          onChange={onChange}
          value={date}
          locale="en-EN"
          showNeighboringMonth={false}
          formatDay={(locale, date) =>
            date.toLocaleString('en', { day: 'numeric' })
          }
          tileClassName={({ date }) =>
            content.find((item) => item.date === parseDate(date))
              ? 'highlight'
              : ''
          }
        />
        <p>selected day : {currentDate}</p>
        <div className={styles.memo}>
          {content.map((item, i: number) => {
            if (item.date === currentDate) {
              return <p key={i}>{item.text}</p>;
            }
          })}
        </div>
        <div className={styles.inputForm_editor}>
          <h3>input form</h3>
          <textarea
            className={styles.textArea}
            value={text}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setText(e.target.value)
            }
          />
        </div>
        <button className="button" onClick={() => eventHandler('PUSH')}>
          push
        </button>
        <button className="button" onClick={() => eventHandler('DELETE')}>
          pop
        </button>
      </div>
    </article>
  );
}
