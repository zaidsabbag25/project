import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Store = {
  sqlite: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;
  close(): void;
};

export function openDatabase(path = process.env.DATABASE_PATH || 'data/marketplace.sqlite'): Store {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  if (path !== ':memory:') sqlite.pragma('journal_mode = WAL');
  try {
    sqlite.exec(
      'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)',
    );
    const candidates = [
      resolve('migrations'),
      fileURLToPath(new URL('../migrations', import.meta.url)),
      fileURLToPath(new URL('../../migrations', import.meta.url)),
    ];
    const directory = candidates.find(existsSync);
    if (!directory)
      throw new Error(
        'Database migration directory not found. Run commands from the project root.',
      );
    for (const name of readdirSync(directory)
      .filter((n) => /^\d.*\.sql$/.test(n))
      .sort()) {
      if (sqlite.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(name)) continue;
      sqlite.transaction(() => {
        sqlite.exec(readFileSync(resolve(directory, name), 'utf8'));
        sqlite
          .prepare('INSERT INTO _migrations(name, applied_at) VALUES (?, ?)')
          .run(name, new Date().toISOString());
      })();
    }
    return { sqlite, orm: drizzle(sqlite, { schema }), close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
