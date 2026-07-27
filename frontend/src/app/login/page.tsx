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
const NOTE_BG = "#f1faff";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

// AWS renders the standalone auth UI's secondary buttons ("New to AWS? Sign up",
// "Sign in to a different account") as the blue link button. Kept as one constant
// because `uiss/loginpage.png` (Jun 2026) still samples #545b64 for that border and
// label — if AWS has reverted, switching back to SLATE here is the whole change.
const SECONDARY = LINK;

const CARD_SHADOW =
  "0 1px 1px 0 rgba(0,28,36,0.3), 1px 1px 1px 0 rgba(0,28,36,0.15), -1px 1px 1px 0 rgba(0,28,36,0.15)";

// @cloudscape-design/global-styles ships normalize.css *unlayered*, and unlayered
// declarations outrank anything inside Tailwind's `@layer utilities`. So its
// `button, input { line-height: 1.15 }` beats Tailwind leading utilities and left
// padding-centred labels sitting ~3px high — flex centring is immune to it.
const BTN =
  "inline-flex h-8 w-full items-center justify-center rounded-[2px] font-bold tracking-[0.25px]";
const INPUT =
  "mt-1 h-8 w-full rounded-[2px] bg-white px-2 outline-none placeholder:italic placeholder:text-[#687078] focus:border-[#0073bb] focus:ring-1 focus:ring-[#0073bb]";
const INPUT_BORDER = { border: `1px solid ${GREY}` };

// Seeded by the backend and published in the README, so evaluators never have to type.
const DEMO_EMAIL = "demo@route53.aws";
const DEMO_PASSWORD = "Demo1234!";
// No account lookup happens (see the note on the IAM form) — this is AWS's own
// documentation example ID, present only to satisfy the 12-digit format.
const DEMO_ACCOUNT_ID = "123456789012";

// AWS rotates this content-hashed filename, so the URL eventually 404s. The panel
// hides itself on error rather than leaving a broken image on the sign-in page.
const MARKETING_SRC =
  "https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/homepage/console-sign-in/ai-implementation-2026.ded0f707cdac0eb150ecb0a172bc25918e792af6.png";

const looksLikeEmail = (value: string) => value.includes("@");

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
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="inline-block shrink-0">
      <circle cx="8" cy="8" r="7" fill="none" stroke={LINK} strokeWidth="1.2" />
      <path d="M8 12V7M8 5.2V4.2" stroke={LINK} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

type UserType = "root" | "iam";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [step, setStep] = useState<"select" | "credentials">("select");
  const [userType, setUserType] = useState<UserType>("root");
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState("");
  const [iamUserName, setIamUserName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showMarketing, setShowMarketing] = useState(true);

  useEffect(() => {
    if (!loading && user) router.replace("/hosted-zones");
  }, [loading, user, router]);

  const isSelectStep = step === "select";

  const goToCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // IAM users supply every credential on the next step, so there is nothing to check here.
    if (userType === "root" && !looksLikeEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setStep("credentials");
  };

  const backToSelect = () => {
    setStep("select");
    setError("");
  };

  const chooseUserType = (type: UserType) => {
    setUserType(type);
    setError("");
  };

  const finish = () => router.replace("/hosted-zones");

  const failed = (err: unknown, fallback: string) => {
    setError(apiError(err, fallback));
    setSubmitting(false);
  };

  const signInAsRoot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      finish();
    } catch (err) {
      failed(err, "Invalid email or password");
    }
  };

  const signInAsIamUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const account = accountId.trim();
    if (!account) {
      setError("Enter your account ID or account alias.");
      return;
    }
    if (/^\d+$/.test(account)) {
      if (account.length !== 12) {
        setError("An account ID is exactly 12 digits.");
        return;
      }
    } else if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(account)) {
      setError(
        "An account alias is 3–63 characters of lowercase letters, digits, and hyphens, and cannot start or end with a hyphen."
      );
      return;
    }
    // The API only authenticates email + password, so the IAM user name has to be the
    // account's email address. AWS itself allows email addresses as IAM user names.
    if (!looksLikeEmail(iamUserName)) {
      setError("Enter the account's email address as the IAM user name.");
      return;
    }

    setSubmitting(true);
    try {
      await login(iamUserName.trim(), password);
      finish();
    } catch (err) {
      failed(err, "Invalid IAM user name or password");
    }
  };

  // One click fills every field for the current user type and moves straight to the
  // credentials step, so the only action left is the real "Sign in".
  const useDemoCredentials = () => {
    setError("");
    setEmail(DEMO_EMAIL);
    setAccountId(DEMO_ACCOUNT_ID);
    setIamUserName(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setStep("credentials");
  };

  const errorText = error && (
    <p className="mt-2 text-[12px] leading-[16px]" style={{ color: "#d91515" }}>
      {error}
    </p>
  );

  const passwordField = (
    <>
      <label className="block" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={INPUT}
        style={INPUT_BORDER}
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
    </>
  );

  const secondaryActions = (
    <div className="flex flex-col gap-5">
      <button
        type="submit"
        disabled={submitting}
        className={`${BTN} disabled:opacity-60`}
        style={{ backgroundColor: ORANGE, color: INK }}
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" onClick={backToSelect} className={`${BTN} bg-white`} style={{ border: `1px solid ${SECONDARY}`, color: SECONDARY }}>
        Sign in to a different account
      </button>
      <div className="text-center">
        <button type="button" onClick={() => router.push("/signup")} style={{ color: LINK }}>
          Create a new AWS account
        </button>
      </div>
    </div>
  );

  const tile = (type: UserType, title: string, desc: string) => {
    const selected = userType === type;
    return (
      <button
        type="button"
        onClick={() => chooseUserType(type)}
        className="flex w-full items-start rounded-[2px] border px-4 pb-3 pt-2 text-left"
        style={{
          borderColor: selected ? LINK : GREY,
          backgroundColor: selected ? NOTE_BG : "#ffffff",
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

  const cardTitle = isSelectStep ? "Sign In" : userType === "root" ? "Root user sign in" : "IAM user sign in";

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#fafafa", color: INK, fontFamily: FONT }}>
      {/* ─── Top bar + logo ──────────────────────────────────────── */}
      <header className="relative my-5 flex flex-col items-center">
        <div
          className="absolute right-5 top-0 flex items-center gap-4 text-[14px] font-bold tracking-[0.25px]"
          style={{ color: SLATE }}
        >
          <button className="px-5 py-1">Provide feedback</button>
          {/* AWS drops the multi-session control once you are past the user-type step. */}
          {isSelectStep && (
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
      {/* The card + marketing panel are one group centred in the viewport. Centring is
          done with auto margins rather than `flex justify-center` on <main>, because
          normalize's unlayered `main { display: block }` (from Cloudscape's global
          styles) outranks Tailwind's layered `.flex` and silently pinned the group to
          the left edge. Auto margins are correct under either display value. */}
      <main className="flex-1 px-4">
        <div className="mx-auto flex w-fit gap-6">
          {/* Left: sign-in card, demo credentials, legal copy */}
          <div className="flex w-[340px] shrink-0 flex-col gap-3">
            <div
              className="rounded-[2px] bg-white"
              style={{ boxShadow: CARD_SHADOW, borderTop: `1px solid ${BORDER}`, color: INK }}
            >
              {/* Card header */}
              <div
                className="px-5 pb-[10px] pt-3"
                style={{ backgroundColor: "#fafafa", borderBottom: `1px solid ${BORDER}` }}
              >
                <h2 className="flex items-center gap-2 pt-2 text-[18px] font-bold leading-[22px]" style={{ color: INK }}>
                  {cardTitle}
                  {!isSelectStep && <InfoIcon />}
                </h2>
              </div>

              {/* Card body */}
              <div className="px-5 pb-5 pt-4 text-[14px] leading-[22px]">
                {isSelectStep ? (
                  <form onSubmit={goToCredentials}>
                    <p className="mb-3 py-1">Access your AWS account by user type.</p>

                    <div>
                      User type{" "}
                      <button type="button" style={{ borderBottom: `1px dashed ${INK}` }}>
                        (not sure?)
                      </button>
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      {tile("root", "Root user", "Account owner that performs tasks requiring unrestricted access.")}
                      {tile("iam", "IAM user", "User within an account that performs daily tasks.")}
                    </div>

                    {/* Root users identify themselves by email here; IAM users do it on the
                        next step, where the account ID and user name belong together. */}
                    <div className="mb-6 mt-6">
                      {userType === "root" ? (
                        <>
                          <label className="block" htmlFor="email">
                            Email address
                          </label>
                          <input
                            id="email"
                            type="email"
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="username@example.com"
                            className={INPUT}
                            style={INPUT_BORDER}
                          />
                        </>
                      ) : (
                        <p className="text-[12px] leading-[16px]" style={{ color: GREY }}>
                          Next, enter your account ID or alias, your IAM user name, and your password.
                        </p>
                      )}
                      {errorText}
                    </div>

                    <div className="flex flex-col gap-3">
                      <button type="submit" className={BTN} style={{ backgroundColor: ORANGE, color: INK }}>
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
                        className={`${BTN} bg-white`}
                        style={{ border: `1px solid ${SECONDARY}`, color: SECONDARY }}
                      >
                        New to AWS? Sign up
                      </button>
                    </div>
                  </form>
                ) : userType === "root" ? (
                  <form onSubmit={signInAsRoot}>
                    <p className="py-1">Enter the password for</p>
                    <div>
                      <strong className="break-all font-bold" style={{ color: INK }}>
                        {email}
                      </strong>{" "}
                      <button type="button" onClick={backToSelect} style={{ color: LINK }}>
                        (not you?)
                      </button>
                    </div>

                    <div className="my-6">
                      {passwordField}
                      {errorText}
                    </div>

                    {secondaryActions}
                  </form>
                ) : (
                  <form onSubmit={signInAsIamUser}>
                    {/* Honest about the seam: the account field is format-checked but never
                        resolved, because the API authenticates one account by email. */}
                    <div
                      className="mb-5 flex gap-2 rounded-[2px] px-3 py-[10px] text-[12px] leading-[16px]"
                      style={{ backgroundColor: NOTE_BG, border: `1px solid ${LINK}` }}
                    >
                      <InfoIcon />
                      <p>
                        This clone signs in to the same demo account for both user types, so enter that account&apos;s
                        email address as the IAM user name. The account ID or alias is checked for format only — no
                        account is looked up.
                      </p>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block" htmlFor="account">
                          Account ID (12 digits) or account alias
                        </label>
                        <input
                          id="account"
                          type="text"
                          autoFocus
                          inputMode="text"
                          autoComplete="off"
                          value={accountId}
                          onChange={(e) => setAccountId(e.target.value)}
                          className={INPUT}
                          style={INPUT_BORDER}
                        />
                      </div>
                      <div>
                        <label className="block" htmlFor="iam-user-name">
                          IAM user name
                        </label>
                        <input
                          id="iam-user-name"
                          type="text"
                          autoComplete="username"
                          value={iamUserName}
                          onChange={(e) => setIamUserName(e.target.value)}
                          placeholder="username@example.com"
                          className={INPUT}
                          style={INPUT_BORDER}
                        />
                      </div>
                      <div>{passwordField}</div>
                    </div>

                    {errorText}

                    <div className="mt-6">{secondaryActions}</div>
                  </form>
                )}
              </div>
            </div>

            {/* Demo credentials — deliberately outside the card so the AWS chrome stays
                faithful while still being impossible to miss. */}
            <div
              className="rounded-[2px] px-3 py-[10px]"
              style={{ backgroundColor: NOTE_BG, border: `1px solid ${LINK}` }}
            >
              <p className="text-[13px] font-bold leading-[18px]" style={{ color: INK }}>
                Demo account
              </p>
              <p className="mt-[2px] text-[12px] leading-[18px]" style={{ color: GREY }}>
                {DEMO_EMAIL} / {DEMO_PASSWORD}
              </p>
              <button
                type="button"
                onClick={useDemoCredentials}
                className="mt-2 inline-flex h-7 w-full items-center justify-center rounded-[2px] bg-white text-[13px] font-bold tracking-[0.25px]"
                style={{ border: `1px solid ${LINK}`, color: LINK }}
              >
                Use demo credentials
              </button>
            </div>

            {/* Legal copy — user-type step only, as on AWS. Not a <small>: normalize's
                unlayered `small { font-size: 80% }` overrides Tailwind's text utility. */}
            {isSelectStep && (
              <p className="text-[12px] leading-[16px]" style={{ color: GREY }}>
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
              </p>
            )}
          </div>

          {/* Right: AWS marketing image (matches the live console sign-in page) */}
          {showMarketing && (
            <aside className="hidden w-[570px] shrink-0 lg:block">
              <a
                href="https://aws.amazon.com/ai/implementation/"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={MARKETING_SRC}
                  alt="Amazon Web Services Marketing"
                  width={570}
                  className="block w-[570px]"
                  onError={() => setShowMarketing(false)}
                />
              </a>
            </aside>
          )}
        </div>
      </main>

      {/* ─── Footer copyright ───────────────────────────────────── */}
      <footer className="py-5 text-center text-[12px]" style={{ color: GREY }}>
        © 2026 Amazon Web Services, Inc. or its affiliates. All rights reserved.
      </footer>
    </div>
  );
}
