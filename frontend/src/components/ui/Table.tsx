import React from "react";

interface TableProps {
  headers: string[];
  children: React.ReactNode;
}

export default function Table({ headers, children }: TableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-800 bg-[#111827]/40 backdrop-blur-md">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900/60">
            {headers.map((h, i) => (
              <th key={i} className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60 text-sm text-gray-300">
          {children}
        </tbody>
      </table>
    </div>
  );
}
