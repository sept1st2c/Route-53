"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Entry route: send users to the hosted zones console if signed in, otherwise to login.
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/hosted-zones" : "/login");
  }, [user, loading, router]);

  // Blank canvas while the session is being restored / the redirect fires.
  return <div className="min-h-screen" style={{ backgroundColor: "var(--rz-layout)" }} />;
}
