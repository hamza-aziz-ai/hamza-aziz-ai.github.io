-- Chat session logs (DECISIONS D-025). One row per chat session, one per
-- question and answer. Kept 365 days; the Worker's daily cron deletes older
-- sessions and their messages. No raw IP: ip_hash is a salted SHA-256 prefix.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,          -- random UUID made by the chat widget
  started_at  TEXT NOT NULL,             -- ISO 8601 UTC, first message
  last_at     TEXT NOT NULL,             -- ISO 8601 UTC, latest message
  ended_at    TEXT,                      -- set when the visitor leaves the page
  messages    INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'visitor',  -- 'eval' for the answer checks
  page        TEXT,                      -- path the chat was opened on
  country     TEXT,
  region      TEXT,
  city        TEXT,
  timezone    TEXT,
  as_org      TEXT,                      -- network operator, e.g. an ISP or company
  asn         INTEGER,
  ip_hash     TEXT,
  device      TEXT,                      -- 'mobile' or 'desktop'
  user_agent  TEXT
);

CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  at          TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT,
  status      INTEGER NOT NULL,          -- HTTP status the visitor got
  backend     TEXT,                      -- 'gemini', 'workers-ai' or NULL on failure
  ms          INTEGER                    -- time to answer
);

CREATE INDEX messages_session ON messages(session_id);
CREATE INDEX sessions_last ON sessions(last_at);
