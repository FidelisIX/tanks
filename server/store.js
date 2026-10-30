'use strict';

// Durable storage for finished matches and for room backups across restarts.
// Same layout as in the Ortsraten project:
//  - GitHubStore: writes through the GitHub API into a data branch (default `statistik`),
//    one JSON line per match, one file per month (spiele/2026-10.jsonl), room backups in
//    raeume/<CODE>.json. The branch must NOT be the deploy branch, or every match would
//    trigger a redeploy.
//  - FileStore: local directory (development).
//  - MemoryStore: nothing survives a restart (no token configured).
// All stores: load() -> matches, append(match), saveRoom/loadRoom/deleteRoom/listRooms.

const fs = require('fs');
const path = require('path');

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      console.error('Statistik: ungültige Zeile übersprungen');
    }
  }
  return out;
}

const monthFile = (match) => `spiele/${match.endedAt.slice(0, 7)}.jsonl`;
const roomFile = (code) => `raeume/${String(code).toUpperCase().replace(/[^A-Z]/g, '')}.json`;

class MemoryStore {
  constructor() {
    this.description = 'nur im Arbeitsspeicher (STATS_GITHUB_TOKEN nicht gesetzt)';
    this.persistent = false;
    this.rooms = new Map();
  }
  async load() {
    return [];
  }
  async append() {}
  async saveRoom(code, snap) {
    this.rooms.set(roomFile(code), JSON.parse(JSON.stringify(snap)));
  }
  async loadRoom(code) {
    return this.rooms.get(roomFile(code)) || null;
  }
  async deleteRoom(code) {
    this.rooms.delete(roomFile(code));
  }
  async listRooms() {
    return [...this.rooms.values()].map((s) => s.code);
  }
}

class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.description = `Ordner ${dir}`;
    this.persistent = true;
  }
  file(rel) {
    return path.join(this.dir, rel);
  }
  async load() {
    const dir = this.file('spiele');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .flatMap((f) => parseLines(fs.readFileSync(path.join(dir, f), 'utf8')));
  }
  async append(match) {
    const f = this.file(monthFile(match));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(match) + '\n');
  }
  async saveRoom(code, snap) {
    const f = this.file(roomFile(code));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(snap));
  }
  async loadRoom(code) {
    const f = this.file(roomFile(code));
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  }
  async deleteRoom(code) {
    fs.rmSync(this.file(roomFile(code)), { force: true });
  }
  async listRooms() {
    const dir = this.file('raeume');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  }
}

class GitHubStore {
  // token: fine-grained token with "Contents: Read and write" on the repo only
  constructor({ token, repo, branch, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.files = new Map(); // path -> { text, sha }
    this.queue = Promise.resolve();
    this.description = `GitHub ${repo}, Branch ${branch}`;
    this.persistent = true;
  }

  request(method, apiPath, { body, raw = false } = {}) {
    return this.fetch(`${this.apiUrl}/repos/${this.repo}/${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'krater-kommando-server',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  contentsPath(p) {
    return `contents/${p.split('/').map(encodeURIComponent).join('/')}`;
  }

  async listDir(dir) {
    const res = await this.request('GET', `${this.contentsPath(dir)}?ref=${encodeURIComponent(this.branch)}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub: ${dir}/ nicht lesbar (${res.status})`);
    return (await res.json()).filter((e) => e.type === 'file');
  }

  async fetchFile(entry) {
    const res = await this.request('GET', `${this.contentsPath(entry.path)}?ref=${encodeURIComponent(this.branch)}`, {
      raw: true,
    });
    if (!res.ok) throw new Error(`GitHub: ${entry.path} nicht lesbar (${res.status})`);
    const text = await res.text();
    this.files.set(entry.path, { text, sha: entry.sha });
    return text;
  }

  async load() {
    const entries = (await this.listDir('spiele')).filter((e) => e.name.endsWith('.jsonl'));
    const out = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) out.push(...parseLines(await this.fetchFile(entry)));
    return out;
  }

  // writes run one after another so commits do not overtake each other
  append(match) {
    const run = this.queue.then(() => this.write(match));
    this.queue = run.catch(() => {});
    return run;
  }

  async write(match, attempt = 1) {
    const file = monthFile(match);
    const current = this.files.get(file) || { text: '', sha: undefined };
    const text = current.text + JSON.stringify(match) + '\n';
    const res = await this.request('PUT', this.contentsPath(file), {
      body: {
        message: `Statistik: Match ${match.room} (${match.endedAt})`,
        content: Buffer.from(text, 'utf8').toString('base64'),
        branch: this.branch,
        ...(current.sha ? { sha: current.sha } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      this.files.set(file, { text, sha: data.content.sha });
      return;
    }
    // 409/422: the file changed in between (sha mismatch) -> reload and retry
    if ((res.status === 409 || res.status === 422) && attempt < 3) {
      const entry = (await this.listDir('spiele')).find((e) => e.path === file);
      if (entry) await this.fetchFile(entry);
      else this.files.delete(file);
      return this.write(match, attempt + 1);
    }
    throw new Error(`GitHub: Speichern fehlgeschlagen (${res.status}) ${await res.text()}`);
  }

  async getJsonFile(file) {
    const res = await this.request('GET', `${this.contentsPath(file)}?ref=${encodeURIComponent(this.branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub: ${file} nicht lesbar (${res.status})`);
    const data = await res.json();
    return { sha: data.sha, json: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) };
  }

  async saveRoom(code, snap) {
    const file = roomFile(code);
    const existing = await this.getJsonFile(file);
    const res = await this.request('PUT', this.contentsPath(file), {
      body: {
        message: `Raum ${code} vor Neustart gesichert`,
        content: Buffer.from(JSON.stringify(snap), 'utf8').toString('base64'),
        branch: this.branch,
        ...(existing ? { sha: existing.sha } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub: Raum ${code} nicht gesichert (${res.status})`);
  }

  async loadRoom(code) {
    const file = await this.getJsonFile(roomFile(code));
    return file ? file.json : null;
  }

  async listRooms() {
    return (await this.listDir('raeume')).filter((e) => e.name.endsWith('.json')).map((e) => e.name.slice(0, -5));
  }

  async deleteRoom(code) {
    const file = roomFile(code);
    const existing = await this.getJsonFile(file);
    if (!existing) return;
    const res = await this.request('DELETE', this.contentsPath(file), {
      body: { message: `Raum ${code} wiederhergestellt`, sha: existing.sha, branch: this.branch },
    });
    if (!res.ok && res.status !== 404) throw new Error(`GitHub: Raum ${code} nicht gelöscht (${res.status})`);
  }
}

function createStore(env = process.env) {
  // own variable name so a generally set GITHUB_TOKEN is never picked up by accident
  if (env.STATS_GITHUB_TOKEN) {
    const branch = env.STATS_BRANCH || 'statistik';
    if (branch === (env.DEPLOY_BRANCH || 'main')) {
      throw new Error(`STATS_BRANCH darf nicht der Deploy-Branch "${branch}" sein.`);
    }
    return new GitHubStore({
      token: env.STATS_GITHUB_TOKEN,
      repo: env.STATS_REPO || 'FidelisIX/tanks',
      branch,
      apiUrl: env.GITHUB_API_URL,
    });
  }
  if (env.STATS_DIR) return new FileStore(env.STATS_DIR);
  return new MemoryStore();
}

module.exports = { createStore, GitHubStore, FileStore, MemoryStore, monthFile, roomFile };
