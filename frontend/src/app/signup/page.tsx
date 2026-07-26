"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AwsLogo } from "@/components/brand/AwsLogo";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

const ORANGE = "#ff9900";
const INK = "#16191f";
const SLATE = "#545b64";
const GREY = "#687078";
const LINK = "#0073bb";
const BORDER = "#eaeded";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

const CARD_SHADOW =
  "0 1px 1px 0 rgba(0,28,36,0.3), 1px 1px 1px 0 rgba(0,28,36,0.15), -1px 1px 1px 0 rgba(0,28,36,0.15)";

function Caret() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="ml-1 inline-block align-top">
      <path d="m8 11 4-6H4l4 6Z" fill="currentColor" />
    </svg>
  );
}

function Field({
  label,
  helper,
  ...props
}: { label: string; helper?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block">{label}</label>
      {helper && (
        <p className="mb-1 text-[12px] leading-[16px]" style={{ color: GREY }}>
          {helper}
        </p>
      )}
      <input
        {...props}
        className="mt-1 w-full rounded-[2px] bg-white px-2 py-1 outline-none focus:border-[#0073bb] focus:ring-1 focus:ring-[#0073bb]"
        style={{ border: `1px solid ${GREY}`, height: 32 }}
      />
    </div>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const { user, loading, register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/hosted-zones");
  }, [loading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (!fullName.trim()) return setError("Enter an account name.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      await register(email, password, fullName.trim());
      router.replace("/hosted-zones");
    } catch (err) {
      setError(apiError(err, "Could not create account"));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#fafafa", color: INK, fontFamily: FONT }}>
      {/* Top bar + logo */}
      <header className="relative my-5 flex flex-col items-center">
        <div
          className="absolute right-5 top-0 flex items-center gap-4 text-[14px] font-bold tracking-[0.25px]"
          style={{ color: SLATE }}
        >
          <button className="px-5 py-1">Provide feedback</button>
          <button className="flex items-center px-5 py-1" aria-label="Language English">
            English <Caret />
          </button>
        </div>
        <div className="mb-[30px] mt-5">
          <AwsLogo width={72} />
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 justify-center px-4">
        <div className="flex gap-6">
          {/* Sign-up card + legal */}
          <div className="flex w-[340px] flex-col gap-3">
            <div
              className="rounded-[2px] bg-white"
              style={{ boxShadow: CARD_SHADOW, borderTop: `1px solid ${BORDER}`, color: INK }}
            >
              {/* Header */}
              <div
                className="px-5 pb-[10px] pt-3"
                style={{ backgroundColor: "#fafafa", borderBottom: `1px solid ${BORDER}` }}
              >
                <h2 className="pt-2 text-[18px] font-bold leading-[22px]" style={{ color: INK }}>
                  Sign up for AWS
                </h2>
              </div>

              {/* Body */}
              <form onSubmit={submit} className="px-5 pb-5 pt-4 text-[14px] leading-[22px]">
                <div className="flex flex-col gap-4">
                  <Field
                    label="Root user email address"
                    helper="You'll use this email to sign in to your new AWS account."
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="username@example.com"
                  />
                  <Field
                    label="AWS account name"
                    helper="Choose a name for your account. You can change it later in account settings."
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <Field
                    label="Confirm password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                  />
                </div>

                {error && (
                  <p className="mt-3 text-[12px]" style={{ color: "#d91515" }}>
                    {error}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-[2px] py-1 text-center font-bold tracking-[0.25px] disabled:opacity-60"
                    style={{ backgroundColor: ORANGE, color: INK, height: 32 }}
                  >
                    {submitting ? "Creating account…" : "Sign up"}
                  </button>

                  <div className="my-[10px] flex items-center" style={{ color: SLATE }}>
                    <span className="h-px flex-1 opacity-50" style={{ backgroundColor: BORDER }} />
                    <strong className="px-[10px] font-bold" style={{ color: INK }}>
                      OR
                    </strong>
                    <span className="h-px flex-1 opacity-50" style={{ backgroundColor: BORDER }} />
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="w-full rounded-[2px] bg-white py-1 text-center font-bold tracking-[0.25px]"
                    style={{ border: `1px solid ${SLATE}`, color: SLATE, height: 32 }}
                  >
                    Sign in to an existing account
                  </button>
                </div>
              </form>
            </div>

            <small className="text-[12px] leading-[16px]" style={{ color: GREY }}>
              By continuing, you agree to{" "}
              <a href="#" style={{ color: LINK, textDecoration: "underline" }}>
                AWS Customer Agreement
              </a>{" "}
              or other agreement for AWS services, and the{" "}
              <a href="#" style={{ color: LINK, textDecoration: "underline" }}>
                Privacy Notice
              </a>
              . This site uses essential cookies. See our{" "}
              <a href="#" style={{ color: LINK, textDecoration: "underline" }}>
                Cookie Notice
              </a>{" "}
              for more information.
            </small>
          </div>

          {/* AWS marketing image (matches the live console sign-in page) */}
          <aside className="hidden w-[570px] lg:block">
            <a
              href="https://aws.amazon.com/ai/implementation/"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/homepage/console-sign-in/ai-implementation-2026.ded0f707cdac0eb150ecb0a172bc25918e792af6.png"
                alt="Amazon Web Services Marketing"
                width={570}
                className="block w-[570px]"
              />
            </a>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-[12px]" style={{ color: GREY }}>
        © 2026 Amazon Web Services, Inc. or its affiliates. All rights reserved.
      </footer>
    </div>
  );
}
