"use client";
import { useEffect, useState, useRef } from "react";
import ReactECharts from "echarts-for-react";
import { LayoutDashboard, Users, Activity, Bot, Upload, LogOut, FileText, CheckCircle, Trash2, History, BookOpen, X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminDashboard() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [username, setUsername] = useState("");
  const [activeTab, setActiveTab] = useState("monitoring");
    
  // Data States
  const [activeSessionId, setActiveSessionId] = useState("");
  const [data, setData] = useState([]);
  const [summaryData, setSummaryData] = useState({ focused_mins: 0, distracted_mins: 0 });
  const [latestData, setLatestData] = useState([]);
  const [selectedUser, setSelectedUser] = useState("all");
  const [timeRange, setTimeRange] = useState("30d");
  const [historicalData, setHistoricalData] = useState<any>(null);
  
  // Taxonomy States
  const [mySubjects, setMySubjects] = useState<any[]>([]);
  const [taxonomyTree, setTaxonomyTree] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<number>(0);
  const [directoryTree, setDirectoryTree] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  
  // Chat Agent State
  const [query, setQuery] = useState("");
  const [chatLog, setChatLog] = useState<{role: string, content: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  // Bulk Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadRole, setUploadRole] = useState("User");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);
  
  // Timeline Modal State
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<any[] | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>("");
  const [selectedStudentOverallScore, setSelectedStudentOverallScore] = useState<number>(0);
  const [hostSubjects, setHostSubjects] = useState<any[]>([]);
  
  // Attendance State
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);

  // UI States
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isPastSessionsOpen, setIsPastSessionsOpen] = useState(false);
  const [userProvisioningTab, setUserProvisioningTab] = useState("upload");

  useEffect(() => {
    const savedRole = sessionStorage.getItem("focusai_role");
    if (savedRole) setRole(savedRole);
    const savedUser = sessionStorage.getItem("focusai_user_id");
    if (savedUser) setUsername(savedUser);
    if (!savedRole) {
      router.push("/");
      return;
    }
    
    setRole(savedRole);
    if (savedRole === "Host") {
      setActiveTab("monitoring");
    } else {
      setActiveTab("analytics");
    }

    const savedMode = sessionStorage.getItem("focusai_industry") || "Education";
      }, [router]);

  
  // Polling for Timeseries Charts (Admin only)
  useEffect(() => {
    if (role !== "Admin" || activeTab !== "analytics") return;
    const fetchData = async () => {
      if (!activeSessionId) return;
      try {
        const res = await fetch(`/api/telemetry?session_id=${activeSessionId}&user_id=${selectedUser}`);
        const json = await res.json();
        setData(json);
        
        const sumRes = await fetch(`/api/telemetry/summary?session_id=${activeSessionId}&user_id=${selectedUser}`);
        const sumJson = await sumRes.json();
        setSummaryData(sumJson);
      } catch (e) {
        console.error("Failed to fetch telemetry:", e);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [role, activeTab, selectedUser, activeSessionId]);

  // Polling for Live Monitoring Table & Global Attendance
  useEffect(() => {
    if (!activeSessionId) return;
    const fetchLatest = async () => {
      try {
        const res = await fetch(`/api/telemetry/latest?session_id=${activeSessionId}`);
        const json = await res.json();
        // Sort by PRN (user_id) to keep the table stable
        const sortedData = json.sort((a: any, b: any) => a.user_id.localeCompare(b.user_id));
        setLatestData(sortedData);
      } catch (e) {
        console.error("Failed to fetch latest telemetry:", e);
      }
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 1000);
    return () => clearInterval(interval);
  }, [activeSessionId, activeTab]);

  // Fetch Historical Data
  useEffect(() => {
    if (activeTab !== "historical") return;
    const fetchHistorical = async () => {
      const projId = selectedProject || (document.getElementById('subject_select') as HTMLSelectElement)?.value || 0;
      try {
        const res = await fetch(`/api/analytics/historical?project_id=${projId}&time_range=${timeRange}${selectedUser !== 'all' ? `&user_id=${encodeURIComponent(selectedUser)}` : ''}`);
        const json = await res.json();
        setHistoricalData(json);
      } catch(e) {}
    };
    fetchHistorical();
  }, [timeRange, selectedUser, activeTab, selectedProject]);

  // Fetch Registered Users
  useEffect(() => {
    if (activeTab !== "users") return;
    const fetchUsers = async () => {
      try {
        const res = await fetch(`/api/users/list?industry=Education`);
        const json = await res.json();
        setRegisteredUsers(json.users || []);
      } catch (e) {
        console.error("Failed to fetch users:", e);
      }
    };
    fetchUsers();
  }, [activeTab, refreshKey]);

  // Fetch Taxonomy Tree and Subjects
  useEffect(() => {
    if (!role) return;
    const fetchTaxonomy = async () => {
      try {
        if (role === "Admin") {
          const res = await fetch(`/api/taxonomy/tree?industry=Education`);
          const json = await res.json();
          setTaxonomyTree(json);
          
          const dirRes = await fetch(`/api/taxonomy/directory?industry=Education`);
          const dirJson = await dirRes.json();
          setDirectoryTree(dirJson);
          
          // For Admin, populate the sidebar "Select Subject" with all subjects in the system
          const allSubjects = dirJson.flatMap((ws: any) => 
            ws.subjects.map((s: any) => ({
              id: s.id,
              name: s.name,
              workspace_name: ws.name
            }))
          );
          setMySubjects(allSubjects);
        } else {
          // Fetch allowed subjects for Host
          const username = sessionStorage.getItem("focusai_user_id");
          if (username) {
            const res = await fetch(`/api/taxonomy/my-subjects?username=${username}`);
            const json = await res.json();
            setMySubjects(json);
            if (json.length > 0) {
              setSelectedProject(json[0].id);
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch taxonomy:", e);
      }
    };
    fetchTaxonomy();
  }, [activeTab, role, refreshKey]);

  // Fetch Past Sessions
  useEffect(() => {
    if (!role) return;
    const fetchHistory = async () => {
      const username = sessionStorage.getItem("focusai_user_id");
      try {
        const res = await fetch(`/api/sessions/history?role=${role}&username=${username}`);
        const json = await res.json();
        setPastSessions(json);
      } catch (e) {}
    };
    fetchHistory();
  }, [role, refreshKey]);

  useEffect(() => {
    if (role !== "Host") return;
    const fetchHostSubjects = async () => {
      const username = sessionStorage.getItem("focusai_user_id");
      if (username) {
        try {
          const res = await fetch(`/api/analytics/host/subjects?username=${username}`);
          const json = await res.json();
          setHostSubjects(json);
        } catch(e) {}
      }
    };
    fetchHostSubjects();
  }, [role, refreshKey]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (!activeSessionId) {
      alert("Please enter an Active Meeting Code in the sidebar first to query the database.");
      return;
    }
    
    const userMessage = query;
    setChatLog(prev => [...prev, { role: "user", content: userMessage }]);
    setQuery("");
    setLoading(true);
    
    const currentSess = pastSessions.find((s: any) => s.session_id === activeSessionId);
    const subjectName = currentSess?.subject_name || "General Session";
    
    let tempEnrolled: any[] = [];
    if (currentSess && currentSess.project_id) {
      if (role === "Admin") {
        for (const ws of directoryTree) {
          const prj = ws.subjects.find((s: any) => s.id === currentSess.project_id);
          if (prj) { tempEnrolled = prj.students || []; break; }
        }
      } else if (role === "Host") {
        const prj = hostSubjects.find((p: any) => p.subject_id === currentSess.project_id);
        if (prj) { tempEnrolled = prj.students || []; }
      }
    }
    const tempPresent = latestData.map((d: any) => d.user_id);
    const presCount = tempEnrolled.filter(s => tempPresent.includes(s.username)).length;
    const absCount = tempEnrolled.filter(s => !tempPresent.includes(s.username)).length;

    try {
      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage, 
          user_id: selectedUser, 
          session_id: activeSessionId,
          role: role,
          subject_name: subjectName,
          present_count: presCount,
          absent_count: absCount
        })
      });
      const json = await res.json();
      setChatLog(prev => [...prev, { role: "agent", content: json.response }]);
    } catch (err) {
      setChatLog(prev => [...prev, { role: "agent", content: "Error: Could not connect to AI Agent." }]);
    }
    
    setLoading(false);
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("role_name", uploadRole);
    formData.append("industry", "Education");

    try {
      const res = await fetch(`/api/users/bulk-upload`, {
        method: "POST",
        body: formData
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Upload failed");
      setUploadResult(json);
      setRefreshKey(prev => prev + 1);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setUploading(false);
  };

  const handleStudentClick = async (username: string) => {
    setSelectedStudentName(username);
    try {
      const res = await fetch(`/api/telemetry/user_timeline?session_id=${activeSessionId}&user_id=${username}`);
      if (!res.ok) {
         setSelectedStudentHistory([]);
         alert(`Error ${res.status}: Did you restart your python backend?`);
         return;
      }
      const json = await res.json();
      if (json.timeline) {
        setSelectedStudentHistory(json.timeline);
        setSelectedStudentOverallScore(json.overall_score);
      } else if (Array.isArray(json)) {
        setSelectedStudentHistory(json);
        setSelectedStudentOverallScore(0);
      } else {
        setSelectedStudentHistory([]);
        setSelectedStudentOverallScore(0);
      }
    } catch (e) {
      console.error(e);
      setSelectedStudentHistory([]);
    }
  };

  const handleSubjectStudentClick = async (project_id: number, username: string) => {
    setSelectedStudentName(username);
    try {
      const res = await fetch(`/api/user_subject_timeline?project_id=${project_id}&user_id=${username}`);
      if (!res.ok) {
         setSelectedStudentHistory([]);
         return;
      }
      const json = await res.json();
      if (json.timeline) {
        setSelectedStudentHistory(json.timeline);
        setSelectedStudentOverallScore(json.overall_score);
      } else if (Array.isArray(json)) {
        setSelectedStudentHistory(json);
        setSelectedStudentOverallScore(0);
      } else {
        setSelectedStudentHistory([]);
        setSelectedStudentOverallScore(0);
      }
    } catch (e) {
      console.error(e);
      setSelectedStudentHistory([]);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("focusai_role");
    sessionStorage.removeItem("focusai_token");
    router.push("/");
  };

  const handleCreateMeeting = async () => {
    const selSubj = (document.getElementById('subject_select') as HTMLSelectElement)?.value;
    if (!selSubj || selSubj === "0") {
      alert("Please select a Subject first.");
      return;
    }
    try {
      const res = await fetch(`/api/sessions/create`, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: parseInt(selSubj) })
      });
      const data = await res.json();
      setActiveSessionId(data.session_id);
      alert(`✅ Created Meeting: ${data.session_id}\n\nShare this link with participants:\nhttp://${window.location.hostname}:3000/user?code=${data.session_id}`);
    } catch (e) {
      alert("Error creating meeting");
    }
  };

  const handleEndMeeting = async () => {
    if (!activeSessionId) return;
    if (!confirm(`Are you sure you want to end meeting ${activeSessionId}? Students will be permanently disconnected.`)) return;
    try {
      const res = await fetch(`/api/sessions/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: activeSessionId })
      });
      if (res.ok) {
        alert("Meeting ended successfully.");
        setActiveSessionId("");
      } else {
        const data = await res.json();
        alert(data.detail || data.message || "Failed to end meeting.");
      }
    } catch(e) {
      console.error(e);
      alert("Error ending meeting");
    }
  };

  // --- Attendance Calculation ---
  let enrolledStudents: any[] = [];
  const currentSession = pastSessions.find((s: any) => s.session_id === activeSessionId);
  if (currentSession && currentSession.project_id) {
    if (role === "Admin") {
      for (const ws of directoryTree) {
        const prj = ws.subjects.find((s: any) => s.id === currentSession.project_id);
        if (prj) { enrolledStudents = ws.students || []; break; }
      }
    } else if (role === "Host") {
      const prj = hostSubjects.find((p: any) => p.subject_id === currentSession.project_id);
      if (prj) { enrolledStudents = prj.students || []; }
    }
  }
  
  const presentUsernames = latestData.map((d: any) => d.user_id);
  const presentList = enrolledStudents.filter(s => presentUsernames.includes(s.username));
  const absentList = enrolledStudents.filter(s => !presentUsernames.includes(s.username));
  
  const handleShowAttendance = () => {
    setAttendanceList([...presentList.map(s => ({...s, present: true})), ...absentList.map(s => ({...s, present: false}))]);
    setIsAttendanceModalOpen(true);
  };

  // --- ECharts Options ---
    const timeSeriesData = data.map((d: any) => [new Date(d.timestamp).getTime(), d.focus_score]);
  
  const scoreOption = {
    tooltip: { trigger: "axis", backgroundColor: "rgba(15, 23, 42, 0.9)", textStyle: {color: '#fff'}, borderColor: "transparent" },
    grid: { left: "3%", right: "3%", bottom: "5%", top: "10%", containLabel: true },
    xAxis: { type: "time", boundaryGap: false, axisLine: { lineStyle: { color: "#e2e8f0" } }, axisLabel: { color: "#64748b" } },
    yAxis: { type: "value", max: 100, min: 0, splitLine: { lineStyle: { color: "#f1f5f9", type: "dashed" } }, axisLabel: { color: "#64748b" } },
    series: [{
      name: "Focus Score", data: timeSeriesData, type: "line", smooth: true, showSymbol: false,
      lineStyle: { color: "#3b82f6", width: 3 },
      areaStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(59, 130, 246, 0.2)" }, { offset: 1, color: "rgba(59, 130, 246, 0)" }] }
      }
    }]
  };

  const moodCounts = data.reduce((acc: any, curr: any) => {
    acc[curr.mood] = (acc[curr.mood] || 0) + 1;
    return acc;
  }, {});
  
  const moodOption = {
    tooltip: { trigger: "item", backgroundColor: "rgba(15, 23, 42, 0.9)", textStyle: {color: '#fff'} },
    legend: { bottom: "0%", left: "center", itemStyle: {borderWidth: 0} },
    series: [{
      type: "pie", radius: ["50%", "70%"], avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      data: Object.keys(moodCounts).length > 0 ? Object.keys(moodCounts).map(k => ({name: k, value: moodCounts[k]})) : [{ name: "No Data", value: 1 }],
      color: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]
    }]
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-10 overflow-y-auto overflow-x-hidden">
        <div className="p-4 pb-3 border-b border-slate-800 shrink-0 flex flex-col items-center">
          <img src="/logo_cropped.png" alt="FocusAI Logo" className="w-24 h-auto object-contain drop-shadow-md mb-1" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{role} Portal</p>
        </div>
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
              Select Subject
            </label>
            {mySubjects.length === 0 ? (
              <p className="text-xs text-red-400">You are not assigned to any subjects.</p>
            ) : (
              <select id="subject_select" value={selectedProject} onChange={(e) => setSelectedProject(parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 text-white font-semibold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm">
                {role === "Admin" && <option value={0}>-- All Classes (System View) --</option>}
                {mySubjects.map(sub => (
                  <option key={sub.id} value={sub.id}>{sub.workspace_name} - {sub.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block mt-2">Active Meeting Code</label>
            <input 
              type="text"
              placeholder="e.g. AI-101"
              value={activeSessionId}
              onChange={(e) => setActiveSessionId(e.target.value.toUpperCase())}
              className="w-full bg-slate-800 border border-slate-700 text-white font-bold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase text-sm disabled:opacity-50"
              disabled={role !== "Admin"}
            />
          </div>
          <button 
            onClick={handleCreateMeeting}
            disabled={mySubjects.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all shadow-md text-sm mt-2"
          >
            + Create New Meeting
          </button>
          {activeSessionId && (
            <button 
              onClick={handleEndMeeting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-md text-sm mt-2"
            >
              End Active Meeting
            </button>
          )}
          
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button 
              onClick={() => setIsPastSessionsOpen(!isPastSessionsOpen)} 
              className="w-full flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 hover:text-slate-300 transition-colors"
            >
              <span>Past Sessions</span>
              <span className="text-[10px]">{isPastSessionsOpen ? "▼" : "▶"}</span>
            </button>
            {isPastSessionsOpen && (
              <div className="space-y-1">
              {pastSessions.length === 0 && <p className="text-xs text-slate-500">No past sessions.</p>}
              {pastSessions.map((s: any) => (
                <button
                  key={s.session_id}
                  onClick={() => { 
                    setActiveSessionId(s.session_id); 
                    if (s.project_id) setSelectedProject(s.project_id);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex justify-between items-start ${
                    activeSessionId === s.session_id ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <div>
                    <span className="font-bold block">{s.session_id}</span>
                    <span className="opacity-60 text-[10px] block mt-0.5">{new Date(s.start_time).toLocaleDateString()}</span>
                  </div>
                  {s.subject_name && (
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold max-w-[80px] truncate ${
                      activeSessionId === s.session_id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {s.subject_name}
                    </span>
                  )}
                </button>
              ))}
            </div>
            )}
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 shrink-0">
          {role === "Admin" && (
            <>
              <button onClick={() => setActiveTab("analytics")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'analytics' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <LayoutDashboard size={18} />
                <span className="font-semibold text-sm">Live Analytics</span>
              </button>
              <button onClick={() => setActiveTab("historical")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'historical' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <History size={18} />
                <span className="font-semibold text-sm">Historical Stats</span>
              </button>

            </>
          )}
          
          <button onClick={() => setActiveTab("monitoring")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'monitoring' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <Activity size={18} />
            <span className="font-semibold text-sm">Session Roster</span>
          </button>
          
          {role === "Host" && (
            <button onClick={() => setActiveTab("my-subjects")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'my-subjects' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <BookOpen size={18} />
              <span className="font-semibold text-sm">My Subjects</span>
            </button>
          )}
          
          {role === "Admin" && (
            <>
              <button onClick={() => setActiveTab("directory")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'directory' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <FileText size={18} />
                <span className="font-semibold text-sm">Directory Viewer</span>
              </button>
              <button onClick={() => setActiveTab("users")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'users' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <Users size={18} />
                <span className="font-semibold text-sm">User Provisioning</span>
              </button>
              <button onClick={() => setActiveTab("taxonomy")} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out hover:scale-[1.02] ${activeTab === 'taxonomy' ? 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/30 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <CheckCircle size={18} />
                <span className="font-semibold text-sm">Taxonomy & Faculty</span>
              </button>
            </>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Header */}
          <header className="flex justify-between items-end pb-6 border-b border-slate-200">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-800 capitalize">
                {activeTab.replace("-", " ")}
              </h2>
              <p className="text-slate-500 font-medium mt-1">
                {activeTab === 'analytics' && "System-wide live cognitive insights."}
                {activeTab === 'historical' && (selectedProject ? "Class-wide historical cognitive trends." : "System-wide historical cognitive trends.")}
                {activeTab === 'monitoring' && "Real-time biometric telemetry stream."}
                {activeTab === 'my-subjects' && "Overview of enrolled students and their attention per subject."}
                {activeTab === 'users' && "Bulk upload and manage user access."}
              </p>
            </div>
            
            
            <div className="flex items-center gap-4">
              
              {activeTab === 'historical' && (
                 <select 
                   value={selectedUser}
                   onChange={(e) => setSelectedUser(e.target.value)}
                   className="appearance-none bg-white border-2 border-slate-200 text-slate-700 font-bold py-2.5 px-4 pr-10 rounded-xl focus:outline-none focus:border-blue-500 shadow-sm outline-none transition-colors bg-no-repeat bg-[right_10px_center] bg-[length:16px_16px]"
                   style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" stroke="%2364748b" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>')` }}
                 >
                   <option value="all">{selectedProject ? "Class Average" : "System Average"}</option>
                   {(() => {
                     let studentsToDisplay = [];
                     if (selectedProject) {
                       for (const ws of directoryTree) {
                         const prj = ws.subjects.find((s: any) => s.id === parseInt(selectedProject.toString()));
                         if (prj) {
                           studentsToDisplay = prj.students || [];
                           break;
                         }
                       }
                     } else {
                       const allStus = directoryTree.flatMap((ws: any) => 
                         [...(ws.students || []), ...ws.subjects.flatMap((s: any) => s.students || [])]
                       );
                       studentsToDisplay = Array.from(new Map(allStus.map((stu: any) => [stu.username, stu])).values());
                     }
                     return studentsToDisplay.map((stu: any) => (
                       <option key={stu.username} value={stu.username}>Student: {stu.username}</option>
                     ));
                   })()}
                 </select>
              )}
              <div className="relative ml-4">
                <button 
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-sm uppercase shrink-0">
                    {username ? username.charAt(0) : "U"}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-slate-700 text-sm leading-none">{username || "User"}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">{role}</span>
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
            </div>
          </header>

          {/* Global Active Session Info */}
          {activeSessionId && ["analytics", "historical", "monitoring"].includes(activeTab) && (
              <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex justify-between items-center mb-6 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-100">
                <div>
                  <h3 className="font-black text-slate-800 text-2xl tracking-tight">
                    Meeting Code: {activeSessionId}
                  </h3>
                  <p className="text-slate-500 font-medium mt-1">
                    {currentSession?.subject_name || pastSessions.find((s: any) => s.session_id === activeSessionId)?.subject_name || "General Session"}
                  </p>
                </div>
                <div className="flex gap-4 items-center">
                  {enrolledStudents.length > 0 && (
                    <button onClick={handleShowAttendance} className="text-left bg-white border border-slate-100 px-5 py-3 rounded-2xl hover:bg-slate-50 hover:scale-[1.02] transition-all duration-300 cursor-pointer group shadow-sm hover:shadow-md">
                       <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">Class Attendance</div>
                       <div className="flex gap-4 text-sm font-black">
                         <span className="text-emerald-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Present: {presentList.length}</span>
                         <span className="text-slate-300">|</span>
                         <span className="text-rose-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Absent: {absentList.length}</span>
                       </div>
                    </button>
                  )}
                  {activeTab === "monitoring" && (
                    <div className="px-4 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-xl text-sm border border-emerald-100 animate-pulse h-fit">
                      LIVE TELEMETRY
                    </div>
                  )}
                </div>
              </div>
          )}

          {/* Tab Contents */}
          {activeTab === "analytics" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Avg Session Focus</h3>
                   <div className="text-4xl font-black text-slate-800">
                     {data.length > 0 ? Math.round(data.reduce((acc: any, curr: any) => acc + curr.focus_score, 0) / data.length) + "%" : "--"}
                   </div>
                   <p className="text-xs text-slate-400 mt-2 text-center">Average attention of all users</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Attention Loss / Deviation</h3>
                   <div className="text-4xl font-black text-rose-600">
                     {data.length > 10 ? 
                       Math.round(
                         (data.slice(-10).reduce((a: any, b: any) => a + b.focus_score, 0) / 10) - 
                         (data.slice(0, 10).reduce((a: any, b: any) => a + b.focus_score, 0) / 10)
                       ) + "%" : "--"
                     }
                   </div>
                   <p className="text-xs text-slate-400 mt-2 text-center">Start of session vs End of session</p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Dominant Behavior</h3>
                   <div className="text-2xl font-black text-amber-600">
                     {Object.keys(moodCounts).length > 0 ? Object.keys(moodCounts).reduce((a, b) => moodCounts[a] > moodCounts[b] ? a : b) : "--"}
                   </div>
                   <p className="text-xs text-slate-400 mt-2 text-center">Most frequent behavioral emotion</p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Engagement Time</h3>
                   <div className="text-lg font-black text-slate-700 flex gap-4">
                     <div className="flex flex-col items-center">
                       <span className="text-emerald-500">{summaryData.focused_mins}</span>
                       <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Min Focused</span>
                     </div>
                     <div className="w-px bg-slate-200"></div>
                     <div className="flex flex-col items-center">
                       <span className="text-rose-500">{summaryData.distracted_mins}</span>
                       <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Min Distracted</span>
                     </div>
                   </div>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                  Live Focus Trend
                </h3>
                {data.length > 0 ? (
                  <ReactECharts option={scoreOption} style={{ height: "350px", width: "100%" }} />
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Awaiting telemetry data...</div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out">
                    <h3 className="font-bold text-slate-800 mb-4">Live Mood Distribution</h3>
                    <ReactECharts option={moodOption} style={{ height: "250px", width: "100%" }} />
                 </div>
              </div>
            </div>
          )}

          {activeTab === "historical" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Time Range Selector */}
              <div className="flex gap-3">
                {['1d', '7d', '30d'].map(range => (
                  <button 
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${timeRange === range ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}
                  >
                    Last {range.replace('d', ' Days')}
                  </button>
                ))}
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Avg Session Focus</h3>
                   <div className="text-4xl font-black text-slate-800">
                     {historicalData ? `${historicalData.overall_avg_focus}%` : "--"}
                   </div>
                   <p className="text-xs text-slate-400 mt-2 text-center">Average attention in selected period</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Attention Loss / Deviation</h3>
                   <div className={`text-4xl font-black ${historicalData && historicalData.focus_deviation < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                     {historicalData ? `${historicalData.focus_deviation > 0 ? '+' : ''}${historicalData.focus_deviation}%` : "--"}
                   </div>
                   <p className="text-xs text-slate-400 mt-2 text-center">Start of period vs End of period</p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Dominant Behavior</h3>
                   <div className="text-2xl font-black text-amber-600">
                     {historicalData ? historicalData.primary_emotion : "--"}
                   </div>
                   <p className="text-xs text-slate-400 mt-2 text-center">Most frequent behavioral emotion</p>
                </div>

                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out flex flex-col justify-center items-center">
                   <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">Engagement Time</h3>
                   <div className="text-lg font-black text-slate-700 flex gap-4">
                     <div className="flex flex-col items-center">
                       <span className="text-emerald-500">{historicalData ? historicalData.focused_mins : 0}</span>
                       <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Min Focused</span>
                     </div>
                     <div className="w-px bg-slate-200"></div>
                     <div className="flex flex-col items-center">
                       <span className="text-rose-500">{historicalData ? historicalData.distracted_mins : 0}</span>
                       <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Min Distracted</span>
                     </div>
                   </div>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-100/50 transition-all duration-300 ease-out">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                  Focus Trend
                </h3>
                {historicalData && historicalData.timeline && historicalData.timeline.length > 0 ? (
                  <ReactECharts option={{
                    tooltip: { trigger: "axis", backgroundColor: "rgba(15, 23, 42, 0.9)", textStyle: {color: '#fff'} },
                    xAxis: { type: "category", data: historicalData.timeline.map((d: any) => new Date(d.time).toLocaleDateString()), boundaryGap: false, axisLine: {lineStyle: {color: "#e2e8f0"}}, axisLabel: {color: "#94a3b8"} },
                    yAxis: { type: "value", min: 0, max: 100, splitLine: {lineStyle: {type: "dashed", color: "#f1f5f9"}}, axisLabel: {color: "#94a3b8"} },
                    series: [{ data: historicalData.timeline.map((d: any) => d.focus), type: "line", smooth: true, lineStyle: { width: 3, color: "#3b82f6" }, showSymbol: false, areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(59, 130, 246, 0.2)" }, { offset: 1, color: "rgba(59, 130, 246, 0)" }] } } }]
                  }} style={{ height: "350px", width: "100%" }} />
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">Awaiting historical data...</div>
                )}
              </div>
            </div>
          )}

          {activeTab === "monitoring" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100/60 overflow-hidden transition-all duration-300">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/50 text-[11px] font-black uppercase tracking-widest text-slate-400">
                      <th className="p-5 pl-6">User ID</th>
                      <th className="p-5">Status</th>
                      <th className="p-5">Focus</th>
                      <th className="p-5">Mood</th>
                      <th className="p-5">Tense</th>
                      <th className="p-5">Yawning</th>
                      <th className="p-5">Speaking/Lips</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {latestData.length === 0 && (
                       <tr><td colSpan={8} className="p-12 text-center text-slate-400 bg-slate-50/50">No active streams.</td></tr>
                    )}
                    {latestData.length > 0 && latestData.map((row: any, i) => (
                      <tr key={i} onClick={() => handleStudentClick(row.user_id)} className="hover:bg-indigo-50/50 transition-colors group cursor-pointer border-b border-slate-100 last:border-0 hover:shadow-sm relative z-10 hover:z-20">
                        <td className="p-5 pl-6 flex items-center gap-3 text-slate-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 group-hover:animate-ping shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm leading-none group-hover:text-indigo-600 transition-colors">{row.full_name || row.user_id}</span>
                            <span className="font-black text-[10px] text-slate-400 uppercase tracking-widest mt-1">{row.user_id}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${row.status === 'Attentive' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-4 font-black text-slate-800">{row.focus_score}%</td>
                        <td className="p-4 font-medium text-slate-600">{row.mood}</td>
                        <td className="p-4">
                          {row.is_tense ? <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-xs font-bold">Yes</span> : <span className="text-slate-400 text-sm">No</span>}
                        </td>

                        <td className="p-4">
                          {row.yawning ? <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded-md text-xs font-bold">Yes</span> : <span className="text-slate-400 text-sm">No</span>}
                        </td>
                        <td className="p-4">
                          {row.lip_movement ? <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-xs font-bold">Moving</span> : <span className="text-slate-400 text-sm">Still</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}

          {activeTab === "my-subjects" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {hostSubjects.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center shadow-sm">
                  <p className="text-slate-500 font-bold">No subjects assigned yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-8">
                  {hostSubjects.map((subj: any) => (
                    <div key={subj.subject_id} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                      <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                        <BookOpen className="text-blue-500" size={24} />
                        {subj.subject_name}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b-2 border-slate-100 text-xs text-slate-400 uppercase tracking-widest">
                              <th className="pb-3 px-4">Student</th>
                              <th className="pb-3 px-4">Avg Attention</th>
                              <th className="pb-3 px-4">Spoofing Detected</th>
                              <th className="pb-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subj.students.length === 0 && (
                               <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-medium">No students enrolled.</td></tr>
                            )}
                            {subj.students.map((student: any) => (
                              <tr key={student.username} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                <td className="py-4 px-4">
                                  <div className="font-bold text-slate-700">{student.full_name}</div>
                                  <div className="text-xs text-slate-400 font-medium">{student.username}</div>
                                </td>
                                <td className="py-4 px-4">
                                  {student.avg_attention !== null ? (
                                    <span className={`font-black ${student.avg_attention >= 60 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                      {student.avg_attention}%
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">--</span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  {student.spoofed === "YES" ? (
                                    <span className="text-[10px] uppercase tracking-wider bg-rose-100 text-rose-600 font-bold px-2 py-1 rounded-md">Yes</span>
                                  ) : (
                                    <span className="text-slate-400 text-sm font-medium">No</span>
                                  )}
                                </td>
                                <td className="py-4 px-4 text-right">
                                  <button onClick={() => {
                                    handleSubjectStudentClick(subj.subject_id, student.username);
                                  }} className="text-blue-500 hover:text-blue-700 text-[10px] font-bold uppercase tracking-wider bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}



          {activeTab === "users" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
              
              <div className="flex border-b border-slate-200">
                <button 
                  onClick={() => setUserProvisioningTab('upload')} 
                  className={`py-3 px-6 font-bold text-sm border-b-2 transition-colors ${userProvisioningTab === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  Bulk Provisioning
                </button>
                <button 
                  onClick={() => setUserProvisioningTab('manage')} 
                  className={`py-3 px-6 font-bold text-sm border-b-2 transition-colors ${userProvisioningTab === 'manage' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                >
                  Manage Users
                </button>
              </div>

              {userProvisioningTab === 'upload' && (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                  <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                      <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Upload className="text-blue-600" size={32} />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800">Bulk Provisioning</h3>
                      <p className="text-slate-500 mt-2">Upload an Excel (.xlsx), CSV, or PDF file to automatically extract names and emails and generate secure credentials.</p>
                    </div>
                  
                  <div className="flex gap-4 mb-6 p-1 bg-slate-100 rounded-xl">
                    <button 
                      className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${uploadRole === 'User' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => setUploadRole("User")}
                    >
                      Provision Students
                    </button>
                    <button 
                      className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${uploadRole === 'Host' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      onClick={() => setUploadRole("Host")}
                    >
                      Provision Hosts
                    </button>
                  </div>

                  <form onSubmit={handleBulkUpload} className="space-y-6">

                    <div className="border-2 border-dashed border-slate-300 rounded-3xl p-10 text-center hover:bg-slate-50 transition-colors relative">
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv,.pdf" 
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                      <p className="font-bold text-slate-700 text-lg">
                        {uploadFile ? uploadFile.name : "Drag & drop file or click to browse"}
                      </p>
                      <p className="text-sm text-slate-400 mt-1">Supports Excel, CSV, and PDF formats.</p>
                    </div>

                    <button 
                      type="submit" 
                      disabled={!uploadFile || uploading}
                      className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {uploading ? <span className="animate-pulse">Processing Upload...</span> : "Generate Credentials"}
                    </button>
                  </form>
                </div>
              </div>
              )}
              {userProvisioningTab === 'upload' && uploadResult && uploadResult.users && (
                <div className="bg-emerald-50 rounded-3xl border border-emerald-200 p-8 animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center gap-3 mb-6">
                    <CheckCircle className="text-emerald-600" size={28} />
                    <h3 className="text-xl font-black text-emerald-900">{uploadResult.message}</h3>
                  </div>
                  
                  <div className="bg-white rounded-2xl overflow-hidden border border-emerald-100">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead className="bg-emerald-50/50 text-emerald-800 font-bold">
                        <tr>
                          <th className="p-4 border-b border-emerald-100 pl-6">Username</th>
                          <th className="p-4 border-b border-emerald-100">Email</th>
                          <th className="p-4 border-b border-emerald-100">Generated Password</th>
                          <th className="p-4 border-b border-emerald-100">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-50">
                        {uploadResult.users.map((u: any, i: number) => (
                          <tr key={i} className="hover:bg-emerald-50/30">
                            <td className="p-4 pl-6 font-semibold text-slate-700">{u.username}</td>
                            <td className="p-4 text-slate-600">{u.email}</td>
                            <td className="p-4 font-mono text-emerald-600 font-bold bg-emerald-50/50 rounded inline-block my-2 ml-4 px-2">{u.password}</td>
                            <td className="p-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-xs">{u.role}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-emerald-700 text-sm mt-4 font-medium flex justify-end">
                    Please copy or download these credentials now, they cannot be retrieved later.
                  </p>
                </div>
              )}

              {/* Registered Users Table */}
              {userProvisioningTab === 'manage' && (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800">All Registered Users</h3>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold text-sm">{registeredUsers.length} Users</span>
                </div>
                
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-xs">
                      <tr>
                        <th className="p-4 font-bold pl-6 border-b border-slate-100">PRN / Username</th>
                        <th className="p-4 font-bold border-b border-slate-100">Name</th>
                        <th className="p-4 font-bold border-b border-slate-100">Email</th>
                        <th className="p-4 font-bold border-b border-slate-100">Password</th>
                        <th className="p-4 font-bold border-b border-slate-100">Role</th>
                        <th className="p-4 font-bold border-b border-slate-100 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {registeredUsers.length === 0 ? (
                        <tr><td colSpan={6} className="p-12 text-center text-slate-400">No users found.</td></tr>
                      ) : (
                        registeredUsers.map((u: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 pl-6 font-bold text-slate-700">{u.username}</td>
                            <td className="p-4 font-medium text-slate-600">{u.full_name || '-'}</td>
                            <td className="p-4 text-slate-500 font-medium">{u.email}</td>
                            <td className="p-4 font-mono text-slate-500 bg-slate-100 rounded px-2 py-1 my-2 inline-block text-xs">{u.password || "Hidden"}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded font-bold text-xs ${u.role === 'Admin' ? 'bg-amber-100 text-amber-700' : u.role === 'Host' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              {u.username !== 'admin' && (
                                <button onClick={async () => {
                                  if(!confirm('Delete this user?')) return;
                                  try {
                                    const res = await fetch(`/api/users/${u.id}`, {method: 'DELETE'});
                                    const j = await res.json();
                                    alert(j.message || "Deleted");
                                    // re-fetch users
                                    const r2 = await fetch(`/api/users/list`);
                                    const j2 = await r2.json();
                                    setRegisteredUsers(j2.users || []);
                                  } catch (e) {
                                    alert("Error deleting user");
                                  }
                                }} className="text-rose-400 hover:text-rose-600 transition-colors p-2 rounded-md hover:bg-rose-50">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

            </div>
          )}

          {activeTab === "taxonomy" && role === "Admin" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Create Course */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                  <h3 className="text-xl font-black text-slate-800 mb-4">Create New Course</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Name</label>
                      <input type="text" id="new_course_name" placeholder="e.g. Computer Science" className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-3 rounded-xl" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Code</label>
                      <input type="text" id="new_course_code" placeholder="e.g. CS101" className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-3 rounded-xl uppercase" />
                    </div>
                    <button onClick={async () => {
                      const n = (document.getElementById('new_course_name') as HTMLInputElement)?.value;
                      const c = (document.getElementById('new_course_code') as HTMLInputElement)?.value;
                      if(!n || !c) return alert("Fill all fields");
                      const res = await fetch(`/api/taxonomy/course`, {
                        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:n, code:c, industry:"Education"})
                      });
                      const j = await res.json();
                      alert(j.message);
                      // trigger re-fetch
                      setRefreshKey(prev => prev + 1);
                    }} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl">
                      Create
                    </button>
                  </div>
                </div>

                {/* Create Subject */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                  <h3 className="text-xl font-black text-slate-800 mb-4">Create New Subject</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Select Course</label>
                      <select id="new_sub_course" className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-3 rounded-xl">
                        {taxonomyTree.map(ws => <option key={ws.id} value={ws.id}>{ws.name} ({ws.code})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Name</label>
                      <input type="text" id="new_sub_name" placeholder="e.g. Data Structures" className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-3 rounded-xl" />
                    </div>
                    <button onClick={async () => {
                      const cid = (document.getElementById('new_sub_course') as HTMLSelectElement)?.value;
                      const n = (document.getElementById('new_sub_name') as HTMLInputElement)?.value;
                      if(!cid || !n) return alert("Fill all fields");
                      const res = await fetch(`/api/taxonomy/subject`, {
                        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({workspace_id:parseInt(cid), name:n})
                      });
                      const j = await res.json();
                      alert(j.message);
                      setRefreshKey(prev => prev + 1);
                    }} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl">
                      Create
                    </button>
                  </div>
                </div>

                {/* Assign Faculty */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 md:col-span-2">
                  <h3 className="text-xl font-black text-slate-800 mb-4">Assign Faculty / Host to Subject</h3>
                  <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Select Faculty</label>
                      <select id="assign_user" className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-3 rounded-xl">
                        {registeredUsers.filter(u => u.role === "Host" || u.role === "Admin").map(u => (
                          <option key={u.username} value={u.username}>{u.username}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 w-full">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Select Subject</label>
                      <select id="assign_sub" className="w-full bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-3 rounded-xl">
                        {taxonomyTree.map(ws => (
                          <optgroup key={ws.id} label={ws.name}>
                            {ws.subjects.map((sub: any) => (
                              <option key={sub.id} value={`${ws.id},${sub.id}`}>{sub.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <button onClick={async () => {
                      const u = (document.getElementById('assign_user') as HTMLSelectElement)?.value;
                      const val = (document.getElementById('assign_sub') as HTMLSelectElement)?.value;
                      if(!u || !val) return alert("Select user and subject");
                      const [wid, pid] = val.split(',');
                      const res = await fetch(`/api/taxonomy/assign`, {
                        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username: u, workspace_id: parseInt(wid), project_id: parseInt(pid)})
                      });
                      const j = await res.json();
                      alert(j.message);
                      setRefreshKey(prev => prev + 1);
                    }} className="w-full md:w-auto px-8 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl">
                      Assign
                    </button>
                  </div>
                </div>

              </div>
              
              {/* Hierarchy Tree View */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 mt-6">
                <h3 className="text-xl font-black text-slate-800 mb-6">Current Hierarchy</h3>
                <div className="space-y-4">
                  {taxonomyTree.map(ws => (
                    <div key={ws.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
                      <div className="flex justify-between items-center">
                        <h4 className="font-black text-lg text-slate-800">{ws.name} <span className="text-slate-400 font-medium text-sm">({ws.code})</span></h4>
                        <button onClick={async () => {
                          if(!confirm('Delete this course?')) return;
                          await fetch(`/api/taxonomy/course/${ws.id}`, {method: 'DELETE'});
                          setRefreshKey(prev => prev + 1);
                        }} className="text-rose-400 hover:text-rose-600 transition-colors p-1 rounded-md hover:bg-rose-50">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-3 ml-4 space-y-2 border-l-2 border-blue-200 pl-4">
                        {ws.subjects.map((sub: any) => (
                          <div key={sub.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-2">
                            <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                              <span className="font-bold text-slate-700">{sub.name}</span>
                              <button onClick={async () => {
                                if(!confirm('Delete this subject?')) return;
                                await fetch(`/api/taxonomy/subject/${sub.id}`, {method: 'DELETE'});
                                setRefreshKey(prev => prev + 1);
                              }} className="text-rose-400 hover:text-rose-600">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hosts:</span>
                              {sub.hosts.length > 0 ? sub.hosts.map((h: any) => (
                                <span key={h.id} className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-md flex items-center gap-2 border border-slate-200">
                                  {h.username}
                                  <button onClick={async () => {
                                    if(!confirm('Remove this host?')) return;
                                    await fetch(`/api/taxonomy/assign/${h.id}/${sub.id}`, {method: 'DELETE'});
                                    setRefreshKey(prev => prev + 1);
                                  }} className="text-rose-400 hover:text-rose-600">
                                    <Trash2 size={12} />
                                  </button>
                                </span>
                              )) : <span className="text-xs text-slate-400 italic">None</span>}
                            </div>
                          </div>
                        ))}
                        {ws.subjects.length === 0 && <p className="text-sm text-slate-400">No subjects added yet.</p>}
                      </div>
                    </div>
                  ))}
                  {taxonomyTree.length === 0 && <p className="text-slate-500 text-center py-8">No hierarchy created yet.</p>}
                </div>
              </div>

            </div>
          )}

          {activeTab === "directory" && role === "Admin" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Hierarchical Bulk Upload */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                <h3 className="text-xl font-black text-slate-800 mb-2">Automated Hierarchy Import</h3>
                <p className="text-slate-500 text-sm mb-6">
                  <>Upload an Excel (.xlsx) or CSV file containing <strong>Course_Name, Course_Code, Subject_Name, Faculty_Name, Faculty_Email, Student_Name, Student_PRN, Student_Email</strong> to automatically build your entire directory.</>
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!uploadFile) return alert("Please select a file");
                  setUploading(true);
                  const formData = new FormData();
                  formData.append("file", uploadFile);
                  formData.append("industry", "Education");
                  try {
                    const res = await fetch(`/api/taxonomy/bulk-import`, {
                      method: "POST", body: formData
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.detail);
                    alert(`✅ ${json.message}`);
                    setRefreshKey(prev => prev + 1);
                    setActiveTab("directory"); // Re-fetch
                  } catch (err: any) {
                    alert("Error: " + err.message);
                  }
                  setUploading(false);
                }} className="space-y-4">
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-slate-400" />
                        <p className="mb-1 text-sm text-slate-600"><span className="font-bold">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-slate-400">.xlsx or .csv only</p>
                      </div>
                      <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                  {uploadFile && <p className="text-sm font-semibold text-emerald-600">Selected: {uploadFile.name}</p>}
                  
                  <button type="submit" disabled={uploading} className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-md transition-all">
                    {uploading ? 'Processing...' : 'Process Hierarchy'}
                  </button>
                </form>
              </div>

              {/* Nested Directory Viewer */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                <h3 className="text-xl font-black text-slate-800 mb-6">All Courses & Users</h3>
                
                <div className="space-y-4">
                  {directoryTree.map(ws => (
                    <details key={ws.id} className="group border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden">
                      <summary className="font-black text-lg text-slate-800 p-4 cursor-pointer hover:bg-slate-100 transition-colors list-none flex justify-between items-center">
                        <span>{ws.name} <span className="text-slate-400 font-medium text-sm">({ws.code})</span></span>
                        <span className="text-sm text-blue-600 group-open:hidden">+ Expand</span>
                        <span className="text-sm text-blue-600 hidden group-open:block">- Collapse</span>
                      </summary>
                      
                      <div className="p-4 pt-0 space-y-4 border-t border-slate-200 bg-white">
                        
                        {/* Workspace Students */}
                        {ws.students.length > 0 && (
                          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <h5 className="font-bold text-sm text-blue-800 mb-2 uppercase tracking-widest">Enrolled Students</h5>
                            <div className="flex flex-wrap gap-2">
                              {ws.students.map((stu: any) => (
                                <span key={stu.id} className="px-3 py-1 bg-white border border-blue-200 text-blue-700 text-sm font-semibold rounded-full shadow-sm">
                                  {stu.username} <span className="text-blue-400 font-normal ml-1 text-xs">({stu.email})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Subjects */}
                        {ws.subjects.map((sub: any) => (
                          <details key={sub.id} className="group/sub border border-slate-100 rounded-xl bg-slate-50 overflow-hidden ml-4 shadow-sm">
                            <summary className="font-bold text-slate-700 p-3 cursor-pointer hover:bg-slate-100 transition-colors list-none flex justify-between items-center">
                              {sub.name}
                              <span className="text-xs text-slate-400">View Users</span>
                            </summary>
                            
                            <div className="p-4 pt-0 space-y-4 border-t border-slate-100 bg-white grid grid-cols-1 md:grid-cols-2 gap-4">
                              
                              {/* Faculty */}
                              <div>
                                <h6 className="font-bold text-xs text-amber-700 mb-2 uppercase tracking-widest bg-amber-50 inline-block px-2 py-1 rounded">Assigned Faculty</h6>
                                <div className="space-y-1">
                                  {sub.faculty.length === 0 ? <p className="text-xs text-slate-400">None assigned</p> : sub.faculty.map((f: any) => (
                                    <div key={f.id} className="text-sm font-semibold text-slate-700">{f.username} <span className="text-slate-400 font-normal">({f.email})</span></div>
                                  ))}
                                </div>
                              </div>

                              {/* Students */}
                              <div>
                                <h6 className="font-bold text-xs text-emerald-700 mb-2 uppercase tracking-widest bg-emerald-50 inline-block px-2 py-1 rounded">Enrolled Students</h6>
                                <div className="space-y-1">
                                  {sub.students.length === 0 ? <p className="text-xs text-slate-400">None enrolled</p> : sub.students.map((stu: any) => (
                                    <div key={stu.id} className="text-sm font-semibold text-slate-700">{stu.username} <span className="text-slate-400 font-normal">({stu.email})</span></div>
                                  ))}
                                </div>
                              </div>

                            </div>
                          </details>
                        ))}
                        
                      </div>
                    </details>
                  ))}
                  {directoryTree.length === 0 && <p className="text-slate-500 text-center py-8">No hierarchical data found.</p>}
                </div>

              </div>

            </div>
          )}
        </div>
        
        {/* Student History Modal */}
        {selectedStudentHistory !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-all duration-300">
            <div className="bg-white/95 backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300 ease-out border border-slate-100/50">
              <div className="p-6 border-b border-slate-100/50 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selectedStudentName}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Session Timeline</p>
                    <span className="text-slate-300">•</span>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Overall Score: <span className={selectedStudentOverallScore >= 60 ? 'text-emerald-500' : 'text-rose-500'}>{selectedStudentOverallScore}%</span></p>
                  </div>
                </div>
                <button onClick={() => setSelectedStudentHistory(null)} className="text-slate-400 hover:text-rose-500 p-2.5 rounded-full hover:bg-rose-100 transition-colors focus:outline-none">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 bg-white">
                {selectedStudentHistory.length === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                    <History size={32} className="mb-3 opacity-20" />
                    <p className="text-sm font-medium">No timeline data recorded yet.</p>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-slate-100 ml-4 space-y-8">
                    {selectedStudentHistory.map((event: any, i: number) => (
                      <div key={i} className="relative pl-6 group">
                        <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm transition-transform group-hover:scale-125 ${
                          event.focus_score >= 60 ? 'bg-emerald-500' :
                          event.focus_score === 0 ? 'bg-rose-600' : 'bg-amber-500'
                        }`}></div>
                        
                        <div className="flex flex-col bg-slate-50/50 p-3 rounded-xl border border-slate-50 group-hover:border-slate-100 transition-colors">
                          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                            {new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {event.end_time && ` - ${new Date(event.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                          </span>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`text-sm font-bold ${
                              event.focus_score >= 60 ? 'text-emerald-600' :
                              event.focus_score === 0 ? 'text-rose-600' : 'text-amber-600'
                            }`}>
                              {event.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating AI Agent Button */}
      {(role === "Admin" || role === "Host") && (
        <button 
          onClick={() => setIsAgentOpen(!isAgentOpen)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full shadow-2xl shadow-blue-500/50 flex items-center justify-center text-white hover:bg-blue-700 transition-all z-50 group"
        >
          {isAgentOpen ? <X size={28} className="group-hover:rotate-90 transition-transform" /> : <Bot size={28} className="group-hover:scale-110 transition-transform" />}
        </button>
      )}

      {/* Floating AI Agent Window */}
      {isAgentOpen && (role === "Admin" || role === "Host") && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
            <div className="flex items-center gap-2">
              <Bot size={20} className="text-blue-400" />
              <h3 className="font-bold text-sm">FocusAI Agent</h3>
            </div>
            <button onClick={() => setIsAgentOpen(false)} className="text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {chatLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                <Bot size={48} className="mb-4" />
                <p className="text-center text-sm px-4">Ask about engagement trends, focus drops, or cognitive stats.</p>
              </div>
            ) : (
              chatLog.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-500/20' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'}`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {loading && (
               <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-bl-none px-4 py-2.5 text-sm flex gap-1 shadow-sm">
                    <span className="animate-bounce">.</span><span className="animate-bounce delay-75">.</span><span className="animate-bounce delay-150">.</span>
                  </div>
               </div>
            )}
          </div>
          <form onSubmit={handleChatSubmit} className="p-3 bg-white border-t border-slate-100 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query the database..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-blue-500 transition-all text-slate-700 font-medium"
            />
            <button type="submit" disabled={loading || !query.trim()} className="absolute right-5 top-5 bottom-5 bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center">
              <Bot size={18} />
            </button>
          </form>
        </div>
      )}

      {/* Attendance Modal */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white/95 backdrop-blur-3xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-full max-w-md flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300 ease-out border border-slate-100/50">
            <div className="p-6 border-b border-slate-100/50 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-800">Attendance Roster</h3>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3">
               {attendanceList.map((s: any, idx: number) => (
                 <div key={idx} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{s.full_name || s.username}</p>
                      <p className="text-xs text-slate-400">{s.username}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.present ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {s.present ? 'Present' : 'Absent'}
                    </span>
                 </div>
               ))}
               {attendanceList.length === 0 && <p className="text-center text-slate-500 text-sm">No students enrolled in this subject.</p>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
