"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses: Record<string, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
};

function getInitials(text: string | undefined): string {
  if (!text) return "?";
  const parts = text.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return text.substring(0, 2).toUpperCase();
}

export function Avatar(props: AvatarProps) {
  const { src, alt, fallback, size = "md", className, ...rest } = props;
  const [imageError, setImageError] = React.useState(false);

  const showFallback = !src || imageError;

  return (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full bg-muted",
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center bg-primary/10 font-medium text-primary">
          {getInitials(fallback || alt)}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  );
}

interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  max?: number;
  children: React.ReactNode;
}

export function AvatarGroup(props: AvatarGroupProps) {
  const { max = 4, children, className, ...rest } = props;
  const childArray = React.Children.toArray(children);
  const visibleAvatars = childArray.slice(0, max);
  const remainingCount = childArray.length - max;

  return (
    <div className={cn("flex -space-x-2", className)} {...rest}>
      {visibleAvatars.map((child: React.ReactNode, index: number) => (
        <div key={index} className="ring-2 ring-background rounded-full">
          {child}
        </div>
      ))}
      {remainingCount > 0 && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
