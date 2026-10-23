import React from 'react';

export const KeyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 2l-2 2" />
    <circle cx="9" cy="15" r="6" />
    <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
    <path d="M11 11l3.5-3.5" />
  </svg>
);