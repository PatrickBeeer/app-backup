import React from 'react';

export interface Template {
  id: string;
  name: string;
  icon: React.FC<{className?: string}>;
  prompt: string;
}

