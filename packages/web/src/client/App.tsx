import React, { useState, useEffect } from "react";
import { api, type ServiceInfo, type SecretEntry, type MemberInfo, type SetupStatus } from "./api.js";
import { SetupWizard } from "./SetupWizard.js";

type Tab = "secrets" | "members";

export function App() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    api
      .getSetupStatus()
      .then(setSetupStatus)
      .catch(() => {
        // If setup endpoint fails, assume vault is initialized (backwards compat)
        setSetupStatus({ vault_initialized: true, has_remote: true, gh: { authenticated: false, username: null } });
      })
      .finally(() => setCheckingSetup(false));
  }, []);

  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (setupStatus && !setupStatus.vault_initialized) {
    return (
      <SetupWizard
        ghAuthenticated={setupStatus.gh.authenticated}
        ghUsername={setupStatus.gh.username}
        onComplete={() => {
          setSetupStatus({ ...setupStatus, vault_initialized: true });
        }}
      />
    );
  }

  return <Dashboard />;
}

function Dashboard() {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [selectedService, setSelectedService] = useState<string>("");
  const [selectedEnv, setSelectedEnv] = useState<string>("");
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [tab, setTab] = useState<Tab>("secrets");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getServices().then((svcs) => {
      setServices(svcs);
      if (svcs.length > 0) {
        setSelectedService(svcs[0].name);
        if (svcs[0].environments.length > 0) {
          setSelectedEnv(svcs[0].environments[0]);
        }
      }
      setLoading(false);
    });
    api.getMembers().then(setMembers);
  }, []);

  useEffect(() => {
    if (selectedService && selectedEnv) {
      api.getSecrets(selectedService, selectedEnv).then(setSecrets);
    }
  }, [selectedService, selectedEnv]);

  const currentService = services.find((s) => s.name === selectedService);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">dotk</h1>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
              v0.1.7
            </span>
          </div>
          <nav className="flex gap-1">
            <button
              onClick={() => setTab("secrets")}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                tab === "secrets"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Secrets
            </button>
            <button
              onClick={() => setTab("members")}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                tab === "members"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Members
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {tab === "secrets" ? (
          <SecretsView
            services={services}
            selectedService={selectedService}
            selectedEnv={selectedEnv}
            currentService={currentService}
            secrets={secrets}
            onSelectService={(s) => {
              setSelectedService(s);
              const svc = services.find((sv) => sv.name === s);
              if (svc && svc.environments.length > 0) {
                setSelectedEnv(svc.environments[0]);
              }
            }}
            onSelectEnv={setSelectedEnv}
            onRefresh={() => {
              if (selectedService && selectedEnv) {
                api.getSecrets(selectedService, selectedEnv).then(setSecrets);
              }
            }}
          />
        ) : (
          <MembersView members={members} />
        )}
      </main>
    </div>
  );
}

function SecretsView({
  services,
  selectedService,
  selectedEnv,
  currentService,
  secrets,
  onSelectService,
  onSelectEnv,
  onRefresh,
}: {
  services: ServiceInfo[];
  selectedService: string;
  selectedEnv: string;
  currentService?: ServiceInfo;
  secrets: SecretEntry[];
  onSelectService: (s: string) => void;
  onSelectEnv: (e: string) => void;
  onRefresh: () => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newKey.trim() || !selectedService || !selectedEnv) return;
    setSaving(true);
    await api.setSecret(selectedService, selectedEnv, newKey, newValue);
    setNewKey("");
    setNewValue("");
    onRefresh();
    setSaving(false);
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete ${key}?`)) return;
    await api.deleteSecret(selectedService, selectedEnv, key);
    onRefresh();
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Service & Environment selector */}
      <div className="flex gap-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Service</label>
          <select
            value={selectedService}
            onChange={(e) => onSelectService(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
          >
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Environment
          </label>
          <select
            value={selectedEnv}
            onChange={(e) => onSelectEnv(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
          >
            {(currentService?.environments ?? []).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Secrets table */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">
                Key
              </th>
              <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">
                Value
              </th>
              <th className="px-4 py-2.5 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {secrets.map((s) => (
              <tr
                key={s.key}
                className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
              >
                <td className="px-4 py-2.5 font-mono text-zinc-200">
                  {s.key}
                </td>
                <td className="px-4 py-2.5 font-mono text-zinc-400">
                  {revealed.has(s.key) ? s.value : "••••••••"}
                </td>
                <td className="px-4 py-2.5 text-right space-x-2">
                  <button
                    onClick={() => toggleReveal(s.key)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs"
                  >
                    {revealed.has(s.key) ? "hide" : "show"}
                  </button>
                  <button
                    onClick={() => handleDelete(s.key)}
                    className="text-red-500/60 hover:text-red-400 text-xs"
                  >
                    delete
                  </button>
                </td>
              </tr>
            ))}
            {secrets.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-zinc-600"
                >
                  No secrets yet. Add one below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add secret form */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs text-zinc-500 mb-1">Key</label>
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="DATABASE_URL"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div className="flex-[2]">
          <label className="block text-xs text-zinc-500 mb-1">Value</label>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="postgres://localhost/mydb"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-zinc-500"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving || !newKey.trim()}
          className="px-4 py-1.5 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Add"}
        </button>
      </div>
    </div>
  );
}

function MembersView({ members }: { members: MemberInfo[] }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Members</h2>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">
                Name
              </th>
              <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">
                Role
              </th>
              <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">
                Public Key
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr
                key={m.name}
                className="border-b border-zinc-800/50 hover:bg-zinc-900/30"
              >
                <td className="px-4 py-2.5 text-zinc-200">{m.name}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      m.role === "admin"
                        ? "bg-amber-900/30 text-amber-400"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-zinc-500 text-xs">
                  {m.public_key.slice(0, 20)}...
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-zinc-600"
                >
                  No members configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
