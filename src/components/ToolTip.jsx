import { useState } from 'react';

export default function Tooltip({ content, children }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute right-0 top-full mt-2 bg-slate-800 text-white text-xs p-2 rounded z-50 w-64 shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}