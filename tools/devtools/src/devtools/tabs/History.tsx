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
import { Devtools } from 'yorkie-js-sdk';
import Slider from 'rc-slider';
import { useYorkieChanges } from '../contexts/YorkieSource';
import { JSONView } from '../components/JsonView';
import { CursorIcon, DocumentIcon } from '../icons';

const SLIDER_MARK_WIDTH = 24;

export function History({
  style,
  selectedChangeInfo,
  selectedChangeIndexInfo,
  setSelectedChangeIndexInfo,
}) {
  const changes = useYorkieChanges();
  const [openHistory, setOpenHistory] = useState(false);
  const [sliderMarks, setSliderMarks] = useState({});
  const scrollRef = useRef(null);

  const handleSliderChange = (value) => {
    setSelectedChangeIndexInfo({
      index: value,
      isLast: value === changes.length - 1,
    });
  };

  useEffect(() => {
    if (!openHistory || selectedChangeIndexInfo.index === null) return;
    if (scrollRef.current) {
      scrollRef.current.scrollLeft =
        selectedChangeIndexInfo.index * SLIDER_MARK_WIDTH -
        scrollRef.current.clientWidth / 2;
    }
  }, [openHistory, selectedChangeIndexInfo]);

  useEffect(() => {
    if (!openHistory || changes.length === 0) return;
    const marks = {};
    for (const [index, change] of changes.entries()) {
      const source = change.source;
      let type = 'document';
      if (
        change.type === Devtools.HistoryChangePackType.WatchStream ||
        (change.type === Devtools.HistoryChangePackType.Changes &&
          change.payload.operations?.length === 0 &&
          change.payload.presenceChange)
      ) {
        type = 'presence';
      }
      marks[index] = (
        <span className={`mark-history mark-${source} mark-${type}`}>
          {type === 'presence' ? <CursorIcon /> : <DocumentIcon />}
        </span>
      );
    }
    setSliderMarks(marks);
  }, [openHistory, changes]);

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
                    setSelectedChangeIndexInfo({
                      index: 0,
                      isLast: changes.length === 1,
                    });
                  }}
                >
                  ⇤
                </button>
                <button
                  onClick={() => {
                    setSelectedChangeIndexInfo((prev) => {
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
                    setSelectedChangeIndexInfo((prev) => {
                      return prev.index === changes.length - 1
                        ? prev
                        : { index: prev.index + 1, isLast: false };
                    });
                  }}
                >
                  →
                </button>
                <button
                  onClick={() => {
                    setSelectedChangeIndexInfo({
                      index: changes.length - 1,
                      isLast: true,
                    });
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
                value={selectedChangeIndexInfo.index}
                step={1}
                onChange={handleSliderChange}
                style={{
                  width: changes.length * SLIDER_MARK_WIDTH + 'px',
                }}
              />
            </div>
            <div className="devtools-change-wrap">
              <JSONView src={selectedChangeInfo} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
