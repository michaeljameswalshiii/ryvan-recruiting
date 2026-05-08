import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Skip auth if Cognito credentials aren't configured
  const hasCognito = !!(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID && process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID);
  
  // Allow all routes if no Cognito config (Vercel production fix)
  if (!hasCognito) {
    return NextResponse.next();
  }
  
  // DEV MODE: Skip auth checks for development
  const isDev = process.env.NODE_ENV === "development";
  
  if (isDev) {
    return NextResponse.next();
  }

  // Check for access token in cookies (set by Cognito auth)
  const accessToken = request.cookies.get("accessToken")?.value;

  const isAuthedRoute = request.nextUrl.pathname.startsWith("/dashboard");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isSignupRoute = request.nextUrl.pathname.startsWith("/signup");

  // If trying to access dashboard without auth, redirect to login
  if (isAuthedRoute && !accessToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If logged in and going to login/signup, redirect to dashboard
  if ((isLoginRoute || isSignupRoute) && accessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
