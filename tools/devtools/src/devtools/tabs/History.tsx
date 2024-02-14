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
import Slider from 'rc-slider';
import yorkie, { converter } from 'yorkie-js-sdk';
import { useYorkieChanges, useYorkieDoc } from '../contexts/YorkieSource';
import { JSONView } from '../components/JsonView';
import { CursorIcon, DocumentIcon } from '../icons';

const SLIDER_MARK_WIDTH = 24;

export function History({ style }) {
  const changes = useYorkieChanges();
  const [, setDoc] = useYorkieDoc();
  const [openHistory, setOpenHistory] = useState(false);
  const [selectedChangeIndex, setSelectedChangeIndex] = useState(null);
  const [selectedChange, setSelectedChange] = useState([]);
  const [sliderMarks, setSliderMarks] = useState({});
  const scrollRef = useRef(null);

  const handleSliderChange = (value) => {
    setSelectedChangeIndex(value);
    const selected = changes[value].at(-1);
    const snapshot = converter.hexToBytes(selected.snapshot);
    const doc = yorkie.Document.createFromSnapshot('dockey', snapshot);
    if (selected.clientID !== '000000000000000000000000') {
      doc.setActor(selected.clientID);
      doc.setStatus('attached');
    }
    setDoc(doc);
  };

  useEffect(() => {
    if (!openHistory || selectedChangeIndex === null) return;
    if (scrollRef.current) {
      scrollRef.current.scrollLeft =
        selectedChangeIndex * SLIDER_MARK_WIDTH -
        scrollRef.current.clientWidth / 2;
    }

    setSelectedChange(
      changes[selectedChangeIndex].map(({ event, op }) => {
        return {
          event: event.type === 'snapshot' ? { type: event.type } : event,
          op,
        };
      }),
    );
  }, [openHistory, selectedChangeIndex]);

  useEffect(() => {
    if (!openHistory || changes.length === 0) return;
    const marks = {};
    for (const [index, value] of changes.entries()) {
      const [source] = value[0].type.split('-');
      if (value.every((v) => v.type.split('-')[1] === 'presence')) {
        marks[index] = (
          <span className={`mark-history mark-${source} mark-presence`}>
            <CursorIcon />
          </span>
        );
      } else {
        marks[index] = (
          <span className={`mark-history mark-${source} mark-document`}>
            <DocumentIcon />
          </span>
        );
      }
    }
    setSliderMarks(marks);
  }, [openHistory, changes]);

  useEffect(() => {
    if (changes.length === 0) return;
    setSelectedChangeIndex(changes.length - 1);
  }, [changes]);

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
        <div className="devtools-history-toolbar">
          <span className="title">
            History
            <button
              className="toggle-history-btn"
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
                <button
                  onClick={() => {
                    setSelectedChangeIndex(0);
                  }}
                >
                  ⇤
                </button>
                <button
                  onClick={() => {
                    setSelectedChangeIndex((prev) => {
                      return prev === 0 ? 0 : prev - 1;
                    });
                  }}
                >
                  ←
                </button>
                <button
                  onClick={() => {
                    setSelectedChangeIndex((prev) => {
                      return prev === changes.length - 1 ? prev : prev + 1;
                    });
                  }}
                >
                  →
                </button>
                <button
                  onClick={() => {
                    setSelectedChangeIndex(changes.length - 1);
                  }}
                >
                  ⇥
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
            >
              <Slider
                dots
                min={0}
                marks={sliderMarks}
                max={changes.length - 1}
                value={selectedChangeIndex}
                step={1}
                onChange={handleSliderChange}
                style={{
                  width: changes.length * SLIDER_MARK_WIDTH + 'px',
                }}
              />
            </div>
            <div className="devtools-change-wrap">
              <JSONView src={selectedChange} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
