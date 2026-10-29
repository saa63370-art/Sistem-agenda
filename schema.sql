CREATE TABLE IF NOT EXISTS agendas (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('rendah', 'sedang', 'tinggi')),
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    repeat TEXT NOT NULL CHECK(repeat IN ('none', 'daily', 'weekly', 'monthly')),
    remind INTEGER NOT NULL DEFAULT 10 CHECK(remind >= 0),
    status TEXT NOT NULL DEFAULT 'belum_dikerjakan'
        CHECK(status IN ('belum_dikerjakan', 'sedang_dikerjakan', 'selesai')),
    done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
    createdAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agendas_date_time ON agendas(date, time);
