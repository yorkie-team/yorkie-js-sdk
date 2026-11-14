import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-sm border border-input bg-card px-3 py-1 text-base placeholder:text-gray-600 hover:border-gray-400 focus-visible:border-primary focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
