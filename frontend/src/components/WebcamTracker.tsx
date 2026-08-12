"use client";

import React, { useEffect, useRef, useState } from "react";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

function FeatureRow({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col bg-white rounded-lg border border-slate-100 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <span
        className={
          "font-bold " +
          (warn ? "text-amber-600" : highlight ? "text-indigo-600" : "text-slate-700")
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function WebcamTracker({ sessionId }: { sessionId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Initializing Edge AI...");
  const [score, setScore] = useState<string>("--");

  // Extended facial-feature telemetry coming back from the backend
  type Features = {
    eyebrows: string;
    lip_movement: boolean;
    yawning: boolean;
    smile: string;
    facial_tension: boolean;
    tension_score: number;
    mood: string;
    emotion_changed_at?: number;
    previous_mood?: string;
  };
  type EmotionEvent = { emotion: string; previous_emotion: string | null; timestamp: number };

  const [features, setFeatures] = useState<Features | null>(null);
  const [emotionHistory, setEmotionHistory] = useState<EmotionEvent[]>([]);

  useEffect(() => {
    let faceLandmarker: FaceLandmarker;
    let ws: WebSocket;
    let animationFrameId: number;

    const setupAI = async () => {
      setStatus("Downloading AI Model to Edge...");
      const vision = await FilesetResolver.forVisionTasks("/wasm");
      
      // Next.js intercepts console.error and blocks the screen.
      // MediaPipe logs its success message (XNNPACK) to console.error by mistake.
      // We temporarily mute it here to prevent the red screen of death!
      const originalError = console.error;
      console.error = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('XNNPACK')) return;
        originalError(...args);
      };
      
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      
      console.error = originalError; // Restore normal errors

      setStatus("Connecting to Backend Server...");
      const userId = sessionStorage.getItem("focusai_user_id") || "unknown";
      ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/user/${encodeURIComponent(userId)}/${encodeURIComponent(sessionId)}`);
      
      ws.onmessage = (event) => {
        // Handle message (currently unused by frontend)
      };
      ws.onopen = async () => {
        setStatus("Accessing Camera...");
        try {
          // How it works: This is the starting point. When a user joins a session, this React component uses navigator.mediaDevices.getUserMedia() to turn on their webcam.
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
              setStatus("");
              videoRef.current?.play();
              predictLoop();
            };
          }
        } catch (e) {
          setStatus("Camera Access Denied.");
        }
      };
      
      ws.onerror = () => {
         setStatus("Backend Server is Offline. Start FastAPI.");
      }
    };

    let lastVideoTime = -1;
    //  starts running at roughly 30 frames per second Once the webcam is active, a continuous loop
    const predictLoop = () => {
      if (
        videoRef.current && 
        videoRef.current.readyState >= 2 &&
        videoRef.current.currentTime !== lastVideoTime &&
        faceLandmarker
      ) {
        lastVideoTime = videoRef.current.currentTime;
        try {
          // The Magic: Instead of uploading the video, it feeds the live video frames directly into Google's MediaPipe FaceLandmarker running entirely inside the browser via WebAssembly (WASM).
          const results = faceLandmarker.detectForVideo(videoRef.current, performance.now());
          
          if (ws && ws.readyState === WebSocket.OPEN) {
            if (results.faceLandmarks.length > 0) {
              // The Output: It extracts a 3D mesh of 478 facial landmarks. It packages the precise X, Y, Z coordinates for the eyes, mouth, and head rotation into a tiny JSON payload and sends it to the backend via WebSockets. The video is immediately discarded and NEVER leaves the browser.
            //Index 33 is always the outer corner of the right eye.
            // Index 133 is always the inner corner of the right eye.
            // Indices 160 & 158 are on the top eyelid.
            // Indices 153 & 144 are on the bottom eyelid.
              const rightEyeIndices = [33, 160, 158, 133, 153, 144];
              const leftEyeIndices = [362, 385, 387, 263, 373, 380];

              // Eyebrow indices, ordered outer -> inner (last point = closest to nose bridge,
              // matching what calculate_eyebrow_position / detect_facial_tension expect on the backend)
              const leftEyebrowIndices = [70, 63, 105, 66, 107];
              const rightEyebrowIndices = [336, 296, 334, 293, 300];

              // Mouth indices, ordered [left_corner, right_corner, top_outer, bottom_outer, top_inner, bottom_inner]
              const mouthIndices = [61, 291, 0, 17, 13, 14];
              
              const rawLandmarks = results.faceLandmarks[0];
              // instead of sending video, the frontend packages these specific coordinates into a tiny JSON payload 
              // It instantly fires this lightweight JSON payload across a high-speed WebSocket connection to the Python backend API  (which is listening in backend/websocket/stream.py).
              //  30 times a second
              const payload = {
                right_eye: rightEyeIndices.map(i => rawLandmarks[i]),
                left_eye: leftEyeIndices.map(i => rawLandmarks[i]),
                left_eyebrow: leftEyebrowIndices.map(i => rawLandmarks[i]),
                right_eyebrow: rightEyebrowIndices.map(i => rawLandmarks[i]),
                mouth: mouthIndices.map(i => rawLandmarks[i]),
                irises: rawLandmarks.length > 470 ? [rawLandmarks[468], rawLandmarks[473]] : null,
                matrix: results.facialTransformationMatrixes?.[0] ? Array.from(results.facialTransformationMatrixes[0].data) : null
              };
              
              ws.send(JSON.stringify(payload));
            } else {
              ws.send(JSON.stringify({ no_face: true }));
            }
          }
        } catch (error) {
           console.warn("MediaPipe processing skipped a frame", error);
        }
      }
      animationFrameId = requestAnimationFrame(predictLoop);
    };

    setupAI();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (ws) ws.close();
      if (faceLandmarker) faceLandmarker.close();
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full bg-black z-40 overflow-hidden">
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-90" 
        playsInline
        muted
      />
      
      {/* Overlay UI */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-xl px-8 py-4 rounded-full border border-white/10 shadow-2xl z-50">
        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,1)]"></div>
        <div className="flex flex-col">
          <p className="text-sm font-bold text-white uppercase tracking-widest leading-none">Secure Telemetry Active</p>
          <p className="text-[10px] text-emerald-400 font-mono mt-1 opacity-80 tracking-widest">SESSION: {sessionId}</p>
        </div>
      </div>
      
      {status && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/60 backdrop-blur-md z-50 transition-all duration-500">
          <div className="px-8 py-5 bg-black/80 rounded-3xl text-white font-mono text-xl shadow-2xl border border-white/10">
             {status}
          </div>
        </div>
      )}
    </div>
  );
}