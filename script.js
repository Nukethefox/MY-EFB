const SIMBRIEF_XML_URL = "https://www.simbrief.com/api/xml.fetcher.php?username=";

function textOf(root, selector) {
  const node = root.querySelector(selector);
  return node && node.textContent ? node.textContent.trim() : "-";
}

function row(label, value) {
  return `<div class="kv"><div class="k">${label}</div><div class="v">${value || "-"}</div></div>`;
}

function setRows(containerId, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = rows.map((item) => row(item.label, item.value)).join("");
}

function valueAndTime(value, time) {
  if (value === "-" && time === "-") return "-";
  if (time === "-") return value;
  return `${value} (${time})`;
}

function formatDuration(valueInSeconds) {
  const raw = String(valueInSeconds || "").trim();
  if (!raw || raw === "-") return "-";
  const totalSeconds = Number(raw);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return raw;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatEpochUtc(valueInSeconds) {
  const raw = String(valueInSeconds || "").trim();
  if (!raw || raw === "-") return "-";
  const epochSeconds = Number(raw);
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return raw;
  const date = new Date(epochSeconds * 1000);
  if (Number.isNaN(date.getTime())) return raw;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute} UTC`;
}

function withUnit(value, unit) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "-";
  return `${raw} ${unit}`;
}

function formatSigned(value, unit) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "-";
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  if (numeric > 0) return `+${numeric} ${unit}`;
  return `${numeric} ${unit}`;
}

function getWeightUnit(root) {
  const unit = textOf(root, "params units").toUpperCase().trim();
  if (unit === "LBS" || unit === "LB") return "LB";
  return "KG";
}

function formatWeight(root, value) {
  const unit = getWeightUnit(root);
  return withUnit(value, unit);
}

function airportCode(root, baseSelector) {
  const icao = textOf(root, `${baseSelector} icao_code`);
  const iata = textOf(root, `${baseSelector} iata_code`);
  if (icao === "-" && iata === "-") return "-";
  if (icao === "-") return `-/${iata}`;
  if (iata === "-") return `${icao}/-`;
  return `${icao}/${iata}`;
}

function departureDateTime(root) {
  const dateValue = textOf(root, "api_params date");
  const hourValue = textOf(root, "api_params dephour");
  const minuteValue = textOf(root, "api_params depmin");
  const dateSeconds = Number(dateValue);
  const hourSeconds = Number(hourValue);
  const minuteSeconds = Number(minuteValue);
  if (Number.isFinite(dateSeconds) && Number.isFinite(hourSeconds) && Number.isFinite(minuteSeconds)) {
    const epochSeconds = dateSeconds + hourSeconds + minuteSeconds;
    return formatEpochUtc(String(epochSeconds));
  }
  return `${dateValue} ${hourValue}:${minuteValue}`;
}

function enrouteAltCode(root) {
  const direct = airportCode(root, "enroute_altn");
  if (direct !== "-") return direct;
  const nestedIcao = textOf(root, "enroute_altn altn icao_code");
  const nestedIata = textOf(root, "enroute_altn altn iata_code");
  if (nestedIcao === "-" && nestedIata === "-") return "-";
  if (nestedIcao === "-") return `-/${nestedIata}`;
  if (nestedIata === "-") return `${nestedIcao}/-`;
  return `${nestedIcao}/${nestedIata}`;
}

function numberOf(root, selector) {
  const value = Number(textOf(root, selector));
  return Number.isFinite(value) ? value : NaN;
}

function formatAlt(value) {
  if (!value) return "-";
  return parseInt(value, 10);
}

function getRunwayData(root, phase) {
  const planned = textOf(root, `tlr ${phase} conditions planned_runway`);
  if (!planned) return null;
  const runways = root.querySelectorAll(`tlr > ${phase} > runway`);
  for (const rwy of runways) {
    const id = rwy.querySelector("identifier")?.textContent?.trim();
    if (id === planned) {
      return {
        length: rwy.querySelector("length")?.textContent,
        tora: rwy.querySelector("length_tora")?.textContent,
        toda: rwy.querySelector("length_toda")?.textContent,
        asda: rwy.querySelector("length_asda")?.textContent,
        lda: rwy.querySelector("length_lda")?.textContent,
      };
    }
  }
  return null;
}

function runwayPerformanceHtml(rwy) {
  if (!rwy) return "";
  return `
    <div class="airport-meta">LENGTH ${rwy.length} m</div>
    <div class="airport-meta">TORA ${rwy.tora} m</div>
    <div class="airport-meta">ASDA ${rwy.asda} m</div>
    <div class="airport-meta">TODA ${rwy.toda} m</div>
    <div class="airport-meta">LDA ${rwy.lda} m</div>
  `;
}

function airportCard(label, data, rwyPerf) {
  return `
<article class="airport-card">
<div class="airport-title">${label}</div>
<div class="airport-main">${data.code}</div>
<div class="airport-rwy">RWY ${data.rwy}</div>
<hr class="section-separator">
<div class="airport-meta">ELEV ${data.elevation} FT</div>
<div class="airport-meta">
TRANS ALT ${formatAlt(data.transAlt)}<br>
</div>
<div class="airport-meta">${data.metar}</div>
<br>
<div class="airport-meta">${data.taf}</div>
<hr class="section-separator">
<!-- ${runwayPerformanceHtml(rwyPerf)} */ -->
</article>
`;
}

function formatTransLevel(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw || raw === "-") return "-";
  if (raw.length <= 2) return raw;
  return raw.slice(0, -2);
}

function formatFL(value) {
  const raw = String(value || "").trim();
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  return String(Math.trunc(num / 100));
}

function airportData(root, selector) {
  return {
    code: airportCode(root, selector),
    rwy: textOf(root, `${selector} plan_rwy`),
    elevation: textOf(root, `${selector} elevation`),
    transAlt: textOf(root, `${selector} trans_alt`),
    transLevel: formatTransLevel(textOf(root, `${selector} trans_level`)),
    metar: textOf(root, `${selector} metar`),
    taf: textOf(root, `${selector} taf`)
  };
}

function enrouteAltData(root) {
  const direct = airportData(root, "enroute_altn");
  if (direct.code !== "-") return direct;
  return {
    code: enrouteAltCode(root),
    rwy: textOf(root, "enroute_altn altn plan_rwy"),
    elevation: textOf(root, "enroute_altn altn elevation"),
    transAlt: textOf(root, "enroute_altn altn trans_alt"),
    transLevel: formatTransLevel(textOf(root, "enroute_altn altn trans_level")),
    metar: textOf(root, "enroute_altn altn metar"),
    taf: textOf(root, "enroute_altn altn metar")
  };
}

function formatSignedDuration(valueInSeconds) {
  const raw = String(valueInSeconds || "").trim();
  if (!raw || raw === "-") return "-";
  const totalSeconds = Number(raw);
  if (!Number.isFinite(totalSeconds)) return raw;
  const sign = totalSeconds > 0 ? "+" : totalSeconds < 0 ? "-" : "";
  const absSeconds = Math.abs(Math.trunc(totalSeconds));
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;
  if (hours > 0) return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function altimeterToHpa(inhg) {
  if (!inhg) return "";
  const hpa = Math.round(parseFloat(inhg) * 33.863889532611);
  return `${inhg} inHg (${hpa} hPa)`;
}

function getPlannedRunway(root, phase) {
  const planned = textOf(root, `tlr ${phase} conditions planned_runway`);
  if (!planned) return null;
  const runways = root.querySelectorAll(`tlr > ${phase} > runway`);
  for (const rwy of runways) {
    const id = rwy.querySelector("identifier")?.textContent?.trim();
    if (id === planned) return rwy;
  }
  return null;
}

function takeoffPerformanceHtml(root) {

  const cond = root.querySelector("tlr > takeoff > conditions");
  const rwy = getPlannedRunway(root, "takeoff");

  if (!cond || !rwy) return "";

  const elevation = parseInt(rwy.querySelector("elevation")?.textContent || 0);

  const thrustReduction = elevation + 1500;
  const acceleration = elevation + 3000;

  const bleed = rwy.querySelector("bleed_setting")?.textContent || "";
  const antiIce = rwy.querySelector("anti_ice_setting")?.textContent || "";

  const bleedAntiIce = `${bleed} / ${antiIce}`;

  return `
<div class="airport-meta">RUNWAY: ${rwy.querySelector("identifier")?.textContent}</div>
<div class="airport-meta">HEADWIND: ${rwy.querySelector("headwind_component")?.textContent} kts</div>
<div class="airport-meta">CROSSWIND: ${rwy.querySelector("crosswind_component")?.textContent} kts</div>
<div class="airport-meta">SURFACE: ${cond.querySelector("surface_condition")?.textContent}</div>
<div class="airport-meta">TEMP: ${cond.querySelector("temperature")?.textContent} °C</div>
<div class="airport-meta">QNH: ${altimeterToHpa(cond.querySelector("altimeter")?.textContent)}</div>

<hr class="section-separator">

<div class="airport-meta">FLAPS: ${rwy.querySelector("flap_setting")?.textContent}</div>
<div class="airport-meta">BLEED: ${bleed}</div>
<div class="airport-meta">ANTI ICE: ${antiIce}</div>

<div class="airport-meta">THRUST: ${rwy.querySelector("thrust_setting")?.textContent}</div>
<div class="airport-meta">FLEX: ${rwy.querySelector("flex_temperature")?.textContent} °C</div>

<div class="airport-meta">V1: ${rwy.querySelector("speeds_v1")?.textContent} kts</div>
<div class="airport-meta">VR: ${rwy.querySelector("speeds_vr")?.textContent} kts</div>
<div class="airport-meta">V2: ${rwy.querySelector("speeds_v2")?.textContent} kts</div>

<div class="airport-meta">${rwy.querySelector("speeds_other_id")?.textContent}: ${rwy.querySelector("speeds_other")?.textContent} kts</div>

<div class="airport-meta">THR REDUCTION: ${thrustReduction} ft</div>
<div class="airport-meta">ACCELERATION: ${acceleration} ft</div>

<hr class="section-separator">
<div class="airport-meta">TORA: ${rwy.querySelector("length_tora")?.textContent}</div>
<div class="airport-meta">ASDA: ${rwy.querySelector("length_asda")?.textContent}</div>
<div class="airport-meta">DECISION DISTANCE: ${rwy.querySelector("distance_decide")?.textContent} m</div>
<div class="airport-meta">STOP DISTANCE: ${rwy.querySelector("distance_reject")?.textContent} m</div>
<div class="airport-meta">STOP MARGIN: ${rwy.querySelector("distance_margin")?.textContent} m</div>
`;
}

function landingPerformanceHtml(root) {

  const cond = root.querySelector("tlr > landing > conditions");
  const rwy = getPlannedRunway(root, "landing");

  if (!cond || !rwy) return "";

  const surface = cond.querySelector("surface_condition")?.textContent;

  const distanceNode =
    surface === "wet"
      ? root.querySelector("tlr > landing > distance_wet")
      : root.querySelector("tlr > landing > distance_dry");

  return `
<div class="airport-meta">RUNWAY: ${rwy.querySelector("identifier")?.textContent}</div>
<div class="airport-meta">HEADWIND: ${rwy.querySelector("headwind_component")?.textContent} kts</div>
<div class="airport-meta">CROSSWIND: ${rwy.querySelector("crosswind_component")?.textContent} kts</div>
<div class="airport-meta">SURFACE: ${surface}</div>
<div class="airport-meta">TEMP: ${cond.querySelector("temperature")?.textContent} °C</div>
<div class="airport-meta">QNH: ${altimeterToHpa(cond.querySelector("altimeter")?.textContent)}</div>
<br>
<div class="airport-meta">ILS FRQ: ${rwy.querySelector("ils_frequency")?.textContent} mHz</div>
<div class="airport-meta">MAX ELEV TDZ: ${rwy.querySelector("elevation")?.textContent} ft</div>
<hr class="section-separator">
<p class="airport-meta">With the following data...</p>
<div class="airport-meta">FLAPS: ${distanceNode.querySelector("flap_setting")?.textContent}</div>
<div class="airport-meta">BRAKES: ${distanceNode.querySelector("brake_setting")?.textContent}</div>
<div class="airport-meta">VREF: ${distanceNode.querySelector("speeds_vref")?.textContent} kts</div>
<p class="airport-meta">Resulting distances will be...</p>
<div class="airport-meta">LDA: ${rwy.querySelector("length_lda")?.textContent}</div>
<div class="airport-meta">ACTUAL NEEDED DISTANCE: ${distanceNode.querySelector("actual_distance")?.textContent} m</div>
<div class="airport-meta">FACTORED DISTANCE: ${distanceNode.querySelector("factored_distance")?.textContent} m</div>
`;
}

function impactClass(value) {
  const numeric = Number(String(value || "").trim());
  if (!Number.isFinite(numeric)) return "";
  if (numeric < 0) return "status-ok";
  if (numeric > 0) return "status-bad";
  return "";
}

function safeText(value) {
  const raw = String(value || "").trim();
  return raw || "-";
}

function parseNumeric(value) {
  const numeric = Number(String(value || "").trim());
  return Number.isFinite(numeric) ? numeric : NaN;
}

function formatWindWithUnit(value, unit) {
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return "-";
  return `${raw} ${unit}`;
}

function minTropoFromFixes(root) {
  const fixes = [...root.querySelectorAll("navlog > fix")];
  const tropoValues = fixes.map((fix) => parseNumeric(textOf(fix, "tropopause_feet"))).filter((v) => Number.isFinite(v) && v > 0);
  if (!tropoValues.length) return "-";
  return `${Math.min(...tropoValues)} FT`;
}

function maxMoraFromFixes(root) {
  const fixes = [...root.querySelectorAll("navlog > fix")];

  let highestMora = -Infinity;
  let highestFix = "-";

  fixes.forEach((fix) => {
    const mora = parseNumeric(textOf(fix, "mora"));
    if (Number.isFinite(mora) && mora > highestMora) {
      highestMora = mora;
      highestFix = textOf(fix, "ident");
    }
  });

  if (!Number.isFinite(highestMora)) return "-";

  return `${highestMora} FT (${highestFix})`;
}

function cruiseAverageTemp(root) {
  const fixes = [...root.querySelectorAll("navlog > fix")];
  if (!fixes.length) return "-";
  const indexToc = fixes.findIndex((fix) => textOf(fix, "ident").toUpperCase() === "TOC");
  let indexCruiseEnd = fixes.findIndex((fix) => textOf(fix, "ident").toUpperCase() === "TOP");
  if (indexCruiseEnd < 0) {
    indexCruiseEnd = fixes.findIndex((fix) => textOf(fix, "ident").toUpperCase() === "TOD");
  }
  if (indexToc < 0 || indexCruiseEnd < 0) return "-";
  const start = Math.min(indexToc, indexCruiseEnd);
  const end = Math.max(indexToc, indexCruiseEnd);
  const oatValues = fixes.slice(start, end + 1).map((fix) => parseNumeric(textOf(fix, "oat"))).filter((v) => Number.isFinite(v));
  if (!oatValues.length) return "-";
  const avg = Math.round(oatValues.reduce((acc, current) => acc + current, 0) / oatValues.length);
  return `${avg} C`;
}

function getXmlFromStorage() {
  return sessionStorage.getItem("efb_xml_payload");
}

function getUserFromStorage() {
  return sessionStorage.getItem("efb_username") || "-";
}

async function reloadDashboardData() {
  const username = getUserFromStorage();
  if (!username || username === "-") {
    window.location.href = "index.html";
    return;
  }
  const button = document.getElementById("refresh-data-btn");
  if (button) button.disabled = true;
  try {
    const xmlText = await loadXmlByUsername(username);
    sessionStorage.setItem("efb_xml_payload", xmlText);
    location.href = "dashboard.html";
  } catch (error) {
    if (button) button.disabled = false;
    alert(`Unable to reload XML: ${error.message}`);
  }
}

function bindDashboardReload() {
  const button = document.getElementById("refresh-data-btn");
  if (!button) return;
  button.addEventListener("click", reloadDashboardData);
}

async function loadXmlByUsername(username) {
  const url = `${SIMBRIEF_XML_URL}${encodeURIComponent(username)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const xmlText = await response.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");
  if (xmlDoc.querySelector("parsererror")) {
    throw new Error("Invalid XML response");
  }
  return xmlText;
}

function bindLoginForm() {
  const form = document.getElementById("username-form");
  const input = document.getElementById("username-input");
  const status = document.getElementById("form-status");
  if (!form || !input || !status) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = input.value.trim();
    if (!username) {
      status.textContent = "Please enter a valid username.";
      return;
    }
    status.textContent = "Loading OFP XML...";
    try {
      const xmlText = await loadXmlByUsername(username);
      sessionStorage.setItem("efb_username", username);
      sessionStorage.setItem("efb_xml_payload", xmlText);
      window.location.href = "dashboard.html";
    } catch (error) {
      status.textContent = `Unable to load XML: ${error.message}`;
    }
  });
}

function setHtml(id, html) {
  const node = document.getElementById(id);
  if (!node) return;
  node.innerHTML = html;
}

const AIRAC_BASE_DATE = new Date(Date.UTC(2023, 0, 26)); // 19 Jan 2023
const AIRAC_BASE_CYCLE = 2301;
function getCurrentAIRAC() {
  const now = new Date();

  const daysDiff = Math.floor((now - AIRAC_BASE_DATE) / (1000 * 60 * 60 * 24));
  const cyclesPassed = Math.floor(daysDiff / 28);

  const baseYear = Math.floor(AIRAC_BASE_CYCLE / 100);
  const baseCycle = AIRAC_BASE_CYCLE % 100;

  let cycleNumber = baseCycle + cyclesPassed;
  let year = baseYear;

  while (cycleNumber > 13) {
    cycleNumber -= 13;
    year++;
  }

  return `${year}${String(cycleNumber).padStart(2, "0")}`;
}

function airacStatus(ofpAirac) {
  const current = getCurrentAIRAC();

  if (!ofpAirac || ofpAirac === "-") {
    return `<span>-</span>`;
  }

  if (ofpAirac === current) {
    return `<span class="airac-ok">${ofpAirac} (UP TO DATE!)</span>`;
  }

  return `<span class="airac-warn">${ofpAirac} (OUTDATED! CURRENT ${current})</span>`;
}

function mainInfo(root) {
  setRows("main-info-flight", [
    { label: "Flight Number", value: `${textOf(root, "general icao_airline")}${textOf(root, "general flight_number")}` },
    { label: "Callsign", value: textOf(root, "atc callsign") },
    { label: "OFP Date/Time", value: formatEpochUtc(textOf(root, "params time_generated")) },
    { label: "OFP Version", value: textOf(root, "general release") },
    { label: "AIRAC", value: `${airacStatus(textOf(root, "params airac"))}`}
  ]);

  setRows("main-info-airports", [
    { label: "Departure", value: airportCode(root, "origin") },
    { label: "Destination", value: airportCode(root, "destination") },
    { label: "TKOF ALTN", value: airportCode(root, "takeoff_altn") },
    { label: "ENR ALTN", value: enrouteAltCode(root) },
    { label: "ALTN", value: airportCode(root, "alternate") }
  ]);

  setRows("main-info-ops", [
    { label: "Departure Date/Time", value: departureDateTime(root) },
    { label: "Block Time", value: formatDuration(textOf(root, "times est_block")) },
    { label: "Block Fuel", value: withUnit(textOf(root, "fuel plan_ramp"), textOf(root, "params units")) },
    { label: "Route Distance", value: withUnit(textOf(root, "general route_distance"), "NM") }
  ]);
}

function fplan(root) {
  const depRunway = getRunwayData(root, "takeoff");
  const arrRunway = getRunwayData(root, "landing");
  const cards = [];
  cards.push(airportCard("DEP", airportData(root, "origin"), depRunway));
  cards.push(airportCard("DEST", airportData(root, "destination"), arrRunway));
  cards.push(airportCard("TKOF ALTN", airportData(root, "takeoff_altn")));
  cards.push(airportCard("ENR ALTN", enrouteAltData(root)));
  cards.push(airportCard("ALTN", airportData(root, "alternate")));
  const apiAltRaw = textOf(root, "api_params altn");
  const apiAlternates = apiAltRaw === "-" ? [] : apiAltRaw.split(/\s+/).filter(Boolean);
  const uniqueApiAlternates = [...new Set(apiAlternates)];
  if (uniqueApiAlternates.length > 1) {
    const extra = uniqueApiAlternates.slice(1).map((code) => code).join(", ");
    cards.push(airportCard("EXTRA ALTN", { code: extra, rwy: "-", elevation: "-", transAlt: "-", transLevel: "-", metar: "-" }));
  }
  setHtml("fplan-airports", cards.join(""));

  setRows("fplan-grid", [
    { label: "Route", value: `${textOf(root, "general route_ifps")}<br>ALTN: ${textOf(root, "alternate route_ifps")}`},
    { label: "CRZ FL", value: `INITIAL FL${formatFL(textOf(root, "general initial_altitude"))}<br>STEPS: ${textOf(root, "general stepclimb_string")}` },
    { label: "AVG WIND",value: `${formatWindWithUnit(textOf(root, "general avg_wind_dir"),"º")} / ${formatWindWithUnit(textOf(root, "general avg_wind_spd"), "KT")}<br>AVG WIND COMP: ${formatWindWithUnit(textOf(root, "general avg_wind_comp"), "KT")}`},    
    { label: "TROPO", value: `AVG: ${withUnit(textOf(root, "general avg_tropopause"), "FT")}<br>LOWEST: ${minTropoFromFixes(root)}` },
    { label: "HIGHEST MORA", value: maxMoraFromFixes(root) },
    { label: "CRZ AVG TEMP", value: cruiseAverageTemp(root) },
    { label: "CI", value: textOf(root, "general costindex") },
    { label: "Mach", value: textOf(root, "general cruise_mach") },
  ]);
}

function timeline(root) {
  const points = [
    { label: "Estimated DEP time", value: formatEpochUtc(textOf(root, "times est_out")) },
    { label: "Estimated TKOF time", value: formatEpochUtc(textOf(root, "times est_off")) },
    { label: "ENR Time", value: formatDuration(textOf(root, "times est_time_enroute")) },
    { label: "Estimated LDG time", value: formatEpochUtc(textOf(root, "times est_on")) },
    { label: "Estimated ARR time", value: formatEpochUtc(textOf(root, "times est_in")) }
  ];
  const pointsHtml = points.map((point) => `<div class="timeline-point"><div class="timeline-time">${point.value}</div><div class="timeline-dot"></div><div class="timeline-name">${point.label}</div></div>`).join("");
  setHtml("timeline-line", `<div class="timeline-track"></div><div class="timeline-points">${pointsHtml}</div>`);

  setRows("timeline-extra", [
    { label: "Block Time", value: formatDuration(textOf(root, "times est_block")) },
    { label: "Route Distance", value: withUnit(textOf(root, "general route_distance"), "NM") }
  ]);
}

function weightStatus(current, limit) {
  if (!Number.isFinite(current) || !Number.isFinite(limit)) return { text: "-", className: "" };
  if (current <= limit) return { text: "✓ Within range", className: "status-ok" };
  return { text: "! Out of range", className: "status-bad" };
}

function checkedWeight(currentValue, limitValue, unit) {
  const current = Number(currentValue);
  const limit = Number(limitValue);
  const unitLabel = unit || "KG";
  if (!Number.isFinite(current) || !Number.isFinite(limit)) {
    return withUnit(currentValue, unitLabel);
  }
  if (current <= limit) return `<span class="status-ok">${current} ${unitLabel} ✓</span>`;
  return `<span class="status-bad">${current} ${unitLabel} !</span>`;
}

function loadsheet(root) {
  setRows("loadsheet-aircraft-main", [
    { label: "Name", value: textOf(root, "aircraft name") },
    { label: "Engines", value: textOf(root, "aircraft engines") },
    { label: "Reg", value: textOf(root, "aircraft reg") },
    { label: "Max Passengers", value: textOf(root, "aircraft max_passengers") }
  ]);
  setRows("loadsheet-aircraft-limits", [
    { label: "OEW", value: withUnit(textOf(root, "weights oew"), textOf(root, "params units")) },
    { label: "MZFW", value: withUnit(textOf(root, "weights max_zfw"), textOf(root, "params units")) },
    { label: "MTOW", value: withUnit(textOf(root, "weights max_tow_struct"), textOf(root, "params units")) },
    { label: "MLDW", value: withUnit(textOf(root, "weights max_ldw"), textOf(root, "params units")) }
  ]);

  setRows("loadsheet-weights-payload", [
    { label: "Pax Count", value: textOf(root, "weights pax_count_actual") },
    { label: "Cargo (baggage)", value: withUnit(textOf(root, "weights cargo"), textOf(root, "params units")) },
    { label: "Pax weight (as set on simbrief)", value: withUnit(textOf(root, "weights pax_weight"), textOf(root, "params units")) },
    { label: "Bag weight (as set on simbrief)", value: withUnit(textOf(root, "weights bag_weight"), textOf(root, "params units")) },
    { label: "Freight", value: withUnit(textOf(root, "weights freight_added"), textOf(root, "params units")) },
    { label: "Total Payload", value: withUnit(textOf(root, "weights payload"), textOf(root, "params units")) }
  ]);

  const estZfw = numberOf(root, "weights est_zfw");
  const estTow = numberOf(root, "weights est_tow");
  const estLdw = numberOf(root, "weights est_ldw");
  const maxZfw = numberOf(root, "weights max_zfw");
  const maxTow = numberOf(root, "weights max_tow_struct");
  const maxLdw = numberOf(root, "weights max_ldw");
  setHtml("loadsheet-weights-est", [
    row("EST ZFW", checkedWeight(textOf(root, "weights est_zfw"), textOf(root, "weights max_zfw"), getWeightUnit(root))),
    row("EST TOW", checkedWeight(textOf(root, "weights est_tow"), textOf(root, "weights max_tow_struct"), getWeightUnit(root))),
    row("EST LDW", checkedWeight(textOf(root, "weights est_ldw"), textOf(root, "weights max_ldw"), getWeightUnit(root)))
  ].join(""));

  const fuelRows = [
    { item: "Taxi Out Fuel", kg: withUnit(textOf(root, "fuel taxi"), textOf(root, "params units")), time: formatDuration(textOf(root, "times taxi_out")), isBlock: false },
    { item: "Trip/Enroute Fuel", kg: withUnit(textOf(root, "fuel enroute_burn"), textOf(root, "params units")), time: formatDuration(textOf(root, "times est_time_enroute")), isBlock: false },
    { item: "Route Reserve/Contingency", kg: withUnit(textOf(root, "fuel contingency"), textOf(root, "params units")), time: formatDuration(textOf(root, "times contfuel_time")), isBlock: false },
    { item: "ALTN Fuel", kg: withUnit(textOf(root, "fuel alternate_burn"), textOf(root, "params units")), time: formatDuration(textOf(root, "alternate ete")), isBlock: false },
    { item: "Final Reserve Fuel", kg: withUnit(textOf(root, "fuel reserve"), textOf(root, "params units")), time: formatDuration(textOf(root, "times reserve_time")), isBlock: false },
    { item: "ETOPS Fuel", kg: withUnit(textOf(root, "fuel etops"), textOf(root, "params units")), time: formatDuration(textOf(root, "times etopsfuel_time")), isBlock: false },
    { item: "Extra Fuel", kg: withUnit(textOf(root, "fuel extra"), textOf(root, "params units")), time: formatDuration(textOf(root, "times extrafuel_time")), isBlock: false },
    { item: "Block Fuel", kg: withUnit(textOf(root, "fuel plan_ramp"), textOf(root, "params units")), time: formatDuration(textOf(root, "times est_block")), isBlock: true },
    { item: "MAX FUEL CAP", kg: withUnit(textOf(root, "fuel max_tanks"), textOf(root, "params units")), time: formatDuration("-"), isBlock: true }
  ];
  const fuelTableBody = fuelRows.map((rowData) => `<tr class="${rowData.isBlock ? "fuel-row-block" : ""}"><td>${rowData.item}</td><td>${rowData.kg}</td><td>${rowData.time}</td></tr>`).join("");
  setHtml("loadsheet-fuel", `<div class="fuel-table-box"><table class="fuel-table"><thead><tr><th>ITEM</th><th>KG</th><th>TIME</th></tr></thead><tbody>${fuelTableBody}</tbody></table></div>`);
}

function atcSection(root) {
  const atcText = document.getElementById("atc-text");
  const atcActions = document.getElementById("atc-actions");
  if (!atcText) return;
  atcText.textContent = safeText(textOf(root, "atc flightplan_text"));
  if (atcActions) {
    const ivaoLink = textOf(root, "prefile ivao link");
    if (ivaoLink !== "-") {
      atcActions.innerHTML = `<a class="atc-link" href="${ivaoLink}" target="_blank" rel="noopener noreferrer">Create IVAO FPL</a>`;
    } else {
      atcActions.innerHTML = "";
    }
  }
}

function cruiseWinds(root) {
  const fixes = [...root.querySelectorAll("navlog > fix")];
  const selected = fixes.filter((fix) => {
    const stage = textOf(fix, "stage");
    return stage !== "-" && !stage.toLowerCase().includes("descent");
  });
  const rows = selected.map((fix) => {
    const ident = textOf(fix, "ident");
    const altitude = textOf(fix, "altitude_feet");
    const oat = textOf(fix, "oat");
    const wind = `${textOf(fix, "wind_dir")}/${textOf(fix, "wind_spd")}`;
    const tropopause = textOf(fix, "tropopause_feet");
    const mora = textOf(fix, "mora");
    return `<tr><td>${ident}</td><td>${altitude}</td><td>${oat}</td><td>${wind}</td><td>${tropopause}</td><td>${mora}</td></tr>`;
  }).join("");
  if (!rows) {
    setHtml("cruise-winds", `<div class="winds-wrap"><div class="winds-table-box"><table class="winds-table"><thead><tr><th>FIX</th><th>ALTITUDE_FEET</th><th>OAT</th><th>WIND DIR/SPD</th><th>TROPOPAUSE_FEET</th><th>MORA</th></tr></thead><tbody><tr><td colspan="6">-</td></tr></tbody></table></div></div>`);
    return;
  }
  setHtml("cruise-winds", `<details class="winds-wrap"><summary class="winds-toggle">Show/Hide Waypoints (${selected.length})</summary><div class="winds-table-box"><table class="winds-table"><thead><tr><th>FIX</th><th>ALTITUDE_FEET</th><th>OAT</th><th>WIND DIR/SPD</th><th>TROPOPAUSE_FEET</th><th>MORA</th></tr></thead><tbody>${rows}</tbody></table></div></details>`);
}

function impactCard(title, burn, time, unit) {
  const burnClass = impactClass(burn);
  const timeClass = impactClass(time);
  const u = unit || "KG";
  return `
    <article class="impact-card">
      <div class="impact-title">${title}</div>
      <div class="impact-row">
        <span>Burn</span>
        <span class="${burnClass}">${formatSigned(burn, u)}</span>
      </div>
      <div class="impact-row">
        <span>Time</span>
        <span class="${timeClass}">${formatSignedDuration(time)}</span>
      </div>
    </article>
  `;
}

function impacts(root) {
  const belowRows = [
    { title: "6000 Below", path: "impacts minus_6000ft" },
    { title: "4000 Below", path: "impacts minus_4000ft" },
    { title: "2000 Below", path: "impacts minus_2000ft" }
  ].map((rowItem) =>
    impactCard(
      rowItem.title,
      textOf(root, `${rowItem.path} burn_difference`),
      textOf(root, `${rowItem.path} time_difference`),
      getWeightUnit(root)
    )
  ).join("");
  const aboveRows = [
    { title: "2000 Above", path: "impacts plus_2000ft" },
    { title: "4000 Above", path: "impacts plus_4000ft" },
    { title: "6000 Above", path: "impacts plus_6000ft" }
  ].map((rowItem) =>
    impactCard(
      rowItem.title,
      textOf(root, `${rowItem.path} burn_difference`),
      textOf(root, `${rowItem.path} time_difference`),
      getWeightUnit(root)
    )
  ).join("");
  const html = `
    <article class="impact-group">
      <div class="impact-title">Cruise Level Decrease</div>
      ${belowRows}
    </article>
    <article class="impact-group">
      <div class="impact-title">Cruise Level Increase</div>
      ${aboveRows}
    </article>
  `;
  setHtml("impacts-grid", html);
}

function getImageList(root) {
  const base = textOf(root, "images directory");

  const maps = [...root.querySelectorAll("images map")];

  return maps.map((m) => {
    const name = textOf(m, "name");
    const file = textOf(m, "link");

    return {
      name,
      url: base + file
    };
  });
}

let images = [];
let currentIndex = 0;

function renderImage() {
  const img = document.getElementById("slideshow-img");
  const title = document.getElementById("img-title");

  if (!images.length) return;

  img.src = images[currentIndex].url;
  title.textContent = images[currentIndex].name;
}

function nextImage() {
  currentIndex = (currentIndex + 1) % images.length;
  renderImage();
}

function prevImage() {
  currentIndex = (currentIndex - 1 + images.length) % images.length;
  renderImage();
}

function bindSlideshow() {
  document.getElementById("img-next")?.addEventListener("click", nextImage);
  document.getElementById("img-prev")?.addEventListener("click", prevImage);
}



function renderDashboard() {
  if (!window.location.pathname.includes("dashboard.html")) return;

  const xmlText = getXmlFromStorage();
  if (!xmlText) {
    window.location.href = "index.html";
    return;
  }
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) {
    window.location.href = "index.html";
    return;
  }
  mainInfo(xml);
  fplan(xml);
  timeline(xml);
  loadsheet(xml);
  atcSection(xml);
  cruiseWinds(xml);
  impacts(xml);
  images = getImageList(xml);
  currentIndex = 0;
  renderImage();
  bindSlideshow();
  document.querySelector("#takeoffPerf").innerHTML =
  takeoffPerformanceHtml(xml);
document.querySelector("#landingPerf").innerHTML =
  landingPerformanceHtml(xml);
  
}

document.addEventListener("DOMContentLoaded", () => {
  bindLoginForm();
  bindDashboardReload();
  renderDashboard();
});
