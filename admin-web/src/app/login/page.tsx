"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import mark from "@/assets/a3-mark.png";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { AuthError } from "@a3/domain";
import { Button } from "@/components/Button";
import { authRepo, sessionEndedStore } from "@/data/repos/auth";
import { useStore } from "@/data/repos/useStore";
import { BASE } from "@/data/repos/api";
import { useRestoredSession } from "@/lib/useSession";

type Mode = "signin" | "forgot" | "reset";

const tokenFromUrl = (): string | null =>
  new URLSearchParams(window.location.search).get("token");

export default function LoginPage() {
  const router = useRouter();
  const { user } = useRestoredSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [resetToken, setResetToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"email" | "password" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ activeDrivers: number; jobsThisMonth: number } | null>(null);
  const endedReason = useStore(sessionEndedStore);

  useEffect(() => {
    const t = tokenFromUrl();
    if (t) {
      setResetToken(t);
      setMode("reset");
    }
  }, []);

  useEffect(() => {
    fetch(`${BASE}/public/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user && mode === "signin" && !tokenFromUrl()) router.replace("/");
  }, [user, mode, router]);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setErrorField(null);
    setNotice(null);
    setPassword("");
    setShowPassword(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      if (mode === "signin") {
        await authRepo.login(email, password, remember);
        router.push("/");
      } else if (mode === "forgot") {
        const { expiryLabel } = await authRepo.requestReset(email);
        setNotice(`If ${email} has an account, a reset link is on its way. ${expiryLabel}`);
      } else {
        await authRepo.resetPassword(resetToken, password);
        window.history.replaceState(null, "", window.location.pathname);
        setResetToken("");
        setMode("signin");
        setNotice("Password changed. Sign in with your new one.");
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setErrorField(err instanceof AuthError ? (err.field ?? null) : null);
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "signin" ? "Sign in" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  const sub =
    mode === "signin"
      ? "Admin, Manager, Project Manager & Dispatcher access."
      : mode === "forgot"
        ? "We'll email you a link to set a new one."
        : "This link works once. You'll be signed out everywhere else.";

  return (
    <div className="login-split">
      <div className="login-hero">
        <div className="side-logo" style={{ padding: 0, fontSize: 26 }}>
          <span className="lm" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <Image src={mark} alt="" width={44} height={44} unoptimized />
          </span>
          A3TRANZ
        </div>
        <div style={{ marginTop: "auto" }}>
          <div className="login-hero-h">
            Dispatch, assign, and
            <br />
            track every job.
          </div>
          <div
            style={{
              font: "500 16px var(--f)",
              color: "var(--side-ink)",
              marginTop: 16,
              maxWidth: 420,
              lineHeight: 1.6,
            }}
          >
            The A 3 Transport operations portal — create job cards, assign drivers, and keep
            every update in one place.
          </div>
          {stats && (
            <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
              <div>
                <div style={{ font: "800 26px var(--fd)" }}>{stats.activeDrivers}</div>
                <div style={{ font: "500 13px var(--f)", color: "var(--side-ink)" }}>
                  Active drivers
                </div>
              </div>
              <div>
                <div style={{ font: "800 26px var(--fd)" }}>{stats.jobsThisMonth}</div>
                <div style={{ font: "500 13px var(--f)", color: "var(--side-ink)" }}>
                  Jobs this month
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-panel">
          <div style={{ font: "800 26px var(--fd)", color: "var(--text)", letterSpacing: "-.5px" }}>
            {heading}
          </div>
          <div
            style={{
              font: "500 14px var(--f)",
              color: "var(--text-2)",
              margin: error || notice || endedReason ? "6px 0 20px" : "6px 0 28px",
            }}
          >
            {sub}
          </div>

          {(error ?? endedReason) && (
            <div className="toast toast-err" style={{ marginBottom: 20 }}>
              <AlertTriangle />
              {error ?? endedReason}
            </div>
          )}
          {notice && (
            <div className="toast toast-ok" style={{ marginBottom: 20 }}>
              <CheckCircle2 />
              {notice}
            </div>
          )}

          {mode !== "reset" && (
            <div className="field">
              <label>Work email</label>
              <input
                className={`input${errorField === "email" ? " bad" : ""}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
                required
              />
            </div>
          )}

          {mode !== "forgot" && (
            <div className="field">
              <label>{mode === "reset" ? "New password" : "Password"}</label>
              <div style={{ position: "relative" }}>
                <input
                  className={`input${errorField === "password" ? " bad" : ""}`}
                  style={{ paddingRight: 44 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "reset" ? "new-password" : "current-password"}
                  minLength={mode === "reset" ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 36,
                    height: 36,
                    display: "grid",
                    placeItems: "center",
                    border: "none",
                    background: "none",
                    color: "var(--text-2)",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {mode === "reset" && (
                <div className="t-sub" style={{ marginTop: 7 }}>
                  At least 8 characters.
                </div>
              )}
            </div>
          )}

          {mode === "signin" && (
            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <button type="button" className="linkbtn" onClick={() => go("forgot")}>
                Forgot password?
              </button>
            </div>
          )}

          <Button type="submit" variant="primary" style={{ width: "100%", height: 46 }} disabled={busy}>
            {busy
              ? "Working…"
              : mode === "signin"
                ? "Sign in"
                : mode === "forgot"
                  ? "Send reset link"
                  : "Set new password"}
          </Button>

          {mode !== "signin" && (
            <button
              type="button"
              className="linkbtn"
              style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => go("signin")}
            >
              <ArrowLeft style={{ width: 15, height: 15 }} />
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
