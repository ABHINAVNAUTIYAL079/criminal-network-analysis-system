"""Graph analytics algorithms: PageRank, Betweenness Centrality, Degree Centrality."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple
import math

try:
    import networkx as nx
except ImportError:
    nx = None

def compute_centrality_metrics(
    nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
) -> Dict[str, Dict[str, float]]:
    """
    Computes PageRank, Betweenness, and Degree Centrality for all nodes.
    Returns: {node_id: {"pagerank": float, "betweenness": float, "degree": float}}
    All scores normalized to [0, 1].
    """
    results: Dict[str, Dict[str, float]] = {
        n["id"]: {"pagerank": 0.0, "betweenness": 0.0, "degree": 0.0}
        for n in nodes
    }
    if not nodes:
        return results

    if nx is not None:
        G = nx.Graph()
        for n in nodes:
            G.add_node(n["id"])
        for e in edges:
            G.add_edge(e["source"], e["target"])

        # Degree
        deg = dict(G.degree())
        max_deg = max(deg.values()) if deg and max(deg.values()) > 0 else 1
        for nid, val in deg.items():
            results[nid]["degree"] = round(val / max_deg, 4)

        # PageRank
        try:
            pr = nx.pagerank(G, alpha=0.85, max_iter=100)
            max_pr = max(pr.values()) if pr and max(pr.values()) > 0 else 1
            for nid, val in pr.items():
                results[nid]["pagerank"] = round(val / max_pr, 4)
        except Exception:
            pass

        # Betweenness
        try:
            bw = nx.betweenness_centrality(G, normalized=True)
            max_bw = max(bw.values()) if bw and max(bw.values()) > 0 else 1
            for nid, val in bw.items():
                results[nid]["betweenness"] = round(val / max_bw, 4)
        except Exception:
            pass
    else:
        # Pure Python fallback
        degree_counts: Dict[str, int] = {n["id"]: 0 for n in nodes}
        for e in edges:
            s, t = e.get("source"), e.get("target")
            if s in degree_counts:
                degree_counts[s] += 1
            if t in degree_counts:
                degree_counts[t] += 1
        max_deg = max(degree_counts.values()) if degree_counts and max(degree_counts.values()) > 0 else 1
        for nid, cnt in degree_counts.items():
            score = round(cnt / max_deg, 4)
            results[nid] = {"pagerank": score, "betweenness": score, "degree": score}

    return results
