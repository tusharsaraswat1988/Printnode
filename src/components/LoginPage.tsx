import React, { useState } from "react";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, password }),
        credentials: 'include',
      });
      if (res.ok) {
        onLogin();
      } else {
        setError("Invalid mobile number or password");
      }
    } catch (err) {
      setError("Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 w-96">
        <h2 className="text-xl font-bold mb-6">Login</h2>
        {error && <p className="text-red-500 text-xs mb-4">{error}</p>}
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Mobile Number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm"
          />
          <input
            type="password"
            placeholder="6-digit Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={6}
            className="w-full px-4 py-2 border rounded-lg text-sm"
          />
          <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold">
            Login
          </button>
        </div>
      </form>
    </div>
  );
}
