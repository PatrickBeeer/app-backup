
import React from 'react';

export const FactoryIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="w-6 h-6" 
        viewBox="0 0 24 24" 
        strokeWidth="2" 
        stroke="currentColor" 
        fill="none" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        {...props}
    >
       <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
       <path d="M4 21v-13a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v13" />
       <path d="M5 21v-10.15a1 1 0 0 1 .586 -.906l6.414 -2.85a1 1 0 0 1 .823 .005l6.177 2.845a1 1 0 0 1 .586 .906v10.15" />
       <path d="M9 21v-4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4" />
       <path d="M8 5h.01" />
       <path d="M12 5h.01" />
       <path d="M16 5h.01" />
    </svg>
);
