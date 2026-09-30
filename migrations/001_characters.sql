CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),profile TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS characters_user ON characters(user_id);
