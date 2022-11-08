import React, { useState } from 'react';
import { Todo } from './model';
import TodoItem from './TodoItem';
import Footer from './Footer';

const TODO_FILTERS: { [name: string]: (todo: Todo) => boolean } = {
  SHOW_ALL: (todo: Todo) => true,
  SHOW_ACTIVE: (todo: Todo) => !todo.completed,
  SHOW_COMPLETED: (todo: Todo) => todo.completed,
};

type ChangeEventHandler = (event: React.ChangeEvent<HTMLInputElement>) => void;

interface MainSectionProps {
  todos: Array<Todo>;
  actions: { [name: string]: Function };
}

export default function MainSection(props: MainSectionProps) {
  const [filter, setFilter] = useState('SHOW_ALL');
  const { todos, actions } = props;
  const filteredTodos = todos.filter(TODO_FILTERS[filter]);
  const completedCount = todos.reduce((count, todo) => {
    return todo.completed ? count + 1 : count;
  }, 0);
  const activeCount = todos.length - completedCount;
  if (todos.length === 0) {
    return null;
  }

  return (
    <section className="main">
      <input
        className="toggle-all"
        type="checkbox"
        defaultChecked={completedCount === todos.length}
        onChange={actions.completeAll as ChangeEventHandler}
      />
      <ul className="todo-list">
        {
          filteredTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              editTodo={actions.editTodo}
              deleteTodo={actions.deleteTodo}
              completeTodo={actions.completeTodo}
            />
          ))
        }
      </ul>
      <Footer
        completedCount={completedCount}
        activeCount={activeCount}
        filter={filter}
        onClearCompleted={() => actions.clearCompleted()}
        onShow={setFilter}
      />
    </section>
  );
}
