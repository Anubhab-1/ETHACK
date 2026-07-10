"use client";
/**
 * AETHER — Emergency Alert Broadcast Simulator
 * Renders a simulated smartphone with tabs for IVR calling and WhatsApp messaging.
 * The WhatsApp chat includes interactive buttons that trigger backend database writes
 * to increment citizen alert acknowledgments in real-time.
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { getAQIColor } from "@/lib/aqi-colors";

interface BroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionId: number;
  wardName: string;
  wardNo: number;
  aqi: number;
  targetType: string;
  onStatusUpdate?: () => void;
}

interface ChatMessage {
  sender: "system" | "citizen" | "resident";
  text: string;
  time: string;
}

export function BroadcastModal({
  isOpen,
  onClose,
  actionId,
  wardName,
  wardNo,
  aqi,
  targetType,
  onStatusUpdate,
}: BroadcastModalProps) {
  const [activeTab, setActiveTab] = useState<"whatsapp" | "ivr">("whatsapp");
  const [language, setLanguage] = useState("en");

  // Broadcast Telemetry States
  const [alertsSent, setAlertsSent] = useState(0);
  const [alertsConfirmed, setAlertsConfirmed] = useState(0);
  const [broadcasting, setBroadcasting] = useState(false);

  // WhatsApp Simulated State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [buttonsVisible, setButtonsVisible] = useState(true);

  // IVR Simulated State
  const [ivrState, setIvrState] = useState<"idle" | "calling" | "active" | "completed">("idle");
  const [callDuration, setCallDuration] = useState(0);
  // Meteorological Alert Messages
  const alertTexts: Record<string, string> = {
    en: `Emergency Air Quality Warning for Ward ${wardNo}, ${wardName}. The current AQI has spiked to ${Math.round(aqi)} (Severe). We advise children and the elderly to stay indoors. School outdoor activities are suspended.`,
    bn: `জরুরি বায়ু মান সতর্কতা, ওয়ার্ড ${wardNo}, ${wardName}। বর্তমান বায়ু মান সূচক ${Math.round(aqi)} তে পৌঁছেছে। শিশু এবং প্রবীণদের ঘরে থাকার পরামর্শ দেওয়া হচ্ছে। স্কুলের বাইরের কার্যক্রম স্থগিত করা হয়েছে।`,
    hi: `आपातकालीन वायु गुणवत्ता चेतावनी, वार्ड ${wardNo}, ${wardName}। वर्तमान एक्यूआई ${Math.round(aqi)} हो चुका है। बच्चों और बुजुर्गों को घर के अंदर रहने की सलाह दी जाती है। स्कूलों में बाहरी गतिविधियां निलंबित कर दी गई हैं।`
  };

  const currentMessage = alertTexts[language] || alertTexts.en;

  // 1. Core Broadcast Trigger
  const triggerBroadcast = useCallback(async () => {
    setBroadcasting(true);
    try {
      const res = await api.broadcastAlerts(actionId);
      setAlertsSent(res.alerts_sent);
      setAlertsConfirmed(res.alerts_confirmed);
      
      // Seed initial WhatsApp system message
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatMessages([
        {
          sender: "system",
          text: `🚨 *AETHER PUBLIC SAFETY BROADCAST* 🚨\n\n*Ward:* ${wardName} (Ward #${wardNo})\n*Air Quality:* Severe AQI ${Math.round(aqi)}\n\n*Directive:* ${alertTexts.en}`,
          time: timeStr
        }
      ]);
      setButtonsVisible(true);
      
      // Callback to refresh parent dashboard list
      onStatusUpdate?.();
    } catch (e) {
      console.error("Failed to broadcast alert:", e);
    } finally {
      setBroadcasting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId, wardName, wardNo, aqi, onStatusUpdate]);

  // Run broadcast automatically on open if not already sent
  useEffect(() => {
    if (isOpen) {
      triggerBroadcast();
    } else {
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
      setIvrState("idle");
      setCallDuration(0);
    }
  }, [isOpen, triggerBroadcast]);

  // IVR Call Duration Timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (ivrState === "active") {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [ivrState]);

  // Real-time citizen feedback simulation loop
  useEffect(() => {
    if (!isOpen || broadcasting || chatMessages.length !== 1) return;

    const feedbackPresets = [
      { text: "📱 [Resident - Sector 2]: Received the warning. Staying indoors today." },
      { text: "🔥 [Resident - Market Area]: Heavy garbage burning spotted behind the market. Can you alert compliance?" },
      { text: "🏥 [Resident - Clinic Area]: Asthmatic child at home. nebulizer kits are ready, thank you." },
      { text: "🏫 [Resident - Primary School]: Indoor protocol initiated. Outdoor play suspended." },
      { text: "🚚 [Resident - Main Road]: Spraying truck spotted active. Visibility improving." }
    ];

    const timerIds: NodeJS.Timeout[] = [];

    feedbackPresets.forEach((preset, index) => {
      const id = setTimeout(() => {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setChatMessages((prev) => [
          ...prev,
          { sender: "resident", text: preset.text, time: timeStr }
        ]);

        // Dynamically increment alertsConfirmed
        setAlertsConfirmed((prev) => {
          const next = prev + 5 + Math.floor(Math.random() * 8);
          return next;
        });
      }, (index + 1) * 3000); // Trigger every 3 seconds

      timerIds.push(id);
    });

    return () => {
      timerIds.forEach((id) => clearTimeout(id));
    };
  }, [isOpen, broadcasting, chatMessages.length]);

  if (!isOpen) return null;

  // 2. Interactive citizen reply handlers (WhatsApp Feedback Loop)
  const handleCitizenReply = async (replyText: string, actionType: "confirm" | "mask") => {
    setButtonsVisible(false);
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add citizen reply bubble as an incoming resident message
    setChatMessages((prev) => [
      ...prev,
      { sender: "resident", text: replyText, time: timeStr }
    ]);

    // Simulate network write delay
    setTimeout(async () => {
      try {
        const res = await api.confirmAlertReceipt(actionId);
        setAlertsConfirmed(res.alerts_confirmed);
        onStatusUpdate?.();

        // System feedback reply
        const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let feedbackMessage = "";
        if (actionType === "confirm") {
          feedbackMessage = "✅ Thank you. Your safety confirmation has been registered in the Municipal database. Stay indoors.";
        } else {
          feedbackMessage = "🚚 Request received. A municipal crew has been dispatched to deliver safety masks to your sector.";
        }

        setChatMessages((prev) => [
          ...prev,
          { sender: "system", text: feedbackMessage, time: replyTime }
        ]);
      } catch (e) {
        console.error(e);
      }
    }, 600);
  };

  // 3. IVR calling handlers (TTS)
  const handleIvrCall = () => {
    setIvrState("calling");
    setTimeout(() => {
      setIvrState("active");
      playTTS();
    }, 1500);
  };

  const playTTS = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(currentMessage);
    const voices = window.speechSynthesis.getVoices();
    const voiceLang = language === "bn" ? "bn" : language === "hi" ? "hi" : "en";
    const selectedVoice = voices.find((v) => v.lang.startsWith(voiceLang));
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onend = () => {
      setIvrState("completed");
    };
    utterance.onerror = () => {
      setIvrState("completed");
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleHangUp = () => {
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    setIvrState("idle");
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const sourceColor = getAQIColor(aqi);
  const confirmPercent = alertsSent > 0 ? Math.round((alertsConfirmed / alertsSent) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-gray-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl p-5 flex flex-col items-center animate-scale-in">
        
        {/* Modal Close */}
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.speechSynthesis.cancel();
            onClose();
          }}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-xs cursor-pointer z-50"
        >
          ✕ Close
        </button>

        <h2 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">
          Alert Outreach Simulator
        </h2>

        {/* Tab Controls */}
        <div className="flex bg-gray-900 border border-white/5 p-1 rounded-xl w-full mb-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("whatsapp")}
            className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === "whatsapp" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            💬 WhatsApp Chat Loop
          </button>
          <button
            onClick={() => {
              setActiveTab("ivr");
              handleHangUp();
            }}
            className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === "ivr" ? "bg-orange-500 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            📞 Automated IVR Call
          </button>
        </div>

        {/* Language selector */}
        <div className="flex gap-2 mb-4">
          {[
            { code: "en", label: "English" },
            { code: "bn", label: "বাংলা" },
            { code: "hi", label: "हिन्दी" }
          ].map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLanguage(l.code);
                if (ivrState === "active") {
                  playTTS();
                }
              }}
              className={`px-3 py-1 text-[10px] rounded-lg border font-semibold transition-colors cursor-pointer ${
                language === l.code
                  ? "bg-gray-800 border-orange-500/50 text-orange-400"
                  : "bg-transparent border-gray-800 text-gray-500 hover:text-gray-300"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Smartphone Shell Mockup */}
        <div className="w-[280px] h-[410px] rounded-[36px] border-4 border-gray-800 bg-gray-950 shadow-inner flex flex-col relative overflow-hidden shadow-orange-500/5">
          {/* Ear Piece Speaker Slot */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-gray-800 rounded-full z-50 flex justify-center items-center">
            <div className="w-8 h-1 bg-gray-900 rounded-full" />
          </div>

          {/* ────────────────── Tab 1: WhatsApp Mock ────────────────── */}
          {activeTab === "whatsapp" && (
            <div className="flex-1 flex flex-col bg-gray-900 text-xs">
              {/* WhatsApp Header */}
              <div className="bg-[#075e54] text-white p-3 pt-6 flex items-center gap-2 flex-none">
                <div className="w-7 h-7 rounded-full bg-emerald-700/50 border border-emerald-500 flex items-center justify-center font-bold text-sm text-emerald-200">
                  ⬡
                </div>
                <div>
                  <div className="font-bold flex items-center gap-1 text-[11px]">
                    Municipal Alerts
                    <span className="text-[10px] text-emerald-300">✓</span>
                  </div>
                  <div className="text-[8px] text-emerald-200">AETHER Command Center</div>
                </div>
              </div>

              {/* Chat Area */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-[#efe7dd] flex flex-col">
                {broadcasting ? (
                  <div className="my-auto text-center text-gray-500 text-[10px] space-y-1">
                    <div className="w-4 h-4 border border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p>Dispatching alerts to ward cells...</p>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`max-w-[85%] rounded-lg p-2 shadow-sm text-[10px] relative whitespace-pre-line leading-relaxed ${
                          msg.sender === "system"
                            ? "bg-[#dcf8c6] text-gray-800 rounded-tr-none self-end"
                            : "bg-white text-gray-800 rounded-tl-none self-start"
                        }`}
                      >
                        {msg.text}
                        <span className="block text-[8px] text-gray-400 text-right mt-1 font-mono">
                          {msg.time}
                        </span>
                      </div>
                    ))}
                    
                    {/* Interactive Citizen Option Buttons */}
                    {buttonsVisible && chatMessages.length > 0 && (
                      <div className="self-end w-full max-w-[85%] space-y-1.5 mt-2">
                        <button
                          onClick={() => handleCitizenReply("Acknowledge warning. Indoor protocol initiated.", "confirm")}
                          className="w-full text-left bg-white hover:bg-emerald-50/50 border border-emerald-500/30 text-emerald-700 rounded-lg p-2 font-semibold text-[9px] transition-colors shadow-sm cursor-pointer"
                        >
                          👍 Confirmed (Acknowledge)
                        </button>
                        <button
                          onClick={() => handleCitizenReply("Requesting emergency filtration mask kit.", "mask")}
                          className="w-full text-left bg-white hover:bg-orange-50/50 border border-orange-500/30 text-orange-700 rounded-lg p-2 font-semibold text-[9px] transition-colors shadow-sm cursor-pointer"
                        >
                          😷 Request Mask Delivery
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Chat Input Footer */}
              <div className="p-2 bg-gray-950/40 border-t border-white/5 flex gap-1 flex-none items-center">
                <input
                  type="text"
                  placeholder="Replies restricted to choices"
                  disabled
                  className="flex-1 bg-gray-900 border border-gray-800 rounded-full px-2 py-1 text-[9px] text-gray-500 focus:outline-none"
                />
                <button disabled className="p-1 rounded-full bg-emerald-700 text-white opacity-40">
                  ▶
                </button>
              </div>
            </div>
          )}

          {/* ────────────────── Tab 2: IVR Call Mock ────────────────── */}
          {activeTab === "ivr" && (
            <div className="flex-1 flex flex-col bg-gray-900 justify-between p-4 py-8 items-center text-xs">
              {/* Idle screen */}
              {ivrState === "idle" && (
                <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-2xl animate-pulse">
                    📞
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-200 text-xs">AETHER IVR Line</h3>
                    <p className="text-[9px] text-gray-500 mt-1">Ready to execute call test for Ward {wardNo}</p>
                  </div>
                  <button
                    onClick={handleIvrCall}
                    className="px-4 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Start Dial Simulation
                  </button>
                </div>
              )}

              {/* Calling screen */}
              {ivrState === "calling" && (
                <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-orange-400 text-xl animate-bounce">
                    ⚡
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-300 text-xs">DIALING RECIPIENTS</h3>
                    <p className="text-[9px] text-orange-500 font-mono tracking-widest uppercase animate-pulse">Connecting IVR...</p>
                  </div>
                </div>
              )}

              {/* Active Call screen */}
              {ivrState === "active" && (
                <div className="flex-1 flex flex-col justify-between items-center py-6 w-full">
                  <div className="text-center space-y-1.5">
                    <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full font-bold tracking-wider font-mono animate-pulse">
                      CALL IN PROGRESS
                    </span>
                    <h3 className="font-bold text-gray-100 text-sm">{wardName} Cell</h3>
                    <p className="text-[10px] text-gray-500 font-mono">{formatDuration(callDuration)}</p>
                  </div>

                  {/* Audio flow wave animations */}
                  <div className="flex items-center gap-1 h-12">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-orange-500 rounded-full animate-bounce"
                        style={{
                          height: `${12 + Math.random() * 24}px`,
                          animationDuration: `${0.3 + i * 0.1}s`
                        }}
                      />
                    ))}
                  </div>

                  <div className="text-center space-y-4 w-full px-4">
                    <p className="text-[9px] text-gray-400 leading-normal line-clamp-3 bg-black/30 p-2.5 rounded-lg border border-white/5 font-sans">
                      {currentMessage}
                    </p>
                    
                    <button
                      onClick={handleHangUp}
                      className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-base cursor-pointer shadow-lg mx-auto"
                      title="Hang Up"
                    >
                      📞
                    </button>
                  </div>
                </div>
              )}

              {/* Completed screen */}
              {ivrState === "completed" && (
                <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                  <span className="text-2xl">✅</span>
                  <div>
                    <h3 className="font-bold text-gray-200 text-xs">Call Dispatched</h3>
                    <p className="text-[9px] text-gray-500 mt-1">Audio playback completed successfully.</p>
                  </div>
                  <button
                    onClick={() => setIvrState("idle")}
                    className="px-3 py-1 bg-gray-800 text-gray-300 text-[9px] font-bold rounded hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    Reset Dialer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Smartphone Bottom Home Bar */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-gray-800 rounded-full z-50" />
        </div>

        {/* Telemetry Alert Metrics Summary Box */}
        <div className="w-full mt-4 bg-gray-900/60 border border-white/5 rounded-2xl p-3.5 space-y-2.5 text-xs text-gray-300">
          <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            <span>📡 Broadcast Telemetry</span>
            <span className="text-emerald-400">Live Status</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-gray-950 p-2 rounded-xl border border-white/5">
              <span className="text-[9px] text-gray-500 block">Notifications Dispatched</span>
              <span className="text-sm font-black text-orange-400 font-mono">{alertsSent}</span>
            </div>
            <div className="bg-gray-950 p-2 rounded-xl border border-white/5">
              <span className="text-[9px] text-gray-500 block">Citizen Confirmations</span>
              <span className="text-sm font-black text-emerald-400 font-mono">
                {alertsConfirmed} <span className="text-[10px] text-gray-500">({confirmPercent}%)</span>
              </span>
            </div>
          </div>

          <div className="w-full h-1.5 bg-gray-950 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${confirmPercent}%` }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
