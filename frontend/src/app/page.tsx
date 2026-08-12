"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch(`/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        throw new Error("Invalid username or password");
      }

      const data = await response.json();
      
      // Store JWT token and user info
      sessionStorage.setItem("focusai_token", data.access_token);
      sessionStorage.setItem("focusai_user_id", data.user_id);
      sessionStorage.setItem("focusai_full_name", data.full_name);
      sessionStorage.setItem("focusai_role", data.role);
      
      if (data.role === "User") {
        router.push("/user");
      } else {
        router.push("/admin");
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-100">
        <h1 className="text-3xl font-black text-slate-900 text-center tracking-tight mb-2">FocusAI Portal</h1>
        <p className="text-slate-500 text-center font-medium mb-8">Unified Cognitive Intelligence</p>
        
        {error && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline text-sm font-bold">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">PRN / Username</label>
            <input 
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              required
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Password</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              required
            />
          </div>

          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors mt-4 shadow-lg shadow-blue-600/30"
          >
            Secure Login
          </button>
        </form>
      </div>
    </div>
  );
}
