"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeClosed, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

type MfaState = {
  challengeName: string;
  session: string;
  email: string;
  username: string;
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const registered = searchParams.get("registered");
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const finishLogin = () => {
    setSuccess(true);
    setTimeout(() => {
      window.location.href = redirectTo.startsWith("/")
        ? redirectTo
        : "/dashboard";
    }, 400);
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.mfaRequired && result.session) {
        setMfa({
          challengeName: result.challengeName || "SOFTWARE_TOKEN_MFA",
          session: result.session,
          email: result.email || data.email,
          username: result.username || data.email,
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        setError(result.error || "Login failed");
        setIsLoading(false);
        return;
      }

      finishLogin();
    } catch {
      setError("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa || !mfaCode.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: mfa.email,
          username: mfa.username,
          session: mfa.session,
          challengeName: mfa.challengeName,
          code: mfaCode.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Invalid MFA code");
        setIsLoading(false);
        return;
      }
      finishLogin();
    } catch {
      setError("MFA verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (mfa) {
    return (
      <form onSubmit={onMfaSubmit} className="space-y-4">
        <div className="bg-blue-50 text-blue-900 text-sm p-3 rounded-md border border-blue-100">
          Enter the code from your authenticator app
          {mfa.challengeName === "SMS_MFA" ? " (SMS)" : " (TOTP)"}.
        </div>
        {error && (
          <div className="bg-red-100 text-red-800 text-sm p-3 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md">
            Login successful! Redirecting...
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="mfa">Authentication code</Label>
          <Input
            id="mfa"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="font-mono tracking-widest"
          />
        </div>
        <button
          type="submit"
          className="w-full h-10 bg-blue-600 text-white rounded-md disabled:opacity-50"
          disabled={isLoading || mfaCode.trim().length < 4}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            </span>
          ) : (
            "Verify and sign in"
          )}
        </button>
        <button
          type="button"
          className="w-full text-sm text-slate-600 hover:underline"
          onClick={() => {
            setMfa(null);
            setMfaCode("");
            setError(null);
          }}
        >
          Back to password
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {registered === "true" && (
        <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md">
          Account created! Please sign in.
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-800 text-sm p-3 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md">
          Login successful! Redirecting...
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="name@company.com"
          {...register("email")}
          className={errors.email ? "border-red-500" : ""}
        />
        {errors.email && (
          <p className="text-sm text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            {...register("password")}
            className={errors.password ? "border-red-500 pr-10" : "pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
          >
            {showPassword ? (
              <EyeClosed className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-red-500">{errors.password.message}</p>
        )}
      </div>

      <button
        type="submit"
        className="w-full h-10 bg-blue-600 text-white rounded-md disabled:opacity-50"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="flex items-center justify-center">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </span>
        ) : (
          "Sign in"
        )}
      </button>
      {/* Prefill email hidden helper for MFA back-nav */}
      <span className="sr-only">{getValues("email")}</span>
    </form>
  );
}
