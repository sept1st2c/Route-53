const BAR = "#161d26";
const TEXT = "#d5dbdb";
const FONT = '"Amazon Ember", "Helvetica Neue", Roboto, Arial, sans-serif';

function FootLink({ children }: { children: React.ReactNode }) {
  return (
    <button className="hover:underline" style={{ color: TEXT }}>
      {children}
    </button>
  );
}

export function ConsoleFooter() {
  return (
    <footer
      className="flex h-[26px] shrink-0 items-center justify-between px-3 text-[12px]"
      style={{ backgroundColor: BAR, color: TEXT, fontFamily: FONT }}
    >
      <div className="flex items-center gap-4">
        <FootLink>CloudShell</FootLink>
        <FootLink>Feedback</FootLink>
        <FootLink>Console Mobile App</FootLink>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden sm:inline" style={{ color: "#a4a4ad" }}>
          © 2026, Amazon Web Services, Inc. or its affiliates.
        </span>
        <FootLink>Privacy</FootLink>
        <FootLink>Terms</FootLink>
        <FootLink>Cookie preferences</FootLink>
      </div>
    </footer>
  );
}
