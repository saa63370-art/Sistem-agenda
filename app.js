"use strict";

const $ = (id) => document.getElementById(id);
const CATEGORIES = ["Khusus Praktikum", "Matakuliah", "Agenda Pertemuan"];

/* ---------- Penyimpanan ---------- */
let agendas = [];
const notified = new Set();

async function request(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Permintaan gagal (${response.status}).`);
  return result;
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Utilitas tanggal ---------- */
function pad(n) { return String(n).padStart(2, "0"); }
function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startAt(a) { return new Date(`${a.date}T${a.time}`); }
function compareAgendaOrder(a, b) {
  return String(a.date).localeCompare(String(b.date))
    || String(a.time).localeCompare(String(b.time))
    || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
    || String(a.id).localeCompare(String(b.id));
}
function fmtDate(a) {
  return startAt(a).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}
function repeatLabel(r) {
  return { daily: "Harian", weekly: "Mingguan", monthly: "Bulanan" }[r] || "";
}

function readForm() {
  return {
    title: $("f-title").value.trim(),
    date: $("f-date").value,
    time: $("f-time").value,
    category: $("f-category").value,
    priority: $("f-priority").value,
    status: $("f-status").value,
    location: $("f-location").value.trim(),
    notes: $("f-notes").value.trim(),
    repeat: $("f-repeat").value,
    remind: Number($("f-remind").value)
  };
}
/* ---------- Form ---------- */
function resetForm() {
  $("agenda-form").reset();
  $("f-id").value = "";
  $("form-title").textContent = "Tambah Agenda";
  $("btn-save").textContent = "Simpan";
  $("btn-cancel").hidden = true;
  $("f-date").value = toISODate(new Date());
}
function editAgenda(id) {
  const a = agendas.find((x) => x.id === id);
  if (!a) return;
  $("f-id").value = a.id;
  $("f-title").value = a.title;
  $("f-date").value = a.date;
  $("f-time").value = a.time;
  const categorySelect = $("f-category");
  if (!CATEGORIES.includes(a.category)) {
    categorySelect.add(new Option(`Lama: ${a.category}`, a.category));
  }
  $("f-category").value = a.category;
  $("f-priority").value = a.priority;
  $("f-status").value = a.status || (a.done ? "selesai" : "belum_dikerjakan");
  $("f-location").value = a.location || "";
  $("f-notes").value = a.notes || "";
  $("f-repeat").value = a.repeat || "none";
  $("f-remind").value = String(a.remind ?? 10);
  $("form-title").textContent = "Ubah Agenda";
  $("btn-save").textContent = "Perbarui";
  $("btn-cancel").hidden = false;
  $("f-title").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("agenda-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = readForm();
  if (!data.title || !data.date || !data.time) return;
  const id = $("f-id").value;
  $("btn-save").disabled = true;
  try {
    if (id) {
      const updated = await request(`agendas/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ ...agendas.find((a) => a.id === id), ...data })
      });
      agendas = agendas.map((a) => a.id === id ? updated : a);
      notified.delete(id);
      toast("Agenda diperbarui.");
    } else {
      const created = await request("agendas", {
        method: "POST",
        body: JSON.stringify({ id: uid(), done: data.status === "selesai", createdAt: Date.now(), ...data })
      });
      agendas.push(created);
      toast("Agenda ditambahkan.");
    }
    resetForm();
    render();
  } catch (error) {
    toast(`Gagal menyimpan agenda: ${error.message}`);
  } finally {
    $("btn-save").disabled = false;
  }
});
$("btn-cancel").addEventListener("click", resetForm);

/* ---------- Filter & render ---------- */
function matchesRange(a, range, now) {
  const start = startAt(a);
  const today = toISODate(now);
  switch (range) {
    case "upcoming": return !a.done && start >= now;
    case "today": return a.date === today;
    case "week": {
      const end = new Date(now); end.setDate(end.getDate() + 7);
      return !a.done && start >= now && start <= end;
    }
    case "month":
      return start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
    case "overdue": return !a.done && start < now;
    case "done": return a.done;
    default: return true;
  }
}
function filtered() {
  const now = new Date();
  const q = $("q").value.trim().toLowerCase();
  const range = $("flt-range").value;
  const cat = $("flt-category").value;
  const pri = $("flt-priority").value;
  return agendas
    .filter((a) => matchesRange(a, range, now))
    .filter((a) => !cat || a.category === cat)
    .filter((a) => !pri || a.priority === pri)
    .filter((a) => !q || [a.title, a.location, a.notes, a.category].join(" ").toLowerCase().includes(q))
    .sort(compareAgendaOrder);
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderStats() {
  const now = new Date();
  const today = toISODate(now);
  const stats = [
    ["Hari ini", agendas.filter((a) => a.date === today && !a.done).length],
    ["Akan datang", agendas.filter((a) => !a.done && startAt(a) >= now).length],
    ["Terlewat", agendas.filter((a) => !a.done && startAt(a) < now).length],
    ["Selesai", agendas.filter((a) => a.done).length]
  ];
  const box = $("stats");
  box.replaceChildren();
  stats.forEach(([label, n]) => {
    const s = el("div", "stat");
    s.append(el("b", "", String(n)), el("span", "", label));
    box.append(s);
  });
}

function renderCategories() {
  const sel = $("flt-category");
  const cur = sel.value;
  const legacyCategories = [...new Set(agendas.map((a) => a.category))]
    .filter((category) => !CATEGORIES.includes(category))
    .sort((a, b) => a.localeCompare(b, "id"));
  const cats = [...CATEGORIES, ...legacyCategories];
  sel.replaceChildren(new Option("Semua kategori", ""));
  cats.forEach((category) => {
    const label = CATEGORIES.includes(category) ? category : `Lama: ${category}`;
    sel.append(new Option(label, category));
  });
  sel.value = cats.includes(cur) ? cur : "";
}

function render() {
  renderStats();
  renderCategories();
  const list = $("list");
  list.replaceChildren();
  const items = filtered();
  $("empty").hidden = items.length > 0;
  const now = new Date();

  items.forEach((a) => {
    const overdue = !a.done && startAt(a) < now;
    const li = el("li", `item p-${a.priority}${a.done ? " done" : ""}${overdue ? " overdue" : ""}`);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = a.done;
    cb.setAttribute("aria-label", "Tandai selesai");
    cb.addEventListener("change", async () => {
      cb.disabled = true;
      try {
        const result = await request(`agendas/${encodeURIComponent(a.id)}/toggle`, { method: "POST", body: "{}" });
        agendas = result.agendas;
        if (result.next) toast(`Agenda berikutnya dijadwalkan: ${fmtDate(result.next)}`);
        render();
      } catch (error) {
        cb.checked = a.done;
        cb.disabled = false;
        toast(`Gagal memperbarui agenda: ${error.message}`);
      }
    });

    const body = el("div");
    body.append(el("div", "title", a.title));
    const meta = el("div", "meta");
    meta.append(el("span", "", `🗓 ${fmtDate(a)}, ${a.time}`));
    if (a.location) meta.append(el("span", "", `📍 ${a.location}`));
    const status = a.status || (a.done ? "selesai" : "belum_dikerjakan");
    const statusLabels = {
      belum_dikerjakan: "Belum dikerjakan",
      sedang_dikerjakan: "Sedang dikerjakan",
      selesai: "Selesai"
    };
    meta.append(el("span", `tag status-${status}`, statusLabels[status]));
    meta.append(el("span", "tag", a.category));
    meta.append(el("span", "tag", `Prioritas ${a.priority}`));
    if (a.repeat && a.repeat !== "none") meta.append(el("span", "tag", `🔁 ${repeatLabel(a.repeat)}`));
    if (overdue) meta.append(el("span", "badge-overdue", "Terlewat"));
    body.append(meta);
    if (a.notes) body.append(el("div", "notes", a.notes));

    const actions = el("div", "item-actions");
    const bEdit = el("button", "btn ghost small", "Ubah");
    bEdit.addEventListener("click", () => editAgenda(a.id));
    const bDel = el("button", "btn ghost small danger", "Hapus");
    bDel.addEventListener("click", async () => {
      if (confirm(`Hapus agenda "${a.title}"?`)) {
        bDel.disabled = true;
        try {
          await request(`agendas/${encodeURIComponent(a.id)}`, { method: "DELETE" });
          agendas = agendas.filter((item) => item.id !== a.id);
          render();
          toast("Agenda dihapus.");
        } catch (error) {
          bDel.disabled = false;
          toast(`Gagal menghapus agenda: ${error.message}`);
        }
      }
    });
    actions.append(bEdit, bDel);

    li.append(cb, body, actions);
    list.append(li);
  });
}

["q", "flt-range", "flt-category", "flt-priority"].forEach((id) =>
  $(id).addEventListener("input", render)
);

/* ---------- Ekspor / Impor ---------- */
$("btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify([...agendas].sort(compareAgendaOrder), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `agenda-${toISODate(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("file-import").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("format");
      const valid = data.filter((x) => x && x.title && x.date && x.time);
      const ids = new Set(agendas.map((a) => a.id));
      const imported = valid.map((x) => {
        const agenda = { done: false, category: "Lainnya", priority: "sedang", repeat: "none", remind: 10, ...x };
        if (!agenda.id || ids.has(agenda.id)) agenda.id = uid();
        ids.add(agenda.id);
        return agenda;
      }).sort(compareAgendaOrder);
      request("agendas/import", { method: "POST", body: JSON.stringify(imported) })
        .then(async (result) => {
          agendas = await request("agendas");
          render();
          toast(`${result.imported} agenda diimpor.`);
        })
        .catch((error) => toast(`Gagal mengimpor agenda: ${error.message}`));
    } catch (err) {
      toast("File tidak valid.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});

/* ---------- Pengingat ---------- */
$("btn-notif").addEventListener("click", async () => {
  if (!("Notification" in window)) return toast("Browser tidak mendukung notifikasi.");
  const perm = await Notification.requestPermission();
  toast(perm === "granted" ? "Pengingat diaktifkan." : "Izin notifikasi ditolak.");
});

function checkReminders() {
  const now = Date.now();
  agendas.forEach((a) => {
    if (a.done || notified.has(a.id)) return;
    const start = startAt(a).getTime();
    const remindAt = start - (a.remind || 0) * 60000;
    if (now >= remindAt && now <= start + 60000) {
      notified.add(a.id);
      const msg = `${a.title} — ${a.time}${a.location ? " @ " + a.location : ""}`;
      toast(`⏰ ${msg}`);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Pengingat agenda", { body: msg });
      }
    }
  });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ---------- Mulai ---------- */
async function initialize() {
  let legacyData = null;
  try {
    const raw = localStorage.getItem("agenda-planner:v1");
    if (raw) legacyData = JSON.parse(raw);
  } catch (error) {
    toast("Data lama di browser tidak dapat dibaca; data database tetap aman.");
  }

  try {
    agendas = await request("agendas");
    if (legacyData !== null) {
      try {
        if (!Array.isArray(legacyData)) throw new Error("format data lama tidak valid");
        const ids = new Set(agendas.map((agenda) => agenda.id));
        const toImport = [];
        legacyData.forEach((agenda) => {
          if (agenda && typeof agenda === "object" && agenda.id && ids.has(agenda.id)) return;
          if (agenda && typeof agenda === "object" && !agenda.id) agenda.id = uid();
          if (agenda && typeof agenda === "object") ids.add(agenda.id);
          toImport.push(agenda);
        });
        if (toImport.length) {
          await request("agendas/import", { method: "POST", body: JSON.stringify(toImport) });
          agendas = await request("agendas");
        }
        localStorage.removeItem("agenda-planner:v1");
      } catch (error) {
        toast(`Data lama belum dapat dipindahkan: ${error.message}`);
      }
    }
    resetForm();
    render();
    checkReminders();
  } catch (error) {
    toast(`Database tidak dapat dimuat: ${error.message}. Jalankan server.py.`);
  }
}
initialize();
setInterval(() => { checkReminders(); render(); }, 30000);
