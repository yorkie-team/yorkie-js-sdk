'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useDocument,
  useYorkie,
  type JSONArray,
  type JSONObject,
} from '@yorkie-js/react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import Header, { type Status } from './Header';

export const API_ADDR =
  process.env.NEXT_PUBLIC_YORKIE_API_ADDR || 'http://localhost:8080';

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

type TodoDoc = { todos: JSONArray<JSONObject<Todo>> };
type Presence = { name: string };

export default function TodoList() {
  const [newTodo, setNewTodo] = useState('');
  const { client } = useYorkie();
  const { root, presences, connection, update, loading, error } = useDocument<
    TodoDoc,
    Presence
  >();

  const status: Status = error
    ? 'error'
    : loading
      ? 'connecting'
      : connection === 'connected'
        ? 'connected'
        : 'offline';

  const peers = presences
    // Skip presences that have not arrived yet.
    .filter(({ presence }) => presence?.name)
    .map(({ clientID, presence }) => ({
      clientID,
      name: presence.name,
      isMe: clientID === client?.getActorID(),
    }));

  // A form submit (not a key handler) so Enter while composing Korean or
  // Japanese text does not add a half-typed todo.
  const addTodo = (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodo.trim();
    if (!text) return;
    update((root) => {
      root.todos.push({
        id: crypto.randomUUID(),
        text,
        completed: false,
      } as JSONObject<Todo>);
    });
    setNewTodo('');
  };

  const toggleTodo = (id: string) => {
    update((root) => {
      const todo = root.todos.find((todo) => todo.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    });
  };

  const deleteTodo = (id: string) => {
    update((root) => {
      const index = root.todos.findIndex((todo) => todo.id === id);
      if (index !== -1) {
        root.todos.delete?.(index);
      }
    });
  };

  return (
    <>
      <Header status={status} peers={peers} />
      <main className="mx-auto max-w-xl px-4 py-6">
        <Card>
          {error ? (
            <p role="alert" className="p-4">
              Couldn&apos;t reach the Yorkie server at{' '}
              <code className="font-mono text-[13px]">{API_ADDR}</code>. Check
              that it&apos;s running, then reload.
            </p>
          ) : loading ? (
            <p className="p-4 text-muted-foreground">Loading todos…</p>
          ) : (
            <>
              <form onSubmit={addTodo} className="flex gap-2 border-b p-4">
                <Input
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  placeholder="What needs to be done?"
                  aria-label="New todo"
                />
                <Button type="submit" disabled={!newTodo.trim()}>
                  <Plus aria-hidden="true" />
                  Add
                </Button>
              </form>

              {root.todos.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No todos yet. Add one above.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {root.todos.map((todo) => (
                    <li key={todo.id} className="flex items-center gap-1 pr-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => toggleTodo(todo.id)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <span
                          className={`break-words ${
                            todo.completed
                              ? 'text-muted-foreground line-through'
                              : ''
                          }`}
                        >
                          {todo.text}
                        </span>
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteTodo(todo.id)}
                        aria-label={`Delete "${todo.text}"`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </main>
    </>
  );
}
