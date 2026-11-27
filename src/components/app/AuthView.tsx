"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { navigate } from "./router";
import { useAuth } from "./auth-context";
import { useToast } from "@/hooks/use-toast";

export default function AuthView({ mode }: { mode: "login" | "register" }) {
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { email, password, name: name || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      await refresh();
      toast({
        title: mode === "login" ? "Welcome back" : "Account created",
        description: mode === "login" ? "You are now signed in." : "Your free account is ready — start building your watchlist.",
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-6">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-primary/12 text-primary">
            {mode === "login" ? <KeyRound className="h-5 w-5" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />}
          </div>
          <CardTitle className="text-xl">{mode === "login" ? "Sign in to PatentPulse" : "Create your free account"}</CardTitle>
          <CardDescription>
            {mode === "login"
              ? "Access your watchlist and tracking alerts."
              : "Track companies, patents and cases with a personal watchlist."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === "register" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Doe" autoComplete="name" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-4 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Demo accounts</p>
            <p className="mt-1">
              Analyst: <code className="font-mono">demo@patentpulse.demo</code> / <code className="font-mono">Demo123!</code>
            </p>
            <p>
              Admin: <code className="font-mono">admin@patentpulse.demo</code> / <code className="font-mono">Admin123!</code>
            </p>
          </div>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                No account yet?{" "}
                <button onClick={() => navigate("/register")} className="font-semibold text-primary hover:underline">
                  Create one free
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button onClick={() => navigate("/login")} className="font-semibold text-primary hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
