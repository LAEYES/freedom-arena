-- FA-WORLD-039: persist bounded combat status effects between encounters.
ALTER TABLE players ADD COLUMN status_effects TEXT NOT NULL DEFAULT '[]';
