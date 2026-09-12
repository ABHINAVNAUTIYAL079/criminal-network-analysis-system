"""Community detection algorithms (Louvain/label propagation)."""

from __future__ import annotations

from typing import Any, Dict, List

try:
    import networkx as nx
    from networkx.algorithms.community import greedy_modularity_communities
except ImportError:
    nx = None
    greedy_modularity_communities = None

def detect_communities(
    nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]
) -> Dict[str, str]:
    """Assigns community IDs to nodes. Returns: {node_id: 'C01'}."""
    results: Dict[str, str] = {n["id"]: "C01" for n in nodes}
    if not nodes or not edges or nx is None or greedy_modularity_communities is None:
        return results

    try:
        G = nx.Graph()
        for n in nodes:
            G.add_node(n["id"])
        for e in edges:
            G.add_edge(e["source"], e["target"])

        communities = list(greedy_modularity_communities(G))
        for idx, comm in enumerate(communities, start=1):
            comm_id = f"C{idx:02d}"
            for nid in comm:
                results[nid] = comm_id
    except Exception:
        pass

    return results
