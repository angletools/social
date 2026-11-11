import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/health"];

// Cheap gate: real session validation happens server-side in requireUser().
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("rasd_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon|icon|.*\\.(?:png|svg|jpg|ico|woff2?)$).*)"] };
