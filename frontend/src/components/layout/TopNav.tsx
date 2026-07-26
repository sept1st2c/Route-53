"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

const BAR = "#161d26";
const TEXT = "#ebebf0";
const MUTED = "#c6c6cd";
const FAINT = "#a4a4ad";
const DIVIDER = "#424650";
const PANEL = "#1b232d";
const LINK = "#42b4ff";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';
const ACCOUNT_ID = "016605188495";
const ACCOUNT_ID_DASHED = "0166-0518-8495";

const PANEL_SHADOW = "rgba(0,7,22,0.1) 0px 4px 20px 1px, rgb(66,70,80) 0px 1px 0px 0px inset";

/* ─── Icons (16px, Cloudscape style) ──────────────────────────────────────── */
const ic = { width: 16, height: 16, fill: "none", stroke: "currentColor", strokeWidth: 1.4 } as const;

const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    {[0, 6, 12].flatMap((x) => [0, 6, 12].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />))}
  </svg>
);
const SearchIcon = ({ color = MUTED }: { color?: string }) => (
  <svg viewBox="0 0 16 16" {...ic} stroke={color} aria-hidden>
    <path d="m11 11 4 4M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10Z" strokeLinejoin="round" />
  </svg>
);
const CloudShellIcon = () => (
  <svg viewBox="0 0 16 16" {...ic} strokeWidth={2} aria-hidden>
    <path
      d="M5 5l2.997 2.998L5 11m4.997-.002H12m3-7.626A2.374 2.374 0 0012.627 1H3.37A2.372 2.372 0 001 3.372v9.256a2.373 2.373 0 002.37 2.373h9.257A2.375 2.375 0 0015 12.628V3.372z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const BellIcon = () => (
  <svg viewBox="0 0 16 16" {...ic} aria-hidden>
    <path d="M14 12H2c-.39 0-.63-.44-.41-.76L4 8V5c0-2.21 1.79-4 4-4s4 1.79 4 4v3l2.41 3.24c.22.33-.02.76-.41.76ZM6 13c0 1.1.9 2 2 2s2-.9 2-2" strokeLinejoin="round" />
  </svg>
);
const HelpIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
    <path fillRule="evenodd" clipRule="evenodd" d="M8 0C3.586 0 0 3.584 0 8c0 4.415 3.586 8 8 8 4.416 0 8-3.585 8-8 0-1.92-.677-3.681-1.805-5.06A7.988 7.988 0 008 0zM8 2c1.874 0 3.546.86 4.648 2.205A6.002 6.002 0 018 14C4.69 14 2 11.311 2 8A6.004 6.004 0 018 2z" />
    <path d="M7.007 11.094h1.997v1.935H7.007v-1.935zM4.563 6.27c.052-1.272.497-2.173 1.332-2.705.526-.34 1.174-.51 1.943-.51 1.01 0 1.848.24 2.514.725.668.481 1.002 1.196 1.002 2.143 0 .58-.145 1.07-.436 1.467-.168.24-.495.55-.977.923l-.476.369c-.259.2-.431.435-.515.704-.055.169-.083.432-.089.789H7.053c.028-.755.098-1.274.215-1.563.116-.29.415-.62.897-.996l.49-.38c.16-.121.29-.254.389-.396.178-.245.267-.516.267-.81 0-.34-.099-.65-.297-.928-.199-.279-.562-.42-1.09-.42-.518 0-.885.173-1.102.516a1.989 1.989 0 00-.325 1.072H4.563z" />
  </svg>
);
const GearIcon = () => (
  <svg viewBox="0 0 16 16" {...ic} aria-hidden>
    <path
      d="M6.11 1.729c.07-.42.44-.729.86-.729h2.02c.43 0 .79.31.86.729l.17.999c.05.29.24.529.5.679.06.03.11.06.17.1.25.15.56.2.84.1l.95-.35c.4-.15.85 0 1.07.38l1.01 1.747c.21.37.13.839-.2 1.108l-.78.64c-.23.189-.34.479-.33.768v.2c0 .29.11.579.33.769l.78.639c.33.27.42.739.2 1.108l-1.01 1.748c-.21.37-.66.529-1.06.38l-.95-.35a.966.966 0 0 0-.84.1c-.06.03-.11.07-.17.1-.26.14-.45.389-.5.679l-.17.998A.878.878 0 0 1 9 15H6.98a.87.87 0 0 1-.86-.729l-.17-.998a.988.988 0 0 0-.5-.68c-.06-.03-.11-.06-.17-.1a.996.996 0 0 0-.84-.1l-.95.35c-.4.15-.85 0-1.06-.38l-1.01-1.747a.873.873 0 0 1 .2-1.108l.78-.64c.23-.189.34-.479.33-.768v-.2c0-.3-.11-.579-.33-.769l-.78-.639a.861.861 0 0 1-.2-1.108l1.01-1.748c.21-.37.66-.529 1.07-.38l.95.35c.28.1.58.06.84-.1.06-.03.11-.07.17-.1.26-.14.45-.379.5-.678l.15-1Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10 8c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CaretDown = ({ size = 12 }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden>
    <path d="M8 11 4 5h8l-4 6Z" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 16 16" {...ic} aria-hidden>
    <path d="M12 7H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1ZM5 7V4c0-1.65 1.35-3 3-3s3 1.35 3 3v3" strokeLinejoin="round" />
  </svg>
);
const CopyIcon = () => (
  <svg viewBox="0 0 16 16" {...ic} aria-hidden style={{ color: LINK, flexShrink: 0 }}>
    <path d="M15 5H5v10h10V5Z" strokeLinejoin="round" />
    <path d="M13 1H1v11" strokeLinejoin="round" />
  </svg>
);
const ExternalIcon = () => (
  <svg viewBox="0 0 16 16" {...ic} strokeWidth={1.3} aria-hidden className="ml-1 inline-block">
    <path d="M10 2h4v4M6 10l8-8M14 9.048V14H2V2h5" strokeLinejoin="round" />
  </svg>
);
function QIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <radialGradient id="q-grad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(26 -2) rotate(135) scale(40 51)">
          <stop stopColor="#9933ff" />
          <stop offset="0.45" stopColor="#5c7fff" />
          <stop offset="0.8" stopColor="#3ad5e6" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#q-grad)" />
      <path
        fill="#fff"
        d="M18.22 7.41 12.87 4.32a1.7 1.7 0 0 0-1.74 0L5.78 7.41c-.48.27-.87.95-.87 1.5v6.18c0 .55.39 1.23.87 1.51l5.36 3.09c.48.28 1.26.28 1.74 0l5.36-3.09c.48-.28.87-.96.87-1.51V8.91c0-.55-.39-1.23-.87-1.5ZM12 17.88l-5.09-2.94V9.06L12 6.12l5.09 2.94v4.72L14 12V11.26c0-.26-.14-.49-.36-.62l-1.28-.74a.78.78 0 0 0-.72 0l-1.28.74c-.22.13-.36.36-.36.62v1.48c0 .26.14.49.36.62l1.28.74c.22.13.5.13.72 0l.64-.37 3.09 1.78L12 17.87Z"
      />
    </svg>
  );
}

/* ─── Building blocks ─────────────────────────────────────────────────────── */
function Divider() {
  return <span className="my-2 w-px self-stretch" style={{ backgroundColor: DIVIDER }} />;
}

function IconButton({
  label,
  onClick,
  active,
  disabledCursor,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabledCursor?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex items-center px-4 transition-colors"
      style={{ color: TEXT, backgroundColor: active ? "#0f141a" : "transparent", cursor: disabledCursor ? "not-allowed" : undefined }}
    >
      {children}
    </button>
  );
}

function Panel({ width = 300, children }: { width?: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute right-0 top-full z-50 rounded-b-lg"
      style={{ width, backgroundColor: PANEL, boxShadow: PANEL_SHADOW, color: TEXT }}
    >
      {children}
    </div>
  );
}

const REGIONS: { group: string; items: [string, string][] }[] = [
  { group: "United States", items: [["N. Virginia", "us-east-1"], ["Ohio", "us-east-2"], ["N. California", "us-west-1"], ["Oregon", "us-west-2"]] },
  { group: "Asia Pacific", items: [["Mumbai", "ap-south-1"], ["Osaka", "ap-northeast-3"], ["Seoul", "ap-northeast-2"], ["Singapore", "ap-southeast-1"], ["Sydney", "ap-southeast-2"], ["Tokyo", "ap-northeast-1"]] },
  { group: "Canada", items: [["Central", "ca-central-1"]] },
  { group: "Europe", items: [["Frankfurt", "eu-central-1"], ["Ireland", "eu-west-1"], ["London", "eu-west-2"], ["Paris", "eu-west-3"], ["Stockholm", "eu-north-1"]] },
  { group: "South America", items: [["São Paulo", "sa-east-1"]] },
];

type Menu = "help" | "settings" | "regions" | "account" | null;

export function TopNav() {
  const router = useRouter();
  const { logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [menu, setMenu] = useState<Menu>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleMenu = (m: Menu) => setMenu((cur) => (cur === m ? null : m));
  const alias = "personal"; // mocked AWS account chrome — matches the reference console
  const visualMode = theme; // "light" | "dark"
  const setVisual = (m: "light" | "dark") => {
    if (m !== theme) toggle();
  };

  const onLogout = async () => {
    setMenu(null);
    await logout();
    router.replace("/login");
  };

  return (
    <header ref={ref} className="relative z-50 flex h-12 items-stretch" style={{ backgroundColor: BAR, color: TEXT, fontFamily: FONT }}>
      {/* click-away backdrop */}
      {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden />}

      {/* Logo */}
      <a href="/dashboard" className="flex items-center px-4" aria-label="AWS Console Home">
        {/* white-on-black source; `screen` blend drops the black bg onto the navbar */}
        <img
          src="/brand/aws-logo.jpeg"
          alt="AWS"
          height={20}
          className="h-[20px] w-auto select-none"
          style={{ mixBlendMode: "screen" }}
          draggable={false}
        />
      </a>
      <Divider />

      {/* Amazon Q */}
      <button type="button" aria-label="Amazon Q" className="flex items-center px-3">
        <span className="block h-6 w-6 overflow-hidden rounded-[6px]">
          <img src="/brand/amazon-q.jpg" alt="Amazon Q" className="h-full w-full scale-110 select-none object-cover" draggable={false} />
        </span>
      </button>

      {/* Services grid */}
      <IconButton label="Services">
        <GridIcon />
      </IconButton>

      {/* Search (cosmetic) */}
      <div className="flex flex-1 items-center px-2">
        <div
          className="relative flex h-[30px] w-full max-w-[540px] items-center rounded-lg pl-9 pr-2"
          style={{ backgroundColor: "#0f141a", border: `1.5px solid #656871` }}
        >
          <span className="absolute left-3" style={{ color: MUTED }}>
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search"
            className="h-full w-full bg-transparent text-[14px] italic outline-none placeholder:italic"
            style={{ color: TEXT }}
          />
          <span className="mr-2 text-[12px]" style={{ color: FAINT }}>
            [Alt+S]
          </span>
          <QIcon size={16} />
        </div>
      </div>

      {/* CloudShell (decorative — not wired) */}
      <Divider />
      <IconButton label="CloudShell" disabledCursor>
        <CloudShellIcon />
      </IconButton>
      <Divider />

      {/* Notifications (none available — AWS shows no badge in this state) */}
      <button type="button" aria-label="Notifications (none available)" className="relative flex items-center px-4" style={{ color: TEXT, cursor: "not-allowed" }}>
        <BellIcon />
      </button>

      {/* Help */}
      <Divider />
      <div className="relative flex">
        <IconButton label="Help & support" active={menu === "help"} onClick={() => toggleMenu("help")}>
          <HelpIcon />
        </IconButton>
        {menu === "help" && (
          <Panel width={300}>
            <h3 className="px-5 pb-3 pt-5 text-[18px] font-bold" style={{ letterSpacing: "-0.18px" }}>
              Support <ExternalIcon />
            </h3>
            <hr style={{ borderColor: DIVIDER }} />
            <ul className="py-1 text-[14px]" style={{ color: "#dedee3" }}>
              {["Support Center", "re:Post", "Documentation", "Training", "Getting Started Resource Center"].map((t, i) => (
                <li key={t} className="px-5 py-1" style={i === 1 ? { borderBottom: `1px solid ${DIVIDER}`, paddingBottom: 12, marginBottom: 4 } : {}}>
                  <a href="#" className="hover:underline">{t}</a>
                </li>
              ))}
            </ul>
            <hr className="mx-5 my-2" style={{ borderColor: DIVIDER }} />
            <div className="px-5 pb-5 pt-1">
              <button className="text-[14px] font-bold" style={{ color: LINK }}>Send feedback</button>
            </div>
          </Panel>
        )}
      </div>

      {/* Settings (Visual mode → theme) */}
      <Divider />
      <div className="relative flex">
        <IconButton label="Settings" active={menu === "settings"} onClick={() => toggleMenu("settings")}>
          <GearIcon />
        </IconButton>
        {menu === "settings" && (
          <Panel width={320}>
            <h3 className="px-5 pb-3 pt-5 text-[18px] font-bold" style={{ letterSpacing: "-0.18px" }}>
              Current user settings
            </h3>
            <div className="flex flex-col gap-5 px-5 pb-2">
              <div>
                <label className="text-[14px] font-bold">Language</label>
                <div
                  className="mt-1 flex h-8 items-center justify-between rounded-lg px-3 text-[14px]"
                  style={{ backgroundColor: BAR, border: `1px solid #656871` }}
                >
                  <span>Browser default</span>
                  <CaretDown />
                </div>
              </div>
              <div>
                <label className="text-[14px] font-bold">
                  Visual mode <span className="italic" style={{ color: FAINT }}>– beta</span>
                </label>
                <div className="mt-1 flex flex-col gap-1">
                  {([["Browser default", "light"], ["Light", "light"], ["Dark", "dark"]] as const).map(([label, mode], i) => {
                    // index 0 = Browser default (treated as light), 1 = Light, 2 = Dark
                    const checked = i === 0 ? false : (mode === visualMode);
                    return (
                      <label key={label} className="flex cursor-pointer items-center gap-2 text-[14px]">
                        <input
                          type="radio"
                          name="visual-mode"
                          checked={checked}
                          onChange={() => setVisual(mode)}
                          className="h-3.5 w-3.5"
                          style={{ accentColor: LINK }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <hr className="mx-5 my-3" style={{ borderColor: DIVIDER }} />
            <div className="flex flex-col gap-3 px-5 pb-5 text-[14px] font-bold" style={{ color: LINK }}>
              <a href="#">See all user settings</a>
              <a href="#" className="flex items-center">AWS experimental preview <ExternalIcon /></a>
            </div>
          </Panel>
        )}
      </div>
      <Divider />

      {/* Regions */}
      <div className="relative flex">
        <button
          type="button"
          aria-label="Regions"
          onClick={() => toggleMenu("regions")}
          className="flex items-center gap-1 px-4 text-[14px]"
          style={{ color: TEXT, backgroundColor: menu === "regions" ? "#0f141a" : "transparent" }}
        >
          Global <CaretDown />
        </button>
        {menu === "regions" && (
          <Panel width={336}>
            <div className="px-5 pb-3 pt-4">
              <div
                className="inline-grid grid-cols-2 gap-[9px] rounded-full px-[3px] py-px"
                style={{ border: `1px solid #656871`, backgroundColor: BAR }}
              >
                <span className="rounded-full px-4 py-1 text-[14px] font-bold" style={{ backgroundColor: "#42b4ff", color: "#0f141a" }}>Regions</span>
                <span className="rounded-full px-4 py-1 text-[14px] font-bold" style={{ color: "#dedee3" }}>Local Zones</span>
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              {REGIONS.map(({ group, items }) => (
                <div key={group}>
                  <h6 className="mx-5 border-b py-1 text-[14px] font-bold" style={{ borderColor: "#333843", color: TEXT }}>{group}</h6>
                  <ul>
                    {items.map(([name, code]) => (
                      <li key={code} className="mx-5 border-b" style={{ borderColor: "#333843" }}>
                        {/* every Region is locked for this account, so rows are non-interactive */}
                        <div className="flex w-full items-center justify-between py-1 text-[14px]" style={{ color: FAINT, cursor: "default", pointerEvents: "none" }}>
                          <span className="flex items-center gap-2"><LockIcon /> {name}</span>
                          <span>{code}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mx-5 py-3 text-[14px]" style={{ color: MUTED }}>
                <span className="underline">There are 17 Regions that are not enabled for this account</span>
              </div>
            </div>
            <div className="sticky bottom-0" style={{ backgroundColor: PANEL, borderTop: `1px solid ${DIVIDER}` }}>
              <div className="m-5 flex items-center gap-4 text-[14px] font-bold" style={{ color: LINK }}>
                <a href="#">Manage Regions</a>
                <span style={{ color: DIVIDER }}>|</span>
                <a href="#">Manage Local Zones</a>
              </div>
            </div>
          </Panel>
        )}
      </div>

      {/* Account — gray account chip hangs from the top edge, alias below (matches AWS) */}
      <div className="relative flex items-stretch pr-2">
        <button
          type="button"
          aria-label="Account"
          onClick={() => toggleMenu("account")}
          className="flex flex-col items-end px-2"
          style={{ backgroundColor: menu === "account" ? "#0f141a" : "transparent" }}
        >
          <span
            className="flex max-w-[180px] items-center gap-1 rounded-b px-2 pb-[3px] pt-1 text-[12px] font-bold leading-none"
            style={{ backgroundColor: "#7d8998", color: "#16191f" }}
          >
            <span className="truncate">
              {alias} ({ACCOUNT_ID})
            </span>
            <CaretDown size={11} />
          </span>
          <span className="px-1 pt-1 text-[12px] font-medium" style={{ color: TEXT }}>
            {alias}
          </span>
        </button>
        {menu === "account" && (
          <Panel width={460}>
            <div className="max-h-[80vh] overflow-y-auto">
              {/* Free plan status */}
              <div className="px-5 pb-4 pt-5">
                <h4 className="text-[16px] font-bold" style={{ color: TEXT, letterSpacing: "-0.08px" }}>Free plan status</h4>
                <div className="mt-4 grid grid-cols-2 text-[14px]">
                  <div className="pr-5">
                    <div className="font-bold" style={{ color: TEXT }}>Credits remaining</div>
                    <a href="#" className="underline" style={{ color: LINK }}>$80.79 USD</a>
                  </div>
                  <div className="pl-5" style={{ borderLeft: `1px solid ${DIVIDER}` }}>
                    <div className="font-bold" style={{ color: TEXT }}>Days remaining</div>
                    <div style={{ color: "#dedee3" }}>89 days</div>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-4" style={{ color: MUTED }}>
                  Your free access to AWS services will end on Sep 14, 2026 or when you have depleted all credits. To ensure uninterrupted AWS access, see{" "}
                  <a href="#" className="underline" style={{ color: LINK }}>upgrading your plan</a> for details.
                </p>
              </div>
              <hr className="mx-5" style={{ borderColor: DIVIDER }} />

              {/* Account identifiers */}
              <div className="flex flex-col gap-3 px-5 py-4 text-[14px]">
                <div>
                  <div className="font-bold" style={{ color: TEXT }}>Account ID</div>
                  <div className="mt-0.5 flex items-center gap-1.5" style={{ color: "#dedee3" }}>
                    <CopyIcon /> {ACCOUNT_ID_DASHED}
                  </div>
                </div>
                <div>
                  <div className="font-bold" style={{ color: TEXT }}>Account name</div>
                  <div className="mt-0.5 flex items-center gap-1.5" style={{ color: "#dedee3" }}>
                    <CopyIcon /> {alias}
                  </div>
                </div>
                <div>
                  <div className="font-bold" style={{ color: TEXT }}>Account color</div>
                  <div className="mt-0.5 flex items-center gap-1.5" style={{ color: "#dedee3" }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="8" fill="#7d8998" /></svg>
                    Unset
                  </div>
                </div>
              </div>
              <hr className="mx-5" style={{ borderColor: DIVIDER }} />

              {/* Nav links */}
              <ul className="flex flex-col gap-3 px-5 py-4 text-[14px]" style={{ color: "#dedee3" }}>
                {["Account", "Organization", "Service Quotas", "Billing and Cost Management", "Security credentials", "Console Mobile App"].map((t) => (
                  <li key={t}>
                    <a href="#" className="hover:underline">{t}</a>
                  </li>
                ))}
              </ul>
              <hr className="mx-5" style={{ borderColor: DIVIDER }} />

              {/* Actions */}
              <div className="flex flex-col items-end gap-2 px-5 py-4">
                <button
                  className="rounded-full px-5 py-1 text-[14px] font-bold"
                  style={{ color: LINK, border: `1px solid ${LINK}`, backgroundColor: "transparent" }}
                >
                  Turn on multi-session support
                </button>
                <button
                  onClick={onLogout}
                  className="rounded-full px-5 py-1 text-[14px] font-bold"
                  style={{ backgroundColor: "#ff9900", color: "#0f141a" }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </header>
  );
}
