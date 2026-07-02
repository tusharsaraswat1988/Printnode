import React, { useState } from "react";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile.trim() || !password) {
      setError("Mobile number aur password dono required hain.");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: mobile.trim(), password }),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (data.token) {
          try {
            localStorage.setItem("print_auth_token", data.token);
          } catch (e) {
            console.warn("localStorage setItem failed:", e);
          }
        }
        onLogin();
      } else {
        setError(data.error || "Galat mobile number ya password.");
      }
    } catch (err) {
      setError("Login failed. Server tak request nahi pahunchi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="bg-white p-10 rounded-2xl shadow-lg border border-slate-100 w-96">
        <h2 className="text-2xl font-bold mb-8 text-slate-900">Login</h2>
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Mobile Number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className={`w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none ${error ? "border-red-300 bg-red-50/30" : "border-slate-200"}`}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none ${error ? "border-red-300 bg-red-50/30" : "border-slate-200"}`}
          />
          <button 
            type="submit" 
            disabled={isLoading}
            id="login-submit-btn"
            className={`w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 active:scale-[0.98] focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all shadow-md shadow-indigo-100 flex items-center justify-center ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </div>
      </form>
    </div>
  );
}
