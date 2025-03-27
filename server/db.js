const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define the database file path
const dbPath = path.resolve(__dirname, 'conversations.db');

// Open (or create) the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create tables if they do not exist
db.serialize(() => {
  // Drop existing tables to avoid conflicts
  db.run(`DROP TABLE IF EXISTS messages`);
  db.run(`DROP TABLE IF EXISTS conversations`);

  // Create conversations table
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create messages table with branching support
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      parent_id INTEGER NULL,
      branch_root_id INTEGER NULL,
      role TEXT,
      content TEXT,
      selected_text TEXT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id),
      FOREIGN KEY(parent_id) REFERENCES messages(id),
      FOREIGN KEY(branch_root_id) REFERENCES messages(id)
    )
  `);
});

module.exports = db;