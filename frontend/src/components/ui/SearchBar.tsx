import React from "react";

interface SearchBarProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

export default function SearchBar({ onSearch, className = "", ...props }: SearchBarProps) {
  return (
    <div className={`relative w-full max-w-md ${className}`}>
      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
        🔍
      </span>
      <input
        type="text"
        className="w-full pl-10 pr-4 py-2 bg-[#111827]/80 border border-gray-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500/80 transition-all placeholder-gray-500"
        onChange={(e) => onSearch?.(e.target.value)}
        {...props}
      />
    </div>
  );
}
