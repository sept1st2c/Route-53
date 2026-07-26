import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Route 53 Management Console",
  description: "Hosted zones and DNS record management — a Route 53 clone.",
};

// Set the theme class before paint to avoid a flash of the wrong theme.
const noFlashTheme = `
(function () {
  try {
    var t = localStorage.getItem('r53-theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body className="antialiased min-h-screen bg-layout text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
