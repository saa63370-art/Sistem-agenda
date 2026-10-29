import calendar
import json
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "agenda.db"
DEFAULTS = {
    "done": False,
    "category": "Lainnya",
    "priority": "sedang",
    "location": "",
    "notes": "",
    "repeat": "none",
    "remind": 10,
}


@contextmanager
def connect():
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with connect() as connection:
        connection.executescript((ROOT / "schema.sql").read_text(encoding="utf-8"))
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(agendas)")
        }
        if "status" not in columns:
            connection.execute(
                """
                ALTER TABLE agendas
                ADD COLUMN status TEXT NOT NULL DEFAULT 'belum_dikerjakan'
                    CHECK(status IN ('belum_dikerjakan', 'sedang_dikerjakan', 'selesai'))
                """
            )
            connection.execute(
                "UPDATE agendas SET status = CASE WHEN done = 1 THEN 'selesai' ELSE 'belum_dikerjakan' END"
            )


def row_to_agenda(row):
    agenda = dict(row)
    agenda["done"] = bool(agenda["done"])
    agenda["status"] = agenda["status"] if "status" in agenda else (
        "selesai" if agenda["done"] else "belum_dikerjakan"
    )
    return agenda


def read_agendas(connection):
    rows = connection.execute(
        "SELECT * FROM agendas ORDER BY date, time, createdAt"
    ).fetchall()
    return [row_to_agenda(row) for row in rows]


def normalize_agenda(data, agenda_id=None):
    if not isinstance(data, dict):
        raise ValueError("Data agenda harus berupa objek.")

    title = data.get("title")
    date = data.get("date")
    time = data.get("time")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 120:
        raise ValueError("Judul wajib diisi dan maksimal 120 karakter.")
    if not isinstance(date, str) or not isinstance(time, str):
        raise ValueError("Tanggal dan waktu wajib diisi.")
    try:
        datetime.strptime(date, "%Y-%m-%d")
        datetime.strptime(time, "%H:%M")
    except ValueError as error:
        raise ValueError("Format tanggal atau waktu tidak valid.") from error

    result = {
        "id": agenda_id or data.get("id"),
        "title": title.strip(),
        "date": date,
        "time": time,
        "category": data.get("category", DEFAULTS["category"]),
        "priority": data.get("priority", DEFAULTS["priority"]),
        "location": data.get("location", DEFAULTS["location"]),
        "notes": data.get("notes", DEFAULTS["notes"]),
        "repeat": data.get("repeat", DEFAULTS["repeat"]),
        "remind": data.get("remind", DEFAULTS["remind"]),
        "status": data.get(
            "status",
            "selesai" if data.get("done", DEFAULTS["done"]) else "belum_dikerjakan",
        ),
        "createdAt": data.get("createdAt", int(datetime.now().timestamp() * 1000)),
    }

    if not isinstance(result["id"], str) or not result["id"] or len(result["id"]) > 80:
        raise ValueError("ID agenda tidak valid.")
    if result["priority"] not in ("rendah", "sedang", "tinggi"):
        raise ValueError("Prioritas tidak valid.")
    if result["repeat"] not in ("none", "daily", "weekly", "monthly"):
        raise ValueError("Pengaturan pengulangan tidak valid.")
    if not isinstance(result["category"], str) or len(result["category"]) > 80:
        raise ValueError("Kategori tidak valid.")
    if not isinstance(result["location"], str) or len(result["location"]) > 120:
        raise ValueError("Lokasi maksimal 120 karakter.")
    if not isinstance(result["notes"], str) or len(result["notes"]) > 500:
        raise ValueError("Catatan maksimal 500 karakter.")
    if not isinstance(result["remind"], int) or isinstance(result["remind"], bool) or result["remind"] < 0:
        raise ValueError("Pengaturan pengingat tidak valid.")
    if result["status"] not in ("belum_dikerjakan", "sedang_dikerjakan", "selesai"):
        raise ValueError("Status agenda tidak valid.")
    result["done"] = result["status"] == "selesai"
    if not isinstance(result["createdAt"], int) or isinstance(result["createdAt"], bool):
        raise ValueError("Waktu pembuatan agenda tidak valid.")
    return result


def insert_agenda(connection, agenda):
    connection.execute(
        """
        INSERT INTO agendas
        (id, title, date, time, category, priority, location, notes, repeat, remind, status, done, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            agenda["id"], agenda["title"], agenda["date"], agenda["time"],
            agenda["category"], agenda["priority"], agenda["location"], agenda["notes"],
            agenda["repeat"], agenda["remind"], agenda["status"], int(agenda["done"]), agenda["createdAt"],
        ),
    )


def update_agenda(connection, agenda):
    cursor = connection.execute(
        """
        UPDATE agendas SET
        title = ?, date = ?, time = ?, category = ?, priority = ?, location = ?,
        notes = ?, repeat = ?, remind = ?, status = ?, done = ?, createdAt = ?
        WHERE id = ?
        """,
        (
            agenda["title"], agenda["date"], agenda["time"], agenda["category"],
            agenda["priority"], agenda["location"], agenda["notes"], agenda["repeat"],
            agenda["remind"], agenda["status"], int(agenda["done"]), agenda["createdAt"], agenda["id"],
        ),
    )
    return cursor.rowcount > 0


class AgendaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 2_000_000:
                raise ValueError("Ukuran data tidak valid.")
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Format JSON tidak valid.") from error

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/api/agendas":
            with connect() as connection:
                self.send_json(200, read_agendas(connection))
            return
        if path.startswith("/api/"):
            self.send_json(404, {"error": "Endpoint tidak ditemukan."})
            return
        if path not in ("/", "/index.html", "/app.js", "/style.css"):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        try:
            data = self.read_json()
            if path == "/api/agendas":
                agenda = normalize_agenda(data)
                with connect() as connection:
                    insert_agenda(connection, agenda)
                self.send_json(201, agenda)
                return

            if path == "/api/agendas/import":
                if not isinstance(data, list):
                    raise ValueError("Data impor harus berupa daftar agenda.")
                agendas = [normalize_agenda(item) for item in data]
                ids = [agenda["id"] for agenda in agendas]
                if len(ids) != len(set(ids)):
                    raise ValueError("ID agenda pada data impor harus unik.")
                with connect() as connection:
                    cursor = connection.executemany(
                        """
                        INSERT OR IGNORE INTO agendas
                        (id, title, date, time, category, priority, location, notes, repeat, remind, status, done, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        [
                            (
                                a["id"], a["title"], a["date"], a["time"], a["category"],
                                a["priority"], a["location"], a["notes"], a["repeat"],
                                a["remind"], a["status"], int(a["done"]), a["createdAt"],
                            )
                            for a in agendas
                        ],
                    )
                self.send_json(201, {"imported": cursor.rowcount})
                return

            match = re.fullmatch(r"/api/agendas/([^/]+)/toggle", path)
            if match:
                agenda_id = match.group(1)
                with connect() as connection:
                    connection.execute("BEGIN")
                    row = connection.execute(
                        "SELECT * FROM agendas WHERE id = ?", (agenda_id,)
                    ).fetchone()
                    if row is None:
                        self.send_json(404, {"error": "Agenda tidak ditemukan."})
                        return
                    agenda = row_to_agenda(row)
                    agenda["status"] = "belum_dikerjakan" if agenda["done"] else "selesai"
                    agenda["done"] = not agenda["done"]
                    update_agenda(connection, agenda)
                    next_agenda = None
                    if agenda["done"] and agenda["repeat"] != "none":
                        next_date = datetime.strptime(agenda["date"], "%Y-%m-%d")
                        if agenda["repeat"] == "daily":
                            next_date += timedelta(days=1)
                        elif agenda["repeat"] == "weekly":
                            next_date += timedelta(days=7)
                        else:
                            month = next_date.month % 12 + 1
                            year = next_date.year + (next_date.month // 12)
                            next_date = next_date.replace(
                                year=year, month=month,
                                day=min(next_date.day, calendar.monthrange(year, month)[1]),
                            )
                        next_agenda = dict(agenda)
                        next_agenda.update(
                            id=uuid.uuid4().hex,
                            done=False,
                            status="belum_dikerjakan",
                            createdAt=int(datetime.now().timestamp() * 1000),
                            date=next_date.strftime("%Y-%m-%d"),
                        )
                        insert_agenda(connection, normalize_agenda(next_agenda))
                    result = {"agendas": read_agendas(connection), "next": next_agenda}
                self.send_json(200, result)
                return
            self.send_json(404, {"error": "Endpoint tidak ditemukan."})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "Agenda dengan ID tersebut sudah ada."})

    def do_PUT(self):
        path = unquote(urlparse(self.path).path)
        match = re.fullmatch(r"/api/agendas/([^/]+)", path)
        if not match:
            self.send_json(404, {"error": "Endpoint tidak ditemukan."})
            return
        try:
            agenda = normalize_agenda(self.read_json(), match.group(1))
            with connect() as connection:
                if not update_agenda(connection, agenda):
                    self.send_json(404, {"error": "Agenda tidak ditemukan."})
                    return
            self.send_json(200, agenda)
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def do_DELETE(self):
        path = unquote(urlparse(self.path).path)
        match = re.fullmatch(r"/api/agendas/([^/]+)", path)
        if not match:
            self.send_json(404, {"error": "Endpoint tidak ditemukan."})
            return
        with connect() as connection:
            cursor = connection.execute("DELETE FROM agendas WHERE id = ?", (match.group(1),))
        if cursor.rowcount == 0:
            self.send_json(404, {"error": "Agenda tidak ditemukan."})
        else:
            self.send_json(200, {"deleted": True})

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer(("127.0.0.1", 8000), AgendaHandler)
    print("Agenda Planner berjalan di http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
        server.server_close()
