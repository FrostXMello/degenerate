import { loginAction } from "@/actions/auth";

const errors: Record<string, string> = {
  missing: "Enter your username and password.",
  invalid: "That login is not valid.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 overflow-x-hidden">
      <div className="w-full max-w-md min-w-0">
        <p className="font-display text-gold tracking-[0.5em] text-sm text-center">PARTY LEDGER</p>
        <h1 className="font-display text-[clamp(2.4rem,11vw,5.5rem)] text-center mt-2 text-cream whitespace-nowrap tracking-[0.04em]">
          DEGENERATE
        </h1>
        <div className="gold-line my-6" />
        <p className="text-center text-mute text-sm mb-8">Bar management for the night. Fast orders. Rough stock. Clean money.</p>

        <form action={loginAction} className="panel rounded-3xl p-6 space-y-4">
          {error && (
            <p className="rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-sm text-red-200">
              {errors[error] || "Could not sign in."}
            </p>
          )}
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-mute">Username</span>
            <input
              name="username"
              autoComplete="username"
              autoFocus
              className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-gold"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-[0.2em] text-mute">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-gold"
            />
          </label>
          <button type="submit" className="pressable w-full rounded-xl bg-gold text-ink font-semibold py-3.5 text-lg">
            Enter the bar
          </button>
        </form>
      </div>
    </main>
  );
}
