import { useCallback, useState } from "react";
import { ApiError, api } from "../services/api.js";
import { isValidId } from "../utils/validate.js";
import EntityCard from "../components/EntityCard.jsx";
import NetworkGraph from "../components/NetworkGraph.jsx";

export default function NetworkExplorer() {
  const [entityId, setEntityId] = useState("person_001");
  const [depth, setDepth] = useState(1);
  const [relTypes, setRelTypes] = useState("");
  const [graph, setGraph] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const explore = useCallback(
    async (id, overrideDepth) => {
      if (!isValidId(id)) {
        setError("Enter a valid entity ID (letters, digits, _ and -).");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const params = { depth: overrideDepth ?? depth, limit_nodes: 100, limit_edges: 300 };
        if (relTypes.trim()) params.rel_types = relTypes.trim();
        const data = await api.graph(id, params);
        setGraph(data);
        setSelected(null);
        setDetail(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Graph load failed.");
        setGraph(null);
      } finally {
        setLoading(false);
      }
    },
    [depth, relTypes]
  );

  async function selectNode(id) {
    setSelected(id);
    try {
      setDetail(await api.entity(id));
    } catch {
      setDetail(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Network Explorer</h1>
        <p className="text-sm text-gray-500">Interactive Cytoscape knowledge graph traversal with bounded depth filtering.</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          explore(entityId.trim());
        }}
      >
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Entity ID</span>
          <input
            className="block w-56 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            placeholder="person_001"
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Depth (1–3)</span>
          <input
            className="block w-20 rounded border border-gray-300 px-3 py-2 text-sm"
            type="number"
            min={1}
            max={3}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
          />
        </label>
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Relationship Filter (Optional)</span>
          <input
            className="block w-64 rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            value={relTypes}
            onChange={(event) => setRelTypes(event.target.value)}
            placeholder="CALLED, MENTIONED_IN, USED"
          />
        </label>
        <button
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800 disabled:opacity-50"
          type="submit"
          disabled={loading}
        >
          {loading ? "Loading Graph…" : "Explore Network"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {graph ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NetworkGraph nodes={graph.nodes} edges={graph.edges} onSelect={selectNode} height={520} />
            {graph.truncated ? (
              <p className="mt-1 text-xs text-amber-700">Results truncated to guard canvas responsiveness — narrow depth or relationship filters.</p>
            ) : null}
          </div>
          <div>
            {selected ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    className="w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
                    type="button"
                    onClick={() => {
                      setEntityId(selected);
                      explore(selected);
                    }}
                  >
                    Center Graph on {selected}
                  </button>
                </div>
                {detail ? <EntityCard entity={detail} /> : <p className="text-sm text-gray-500">Loading node details…</p>}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                Click any node in the graph visualization to view its profile, aliases, and metrics.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-gray-500">
          <p className="text-base font-medium">Ready to explore network connections</p>
          <p className="mt-1 text-xs">Enter an entity ID above (e.g. <span className="font-mono font-semibold">person_001</span>) and click Explore.</p>
        </div>
      )}
    </div>
  );
}
