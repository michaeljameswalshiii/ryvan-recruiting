/**
 * GitHub writes for System Ops (branch, commit, PR, merge).
 * Production cannot edit the Vercel working tree — this is the path to prod.
 * @serverOnly
 */

export type GitHubRepo = {
  owner: string;
  repo: string;
  defaultBranch: string;
};

export type GitHubFile = {
  path: string;
  content: string;
  sha?: string;
};

export type OpsPull = {
  number: number;
  title: string;
  url: string;
  branch: string;
  body: string;
  draft: boolean;
  mergeable: boolean | null;
  mergeableState?: string;
  clusterKey?: string;
};

const CLUSTER_RE = /ops-cluster-key:\s*([a-z0-9._|-]+)/i;

export function githubToken(): string {
  return (
    process.env.GITHUB_OPS_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    ""
  ).trim();
}

export function githubConfigured(): boolean {
  return Boolean(githubToken());
}

export function githubRepoFromEnv(): { owner: string; repo: string } {
  const slug = (
    process.env.GITHUB_REPO ||
    process.env.VERCEL_GIT_REPO_SLUG ||
    "turnkey-optimization"
  ).trim();
  const owner = (
    process.env.GITHUB_REPO_OWNER ||
    process.env.VERCEL_GIT_REPO_OWNER ||
    "michaeljameswalshiii"
  ).trim();
  if (slug.includes("/")) {
    const [o, r] = slug.split("/");
    return { owner: o || owner, repo: r || "turnkey-optimization" };
  }
  return { owner, repo: slug };
}

export function clusterKeyFromBody(body?: string | null): string | undefined {
  const match = String(body || "").match(CLUSTER_RE);
  return match?.[1];
}

async function gh<T>(
  path: string,
  init?: RequestInit & { raw?: boolean }
): Promise<T> {
  const token = githubToken();
  if (!token) throw new Error("GITHUB_OPS_TOKEN is not configured");
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "trio-system-ops",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status} ${path}: ${text.slice(0, 240)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function getGitHubRepo(): Promise<GitHubRepo> {
  const { owner, repo } = githubRepoFromEnv();
  const data = await gh<{ default_branch?: string }>(`/repos/${owner}/${repo}`);
  return {
    owner,
    repo,
    defaultBranch: data.default_branch || process.env.GITHUB_DEFAULT_BRANCH || "master",
  };
}

export async function getFileOnBranch(
  repo: GitHubRepo,
  path: string,
  ref: string
): Promise<GitHubFile | null> {
  try {
    const data = await gh<{
      content?: string;
      encoding?: string;
      sha?: string;
      type?: string;
    }>(
      `/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`
    );
    if (!data || data.type === "dir" || typeof data.content !== "string") return null;
    const content =
      data.encoding === "base64"
        ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
        : data.content;
    return { path, content, sha: data.sha };
  } catch (err) {
    if (err instanceof Error && /GitHub 404/.test(err.message)) return null;
    throw err;
  }
}

export async function createBranch(
  repo: GitHubRepo,
  branch: string,
  fromBranch = repo.defaultBranch
): Promise<void> {
  const ref = await gh<{ object?: { sha?: string } }>(
    `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`
  );
  const sha = ref.object?.sha;
  if (!sha) throw new Error(`Could not resolve ${fromBranch}`);
  await gh(`/repos/${repo.owner}/${repo.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}

export async function putFilesOnBranch(input: {
  repo: GitHubRepo;
  branch: string;
  message: string;
  files: Array<{ path: string; content: string }>;
}): Promise<void> {
  for (const file of input.files) {
    const existing = await getFileOnBranch(input.repo, file.path, input.branch);
    await gh(
      `/repos/${input.repo.owner}/${input.repo.repo}/contents/${encodeURI(file.path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: input.message,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch: input.branch,
          sha: existing?.sha,
        }),
      }
    );
  }
}

export async function createOpsPull(input: {
  repo: GitHubRepo;
  branch: string;
  title: string;
  body: string;
}): Promise<OpsPull> {
  const data = await gh<{
    number: number;
    title: string;
    html_url: string;
    body?: string;
    draft?: boolean;
    head?: { ref?: string };
  }>(`/repos/${input.repo.owner}/${input.repo.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      head: input.branch,
      base: input.repo.defaultBranch,
      body: input.body,
      draft: false,
    }),
  });
  return {
    number: data.number,
    title: data.title,
    url: data.html_url,
    branch: data.head?.ref || input.branch,
    body: data.body || input.body,
    draft: Boolean(data.draft),
    mergeable: null,
    clusterKey: clusterKeyFromBody(data.body || input.body),
  };
}

export async function listOpenOpsPulls(repo?: GitHubRepo): Promise<OpsPull[]> {
  const r = repo || (await getGitHubRepo());
  const rows = await gh<
    Array<{
      number: number;
      title: string;
      html_url: string;
      body?: string;
      draft?: boolean;
      head?: { ref?: string };
    }>
  >(`/repos/${r.owner}/${r.repo}/pulls?state=open&per_page=30`);
  return (rows || [])
    .filter((row) => {
      const branch = row.head?.ref || "";
      return branch.startsWith("ops/fix-") || Boolean(clusterKeyFromBody(row.body));
    })
    .map((row) => ({
      number: row.number,
      title: row.title,
      url: row.html_url,
      branch: row.head?.ref || "",
      body: row.body || "",
      draft: Boolean(row.draft),
      mergeable: null,
      clusterKey: clusterKeyFromBody(row.body),
    }));
}

export async function getOpsPull(
  repo: GitHubRepo,
  pullNumber: number
): Promise<OpsPull> {
  const data = await gh<{
    number: number;
    title: string;
    html_url: string;
    body?: string;
    draft?: boolean;
    mergeable?: boolean | null;
    mergeable_state?: string;
    head?: { ref?: string };
  }>(`/repos/${repo.owner}/${repo.repo}/pulls/${pullNumber}`);
  return {
    number: data.number,
    title: data.title,
    url: data.html_url,
    branch: data.head?.ref || "",
    body: data.body || "",
    draft: Boolean(data.draft),
    mergeable: typeof data.mergeable === "boolean" ? data.mergeable : null,
    mergeableState: data.mergeable_state,
    clusterKey: clusterKeyFromBody(data.body),
  };
}

export function isOpsPull(pull: Pick<OpsPull, "branch" | "body">): boolean {
  return pull.branch.startsWith("ops/fix-") || Boolean(clusterKeyFromBody(pull.body));
}

export async function mergeOpsPull(input: {
  repo: GitHubRepo;
  pullNumber: number;
  title?: string;
}): Promise<{ sha: string; merged: boolean; message: string }> {
  const pull = await getOpsPull(input.repo, input.pullNumber);
  if (!isOpsPull(pull)) {
    throw new Error("Only System Ops fix PRs can be merged from this screen");
  }
  const data = await gh<{ sha?: string; merged?: boolean; message?: string }>(
    `/repos/${input.repo.owner}/${input.repo.repo}/pulls/${input.pullNumber}/merge`,
    {
      method: "PUT",
      body: JSON.stringify({
        merge_method: "squash",
        commit_title: input.title || pull.title,
        commit_message: "Merged from Trio System Ops.",
      }),
    }
  );
  return {
    sha: data.sha || "",
    merged: data.merged === true,
    message: data.message || "Merged",
  };
}

export async function findOpenPullForCluster(
  clusterKey: string,
  pulls?: OpsPull[]
): Promise<OpsPull | undefined> {
  const list = pulls || (await listOpenOpsPulls().catch(() => []));
  return list.find((pull) => pull.clusterKey === clusterKey);
}
