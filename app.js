// Mini App «Весна»: выбор услуги, дат и гостей → Telegram.WebApp.sendData в бота.
// Расчёт цены повторяет bot/pricing.py — бот всё равно пересчитывает сам.
const tg = window.Telegram && Telegram.WebApp;
const $ = (id) => document.getElementById(id);
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const ICONS = {
  flame: '<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.6.7-2.7 1.6-3.6.2 1.5 1 2.3 1.9 2.6C11 8.6 10.6 5.6 12 3z"/><path d="M5 21h14"/>',
  waves: '<path d="M3 15c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 2-1.5"/><path d="M3 19c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 2-1.5"/><path d="M8 11V5m4 6V4m4 7V5"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
};

let D; // data.json
const today = new Date(); today.setHours(0, 0, 0, 0);
const S = { service: "house_bath", promo: null, from: null, to: null, guests: 2, view: new Date(today.getFullYear(), today.getMonth(), 1) };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((b - a) / 864e5);
const rub = (n) => n.toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
const ruDate = (d) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
const isWeekendNight = (d) => d.getDay() === 5 || d.getDay() === 6; // ночи пт и сб
const nightsWord = (n) => n % 10 === 1 && n % 100 !== 11 ? "ночь" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "ночи" : "ночей");
const haptic = () => tg && tg.HapticFeedback && tg.HapticFeedback.selectionChanged();

function quote() {
  const svc = D.services.find((s) => s.id === S.service);
  let p = D.promos.find((x) => x.id === S.promo);
  if (p && !p.services.includes(S.service)) p = null;
  const extra = Math.max(0, S.guests - D.base_guests) * D.extra_guest;
  let total = 0, promoNights = 0;
  const n = daysBetween(S.from, S.to);
  for (let i = 0; i < n; i++) {
    const d = addDays(S.from, i);
    let price = isWeekendNight(d) ? svc.weekend : svc.weekday;
    if (p && !isWeekendNight(d) && daysBetween(today, d) <= (p.days_ahead ?? 1e4)) { price = p.price; promoNights++; }
    total += price + extra;
  }
  return { n, total, extra: extra * n, promo: promoNights ? p.id : null, promoNights };
}

function applyTheme() {
  const dark = tg && tg.colorScheme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (tg) {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    tg.setHeaderColor && tg.setHeaderColor("#15140f"); // шапка сливается с тёмным фото
    tg.setBackgroundColor && tg.setBackgroundColor(bg);
  }
}

function renderServices() {
  $("services").innerHTML = D.services.map((s) => `
    <button type="button" class="service" role="radio" aria-checked="${s.id === S.service}" data-id="${s.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.icon]}</svg>
      <span><b>${s.title}</b><small>будни ${rub(s.weekday)} · выходные ${rub(s.weekend)} · на двоих</small></span>
    </button>`).join("");
}

function renderPromos() {
  const opts = [{ id: null, title: "Без акции" }, ...D.promos];
  $("promos").innerHTML = opts.map((p) =>
    `<button type="button" class="chip" role="radio" aria-checked="${p.id === S.promo}" data-id="${p.id ?? ""}">${p.id ? `${p.title} · ${rub(p.price)}` : p.title}</button>`).join("");
  const p = D.promos.find((x) => x.id === S.promo);
  let hint = p ? `${p.text[0].toUpperCase()}${p.text.slice(1)}.` : "";
  if (p && !p.services.includes(S.service)) hint = "Акция действует для тарифов «Дом + баня» и «Дом + фурако».";
  if (p && p.code) hint += ` Промокод ${p.code} учтём автоматически.`;
  $("promo-hint").textContent = hint;
}

function dayState(d) {
  const key = iso(d);
  if (d < today) return "past";
  if (D.busy.includes(key)) return "busy";
  return "free";
}

// Можно ли выехать в день d: все ночи с заезда до d свободны
function canCheckout(d) {
  const n = daysBetween(S.from, d);
  if (n < 1 || n > D.max_nights) return false;
  for (let i = 0; i < n; i++) if (dayState(addDays(S.from, i)) !== "free") return false;
  return true;
}

function renderCalendar() {
  const v = S.view;
  $("month").textContent = `${MONTHS[v.getMonth()]} ${v.getFullYear()}`;
  $("prev").disabled = v <= new Date(today.getFullYear(), today.getMonth(), 1);
  $("next").disabled = v >= new Date(today.getFullYear(), today.getMonth() + 5, 1);
  const lead = (v.getDay() + 6) % 7; // понедельник первым
  const last = new Date(v.getFullYear(), v.getMonth() + 1, 0).getDate();
  let html = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((w) => `<div class="wd">${w}</div>`).join("");
  html += "<div></div>".repeat(lead);
  for (let day = 1; day <= last; day++) {
    const d = new Date(v.getFullYear(), v.getMonth(), day);
    const st = dayState(d);
    const cls = ["day", st, isWeekendNight(d) ? "weekend" : ""];
    if (S.from && +d === +S.from) cls.push("edge");
    if (S.to && +d === +S.to) cls.push("edge");
    if (S.from && S.to && d > S.from && d < S.to) cls.push("in");
    // занятый день можно выбрать как день выезда — ночь этого дня уже не ваша
    const clickable = st === "free" || (st === "busy" && S.from && !S.to && canCheckout(d));
    html += `<button type="button" class="${cls.join(" ")}" data-d="${iso(d)}" ${clickable ? "" : "disabled"} aria-label="${ruDate(d)}${st === "busy" ? ", занято" : ""}">${day}</button>`;
  }
  $("cal").innerHTML = html;
  $("cal-hint").textContent = !S.from ? "Выберите дату заезда" : !S.to ? "Теперь — дату выезда" : `${ruDate(S.from)} — ${ruDate(S.to)}`;
}

function renderSummary() {
  $("guests").textContent = S.guests;
  $("minus").disabled = S.guests <= 1;
  $("plus").disabled = S.guests >= D.max_guests;
  if (!S.from || !S.to) {
    $("summary").innerHTML = '<p class="empty">Выберите даты — посчитаем стоимость 🌿</p>';
    $("cta").disabled = true;
    $("cta").textContent = "Перейти к оплате";
    return;
  }
  const q = quote();
  const svc = D.services.find((s) => s.id === S.service);
  const lines = [
    [svc.title, ""],
    [`${ruDate(S.from)} — ${ruDate(S.to)}`, `${q.n} ${nightsWord(q.n)}`],
  ];
  if (q.promo) lines.push([`Акция «${D.promos.find((p) => p.id === q.promo).title}»`, `${q.promoNights} из ${q.n}`]);
  if (q.extra) lines.push([`Доп. гости: ${S.guests - D.base_guests}`, rub(q.extra)]);
  $("summary").innerHTML = lines.map(([a, b]) => `<div class="line"><span>${a}</span><span>${b}</span></div>`).join("") +
    `<div class="line total"><span>Итого</span><b>${rub(q.total)}</b></div>`;
  $("cta").disabled = false;
  $("cta").textContent = `Перейти к оплате · ${rub(q.total)}`;
}

function render() { renderServices(); renderPromos(); renderCalendar(); renderSummary(); }

function bind() {
  $("services").onclick = (e) => { const b = e.target.closest(".service"); if (b) { S.service = b.dataset.id; haptic(); render(); } };
  $("promos").onclick = (e) => { const b = e.target.closest(".chip"); if (b) { S.promo = b.dataset.id || null; haptic(); render(); } };
  $("prev").onclick = () => { S.view = new Date(S.view.getFullYear(), S.view.getMonth() - 1, 1); renderCalendar(); };
  $("next").onclick = () => { S.view = new Date(S.view.getFullYear(), S.view.getMonth() + 1, 1); renderCalendar(); };
  $("cal").onclick = (e) => {
    const b = e.target.closest(".day"); if (!b || b.disabled) return;
    const [y, m, d] = b.dataset.d.split("-").map(Number);
    const day = new Date(y, m - 1, d);
    if (S.from && !S.to && canCheckout(day)) S.to = day;
    else if (dayState(day) === "free") { S.from = day; S.to = null; }
    haptic(); renderCalendar(); renderSummary();
  };
  $("minus").onclick = () => { S.guests = Math.max(1, S.guests - 1); haptic(); renderSummary(); };
  $("plus").onclick = () => { S.guests = Math.min(D.max_guests, S.guests + 1); haptic(); renderSummary(); };
  $("cta").onclick = () => {
    const q = quote();
    const payload = { service: S.service, date_from: iso(S.from), date_to: iso(S.to), guests: S.guests, pets: $("pets").checked, promo: q.promo, total: q.total };
    if (tg && tg.initData) tg.sendData(JSON.stringify(payload)); // Telegram закроет окно сам
    else alert("Открыто вне Telegram. В боте сюда уйдёт:\n" + JSON.stringify(payload, null, 2));
  };
}

async function init() {
  if (tg) { tg.ready(); tg.expand(); tg.onEvent("themeChanged", applyTheme); }
  applyTheme();
  D = await (await fetch("data.json", { cache: "no-store" })).json();
  const promo = new URLSearchParams(location.search).get("promo");
  if (D.promos.some((p) => p.id === promo)) S.promo = promo;
  bind();
  render();
}

init().catch((e) => { $("summary").innerHTML = `<p class="empty">Не удалось загрузить данные: ${e.message}</p>`; });
