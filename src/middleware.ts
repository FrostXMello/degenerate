import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login"];

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "degenerate-party-bar-change-me-before-the-event");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("degenerate_session")?.value;
  let role: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      role = String(payload.role);
    } catch {
      role = null;
    }
  }

  if (PUBLIC.includes(pathname)) {
    if (role) {
      const dest = role === "GATE_STAFF" ? "/guests" : "/order";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (!role) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  // Legacy gate URLs → guests
  if (pathname === "/gate" || pathname.startsWith("/gate/")) {
    if (pathname.startsWith("/gate/staff")) {
      return NextResponse.redirect(new URL("/guests/staff", request.url));
    }
    return NextResponse.redirect(new URL("/guests", request.url));
  }

  if (role === "GATE_STAFF") {
    if (pathname === "/guests" || pathname.startsWith("/guests/")) {
      // Staff admin is admin-only
      if (pathname.startsWith("/guests/staff")) {
        return NextResponse.redirect(new URL("/guests", request.url));
      }
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/guests", request.url));
  }

  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL("/order", request.url));
  }

  if (role === "BAR_OPERATOR") {
    if (pathname === "/guests" || pathname.startsWith("/guests/")) {
      return NextResponse.redirect(new URL("/order", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
