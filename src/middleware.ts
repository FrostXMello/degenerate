import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login"];
const GATE_ONLY_PATHS = ["/gate"];
const BAR_PATHS = ["/order", "/orders", "/stock", "/products", "/dashboard", "/closing"];

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
      const dest = role === "GATE_STAFF" ? "/gate" : "/order";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (!role) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  if (role === "GATE_STAFF") {
    if (pathname === "/gate" || (pathname.startsWith("/gate/") && !pathname.startsWith("/gate/staff"))) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/gate/staff")) {
      return NextResponse.redirect(new URL("/gate", request.url));
    }
    return NextResponse.redirect(new URL("/gate", request.url));
  }

  if (pathname === "/" || pathname === "") {
    return NextResponse.redirect(new URL(role === "ADMIN" ? "/order" : "/order", request.url));
  }

  // Bar operators stay on bar routes; /gate is admin (+ gate staff) only for simplicity
  // Admin can access everything including gate.
  if (role === "BAR_OPERATOR") {
    const isGate = GATE_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (isGate) {
      return NextResponse.redirect(new URL("/order", request.url));
    }
  }

  void BAR_PATHS;
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
