import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../services/api.js";
import { isValidId } from "../utils/validate.js";
import EntityCard from "../components/EntityCard.jsx";
import NetworkGraph from "../components/NetworkGraph.jsx";
import Timeline from "../components/Timeline.jsx";

export default function EntityProfile() {
  const { id } = useParams();
  const [entity, setEntity] = useState(null);
  const [graph, setGraph] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isValidId(id || "")) {
      setError("Invalid entity ID format.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      api.entity(id),
      api.graph(id, { depth: 1 }).catch(() => null),
      api.timeline(id, { page_size: 50 }).catch(() => null),
    ])
      .then(([detail, neighborhood, events]) => {
        setEntity(detail);
        setGraph(neighborhood);
        setTimeline(events);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Load failed."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-gray-500">Loading entity record…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!entity) return <p className="text-sm text-gray-500">Entity not found.</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Entity Profile: {entity.name}</h1>
        <p className="font-mono text-xs text-gray-500">{entity.id} · {entity.type}</p>
      </div>

      <EntityCard entity={entity} />

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Evidence Provenance &amp; Document Sources</h2>
        {entity.source_refs?.length ? (
          <ul className="divide-y divide-gray-100 text-sm">
            {entity.source_refs.map((ref, index) => (
              <li key={`${ref.document_id}-${index}`} className="py-2 flex items-center justify-between">
                <span className="font-mono text-xs text-gray-700">{ref.document_id}</span>
                {ref.confidence != null ? (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    Confidence: {(ref.confidence * 100).toFixed(0)}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No raw source references linked.</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">1-Hop Graph Neighborhood</h2>
        {graph ? <NetworkGraph nodes={graph.nodes} edges={graph.edges} height={360} /> : <p className="text-sm text-gray-500">No graph neighborhood found.</p>}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Chronological Activity Timeline</h2>
        <Timeline events={timeline?.events} />
      </section>
    </div>
  );
}
