"use client";
// W1 — Login (task W-02a). Pixel port of W1-role-based / W1-error from
// a3tranz-admin-all.html: `.login-split` hero + form, outside the app
// shell. Role is chosen at login — whichever fixture user matches the
// email decides the role that drives everything downstream (§6.6).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Truck } from "lucide-react";
import { Button } from "@/components/Button";
import { authRepo } from "@/data/repos/auth";
import { useRestoredSession } from "@/lib/useSession";

export default function LoginPage() {
  const router = useRouter();
  // Redeems a persisted token, so returning here with a live session goes
  // straight through instead of asking for a password again.
  const { user } = useRestoredSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // Already signed in (e.g. back-navigation) -> the shell, not the form.
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    setError(null);
    try {
      await authRepo.login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
    <div className="login-split">
      <div className="login-hero">
        <div className="side-logo" style={{ padding: 0, fontSize: 26 }}>
          <span className="lm" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <Truck style={{ width: 26, height: 26 }} />
          </span>
          A3TRANZ
        </div>
        <div style={{ marginTop: "auto" }}>
          <div style={{ font: "800 38px var(--fd)", letterSpacing: "-1px", lineHeight: 1.15 }}>
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
          <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
            <div>
              <div style={{ font: "800 26px var(--fd)" }}>42</div>
              <div style={{ font: "500 13px var(--f)", color: "var(--side-ink)" }}>
                Active drivers
              </div>
            </div>
            <div>
              <div style={{ font: "800 26px var(--fd)" }}>128</div>
              <div style={{ font: "500 13px var(--f)", color: "var(--side-ink)" }}>
                Jobs this month
              </div>
            </div>
          </div>
        </div>
      </div>
      <form className="login-form" onSubmit={handleSubmit}>
        <div style={{ width: 360 }}>
          <div style={{ font: "800 26px var(--fd)", color: "var(--text)", letterSpacing: "-.5px" }}>
            Sign in
          </div>
          <div
            style={{
              font: "500 14px var(--f)",
              color: "var(--text-2)",
              margin: error ? "6px 0 20px" : "6px 0 28px",
            }}
          >
            Admin, Manager, Project Manager &amp; Dispatcher access.
          </div>
          {error && (
            <div className="toast toast-err" style={{ marginBottom: 20 }}>
              <AlertTriangle />
              {error}
            </div>
          )}
          <div className="field">
            <label>Work email</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className={`input${error ? " bad" : ""}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
            {error && (
              <div className="errmsg">
                <AlertTriangle />
                Incorrect password
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "2px 0 24px",
            }}
          >
            <label
              style={{
                font: "500 13px var(--f)",
                color: "var(--text-2)",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  border: "2px solid var(--border)",
                  display: "inline-block",
                }}
              />
              Remember me
            </label>
            <span className="btn-ghost" style={{ font: "600 13px var(--f)" }}>
              Forgot password?
            </span>
          </div>
          <Button
            type="submit"
            variant="primary"
            style={{ width: "100%", height: 46 }}
            disabled={signingIn}
          >
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
    </div>
  );
}
