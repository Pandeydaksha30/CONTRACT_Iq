"use client";

import { useState } from "react";
import { Banner } from "@/components/icons";

export default function GateForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.assign(next); // a full load, so every page sees the new cookie
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(typeof body.detail === "string" ? body.detail : `Could not check the password (HTTP ${res.status}).`);
    } catch {
      setError("The ContractIQ service is not reachable. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel">
      <div className="panel-body">
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        <label className="field">
          <span className="field-label">Site password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </label>
        <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy || !password}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </div>
    </form>
  );
}
