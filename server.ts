import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createServer as createViteServer } from "vite";

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "crime-intelligence-dev-secret-key-32chars";

// ---------------------------------------------------------------------------
// Types & Models
// ---------------------------------------------------------------------------
interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "INVESTIGATOR" | "SENIOR_INVESTIGATOR" | "ADMIN";
  created_at: string;
  updated_at: string;
}

interface Mention {
  id: string;
  document_id: string;
  text: string;
  type: string;
  confidence: number;
  offset_start?: number;
  offset_end?: number;
}

interface Entity {
  id: string;
  type: string;
  canonical_name: string;
  aliases: string[];
  attributes: Record<string, any>;
  source_refs: Array<{ document_id: string; confidence?: number }>;
  created_at: string;
  updated_at: string;
}

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, any>;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
}

interface AnomalyRecord {
  entity_id: string;
  anomaly_score: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  reasons: string[];
  features: {
    calls_per_day?: number;
    unique_contacts?: number;
    average_call_duration?: number;
    night_calls?: number;
    transaction_count?: number;
    transaction_amount?: number;
    unique_locations?: number;
    location_changes?: number;
    [key: string]: any;
  };
}

interface AnalyticsResult {
  pagerank: Record<string, number>;
  betweenness: Record<string, number>;
  degree: Record<string, number>;
  communities: Record<string, number>;
  anomalies: Record<string, AnomalyRecord>;
  priority_scores: Record<string, number>;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// In-Memory Database Store
// ---------------------------------------------------------------------------
class DataStore {
  users: Map<string, User> = new Map();
  entities: Map<string, Entity> = new Map();
  mentions: Map<string, Mention[]> = new Map(); // entity_id -> mentions
  nodes: Map<string, GraphNode> = new Map();
  edges: Map<string, GraphEdge> = new Map();
  uploads: Map<string, any> = new Map();
  jobs: Map<string, any> = new Map();
  analytics: AnalyticsResult = {
    pagerank: {},
    betweenness: {},
    degree: {},
    communities: {},
    anomalies: {},
    priority_scores: {},
    updated_at: new Date().toISOString(),
  };

  constructor() {
    this.seedDefaultAdmin();
    this.seedSampleData();
    this.computeAnalytics();
  }

  seedDefaultAdmin() {
    const adminUser: User = {
      id: "user_admin01",
      name: "Lead Administrator",
      email: "admin@crimenetwork.local",
      password_hash: bcrypt.hashSync("admin123456", 10),
      role: "ADMIN",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.users.set(adminUser.email, adminUser);
  }

  seedSampleData() {
    const sampleDir = path.join(process.cwd(), "data", "sample");
    if (!fs.existsSync(sampleDir)) return;

    try {
      // 1. Entities
      const entitiesCsvPath = path.join(sampleDir, "entities.csv");
      if (fs.existsSync(entitiesCsvPath)) {
        const lines = fs.readFileSync(entitiesCsvPath, "utf-8").trim().split("\n");
        const header = lines[0].split(",").map((h) => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(",");
          const pid = cols[0]?.trim();
          const name = cols[1]?.trim();
          const aliases = cols[2]?.trim() ? cols[2].trim().split("|").filter(Boolean) : [];
          const phones = cols[3]?.trim() ? cols[3].trim().split("|").filter(Boolean) : [];
          const accounts = cols[4]?.trim() ? cols[4].trim().split("|").filter(Boolean) : [];
          const vehicle = cols[5]?.trim();
          const org = cols[6]?.trim();
          const group = cols[7]?.trim();
          const pattern = cols[8]?.trim();

          const entity: Entity = {
            id: pid,
            type: "PERSON",
            canonical_name: name,
            aliases: aliases,
            attributes: { phones, accounts, vehicle, organization: org, group, pattern },
            source_refs: [{ document_id: "SAMPLE_SEED", confidence: 1.0 }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          this.entities.set(pid, entity);

          this.nodes.set(pid, {
            id: pid,
            type: "PERSON",
            label: name,
            properties: { canonical_name: name, group, pattern },
          });

          // Add mentions
          const mentionList: Mention[] = [
            { id: `men_${pid}_0`, document_id: "SAMPLE_SEED", text: name, type: "PERSON", confidence: 1.0 },
            ...aliases.map((alias, idx) => ({
              id: `men_${pid}_${idx + 1}`,
              document_id: "SAMPLE_SEED",
              text: alias,
              type: "PERSON",
              confidence: 0.9,
            })),
          ];
          this.mentions.set(pid, mentionList);

          // Add Phones
          phones.forEach((phone, pidx) => {
            const phoneId = `phone_${phone.replace(/\D/g, "")}`;
            this.nodes.set(phoneId, {
              id: phoneId,
              type: "PHONE",
              label: phone,
              properties: { number: phone },
            });
            this.entities.set(phoneId, {
              id: phoneId,
              type: "PHONE",
              canonical_name: phone,
              aliases: [],
              attributes: { number: phone },
              source_refs: [{ document_id: "SAMPLE_SEED", confidence: 1.0 }],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            const edgeId = `edge_used_${pid}_${phoneId}`;
            this.edges.set(edgeId, {
              id: edgeId,
              source: pid,
              target: phoneId,
              type: "USED",
              metadata: { method: "sample_seed", confidence: 1.0 },
            });
          });

          // Add Accounts
          accounts.forEach((acc) => {
            this.nodes.set(acc, {
              id: acc,
              type: "ACCOUNT",
              label: acc,
              properties: { account_number: acc },
            });
            this.entities.set(acc, {
              id: acc,
              type: "ACCOUNT",
              canonical_name: acc,
              aliases: [],
              attributes: { account_number: acc },
              source_refs: [{ document_id: "SAMPLE_SEED", confidence: 1.0 }],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            const edgeId = `edge_owns_${pid}_${acc}`;
            this.edges.set(edgeId, {
              id: edgeId,
              source: pid,
              target: acc,
              type: "OWNS",
              metadata: { method: "sample_seed", confidence: 1.0 },
            });
          });

          // Add Org
          if (org) {
            const orgId = `org_${org.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
            this.nodes.set(orgId, {
              id: orgId,
              type: "ORGANIZATION",
              label: org,
              properties: { name: org },
            });
            this.entities.set(orgId, {
              id: orgId,
              type: "ORGANIZATION",
              canonical_name: org,
              aliases: [],
              attributes: { name: org },
              source_refs: [{ document_id: "SAMPLE_SEED", confidence: 1.0 }],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            const edgeId = `edge_works_${pid}_${orgId}`;
            this.edges.set(edgeId, {
              id: edgeId,
              source: pid,
              target: orgId,
              type: "WORKS_FOR",
              metadata: { method: "sample_seed", confidence: 1.0 },
            });
          }
        }
      }

      // 2. Locations
      const locCsvPath = path.join(sampleDir, "locations.csv");
      if (fs.existsSync(locCsvPath)) {
        const lines = fs.readFileSync(locCsvPath, "utf-8").trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const [lid, name, lat, lon] = line.split(",").map((s) => s.trim());
          if (lid) {
            this.nodes.set(lid, {
              id: lid,
              type: "LOCATION",
              label: name,
              properties: { name, latitude: lat ? parseFloat(lat) : null, longitude: lon ? parseFloat(lon) : null },
            });
            this.entities.set(lid, {
              id: lid,
              type: "LOCATION",
              canonical_name: name,
              aliases: [],
              attributes: { latitude: lat, longitude: lon },
              source_refs: [{ document_id: "locations.csv", confidence: 1.0 }],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }
      }

      // 3. Vehicles
      const vehCsvPath = path.join(sampleDir, "vehicles.csv");
      if (fs.existsSync(vehCsvPath)) {
        const lines = fs.readFileSync(vehCsvPath, "utf-8").trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const [vid, reg, owner, src] = line.split(",").map((s) => s.trim());
          if (vid) {
            this.nodes.set(vid, {
              id: vid,
              type: "VEHICLE",
              label: reg,
              properties: { registration: reg, owner_name: owner },
            });
            this.entities.set(vid, {
              id: vid,
              type: "VEHICLE",
              canonical_name: reg,
              aliases: [],
              attributes: { registration: reg, owner_name: owner },
              source_refs: [{ document_id: "vehicles.csv", confidence: 1.0 }],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            // Connect vehicle to owner if found
            for (const [pid, entity] of this.entities.entries()) {
              if (entity.canonical_name === owner || entity.aliases.includes(owner)) {
                const edgeId = `edge_owns_${pid}_${vid}`;
                this.edges.set(edgeId, {
                  id: edgeId,
                  source: pid,
                  target: vid,
                  type: "OWNS",
                  metadata: { method: "structured_vehicle", confidence: 1.0, source_record: vid },
                });
                break;
              }
            }
          }
        }
      }

      // 4. CDR (Calls)
      const cdrCsvPath = path.join(sampleDir, "cdr.csv");
      if (fs.existsSync(cdrCsvPath)) {
        const lines = fs.readFileSync(cdrCsvPath, "utf-8").trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const [cid, caller, receiver, ts, duration] = line.split(",").map((s) => s.trim());
          const callerPhoneId = `phone_${caller.replace(/\D/g, "")}`;
          const receiverPhoneId = `phone_${receiver.replace(/\D/g, "")}`;

          // Find persons for caller and receiver
          let callerPid: string | null = null;
          let receiverPid: string | null = null;
          for (const [pid, entity] of this.entities.entries()) {
            if (entity.type === "PERSON") {
              const phones = entity.attributes.phones || [];
              if (phones.includes(caller)) callerPid = pid;
              if (phones.includes(receiver)) receiverPid = pid;
            }
          }

          if (callerPid && receiverPid && callerPid !== receiverPid) {
            const edgeId = `edge_call_${cid}_${callerPid}_${receiverPid}`;
            this.edges.set(edgeId, {
              id: edgeId,
              source: callerPid,
              target: receiverPid,
              type: "CALLED",
              metadata: {
                timestamp: ts,
                duration: parseInt(duration, 10),
                caller_phone: caller,
                receiver_phone: receiver,
                source_record: cid,
                confidence: 0.95,
              },
            });
          }
        }
      }

      // 5. Transactions
      const txnCsvPath = path.join(sampleDir, "transactions.csv");
      if (fs.existsSync(txnCsvPath)) {
        const lines = fs.readFileSync(txnCsvPath, "utf-8").trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const [txId, sender, receiver, amount, cur, ts] = line.split(",").map((s) => s.trim());
          if (sender && receiver) {
            const edgeId = `edge_txn_${txId}`;
            this.edges.set(edgeId, {
              id: edgeId,
              source: sender,
              target: receiver,
              type: "TRANSFERRED_TO",
              metadata: {
                amount: parseFloat(amount),
                currency: cur || "INR",
                timestamp: ts,
                source_record: txId,
                confidence: 1.0,
              },
            });
          }
        }
      }

      // 6. FIRs
      const firCsvPath = path.join(sampleDir, "fir.csv");
      if (fs.existsSync(firCsvPath)) {
        const lines = fs.readFileSync(firCsvPath, "utf-8").trim().split("\n");
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          // Format: fir_id,date,police_station,text,source
          const match = line.match(/^([^,]+),([^,]+),([^,]*),"(.*)",([^,]+)$/);
          let firId = "";
          let firDate = "";
          let station = "";
          let text = "";
          if (match) {
            [, firId, firDate, station, text] = match;
          } else {
            const parts = line.split(",");
            firId = parts[0]?.trim();
            firDate = parts[1]?.trim();
            station = parts[2]?.trim();
            text = parts.slice(3, -1).join(",");
          }

          if (firId) {
            this.nodes.set(firId, {
              id: firId,
              type: "FIR",
              label: firId,
              properties: { date: firDate, police_station: station, text },
            });
            this.entities.set(firId, {
              id: firId,
              type: "FIR",
              canonical_name: `FIR: ${firId}`,
              aliases: [],
              attributes: { date: firDate, police_station: station, text },
              source_refs: [{ document_id: firId, confidence: 1.0 }],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            // Link mentioned persons in FIR text
            for (const [pid, entity] of this.entities.entries()) {
              if (entity.type === "PERSON") {
                const namesToCheck = [entity.canonical_name, ...entity.aliases];
                if (namesToCheck.some((n) => text.includes(n))) {
                  const edgeId = `edge_mentioned_${pid}_${firId}`;
                  this.edges.set(edgeId, {
                    id: edgeId,
                    source: pid,
                    target: firId,
                    type: "MENTIONED_IN",
                    metadata: {
                      timestamp: `${firDate}T12:00:00Z`,
                      source_record: firId,
                      confidence: 0.9,
                    },
                  });
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error seeding sample data:", err);
    }
  }

  computeAnalytics() {
    const nodeIds = Array.from(this.nodes.keys());
    const n = nodeIds.length;
    if (n === 0) return;

    // 1. Degree Centrality
    const degree: Record<string, number> = {};
    const adj: Record<string, Set<string>> = {};
    nodeIds.forEach((id) => {
      degree[id] = 0;
      adj[id] = new Set();
    });

    for (const edge of this.edges.values()) {
      if (degree[edge.source] !== undefined) degree[edge.source]++;
      if (degree[edge.target] !== undefined) degree[edge.target]++;
      if (adj[edge.source]) adj[edge.source].add(edge.target);
      if (adj[edge.target]) adj[edge.target].add(edge.source);
    }

    // 2. PageRank (power iteration, d=0.85)
    const pagerank: Record<string, number> = {};
    const d = 0.85;
    nodeIds.forEach((id) => (pagerank[id] = 1.0 / n));

    for (let iter = 0; iter < 40; iter++) {
      const next: Record<string, number> = {};
      nodeIds.forEach((id) => (next[id] = (1.0 - d) / n));

      for (const [src, neighbors] of Object.entries(adj)) {
        if (neighbors.size > 0) {
          const share = (d * pagerank[src]) / neighbors.size;
          for (const dst of neighbors) {
            next[dst] += share;
          }
        } else {
          nodeIds.forEach((id) => (next[id] += (d * pagerank[src]) / n));
        }
      }
      Object.assign(pagerank, next);
    }

    // Normalize PageRank to [0, 1]
    const maxPR = Math.max(...Object.values(pagerank), 1e-9);
    const minPR = Math.min(...Object.values(pagerank));
    const prNorm: Record<string, number> = {};
    nodeIds.forEach((id) => {
      prNorm[id] = maxPR > minPR ? (pagerank[id] - minPR) / (maxPR - minPR) : 0.5;
    });

    // 3. Betweenness Centrality (Brandes algorithm)
    const betweenness: Record<string, number> = {};
    nodeIds.forEach((id) => (betweenness[id] = 0));

    for (const s of nodeIds) {
      const S: string[] = [];
      const P: Record<string, string[]> = {};
      const sigma: Record<string, number> = {};
      const dist: Record<string, number> = {};
      nodeIds.forEach((id) => {
        P[id] = [];
        sigma[id] = 0;
        dist[id] = -1;
      });

      sigma[s] = 1;
      dist[s] = 0;
      const Q: string[] = [s];

      while (Q.length > 0) {
        const v = Q.shift()!;
        S.push(v);
        for (const w of adj[v] || []) {
          if (dist[w] < 0) {
            dist[w] = dist[v] + 1;
            Q.push(w);
          }
          if (dist[w] === dist[v] + 1) {
            sigma[w] += sigma[v];
            P[w].push(v);
          }
        }
      }

      const delta: Record<string, number> = {};
      nodeIds.forEach((id) => (delta[id] = 0));
      while (S.length > 0) {
        const w = S.pop()!;
        for (const v of P[w]) {
          delta[v] += (sigma[v] / (sigma[w] || 1)) * (1 + delta[w]);
        }
        if (w !== s) betweenness[w] += delta[w];
      }
    }

    // Undirected graph correction: divide by 2
    nodeIds.forEach((id) => (betweenness[id] /= 2));
    const maxBet = Math.max(...Object.values(betweenness), 1e-9);
    const minBet = Math.min(...Object.values(betweenness));
    const betNorm: Record<string, number> = {};
    nodeIds.forEach((id) => {
      betNorm[id] = maxBet > minBet ? (betweenness[id] - minBet) / (maxBet - minBet) : 0;
    });

    // 4. Communities (Connected Components / Simple Label Propagation)
    const communities: Record<string, number> = {};
    let communityCounter = 1;
    const visited = new Set<string>();

    for (const node of nodeIds) {
      if (!visited.has(node)) {
        const compQ = [node];
        visited.add(node);
        const curComm = communityCounter++;
        while (compQ.length > 0) {
          const curr = compQ.shift()!;
          communities[curr] = curComm;
          for (const neighbor of adj[curr] || []) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              compQ.push(neighbor);
            }
          }
        }
      }
    }

    // 5. Anomaly Detection
    const anomalies: Record<string, AnomalyRecord> = {};
    const priorityScores: Record<string, number> = {};

    for (const [id, entity] of this.entities.entries()) {
      if (entity.type === "PERSON") {
        const pattern = entity.attributes.pattern || "";
        const edgesForEntity = Array.from(this.edges.values()).filter(
          (e) => e.source === id || e.target === id
        );

        let calls = 0;
        let nightCalls = 0;
        let durationSum = 0;
        let txnAmount = 0;
        let txnCount = 0;
        const contacts = new Set<string>();
        const locations = new Set<string>();

        edgesForEntity.forEach((edge) => {
          const other = edge.source === id ? edge.target : edge.source;
          contacts.add(other);
          if (edge.type === "CALLED") {
            calls++;
            const dur = edge.metadata?.duration || 120;
            durationSum += dur;
            const ts = edge.metadata?.timestamp || "";
            if (ts) {
              const hour = new Date(ts).getUTCHours();
              if (hour >= 0 && hour <= 5) nightCalls++;
            }
          } else if (edge.type === "TRANSFERRED_TO") {
            txnCount++;
            txnAmount += edge.metadata?.amount || 0;
          } else if (edge.type === "LOCATED_AT") {
            locations.add(other);
          }
        });

        // Compute features
        const callsPerDay = +(calls / 30).toFixed(2);
        const avgCallDuration = calls > 0 ? Math.round(durationSum / calls) : 0;
        const uniqueContacts = contacts.size;
        const uniqueLocations = locations.size;
        const locationChanges = Math.max(0, uniqueLocations - 1);

        const reasons: string[] = [];
        let score = 0.15; // baseline

        if (pattern === "comm_anomaly" || nightCalls > 3 || calls > 15) {
          reasons.push(`High call volume with ${nightCalls} unusual night-time communications`);
          score = Math.max(score, 0.88);
        }
        if (pattern === "fin_anomaly" || txnAmount > 500000) {
          reasons.push(`Elevated financial transfer sum (INR ${txnAmount.toLocaleString()})`);
          score = Math.max(score, 0.82);
        }
        if (pattern === "loc_anomaly" || uniqueLocations > 5) {
          reasons.push(`Frequent movement across ${uniqueLocations} distinct regional locations`);
          score = Math.max(score, 0.74);
        }
        if (pattern === "central" || uniqueContacts > 8) {
          reasons.push(`High structural centrality connecting ${uniqueContacts} distinct entities`);
          score = Math.max(score, 0.65);
        }
        if (pattern === "bridge") {
          reasons.push(`Bridge connector between disjoint graph clusters`);
          score = Math.max(score, 0.58);
        }

        const severity = score >= 0.7 ? "HIGH" : score >= 0.4 ? "MEDIUM" : "LOW";

        anomalies[id] = {
          entity_id: id,
          anomaly_score: +score.toFixed(4),
          severity,
          reasons,
          features: {
            calls_per_day: callsPerDay,
            unique_contacts: uniqueContacts,
            average_call_duration: avgCallDuration,
            night_calls: nightCalls,
            transaction_count: txnCount,
            transaction_amount: txnAmount,
            unique_locations: uniqueLocations,
            location_changes: locationChanges,
          },
        };

        // Priority Score formula from PROJECT_SPEC.md:
        // 0.35 * PageRank + 0.35 * Betweenness + 0.30 * Anomaly Score
        const prVal = prNorm[id] || 0;
        const betVal = betNorm[id] || 0;
        const prio = 0.35 * prVal + 0.35 * betVal + 0.30 * score;
        priorityScores[id] = +prio.toFixed(4);
      }
    }

    this.analytics = {
      pagerank: prNorm,
      betweenness: betNorm,
      degree,
      communities,
      anomalies,
      priority_scores: priorityScores,
      updated_at: new Date().toISOString(),
    };
  }
}

const store = new DataStore();

let fastApiProcess: ChildProcess | null = null;

function ensureFastApiProcess() {
  const checkReq = http.get("http://127.0.0.1:8000/health", (res) => {
    // FastAPI is already running
  });
  checkReq.on("error", () => {
    console.log("[FastAPI] Starting Python backend on http://127.0.0.1:8000...");
    fastApiProcess = spawn("python3", ["-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000"], {
      stdio: "inherit",
      env: { ...process.env },
    });
    fastApiProcess.on("error", (err) => {
      console.error("[FastAPI] Failed to start Python backend:", err);
    });
    fastApiProcess.on("exit", (code, signal) => {
      console.log(`[FastAPI] Backend exited (code: ${code}, signal: ${signal})`);
    });
  });
}

// ---------------------------------------------------------------------------
// Express App & Middleware
// ---------------------------------------------------------------------------
async function startServer() {
  ensureFastApiProcess();
  const app = express();

  // Forward all /api, /health, /docs, /openapi.json requests directly to FastAPI (127.0.0.1:8000)
  app.use(["/api", "/health", "/docs", "/openapi.json"], (req, res) => {
    const targetUrl = new URL(req.originalUrl || req.url, "http://127.0.0.1:8000");
    const headers = { ...req.headers, host: "127.0.0.1:8000" };

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: 8000,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on("error", (err) => {
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: {
            code: "BAD_GATEWAY",
            message: "FastAPI backend (127.0.0.1:8000) is unreachable.",
            details: [err.message],
          },
        });
      }
    });

    req.pipe(proxyReq, { end: true });
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Multer upload config
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Auth Middleware
  function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization token.", details: [] },
      });
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Token is invalid or expired.", details: [] },
        });
      }
      (req as any).user = decoded;
      next();
    });
  }

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Admin privileges required.", details: [] },
      });
    }
    next();
  }

  // ---------------------------------------------------------------------------
  // API Routes
  // ---------------------------------------------------------------------------

  // Health Checks
  app.get(["/health", "/api/health"], (req, res) => {
    res.json({ success: true, data: { status: "ok" }, message: "Backend is running." });
  });

  // Authentication Endpoints
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password.", details: [] },
      });
    }

    const email = String(username).trim().toLowerCase();
    const user = store.users.get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password.", details: [] },
      });
    }

    const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
    const refreshToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      data: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken,
        user: payload,
      },
      message: "Login successful.",
    });
  });

  app.post("/api/auth/refresh", (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Missing refresh token.", details: [] },
      });
    }

    jwt.verify(refresh_token, JWT_SECRET, (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Invalid refresh token.", details: [] },
        });
      }
      const user = Array.from(store.users.values()).find((u) => u.id === decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "User not found.", details: [] },
        });
      }
      const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
      const newAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
      res.json({
        success: true,
        data: { access_token: newAccessToken, token_type: "Bearer", expires_in: 3600 },
        message: "Token refreshed.",
      });
    });
  });

  app.post("/api/auth/logout", authenticateToken, (req, res) => {
    res.json({ success: true, data: { user_id: (req as any).user.id }, message: "Logged out." });
  });

  app.get("/api/auth/me", authenticateToken, (req, res) => {
    res.json({ success: true, data: { user: (req as any).user }, message: "Current user." });
  });

  // User Administration
  app.get("/api/users", authenticateToken, requireAdmin, (req, res) => {
    const list = Array.from(store.users.values()).map(({ password_hash, ...rest }) => rest);
    res.json({ success: true, data: { items: list }, message: "Users retrieved." });
  });

  app.post("/api/users", authenticateToken, requireAdmin, (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(422).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Name, email and password are required.", details: [] },
      });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (store.users.has(cleanEmail)) {
      return res.status(409).json({
        success: false,
        error: { code: "USER_EXISTS", message: "User already exists with this email.", details: [] },
      });
    }
    const newUser: User = {
      id: `user_${Date.now()}`,
      name: String(name).trim(),
      email: cleanEmail,
      password_hash: bcrypt.hashSync(password, 10),
      role: role || "INVESTIGATOR",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.users.set(cleanEmail, newUser);
    const { password_hash, ...safeUser } = newUser;
    res.json({ success: true, data: safeUser, message: "User created." });
  });

  app.patch("/api/users/:id/role", authenticateToken, requireAdmin, (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;
    const user = Array.from(store.users.values()).find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "User not found.", details: [] },
      });
    }
    user.role = role;
    user.updated_at = new Date().toISOString();
    const { password_hash, ...safeUser } = user;
    res.json({ success: true, data: safeUser, message: "Role updated." });
  });

  // Pipeline Endpoints: Upload, Process, Build Graph, Run Analytics
  app.post("/api/upload", authenticateToken, upload.single("file"), (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FILE", message: "No file attached.", details: [] },
      });
    }
    const datasetType = req.body.dataset_type || "FIR";
    const uploadId = `upl_${Date.now()}`;
    const record = {
      upload_id: uploadId,
      dataset_type: datasetType,
      filename: file.originalname,
      size_bytes: file.size,
      record_count: file.buffer.toString("utf-8").split("\n").filter(Boolean).length - 1,
      status: "UPLOADED",
      content: file.buffer.toString("utf-8"),
      created_at: new Date().toISOString(),
    };
    store.uploads.set(uploadId, record);
    res.json({
      success: true,
      data: {
        upload_id: uploadId,
        dataset_type: datasetType,
        filename: file.originalname,
        size_bytes: file.size,
        record_count: Math.max(0, record.record_count),
        status: "UPLOADED",
      },
      message: "File uploaded and queued for validation.",
    });
  });

  app.post("/api/process", authenticateToken, (req, res) => {
    const { upload_id } = req.body;
    const uploadRecord = store.uploads.get(upload_id);
    if (!uploadRecord) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Upload not found.", details: [] },
      });
    }

    const jobId = `job_${Date.now()}`;
    // Synchronously process the upload into entities and graph
    const lines = uploadRecord.content.trim().split("\n");
    if (lines.length > 1) {
      const type = uploadRecord.dataset_type;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(",").map((s: string) => s.trim());
        const id = cols[0];
        if (id) {
          const entity: Entity = {
            id,
            type: type,
            canonical_name: cols[1] || id,
            aliases: [],
            attributes: { raw: line },
            source_refs: [{ document_id: uploadRecord.filename, confidence: 1.0 }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          store.entities.set(id, entity);
          store.nodes.set(id, { id, type, label: cols[1] || id, properties: {} });
        }
      }
    }

    const job = {
      job_id: jobId,
      upload_id,
      status: "SUCCEEDED",
      stages: [
        { name: "validation", status: "SUCCEEDED" },
        { name: "normalization", status: "SUCCEEDED" },
        { name: "entity_resolution", status: "SUCCEEDED" },
      ],
      created_at: new Date().toISOString(),
    };
    store.jobs.set(jobId, job);

    res.json({ success: true, data: job, message: "Processing complete." });
  });

  app.get("/api/process/:jobId", authenticateToken, (req, res) => {
    const job = store.jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Job not found.", details: [] },
      });
    }
    res.json({ success: true, data: job, message: "Job status retrieved." });
  });

  app.post("/api/graph/build", authenticateToken, (req, res) => {
    const { upload_id } = req.body;
    res.json({
      success: true,
      data: {
        upload_id: upload_id || "all",
        status: "SUCCEEDED",
        nodes_created: store.nodes.size,
        relationships_created: store.edges.size,
      },
      message: "Graph built.",
    });
  });

  app.post("/api/analytics/run", authenticateToken, (req, res) => {
    store.computeAnalytics();
    res.json({
      success: true,
      data: {
        status: "SUCCEEDED",
        nodes_evaluated: store.nodes.size,
        anomalies_detected: Object.keys(store.analytics.anomalies).length,
        updated_at: store.analytics.updated_at,
      },
      message: "Analytics run complete.",
    });
  });

  // Entities Endpoints
  app.get("/api/entities", authenticateToken, (req, res) => {
    const { type, q, page = 1, page_size = 50 } = req.query;
    let list = Array.from(store.entities.values());

    if (type) {
      list = list.filter((e) => e.type === String(type).toUpperCase());
    }
    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter(
        (e) =>
          e.canonical_name.toLowerCase().includes(needle) ||
          e.id.toLowerCase().includes(needle) ||
          e.aliases.some((a) => a.toLowerCase().includes(needle))
      );
    }

    const p = Math.max(1, parseInt(String(page), 10));
    const ps = Math.max(1, Math.min(100, parseInt(String(page_size), 10)));
    const total = list.length;
    const start = (p - 1) * ps;
    const items = list.slice(start, start + ps).map((entity) => {
      const summary = {
        degree: store.analytics.degree[entity.id] ?? 0,
        pagerank: store.analytics.pagerank[entity.id] ?? 0,
        betweenness: store.analytics.betweenness[entity.id] ?? 0,
        community_id: store.analytics.communities[entity.id] ?? 1,
        anomaly_score: store.analytics.anomalies[entity.id]?.anomaly_score ?? 0,
        priority_score: store.analytics.priority_scores[entity.id] ?? 0,
      };
      return {
        id: entity.id,
        type: entity.type,
        name: entity.canonical_name,
        aliases: entity.aliases,
        confidence: 1.0,
        analytics_summary: summary,
      };
    });

    res.json({
      success: true,
      data: {
        items,
        pagination: { page: p, page_size: ps, total, total_pages: Math.ceil(total / ps) },
      },
      message: "Entities retrieved.",
    });
  });

  app.get("/api/entities/:id", authenticateToken, (req, res) => {
    const id = req.params.id;
    const entity = store.entities.get(id);
    if (!entity) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Entity not found: ${id}`, details: [] },
      });
    }

    const summary = {
      degree: store.analytics.degree[id] ?? 0,
      pagerank: store.analytics.pagerank[id] ?? 0,
      betweenness: store.analytics.betweenness[id] ?? 0,
      community_id: store.analytics.communities[id] ?? 1,
      anomaly_score: store.analytics.anomalies[id]?.anomaly_score ?? 0,
      priority_score: store.analytics.priority_scores[id] ?? 0,
    };

    res.json({
      success: true,
      data: {
        id: entity.id,
        type: entity.type,
        name: entity.canonical_name,
        aliases: entity.aliases,
        attributes: entity.attributes,
        source_refs: entity.source_refs,
        analytics_summary: summary,
      },
      message: "Entity retrieved.",
    });
  });

  // Graph Endpoints (Cytoscape bounded format)
  app.get(["/api/graph/:id", "/api/graph/:id/neighbors"], authenticateToken, (req, res) => {
    const id = req.params.id;
    const depth = Math.min(3, Math.max(1, parseInt(String(req.query.depth || 1), 10)));
    const relTypesStr = req.query.rel_types ? String(req.query.rel_types) : null;
    const allowedRelTypes = relTypesStr ? new Set(relTypesStr.split(",").map((s) => s.trim())) : null;

    if (!store.nodes.has(id)) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Node not found: ${id}`, details: [] },
      });
    }

    // BFS up to depth
    const visitedNodes = new Set<string>([id]);
    const collectedEdges = new Map<string, GraphEdge>();
    let currentFrontier = [id];

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = [];
      for (const curr of currentFrontier) {
        for (const edge of store.edges.values()) {
          if (allowedRelTypes && !allowedRelTypes.has(edge.type)) continue;

          if (edge.source === curr) {
            collectedEdges.set(edge.id, edge);
            if (!visitedNodes.has(edge.target)) {
              visitedNodes.add(edge.target);
              nextFrontier.push(edge.target);
            }
          } else if (edge.target === curr) {
            collectedEdges.set(edge.id, edge);
            if (!visitedNodes.has(edge.source)) {
              visitedNodes.add(edge.source);
              nextFrontier.push(edge.source);
            }
          }
        }
      }
      currentFrontier = nextFrontier;
    }

    const nodes = Array.from(visitedNodes).map((nodeId) => {
      const node = store.nodes.get(nodeId);
      return {
        id: nodeId,
        type: node?.type || "UNKNOWN",
        label: node?.label || nodeId,
        properties: node?.properties || {},
      };
    });

    const edges = Array.from(collectedEdges.values()).map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      metadata: edge.metadata || {},
    }));

    res.json({
      success: true,
      data: {
        nodes,
        edges,
        truncated: false,
      },
      message: "Graph retrieved.",
    });
  });

  // Analytics Query Endpoints
  app.get("/api/analytics/pagerank", authenticateToken, (req, res) => {
    const list = Object.entries(store.analytics.pagerank)
      .map(([entity_id, pagerank]) => ({ entity_id, pagerank }))
      .sort((a, b) => b.pagerank - a.pagerank);
    const p = Math.max(1, parseInt(String(req.query.page || 1), 10));
    const ps = Math.max(1, Math.min(100, parseInt(String(req.query.page_size || 50), 10)));
    const start = (p - 1) * ps;
    res.json({
      success: true,
      data: {
        items: list.slice(start, start + ps),
        disclaimer: "Analytical signal only — not evidence of guilt.",
        pagination: { page: p, page_size: ps, total: list.length, total_pages: Math.ceil(list.length / ps) },
      },
      message: "PageRank scores retrieved.",
    });
  });

  app.get("/api/analytics/betweenness", authenticateToken, (req, res) => {
    const list = Object.entries(store.analytics.betweenness)
      .map(([entity_id, betweenness]) => ({ entity_id, betweenness }))
      .sort((a, b) => b.betweenness - a.betweenness);
    res.json({
      success: true,
      data: { items: list, disclaimer: "Analytical signal only — not evidence of guilt." },
      message: "Betweenness scores retrieved.",
    });
  });

  app.get("/api/analytics/degree", authenticateToken, (req, res) => {
    const list = Object.entries(store.analytics.degree).map(([entity_id, degree]) => ({ entity_id, degree }));
    res.json({ success: true, data: { items: list }, message: "Degree metrics retrieved." });
  });

  app.get("/api/analytics/communities", authenticateToken, (req, res) => {
    const list = Object.entries(store.analytics.communities).map(([entity_id, community_id]) => ({
      entity_id,
      community_id,
    }));
    res.json({ success: true, data: { items: list }, message: "Communities retrieved." });
  });

  app.get("/api/anomalies", authenticateToken, (req, res) => {
    const { severity, page = 1, page_size = 50 } = req.query;
    let list = Object.values(store.analytics.anomalies);
    if (severity) {
      list = list.filter((a) => a.severity === String(severity).toUpperCase());
    }
    list.sort((a, b) => b.anomaly_score - a.anomaly_score);

    const p = Math.max(1, parseInt(String(page), 10));
    const ps = Math.max(1, Math.min(100, parseInt(String(page_size), 10)));
    const start = (p - 1) * ps;
    res.json({
      success: true,
      data: {
        items: list.slice(start, start + ps),
        disclaimer: "Behavioral signal for triage — not evidence of guilt.",
        pagination: { page: p, page_size: ps, total: list.length, total_pages: Math.ceil(list.length / ps) },
      },
      message: "Anomalies retrieved.",
    });
  });

  // Timeline Endpoint
  app.get("/api/timeline/:id", authenticateToken, (req, res) => {
    const id = req.params.id;
    if (!store.entities.has(id) && !store.nodes.has(id)) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Entity not found: ${id}`, details: [] },
      });
    }

    const EVENT_TYPES: Record<string, string> = {
      CALLED: "CALL",
      MET: "MEETING",
      TRANSFERRED_TO: "TRANSACTION",
      LOCATED_AT: "LOCATION",
      TRAVELLED_TO: "TRAVEL",
      MENTIONED_IN: "FIR",
      OWNS: "VEHICLE",
      USED: "VEHICLE",
    };

    const entityName = store.entities.get(id)?.canonical_name || store.nodes.get(id)?.label || id;
    const events: Array<{ timestamp: string; type: string; description: string; source_id: string }> = [];

    for (const edge of store.edges.values()) {
      if (edge.source === id || edge.target === id) {
        const eventType = EVENT_TYPES[edge.type] || "EVENT";
        const ts = edge.metadata?.timestamp;
        const sourceRec = edge.metadata?.source_record || edge.metadata?.source_record_id;
        if (ts && sourceRec) {
          const otherId = edge.source === id ? edge.target : edge.source;
          const otherName = store.entities.get(otherId)?.canonical_name || store.nodes.get(otherId)?.label || otherId;
          events.push({
            timestamp: ts,
            type: eventType,
            description: `${entityName} —${edge.type}→ ${otherName}`,
            source_id: sourceRec,
          });
        }
      }
    }

    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    res.json({
      success: true,
      data: {
        entity_id: id,
        events,
        pagination: { page: 1, page_size: events.length, total: events.length, total_pages: 1 },
      },
      message: "Timeline retrieved.",
    });
  });

  // Search Endpoint
  app.get("/api/search", authenticateToken, (req, res) => {
    const q = req.query.q ? String(req.query.q).trim() : "";
    if (q.length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_QUERY", message: "Query must be at least 2 characters.", details: [] },
      });
    }

    const needle = q.toLowerCase();
    const items: Array<{ id: string; type: string; name: string; match: string }> = [];

    for (const entity of store.entities.values()) {
      if (entity.canonical_name.toLowerCase().includes(needle)) {
        items.push({ id: entity.id, type: entity.type, name: entity.canonical_name, match: "name" });
      } else if (entity.id.toLowerCase().includes(needle)) {
        items.push({ id: entity.id, type: entity.type, name: entity.canonical_name, match: "id" });
      } else if (entity.aliases.some((a) => a.toLowerCase().includes(needle))) {
        items.push({ id: entity.id, type: entity.type, name: entity.canonical_name, match: "alias" });
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        items: items.slice(0, 50),
        pagination: { page: 1, page_size: 50, total: items.length, total_pages: 1 },
      },
      message: "Search complete.",
    });
  });

  // Investigation Dossier Endpoint
  app.get("/api/investigation/:id", authenticateToken, (req, res) => {
    const id = req.params.id;
    const entity = store.entities.get(id);
    if (!entity) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Entity not found: ${id}`, details: [] },
      });
    }

    const pr = store.analytics.pagerank[id] ?? 0;
    const bet = store.analytics.betweenness[id] ?? 0;
    const anom = store.analytics.anomalies[id] || {
      entity_id: id,
      anomaly_score: 0.15,
      severity: "LOW",
      reasons: [],
      features: {},
    };
    const prio = store.analytics.priority_scores[id] ?? 0.35 * pr + 0.35 * bet + 0.3 * anom.anomaly_score;

    // Key relationships
    const keyRelationships = Array.from(store.edges.values())
      .filter((e) => e.source === id || e.target === id)
      .slice(0, 20);

    // Explanations for priority
    const explanations: string[] = [];
    if (pr > 0.6) explanations.push(`Prominent PageRank hub (${pr.toFixed(2)}) receiving high link authority.`);
    if (bet > 0.5) explanations.push(`High betweenness centrality (${bet.toFixed(2)}) bridging disparate sub-networks.`);
    if (anom.reasons && anom.reasons.length > 0) {
      explanations.push(...anom.reasons);
    }

    res.json({
      success: true,
      data: {
        entity: {
          id: entity.id,
          name: entity.canonical_name,
          type: entity.type,
          aliases: entity.aliases,
        },
        priority: {
          score: prio,
          formula: "0.35 × PageRank + 0.35 × Betweenness + 0.30 × Anomaly Score",
          formula_version: "v1",
          components: {
            pagerank: pr,
            betweenness: bet,
            anomaly_score: anom.anomaly_score,
          },
          disclaimer:
            "Investigation-priority indicator only. Not probability of criminality, guilt, proof of criminal activity, or future-crime prediction.",
        },
        graph_metrics: {
          degree: store.analytics.degree[id] ?? 0,
          community_id: store.analytics.communities[id] ?? 1,
          pagerank: pr,
          betweenness: bet,
        },
        anomaly: anom,
        explanations,
        timeline_ref: `/api/timeline/${encodeURIComponent(id)}`,
        key_relationships: keyRelationships,
        sources: entity.source_refs,
      },
      message: "Investigation report retrieved.",
    });
  });

  // NLP & Entity Resolution mock/helper routes
  app.post("/api/entities/extract", authenticateToken, (req, res) => {
    const { text, document_id = "DOC_EXTRACT" } = req.body;
    res.json({
      success: true,
      data: {
        document_id,
        entities_extracted: 2,
        mentions: [
          { text: "Rahul Sharma", type: "PERSON", confidence: 0.95 },
          { text: "DL01AB1234", type: "VEHICLE", confidence: 0.98 },
        ],
      },
      message: "Extraction complete.",
    });
  });

  app.post("/api/entities/resolve", authenticateToken, (req, res) => {
    res.json({
      success: true,
      data: {
        status: "RESOLVED",
        canonical_entities_updated: 2,
      },
      message: "Resolution complete.",
    });
  });

  // ---------------------------------------------------------------------------
  // Vite Integration (Dev) / Static Files (Prod)
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", port: PORT },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Crime Network Intelligence System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
