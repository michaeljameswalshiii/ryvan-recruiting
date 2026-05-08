import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // ALWAYS allow all routes in production to prevent redirect loops on Vercel
  // TODO: Fix auth properly later
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
