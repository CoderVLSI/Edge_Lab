import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { join } from "path";

const PROJECTS_BASE = process.env.PROJECTS_DIR ?? join(process.cwd(), "../../projects");

export function getProjectPath(projectId: string): string {
  // Sanitize: only allow alphanumeric, hyphens, underscores
  if (!/^[\w-]+$/.test(projectId)) throw new Error("Invalid project ID");
  return join(PROJECTS_BASE, projectId);
}

export function git(projectId: string): SimpleGit {
  return simpleGit(getProjectPath(projectId), { binary: "git" });
}

export interface GitStatus {
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
  isRepo: boolean;
}

export interface FileStatus {
  path: string;
  status: string;
  statusLabel: string;
}

const STATUS_LABELS: Record<string, string> = {
  M: "Modified", A: "Added", D: "Deleted", R: "Renamed",
  C: "Copied", U: "Unmerged", "?": "Untracked", "!": "Ignored",
};

function mapFiles(files: StatusResult["files"], staged: boolean): FileStatus[] {
  return files
    .filter((f) => {
      const code = staged ? f.index : f.working_dir;
      return code !== " " && code !== "?";
    })
    .map((f) => {
      const code = staged ? f.index : f.working_dir;
      return {
        path: f.path,
        status: code,
        statusLabel: STATUS_LABELS[code] ?? code,
      };
    });
}

export async function getStatus(projectId: string): Promise<GitStatus> {
  const g = git(projectId);
  try {
    const [status, branch] = await Promise.all([
      g.status(),
      g.branch(),
    ]);
    return {
      branch: status.current ?? "HEAD",
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: mapFiles(status.files, true),
      unstaged: mapFiles(status.files, false),
      untracked: status.not_added,
      isRepo: true,
    };
  } catch {
    return { branch: "", tracking: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], isRepo: false };
  }
}

export async function initRepo(projectId: string): Promise<void> {
  await git(projectId).init();
  await git(projectId).raw(["config", "user.email", "edgelab@local"]);
  await git(projectId).raw(["config", "user.name", "Edge Lab"]);
}

export async function getBranches(projectId: string) {
  const result = await git(projectId).branch(["-a"]);
  return {
    current: result.current,
    all: Object.entries(result.branches).map(([name, b]) => ({
      name,
      current: b.current,
      remote: name.startsWith("remotes/"),
      commit: b.commit,
      label: b.label,
    })),
  };
}

export async function getDiff(projectId: string, filePath: string, staged: boolean) {
  const g = git(projectId);
  const args = staged ? ["--cached", "--", filePath] : ["--", filePath];
  return g.diff(args);
}

export async function getLog(projectId: string, limit = 20) {
  const log = await git(projectId).log({ maxCount: limit });
  return log.all.map((c) => ({
    hash: c.hash,
    hashShort: c.hash.slice(0, 7),
    message: c.message,
    author: c.author_name,
    email: c.author_email,
    date: c.date,
  }));
}
