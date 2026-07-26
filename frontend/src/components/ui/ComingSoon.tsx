import React from "react";
import Link from "next/link";

interface ComingSoonProps {
  featureName: string;
}

export default function ComingSoon({ featureName }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-gray-800 rounded-2xl bg-[#111827]/40 backdrop-blur-md max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-2xl mb-4 text-blue-400">
        🚀
      </div>
      <h2 className="text-xl font-bold text-white mb-2">{featureName}</h2>
      <p className="text-gray-400 mb-6 text-sm">
        We are building this feature! Check back soon for updates.
      </p>
      <Link href="/dashboard" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium border border-gray-700 transition-all">
        Back to Dashboard
      </Link>
    </div>
  );
}
