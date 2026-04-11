const sqlite3 = require('sqlite3').verbose();

// connect to database (or create it if it doesn't exist)
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// create table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    repo TEXT,
    last_seen_tag TEXT
  )
`);

module.exports = db;