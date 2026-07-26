// Inline recreation of the AWS "smile" wordmark (no external image dependency).
export function AwsLogo({
  width = 50,
  className = "",
  wordmark = "#252f3e",
}: {
  width?: number;
  className?: string;
  wordmark?: string;
}) {
  const height = (width / 50) * 30;
  return (
    <svg
      viewBox="0 0 50 30"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Amazon Web Services"
    >
      <text
        x="0"
        y="19"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="22"
        fontWeight="700"
        letterSpacing="-1.5"
        fill={wordmark}
      >
        aws
      </text>
      {/* smile */}
      <path
        d="M3 24.5 C 16 30.5, 34 30.5, 45 25"
        stroke="#ff9900"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      {/* arrowhead */}
      <path
        d="M41.5 23.2 L46 25 L43.8 29.2"
        stroke="#ff9900"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
