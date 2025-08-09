import { useState } from 'react';
import { Todo } from './model';
import Footer from './components/Footer';
import TodoItem from './components/TodoItem';
import { TodoAction } from './todoReducer';
import { JSONArray } from '@yorkie-js/react';

export type Filter = 'SHOW_ALL' | 'SHOW_ACTIVE' | 'SHOW_COMPLETED';

const todoFilters: { [key in Filter]: (todo: Todo) => boolean } = {
  SHOW_ALL: () => true,
  SHOW_ACTIVE: (todo: Todo) => !todo.completed,
  SHOW_COMPLETED: (todo: Todo) => todo.completed,
};
interface MainSectionProps {
  todos: JSONArray<Todo>;
  dispatch: (action: TodoAction) => void;
}

export default function MainSection({ todos, dispatch }: MainSectionProps) {
  const [filter, setFilter] = useState<Filter>('SHOW_ALL');
  const filteredTodos = todos.filter(todoFilters[filter]);
  const completedCount = todos.filter((todo) => todo.completed).length;
  const activeCount = todos.length - completedCount;

  const clearCompleted = () => dispatch({ type: 'CLEARED_COMPLETED' });
  const toggleAll = () => dispatch({ type: 'TOGGLED_ALL' });

  if (todos.length === 0) {
    return null;
  }

  return (
    <section className="main">
      {filteredTodos.length > 0 ? (
        <div className="toggle-all-container">
          <input
            className="toggle-all"
            type="checkbox"
            id="toggle-all"
            checked={completedCount === todos.length}
            onChange={toggleAll}
          />
          <label className="toggle-all-label" htmlFor="toggle-all">
            Mark all as complete
          </label>
        </div>
      ) : null}
      <ul className="todo-list">
        {filteredTodos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} dispatch={dispatch} />
        ))}
      </ul>
      <Footer
        completedCount={completedCount}
        activeCount={activeCount}
        filter={filter}
        onClearCompleted={clearCompleted}
        onShow={setFilter}
      />
    </section>
  );
}
