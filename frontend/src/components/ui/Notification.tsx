import React from "react";

interface NotificationProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
}

export default function Notification({ message, type = "info", onClose }: NotificationProps) {
  const bgStyles = {
    success: "bg-[#065f46]/20 border-[#059669]/30 text-[#34d399]",
    error: "bg-[#991b1b]/20 border-[#dc2626]/30 text-[#f87171]",
    info: "bg-[#1e3a8a]/20 border-[#2563eb]/30 text-[#60a5fa]",
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center justify-between border p-4 rounded-xl shadow-lg backdrop-blur-md max-w-sm animate-in slide-in-from-bottom-5 duration-300 ${bgStyles[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-4 text-xs font-bold hover:opacity-80 transition-opacity">
        ✕
      </button>
    </div>
  );
}
