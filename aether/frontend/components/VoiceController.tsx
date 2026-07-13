"use client";
/**
 * AETHER — Voice-Activated Command Assistant (Jarvis Mode)
 * Uses browser Web Speech API for Speech-to-Text and Text-to-Speech.
 * Zero external libraries, highly responsive, fits premium sci-fi HUD theme.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { api } from "@/lib/api";

interface Ward {
  id: number;
  name: string;
}

interface VoiceControllerProps {
  city: string;
  setCity: (city: string) => void;
  setSelectedWard: (ward: { id: number; name: string } | null) => void;
  wards: Ward[];
  showWind: boolean;
  setShowWind: (val: boolean) => void;
  showSatellite: boolean;
  setShowSatellite: (val: boolean) => void;
  showCitizenReports: boolean;
  setShowCitizenReports: (val: boolean) => void;
  onConveneCommittee: () => void;
  onTriggerVoiceBriefing: () => void;
  setTrafficReduction: (val: number) => void;
  setConstructionHalt: (val: boolean) => void;
  setIndustrialRestriction: (val: number) => void;
}

export function VoiceController({
  city,
  setCity,
  setSelectedWard,
  wards,
  showWind,
  setShowWind,
  showSatellite,
  setShowSatellite,
  showCitizenReports,
  setShowCitizenReports,
  onConveneCommittee,
  onTriggerVoiceBriefing,
  setTrafficReduction,
  setConstructionHalt,
  setIndustrialRestriction,
}: VoiceControllerProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // TTS Helper to speak back in natural voice
  const speakFeedback = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Cancel any current speaking
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95; // low pitch for sci-fi computer tone
    window.speechSynthesis.speak(utterance);
  }, []);

  // Command Parser Logic via LLM Router
  const parseCommand = useCallback(async (command: string) => {
    setTranscript(command);
    setHudMessage("Analyzing request...");
    
    try {
      const response = await api.voiceCommand(command, city, wards.map(w => w.name));
      const { action, parameters, speech_response } = response;
      
      if (speech_response) {
        speakFeedback(speech_response);
      }
      
      // Execute states based on structured intent from LLM
      if (action === "change_city" && parameters.city) {
        setCity(parameters.city);
        setHudMessage(`Executing: Switched city to ${parameters.city}`);
      }
      else if (action === "focus_ward" && parameters.ward_name) {
        const foundWard = wards.find(w => w.name.toLowerCase() === parameters.ward_name.toLowerCase());
        if (foundWard) {
          setSelectedWard(foundWard);
          setHudMessage(`Executing: Focused on ${foundWard.name} ward`);
        } else {
          setHudMessage(`Executing: Ward "${parameters.ward_name}" not found in current city`);
        }
      }
      else if (action === "toggle_layer" && parameters.layer) {
        const layer = parameters.layer;
        const targetState = parameters.layer_state;
        
        if (layer === "wind") {
          setShowWind(targetState !== null ? targetState : !showWind);
        } else if (layer === "satellite") {
          setShowSatellite(targetState !== null ? targetState : !showSatellite);
        } else if (layer === "citizen_reports") {
          setShowCitizenReports(targetState !== null ? targetState : !showCitizenReports);
        }
        
        setHudMessage(`Executing: Toggled ${layer} overlay`);
      }
      else if (action === "run_simulation") {
        onConveneCommittee();
        setHudMessage("Executing: Convening agent committee");
      }
      else if (action === "change_simulation_parameter") {
        let matched = false;
        
        if (parameters.briefing) {
          onTriggerVoiceBriefing();
          matched = true;
        }
        if (parameters.traffic_reduction !== undefined) {
          setTrafficReduction(parameters.traffic_reduction);
          matched = true;
        }
        if (parameters.construction_halt !== undefined) {
          setConstructionHalt(parameters.construction_halt);
          matched = true;
        }
        if (parameters.industrial_restriction !== undefined) {
          setIndustrialRestriction(parameters.industrial_restriction);
          matched = true;
        }
        
        if (matched) {
          setHudMessage("Executing: Simulation parameters updated");
        } else {
          setHudMessage("Executing: Parameter changes complete");
        }
      } else {
        setHudMessage(speech_response || "Command not understood.");
      }
      
    } catch (err) {
      console.error("Jarvis routing failed:", err);
      setErrorMessage("Assistant connection failed. Using offline parser.");
      
      // Local fallback in case server fails
      const text = command.toLowerCase();
      // City switch
      for (const c of ["delhi", "mumbai", "kolkata"]) {
        if (text.includes(c)) {
          setCity(c.charAt(0).toUpperCase() + c.slice(1));
          speakFeedback(`Switching to ${c}`);
          return;
        }
      }
      // Toggle overlays
      if (text.includes("wind")) {
        setShowWind(!showWind);
        speakFeedback("Toggling wind");
        return;
      }
      if (text.includes("satellite") || text.includes("no2")) {
        setShowSatellite(!showSatellite);
        speakFeedback("Toggling satellite");
        return;
      }
      if (text.includes("reports")) {
        setShowCitizenReports(!showCitizenReports);
        speakFeedback("Toggling reports");
        return;
      }
      // Ward focus
      for (const w of wards) {
        if (text.includes(w.name.toLowerCase())) {
          setSelectedWard(w);
          speakFeedback(`Focusing on ${w.name}`);
          return;
        }
      }
      speakFeedback("System command not recognized.");
    }
  }, [
    city,
    wards,
    showWind,
    showSatellite,
    showCitizenReports,
    setCity,
    setSelectedWard,
    setShowWind,
    setShowSatellite,
    setShowCitizenReports,
    onConveneCommittee,
    onTriggerVoiceBriefing,
    setTrafficReduction,
    setConstructionHalt,
    setIndustrialRestriction,
    speakFeedback
  ]);

  // Initialize Speech Recognition API
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage("Web Speech API not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-IN"; // Set to Indian English accent for better local name matches

    rec.onstart = () => {
      setIsListening(true);
      setTranscript("Listening...");
      setHudMessage("Speak now (e.g. 'Switch to Delhi', 'Focus on Belgachia')");
      setErrorMessage(null);

      // Auto-timeout after 7 seconds of inactivity to save battery/mic usage
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        rec.stop();
      }, 7000);
    };

    rec.onend = () => {
      setIsListening(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    rec.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      setIsListening(false);
      if (event.error === "not-allowed") {
        setErrorMessage("Microphone permission denied.");
      } else {
        setErrorMessage(`Error: ${event.error}`);
      }
    };

    rec.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      setTranscript(resultText);
      parseCommand(resultText);
    };

    recognitionRef.current = rec;

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [parseCommand]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="absolute top-14 left-3 z-[800] flex flex-col items-start gap-2 pointer-events-auto select-none">
      
      {/* Mic Trigger Button */}
      <button
        onClick={toggleListening}
        className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all shadow-lg ${
          isListening
            ? "bg-red-600 border-red-500 text-white animate-pulse shadow-red-600/20"
            : "bg-gray-950/90 border-white/10 text-orange-400 hover:text-orange-300 hover:bg-gray-900 cursor-pointer"
        }`}
        title={isListening ? "Listening... Click to stop" : "Activate voice assistant (Jarvis)"}
      >
        {isListening ? <Mic size={18} strokeWidth={2.5} /> : <MicOff size={18} />}
      </button>

      {/* Floating HUD transcript panel (only when text exists or listening) */}
      {(isListening || transcript || hudMessage || errorMessage) && (
        <div className="glass-card p-3 w-64 text-xs space-y-2 border border-white/5 shadow-2xl bg-slate-950/95 animate-slide-up rounded-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-1">
            <span className="text-[9px] font-black uppercase tracking-wider text-orange-500 flex items-center gap-1.5 animate-pulse">
              <Volume2 size={10} /> JARVIS PILOT ACTIVE
            </span>
            <span className="text-[8px] text-slate-500 font-mono">SPEECH-TO-TEXT</span>
          </div>

          {/* Speech transcript */}
          {transcript && (
            <p className="text-slate-300 font-medium italic text-[11px] leading-snug">
              &ldquo;{transcript}&rdquo;
            </p>
          )}

          {/* Assistant feedback messages */}
          {hudMessage && !errorMessage && (
            <p className="text-[10px] text-orange-400 font-semibold leading-normal">
              🤖 {hudMessage}
            </p>
          )}

          {/* Error notifications */}
          {errorMessage && (
            <p className="text-[10px] text-red-400 font-semibold">
              ⚠️ {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
