import React from 'react';

const LightbulbIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-1.125 6.011 6.011 0 0 0 1.125-1.5A5.99 5.99 0 0 0 16.5 6c0-1.657-1.343-3-3-3S10.5 4.343 10.5 6c0 .773.293 1.503.82 2.063a6.01 6.01 0 0 0 1.125 1.5 6.01 6.01 0 0 0 1.5 1.125M12 18a2.25 2.25 0 0 1-2.25-2.25V15a2.25 2.25 0 0 1 2.25-2.25V18Zm0 0a2.25 2.25 0 0 0 2.25-2.25V15a2.25 2.25 0 0 0-2.25-2.25V18Z" />
  </svg>
);

export default LightbulbIcon;

