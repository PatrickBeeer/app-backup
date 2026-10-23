import React from 'react';

interface AccordionProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const Accordion: React.FC<AccordionProps> = ({ title, isOpen, onToggle, children }) => {
  return (
    <div className="border-b border-white/40">
      <h2>
        <button
          type="button"
          className="flex items-center justify-between w-full py-4 text-left font-semibold text-black text-xl tracking-tight"
          onClick={onToggle}
          aria-expanded={isOpen}
        >
          <span>{title}</span>
          <svg
            className={`w-5 h-5 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h2>
      <div
        className={`transition-[max-height] duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[1000px]' : 'max-h-0'}`}
      >
        <div className="pb-4">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Accordion;

