import { openDatabase } from './db.js';
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const store = openDatabase();
try {
  const count = store.sqlite.prepare('SELECT count(*) AS count FROM _migrations').get() as {
    count: number;
  };
  console.log(`Database migrations applied (${count.count} total).`);
} finally {
  store.close();
}
