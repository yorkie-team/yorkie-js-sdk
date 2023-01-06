import React from 'react';
import classnames from 'classnames';

const FILTER_TITLES: { [name: string]: string } = {
  SHOW_ALL: 'All',
  SHOW_ACTIVE: 'Active',
  SHOW_COMPLETED: 'Completed',
};

type MouseEventHandler =
  (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;

interface FooterProps {
  completedCount: number;
  activeCount: number;
  filter: string;
  onClearCompleted: MouseEventHandler;
  onShow: Function;
}

export default function Footer(props: FooterProps) {
  const {
    activeCount,
    completedCount,
    filter: selectedFilter,
    onClearCompleted,
    onShow
  } = props;
  return (
    <footer className="footer">
      <span className="todo-count">
        <strong>{activeCount || 'No'}</strong>
        &nbsp;{activeCount === 1 ? 'item' : 'items'} left
      </span>
      <ul className="filters">
        {
          ['SHOW_ALL', 'SHOW_ACTIVE', 'SHOW_COMPLETED'].map((filter) => (
            <li key={filter}>
              <button
                type="button"
                className={classnames({ selected: filter === selectedFilter })}
                style={{ cursor: 'pointer' }}
                onClick={() => onShow(filter)}
              >
                {FILTER_TITLES[filter]}
              </button>
            </li>
          ))
        }
      </ul>
      {!!completedCount && (
        <button type="button" className="clear-completed" onClick={onClearCompleted}>
          Clear completed
        </button>
      )}
    </footer>
  );
}
