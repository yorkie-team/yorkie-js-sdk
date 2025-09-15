'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Trash2, Check, Plus } from 'lucide-react';
import { useDocument, JSONArray, JSONObject } from '@yorkie-js/react';

type Todo = {
  id: string;
  text: string;
  completed: boolean;
};

const TodoList = () => {
  const [newTodo, setNewTodo] = useState('');
  const { root, presences, update, loading, error } = useDocument<{
    todos: JSONArray<JSONObject<Todo>>;
  }>();
  const userCount = useMemo(() => {
    return presences?.length;
  }, [presences]);

  const addTodo = () => {
    if (newTodo.trim() !== '') {
      update((root) => {
        root.todos.push({
          id: String(Date.now()),
          text: newTodo,
          completed: false,
        } as JSONObject<Todo>);
      });
      setNewTodo('');
    }
  };

  const toggleTodo = (id: string) => {
    update((root) => {
      for (const todo of root.todos) {
        if (todo.id === id) {
          todo.completed = !todo.completed;
          break;
        }
      }
    });
  };

  const deleteTodo = (id: string) => {
    update((root) => {
      const idx = root.todos.findIndex((todo) => todo.id === id);
      if (idx !== -1) {
        root.todos.delete?.(idx);
      }
    });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Todo List</CardTitle>
        <div className="text-center text-sm text-gray-500">
          {userCount > 0 ? (
            <div className="flex items-center justify-center gap-2">
              <div className="flex -space-x-2">
                {[...Array(Math.min(userCount, 3))].map((_, i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-200 to-blue-300 border-2 border-white flex items-center justify-center text-white text-xs"
                  >
                    👤
                  </div>
                ))}
              </div>
              <span>
                {userCount === 1
                  ? 'Working solo'
                  : `${userCount} people in this space`}
              </span>
            </div>
          ) : (
            <span className="text-gray-400">No participants</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyUp={handleKeyUp}
            placeholder="Enter a new todo"
            className="flex-1"
          />
          <Button onClick={addTodo} className="px-4">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {root.todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Button
                  variant={todo.completed ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleTodo(todo.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <span
                  className={`${
                    todo.completed ? 'line-through text-gray-500' : ''
                  }`}
                >
                  {todo.text}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteTodo(todo.id)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default TodoList;
