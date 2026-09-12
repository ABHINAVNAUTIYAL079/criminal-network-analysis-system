import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute, RoleRoute, useAuth } from "./auth/AuthContext.jsx";
import Anomalies from "./pages/Anomalies.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import EntityProfile from "./pages/EntityProfile.jsx";
import Investigation from "./pages/Investigation.jsx";
import Login from "./pages/Login.jsx";
import NetworkExplorer from "./pages/NetworkExplorer.jsx";
import Users from "./pages/Users.jsx";

function linkClass({ isActive }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "bg-blue-700 text-white shadow-sm" : "text-gray-700 hover:bg-gray-100"
  }`;
}

function Shell() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="no-print border-b border-gray-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-blue-700 text-xs font-bold text-white">
                CN
              </span>
              <span className="text-base font-bold tracking-tight text-gray-900">
                Crime Network Intelligence
              </span>
            </Link>
            {user ? (
              <nav className="flex flex-wrap items-center gap-1">
                <NavLink to="/" end className={linkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/network" className={linkClass}>
                  Network Explorer
                </NavLink>
                <NavLink to="/anomalies" className={linkClass}>
                  Anomalies
                </NavLink>
                {isAdmin ? (
                  <NavLink to="/users" className={linkClass}>
                    Users
                  </NavLink>
                ) : null}
              </nav>
            ) : null}
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right text-xs">
                <div className="font-semibold text-gray-900">{user.name || user.email}</div>
                <div className="font-mono text-gray-500">{user.role}</div>
              </div>
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
                type="button"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/network"
            element={
              <ProtectedRoute>
                <NetworkExplorer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entities/:id"
            element={
              <ProtectedRoute>
                <EntityProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/anomalies"
            element={
              <ProtectedRoute>
                <Anomalies />
              </ProtectedRoute>
            }
          />
          <Route
            path="/investigation/:id"
            element={
              <ProtectedRoute>
                <Investigation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <RoleRoute roles={["ADMIN"]}>
                <Users />
              </RoleRoute>
            }
          />
          <Route path="*" element={<p className="text-sm text-gray-500">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
