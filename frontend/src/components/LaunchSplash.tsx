import React, { useEffect, useState } from "react";

export const LaunchSplash: React.FC = () => {
  const [phase, setPhase] = useState<"logo" | "reveal" | "done">("logo");

  useEffect(() => {
    // Stage 1: Display the Toyota Logo & DRL light signature for 1.8 seconds
    const t1 = setTimeout(() => {
      setPhase("reveal");
    }, 1800);

    // Stage 2: Unmount component after the shutter split animation finishes (2.5 seconds total)
    const t2 = setTimeout(() => {
      setPhase("done");
    }, 2500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[99999] pointer-events-none flex flex-col justify-between overflow-hidden select-none font-sans"
      aria-hidden="true"
    >
      {/* Top OLED Cockpit Shutter */}
      <div
        className={`w-full h-1/2 bg-[#040406] transition-transform duration-700 ease-[cubic-bezier(0.76,0,0.24,1)] ${
          phase === "reveal" ? "-translate-y-full" : "translate-y-0"
        }`}
      />

      {/* Bottom OLED Cockpit Shutter */}
      <div
        className={`w-full h-1/2 bg-[#040406] transition-transform duration-700 ease-[cubic-bezier(0.76,0,0.24,1)] ${
          phase === "reveal" ? "translate-y-full" : "translate-y-0"
        }`}
      />

      {/* Center Logo & DRL Light Bar Stage */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center px-4 transition-all duration-500 ${
          phase === "reveal" ? "opacity-0 scale-110" : "opacity-100 scale-100"
        }`}
      >
        {/* Ambient Red Glow */}
        <div className="absolute w-[500px] h-[200px] rounded-full bg-[#EB0A1E]/20 blur-[100px] animate-pulse" />

        {/* Horizon Laser Line */}
        <div className="w-[300px] sm:w-[480px] h-[2px] bg-gradient-to-r from-transparent via-white to-transparent shadow-[0_0_20px_#ffffff] mb-8 animate-pulse" />

        {/* Toyota Logo & DRL Blades Container */}
        <div className="flex items-center gap-8 sm:gap-14">
          {/* Left Hammerhead / T-DRL LED Signature */}
          <svg className="w-24 sm:w-36 h-12" viewBox="0 0 160 48" fill="none">
            <path
              d="M155 12 H35 L15 26 H85"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_10px_#ffffff]"
            />
            <path
              d="M155 20 H55"
              stroke="#EB0A1E"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_#EB0A1E]"
            />
          </svg>

          {/* Chrome 3D Toyota Emblem */}
          <svg
            className="w-24 h-16 sm:w-32 sm:h-20 drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]"
            viewBox="0 0 200 130"
            fill="none"
          >
            <ellipse cx="100" cy="65" rx="86" ry="52" stroke="#f4f4f5" strokeWidth="7.5" />
            <ellipse cx="100" cy="47" rx="60" ry="24" stroke="#d4d4d8" strokeWidth="7" />
            <ellipse cx="100" cy="65" rx="23" ry="50" stroke="#d4d4d8" strokeWidth="7" />
          </svg>

          {/* Right Hammerhead / T-DRL LED Signature */}
          <svg className="w-24 sm:w-36 h-12" viewBox="0 0 160 48" fill="none">
            <path
              d="M5 12 H125 L145 26 H75"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="drop-shadow-[0_0_10px_#ffffff]"
            />
            <path
              d="M5 20 H105"
              stroke="#EB0A1E"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="drop-shadow-[0_0_8px_#EB0A1E]"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};