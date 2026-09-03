/* ==========================================================================
   HeatSafe AI — Frontend application logic
   Works fully on DEMO DATA out of the box. If a backend is running at
   API_BASE, live endpoints are used instead and demo data is only the
   fallback when a request fails. No API keys ever live in this file.
   ========================================================================== */

/* ---------- Configuration ---------- */
const API_BASE = "http://localhost:8000/api"; // FastAPI backend, see /backend
const USE_LIVE_API = true;

/* ---------- Demo dataset (clearly labeled, matches backend /api/risk shape) ---------- */
const DEMO_LOCATIONS = {
  "Nabha":      { lat: 30.3745, lng: 76.1526, temperature: 43.5, feelsLike: 54.2, humidity: 68, wind: 7,  solar: 850, dew: 32, rain: 0,  heatIndex: 54.2, riskScore: 87, heatwaveProb: 0.87, risk: "extreme" },
  "Patiala":    { lat: 30.3398, lng: 76.3869, temperature: 42.1, feelsLike: 50.8, humidity: 61, wind: 9,  solar: 810, dew: 30, rain: 0,  heatIndex: 50.8, riskScore: 78, heatwaveProb: 0.74, risk: "high" },
  "Ludhiana":   { lat: 30.9010, lng: 75.8573, temperature: 40.8, feelsLike: 46.9, humidity: 55, wind: 11, solar: 780, dew: 27, rain: 0,  heatIndex: 46.9, riskScore: 62, heatwaveProb: 0.55, risk: "high" },
  "Amritsar":   { lat: 31.6340, lng: 74.8723, temperature: 38.6, feelsLike: 41.2, humidity: 47, wind: 13, solar: 720, dew: 22, rain: 0,  heatIndex: 41.2, riskScore: 44, heatwaveProb: 0.31, risk: "moderate" },
  "Chandigarh": { lat: 30.7333, lng: 76.7794, temperature: 36.9, feelsLike: 38.4, humidity: 42, wind: 15, solar: 690, dew: 19, rain: 2,  heatIndex: 38.4, riskScore: 29, heatwaveProb: 0.18, risk: "low" },
  "Delhi":      { lat: 28.6139, lng: 77.2090, temperature: 41.4, feelsLike: 47.7, humidity: 50, wind: 8,  solar: 800, dew: 25, rain: 0,  heatIndex: 47.7, riskScore: 67, heatwaveProb: 0.58, risk: "high" },
};

const RISK_META = {
  low:       { label: "Low",      color: "var(--risk-low)",      class: "risk-low" },
  moderate:  { label: "Moderate", color: "var(--risk-moderate)", class: "risk-moderate" },
  high:      { label: "High",     color: "var(--risk-high)",     class: "risk-high" },
  extreme:   { label: "Extreme",  color: "var(--risk-extreme)",  class: "risk-extreme" },
};

const FACTOR_TEMPLATES = {
  extreme:  [["Temperature",92,"High"],["Humidity",74,"High"],["Solar radiation",85,"High"],["Wind cooling",22,"Low"],["Historical trend",71,"High"]],
  high:     [["Temperature",78,"High"],["Humidity",60,"Moderate"],["Solar radiation",72,"High"],["Wind cooling",35,"Low"],["Historical trend",58,"Moderate"]],
  moderate: [["Temperature",55,"Moderate"],["Humidity",45,"Moderate"],["Solar radiation",50,"Moderate"],["Wind cooling",55,"Moderate"],["Historical trend",40,"Moderate"]],
  low:      [["Temperature",30,"Low"],["Humidity",30,"Low"],["Solar radiation",35,"Low"],["Wind cooling",75,"High"],["Historical trend",25,"Low"]],
};

const SAFETY_RECS = {
  student: { icon:"fa-graduation-cap", items:[
    "Avoid outdoor sports during peak heat (12 PM – 4 PM)",
    "Carry a water bottle and stay hydrated between classes",
    "Prefer morning or evening hours for outdoor activity",
    "Watch for dizziness or headache and tell a teacher immediately" ]},
  farmer: { icon:"fa-tractor", items:[
    "Shift field work to early morning or evening hours",
    "Take frequent shaded breaks every 45–60 minutes",
    "Carry drinking water and oral rehydration salts to the field",
    "Use shade, a hat, or light cotton clothing whenever possible" ]},
  worker: { icon:"fa-helmet-safety", items:[
    "Take regular cooling breaks in shade or air conditioning",
    "Stay hydrated — drink water every 20–30 minutes",
    "Reduce prolonged direct sunlight exposure where possible",
    "Watch coworkers for signs of heat exhaustion" ]},
  elderly: { icon:"fa-person-cane", items:[
    "Stay in a cool, well-ventilated environment during peak hours",
    "Maintain steady hydration even without feeling thirsty",
    "Avoid going outdoors between 12 PM and 4 PM",
    "Keep emergency contacts and medication easily accessible" ]},
  athlete: { icon:"fa-person-running", items:[
    "Reduce training intensity and duration during extreme heat",
    "Train during cooler early-morning or late-evening hours",
    "Hydrate before, during, and after activity",
    "Stop immediately if you feel cramping, nausea, or dizziness" ]},
  general: { icon:"fa-people-group", items:[
    "Limit outdoor exposure during peak afternoon hours",
    "Drink water regularly throughout the day",
    "Check on elderly neighbours and young children",
    "Wear light-coloured, loose-fitting clothing outdoors" ]},
};

/* ---------- State ---------- */
let state = {
  location: "Nabha",
  profile: "student",
  rangeHours: 24,
};
let predictionChart = null;
let map = null;
let mapMarkers = {};

let userLocationMarker = null;
let userLocationCircle = null;

/* ---------- Utilities ---------- */
const $ = (sel) => document.querySelector(sel);
const $all = (sel) => Array.from(document.querySelectorAll(sel));

function riskFromScore(score){
  if (score >= 80) return "extreme";
  if (score >= 55) return "high";
  if (score >= 30) return "moderate";
  return "low";
}

function seededOffset(seed, spread){
  // deterministic pseudo-variation so 24/48/72h views differ but stay stable
  const x = Math.sin(seed * 999) * 10000;
  return (x - Math.floor(x) - 0.5) * spread;
}

/* ---------- Data access (live API with graceful demo fallback) ---------- */
async function fetchRisk(location){
  if (USE_LIVE_API){
    try{
      const res = await fetch(`${API_BASE}/risk?location=${encodeURIComponent(location)}`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      setMode(false);
      return normalizeRisk(data);
    }catch(err){
      console.warn("Live risk fetch failed, using demo data:", err);
      setMode(true);
    }
  }
  const demo = DEMO_LOCATIONS[location];
  return normalizeRisk({
    location, temperature: demo.temperature, feels_like: demo.feelsLike, humidity: demo.humidity,
    wind_speed: demo.wind, solar_radiation: demo.solar, dew_point: demo.dew, rainfall: demo.rain,
    heat_index: demo.heatIndex, thermal_risk: RISK_META[demo.risk].label, risk_score: demo.riskScore,
    heatwave_probability: demo.heatwaveProb,
  });
}

function normalizeRisk(d){
  return {
    location: d.location,
    temperature: d.temperature,
    feelsLike: d.feels_like ?? d.feelsLike,
    humidity: d.humidity,
    wind: d.wind_speed ?? d.wind,
    solar: d.solar_radiation ?? d.solar,
    dew: d.dew_point ?? d.dew,
    rain: d.rainfall ?? d.rain,
    heatIndex: d.heat_index ?? d.heatIndex,
    riskLabel: d.thermal_risk ?? d.riskLabel,
    riskScore: d.risk_score ?? d.riskScore,
    heatwaveProb: d.heatwave_probability ?? d.heatwaveProb,
    risk: (d.thermal_risk ?? riskFromScore(d.risk_score ?? d.riskScore ?? 0)).toString().toLowerCase(),
  };
}

function setMode(isDemo){
  const tag = $("#modeTag");
  if (isDemo){
    tag.innerHTML = `<i class="fa-solid fa-flask"></i> DEMO DATA — live weather feed not connected`;
  } else {
    tag.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> LIVE MODE — connected to HeatSafe backend`;
  }
}

/* ---------- Header date/time ---------- */
function renderClock(){
  const now = new Date();
  $("#heroDate").textContent = now.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  $("#heroUpdated").textContent = now.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" });
}

/* ---------- Risk card + weather overview ---------- */
function renderRisk(data){
  const meta = RISK_META[data.risk] || RISK_META.moderate;

  const badge = $("#riskBadge");
  badge.textContent = meta.label.toUpperCase() === meta.label ? meta.label : meta.label;
  badge.className = `risk-badge ${meta.class}`;

  // Animate gauge: circumference = 2*pi*92 ≈ 578
  const circumference = 578;
  const pct = Math.max(0, Math.min(100, data.riskScore)) / 100;
  const offset = circumference * (1 - pct);
  const fill = $("#gaugeFill");
  fill.style.stroke = meta.color;
  requestAnimationFrame(() => { fill.style.strokeDashoffset = offset; });

  animateNumber($("#riskScoreNum"), data.riskScore);

  $("#statHeatwaveProb").textContent = Math.round(data.heatwaveProb * 100) + "%";
  $("#statHeatIndex").textContent = data.heatIndex.toFixed(1) + "°C";
  $("#statRiskStatus").textContent = meta.label;

  $("#wTemp").textContent = data.temperature.toFixed(1) + "°C";
  $("#wFeelsLike").textContent = "Feels like " + data.feelsLike.toFixed(1) + "°C";
  $("#wHumidity").textContent = data.humidity + "%";
  $("#wWind").textContent = data.wind + " km/h";
  $("#wWindNote").textContent = data.wind < 10 ? "Low cooling effect" : data.wind < 18 ? "Moderate cooling effect" : "Good cooling effect";
  $("#wSolar").textContent = data.solar + " W/m²";
  $("#wSolarNote").textContent = data.solar > 750 ? "High" : data.solar > 500 ? "Moderate" : "Low";
  $("#wDew").textContent = data.dew.toFixed(0) + "°C";
  $("#wRain").textContent = data.rain + " mm";

  renderFactors(data.risk, data.riskScore);
  renderAlert(data, meta);
}

function animateNumber(el, target){
  const start = 0;
  const duration = 1100;
  const t0 = performance.now();
  function tick(t){
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderFactors(risk, score){
  const list = FACTOR_TEMPLATES[risk] || FACTOR_TEMPLATES.moderate;
  const container = $("#factorList");
  container.innerHTML = "";
  const meta = RISK_META[risk];
  list.forEach(([name, pct, tag]) => {
    const row = document.createElement("div");
    row.className = "factor-row";
    row.innerHTML = `
      <span class="factor-name">${name}</span>
      <span class="factor-track"><span class="factor-bar" style="background:${meta.color}"></span></span>
      <span class="factor-tag" style="color:${meta.color}">${tag}</span>`;
    container.appendChild(row);
    requestAnimationFrame(() => { row.querySelector(".factor-bar").style.width = pct + "%"; });
  });
  $("#analysisScore").textContent = `${score} / 100`;
}

function renderAlert(data, meta){
  const banner = $("#alertBanner");
  banner.className = `alert-banner ${meta.class}`;
  const titleMap = {
    extreme: "Extreme heat alert",
    high: "High heat advisory",
    moderate: "Moderate heat notice",
    low: "Conditions are currently safe",
  };
  const textMap = {
    extreme: "Extreme thermal stress conditions are expected between 12 PM and 4 PM. Avoid outdoor exposure during this window.",
    high: "Elevated thermal stress is expected during afternoon hours. Limit prolonged outdoor exposure.",
    moderate: "Thermal stress is moderate today. Take normal precautions during peak afternoon hours.",
    low: "Thermal stress is low today. Outdoor activity is generally safe with normal hydration.",
  };
  $("#alertTitle").textContent = titleMap[data.risk];
  $("#alertText").textContent = textMap[data.risk];
  $("#alertProb").textContent = Math.round(data.heatwaveProb * 100) + "%";
  $("#alertPeak").textContent = data.risk === "low" ? "—" : "2:00 PM";
  $("#notifDot").hidden = (data.risk === "low");
}

/* ---------- Explain prediction modal ---------- */
function buildExplainContent(data, risk){
  const list = FACTOR_TEMPLATES[risk] || FACTOR_TEMPLATES.moderate;
  const lead = {
    extreme: "This forecast is driven primarily by very high temperature combined with high humidity, which sharply raises the heat index and limits the body's ability to cool itself through sweat evaporation.",
    high: "Elevated temperature and moderate-to-high humidity are pushing the heat index up, while light winds are doing little to offset the heat.",
    moderate: "Conditions are within a manageable range, though afternoon temperature and solar load still warrant normal precautions.",
    low: "Temperature, humidity and solar load are all in a comfortable range, and wind is providing useful cooling.",
  }[risk];
  const bullets = list.map(([name, pct, tag]) => `<p><strong>${name}:</strong> ${tag} contribution (${pct}/100) to the overall thermal stress score.</p>`).join("");
  return `<p>${lead}</p>${bullets}`;
}

/* ---------- Prediction chart ---------- */
function buildForecastSeries(data, hours){
  const points = hours / 24 * 3; // 3 points per day shown
  const days = hours / 24;
  const labels = [];
  const prob = [];
  const temp = [];
  const stress = [];
  for (let i = 0; i < days; i++){
    const dayLabel = i === 0 ? "Today" : i === 1 ? "Tomorrow" : `Day ${i+1}`;
    labels.push(dayLabel);
    const drift = seededOffset(data.riskScore + i, 14);
    prob.push(Math.max(5, Math.min(97, Math.round(data.heatwaveProb * 100 + drift))));
    temp.push(+(data.temperature + seededOffset(i + 3, 4)).toFixed(1));
    stress.push(Math.max(5, Math.min(99, Math.round(data.riskScore + seededOffset(i + 7, 12)))));
  }
  return { labels, prob, temp, stress };
}

function renderPredictionChart(data){
  const { labels, prob, temp, stress } = buildForecastSeries(data, state.rangeHours);
  const ctx = document.getElementById("predictionChart");
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const extreme = styles.getPropertyValue("--risk-extreme").trim();
  const textMuted = styles.getPropertyValue("--text-muted").trim();
  const gridColor = styles.getPropertyValue("--border").trim();

  if (predictionChart) predictionChart.destroy();
  predictionChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: "bar", label: "Heatwave probability (%)", data: prob,
          backgroundColor: accent + "55", borderRadius: 6, yAxisID: "y",
          order: 2,
        },
        {
          type: "line", label: "Temperature (°C)", data: temp,
          borderColor: extreme, backgroundColor: extreme, tension: 0.35,
          pointRadius: 3, yAxisID: "y1", order: 1,
        },
        {
          type: "line", label: "Thermal stress score", data: stress,
          borderColor: accent, backgroundColor: accent, tension: 0.35,
          pointRadius: 3, borderDash: [5,4], yAxisID: "y", order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { color: textMuted, boxWidth: 12, usePointStyle: true } },
        tooltip: { backgroundColor: "#101819", titleColor: "#fff", bodyColor: "#dfe7e6", borderColor: gridColor, borderWidth: 1 },
      },
      scales: {
        x: { ticks: { color: textMuted }, grid: { color: gridColor } },
        y: { position: "left", min: 0, max: 100, ticks: { color: textMuted }, grid: { color: gridColor }, title: { display:true, text:"% / score", color: textMuted } },
        y1: { position: "right", ticks: { color: textMuted }, grid: { display:false }, title: { display:true, text:"°C", color: textMuted } },
      },
    },
  });
}

/* ---------- Heat map ---------- */
function initMap(){
  map = L.map("heatMap", { scrollWheelZoom: false }).setView([30.3745, 76.1526], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 12,
  }).addTo(map);
  renderMapMarkers();
}

function riskColorVar(risk){
  return { low:"#4CAF6D", moderate:"#E5B93F", high:"#E88A2F", extreme:"#E14A34" }[risk] || "#E5B93F";
}

function renderMapMarkers(){
  Object.entries(DEMO_LOCATIONS).forEach(([name, d]) => {
    const risk = d.risk;
    const color = riskColorVar(risk);
    const marker = L.circleMarker([d.lat, d.lng], {
      radius: name === state.location ? 12 : 9,
      color: "#0E1417",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.9,
    }).addTo(map);

    marker.bindPopup(`
      <div class="map-popup">
        <h4>${name}</h4>
        <table>
          <tr><td>Temperature</td><td>${d.temperature}°C</td></tr>
          <tr><td>Humidity</td><td>${d.humidity}%</td></tr>
          <tr><td>Heat index</td><td>${d.heatIndex}°C</td></tr>
          <tr><td>Risk score</td><td>${d.riskScore}/100</td></tr>
          <tr><td>Risk level</td><td>${RISK_META[risk].label}</td></tr>
        </table>
      </div>`);

    marker.on("click", () => {
      if (DEMO_LOCATIONS[name]) selectLocation(name);
    });
    mapMarkers[name] = marker;
  });
}

/* ---------- Safety recommendations ---------- */
function renderRecommendations(profile){
  const rec = SAFETY_RECS[profile];
  const label = $(`.profile-chip[data-profile="${profile}"]`).textContent.trim();
  const card = $("#recommendCard");
  card.innerHTML = `
    <h3><i class="fa-solid ${rec.icon}" style="color:var(--accent); margin-right:8px;"></i>${label} — heat safety recommendations</h3>
    <div class="recommend-list">
      ${rec.items.map(item => `<div class="recommend-item"><i class="fa-solid fa-check"></i><span>${item}</span></div>`).join("")}
    </div>`;
}

/* ---------- Location dropdown ---------- */
function renderLocationDropdown(){
  const dropdown = $("#locationDropdown");
  dropdown.innerHTML = Object.keys(DEMO_LOCATIONS).map(name =>
    `<li role="option"><button data-loc="${name}">${name}</button></li>`).join("");
}

/* ---------- AI Assistant (rule-based, grounded in current risk data — never invents a score) ---------- */
function assistantReply(question, data){
  const meta = RISK_META[data.risk];
  const q = question.toLowerCase();

  if (q.includes("safe to go outside") || q.includes("safe outside")){
    return data.risk === "low" || data.risk === "moderate"
      ? `It's reasonably safe right now. Current thermal stress is ${meta.label} (${data.riskScore}/100). Stay hydrated and avoid the peak afternoon hours if possible.`
      : `Current thermal stress risk is ${meta.label} (${data.riskScore}/100). It's best to avoid unnecessary outdoor exposure, especially between 12 PM and 4 PM. If you must go out, hydrate well and seek shade.`;
  }
  if (q.includes("heat risk") || q.includes("today's heat") || q.includes("today heat")){
    return `Today's heat risk in ${data.location} is ${meta.label} with a thermal stress score of ${data.riskScore}/100 and a heatwave probability of ${Math.round(data.heatwaveProb*100)}%. Heat index is ${data.heatIndex.toFixed(1)}°C.`;
  }
  if (q.includes("avoid heat stress") || q.includes("avoid heat")){
    return `To avoid heat stress: drink water regularly even if you don't feel thirsty, avoid strenuous activity between 12 PM and 4 PM, wear light loose clothing, and rest in shade or a cooled space whenever you feel overheated.`;
  }
  if (q.includes("exercise")){
    return data.risk === "extreme" || data.risk === "high"
      ? `With ${meta.label.toLowerCase()} thermal stress today, it's best to postpone intense outdoor exercise or move it to early morning/evening. If you must train, shorten sessions and hydrate frequently.`
      : `Thermal stress is currently ${meta.label.toLowerCase()}, so moderate exercise should be fine — just stay hydrated and take breaks in shade.`;
  }
  if (q.includes("why") && q.includes("high")){
    const list = FACTOR_TEMPLATES[data.risk] || FACTOR_TEMPLATES.moderate;
    const top = list.slice(0,2).map(f => f[0].toLowerCase()).join(" and ");
    return `The risk is elevated mainly because of ${top}, combined with limited wind cooling. You can see the full breakdown in the "Thermal stress factors" section above.`;
  }
  if (q.includes("cricket") || q.includes("sport") || q.includes("play")){
    return `Current thermal stress risk is ${meta.label}. Peak heat is expected during the afternoon. Consider moving outdoor activity to early morning or evening and stay hydrated.`;
  }
  return `Current thermal stress in ${data.location} is ${meta.label} (${data.riskScore}/100), with a heatwave probability of ${Math.round(data.heatwaveProb*100)}%. Ask me about safety, exercise, or why the risk looks the way it does.`;
}

function appendChatMessage(text, who){
  const win = $("#chatWindow");
  const msg = document.createElement("div");
  msg.className = `chat-msg ${who}`;
  msg.textContent = text;
  win.appendChild(msg);
  win.scrollTop = win.scrollHeight;
  return msg;
}

async function handleUserQuestion(question, currentData){
  appendChatMessage(question, "user");
  const typing = appendChatMessage("HeatSafe AI is thinking…", "bot typing");
  await new Promise(r => setTimeout(r, 550));
  typing.remove();
  appendChatMessage(assistantReply(question, currentData), "bot");
}

/* ---------- Location selection (drives all widgets) ---------- */
let currentRiskData = null;

async function selectLocation(name){
  state.location = name;
  $("#currentLocationLabel").textContent = DEMO_LOCATIONS[name] ? `${name}, Punjab` : name;
  $("#locationDropdown").hidden = true;

  setLoadingState(true);
  const data = await fetchRisk(name);
  currentRiskData = data;
  setLoadingState(false);

  renderRisk(data);
  renderPredictionChart(data);
  renderClock();

  if (map){
    Object.values(mapMarkers).forEach(m => map.removeLayer(m));
    mapMarkers = {};
    renderMapMarkers();
    const d = DEMO_LOCATIONS[name];
    if (d) map.flyTo([d.lat, d.lng], 8, { duration: 0.8 });
  }
}

function setLoadingState(isLoading){
  const ids = ["#riskScoreNum","#statHeatwaveProb","#statHeatIndex","#wTemp","#wHumidity","#wWind","#wSolar"];
  if (isLoading){
    ids.forEach(id => { const el = $(id); if (el) el.dataset.prev = el.textContent; });
    $("#statRiskStatus").textContent = "Fetching weather…";
  }
}

/* ---------- Event wiring ---------- */
function wireEvents(){
  // Theme toggle
  $("#themeToggle").addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") !== "light";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
    $("#themeToggle").innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    try{ window.localStorage.setItem("heatsafe-theme", isDark ? "light" : "dark"); }catch(e){}
    if (currentRiskData) renderPredictionChart(currentRiskData); // refresh chart colors
  });

  // Hamburger
  $("#hamburgerBtn").addEventListener("click", () => {
    const nav = $("#mobileNav");
    const expanded = $("#hamburgerBtn").getAttribute("aria-expanded") === "true";
    nav.hidden = expanded;
    if (!expanded) nav.setAttribute("data-open","");
    else nav.removeAttribute("data-open");
    $("#hamburgerBtn").setAttribute("aria-expanded", String(!expanded));
  });
  $all("#mobileNav a").forEach(a => a.addEventListener("click", () => {
    $("#mobileNav").hidden = true;
    $("#hamburgerBtn").setAttribute("aria-expanded","false");
  }));

  // Location dropdown
  $("#locationBtn").addEventListener("click", () => {
    $("#locationDropdown").hidden = !$("#locationDropdown").hidden;
  });
  $("#locationDropdown").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-loc]");
    if (btn) selectLocation(btn.dataset.loc);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".header-actions")) $("#locationDropdown").hidden = true;
  });

  // Notifications (simple toggle demo)
  $("#notifBtn").addEventListener("click", () => {
    document.getElementById("alerts").scrollIntoView({ behavior: "smooth" });
  });

  // Hero CTA
  $("#checkRiskBtn").addEventListener("click", () => {
    document.getElementById("riskSection").scrollIntoView({ behavior: "smooth" });
  });

  // Explain prediction modal
  $("#explainBtn").addEventListener("click", () => {
    if (!currentRiskData) return;
    $("#explainModalBody").innerHTML = buildExplainContent(currentRiskData, currentRiskData.risk);
    $("#explainModal").hidden = false;
  });
  $("#explainModalClose").addEventListener("click", () => $("#explainModal").hidden = true);
  $("#explainModal").addEventListener("click", (e) => { if (e.target.id === "explainModal") $("#explainModal").hidden = true; });

  // Safety modal (from alert banner)
  $("#viewSafetyBtn").addEventListener("click", () => {
    const rec = SAFETY_RECS[state.profile];
    $("#safetyModalBody").innerHTML = rec.items.map(i => `<li>${i}</li>`).join("");
    $("#safetyModal").hidden = false;
  });
  $("#safetyModalClose").addEventListener("click", () => $("#safetyModal").hidden = true);
  $("#safetyModal").addEventListener("click", (e) => { if (e.target.id === "safetyModal") $("#safetyModal").hidden = true; });

  // Range toggle for prediction chart
  $all(".range-btn").forEach(btn => btn.addEventListener("click", () => {
    $all(".range-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.rangeHours = Number(btn.dataset.hours);
    if (currentRiskData) renderPredictionChart(currentRiskData);
  }));

  // Profile chips
  $all(".profile-chip").forEach(chip => chip.addEventListener("click", () => {
    $all(".profile-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    state.profile = chip.dataset.profile;
    renderRecommendations(state.profile);
  }));

  // Chat
  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chatInput");
    const value = input.value.trim();
    if (!value || !currentRiskData) return;
    input.value = "";
    handleUserQuestion(value, currentRiskData);
  });
  $all("#quickQuestions button").forEach(btn => btn.addEventListener("click", () => {
    if (currentRiskData) handleUserQuestion(btn.textContent, currentRiskData);
  }));

  // Nav active state on click (smooth scroll already via CSS)
  $all(".nav-link").forEach(link => link.addEventListener("click", () => {
    $all(".nav-link").forEach(l => l.classList.remove("active"));
    link.classList.add("active");
  }));

  // Esc closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      $("#explainModal").hidden = true;
      $("#safetyModal").hidden = true;
    }
  });
}

/* ---------- Init ---------- */
async function init(){
  try{
    const savedTheme = window.localStorage.getItem("heatsafe-theme");
    if (savedTheme){
      document.documentElement.setAttribute("data-theme", savedTheme);
      $("#themeToggle").innerHTML = savedTheme === "light" ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
  }catch(e){}

  renderClock();
  renderLocationDropdown();
  renderRecommendations(state.profile);
  wireEvents();
  initMap();

  currentRiskData = await fetchRisk(state.location);
  renderRisk(currentRiskData);
  renderPredictionChart(currentRiskData);

  appendChatMessage(`Hi, I'm the HeatSafe AI Assistant. Current thermal stress in ${currentRiskData.location} is ${RISK_META[currentRiskData.risk].label} (${currentRiskData.riskScore}/100). Ask me anything about today's heat conditions.`, "bot");

  setInterval(renderClock, 60000);
}

document.addEventListener("DOMContentLoaded", init);