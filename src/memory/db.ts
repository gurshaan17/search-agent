import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SearchResult } from '../search/types.js';

export interface Turn {
  id: number; user_id: string; conversation_id: string; role: 'user' | 'assistant';
  content: string; created_at: string; tz: string;
}
export interface Exchange { question: Turn; answer: Turn }
export interface MemoryChunk { role: 'user' | 'assistant'; start: number; text: string; vector: number[] }
export interface SearchLog {
  query: string; since?: string; until?: string; resultCount: number; latencyMs: number; failed?: boolean;
}
export class MemoryStore {
  private db: Database.Database;
  constructor(path = 'data/chat.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
        created_at TEXT NOT NULL, tz TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS turns_user_date ON turns(user_id, created_at);
      CREATE INDEX IF NOT EXISTS turns_conversation ON turns(user_id, conversation_id, id);
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY, turn_id INTEGER NOT NULL REFERENCES turns(id), n INTEGER NOT NULL,
        url TEXT NOT NULL, title TEXT NOT NULL, published_date TEXT, retrieved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS searches (
        id INTEGER PRIMARY KEY, turn_id INTEGER NOT NULL REFERENCES turns(id), query TEXT NOT NULL,
        since TEXT, until_date TEXT, result_count INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
        failed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS memory_index (
        answer_id INTEGER PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE, version TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_chunks (
        answer_id INTEGER NOT NULL REFERENCES memory_index(answer_id) ON DELETE CASCADE,
        chunk INTEGER NOT NULL, role TEXT NOT NULL, start INTEGER NOT NULL,
        text TEXT NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(answer_id,chunk));
      CREATE TRIGGER IF NOT EXISTS memory_invalidate AFTER UPDATE OF content ON turns BEGIN
        DELETE FROM memory_index WHERE question_id=new.id OR answer_id=new.id; END;
      CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts USING fts5(content, content='turns', content_rowid='id');
      CREATE TRIGGER IF NOT EXISTS turns_ai AFTER INSERT ON turns BEGIN
        INSERT INTO turns_fts(rowid,content) VALUES(new.id,new.content); END;
      CREATE TRIGGER IF NOT EXISTS turns_ad AFTER DELETE ON turns BEGIN
        INSERT INTO turns_fts(turns_fts,rowid,content) VALUES('delete',old.id,old.content); END;
      CREATE TRIGGER IF NOT EXISTS turns_au AFTER UPDATE ON turns BEGIN
        INSERT INTO turns_fts(turns_fts,rowid,content) VALUES('delete',old.id,old.content);
        INSERT INTO turns_fts(rowid,content) VALUES(new.id,new.content); END;
    `);
  }
  close() { this.db.close(); }
  saveTurn(turn: Omit<Turn, 'id'>): number {
    return Number(this.db.prepare(`INSERT INTO turns(user_id,conversation_id,role,content,created_at,tz) VALUES(?,?,?,?,?,?)`)
      .run(turn.user_id, turn.conversation_id, turn.role, turn.content, new Date(turn.created_at).toISOString(), turn.tz).lastInsertRowid);
  }
  saveEvidence(turnId: number, sources: SearchResult[], searches: SearchLog[], retrievedAt: string) {
    this.db.transaction(() => {
      for (const s of sources) this.db.prepare('INSERT INTO sources(turn_id,n,url,title,published_date,retrieved_at) VALUES(?,?,?,?,?,?)')
        .run(turnId, Number(s.id.slice(1)), s.url, s.title, s.publishedDate, retrievedAt);
      for (const s of searches) this.db.prepare('INSERT INTO searches(turn_id,query,since,until_date,result_count,latency_ms,failed) VALUES(?,?,?,?,?,?,?)')
        .run(turnId, s.query, s.since ?? null, s.until ?? null, s.resultCount, s.latencyMs, Number(s.failed ?? false));
    })();
  }
  conversationTurns(userId: string, conversationId: string): Turn[] {
    return this.db.prepare<[string, string], Turn>('SELECT * FROM (SELECT * FROM turns WHERE user_id=? AND conversation_id=? ORDER BY id DESC LIMIT 40) ORDER BY id').all(userId, conversationId);
  }
  conversationList(userId: string, before?: number) {
    const rows = this.db.prepare<[string, number | null, number | null], { id: string; title: string; updatedAt: string; lastTurnId: number }>(`
      SELECT t.conversation_id AS id,
        COALESCE((SELECT substr(f.content,1,100) FROM turns f WHERE f.user_id=t.user_id AND f.conversation_id=t.conversation_id AND f.role='user' ORDER BY f.id LIMIT 1),'Untitled chat') AS title,
        (SELECT l.created_at FROM turns l WHERE l.user_id=t.user_id AND l.conversation_id=t.conversation_id ORDER BY l.id DESC LIMIT 1) AS updatedAt,
        MAX(t.id) AS lastTurnId
      FROM turns t WHERE t.user_id=? GROUP BY t.conversation_id
      HAVING (? IS NULL OR MAX(t.id)<?) ORDER BY lastTurnId DESC LIMIT 31
    `).all(userId, before ?? null, before ?? null);
    const conversations = rows.slice(0,30);
    return { conversations, nextCursor: rows.length > 30 ? conversations.at(-1)!.lastTurnId : null };
  }
  conversationPage(userId: string, conversationId: string, before?: number) {
    const rows = this.db.prepare<[string, string, number | null, number | null], Turn>(`
      SELECT * FROM turns WHERE user_id=? AND conversation_id=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT 101
    `).all(userId, conversationId, before ?? null, before ?? null);
    const page = rows.slice(0,100).reverse();
    return { messages: page.map(t => ({ id: t.id, role: t.role, content: t.content, createdAt: t.created_at,
      sources: t.role === 'assistant' ? this.sources(t.id).map(s => ({ n: s.n, title: s.title, url: s.url,
        domain: URL.canParse(s.url) ? new URL(s.url).hostname : '', publishedDate: s.published_date })) : [],
    })), nextCursor: rows.length > 100 ? page[0].id : null };
  }
  turnsInRange(userId: string, start: string, end: string): Turn[] {
    return this.db.prepare<[string, string, string], Turn>(`SELECT * FROM turns WHERE user_id=? AND role='user' AND created_at>=? AND created_at<? ORDER BY created_at DESC,id DESC LIMIT 100`).all(userId,start,end);
  }
  keywordTurns(userId: string, words: string[], before = new Date().toISOString()): Turn[] {
    if (!words.length) return [];
    // Quoted tokens prevent user text from becoming FTS operators or syntax.
    const match = words.map(w => `"${w.replaceAll('"', '""')}"`).join(' OR ');
    return this.db.prepare<[string, string, string], Turn>(`SELECT t.* FROM turns_fts JOIN turns t ON t.id=turns_fts.rowid WHERE turns_fts MATCH ? AND t.user_id=? AND t.created_at<=? ORDER BY rank LIMIT 100`).all(match,userId,before);
  }
  turn(userId: string, id: number): Turn | undefined {
    return this.db.prepare<[string, number], Turn>('SELECT * FROM turns WHERE user_id=? AND id=?').get(userId,id);
  }
  hasReplies(userId: string, before: string): boolean {
    return !!this.db.prepare<[string,string], { found: number }>("SELECT 1 AS found FROM turns WHERE user_id=? AND role='assistant' AND created_at<=? LIMIT 1").get(userId,before);
  }
  pendingExchanges(userId: string, before: string, version: string, limit = 8): Exchange[] {
    const answers = this.db.prepare<[string, string, string, number], Turn>(`
      SELECT a.* FROM turns a LEFT JOIN memory_index m ON m.answer_id=a.id AND m.version=?
      WHERE a.user_id=? AND a.role='assistant' AND a.created_at<=? AND m.answer_id IS NULL
      AND a.content NOT LIKE '%[Generation interrupted.]'
      AND (SELECT q.role FROM turns q WHERE q.user_id=a.user_id AND q.conversation_id=a.conversation_id AND q.id<a.id ORDER BY q.id DESC LIMIT 1)='user'
      ORDER BY a.id DESC LIMIT ?`).all(version,userId,before,limit);
    return answers.flatMap(answer => {
      const question = this.question(answer);
      return question && question.created_at <= before ? [{ question, answer }] : [];
    });
  }
  saveMemory(exchange: Exchange, version: string, chunks: MemoryChunk[]) {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_index WHERE answer_id=?').run(exchange.answer.id);
      this.db.prepare('INSERT INTO memory_index(answer_id,question_id,version) VALUES(?,?,?)').run(exchange.answer.id,exchange.question.id,version);
      chunks.forEach((c,i) => this.db.prepare('INSERT INTO memory_chunks VALUES(?,?,?,?,?,?)').run(exchange.answer.id,i,c.role,c.start,c.text,JSON.stringify(c.vector)));
    })();
  }
  *memoryChunks(userId: string, before: string, version: string) {
    const rows = this.db.prepare<[string, string, string, string], { answer_id: number; question_id: number; role: 'user' | 'assistant'; start: number; text: string; vector: string; asked_at: string }>(`
      SELECT c.*, m.question_id, q.created_at AS asked_at FROM memory_chunks c JOIN memory_index m ON m.answer_id=c.answer_id
      JOIN turns a ON a.id=m.answer_id JOIN turns q ON q.id=m.question_id
      WHERE a.user_id=? AND q.user_id=a.user_id AND a.created_at<=? AND q.created_at<=? AND m.version=?`).iterate(userId,before,before,version);
    for (const row of rows) yield { ...row, vector: JSON.parse(row.vector) as number[] };
  }
  memoryOwners(): string[] {
    return this.db.prepare<[], { user_id: string }>('SELECT DISTINCT user_id FROM turns').all().map(r => r.user_id);
  }
  nearbyTurns(turn: Turn, before: string): Turn[] {
    return this.db.prepare<[string, string, number, string], Turn>(`SELECT * FROM (SELECT * FROM turns WHERE user_id=? AND conversation_id=? AND id<? AND created_at<=? ORDER BY id DESC LIMIT 2) ORDER BY id`).all(turn.user_id,turn.conversation_id,turn.id,before);
  }
  question(turn: Turn): Turn | undefined {
    const previous = this.db.prepare<[string, string, number], Turn>('SELECT * FROM turns WHERE user_id=? AND conversation_id=? AND id<? ORDER BY id DESC LIMIT 1').get(turn.user_id,turn.conversation_id,turn.id);
    return previous?.role === 'user' ? previous : undefined;
  }
  reply(turn: Turn): Turn | undefined {
    const next = this.db.prepare<[string, string, number], Turn>('SELECT * FROM turns WHERE user_id=? AND conversation_id=? AND id>? ORDER BY id LIMIT 1').get(turn.user_id,turn.conversation_id,turn.id);
    return next?.role === 'assistant' ? next : undefined;
  }
  sources(turnId: number) {
    return this.db.prepare<[number], { n: number; title: string; url: string; published_date: string | null; retrieved_at: string }>('SELECT n,title,url,published_date,retrieved_at FROM sources WHERE turn_id=? ORDER BY n').all(turnId);
  }
}
