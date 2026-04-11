const Database = require('better-sqlite3');

// connect to database (or create it if it doesn't exist)
const db = new Database('database.db');

console.log('Connected to SQlite database');

// create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    repo TEXT,
    last_seen_tag TEXT
  )
`);

module.exports = db;