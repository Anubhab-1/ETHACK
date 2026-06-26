"use client";
/**
 * AETHER — Municipal Consensus Committee Room
 * Displays a sequential multi-agent debate simulation and prints the executive decree.
 */

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface AgentCommitteeModalProps {
  isOpen: boolean;
  onClose: () => void;
  wardId: number;
  wardName: string;
  city: string;
}

interface DialogueTurn {
  agent: string;
  message: string;
  avatar: string;
}

const CITY_AUTHORITIES: Record<string, string> = {
  Kolkata: "West Bengal Municipal Development Authority",
  Delhi: "Delhi Municipal Corporation (MCD)",
  Mumbai: "Brihanmumbai Municipal Corporation (BMC)",
};

const CITY_SIGNATURES: Record<string, { health: string; traffic: string; industrial: string; commissioner: string }> = {
  Kolkata: {
    health: "Dr. S. Roy",
    traffic: "Inspector A. Sen",
    industrial: "Engr. M. Das",
    commissioner: "Municipal Commissioner",
  },
  Delhi: {
    health: "Dr. A. Sharma",
    traffic: "Inspector R. Singh",
    industrial: "Engr. V. Gupta",
    commissioner: "MCD Commissioner",
  },
  Mumbai: {
    health: "Dr. P. Patil",
    traffic: "Inspector S. Kadam",
    industrial: "Engr. N. Mehta",
    commissioner: "BMC Commissioner",
  },
};

export function AgentCommitteeModal({ isOpen, onClose, wardId, wardName, city }: AgentCommitteeModalProps) {
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customObjective, setCustomObjective] = useState("");
  const [dialogue, setDialogue] = useState<DialogueTurn[]>([]);
  const [visibleTurns, setVisibleTurns] = useState<DialogueTurn[]>([]);
  const [decree, setDecree] = useState("");
  const [typingIndex, setTypingIndex] = useState(-1);
  const [typingAgent, setTypingAgent] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Reset states on open/close
  useEffect(() => {
    if (!isOpen) return;
    setDialogue([]);
    setVisibleTurns([]);
    setDecree("");
    setTypingIndex(-1);
    setTypingAgent(null);
    setHasStarted(false);
    setLoading(false);
  }, [isOpen]);

  const handleStartSimulation = async () => {
    setHasStarted(true);
    setLoading(true);
    setDialogue([]);
    setVisibleTurns([]);
    setDecree("");
    setTypingIndex(-1);
    setTypingAgent(null);

    try {
      const res = await api.agentsSimulation(wardId, customObjective.trim() || undefined);
      setDialogue(res.dialogue);
      setDecree(res.decree);
      setTypingIndex(0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Handle typing sequence
  useEffect(() => {
    if (typingIndex === -1 || typingIndex >= dialogue.length) {
      setTypingAgent(null);
      return;
    }

    const currentTurn = dialogue[typingIndex];
    setTypingAgent(currentTurn.agent);

    // Simulate typing delay before displaying bubble
    const delay = setTimeout(() => {
      setVisibleTurns((prev) => [...prev, currentTurn]);
      setTypingIndex((prev) => prev + 1);
    }, 1800);

    return () => clearTimeout(delay);
  }, [typingIndex, dialogue]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleTurns, typingAgent]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const documentId = `DIR-AETHER-2026-${Math.floor(Math.random() * 90000) + 10000}`;
    const cleanDecree = decree
      .replace(/\n/g, "<br>")
      .replace(/### (.*)/g, "<h3 style='font-size:14px; margin-top:15px; border-bottom:1px solid #333; padding-bottom:3px;'>$1</h3>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    const authority = CITY_AUTHORITIES[city] || CITY_AUTHORITIES.Kolkata;
    const sigs = CITY_SIGNATURES[city] || CITY_SIGNATURES.Kolkata;

    printWindow.document.write(`
      <html>
        <head>
          <title>Official Dispatch Order - ${wardName}</title>
          <style>
            body { font-family: "Courier New", Courier, monospace; padding: 30px; color: #111; line-height: 1.5; background: #fff; }
            .border-box { border: 4px double #333; padding: 25px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { font-size: 18px; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
            .header h2 { font-size: 12px; margin: 5px 0 0 0; font-weight: normal; color: #555; text-transform: uppercase; }
            .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
            .metadata-table td { padding: 4px 8px; border: 1px solid #ddd; }
            .metadata-table td.label { font-weight: bold; background: #f2f2f2; width: 25%; }
            .decree-title { text-align: center; font-weight: bold; font-size: 13px; margin: 20px 0 10px 0; text-transform: uppercase; text-decoration: underline; }
            .decree-content { font-size: 11px; margin-bottom: 30px; }
            .checklist-title { font-weight: bold; font-size: 12px; margin: 15px 0 5px 0; text-transform: uppercase; border-bottom: 1px solid #333; width: fit-content; }
            .checklist-item { font-size: 11px; margin: 5px 0; }
            .signatures-grid { display: flex; justify-content: space-between; margin-top: 50px; font-size: 10px; }
            .signature-box { text-align: center; width: 22%; border-top: 1px dashed #333; padding-top: 6px; }
            .stamp-box { border: 2px solid #ef4444; color: #ef4444; font-weight: bold; text-transform: uppercase; padding: 6px 12px; font-size: 10px; transform: rotate(-3deg); display: inline-block; margin-top: 15px; opacity: 0.85; font-family: Arial, sans-serif; }
            .qr-box-container { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; }
            .qr-mock { width: 55px; height: 55px; border: 2px solid #333; padding: 2px; display: flex; flex-wrap: wrap; justify-content: space-between; align-content: space-between; }
            .qr-pixel { width: 15px; height: 15px; background: #333; }
            .footer-note { font-size: 8px; color: #777; text-align: center; margin-top: 25px; border-top: 1px solid #ddd; padding-top: 8px; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="border-box">
            <div class="header">
              <h1>${authority}</h1>
              <h2>AETHER Spatial AI Command Center &middot; Official Tactical Order</h2>
            </div>
            
            <table class="metadata-table">
              <tr>
                <td class="label">Directive ID</td>
                <td><strong>${documentId}</strong></td>
                <td class="label">Date / Time</td>
                <td>${new Date().toLocaleString("en-IN")}</td>
              </tr>
              <tr>
                <td class="label">Target Location</td>
                <td><strong>${wardName} (Ward Centroid)</strong></td>
                <td class="label">Enforcement Status</td>
                <td>Critical Intervention Required</td>
              </tr>
              ${customObjective ? `<tr><td class="label">Special Mandate</td><td colspan="3"><strong>${customObjective}</strong></td></tr>` : ""}
            </table>

            <div class="decree-title">Municipal Interventions & Enforcement Directives</div>
            <div class="decree-content">
              ${cleanDecree}
            </div>

            <div class="checklist-title">Verification Checklist for Field Inspectors</div>
            <div class="checklist-item">[ ] Coordinate with Traffic Control for heavy vehicle routing barricades.</div>
            <div class="checklist-item">[ ] Deliver physical Stop-Work alerts to active building and infrastructure construction sites.</div>
            <div class="checklist-item">[ ] Direct regional dispatch vehicles for high-volume water mist sprinkling.</div>
            <div class="checklist-item">[ ] Deliver health advice sheets and safety masks to regional school administrators.</div>

            <div class="qr-box-container">
              <div>
                <div class="stamp-box">
                  COMMISSIONER APPROVED<br/>AETHER SYSTEM VERIFIED
                </div>
              </div>
              <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end;">
                <div class="qr-mock">
                  <div class="qr-pixel"></div>
                  <div class="qr-pixel" style="background:transparent"></div>
                  <div class="qr-pixel"></div>
                  <div class="qr-pixel" style="background:transparent"></div>
                  <div class="qr-pixel" style="width:15px; height:15px; background:#333"></div>
                  <div class="qr-pixel" style="background:transparent"></div>
                  <div class="qr-pixel"></div>
                  <div class="qr-pixel" style="background:transparent"></div>
                  <div class="qr-pixel"></div>
                </div>
                <span style="font-size: 7px; color: #555; margin-top: 4px; font-family:Arial, sans-serif;">Scan to verify on State Portal</span>
              </div>
            </div>

            <div class="signatures-grid">
              <div class="signature-box"><br/>${sigs.health}<br/><strong>Citizen Health</strong></div>
              <div class="signature-box"><br/>${sigs.traffic}<br/><strong>Traffic Control</strong></div>
              <div class="signature-box"><br/>${sigs.industrial}<br/><strong>Industrial Compliance</strong></div>
              <div class="signature-box"><br/>${sigs.commissioner}</div>
            </div>

            <div class="footer-note">
              This is an autonomously generated spatial enforcement dispatch order created by AETHER Smart City Intelligence.
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const debateComplete = typingIndex >= dialogue.length && dialogue.length > 0;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-5xl h-[80vh] flex flex-col bg-gray-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-scale-in">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="text-orange-500 font-bold">⬡</span>
            <h2 className="font-bold text-gray-200">Municipal AI Committee Room</h2>
            <span className="text-gray-500 text-xs font-mono">· Ward: {wardName}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors text-sm cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Pane: Setup or Agent Dialogues */}
          <div className="flex-1 flex flex-col bg-gray-950 p-6 overflow-y-auto border-r border-white/5">
            {!hasStarted ? (
              <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full space-y-6 animate-slide-up">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 text-2xl mx-auto mb-2">
                    📜
                  </div>
                  <h3 className="font-bold text-lg text-gray-100">Set Chamber Tactical Agenda</h3>
                  <p className="text-xs text-gray-500">
                    Formulate a custom priority. The municipal directors will debate actions and coordinate the final decree to target this objective.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block">
                    Custom Intervention Objective (Optional)
                  </label>
                  <textarea
                    value={customObjective}
                    onChange={(e) => setCustomObjective(e.target.value)}
                    placeholder="e.g. Minimize particulate exposure near hospitals during high winds, or enforce strict odd-even lane restrictions around educational sectors..."
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-800 focus:border-orange-500 rounded-xl p-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none transition-colors resize-none"
                  />
                </div>

                <button
                  onClick={handleStartSimulation}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-500/20 border border-orange-400/30 transition-all cursor-pointer text-center"
                >
                  Convene Committee Chamber
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Committee Debate Logs</h3>
                  {customObjective && (
                    <span className="text-[9px] bg-orange-500/10 border border-orange-500/25 text-orange-400 font-bold px-2 py-0.5 rounded">
                      Special Agenda Active
                    </span>
                  )}
                </div>
                
                {loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-gray-400">Convening municipal directors...</p>
                  </div>
                ) : (
                  <div className="flex-1 space-y-4">
                    {visibleTurns.map((turn, i) => (
                      <div key={i} className="flex gap-3 items-start animate-slide-up">
                        <div className="w-9 h-9 rounded-xl bg-gray-900 border border-white/10 flex items-center justify-center text-lg flex-none shadow-md">
                          {turn.avatar}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-orange-400">{turn.agent}</p>
                          <div className="glass-card px-4 py-2.5 rounded-xl rounded-tl-none text-xs text-gray-200 leading-relaxed shadow-sm">
                            {turn.message}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Typing Indicator */}
                    {typingAgent && (
                      <div className="flex gap-3 items-start animate-pulse">
                        <div className="w-9 h-9 rounded-xl bg-gray-900 border border-white/5 flex items-center justify-center text-sm flex-none">
                          💬
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-gray-500">{typingAgent} is presenting...</p>
                          <div className="glass-card px-4 py-2.5 rounded-xl rounded-tl-none flex gap-1 items-center h-8">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={chatEndRef} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Pane: Executed Decree */}
          <div className="w-96 xl:w-[420px] flex flex-col bg-gray-900/50 p-6 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Strategic Resolution</h3>

            {!debateComplete ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-600 text-xs px-6">
                <span className="text-3xl mb-2">📜</span>
                <p>Waiting for the municipal committee to reach a consensus and draft the decree...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col justify-between gap-4 animate-slide-up">
                <div className="glass-card p-5 border border-orange-500/20 text-xs leading-relaxed text-gray-300 font-mono whitespace-pre-wrap flex-1 shadow-md bg-orange-500/[0.02]">
                  {decree}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-orange-500/20 transition-all border border-orange-400/20 cursor-pointer"
                  >
                    🖨️ Print Dispatch Order
                  </button>
                  <button
                    onClick={() => setHasStarted(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg border border-gray-700 transition-colors cursor-pointer"
                  >
                    Re-Agenda
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
