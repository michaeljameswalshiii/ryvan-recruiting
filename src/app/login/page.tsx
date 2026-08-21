import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/forms/login-form";

function LoginFormWithSuspense() {
  return (
    <Suspense fallback={<div className="text-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
<p className="text-sm font-black uppercase tracking-[0.25em] text-[#509ee2]">RYVAN Recruiting</p>
          <h1 className="mt-3 text-3xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>

        <LoginFormWithSuspense />

        <p className="text-center text-sm text-muted-foreground">
          Need an account?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
