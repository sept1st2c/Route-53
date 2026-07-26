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

function Radio({ checked }: { checked: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width="14" height="14" aria-hidden="true" className="mt-1 shrink-0">
      <circle cx="50" cy="50" r="46" fill="none" stroke={checked ? LINK : GREY} strokeWidth="8" />
      {checked && <circle cx="50" cy="50" r="22" fill={LINK} />}
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="inline-block">
      <circle cx="8" cy="8" r="7" fill="none" stroke={LINK} strokeWidth="1.2" />
      <path d="M8 12V7M8 5.2V4.2" stroke={LINK} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

type UserType = "root" | "iam";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [step, setStep] = useState<"email" | "password">("email");
  const [userType, setUserType] = useState<UserType>("root");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/hosted-zones");
  }, [loading, user, router]);

  const goToPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setStep("password");
  };

  const backToEmail = () => {
    setStep("email");
    setError("");
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/hosted-zones");
    } catch (err) {
      setError(apiError(err, "Invalid email or password"));
      setSubmitting(false);
    }
  };

  const tile = (type: UserType, title: string, desc: string) => {
    const selected = userType === type;
    return (
      <button
        type="button"
        onClick={() => setUserType(type)}
        className="flex w-full items-start rounded-[2px] border px-4 pb-3 pt-2 text-left"
        style={{
          borderColor: selected ? LINK : GREY,
          backgroundColor: selected ? "#f1faff" : "#ffffff",
        }}
      >
        <Radio checked={selected} />
        <span className="flex-1">
          <span className="block pl-2 text-[14px] leading-[22px]" style={{ color: INK }}>
            {title}
          </span>
          <span className="block pl-2 text-[12px] leading-[16px]" style={{ color: GREY }}>
            {desc}
          </span>
        </span>
      </button>
    );
  };

  const isEmailStep = step === "email";

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#fafafa", color: INK, fontFamily: FONT }}>
      {/* ─── Top bar + logo ──────────────────────────────────────── */}
      <header className="relative my-5 flex flex-col items-center">
        <div
          className="absolute right-5 top-0 flex items-center gap-4 text-[14px] font-bold tracking-[0.25px]"
          style={{ color: SLATE }}
        >
          <button className="px-5 py-1">Provide feedback</button>
          {isEmailStep && (
            <button className="flex items-center px-5 py-1">
              Multi-session disabled <Caret />
            </button>
          )}
          <button className="flex items-center px-5 py-1" aria-label="Language English">
            English <Caret />
          </button>
        </div>
        <div className="mb-[30px] mt-5">
          <AwsLogo width={72} />
        </div>
      </header>

      {/* ─── Main ────────────────────────────────────────────────── */}
      <main className="flex flex-1 justify-center px-4">
        <div className="flex gap-6">
          {/* Left: sign-in card (+ legal on email step) */}
          <div className="flex w-[340px] flex-col gap-3">
            <div
              className="rounded-[2px] bg-white"
              style={{ boxShadow: CARD_SHADOW, borderTop: `1px solid ${BORDER}`, color: INK }}
            >
              {/* Card header */}
              <div
                className="px-5 pb-[10px] pt-3"
                style={{ backgroundColor: "#fafafa", borderBottom: `1px solid ${BORDER}` }}
              >
                {isEmailStep ? (
                  <h2 className="pt-2 text-[18px] font-bold leading-[22px]" style={{ color: INK }}>
                    Sign In
                  </h2>
                ) : (
                  <h2
                    className="flex items-center gap-2 pt-2 text-[18px] font-bold leading-[22px]"
                    style={{ color: INK }}
                  >
                    {userType === "root" ? "Root user sign in" : "IAM user sign in"}
                    <InfoIcon />
                  </h2>
                )}
              </div>

              {/* Card body */}
              <div className="px-5 pb-5 pt-4 text-[14px] leading-[22px]">
                {isEmailStep ? (
                  <form onSubmit={goToPassword}>
                    <p className="mb-3 py-1">Access your AWS account by user type.</p>

                    <div>
                      User type{" "}
                      <button
                        type="button"
                        className="text-[13px] leading-none"
                        style={{ borderBottom: `1px dashed ${INK}` }}
                      >
                        (not sure?)
                      </button>
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      {tile(
                        "root",
                        "Root user",
                        "Account owner that performs tasks requiring unrestricted access."
                      )}
                      {tile("iam", "IAM user", "User within an account that performs daily tasks.")}
                    </div>

                    <div className="mb-6 mt-6">
                      <label className="block">Email address</label>
                      <input
                        type="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="username@example.com"
                        className="mt-1 w-full rounded-[2px] bg-white px-2 py-1 outline-none focus:border-[#0073bb] focus:ring-1 focus:ring-[#0073bb]"
                        style={{ border: `1px solid ${GREY}`, height: 32 }}
                      />
                      {error && (
                        <p className="mt-2 text-[12px]" style={{ color: "#d91515" }}>
                          {error}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <button
                        type="submit"
                        className="w-full rounded-[2px] py-1 text-center font-bold tracking-[0.25px]"
                        style={{ backgroundColor: ORANGE, color: INK, height: 32 }}
                      >
                        Next
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
                        onClick={() => router.push("/signup")}
                        className="w-full rounded-[2px] bg-white py-1 text-center font-bold tracking-[0.25px]"
                        style={{ border: `1px solid ${SLATE}`, color: SLATE, height: 32 }}
                      >
                        New to AWS? Sign up
                      </button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={signIn}>
                    <p className="py-1">Enter the password for</p>
                    <div>
                      <strong className="break-all font-bold" style={{ color: INK }}>
                        {email}
                      </strong>{" "}
                      <button type="button" onClick={backToEmail} style={{ color: LINK }}>
                        (not you?)
                      </button>
                    </div>

                    <div className="my-6">
                      <label className="block">Password</label>
                      <input
                        type={showPassword ? "text" : "password"}
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1 w-full rounded-[2px] bg-white px-2 py-1 outline-none focus:border-[#0073bb] focus:ring-1 focus:ring-[#0073bb]"
                        style={{ border: `1px solid ${GREY}`, height: 32 }}
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            checked={showPassword}
                            onChange={(e) => setShowPassword(e.target.checked)}
                            className="h-3.5 w-3.5"
                            style={{ accentColor: LINK }}
                          />
                          <span>Show password</span>
                        </label>
                        <a href="#" style={{ color: LINK }}>
                          Forgot password?
                        </a>
                      </div>
                      {error && (
                        <p className="mt-2 text-[12px]" style={{ color: "#d91515" }}>
                          {error}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-5">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-[2px] py-1 text-center font-bold tracking-[0.25px] disabled:opacity-60"
                        style={{ backgroundColor: ORANGE, color: INK, height: 32 }}
                      >
                        {submitting ? "Signing in…" : "Sign in"}
                      </button>
                      <button
                        type="button"
                        onClick={backToEmail}
                        className="w-full rounded-[2px] bg-white py-1 text-center font-bold tracking-[0.25px]"
                        style={{ border: `1px solid ${SLATE}`, color: SLATE, height: 32 }}
                      >
                        Sign in to a different account
                      </button>
                      <div className="text-center">
                        <button type="button" onClick={() => router.push("/signup")} style={{ color: LINK }}>
                          Create a new AWS account
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* Legal copy — email step only */}
            {isEmailStep && (
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
            )}
          </div>

          {/* Right: AWS marketing image (matches the live console sign-in page) */}
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

      {/* ─── Footer copyright ───────────────────────────────────── */}
      <footer className="py-5 text-center text-[12px]" style={{ color: GREY }}>
        © 2026 Amazon Web Services, Inc. or its affiliates. All rights reserved.
      </footer>
    </div>
  );
}
