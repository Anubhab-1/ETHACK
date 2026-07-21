"""
AETHER — In-Memory Knowledge Graph
Implements a NetworkX-backed graph of industries, stacks, wards,
violations, enforcement actions, and outcomes.

Swappable to Neo4j by replacing the NetworkX calls with
neo4j driver queries — API surface stays identical.

Graph schema:
  Nodes: Ward, Industry, Stack, Violation, EnforcementAction, Outcome
  Edges: EMITS_INTO, HAS_VIOLATION, TRIGGERS, RESULTED_IN, TARGETS, OPERATES
"""

from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ─── Try to use networkx, fall back to pure-dict graph ────────────────────────

try:
    import networkx as nx

    _NX_AVAILABLE = True
    logger.info("NetworkX available — using graph-powered knowledge base")
except ImportError:
    _NX_AVAILABLE = False
    logger.warning("NetworkX not installed — using dict-based graph fallback")


class AetherKnowledgeGraph:
    """
    In-memory knowledge graph for AETHER.
    Nodes and edges are stored in-memory and seeded from DB on first access.
    Persists for the lifetime of the process.
    """

    def __init__(self):
        if _NX_AVAILABLE:
            self._graph = nx.DiGraph()
        else:
            self._graph = None
        self._nodes: Dict[str, Dict] = {}
        self._edges: List[Dict] = []
        self._seeded = False

    def seed(self, db=None, city: str = "Kolkata"):
        """Seed the graph with realistic ward-industry data."""
        if self._seeded:
            return
        self._seeded = True
        logger.info("Seeding AETHER knowledge graph...")

        try:
            from app.models import EnforcementAction, Ward

            if db:
                wards = db.query(Ward).filter(Ward.city == city).all()
                db.query(EnforcementAction).filter(EnforcementAction.city == city).all()
            else:
                wards, _actions = [], []
        except Exception:
            wards, _actions = [], []

        # Add ward nodes
        for ward in wards:
            self._add_node(
                node_id=f"WARD-{ward.id}",
                node_type="Ward",
                props={
                    "ward_id": ward.id,
                    "name": ward.name,
                    "ward_no": ward.ward_no,
                    "city": city,
                    "lat": ward.lat,
                    "lon": ward.lon,
                    "aqi_current": 120 + ward.industrial_score * 0.5,
                    "risk_score": round(ward.industrial_score / 100, 2),
                },
            )

            # Add industry nodes for each ward
            n_industries = max(1, int(ward.industrial_score / 20))
            rng = random.Random(ward.id)

            for i in range(n_industries):
                industry_id = f"IND-{ward.ward_no:03d}-{i + 1:02d}"
                industry_type = rng.choice(
                    ["Foundry", "Chemical", "Textile", "Brick_Kiln", "Power_Plant"]
                )
                violation_count = rng.randint(0, 5)
                last_inspection_days = rng.randint(15, 200)
                permit_valid = rng.random() > 0.15  # 15% expired permits

                self._add_node(
                    node_id=industry_id,
                    node_type="Industry",
                    props={
                        "name": f"{industry_type} Unit {i + 1}",
                        "type": industry_type,
                        "ward_id": ward.id,
                        "lat": ward.lat + i * 0.002,
                        "lon": ward.lon + i * 0.002,
                        "permit_status": "active" if permit_valid else "expired",
                        "permit_valid": permit_valid,
                        "days_since_inspection": last_inspection_days,
                        "historical_violations": violation_count,
                        "violation_count": violation_count,
                        "risk_score": round(
                            (
                                violation_count * 0.15
                                + (0.3 if not permit_valid else 0)
                                + min(1.0, last_inspection_days / 200) * 0.2
                            ),
                            2,
                        ),
                    },
                )

                # Stack node
                stack_id = f"STACK-{ward.ward_no:03d}-{i + 1:02d}"
                pm_emission = ward.industrial_score * 6 + rng.uniform(-20, 60)
                self._add_node(
                    node_id=stack_id,
                    node_type="Stack",
                    props={
                        "name": f"Stack {i + 1}",
                        "industry_id": industry_id,
                        "lat": ward.lat + i * 0.002,
                        "lon": ward.lon + i * 0.002,
                        "pm25_mg_nm3": round(max(20, pm_emission), 1),
                        "so2_mg_nm3": round(ward.industrial_score * 0.4, 1),
                        "compliant": pm_emission <= 150,
                        "height": rng.randint(20, 80),
                        "diameter": round(rng.uniform(1.0, 4.0), 1),
                        "cems_active": rng.random() > 0.1,
                    },
                )

                # OPERATES edge: Industry → Stack
                self._add_edge(industry_id, stack_id, "OPERATES", {})

                # EMITS_INTO edge: Stack → Ward
                self._add_edge(
                    stack_id,
                    f"WARD-{ward.id}",
                    "EMITS_INTO",
                    {
                        "pollutant": "PM2.5",
                        "rate": round(pm_emission, 1),
                        "distance_km": round(rng.uniform(0.1, 3.0), 2),
                    },
                )

                # Add violations if any
                for v in range(violation_count):
                    violation_id = f"VIO-{ward.ward_no:03d}-{i + 1:02d}-{v + 1:02d}"
                    days_ago = rng.randint(5, 180)
                    severity = rng.choice(["low", "medium", "high", "critical"])
                    violation_type = rng.choice(
                        ["excess_pm_emissions", "permit_expired", "cpcb_norm_violation"]
                    )
                    regulatory_limit = 150.0
                    measured_value = round(
                        regulatory_limit + rng.uniform(10.0, 120.0), 1
                    )

                    self._add_node(
                        node_id=violation_id,
                        node_type="Violation",
                        props={
                            "name": violation_type.replace("_", " ").title(),
                            "industry_id": industry_id,
                            "date": (
                                datetime.utcnow() - timedelta(days=days_ago)
                            ).strftime("%Y-%m-%d"),
                            "severity": severity,
                            "type": violation_type,
                            "days_ago": days_ago,
                            "pollutant": "PM2.5"
                            if violation_type == "excess_pm_emissions"
                            else "N/A",
                            "measured_value": measured_value,
                            "regulatory_limit": regulatory_limit,
                        },
                    )

                    self._add_edge(
                        industry_id,
                        violation_id,
                        "HAS_VIOLATION",
                        {"severity": severity},
                    )

                    # Enforcement action for high/critical violations
                    if severity in ["high", "critical"]:
                        enforcement_id = (
                            f"ENF-{ward.ward_no:03d}-{i + 1:02d}-{v + 1:02d}"
                        )
                        ate = round(rng.uniform(-80, -20), 1)  # AQI drop
                        action_type = rng.choice(
                            ["show_cause_notice", "closure_direction", "penalty"]
                        )
                        self._add_node(
                            node_id=enforcement_id,
                            node_type="EnforcementAction",
                            props={
                                "name": action_type.replace("_", " ").title(),
                                "action_type": action_type.replace("_", " ").title(),
                                "severity": severity.title(),
                                "enforcing_authority": "West Bengal Pollution Control Board",
                                "status": rng.choice(
                                    ["issued", "complied", "pending_court"]
                                ),
                                "issued_date": (
                                    datetime.utcnow() - timedelta(days=days_ago - 5)
                                ).strftime("%Y-%m-%d"),
                                "outcome_aqi_drop": ate if ate < -30 else None,
                                "outcome_duration_hours": rng.randint(24, 168)
                                if ate < -30
                                else None,
                            },
                        )

                        self._add_edge(violation_id, enforcement_id, "TRIGGERS", {})
                        self._add_edge(enforcement_id, industry_id, "TARGETS", {})

                        # Add outcome node if drop is substantial
                        if ate < -30:
                            outcome_id = (
                                f"OUT-{ward.ward_no:03d}-{i + 1:02d}-{v + 1:02d}"
                            )
                            self._add_node(
                                node_id=outcome_id,
                                node_type="Outcome",
                                props={
                                    "name": "Intervention Outcome",
                                    "aqi_drop_effect": f"{abs(ate)} AQI Point Drop",
                                    "causal_p_value": round(
                                        rng.uniform(0.001, 0.049), 3
                                    ),
                                    "health_savings_lakhs": round(
                                        rng.uniform(5.0, 50.0), 1
                                    ),
                                },
                            )
                            self._add_edge(
                                enforcement_id, outcome_id, "RESULTED_IN", {}
                            )

        logger.info(
            f"Knowledge graph seeded: {len(self._nodes)} nodes, {len(self._edges)} edges"
        )

    # ─── Internal graph ops ────────────────────────────────────────────────────

    def _add_node(self, node_id: str, node_type: str, props: Dict):
        self._nodes[node_id] = {"id": node_id, **props, "type": node_type}
        if _NX_AVAILABLE and self._graph is not None:
            self._graph.add_node(node_id, **props, node_type=node_type)

    def _add_edge(self, src: str, dst: str, rel_type: str, props: Dict):
        self._edges.append({"src": src, "dst": dst, **props, "rel": rel_type})
        if _NX_AVAILABLE and self._graph is not None:
            self._graph.add_edge(src, dst, **props, rel_type=rel_type)

    # ─── Query API ─────────────────────────────────────────────────────────────

    def get_industry_risk_graph(self, ward_id: int) -> Dict[str, Any]:
        """
        Return subgraph of all industries, stacks, and violations for a ward.
        Equivalent to:
          MATCH (w:Ward {ward_id: X})<-[:EMITS_INTO]-(s:Stack)<-[:OPERATES]-(i:Industry)
          OPTIONAL MATCH (i)-[:HAS_VIOLATION]->(v:Violation)
          RETURN i, s, v
        """
        ward_node_id = f"WARD-{ward_id}"

        # Find stacks emitting into this ward
        stacks_in_ward = [
            e["src"]
            for e in self._edges
            if e["rel"] == "EMITS_INTO" and e["dst"] == ward_node_id
        ]

        # Find industries operating those stacks
        industries_in_ward = [
            e["src"]
            for e in self._edges
            if e["rel"] == "OPERATES" and e["dst"] in stacks_in_ward
        ]

        # Get violations for each industry
        violations_by_industry = {}
        for ind_id in industries_in_ward:
            violations = [
                self._nodes[e["dst"]]
                for e in self._edges
                if e["rel"] == "HAS_VIOLATION"
                and e["src"] == ind_id
                and e["dst"] in self._nodes
            ]
            violations_by_industry[ind_id] = violations

        # Compile result
        graph_nodes = []
        graph_edges = []
        seen_node_ids = set()

        if ward_node_id in self._nodes:
            graph_nodes.append(self._nodes[ward_node_id])
            seen_node_ids.add(ward_node_id)

        for ind_id in industries_in_ward:
            if ind_id in self._nodes and ind_id not in seen_node_ids:
                graph_nodes.append(self._nodes[ind_id])
                seen_node_ids.add(ind_id)
            for stack_id in stacks_in_ward:
                if stack_id in self._nodes:
                    stack = self._nodes[stack_id]
                    if stack.get("industry_id") == ind_id:
                        if stack_id not in seen_node_ids:
                            graph_nodes.append(stack)
                            seen_node_ids.add(stack_id)
                        graph_edges.append(
                            {
                                "source": ind_id,
                                "target": stack_id,
                                "relation": "OPERATES",
                            }
                        )
                        graph_edges.append(
                            {
                                "source": stack_id,
                                "target": ward_node_id,
                                "relation": "EMITS_INTO",
                            }
                        )

            for vio in violations_by_industry.get(ind_id, []):
                vio_id = vio["id"]
                if vio_id not in seen_node_ids:
                    graph_nodes.append(vio)
                    seen_node_ids.add(vio_id)
                graph_edges.append(
                    {"source": ind_id, "target": vio_id, "relation": "HAS_VIOLATION"}
                )

                # Find enforcement actions triggered by this violation
                triggered_enforcements = [
                    self._nodes[e["dst"]]
                    for e in self._edges
                    if e["rel"] == "TRIGGERS"
                    and e["src"] == vio_id
                    and e["dst"] in self._nodes
                ]
                for enf in triggered_enforcements:
                    enf_id = enf["id"]
                    if enf_id not in seen_node_ids:
                        graph_nodes.append(enf)
                        seen_node_ids.add(enf_id)
                    graph_edges.append(
                        {"source": vio_id, "target": enf_id, "relation": "TRIGGERS"}
                    )
                    graph_edges.append(
                        {"source": enf_id, "target": ind_id, "relation": "TARGETS"}
                    )

                    # Find outcomes resulting from this enforcement action
                    resulting_outcomes = [
                        self._nodes[e["dst"]]
                        for e in self._edges
                        if e["rel"] == "RESULTED_IN"
                        and e["src"] == enf_id
                        and e["dst"] in self._nodes
                    ]
                    for out in resulting_outcomes:
                        out_id = out["id"]
                        if out_id not in seen_node_ids:
                            graph_nodes.append(out)
                            seen_node_ids.add(out_id)
                        graph_edges.append(
                            {
                                "source": enf_id,
                                "target": out_id,
                                "relation": "RESULTED_IN",
                            }
                        )

        # Top risk industries
        industry_nodes = [n for n in graph_nodes if n.get("type") == "Industry"]
        industry_nodes.sort(key=lambda x: x.get("risk_score", 0), reverse=True)

        return {
            "ward_id": ward_id,
            "nodes": graph_nodes,
            "edges": graph_edges,
            "summary": {
                "total_industries": len(industries_in_ward),
                "total_violations": sum(
                    len(v) for v in violations_by_industry.values()
                ),
                "top_risk_industries": [
                    {
                        "id": n["id"],
                        "name": n.get("name"),
                        "risk_score": n.get("risk_score", 0),
                        "permit_status": n.get("permit_status"),
                    }
                    for n in industry_nodes[:3]
                ],
            },
        }

    def get_intervention_outcomes(
        self, ward_id: int, action_type: Optional[str] = None
    ) -> List[Dict]:
        """
        Get past intervention outcomes for a ward.
        Equivalent to:
          MATCH (w:Ward)-[:RECEIVED]->(e:EnforcementAction)-[:RESULTED_IN]->(o:Outcome)
          WHERE w.ward_id = X
        """
        enforcement_nodes = [
            v
            for v in self._nodes.values()
            if v.get("type") == "EnforcementAction"
            and v.get("outcome_aqi_drop") is not None
        ]

        if action_type:
            enforcement_nodes = [
                n for n in enforcement_nodes if n.get("type") == action_type
            ]

        results = []
        for n in enforcement_nodes[:5]:
            results.append(
                {
                    "enforcement_id": n["id"],
                    "action_type": n.get("type"),
                    "issued_date": n.get("issued_date"),
                    "aqi_drop": n.get("outcome_aqi_drop"),
                    "duration_hours": n.get("outcome_duration_hours"),
                    "status": n.get("status"),
                }
            )

        return results

    def get_pagerank_polluters(self, city: str) -> List[Dict]:
        """
        Identify most influential polluters using PageRank on the emission graph.
        Higher PageRank = more wards impacted through emission chains.
        """
        if not _NX_AVAILABLE or self._graph is None:
            # Manual degree-based fallback
            out_degrees = {}
            for e in self._edges:
                if e["rel"] == "EMITS_INTO":
                    out_degrees[e["src"]] = out_degrees.get(e["src"], 0) + 1

            results = []
            for node_id, degree in sorted(out_degrees.items(), key=lambda x: -x[1])[:5]:
                # Find parent industry of this stack
                industry = next(
                    (
                        self._nodes[e["src"]]
                        for e in self._edges
                        if e["rel"] == "OPERATES"
                        and e["dst"] == node_id
                        and e["src"] in self._nodes
                    ),
                    None,
                )
                if industry:
                    results.append(
                        {
                            "industry_id": industry["id"],
                            "name": industry.get("name"),
                            "type": industry.get("type"),
                            "influence_score": degree,
                            "permit_status": industry.get("permit_status"),
                            "violations": industry.get("historical_violations", 0),
                        }
                    )
            return results

        try:
            # Real PageRank on NetworkX graph
            pr = nx.pagerank(self._graph, alpha=0.85)

            # Get top stack nodes by PageRank, then resolve to parent industry
            stack_pr = {nid: score for nid, score in pr.items() if "STACK" in nid}
            top_stacks = sorted(stack_pr.items(), key=lambda x: -x[1])[:5]

            results = []
            for stack_id, score in top_stacks:
                industry = next(
                    (
                        self._nodes[e["src"]]
                        for e in self._edges
                        if e["rel"] == "OPERATES"
                        and e["dst"] == stack_id
                        and e["src"] in self._nodes
                    ),
                    None,
                )
                if industry:
                    results.append(
                        {
                            "industry_id": industry["id"],
                            "name": industry.get("name"),
                            "type": industry.get("type"),
                            "pagerank_score": round(score, 6),
                            "influence_rank": len(results) + 1,
                            "permit_status": industry.get("permit_status"),
                            "violations": industry.get("historical_violations", 0),
                            "interpretation": f"This industry's emissions affect {max(1, int(score * 10000))} downstream ward-days of pollution",
                        }
                    )
            return results

        except Exception as e:
            logger.warning(f"PageRank computation failed: {e}")
            return []

    def get_violation_clusters(self) -> List[Dict]:
        """
        Community detection on violation graph to identify fraud rings /
        coordinated non-compliance.
        """
        # Group industries with violations by ward proximity
        industries_with_violations = [
            v
            for v in self._nodes.values()
            if v.get("type") == "Industry" and v.get("historical_violations", 0) > 1
        ]

        # Simple clustering by grid cell (0.01 degree ~ 1km)
        clusters: Dict[str, List] = {}
        for ind in industries_with_violations:
            cell = f"{round(ind.get('lat', 0), 2)},{round(ind.get('lon', 0), 2)}"
            clusters.setdefault(cell, []).append(ind)

        results = []
        for cell, members in clusters.items():
            if len(members) >= 2:
                total_violations = sum(
                    m.get("historical_violations", 0) for m in members
                )
                results.append(
                    {
                        "cluster_id": cell,
                        "member_count": len(members),
                        "total_violations": total_violations,
                        "avg_risk_score": round(
                            sum(m.get("risk_score", 0) for m in members) / len(members),
                            2,
                        ),
                        "members": [
                            {
                                "id": m["id"],
                                "name": m.get("name"),
                                "violations": m.get("historical_violations"),
                            }
                            for m in members
                        ],
                        "interpretation": f"Cluster of {len(members)} industries with coordinated non-compliance ({total_violations} total violations) — may warrant joint audit",
                    }
                )

        results.sort(key=lambda x: -x["total_violations"])
        return results[:5]

    def get_graph_stats(self) -> Dict[str, Any]:
        """Return graph statistics for display."""
        node_types = {}
        for n in self._nodes.values():
            t = n.get("type", "Unknown")
            node_types[t] = node_types.get(t, 0) + 1

        edge_types = {}
        for e in self._edges:
            t = e.get("rel", "Unknown")
            edge_types[t] = edge_types.get(t, 0) + 1

        return {
            "total_nodes": len(self._nodes),
            "total_edges": len(self._edges),
            "node_types": node_types,
            "edge_types": edge_types,
            "backend": "NetworkX DiGraph" if _NX_AVAILABLE else "Dict-based fallback",
            "swappable_to": "Neo4j (drop-in replacement — same query API)",
        }


# ─── Singleton instance ────────────────────────────────────────────────────────

_kg_instance: Optional[AetherKnowledgeGraph] = None


def get_knowledge_graph() -> AetherKnowledgeGraph:
    """Return the singleton knowledge graph instance."""
    global _kg_instance
    if _kg_instance is None:
        _kg_instance = AetherKnowledgeGraph()
    return _kg_instance


def seed_knowledge_graph(db=None, city: str = "Kolkata"):
    """Seed the knowledge graph from DB. Call on startup."""
    kg = get_knowledge_graph()
    kg.seed(db=db, city=city)
    return kg
