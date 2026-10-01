PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,avatar TEXT,profile TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),profile TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS characters_user ON characters(user_id);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,challenge TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL,challenge TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS raids(id INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',version INTEGER NOT NULL DEFAULT 0,message_id TEXT,sync_error TEXT,publishing INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS signups(raid_id INTEGER REFERENCES raids(id),user_id TEXT REFERENCES users(id),profile TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',available TEXT NOT NULL DEFAULT '',seat TEXT NOT NULL,attended INTEGER NOT NULL DEFAULT 0,paid INTEGER NOT NULL DEFAULT 0,joined INTEGER NOT NULL,PRIMARY KEY(raid_id,user_id));
CREATE TABLE IF NOT EXISTS settlements(raid_id INTEGER PRIMARY KEY REFERENCES raids(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mutation_guard(value INTEGER CHECK(value=1));
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,raid_id INTEGER NOT NULL REFERENCES raids(id),kind TEXT NOT NULL,mode TEXT NOT NULL,template TEXT NOT NULL,minutes INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',message_id TEXT,error TEXT,retry_after INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_pending ON notifications(status,retry_after);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_schedule ON notifications(raid_id) WHERE mode='scheduled' AND status='pending';
CREATE TRIGGER IF NOT EXISTS creator_signup AFTER INSERT ON raids BEGIN
INSERT INTO signups(raid_id,user_id,profile,note,seat,joined) SELECT NEW.id,id,profile,'團長','confirmed',unixepoch()*1000 FROM users WHERE id=NEW.owner;
END;
