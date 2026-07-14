import { useState } from "react";
import { apiFetch } from "../lib/utils";
import { ArrowRight, LogIn, Printer, ShieldCheck, Sparkles } from "lucide-react";
import { useShopProfile } from "../components/ShopProfileProvider";

export default function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState("aathilducky@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { shopProfile } = useShopProfile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { token, user } = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("adzone_token", token);
      onLogin(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loading-screen px-4 py-8">
      <div className="grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <section className="hidden overflow-hidden rounded-[36px] border border-orange-100/80 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.24),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.16),_transparent_32%),linear-gradient(135deg,#fff7ed_0%,#ffffff_52%,#f8fafc_100%)] p-8 shadow-[0_28px_70px_-34px_rgba(251,146,60,0.45)] lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="hero-badge">
              <Sparkles size={14} />
              Adzone Workspace
            </div>
            <h1 className="mt-6 max-w-xl text-5xl font-bold tracking-tight text-zinc-950">
              Modern billing and operations for fast-moving print shops.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600">
              Keep sales, orders, customers, inventory, and reporting connected in one calm, easy-to-use workspace.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 backdrop-blur">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                <ShieldCheck size={22} />
              </div>
              <p className="mt-4 text-lg font-bold text-zinc-950">Secure access</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Role-based access keeps each staff member focused on the tools they actually need.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/80 bg-white/85 p-5 backdrop-blur">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-200">
                <ArrowRight size={22} />
              </div>
              <p className="mt-4 text-lg font-bold text-zinc-950">Faster workflow</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Open the day, bill customers, check stock, and review reports with fewer clicks.
              </p>
            </div>
          </div>
        </section>

        <section className="surface-card mx-auto w-full max-w-xl px-6 py-7 sm:px-8 sm:py-8">
          <div className="text-center">
            {shopProfile.logoUrl ? (
              <img
                src={shopProfile.logoUrl}
                alt={`${shopProfile.shopName} logo`}
                className="mx-auto h-18 w-18 rounded-[24px] border border-zinc-200 object-cover shadow-sm"
              />
            ) : (
              <div className="mx-auto flex h-18 w-18 items-center justify-center rounded-[24px] bg-orange-600 text-white shadow-lg shadow-orange-200">
                <Printer size={34} />
              </div>
            )}
            <p className="eyebrow-label mt-6">Welcome Back</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">{shopProfile.shopName}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500 sm:text-base">
              {shopProfile.tagline || "Printing shop management system"}.
              Sign in to continue to your dashboard.
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base"
                  placeholder="aathilducky@gmail.com"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-base"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="surface-muted flex items-start gap-3 px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-orange-600" />
              <p className="text-sm leading-6 text-zinc-600">
                Use your staff account to access the tools allowed for your role.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-5 w-5" />
              {loading ? "Signing in..." : "Sign in to workspace"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
