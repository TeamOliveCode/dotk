import React, { useState, useEffect } from "react";
import { api, type GithubRepo, type GithubOrg } from "./api.js";

type Step = "auth" | "repos" | "init" | "done";

interface Props {
  ghAuthenticated: boolean;
  ghUsername: string | null;
  vaultExists: boolean;
  onComplete: () => void;
}

export function SetupWizard({ ghAuthenticated, ghUsername, vaultExists, onComplete }: Props) {
  // If vault exists but no remote, skip to auth (then repos)
  const [step, setStep] = useState<Step>("auth");
  const [authed, setAuthed] = useState(ghAuthenticated);
  const [username, setUsername] = useState(ghUsername);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-2">dotk</h1>
          <p className="text-zinc-400 text-sm">Setup your secret vault</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(["auth", "repos", "init", "done"] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div className="w-8 h-px bg-zinc-800" />}
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors ${
                  s === step
                    ? "bg-zinc-100"
                    : (["auth", "repos", "init", "done"].indexOf(s) <
                        ["auth", "repos", "init", "done"].indexOf(step))
                      ? "bg-zinc-500"
                      : "bg-zinc-800"
                }`}
              />
            </React.Fragment>
          ))}
        </div>

        {/* Steps */}
        <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/30">
          {step === "auth" && (
            <AuthStep
              authed={authed}
              username={username}
              onAuthenticated={(u) => {
                setAuthed(true);
                setUsername(u);
              }}
              onContinue={() => setStep("repos")}
            />
          )}
          {step === "repos" && (
            <RepoStep
              onSelect={(repoUrl) => {
                setStep("init");
                // Pass repoUrl via a ref-like approach
                (window as any).__dotk_repo_url = repoUrl;
              }}
              onBack={() => setStep("auth")}
            />
          )}
          {step === "init" && (
            <InitStep
              repoUrl={(window as any).__dotk_repo_url || ""}
              onDone={(publicKey) => {
                (window as any).__dotk_public_key = publicKey;
                setStep("done");
              }}
              onError={() => setStep("repos")}
            />
          )}
          {step === "done" && (
            <DoneStep
              publicKey={(window as any).__dotk_public_key || ""}
              onContinue={onComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: GitHub Authentication ───

function AuthStep({
  authed,
  username,
  onAuthenticated,
  onContinue,
}: {
  authed: boolean;
  username: string | null;
  onAuthenticated: (username: string) => void;
  onContinue: () => void;
}) {
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tryingCli, setTryingCli] = useState(!authed);

  // Try gh CLI auth on mount
  useEffect(() => {
    if (authed) return;
    setTryingCli(true);
    api
      .authenticateGh()
      .then((res) => {
        onAuthenticated(res.username);
        setTryingCli(false);
      })
      .catch(() => {
        setTryingCli(false);
      });
  }, []);

  const handlePatSubmit = async () => {
    if (!pat.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.authenticateGh(pat.trim());
      onAuthenticated(res.username);
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">GitHub Authentication</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Connect to GitHub to store your encrypted vault.
      </p>

      {authed ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded bg-zinc-800/50 border border-zinc-700">
            <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 text-sm font-bold">
              {username?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="text-sm font-medium">{username}</p>
              <p className="text-xs text-zinc-500">Authenticated with GitHub</p>
            </div>
          </div>
          <button
            onClick={onContinue}
            className="w-full px-4 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            Continue
          </button>
        </div>
      ) : tryingCli ? (
        <div className="text-center py-4">
          <p className="text-zinc-400 text-sm">Checking gh CLI authentication...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500">
            Enter a GitHub Personal Access Token with <code className="text-zinc-300">repo</code> scope.
          </p>
          <div>
            <input
              type="password"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePatSubmit()}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>
          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <a
              href="https://github.com/settings/tokens/new?scopes=repo&description=dotk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 underline"
            >
              Create a token on GitHub
            </a>
            <button
              onClick={handlePatSubmit}
              disabled={loading || !pat.trim()}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Verifying..." : "Authenticate"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Repository Selection ───

function RepoStep({
  onSelect,
  onBack,
}: {
  onSelect: (repoUrl: string) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"select" | "create">("select");
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [orgs, setOrgs] = useState<GithubOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [repoSource, setRepoSource] = useState<"user" | string>("user");

  // New repo form
  const [newName, setNewName] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getGhRepos(), api.getGhOrgs()])
      .then(([r, o]) => {
        setRepos(r);
        setOrgs(o);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadRepos = async (source: string) => {
    setRepoSource(source);
    setLoading(true);
    try {
      if (source === "user") {
        setRepos(await api.getGhRepos());
      } else {
        setRepos(await api.getGhRepos("org", source));
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredRepos = repos.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const repo = await api.createGhRepo(
        newName.trim(),
        newOrg || undefined
      );
      onSelect(repo.clone_url);
    } catch (err: any) {
      setError(err.message || "Failed to create repository");
    } finally {
      setCreating(false);
    }
  };

  const handleSelectRepo = (repo: GithubRepo) => {
    if (!repo.private) {
      if (
        !confirm(
          `"${repo.full_name}" is a public repository. Encrypted secrets will be visible to everyone. Continue?`
        )
      ) {
        return;
      }
    }
    if (repo.size > 0) {
      if (
        !confirm(
          `"${repo.full_name}" is not empty. This may cause conflicts. Continue?`
        )
      ) {
        return;
      }
    }
    onSelect(repo.clone_url);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Choose Repository</h2>
      <p className="text-zinc-400 text-sm mb-4">
        Select an existing repo or create a new private repo for your vault.
      </p>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setMode("select")}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            mode === "select"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Existing repo
        </button>
        <button
          onClick={() => setMode("create")}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            mode === "create"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          New repo
        </button>
      </div>

      {mode === "select" ? (
        <div className="space-y-3">
          {/* Source filter */}
          <div className="flex gap-2">
            <select
              value={repoSource}
              onChange={(e) => loadRepos(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            >
              <option value="user">Personal</option>
              {orgs.map((o) => (
                <option key={o.login} value={o.login}>
                  {o.login}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter repositories..."
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Repo list */}
          <div className="max-h-64 overflow-y-auto border border-zinc-800 rounded">
            {loading ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                Loading repositories...
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                No repositories found.
              </div>
            ) : (
              filteredRepos.map((repo) => (
                <button
                  key={repo.full_name}
                  onClick={() => handleSelectRepo(repo)}
                  className="w-full text-left px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/50 transition-colors last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{repo.name}</span>
                    <div className="flex items-center gap-2">
                      {repo.size > 0 && (
                        <span className="text-xs text-amber-500">non-empty</span>
                      )}
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          repo.private
                            ? "bg-zinc-800 text-zinc-400"
                            : "bg-amber-900/30 text-amber-400"
                        }`}
                      >
                        {repo.private ? "private" : "public"}
                      </span>
                    </div>
                  </div>
                  {repo.description && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">
                      {repo.description}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Owner</label>
            <select
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            >
              <option value="">Personal account</option>
              {orgs.map((o) => (
                <option key={o.login} value={o.login}>
                  {o.login}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Repository name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="my-secrets"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-zinc-500"
            />
          </div>
          <p className="text-xs text-zinc-600">
            A private repository will be created.
          </p>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="w-full px-4 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? "Creating..." : "Create Repository"}
          </button>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <button
          onClick={onBack}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Initialization Progress ───

function InitStep({
  repoUrl,
  onDone,
  onError,
}: {
  repoUrl: string;
  onDone: (publicKey: string) => void;
  onError: () => void;
}) {
  const [stages, setStages] = useState([
    { label: "Creating vault structure", status: "pending" as "pending" | "active" | "done" | "error" },
    { label: "Generating encryption keys", status: "pending" as "pending" | "active" | "done" | "error" },
    { label: "Connecting to remote", status: "pending" as "pending" | "active" | "done" | "error" },
    { label: "Pushing initial commit", status: "pending" as "pending" | "active" | "done" | "error" },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Animate stages progressively
      for (let i = 0; i < 4; i++) {
        if (cancelled) return;
        setStages((prev) =>
          prev.map((s, j) => (j === i ? { ...s, status: "active" } : s))
        );
        // Small delay for visual feedback
        await new Promise((r) => setTimeout(r, 400));
        if (i < 3) {
          setStages((prev) =>
            prev.map((s, j) => (j === i ? { ...s, status: "done" } : s))
          );
        }
      }

      try {
        const result = await api.initVault(repoUrl);
        if (cancelled) return;
        setStages((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
        // Brief delay to show completion
        await new Promise((r) => setTimeout(r, 500));
        onDone(result.publicKey);
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Initialization failed");
        setStages((prev) =>
          prev.map((s) =>
            s.status === "active" ? { ...s, status: "error" } : s
          )
        );
      }
    }

    run();
    return () => { cancelled = true; };
  }, [repoUrl]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Initializing Vault</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Setting up your encrypted vault...
      </p>

      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              {stage.status === "pending" && (
                <div className="w-2 h-2 rounded-full bg-zinc-700" />
              )}
              {stage.status === "active" && (
                <div className="w-3 h-3 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
              )}
              {stage.status === "done" && (
                <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {stage.status === "error" && (
                <svg className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <span
              className={`text-sm ${
                stage.status === "done"
                  ? "text-zinc-300"
                  : stage.status === "active"
                    ? "text-zinc-100"
                    : stage.status === "error"
                      ? "text-red-400"
                      : "text-zinc-600"
              }`}
            >
              {stage.label}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-6 space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <p className="text-zinc-500 text-xs">
            The local vault may have been created. You can try pushing manually
            with <code className="text-zinc-400">git push -u origin main</code>.
          </p>
          <button
            onClick={onError}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Back to repository selection
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Done ───

function DoneStep({
  publicKey,
  onContinue,
}: {
  publicKey: string;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Vault Ready</h2>
      <p className="text-zinc-400 text-sm mb-6">
        Your encrypted vault has been created and pushed to GitHub.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Your public key
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-300 truncate">
              {publicKey}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-1">
            Share this key with team members who need access.
          </p>
        </div>

        <button
          onClick={onContinue}
          className="w-full px-4 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          Open Dashboard
        </button>
      </div>
    </div>
  );
}
