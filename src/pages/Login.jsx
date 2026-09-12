import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("admin@crimenetwork.local");
  const [password, setPassword] = useState("admin123456");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Investigator Sign In</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter your authorized credentials to access the Crime Network Intelligence System.
        </p>
      </div>

      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <span className="font-semibold">Default Seed Admin:</span>
        <div className="mt-1 font-mono text-xs">Email: <span className="font-semibold">admin@crimenetwork.local</span></div>
        <div className="font-mono text-xs">Password: <span className="font-semibold">admin123456</span></div>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Email</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Password</span>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          className="w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-50"
          type="submit"
          disabled={busy}
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </main>
  );
}
