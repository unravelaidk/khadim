import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LuArrowRight, LuBot, LuEye, LuEyeOff, LuLoaderCircle, LuShieldCheck } from "react-icons/lu";
import KhadimLogo from "../assets/Khadim-logo.svg";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { authClient } from "../lib/auth-client";
import type { Route } from "./+types/login";

type AuthMode = "login" | "signup";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Log in - Khadim" },
    { name: "description", content: "Log in or create a Khadim account" },
  ];
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const redirectTo = searchParams.get("redirectTo") || "/";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    setMounted(false);
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, [mode]);

  const copy = useMemo(
    () =>
      mode === "signup"
        ? {
            eyebrow: "Get started",
            title: "Build agents that work while you sleep.",
            body: "Khadim is an open-source, local-first automation platform. Create an account to save your projects and run agents on your schedule.",
            button: "Create account",
            switchText: "Already have an account?",
            switchAction: "Log in",
          }
        : {
            eyebrow: "Welcome back",
            title: "Pick up right where you left off.",
            body: "Your agents, automations, and workspaces are waiting. Log in to continue building on Khadim.",
            button: "Log in",
            switchText: "New to Khadim?",
            switchAction: "Create an account",
          },
    [mode]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name, email, password, rememberMe: true })
          : await authClient.signIn.email({ email, password, rememberMe: true });

      if (result.error) {
        throw new Error(result.error.message || "Authentication failed. Please check your details and try again.");
      }

      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const cardTransition = mounted
    ? "opacity-100 translate-y-0"
    : "opacity-0 translate-y-3";

  const stagger = (index: number) =>
    mounted
      ? "opacity-100 translate-y-0"
      : "opacity-0 translate-y-2";

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center justify-center">
        <section
          className={`grid w-full overflow-hidden rounded-[2rem] border border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)] shadow-[var(--shadow-glass-lg)] backdrop-blur-2xl transition-all duration-700 ease-out lg:grid-cols-[1.08fr_0.92fr] ${cardTransition}`}
        >
          <div className="relative hidden min-h-[640px] flex-col justify-between overflow-hidden bg-[#0d1209] p-10 text-[#f2f6e8] lg:flex">
            <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-[#b8ff4b]/20 blur-3xl animate-pulse" />
            <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/3 rounded-full bg-[#67d6ff]/15 blur-3xl animate-pulse" style={{ animationDelay: "2s", animationDuration: "6s" }} />
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e5ff00]/5 blur-3xl animate-pulse" style={{ animationDelay: "1s", animationDuration: "8s" }} />

            <div className="relative z-10 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 [&>svg]:h-8 [&>svg]:w-8 [&>svg]:invert">
                <KhadimLogo />
              </div>
              <span className="text-2xl font-bold tracking-tight">Khadim</span>
            </div>

            <div className="relative z-10 max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-[#dceac8]">
                <LuBot className="h-4 w-4" />
                Agentic automation platform
              </div>
              <h1 className="text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.04em]">{copy.title}</h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-[#c6d1b4]">{copy.body}</p>
            </div>

            <div className="relative z-10 flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.06] p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#b8ff4b]/15">
                <LuShieldCheck className="h-5 w-5 text-[#b8ff4b]" />
              </div>
              <div className="text-sm leading-relaxed text-[#dceac8]">
                <span className="font-semibold text-[#f2f6e8]">End-to-end encrypted.</span>{" "}
                Your credentials are stored securely and never leave your control. Khadim is open-source and local-first by design.
              </div>
            </div>
          </div>

          <div className="flex min-h-[640px] items-center justify-center p-8 sm:p-12">
            <div className="w-full max-w-md">
              <Link to="/" className="mb-10 inline-flex items-center gap-3 text-[var(--text-primary)] lg:hidden">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl glass-panel [&>svg]:h-8 [&>svg]:w-8">
                  <KhadimLogo />
                </span>
                <span className="text-xl font-bold">Khadim</span>
              </Link>

              <p
                className={`text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)] transition-all duration-500 ease-out ${stagger(0)}`}
                style={{ transitionDelay: "50ms" }}
              >
                {copy.eyebrow}
              </p>
              <h2
                className={`mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] transition-all duration-500 ease-out ${stagger(1)}`}
                style={{ transitionDelay: "100ms" }}
              >
                {mode === "signup" ? "Create an account" : "Log in"}
              </h2>
              <p
                className={`mt-3 text-sm leading-6 text-[var(--text-muted)] transition-all duration-500 ease-out ${stagger(2)}`}
                style={{ transitionDelay: "150ms" }}
              >
                Use your email and password to continue.
              </p>

              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <div
                  className={`transition-all duration-500 ease-out ${stagger(3)}`}
                  style={{ transitionDelay: "200ms" }}
                >
                  {mode === "signup" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Name</span>
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoComplete="name"
                        required
                        minLength={2}
                        placeholder="Your full name"
                      />
                    </label>
                  ) : null}
                </div>

                <div
                  className={`transition-all duration-500 ease-out ${stagger(4)}`}
                  style={{ transitionDelay: "250ms" }}
                >
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--text-secondary)]">Email</span>
                    <Input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                    />
                  </label>
                </div>

                <div
                  className={`transition-all duration-500 ease-out ${stagger(5)}`}
                  style={{ transitionDelay: "300ms" }}
                >
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--text-secondary)]">Password</span>
                    <div className="relative">
                      <Input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        required
                        minLength={8}
                        placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
                        tabIndex={-1}
                      >
                        {showPassword ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                </div>

                <div
                  className={`transition-all duration-500 ease-out ${stagger(6)}`}
                  style={{ transitionDelay: "350ms" }}
                >
                  {error ? (
                    <div
                      className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
                      role="alert"
                    >
                      {error}
                    </div>
                  ) : null}
                </div>

                <div
                  className={`transition-all duration-500 ease-out ${stagger(7)}`}
                  style={{ transitionDelay: "400ms" }}
                >
                  <Button type="submit" className="mt-2 w-full gap-2" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <LuLoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        {copy.button}
                        <LuArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div
                className={`mt-8 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] transition-all duration-500 ease-out ${stagger(8)}`}
                style={{ transitionDelay: "450ms" }}
              >
                <span>{copy.switchText}</span>
                <button
                  type="button"
                  className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline transition-colors"
                  onClick={() => {
                    setError(null);
                    setMode(mode === "signup" ? "login" : "signup");
                  }}
                >
                  {copy.switchAction}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
