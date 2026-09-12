import { useEffect, useState } from "react";
import { ApiError, api } from "../services/api.js";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "INVESTIGATOR" });
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      const data = await api.listUsers();
      setUsers(data.items || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createUser(form);
      setNotice(`Successfully created ${form.email}.`);
      setForm({ name: "", email: "", password: "", role: "INVESTIGATOR" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed.");
    }
  }

  async function changeRole(id, role) {
    setError("");
    try {
      await api.setUserRole(id, role);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Role change failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Administration</h1>
        <p className="text-sm text-gray-500">Manage investigator credentials, roles, and access permissions.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Change Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                    value={user.role}
                    onChange={(event) => changeRole(user.id, event.target.value)}
                  >
                    {["INVESTIGATOR", "SENIOR_INVESTIGATOR", "ADMIN"].map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="grid max-w-lg gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm" onSubmit={create}>
        <h2 className="font-semibold text-gray-900">Provision New Investigator Account</h2>
        {["name", "email", "password"].map((field) => (
          <label key={field} className="text-sm">
            <span className="block font-medium capitalize text-gray-700 mb-1">{field}</span>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              type={field === "password" ? "password" : field === "email" ? "email" : "text"}
              value={form[field]}
              onChange={(event) => setForm({ ...form, [field]: event.target.value })}
              required
            />
          </label>
        ))}
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Role</span>
          <select
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
          >
            {["INVESTIGATOR", "SENIOR_INVESTIGATOR", "ADMIN"].map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800" type="submit">
          Create Account
        </button>
      </form>
    </div>
  );
}
