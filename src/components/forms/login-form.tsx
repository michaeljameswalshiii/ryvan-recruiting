
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeClosed, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Use server-side auth with httpOnly cookies (SECURE)
import { login } from "@/lib/api/auth-client";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for registration success from URL param (set by signup form)
  const registered = searchParams.get("registered");

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

const onSubmit = async (data: LoginFormData) => {
    // Use alert for debugging since console might not show
    alert('[LOGIN FORM] Submitting: ' + data.email);
    console.log('[LOGIN FORM] Submitting:', data.email);
    try {
      setIsLoading(true);
      setError(null);
      
      alert('[LOGIN FORM] Making fetch request...');
      console.log('[LOGIN FORM] Making fetch request...');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      
      alert('[LOGIN FORM] Response status: ' + response.status);
      console.log('[LOGIN FORM] Response status:', response.status);
      const result = await response.json();
      alert('[LOGIN FORM] Response: ' + JSON.stringify(result));
      console.log('[LOGIN FORM] Response JSON:', JSON.stringify(result));
      
      if (!response.ok) {
        alert('[LOGIN FORM] Error: ' + result.error);
        setError(result.error || 'Login failed');
        setIsLoading(false);
        return;
      }
      
      alert('[LOGIN FORM] Success, redirecting...');
      console.log('[LOGIN FORM] Success user:', result.user);
      console.log('[LOGIN FORM] Redirecting to dashboard...');
      // Use direct window.location for reliable redirect
      setTimeout(() => {
        alert('[LOGIN FORM] Doing redirect now...');
        console.log('[LOGIN FORM] Doing redirect now...');
        window.location.replace('/dashboard');
      }, 100);
    } catch (err: unknown) {
      alert('[LOGIN FORM] Catch Error: ' + err);
      console.error('[LOGIN FORM] Catch Error:', err);
      const errorMessage = err instanceof Error ? err.message : "Invalid credentials";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {registered === "true" && (
        <div className="bg-green-100 text-green-800 text-sm p-3 rounded-md">
          Account created! Please sign in to continue.
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="name@company.com"
          {...register("email")}
          className={errors.email ? "border-destructive" : ""}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
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
            className={errors.password ? "border-destructive pr-10" : "pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? (
              <EyeClosed className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

<button
        type="submit"
        className="w-full h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
