import * as React from 'react';

import { cn } from '../lib/cn.js';

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ui-panel', className)} {...props} />;
}
