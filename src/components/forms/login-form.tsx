"use client";

import { useState, useEffect } from "react";
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

export function LoginForm() {
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check for registration success from URL param
  const registered = searchParams.get("registered");

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    console.log('[LOGIN] Starting login for:', data.email);
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      console.log('[LOGIN] Response status:', response.status);
      const result = await response.json();
      console.log('[LOGIN] Response:', result);
      
      if (!response.ok) {
        console.log('[LOGIN] Error:', result.error);
        setError(result.error || 'Login failed');
        setIsLoading(false);
        return;
      }
      
      console.log('[LOGIN] Success! Redirecting...');
      setSuccess(true);
      
      // Small delay then redirect
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } catch (err) {
      console.error('[LOGIN] Catch error:', err);
      setError("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

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
            {showPassword ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
    </form>
  );
}
