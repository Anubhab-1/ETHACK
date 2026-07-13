"use client";
/**
 * AETHER — Interactive Knowledge Graph
 * Custom HTML5 Canvas-based 2D force-directed layout.
 * Features drag-and-drop, node hover tooltips, and animated flow particles.
 * High-performance, zero dependencies, React 19/Next 16 safe.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface InteractiveKnowledgeGraphProps {
  wardId: number;
}

interface Node {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  emoji: string;
  props: Record<string, any>;
}

interface Edge {
  source: string;
  target: string;
  relation: string;
}

export function InteractiveKnowledgeGraph({ wardId }: InteractiveKnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[]; summary: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);

  // Simulation physics refs (to avoid React render cycle delays)
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const draggedNodeRef = useRef<Node | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Load knowledge graph data
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api
      .getWardKnowledgeGraph(wardId)
      .then((data) => {
        if (!active) return;
        setGraphData(data);

        // Map nodes to visual physics nodes
        const width = containerRef.current?.clientWidth || 600;
        const height = containerRef.current?.clientHeight || 450;

        const mappedNodes: Node[] = data.nodes.map((n: any, idx: number) => {
          // Determine size, color & icon based on node type
          let radius = 16;
          let color = "#3b82f6"; // default blue
          let emoji = "🌐";
          
          if (n.type === "Ward") {
            radius = 24;
            color = "#06b6d4"; // cyan
            emoji = "🏢";
          } else if (n.type === "Industry") {
            radius = 18;
            color = "#f97316"; // orange
            emoji = "🏭";
          } else if (n.type === "Stack") {
            radius = 12;
            color = "#d946ef"; // magenta
            emoji = "💨";
          } else if (n.type === "Violation") {
            radius = 14;
            color = "#ef4444"; // red
            emoji = "⚠️";
          } else if (n.type === "EnforcementAction") {
            radius = 16;
            color = "#eab308"; // yellow
            emoji = "⚖️";
          } else if (n.type === "Outcome") {
            radius = 15;
            color = "#10b981"; // emerald
            emoji = "✅";
          }

          // Initial positions arranged in a circle to avoid overlapping start
          const angle = (idx / data.nodes.length) * Math.PI * 2;
          const dist = 100 + Math.random() * 50;

          return {
            id: n.id,
            type: n.type,
            name: n.name || n.type,
            x: width / 2 + Math.cos(angle) * dist,
            y: height / 2 + Math.sin(angle) * dist,
            vx: 0,
            vy: 0,
            radius,
            color,
            emoji,
            props: n,
          };
        });

        nodesRef.current = mappedNodes;
        edgesRef.current = data.edges;
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load knowledge graph:", err);
        if (active) {
          setError("Failed to fetch graph data from AETHER server.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [wardId]);

  // Main Canvas & Simulation Loop
  useEffect(() => {
    if (loading || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    // Simulation parameters
    const repulsionConstant = 1200;
    const springConstant = 0.05;
    const desiredLength = 70;
    const gravityConstant = 0.04;
    const friction = 0.85;

    // Render loop
    const tick = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const width = canvas.width;
      const height = canvas.height;
      const center = { x: width / 2, y: height / 2 };

      // 1. Physics: Repulsion between all node pairs (Coulomb's Law fallback)
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
          
          if (dist < 300) {
            // Force strength is inversely proportional to distance
            const force = repulsionConstant / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            // Apply opposite forces
            if (n1 !== draggedNodeRef.current) {
              n1.vx -= fx;
              n1.vy -= fy;
            }
            if (n2 !== draggedNodeRef.current) {
              n2.vx += fx;
              n2.vy += fy;
            }
          }
        }
      }

      // 2. Physics: Springs between connected nodes (Hooke's Law)
      edges.forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1.0;
        
        // Spring force formula: F = k * (x - d)
        const displacement = dist - desiredLength;
        const force = springConstant * displacement;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (sourceNode !== draggedNodeRef.current) {
          sourceNode.vx += fx;
          sourceNode.vy += fy;
        }
        if (targetNode !== draggedNodeRef.current) {
          targetNode.vx -= fx;
          targetNode.vy -= fy;
        }
      });

      // 3. Physics: Central Gravity & Velocity Integration
      nodes.forEach((n) => {
        if (n === draggedNodeRef.current) return;

        // Pull towards center
        const dx = center.x - n.x;
        const dy = center.y - n.y;
        n.vx += dx * gravityConstant;
        n.vy += dy * gravityConstant;

        // Apply friction and update position
        n.vx *= friction;
        n.vy *= friction;
        n.x += n.vx;
        n.y += n.vy;

        // Keep inside bounds
        n.x = Math.max(n.radius, Math.min(width - n.radius, n.x));
        n.y = Math.max(n.radius, Math.min(height - n.radius, n.y));
      });

      // 4. Update dragged node position directly to mouse
      const draggedNode = draggedNodeRef.current;
      if (draggedNode) {
        draggedNode.x = mouseRef.current.x;
        draggedNode.y = mouseRef.current.y;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
      }

      // 5. Drawing: Clear screen
      ctx.clearRect(0, 0, width, height);

      // Draw subtle grid pattern background
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      const gridSize = 25;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 6. Drawing: Links (edges)
      edges.forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return;

        // Glow line path
        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);
        
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();

        // Draw animated flow particle dots along links
        const timeTick = (Date.now() / 1500) % 1.0;
        const particleX = sourceNode.x + (targetNode.x - sourceNode.x) * timeTick;
        const particleY = sourceNode.y + (targetNode.y - sourceNode.y) * timeTick;

        ctx.beginPath();
        ctx.arc(particleX, particleY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = sourceNode.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = sourceNode.color;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      });

      // 7. Drawing: Nodes
      nodes.forEach((n) => {
        const isHovered = hoveredNode?.id === n.id;

        // Glowing outer aura
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + (isHovered ? 4 : 2), 0, Math.PI * 2);
        ctx.fillStyle = `${n.color}22`; // transparent glow
        ctx.fill();

        // Node center
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#0f172a"; // dark background
        ctx.strokeStyle = n.color;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke();
        ctx.fill();

        // Emoji Icon
        ctx.font = `${n.radius * 1.1}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.emoji, n.x, n.y);

        // Labels
        ctx.font = "bold 9px sans-serif";
        ctx.fillStyle = isHovered ? "#ffffff" : "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText(n.name.length > 12 ? `${n.name.slice(0, 10)}..` : n.name, n.x, n.y + n.radius + 12);
      });

      animationId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [loading, hoveredNode]);

  // Handle container resizing to fit canvas
  useEffect(() => {
    if (loading) return;
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      canvasRef.current.width = containerRef.current.clientWidth;
      canvasRef.current.height = containerRef.current.clientHeight;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [loading]);

  // Mouse / Touch Handlers for Drag & Hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    mouseRef.current = { x: mouseX, y: mouseY };

    // Update hovered node
    const nodes = nodesRef.current;
    let foundHover = null;

    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - mouseX;
      const dy = n.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < n.radius + 5) {
        foundHover = n;
        break;
      }
    }
    setHoveredNode(foundHover);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - mouseX;
      const dy = n.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < n.radius + 8) {
        draggedNodeRef.current = n;
        break;
      }
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    draggedNodeRef.current = null;
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] gap-2 text-slate-400 text-xs">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p>Parsing structural relationships...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[350px] text-red-400 text-xs font-semibold">
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-[420px] bg-slate-950 border border-slate-900 rounded-xl overflow-hidden relative" ref={containerRef}>
      
      {/* ── Canvas Visualizer ── */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex-1 cursor-grab active:cursor-grabbing h-full"
      />

      {/* ── Right HUD Sidebar Overlay ── */}
      <div className="w-full md:w-60 bg-slate-900/60 border-t md:border-t-0 md:border-l border-slate-800 p-4 flex flex-col gap-3.5 z-10 select-none overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">Knowledge HUD</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold">NetworkX</span>
        </div>

        {/* Hover detail box */}
        {!hoveredNode ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-[10px] text-slate-500 border border-dashed border-slate-800 rounded-xl">
            <span className="text-xl mb-1.5">🖱️</span>
            Hover over any node in the graph to inspect structural properties.
          </div>
        ) : (
          <div className="flex-1 space-y-3 text-xs animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xl">{hoveredNode.emoji}</span>
              <div>
                <h4 className="font-bold text-slate-200 leading-tight">{hoveredNode.name}</h4>
                <span className="text-[9px] text-slate-500 font-semibold uppercase">{hoveredNode.type}</span>
              </div>
            </div>

            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800 text-[10px] space-y-1.5 font-mono">
              {hoveredNode.type === "Ward" && (
                <>
                  <p><span className="text-slate-500">CITY:</span> {hoveredNode.props.city}</p>
                  <p><span className="text-slate-500">NO:</span> {hoveredNode.props.ward_no}</p>
                  <p><span className="text-slate-500">AQI:</span> {hoveredNode.props.aqi_current}</p>
                  <p><span className="text-slate-500">RISK:</span> {hoveredNode.props.risk_score}</p>
                </>
              )}
              {hoveredNode.type === "Industry" && (
                <>
                  <p><span className="text-slate-500">TYPE:</span> {hoveredNode.props.type}</p>
                  <p><span className="text-slate-500">RISK INDEX:</span> {hoveredNode.props.risk_score}</p>
                  <p><span className="text-slate-500">PERMIT:</span> <span className={hoveredNode.props.permit_valid ? "text-emerald-400" : "text-red-400"}>{hoveredNode.props.permit_valid ? "VALID" : "EXPIRED"}</span></p>
                  <p><span className="text-slate-500">VIOLATIONS:</span> {hoveredNode.props.violation_count}</p>
                </>
              )}
              {hoveredNode.type === "Stack" && (
                <>
                  <p><span className="text-slate-500">HEIGHT:</span> {hoveredNode.props.height}m</p>
                  <p><span className="text-slate-500">DIAMETER:</span> {hoveredNode.props.diameter}m</p>
                  <p><span className="text-slate-500">PM2.5:</span> {hoveredNode.props.pm25_mg_nm3} mg/Nm³</p>
                  <p><span className="text-slate-500">CEMS STATUS:</span> <span className={hoveredNode.props.cems_active ? "text-emerald-400" : "text-red-400"}>{hoveredNode.props.cems_active ? "ONLINE" : "OFFLINE"}</span></p>
                </>
              )}
              {hoveredNode.type === "Violation" && (
                <>
                  <p><span className="text-slate-500">POLLUTANT:</span> {hoveredNode.props.pollutant}</p>
                  <p><span className="text-slate-500">MEASURED:</span> {hoveredNode.props.measured_value} ug/m³</p>
                  <p><span className="text-slate-500">LIMIT:</span> {hoveredNode.props.regulatory_limit} ug/m³</p>
                  <p className="text-orange-400 mt-1 whitespace-pre-wrap leading-normal font-sans">Warning threshold violated by {(hoveredNode.props.measured_value - hoveredNode.props.regulatory_limit).toFixed(1)} units.</p>
                </>
              )}
              {hoveredNode.type === "EnforcementAction" && (
                <>
                  <p><span className="text-slate-500">ACTION:</span> {hoveredNode.props.action_type}</p>
                  <p><span className="text-slate-500">SEVERITY:</span> {hoveredNode.props.severity}</p>
                  <p><span className="text-slate-500">AUTHORITY:</span> {hoveredNode.props.enforcing_authority}</p>
                </>
              )}
              {hoveredNode.type === "Outcome" && (
                <>
                  <p><span className="text-slate-500">EFFECT:</span> {hoveredNode.props.aqi_drop_effect}</p>
                  <p><span className="text-slate-500">P-VALUE:</span> {hoveredNode.props.causal_p_value}</p>
                  <p><span className="text-slate-500">SAVINGS:</span> ₹ {hoveredNode.props.health_savings_lakhs} Lakhs</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Stats footer summary */}
        {graphData?.summary && (
          <div className="border-t border-slate-800 pt-3 text-[10px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Total Wards:</span>
              <span className="font-bold text-slate-300">1</span>
            </div>
            <div className="flex justify-between">
              <span>Monitored Industries:</span>
              <span className="font-bold text-slate-300">{graphData.summary.total_industries}</span>
            </div>
            <div className="flex justify-between">
              <span>Known Violations:</span>
              <span className="font-bold text-red-400">{graphData.summary.total_violations}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
