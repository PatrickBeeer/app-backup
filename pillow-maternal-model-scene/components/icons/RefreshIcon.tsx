import React from 'react';

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001a7.5 7.5 0 0 1-1.946 4.992l-.001.001c-1.18.98-2.657 1.625-4.243 1.828a7.5 7.5 0 0 1-8.718-2.26c-1.636-2.438-1.3-5.83.8-7.942a7.5 7.5 0 0 1 7.942-.8 7.5 7.5 0 0 1 4.243 1.828M18.75 4.5l.375 .375m-1.5-1.5L21 6" />
  </svg>
);

export default RefreshIcon;

