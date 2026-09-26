-- Phones that want a push when the daily workout appears.
CREATE TABLE IF NOT EXISTS devices (
  token TEXT PRIMARY KEY,          -- Expo push token
  timezone TEXT NOT NULL,          -- IANA name, used for quiet hours
  last_thread_id TEXT,             -- thread this device was last notified about
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row-per-key app state. 'current' holds the thread whose workout was
-- most recently detected, as JSON: {threadId, summary, foundAt}.
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- User reports of objectionable content (Apple Guideline 1.2). Reviewed within 24h.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  author TEXT,
  permalink TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
