/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useState, useRef } from 'react';
import { DocEventType, Change, type TransactionEvent } from 'yorkie-js-sdk';
import Slider from 'rc-slider';
import { JSONView } from '../components/JsonView';
import { CursorIcon, DocumentIcon } from '../icons';
import {
  TransactionEventType,
  useTransactionEvents,
} from '../contexts/YorkieSource';

const SLIDER_MARK_WIDTH = 24;

const getEventInfo = (event: TransactionEvent) => {
  const info = [];
  for (const docEvent of event) {
    if (
      docEvent.type === DocEventType.LocalChange ||
      docEvent.type === DocEventType.RemoteChange
    ) {
      const change = Change.fromStruct(docEvent.rawChange);
      info.push({
        type: docEvent.type,
        value: docEvent.value,
        changeInfo: {
          operations: change.getOperations().map((op) => {
            // TODO(chacha912): Enhance to show the operation structure.
            return {
              desc: op.toTestString(),
              executedAt: op.getExecutedAt().toTestString(),
            };
          }),
          presenceChange: change.getPresenceChange(),
          actor: change.getID().getActorID(),
          changeID: change.getID().toTestString(),
          message: change.getMessage(),
        },
      });
      continue;
    }
    info.push({
      type: docEvent.type,
      value: docEvent.value,
    });
  }
  return info;
};

export function History({
  style,
  selectedEvent,
  selectedEventIndexInfo,
  setSelectedEventIndexInfo,
}) {
  const [openHistory, setOpenHistory] = useState(false);
  const [sliderMarks, setSliderMarks] = useState({});
  const scrollRef = useRef(null);
  const {
    originalEvents,
    presenceFilteredEvents,
    hidePresenceEvents,
    setHidePresenceEvents,
  } = useTransactionEvents();

  const events = hidePresenceEvents ? presenceFilteredEvents : originalEvents;

  const handleSliderEvent = (value) => {
    setSelectedEventIndexInfo({
      index: value,
      isLast: value === events.length - 1,
    });
  };

  const toggleHidePresenceEvent = () => {
    setSelectedEventIndexInfo({
      index: null,
      isLast: true,
    });
    setHidePresenceEvents((prev: boolean) => !prev);
  };

  useEffect(() => {
    if (!openHistory || selectedEventIndexInfo.index === null) return;
    if (scrollRef.current) {
      scrollRef.current.scrollLeft =
        selectedEventIndexInfo.index * SLIDER_MARK_WIDTH -
        scrollRef.current.clientWidth / 2;
    }
  }, [openHistory, selectedEventIndexInfo]);

  useEffect(() => {
    if (!openHistory || events.length === 0) return;

    const marks = {};
    for (const [index, event] of events.entries()) {
      const source = event.event[0].source;
      const transactionEventType = event.transactionEventType;

      marks[index] = (
        <span
          className={`mark-history mark-${source} mark-${transactionEventType}`}
        >
          {transactionEventType === TransactionEventType.Presence ? (
            <CursorIcon />
          ) : (
            <DocumentIcon />
          )}
        </span>
      );
    }
    setSliderMarks(marks);
  }, [openHistory, events]);

  return (
    <div
      className="devtools-history"
      style={{
        minHeight: openHistory ? 80 : 40,
        maxHeight: openHistory ? '90%' : 40,
        ...style,
      }}
    >
      <div className="content-wrap">
        <div className="devtools-tab-toolbar">
          <span className="title">
            History
            <button
              className="toggle-tab-btn"
              onClick={() => {
                setOpenHistory((v) => !v);
              }}
            >
              {openHistory ? '▾' : '▸'}
            </button>
          </span>
          {openHistory && (
            <span>
              <span className="devtools-history-buttons">
                <span className="history-index">
                  {selectedEventIndexInfo.index + 1} / {events.length}
                </span>
                <button
                  onClick={() => {
                    setSelectedEventIndexInfo({
                      index: 0,
                      isLast: events.length === 1,
                    });
                  }}
                >
                  ⇤
                </button>
                <button
                  onClick={() => {
                    setSelectedEventIndexInfo((prev) => {
                      return prev.index === 0
                        ? prev
                        : { index: prev.index - 1, isLast: false };
                    });
                  }}
                >
                  ←
                </button>
                <button
                  onClick={() => {
                    setSelectedEventIndexInfo((prev) => {
                      return prev.index === events.length - 1
                        ? prev
                        : { index: prev.index + 1, isLast: false };
                    });
                  }}
                >
                  →
                </button>
                <button
                  onClick={() => {
                    setSelectedEventIndexInfo({
                      index: events.length - 1,
                      isLast: true,
                    });
                  }}
                >
                  ⇥
                </button>
                <button
                  onClick={toggleHidePresenceEvent}
                  title={
                    hidePresenceEvents
                      ? 'Show only root changes'
                      : 'Show all changes'
                  }
                >
                  {hidePresenceEvents ? '¥' : 'Y'}
                </button>
              </span>
            </span>
          )}
        </div>
        {openHistory && (
          <>
            <div
              ref={scrollRef}
              style={{ width: '100%', overflowX: 'auto', minHeight: '46px' }}
              className="history-slider-wrap"
              data-length={events.length}
            >
              <Slider
                dots
                min={0}
                marks={sliderMarks}
                max={events.length - 1}
                value={selectedEventIndexInfo.index}
                step={1}
                onChange={handleSliderEvent}
                style={{
                  width: events.length * SLIDER_MARK_WIDTH + 'px',
                }}
              />
            </div>
            <div className="devtools-event-wrap">
              <JSONView src={getEventInfo(selectedEvent)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
