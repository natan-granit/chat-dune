"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signup,
    null
  );

  return (
    <div className="rounded-xl border border-[var(--cd-border)] bg-[var(--cd-surface)] p-8">
      <h1 className="mb-1 text-xl font-semibold text-[var(--cd-text-primary)]">
        Create account
      </h1>
      <p className="mb-6 text-sm text-[var(--cd-text-secondary)]">
        Sign up to start using chat-dune.
      </p>

      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-sm font-medium text-[var(--cd-text-primary)]"
          >
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium text-[var(--cd-text-primary)]"
          >
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>

        {state?.error && (
          <p className="rounded-md bg-[var(--cd-error-subtle)] px-3 py-2 text-sm text-[var(--cd-error)]">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--cd-text-secondary)]">
        Already have an account?{" "}
        <Link href="/login" className="text-[var(--cd-accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
