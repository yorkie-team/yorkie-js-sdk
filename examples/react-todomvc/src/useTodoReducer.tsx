import { useCallback } from 'react';
import { TodoAction, todoReducer } from './todoReducer';
import { JSONArray, useYorkieDoc } from '@yorkie-js/react';
import { Todo } from './model';

export function useTodoReducer(initialRoot: { todos: JSONArray<Todo> }) {
  // Get document key from query string or use date-based key as fallback
  const urlParams = new URLSearchParams(window.location.search);
  const documentKey =
    urlParams.get('key') ||
    `react-todomvc-${new Date()
      .toISOString()
      .substring(0, 10)
      .replace(/-/g, '')}`;

  const { root, update, loading, error } = useYorkieDoc<{
    todos: JSONArray<Todo>;
  }>(import.meta.env.VITE_YORKIE_API_KEY, documentKey, {
    initialRoot,
    rpcAddr: import.meta.env.VITE_YORKIE_API_ADDR,
  });

  const dispatch = useCallback(
    (action: TodoAction) => {
      update((root) => {
        todoReducer(root, action);
      });
    },
    [update],
  );

  return { root, dispatch, loading, error };
}
