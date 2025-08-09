import React from 'react';
import classnames from 'classnames';
import { Filter } from './MainSection';

const filterTitles: { [key in Filter]: string } = {
  SHOW_ALL: 'All',
  SHOW_ACTIVE: 'Active',
  SHOW_COMPLETED: 'Completed',
};

type MouseEventHandler = (
  e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
) => void;

interface FooterProps {
  completedCount: number;
  activeCount: number;
  filter: Filter;
  onClearCompleted: MouseEventHandler;
  onShow: (filter: Filter) => void;
}

export default function Footer({
  completedCount,
  activeCount,
  filter: selectedFilter,
  onClearCompleted,
  onShow,
}: FooterProps) {
  return (
    <footer className="footer">
      <span className="todo-count">
        <strong>{activeCount || 'No'}</strong>
        &nbsp;{activeCount === 1 ? 'item' : 'items'} left
      </span>
      <ul className="filters">
        {Object.keys(filterTitles).map((filter) => (
          <li key={filter}>
            <button
              type="button"
              className={classnames({ selected: filter === selectedFilter })}
              style={{ cursor: 'pointer' }}
              onClick={() => onShow(filter as Filter)}
            >
              {filterTitles[filter as Filter]}
            </button>
          </li>
        ))}
      </ul>
      {!!completedCount && (
        <button
          type="button"
          className="clear-completed"
          onClick={onClearCompleted}
        >
          Clear completed
        </button>
      )}
    </footer>
  );
}
