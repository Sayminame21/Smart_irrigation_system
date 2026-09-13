/* =========================================================
   FIELDWELL — ESP32 SMART IRRIGATION DASHBOARD
   ---------------------------------------------------------
   Runs in DEMO_MODE out of the box with simulated sensors.

   To connect a real ESP32:
   1. Set DEMO_MODE to false below.
   2. Change ESP32_API.baseUrl to your device address,
      e.g. "http://192.168.1.120"
   3. Implement the REST endpoints listed in ESP32_API.endpoints
      on the device firmware. Expected JSON body for /api/status:
        {
          moisture, rawMoisture, pump, automatic,
          online, wifiConnected, signalStrength, uptimeSeconds,
          pumpOnThreshold, pumpOffThreshold,
          temperature, humidity, tankLevel, windSpeed, windDirection
        }
      Any fields you omit fall back gracefully.
   ========================================================= */


/* =========================================================
   API CONFIGURATION
   ========================================================= */

const DEMO_MODE = true;

const ESP32_API = {
  baseUrl: "http://192.168.1.120",
  endpoints: {
    status: "/api/status",
    pumpOn: "/api/pump/on",
    pumpOff: "/api/pump/off",
    automaticOn: "/api/automatic/on",
    automaticOff: "/api/automatic/off",
    settings: "/api/settings"
  },
  pollIntervalMs: 2000,
  requestTimeoutMs: 4000
};

// Weather widget uses Open-Meteo (no API key required). Falls back
// to this location if browser geolocation is unavailable or denied.
const WEATHER_FALLBACK = { latitude: 28.6139, longitude: 77.2090, name: "Default location" };
const WEATHER_REFRESH_MS = 10 * 60 * 1000;

const HISTORY_POINTS = 24; // hourly points, last 24h
const HISTORY_TICK_MS = 20000; // demo: advance one "hour" every 20s


/* =========================================================
   APPLICATION STATE
   ========================================================= */

const state = {
  moisture: null,
  rawMoisture: null,
  pump: false,
  automatic: true,
  online: false,
  pumpOnThreshold: 35,
  pumpOffThreshold: 60,
  wifiConnected: false,
  signalStrength: null,
  uptimeSeconds: 0,
  lastSensorUpdate: null,
  commandLocked: false,
  activity: [],

  temperature: null,
  humidity: null,
  tankLevel: null,
  windSpeed: null,
  windDirection: null,

  history: { labels: [], moisture: [], temperature: [], humidity: [] },
  usage: { labels: [], values: [] },

  alerts: []
};

const demoState = {
  moisture: 46,
  rawMoisture: 2450,
  pump: false,
  automatic: true,
  pumpOnThreshold: 35,
  pumpOffThreshold: 60,
  uptimeSeconds: 16342,
  signalStrength: -58,
  temperature: 27.5,
  humidity: 58,
  tankLevel: 71,
  windSpeed: 9,
  windDirection: "NE"
};


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const els = {
  moistureValue: document.getElementById("moistureValue"),
  rawMoistureValue: document.getElementById("rawMoistureValue"),
  soilStateBadge: document.getElementById("soilStateBadge"),
  moistureDescription: document.getElementById("moistureDescription"),
  gaugeProgress: document.getElementById("gaugeProgress"),
  gaugeMarkerOn: document.getElementById("gaugeMarkerOn"),
  gaugeMarkerOff: document.getElementById("gaugeMarkerOff"),
  autoOnLabel: document.getElementById("autoOnLabel"),
  autoOffLabel: document.getElementById("autoOffLabel"),

  tempValue: document.getElementById("tempValue"),
  humidityValue: document.getElementById("humidityValue"),
  tankValue: document.getElementById("tankValue"),
  tankBarFill: document.getElementById("tankBarFill"),
  windValue: document.getElementById("windValue"),
  windDirection: document.getElementById("windDirection"),
  sparkTemp: document.getElementById("sparkTemp"),
  sparkHumidity: document.getElementById("sparkHumidity"),

  weatherIcon: document.getElementById("weatherIcon"),
  weatherTemp: document.getElementById("weatherTemp"),
  weatherDesc: document.getElementById("weatherDesc"),
  weatherFeels: document.getElementById("weatherFeels"),
  weatherHumidity: document.getElementById("weatherHumidity"),
  weatherWind: document.getElementById("weatherWind"),
  weatherPlace: document.getElementById("weatherPlace"),
  weatherSource: document.getElementById("weatherSource"),

  pumpStatus: document.getElementById("pumpStatus"),
  pumpStatusText: document.getElementById("pumpStatusText"),
  pumpHelper: document.getElementById("pumpHelper"),
  pumpOnBtn: document.getElementById("pumpOnBtn"),
  pumpOffBtn: document.getElementById("pumpOffBtn"),
  secondaryPumpOnBtn: document.getElementById("secondaryPumpOnBtn"),
  secondaryPumpOffBtn: document.getElementById("secondaryPumpOffBtn"),

  automaticToggle: document.getElementById("automaticToggle"),
  autoModeLabel: document.getElementById("autoModeLabel"),
  pumpOnThreshold: document.getElementById("pumpOnThreshold"),
  pumpOffThreshold: document.getElementById("pumpOffThreshold"),
  thresholdForm: document.getElementById("thresholdForm"),
  thresholdValidation: document.getElementById("thresholdValidation"),

  headerStatusDot: document.getElementById("headerStatusDot"),
  headerStatusText: document.getElementById("headerStatusText"),
  sidebarStatusDot: document.getElementById("sidebarStatusDot"),
  sidebarStatusText: document.getElementById("sidebarStatusText"),
  sidebarModeText: document.getElementById("sidebarModeText"),
  modeBadge: document.getElementById("modeBadge"),
  currentDateTime: document.getElementById("currentDateTime"),

  infoEspStatus: document.getElementById("infoEspStatus"),
  infoWifiStatus: document.getElementById("infoWifiStatus"),
  infoSignal: document.getElementById("infoSignal"),
  infoUptime: document.getElementById("infoUptime"),
  infoLastUpdate: document.getElementById("infoLastUpdate"),
  infoPumpStatus: document.getElementById("infoPumpStatus"),
  infoMode: document.getElementById("infoMode"),

  activityList: document.getElementById("activityList"),
  historyTableBody: document.getElementById("historyTableBody"),
  alertsList: document.getElementById("alertsList"),
  alertsStrip: document.getElementById("alertsStrip"),

  connectionBanner: document.getElementById("connectionBanner"),
  connectionBannerTitle: document.getElementById("connectionBannerTitle"),
  connectionBannerMessage: document.getElementById("connectionBannerMessage"),
  retryConnectionBtn: document.getElementById("retryConnectionBtn"),

  confirmationModal: document.getElementById("confirmationModal"),
  cancelPumpOn: document.getElementById("cancelPumpOn"),
  confirmPumpOn: document.getElementById("confirmPumpOn"),

  toastRegion: document.getElementById("toastRegion"),

  menuToggle: document.getElementById("menuToggle"),
  mobileOverlay: document.getElementById("mobileOverlay"),

  dashboardSection: document.getElementById("dashboardSection"),
  irrigationSection: document.getElementById("irrigationSection"),
  historySection: document.getElementById("historySection"),
  settingsSection: document.getElementById("settingsSection"),
  navItems: Array.from(document.querySelectorAll(".nav-item")),
  viewHistoryBtn: document.getElementById("viewHistoryBtn"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),

  irrigationModeDetail: document.getElementById("irrigationModeDetail"),
  secondaryOnThreshold: document.getElementById("secondaryOnThreshold"),
  secondaryOffThreshold: document.getElementById("secondaryOffThreshold"),
  settingsDemoMode: document.getElementById("settingsDemoMode"),
  settingsApiBase: document.getElementById("settingsApiBase"),

  trendTabs: document.getElementById("trendTabs"),
  usageTotal: document.getElementById("usageTotal")
};

const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 82;
let trendChart = null;
let usageChart = null;
let activeTrendMetric = "moisture";


/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeDashboard() {
  setupEventListeners();
  updateClock();
  setInterval(updateClock, 1000);

  els.settingsDemoMode.textContent = DEMO_MODE ? "Demo mode" : "Live ESP32";
  els.settingsApiBase.textContent = ESP32_API.baseUrl;

  seedHistory();
  seedUsage();
  addInitialDemoActivity();
  buildCharts();

  updateConnectionStatus("connecting");
  fetchSystemStatus();
  setInterval(fetchSystemStatus, ESP32_API.pollIntervalMs);
  setInterval(advanceHistory, HISTORY_TICK_MS);

  fetchWeather();
  setInterval(fetchWeather, WEATHER_REFRESH_MS);
}

function setupEventListeners() {
  els.pumpOnBtn.addEventListener("click", requestPumpOnConfirmation);
  els.secondaryPumpOnBtn.addEventListener("click", requestPumpOnConfirmation);

  els.pumpOffBtn.addEventListener("click", () => setPumpState(false));
  els.secondaryPumpOffBtn.addEventListener("click", () => setPumpState(false));

  els.confirmPumpOn.addEventListener("click", async () => {
    closePumpConfirmation();
    await setPumpState(true);
  });
  els.cancelPumpOn.addEventListener("click", closePumpConfirmation);
  els.confirmationModal.addEventListener("click", (event) => {
    if (event.target === els.confirmationModal) closePumpConfirmation();
  });

  els.autoModeLabel.addEventListener("click", (event) => {
    event.preventDefault();
    setAutomaticMode(!state.automatic);
  });

  els.thresholdForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveThresholds();
  });

  els.retryConnectionBtn.addEventListener("click", fetchSystemStatus);

  els.menuToggle.addEventListener("click", toggleMobileMenu);
  els.mobileOverlay.addEventListener("click", closeMobileMenu);

  els.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      showSection(item.dataset.section);
      closeMobileMenu();
    });
  });

  els.viewHistoryBtn.addEventListener("click", () => showSection("history"));

  els.trendTabs.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      els.trendTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTrendMetric = tab.dataset.metric;
      updateTrendChart();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePumpConfirmation();
      closeMobileMenu();
    }
  });
}


/* =========================================================
   LIVE STATUS FETCHING
   ========================================================= */

async function fetchSystemStatus() {
  if (DEMO_MODE) {
    handleSuccessfulStatus(generateDemoStatus());
    return;
  }

  try {
    const data = await apiRequest(ESP32_API.endpoints.status, { method: "GET" });
    handleSuccessfulStatus(data);
  } catch (error) {
    console.warn("ESP32 status request failed:", error);
    state.online = false;
    state.wifiConnected = false;
    updateConnectionStatus("offline");
    updateDashboard();
    showOfflineBanner("Controller offline", "The ESP32 did not respond. Live values may be stale.");
  }
}

function handleSuccessfulStatus(data) {
  const wasOffline = !state.online;

  state.moisture = clampNumber(Number(data.moisture), 0, 100);
  state.rawMoisture = Number.isFinite(Number(data.rawMoisture)) ? Number(data.rawMoisture) : null;
  state.pump = Boolean(data.pump);
  state.automatic = Boolean(data.automatic);
  state.online = data.online !== false;
  state.pumpOnThreshold = clampNumber(Number(data.pumpOnThreshold ?? state.pumpOnThreshold), 0, 99);
  state.pumpOffThreshold = clampNumber(Number(data.pumpOffThreshold ?? state.pumpOffThreshold), 1, 100);

  state.wifiConnected = data.wifiConnected !== false;
  state.signalStrength = Number.isFinite(Number(data.signalStrength)) ? Number(data.signalStrength) : state.signalStrength;
  state.uptimeSeconds = Number.isFinite(Number(data.uptimeSeconds)) ? Number(data.uptimeSeconds) : state.uptimeSeconds;

  state.temperature = Number.isFinite(Number(data.temperature)) ? Number(data.temperature) : state.temperature;
  state.humidity = Number.isFinite(Number(data.humidity)) ? Number(data.humidity) : state.humidity;
  state.tankLevel = Number.isFinite(Number(data.tankLevel)) ? clampNumber(Number(data.tankLevel), 0, 100) : state.tankLevel;
  state.windSpeed = Number.isFinite(Number(data.windSpeed)) ? Number(data.windSpeed) : state.windSpeed;
  state.windDirection = data.windDirection ?? state.windDirection;

  state.lastSensorUpdate = new Date();

  updateConnectionStatus(state.online ? "online" : "offline");
  updateDashboard();
  evaluateAlerts();

  if (state.online) hideOfflineBanner();
  if (wasOffline && state.online) {
    showNotification("ESP32 connected", "Live controller communication is active.", "success");
  }
}


/* =========================================================
   DASHBOARD UI UPDATE
   ========================================================= */

function updateDashboard() {
  const moisture = state.moisture;

  if (moisture === null) {
    els.moistureValue.textContent = "--";
    els.rawMoistureValue.textContent = "----";
    els.moistureDescription.textContent = "Waiting for sensor data";
    els.gaugeProgress.style.strokeDashoffset = GAUGE_CIRCUMFERENCE;
  } else {
    els.moistureValue.textContent = Math.round(moisture);
    els.rawMoistureValue.textContent = state.rawMoisture === null ? "----" : Math.round(state.rawMoisture);

    const condition = getSoilCondition(moisture);
    els.soilStateBadge.textContent = condition.label;
    els.soilStateBadge.className = `sensor-state ${condition.className}`;
    els.moistureDescription.textContent = condition.description;

    const offset = GAUGE_CIRCUMFERENCE * (1 - moisture / 100);
    els.gaugeProgress.style.strokeDashoffset = String(offset);
  }

  els.gaugeMarkerOn.style.transform = `rotate(${(state.pumpOnThreshold / 100) * 360}deg)`;
  els.gaugeMarkerOff.style.transform = `rotate(${(state.pumpOffThreshold / 100) * 360}deg)`;
  els.autoOnLabel.textContent = state.pumpOnThreshold;
  els.autoOffLabel.textContent = state.pumpOffThreshold;

  els.tempValue.textContent = state.temperature === null ? "--" : state.temperature.toFixed(1);
  els.humidityValue.textContent = state.humidity === null ? "--" : Math.round(state.humidity);
  els.tankValue.textContent = state.tankLevel === null ? "--" : Math.round(state.tankLevel);
  els.tankBarFill.style.width = `${state.tankLevel ?? 0}%`;
  els.windValue.textContent = state.windSpeed === null ? "--" : Math.round(state.windSpeed);
  els.windDirection.textContent = state.windDirection ? `Heading ${state.windDirection}` : "--";

  drawSpark(els.sparkTemp, state.history.temperature, "#F2B84B");
  drawSpark(els.sparkHumidity, state.history.humidity, "#4FB6E0");

  els.pumpStatus.classList.toggle("running", state.pump);
  els.pumpStatusText.textContent = state.pump ? "ON" : "OFF";

  els.automaticToggle.checked = state.automatic;
  els.autoModeLabel.classList.toggle("active", state.automatic);

  els.pumpHelper.textContent = state.automatic
    ? "Automatic mode is active. The ESP32 controls the pump using the configured moisture thresholds."
    : "Manual mode is active. Use Start and Stop to control the pump directly.";

  const pumpDisabledOn = state.automatic || state.commandLocked || state.pump;
  const pumpDisabledOff = state.automatic || state.commandLocked || !state.pump;

  els.pumpOnBtn.disabled = pumpDisabledOn;
  els.secondaryPumpOnBtn.disabled = pumpDisabledOn;
  els.pumpOffBtn.disabled = pumpDisabledOff;
  els.secondaryPumpOffBtn.disabled = pumpDisabledOff;

  els.pumpOnThreshold.value = state.pumpOnThreshold;
  els.pumpOffThreshold.value = state.pumpOffThreshold;
  els.secondaryOnThreshold.textContent = `${state.pumpOnThreshold}%`;
  els.secondaryOffThreshold.textContent = `${state.pumpOffThreshold}%`;

  els.modeBadge.textContent = state.automatic ? "Automatic" : "Manual";
  els.sidebarModeText.textContent = `Mode — ${state.automatic ? "Automatic" : "Manual"}`;

  els.infoEspStatus.textContent = state.online ? "Online" : "Offline";
  els.infoWifiStatus.textContent = state.wifiConnected ? "Connected" : "Disconnected";
  els.infoSignal.textContent = state.signalStrength !== null ? `${state.signalStrength} dBm` : "--";
  els.infoUptime.textContent = formatUptime(state.uptimeSeconds);
  els.infoLastUpdate.textContent = state.lastSensorUpdate ? formatTime(state.lastSensorUpdate) : "--";
  els.infoPumpStatus.textContent = state.pump ? "Running" : "Stopped";
  els.infoMode.textContent = state.automatic ? "Automatic" : "Manual";

  els.irrigationModeDetail.textContent = state.automatic
    ? "Automatic irrigation is enabled. Manual pump buttons are locked to avoid conflicting commands."
    : "Manual mode is enabled. You can directly start and stop the water pump.";

  renderActivity();
  renderHistoryTable();
}

function drawSpark(svgEl, values, color) {
  if (!svgEl || !values || values.length < 2) return;
  const w = 100, h = 32, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  svgEl.innerHTML = `<polyline points="${points.join(" ")}" style="stroke:${color}" />`;
}


/* =========================================================
   PUMP CONTROL
   ========================================================= */

function requestPumpOnConfirmation() {
  if (state.automatic) {
    showNotification("Manual control unavailable", "Disable automatic irrigation before starting the pump manually.", "warning");
    return;
  }
  if (state.commandLocked || state.pump) return;
  els.confirmationModal.hidden = false;
}

function closePumpConfirmation() {
  els.confirmationModal.hidden = true;
}

async function setPumpState(turnOn) {
  if (state.commandLocked) return;

  if (state.automatic) {
    showNotification("Automatic mode is active", "Disable automatic irrigation before using manual pump controls.", "warning");
    return;
  }

  setCommandLock(true);

  try {
    if (DEMO_MODE) {
      await wait(400);
      demoState.pump = turnOn;
    } else {
      const endpoint = turnOn ? ESP32_API.endpoints.pumpOn : ESP32_API.endpoints.pumpOff;
      await apiRequest(endpoint, { method: "POST" });
    }

    state.pump = turnOn;
    addActivity(turnOn ? "Pump turned on" : "Pump turned off", turnOn ? "pump-on" : "pump-off");
    updateDashboard();
    showNotification(
      turnOn ? "Pump turned on" : "Pump turned off",
      turnOn ? "Manual irrigation is running." : "Manual irrigation has stopped.",
      "success"
    );
  } catch (error) {
    console.error("Pump command failed:", error);
    showNotification("Command failed", "Unable to communicate with the ESP32.", "error");
  } finally {
    setCommandLock(false);
  }
}


/* =========================================================
   AUTOMATIC MODE CONTROL
   ========================================================= */

async function setAutomaticMode(enabled) {
  if (state.commandLocked) return;

  setCommandLock(true);

  try {
    if (DEMO_MODE) {
      await wait(350);
      demoState.automatic = enabled;
      if (enabled) applyDemoAutomaticLogic();
    } else {
      const endpoint = enabled ? ESP32_API.endpoints.automaticOn : ESP32_API.endpoints.automaticOff;
      await apiRequest(endpoint, { method: "POST" });
    }

    state.automatic = enabled;
    addActivity(enabled ? "Automatic irrigation enabled" : "Manual irrigation mode enabled", "auto");
    updateDashboard();
    showNotification(
      enabled ? "Automatic irrigation enabled" : "Manual mode enabled",
      enabled ? "ESP32 threshold control is now active." : "Manual pump controls are now available.",
      "success"
    );
  } catch (error) {
    console.error("Automatic mode command failed:", error);
    showNotification("Command failed", "Unable to communicate with the ESP32.", "error");
  } finally {
    setCommandLock(false);
  }
}


/* =========================================================
   THRESHOLD SETTINGS
   ========================================================= */

async function saveThresholds() {
  const pumpOnThreshold = Number(els.pumpOnThreshold.value);
  const pumpOffThreshold = Number(els.pumpOffThreshold.value);

  const validationMessage = validateThresholds(pumpOnThreshold, pumpOffThreshold);
  if (validationMessage) {
    els.thresholdValidation.textContent = validationMessage;
    showNotification("Check thresholds", validationMessage, "warning");
    return;
  }

  els.thresholdValidation.textContent = "";
  setCommandLock(true);

  try {
    if (DEMO_MODE) {
      await wait(450);
      demoState.pumpOnThreshold = pumpOnThreshold;
      demoState.pumpOffThreshold = pumpOffThreshold;
      applyDemoAutomaticLogic();
    } else {
      await apiRequest(ESP32_API.endpoints.settings, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pumpOnThreshold, pumpOffThreshold })
      });
    }

    state.pumpOnThreshold = pumpOnThreshold;
    state.pumpOffThreshold = pumpOffThreshold;
    addActivity(`Thresholds updated: on ${pumpOnThreshold}% / off ${pumpOffThreshold}%`, "auto");
    updateDashboard();
    showNotification("Thresholds saved", `Pump on below ${pumpOnThreshold}% and off above ${pumpOffThreshold}%.`, "success");
  } catch (error) {
    console.error("Threshold save failed:", error);
    showNotification("Unable to save thresholds", "Unable to communicate with the ESP32.", "error");
  } finally {
    setCommandLock(false);
  }
}

function validateThresholds(onValue, offValue) {
  if (!Number.isFinite(onValue) || !Number.isFinite(offValue)) return "Enter valid numeric thresholds.";
  if (onValue < 0 || onValue > 99) return "Pump ON threshold must be between 0% and 99%.";
  if (offValue < 1 || offValue > 100) return "Pump OFF threshold must be between 1% and 100%.";
  if (onValue >= offValue) return "Pump ON threshold must be lower than pump OFF threshold.";
  if (offValue - onValue < 5) return "Keep at least a 5% gap between ON and OFF thresholds.";
  return "";
}


/* =========================================================
   ALERTS
   ========================================================= */

function evaluateAlerts() {
  const alerts = [];

  if (state.moisture !== null && state.moisture <= state.pumpOnThreshold - 5 && !state.pump) {
    alerts.push({ level: "critical", text: `Soil moisture is critically low at ${Math.round(state.moisture)}%.` });
  } else if (state.moisture !== null && state.moisture <= state.pumpOnThreshold) {
    alerts.push({ level: "warning", text: `Soil moisture has dropped to ${Math.round(state.moisture)}%, near the irrigation threshold.` });
  }

  if (state.tankLevel !== null && state.tankLevel <= 15) {
    alerts.push({ level: "critical", text: `Water tank level is critically low at ${Math.round(state.tankLevel)}%.` });
  } else if (state.tankLevel !== null && state.tankLevel <= 30) {
    alerts.push({ level: "warning", text: `Water tank is running low at ${Math.round(state.tankLevel)}%.` });
  }

  if (!state.online) {
    alerts.push({ level: "warning", text: "Controller connection lost. Sensor readings may be stale." });
  }

  const previousCount = state.alerts.length;
  state.alerts = alerts;
  renderAlerts();

  if (alerts.length > previousCount && alerts.length > 0) {
    const newest = alerts[0];
    showNotification(newest.level === "critical" ? "Critical alert" : "Attention needed", newest.text, newest.level === "critical" ? "error" : "warning");
  }
}

function renderAlerts() {
  if (!state.alerts.length) {
    els.alertsList.innerHTML = `
      <div class="alert-row ok">
        <svg viewBox="0 0 24 24"><use href="#i-leaf"/></svg>
        <span>No active alerts — conditions look healthy.</span>
      </div>`;
    els.alertsStrip.hidden = true;
    els.alertsStrip.innerHTML = "";
    return;
  }

  const rows = state.alerts.map((alert) => `
    <div class="alert-row ${alert.level}">
      <svg viewBox="0 0 24 24"><use href="#i-alert"/></svg>
      <span>${escapeHtml(alert.text)}</span>
    </div>
  `).join("");

  els.alertsList.innerHTML = rows;

  const critical = state.alerts.filter((a) => a.level === "critical");
  if (critical.length) {
    els.alertsStrip.hidden = false;
    els.alertsStrip.innerHTML = critical.map((alert) => `
      <div class="alert-row critical">
        <svg viewBox="0 0 24 24"><use href="#i-alert"/></svg>
        <span>${escapeHtml(alert.text)}</span>
      </div>
    `).join("");
  } else {
    els.alertsStrip.hidden = true;
    els.alertsStrip.innerHTML = "";
  }
}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function updateConnectionStatus(status) {
  const isOnline = status === "online";
  const isOffline = status === "offline";

  els.headerStatusDot.className = "status-dot";
  els.sidebarStatusDot.className = "status-dot";

  if (isOnline) {
    els.headerStatusDot.classList.add("connected");
    els.sidebarStatusDot.classList.add("connected");
    els.headerStatusText.textContent = "Connected";
    els.sidebarStatusText.textContent = "Connected";
  } else if (isOffline) {
    els.headerStatusDot.classList.add("offline");
    els.sidebarStatusDot.classList.add("offline");
    els.headerStatusText.textContent = "Offline";
    els.sidebarStatusText.textContent = "Disconnected";
  } else {
    els.headerStatusDot.classList.add("connecting");
    els.sidebarStatusDot.classList.add("connecting");
    els.headerStatusText.textContent = "Connecting";
    els.sidebarStatusText.textContent = "Connecting";
  }
}

function showOfflineBanner(title, message) {
  els.connectionBannerTitle.textContent = title;
  els.connectionBannerMessage.textContent = message;
  els.connectionBanner.hidden = false;
}

function hideOfflineBanner() {
  els.connectionBanner.hidden = true;
}


/* =========================================================
   API REQUEST HELPER
   ========================================================= */

async function apiRequest(endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESP32_API.requestTimeoutMs);

  try {
    const response = await fetch(`${ESP32_API.baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`ESP32 returned HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return await response.json();
    return { success: true };
  } finally {
    clearTimeout(timeout);
  }
}


/* =========================================================
   WEATHER WIDGET (Open-Meteo — no API key required)
   ========================================================= */

const WEATHER_CODES = {
  0: { label: "Clear sky", icon: "i-sun" },
  1: { label: "Mostly clear", icon: "i-cloud-sun" },
  2: { label: "Partly cloudy", icon: "i-cloud-sun" },
  3: { label: "Overcast", icon: "i-cloud" },
  45: { label: "Foggy", icon: "i-cloud" },
  48: { label: "Foggy", icon: "i-cloud" },
  51: { label: "Light drizzle", icon: "i-rain" },
  53: { label: "Drizzle", icon: "i-rain" },
  55: { label: "Dense drizzle", icon: "i-rain" },
  61: { label: "Light rain", icon: "i-rain" },
  63: { label: "Rain", icon: "i-rain" },
  65: { label: "Heavy rain", icon: "i-rain" },
  71: { label: "Light snow", icon: "i-rain" },
  80: { label: "Rain showers", icon: "i-rain" },
  95: { label: "Thunderstorm", icon: "i-rain" }
};

function fetchWeather() {
  if (!navigator.geolocation) {
    loadWeather(WEATHER_FALLBACK.latitude, WEATHER_FALLBACK.longitude, WEATHER_FALLBACK.name);
    return;
  }

  els.weatherSource.textContent = "Locating…";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const placeLabel = await reverseGeocode(latitude, longitude);
      loadWeather(latitude, longitude, placeLabel);
    },
    () => {
      loadWeather(WEATHER_FALLBACK.latitude, WEATHER_FALLBACK.longitude, WEATHER_FALLBACK.name);
    },
    { timeout: 6000, maximumAge: 10 * 60 * 1000 }
  );
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error("Reverse-geocoding request failed");
    const data = await response.json();

    const city = data.city || data.locality || data.localityInfo?.administrative?.[2]?.name || "";
    const region = data.principalSubdivision || "";
    const country = data.countryName || "";

    const parts = [city, region].filter(Boolean);
    if (parts.length) return [...new Set(parts)].join(", ");
    return country || "Current location";
  } catch (error) {
    console.warn("Reverse geocoding failed:", error);
    return "Current location";
  }
}

async function loadWeather(lat, lon, placeLabel) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&timezone=auto`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) throw new Error("Weather request failed");
    const data = await response.json();
    const current = data.current;

    const code = WEATHER_CODES[current.weather_code] || { label: "Conditions unavailable", icon: "i-cloud" };

    els.weatherIcon.innerHTML = `<svg viewBox="0 0 24 24"><use href="#${code.icon}"/></svg>`;
    els.weatherTemp.textContent = `${Math.round(current.temperature_2m)}°`;
    els.weatherDesc.textContent = code.label;
    els.weatherFeels.textContent = `${Math.round(current.apparent_temperature)}°`;
    els.weatherHumidity.textContent = `${Math.round(current.relative_humidity_2m)}%`;
    els.weatherWind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    els.weatherPlace.textContent = placeLabel;
    els.weatherSource.textContent = "Live";
  } catch (error) {
    console.warn("Weather fetch failed, showing modelled conditions:", error);
    els.weatherIcon.innerHTML = `<svg viewBox="0 0 24 24"><use href="#i-cloud-sun"/></svg>`;
    els.weatherTemp.textContent = `${Math.round(demoState.temperature)}°`;
    els.weatherDesc.textContent = "Modelled from local sensors";
    els.weatherFeels.textContent = `${Math.round(demoState.temperature + 1.5)}°`;
    els.weatherHumidity.textContent = `${Math.round(demoState.humidity)}%`;
    els.weatherWind.textContent = `${Math.round(demoState.windSpeed)} km/h`;
    els.weatherPlace.textContent = "Live weather unavailable";
    els.weatherSource.textContent = "Fallback";
  }
}


/* =========================================================
   HISTORY & CHARTS
   ========================================================= */

function seedHistory() {
  const now = new Date();
  for (let i = HISTORY_POINTS - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 60 * 60 * 1000);
    const wobble = Math.sin(i / 2.4) * 8;
    state.history.labels.push(formatTime(t));
    state.history.moisture.push(clampNumber(demoState.moisture - wobble + (Math.random() - 0.5) * 4, 15, 85));
    state.history.temperature.push(round1(demoState.temperature + Math.sin(i / 3) * 3 + (Math.random() - 0.5)));
    state.history.humidity.push(clampNumber(demoState.humidity + Math.cos(i / 3) * 6 + (Math.random() - 0.5) * 3, 20, 95));
  }
}

function advanceHistory() {
  const now = new Date();
  pushHistoryPoint(formatTime(now));
  updateTrendChart();
}

function pushHistoryPoint(label) {
  state.history.labels.push(label);
  state.history.moisture.push(state.moisture ?? demoState.moisture);
  state.history.temperature.push(state.temperature ?? demoState.temperature);
  state.history.humidity.push(state.humidity ?? demoState.humidity);

  if (state.history.labels.length > HISTORY_POINTS) {
    state.history.labels.shift();
    state.history.moisture.shift();
    state.history.temperature.shift();
    state.history.humidity.shift();
  }
}

function seedUsage() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = days.map(() => Math.round(28 + Math.random() * 34));
  state.usage.labels = days;
  state.usage.values = values;
  els.usageTotal.textContent = `${values.reduce((a, b) => a + b, 0)} L total`;
}

function buildCharts() {
  if (typeof Chart === "undefined") return;

  Chart.defaults.color = "#A7BDB4";
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.font.size = 11;

  const gridColor = "rgba(234,243,238,0.06)";

  const trendCtx = document.getElementById("trendChart");
  trendChart = new Chart(trendCtx, {
    type: "line",
    data: {
      labels: state.history.labels,
      datasets: buildTrendDatasets()
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: activeTrendMetric === "climate", position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
      scales: {
        x: { grid: { color: gridColor, drawTicks: false }, ticks: { maxTicksLimit: 6 } },
        y: { grid: { color: gridColor, drawTicks: false }, ticks: { maxTicksLimit: 5 } }
      },
      elements: { point: { radius: 0, hoverRadius: 4 }, line: { tension: 0.35 } }
    }
  });

  const usageCtx = document.getElementById("usageChart");
  usageChart = new Chart(usageCtx, {
    type: "bar",
    data: {
      labels: state.usage.labels,
      datasets: [{
        label: "Liters",
        data: state.usage.values,
        backgroundColor: "rgba(79,182,224,0.55)",
        hoverBackgroundColor: "rgba(74,222,128,0.7)",
        borderRadius: 6,
        maxBarThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: gridColor, drawTicks: false }, ticks: { maxTicksLimit: 5 } }
      }
    }
  });
}

function buildTrendDatasets() {
  if (activeTrendMetric === "moisture") {
    return [{
      label: "Soil moisture %",
      data: state.history.moisture,
      borderColor: "#4ADE80",
      backgroundColor: "rgba(74,222,128,0.14)",
      fill: true,
      borderWidth: 2
    }];
  }

  return [
    {
      label: "Temperature °C",
      data: state.history.temperature,
      borderColor: "#F2B84B",
      backgroundColor: "rgba(242,184,75,0.08)",
      fill: false,
      borderWidth: 2,
      yAxisID: "y"
    },
    {
      label: "Humidity %",
      data: state.history.humidity,
      borderColor: "#4FB6E0",
      backgroundColor: "rgba(79,182,224,0.08)",
      fill: false,
      borderWidth: 2,
      yAxisID: "y"
    }
  ];
}

function updateTrendChart() {
  if (!trendChart) return;
  trendChart.data.labels = state.history.labels;
  trendChart.data.datasets = buildTrendDatasets();
  trendChart.options.plugins.legend.display = activeTrendMetric === "climate";
  trendChart.update();
}


/* =========================================================
   DEMO MODE SIMULATION
   ========================================================= */

function generateDemoStatus() {
  demoState.uptimeSeconds += ESP32_API.pollIntervalMs / 1000;

  const drift = (Math.random() - 0.56) * 1.25;
  demoState.moisture = clampNumber(demoState.moisture + drift + (demoState.pump ? 2.8 : 0), 18, 84);
  demoState.rawMoisture = Math.round(3600 - demoState.moisture * 25 + (Math.random() - 0.5) * 35);
  demoState.signalStrength = Math.round(clampNumber(demoState.signalStrength + (Math.random() - 0.5) * 3, -74, -47));

  demoState.temperature = clampNumber(demoState.temperature + (Math.random() - 0.5) * 0.4, 18, 38);
  demoState.humidity = clampNumber(demoState.humidity + (Math.random() - 0.5) * 1.2, 25, 95);
  demoState.windSpeed = clampNumber(demoState.windSpeed + (Math.random() - 0.5) * 1.5, 0, 28);
  demoState.tankLevel = clampNumber(demoState.tankLevel - (demoState.pump ? 0.06 : 0.01), 0, 100);

  applyDemoAutomaticLogic();

  return {
    moisture: Math.round(demoState.moisture),
    rawMoisture: demoState.rawMoisture,
    pump: demoState.pump,
    automatic: demoState.automatic,
    online: true,
    wifiConnected: true,
    signalStrength: demoState.signalStrength,
    uptimeSeconds: Math.round(demoState.uptimeSeconds),
    pumpOnThreshold: demoState.pumpOnThreshold,
    pumpOffThreshold: demoState.pumpOffThreshold,
    temperature: round1(demoState.temperature),
    humidity: Math.round(demoState.humidity),
    tankLevel: demoState.tankLevel,
    windSpeed: Math.round(demoState.windSpeed),
    windDirection: demoState.windDirection
  };
}

function applyDemoAutomaticLogic() {
  if (!demoState.automatic) return;

  if (!demoState.pump && demoState.moisture < demoState.pumpOnThreshold) {
    demoState.pump = true;
    addActivity("Automatic irrigation started", "auto");
    addActivity("Pump turned on", "pump-on");
  } else if (demoState.pump && demoState.moisture > demoState.pumpOffThreshold) {
    demoState.pump = false;
    addActivity("Pump turned off", "pump-off");
    addActivity(`Moisture reached ${Math.round(demoState.moisture)}%`, "moisture");
  }
}

function addInitialDemoActivity() {
  if (!DEMO_MODE) return;
  const now = new Date();

  const items = [
    { minutesAgo: 3, text: "Moisture at 58%", type: "moisture" },
    { minutesAgo: 3, text: "Pump turned off", type: "pump-off" },
    { minutesAgo: 4, text: "Automatic irrigation started", type: "auto" },
    { minutesAgo: 4, text: "Soil moisture dropped to 34%", type: "moisture" },
    { minutesAgo: 270, text: "Pump turned off", type: "pump-off" },
    { minutesAgo: 271, text: "Pump turned on", type: "pump-on" }
  ];

  items.forEach((item) => {
    const time = new Date(now.getTime() - item.minutesAgo * 60 * 1000);
    state.activity.push({ time, text: item.text, type: item.type, moisture: demoState.moisture });
  });
}


/* =========================================================
   ACTIVITY / HISTORY TABLE
   ========================================================= */

function addActivity(text, type = "neutral") {
  state.activity.unshift({ time: new Date(), text, type, moisture: state.moisture });
  state.activity = state.activity.slice(0, 30);
  renderActivity();
  renderHistoryTable();
}

function renderActivity() {
  const recent = state.activity.slice(0, 6);

  if (!recent.length) {
    els.activityList.innerHTML = `
      <div class="activity-row">
        <time class="tabular">--:--</time>
        <span class="activity-dot neutral"></span>
        <span>No recent activity</span>
      </div>`;
    return;
  }

  els.activityList.innerHTML = recent.map((item) => `
    <div class="activity-row">
      <time class="tabular">${formatTime(item.time)}</time>
      <span class="activity-dot ${escapeHtml(item.type)}"></span>
      <span>${escapeHtml(item.text)}</span>
    </div>
  `).join("");
}

function renderHistoryTable() {
  if (!state.activity.length) {
    els.historyTableBody.innerHTML = `<tr><td colspan="4">No activity recorded during this session.</td></tr>`;
    return;
  }

  els.historyTableBody.innerHTML = state.activity.map((item) => `
    <tr>
      <td class="tabular">${formatTime(item.time)}</td>
      <td>${escapeHtml(item.text)}</td>
      <td>${state.automatic ? "Automatic" : "Manual"}</td>
      <td class="tabular">${item.moisture == null ? "--" : `${Math.round(item.moisture)}%`}</td>
    </tr>
  `).join("");
}


/* =========================================================
   NAVIGATION
   ========================================================= */

const PAGE_COPY = {
  dashboard: { title: "Good to grow", subtitle: "Everything in zone 01 is being watched in real time." },
  irrigation: { title: "Irrigation control", subtitle: "Direct pump control and threshold configuration." },
  history: { title: "History", subtitle: "Every recorded irrigation event this session." },
  settings: { title: "Settings", subtitle: "Connection details and controller status." }
};

function showSection(sectionName) {
  const sectionMap = {
    dashboard: els.dashboardSection,
    irrigation: els.irrigationSection,
    history: els.historySection,
    settings: els.settingsSection
  };

  Object.values(sectionMap).forEach((section) => { section.hidden = true; });

  const target = sectionMap[sectionName] || els.dashboardSection;
  target.hidden = false;

  const copy = PAGE_COPY[sectionName] || PAGE_COPY.dashboard;
  els.pageTitle.textContent = copy.title;
  els.pageSubtitle.textContent = copy.subtitle;

  els.navItems.forEach((item) => {
    const active = item.dataset.section === sectionName;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function toggleMobileMenu() {
  const open = document.body.classList.toggle("nav-open");
  els.menuToggle.setAttribute("aria-expanded", String(open));
}

function closeMobileMenu() {
  document.body.classList.remove("nav-open");
  els.menuToggle.setAttribute("aria-expanded", "false");
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function showNotification(title, message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-indicator"></span>
    <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>
  `;
  els.toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    window.setTimeout(() => toast.remove(), 200);
  }, 3200);
}


/* =========================================================
   UTILITY FUNCTIONS
   ========================================================= */

function getSoilCondition(moisture) {
  if (moisture <= 30) {
    return { label: "Dry", className: "dry", description: "Soil is dry and may require irrigation." };
  }
  if (moisture <= 70) {
    return { label: "Normal", className: "normal", description: "Moisture is within the preferred range." };
  }
  return { label: "Wet", className: "wet", description: "Soil moisture is high. Irrigation is not required." };
}

function updateClock() {
  const now = new Date();
  els.currentDateTime.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(now);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(date));
}

function formatUptime(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "--";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function setCommandLock(locked) {
  state.commandLocked = locked;
  updateDashboard();
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   START APPLICATION
   ========================================================= */

document.addEventListener("DOMContentLoaded", initializeDashboard);
