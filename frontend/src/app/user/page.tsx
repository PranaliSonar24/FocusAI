"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import WebcamTracker from "@/components/WebcamTracker";
import { Suspense } from "react";
import { LogOut } from "lucide-react";

function UserPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [meetingCode, setMeetingCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  const handleLogout = () => {
    sessionStorage.removeItem("focusai_role");
    sessionStorage.removeItem("focusai_token");
    sessionStorage.removeItem("focusai_user_id");
    sessionStorage.removeItem("focusai_full_name");
    router.push("/");
  };

  const validateAndJoin = async (code: string) => {
    try {
      const currentUser = username || sessionStorage.getItem("focusai_user_id") || "";
      const url = currentUser ? 
        `/api/sessions/validate/${code.toUpperCase()}?username=${currentUser}` :
        `/api/sessions/validate/${code.toUpperCase()}`;
        
      const res = await fetch(url);
      const data = await res.json();
      if (data.valid) {
        setMeetingCode(code);
        setJoined(true);
      } else {
        alert(data.reason || "Invalid meeting code.");
      }
    } catch (e) {
      console.error(e);
      alert("Error validating meeting code.");
    }
  };

  useEffect(() => {
    const savedUser = sessionStorage.getItem("focusai_user_id");
    if (savedUser) setUsername(savedUser);
    const savedName = sessionStorage.getItem("focusai_full_name");
    if (savedName) setFullName(savedName);
    const code = searchParams.get("code");
    if (code) {
      validateAndJoin(code);
    }
  }, [searchParams]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (meetingCode.trim()) {
      validateAndJoin(meetingCode.trim());
    }
  };

  if (joined && meetingCode) {
    return (
      <main className="relative w-screen h-screen bg-black overflow-hidden">
        <WebcamTracker sessionId={meetingCode.toUpperCase()} />
        <div className="absolute top-6 right-6 z-50">
          <button 
            onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
            className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-2xl hover:bg-black/60 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-sm uppercase shrink-0">
              {fullName ? fullName.charAt(0).toUpperCase() : username ? username.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-white text-sm leading-none">{fullName || username || "User"}</span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-1">Student</span>
            </div>
          </button>
          {isProfileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-black/80 backdrop-blur-md rounded-xl shadow-lg border border-white/10 py-1 z-50">
              <button 
                onClick={handleLogout}
                className="w-full text-left px-4 py-3 text-sm font-bold text-rose-400 hover:bg-white/10 transition-colors flex items-center gap-2"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center py-12 px-4 bg-slate-100">
      <div className="absolute top-4 right-4 z-50">
        <button 
          onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
          className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-black text-sm uppercase shrink-0">
            {fullName ? fullName.charAt(0).toUpperCase() : username ? username.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold text-slate-700 text-sm leading-none">{fullName || username || "User"}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Student</span>
          </div>
        </button>
        {isProfileDropdownOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50">
            <button 
              onClick={handleLogout}
              className="w-full text-left px-4 py-3 text-sm font-bold text-rose-500 hover:bg-rose-50 transition-colors flex items-center gap-2"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-slate-900 mb-2">Join Meeting</h1>
          <p className="text-slate-500 font-medium">Enter your session code to connect</p>
        </div>
        
        <form onSubmit={handleJoin} className="space-y-6">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Meeting Code</label>
            <input 
              type="text"
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
              placeholder="e.g. AI-101"
              className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-3 px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all uppercase"
              required
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-colors shadow-lg shadow-emerald-600/30"
          >
            Connect to Session
          </button>
        </form>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-100 flex items-center justify-center">Loading...</div>}>
      <UserPortalContent />
    </Suspense>
  );
}
