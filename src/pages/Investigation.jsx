import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../services/api.js";
import { formatScore, isValidId, severityTone } from "../utils/validate.js";
import NetworkGraph from "../components/NetworkGraph.jsx";
import Timeline from "../components/Timeline.jsx";

export default function Investigation() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [graph, setGraph] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isValidId(id || "")) {
      setError("Invalid entity ID format in URL.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      api.investigation(id),
      api.graph(id, { depth: 1 }).catch(() => null),
      api.timeline(id, { page_size: 100 }).catch(() => null),
    ])
      .then(([data, neighborhood, events]) => {
        setReport(data);
        setGraph(neighborhood);
        setTimeline(events);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Load failed."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-sm text-gray-500">Loading comprehensive investigation dossier…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!report) return <p className="text-sm text-gray-500">No investigation report found.</p>;

  const priority = report.priority || {};
  const anomaly = report.anomaly || {};
  const metrics = report.graph_metrics || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Investigation Dossier &amp; Triage Report</h1>
          <p className="text-sm text-gray-500">Synthesized structural centrality, anomaly metrics, and multi-source evidence trail.</p>
        </div>
        <button
          className="no-print rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          type="button"
          onClick={() => window.print()}
        >
          Print Dossier
        </button>
      </div>

      <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">⚠️ Official Disclaimer &amp; Notice for Investigators:</p>
        <p className="mt-1">
          {priority.disclaimer || "Investigation-priority indicator only. Not probability of criminality, guilt, proof of criminal activity, or future-crime prediction."}
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-1">Target Entity</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-gray-900">{report.entity?.name}</p>
            <p className="font-mono text-xs text-gray-500">ID: {report.entity?.id} · Type: {report.entity?.type}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Investigation Priority Score</h2>
        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-4xl font-extrabold text-blue-700">{formatScore(priority.score)}</p>
          <p className="font-mono text-xs text-gray-500">
            Formula: {priority.formula} (v{priority.formula_version})
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded bg-gray-50 p-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">PageRank (0.35x)</dt>
            <dd className="text-base font-bold text-gray-900">{formatScore(priority.components?.pagerank)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Betweenness (0.35x)</dt>
            <dd className="text-base font-bold text-gray-900">{formatScore(priority.components?.betweenness)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Anomaly Score (0.30x)</dt>
            <dd className="text-base font-bold text-gray-900">{formatScore(priority.components?.anomaly_score)}</dd>
          </div>
        </dl>
        {report.explanations?.length ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Automated Explainability Reasons</h3>
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
              {report.explanations.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Graph Context &amp; Key Linkages</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 mb-4">
          <div className="rounded bg-gray-50 p-2.5">
            <dt className="text-xs text-gray-500">Node Degree</dt>
            <dd className="text-lg font-bold text-gray-900">{metrics.degree ?? "—"}</dd>
          </div>
          <div className="rounded bg-gray-50 p-2.5">
            <dt className="text-xs text-gray-500">Community Cluster</dt>
            <dd className="text-lg font-bold text-gray-900">{metrics.community_id ?? "—"}</dd>
          </div>
          <div className="rounded bg-gray-50 p-2.5">
            <dt className="text-xs text-gray-500">Anomaly Signal</dt>
            <dd className="mt-0.5">
              <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${severityTone(anomaly.severity)}`}>
                {anomaly.severity || "LOW"} ({formatScore(anomaly.anomaly_score)})
              </span>
            </dd>
          </div>
          <div className="rounded bg-gray-50 p-2.5">
            <dt className="text-xs text-gray-500">Key Relationships</dt>
            <dd className="text-lg font-bold text-gray-900">{report.key_relationships?.length ?? 0}</dd>
          </div>
        </dl>

        {anomaly.reasons?.length ? (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-1">Behavioral Anomaly Flags</h3>
            <ul className="list-disc pl-5 text-sm text-gray-700">
              {anomaly.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mb-4">
          {graph ? <NetworkGraph nodes={graph.nodes} edges={graph.edges} height={360} /> : null}
        </div>

        {report.key_relationships?.length ? (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full text-left text-xs text-gray-700">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-2">Edge ID</th>
                  <th className="px-3 py-2">Source Node</th>
                  <th className="px-3 py-2">Target Node</th>
                  <th className="px-3 py-2">Relationship Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {report.key_relationships.map((edge) => (
                  <tr key={edge.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">{edge.id}</td>
                    <td className="px-3 py-2">{edge.source}</td>
                    <td className="px-3 py-2">{edge.target}</td>
                    <td className="px-3 py-2 font-sans font-medium text-blue-700">{edge.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Chronological Event Timeline</h2>
        <Timeline events={timeline?.events || report.timeline} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Evidence &amp; Document Sources</h2>
        {report.sources?.length ? (
          <ul className="list-disc pl-5 font-mono text-xs text-gray-700 space-y-1">
            {report.sources.map((source, index) => (
              <li key={`${source.document_id}-${index}`}>{source.document_id}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No raw source documents recorded.</p>
        )}
      </section>
    </div>
  );
}
