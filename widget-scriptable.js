// Виджет «Личный трекер целей» для приложения Scriptable (iOS).
// 1. Заполните три строки ниже.
// 2. Добавьте на экран виджет Scriptable, выберите этот скрипт,
//    а в поле Parameter вставьте код из трекера (Цели → Виджет на iPhone).

const SUPABASE_URL = "https://arqsknaepqxipwdfvoqj.supabase.co";   // "https://abcdxyz.supabase.co"
const SUPABASE_KEY = "sb_publishable_fWsozu9xJaNihvDmgjfZTA_9fLsM5k-";   // publishable key "sb_publishable_…"
const TRACKER_URL  = "https://altusha4.github.io/tracker/";   // адрес трекера, например "https://username.github.io/tracker/"

// ---------------------------------------------------------------------------
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WD = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const DAY = ["день","дня","дней"];
const plural = (n, f) => { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return f[2]; if (n1 > 1 && n1 < 5) return f[1]; if (n1 === 1) return f[0]; return f[2]; };
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const between = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

const C = {
  bg: Color.dynamic(new Color("#F2F3F7"), new Color("#0E1120")),
  ink: Color.dynamic(new Color("#151933"), new Color("#E9EBF5")),
  muted: Color.dynamic(new Color("#5B6180"), new Color("#979DBA")),
  accent: Color.dynamic(new Color("#3246D3"), new Color("#8291FF")),
  track: Color.dynamic(new Color("#E3E7FF"), new Color("#252C55")),
  bad: Color.dynamic(new Color("#C03636"), new Color("#F07575")),
  good: Color.dynamic(new Color("#1D8656"), new Color("#4CC28A")),
};
const AREA = { c1:"#3B62E0", c2:"#8B4CD8", c3:"#1F9A63", c4:"#D9691A", c5:"#D3468A", c6:"#168C99", c7:"#A88B08", c8:"#CE4242" };

// ---------- data ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), "tracker-widget.json");
const KEY = "tracker_widget_token";

async function getToken() {
  const param = (args.widgetParameter || "").trim();
  if (param) return param;
  if (Keychain.contains(KEY)) return Keychain.get(KEY);
  if (config.runsInApp) {
    const a = new Alert();
    a.title = "Код виджета";
    a.message = "Вставьте код из трекера: Цели → Виджет на iPhone.";
    a.addTextField("код", "");
    a.addAction("Сохранить");
    a.addCancelAction("Отмена");
    if ((await a.present()) === 0) {
      const t = a.textFieldValue(0).trim();
      if (t) { Keychain.set(KEY, t); return t; }
    }
  }
  return "";
}

async function load(token) {
  try {
    const req = new Request(`${SUPABASE_URL}/rest/v1/rpc/widget_data`);
    req.method = "POST";
    req.headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
    req.body = JSON.stringify({ p_token: token });
    req.timeoutInterval = 15;
    const rows = await req.loadJSON();
    if (!Array.isArray(rows)) throw new Error(rows && rows.message || "bad response");
    fm.writeString(cachePath, JSON.stringify({ at: Date.now(), rows }));
    return { rows, stale: false };
  } catch (e) {
    if (fm.fileExists(cachePath)) return { ...JSON.parse(fm.readString(cachePath)), stale: true };
    return { rows: null, error: String(e.message || e) };
  }
}

function summarize(rows) {
  const by = c => rows.filter(r => r.c === c).map(r => ({ id: r.id, ...r.data }));
  const td = ymd(new Date());
  const areas = Object.fromEntries(by("areas").map(a => [a.id, a]));
  const settings = by("settings")[0] || {};
  const day = by("days").find(d => d.id === td) || {};
  const habits = day.habits || {};
  const items = [];
  for (const t of by("tasks")) {
    if (t.repeat === "daily") items.push({ t, checked: !!habits[t.id] });
    else if (t.due && t.due <= td && (!t.done || t.doneAt === td)) items.push({ t, checked: !!t.done, overdue: !t.done && t.due < td });
  }
  items.sort((a, b) => (a.checked - b.checked) || ((a.t.priority || 2) - (b.t.priority || 2)) || String(a.t.due || "").localeCompare(String(b.t.due || "")));
  const sum = a => (a || []).reduce((s, e) => s + (+e.kcal || 0), 0);
  const logged = (day.food || []).length > 0;
  const tdee = +settings.tdee || 2000, goal = settings.deficitGoal === undefined ? 500 : +settings.deficitGoal;
  const deficit = logged ? tdee + sum(day.burn) - sum(day.food) : null;
  const exams = by("exams").filter(e => e.date >= td).sort((a, b) => a.date.localeCompare(b.date));
  const ieltsDays = settings.ieltsDate && settings.ieltsDate >= td ? between(td, settings.ieltsDate) : null;
  return { td, areas, items, done: items.filter(i => i.checked).length, deficit, goal, exam: exams[0], ieltsDays };
}

// ---------- drawing ----------
function ringImage(p, size) {
  const dc = new DrawContext();
  dc.size = new Size(size, size); dc.opaque = false; dc.respectScreenScale = true;
  const lw = size * 0.11, r = (size - lw) / 2, cx = size / 2, cy = size / 2;
  const arc = (from, to, color) => {
    const path = new Path(); const steps = Math.max(2, Math.ceil((to - from) * 60));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * (from + (to - from) * i / steps);
      const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a));
      i ? path.addLine(pt) : path.move(pt);
    }
    dc.addPath(path); dc.setStrokeColor(color); dc.setLineWidth(lw); dc.strokePath();
  };
  arc(0, 1, C.track);
  if (p > 0) arc(0, Math.min(1, p), C.accent);
  return dc.getImage();
}

function text(stack, s, { size = 13, weight = "regular", color = C.ink, lines = 1 } = {}) {
  const t = stack.addText(s);
  t.font = weight === "bold" ? Font.boldRoundedSystemFont(size) : weight === "semibold" ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color; t.lineLimit = lines; t.minimumScaleFactor = 0.75;
  return t;
}

function header(w, s, ringSize) {
  const row = w.addStack(); row.centerAlignContent();
  const left = row.addStack(); left.layoutVertically();
  const d = new Date();
  text(left, WD[d.getDay()].toUpperCase(), { size: 10, weight: "semibold", color: C.muted });
  text(left, `${d.getDate()} ${MONTHS[d.getMonth()]}`, { size: 17, weight: "bold" });
  const total = s.items.length;
  text(left, total ? `${s.done} из ${total} сделано` : "Задач нет", { size: 12, color: C.muted });
  row.addSpacer();
  const p = total ? s.done / total : 0;
  const ring = row.addStack(); ring.size = new Size(ringSize, ringSize);
  ring.backgroundImage = ringImage(p, ringSize); ring.centerAlignContent();
  ring.addSpacer(); text(ring, `${Math.round(p * 100)}%`, { size: ringSize * 0.24, weight: "bold" }); ring.addSpacer();
}

function taskList(w, s, max) {
  const open = s.items.filter(i => !i.checked);
  const list = open.length ? open : s.items;
  if (!list.length) { text(w, "На сегодня всё свободно", { size: 13, color: C.muted }); return; }
  for (const { t, checked, overdue } of list.slice(0, max)) {
    const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
    const sym = SFSymbol.named(checked ? "checkmark.circle.fill" : "circle");
    const img = row.addImage(sym.image); img.imageSize = new Size(14, 14);
    img.tintColor = checked ? C.accent : (t.areaId && s.areas[t.areaId] ? new Color(AREA[s.areas[t.areaId].color] || AREA.c1) : C.muted);
    text(row, (t.priority == 1 ? "! " : "") + t.title, { size: 13, color: checked ? C.muted : overdue ? C.bad : C.ink });
    row.addSpacer();
    w.addSpacer(4);
  }
  const rest = list.length - max;
  if (rest > 0) text(w, `и ещё ${rest}`, { size: 11, color: C.muted });
}

function footer(w, s) {
  const row = w.addStack(); row.spacing = 12;
  const chip = (label, value, color) => {
    const st = row.addStack(); st.layoutVertically();
    text(st, label, { size: 9, weight: "semibold", color: C.muted });
    text(st, value, { size: 12, weight: "semibold", color });
  };
  chip("ДЕФИЦИТ", s.deficit === null ? "не записан" : `${Math.round(s.deficit)} ккал`, s.deficit !== null && s.deficit >= s.goal ? C.good : C.ink);
  if (s.ieltsDays !== null) chip("IELTS", `${s.ieltsDays} ${plural(s.ieltsDays, DAY)}`, C.ink);
  if (s.exam) { const n = between(s.td, s.exam.date); chip(s.exam.title.toUpperCase().slice(0, 14), n === 0 ? "сегодня" : `${n} ${plural(n, DAY)}`, n <= 7 ? C.bad : C.ink); }
}

function message(w, title, body) {
  text(w, title, { size: 15, weight: "bold" }); w.addSpacer(4);
  text(w, body, { size: 12, color: C.muted, lines: 4 });
}

async function build() {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 14, 14, 14);
  if (TRACKER_URL) w.url = TRACKER_URL;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const family = config.widgetFamily || "large";

  if (!SUPABASE_URL || !SUPABASE_KEY) { message(w, "Настройте виджет", "Откройте скрипт в Scriptable и заполните SUPABASE_URL и SUPABASE_KEY."); return w; }
  const token = await getToken();
  if (!token) { message(w, "Нужен код", "Скопируйте код в трекере (Цели → Виджет на iPhone) и вставьте в поле Parameter виджета."); return w; }
  const res = await load(token);
  if (!res.rows) { message(w, "Нет связи", "Не удалось загрузить данные. Проверьте интернет."); return w; }
  if (!res.rows.length) { message(w, "Код не подошёл", "Создайте новый код в трекере и вставьте его в виджет."); return w; }
  const s = summarize(res.rows);

  if (family === "small") {
    header(w, s, 44);
    w.addSpacer();
    const next = s.items.find(i => !i.checked);
    text(w, next ? next.t.title : "Всё сделано", { size: 12, weight: "semibold", lines: 2, color: next ? C.ink : C.good });
    w.addSpacer(4);
    text(w, s.deficit === null ? "Дефицит: не записан" : `Дефицит ${Math.round(s.deficit)} ккал`, { size: 11, color: C.muted });
  } else if (family === "medium") {
    const row = w.addStack(); row.spacing = 12;
    const left = row.addStack(); left.layoutVertically(); left.size = new Size(110, 0);
    const d = new Date();
    text(left, WD[d.getDay()].toUpperCase(), { size: 10, weight: "semibold", color: C.muted });
    text(left, `${d.getDate()} ${MONTHS[d.getMonth()]}`, { size: 16, weight: "bold" });
    left.addSpacer(6);
    const p = s.items.length ? s.done / s.items.length : 0;
    const ring = left.addStack(); ring.size = new Size(54, 54); ring.backgroundImage = ringImage(p, 54); ring.centerAlignContent();
    ring.addSpacer(); text(ring, `${Math.round(p * 100)}%`, { size: 13, weight: "bold" }); ring.addSpacer();
    left.addSpacer(4);
    text(left, s.deficit === null ? "дефицит —" : `−${Math.round(s.deficit)} ккал`, { size: 11, color: C.muted });
    const right = row.addStack(); right.layoutVertically();
    taskList(right, s, 5);
    right.addSpacer();
  } else {
    header(w, s, 58);
    w.addSpacer(12);
    taskList(w, s, 8);
    w.addSpacer();
    footer(w, s);
  }
  if (res.stale) { w.addSpacer(4); text(w, "нет сети, данные из кэша", { size: 9, color: C.muted }); }
  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentLarge();
Script.complete();
