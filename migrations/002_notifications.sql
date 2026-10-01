CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,raid_id INTEGER NOT NULL REFERENCES raids(id),kind TEXT NOT NULL,mode TEXT NOT NULL,template TEXT NOT NULL,minutes INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'pending',message_id TEXT,error TEXT,retry_after INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_pending ON notifications(status,retry_after);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_schedule ON notifications(raid_id) WHERE mode='scheduled' AND status='pending';
