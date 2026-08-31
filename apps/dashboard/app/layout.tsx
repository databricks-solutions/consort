import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cssVariables } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Consort · Agent Mission Control",
  description: "Live observability for a Consort run",
};

// The launch/env default: `THEME=dark ./run.sh` boots the board dark (deterministic for a
// pinned demo). A per-viewer choice from the in-app toggle lives in localStorage and overrides
// this — see the no-flash script below and app/useTheme.ts. Default is light, matching the
// board's "looks identical on any machine unless you ask otherwise" stance.
const envTheme = process.env.THEME === "dark" ? "dark" : undefined;

// Runs before first paint so a stored/queried dark choice doesn't flash the light default.
// Precedence: ?theme= query (transient) > localStorage (persisted) > env SSR default.
const noFlashTheme = `(function(){try{
  var q=new URLSearchParams(location.search).get('theme');
  var s=localStorage.getItem('theme');
  // A valid query wins; an invalid one (typo/stale link) must NOT shadow a stored choice.
  var t=(q==='dark'||q==='light')?q:s;
  if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      data-theme={envTheme}
      suppressHydrationWarning
    >
      <head>
        {/* Design tokens as CSS custom properties, generated from lib/theme.ts: a light :root
            block and a :root[data-theme="dark"] block, so flipping data-theme re-themes the
            whole board (inline styles, CSS, and SVG) with no re-render. */}
        <style dangerouslySetInnerHTML={{ __html: cssVariables() }} />
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
