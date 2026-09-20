const METAR_TAF_PROXY_URL = "https://metar-proxy.abusomfernandez.workers.dev/?url=";

function escapeWeatherHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function decodeWeatherString(rawWx) {
  if (!rawWx) return "";

  const intensityMap = { "-": "light", "+": "heavy", VC: "in the vicinity", RE: "recent" };
  const descriptorMap = {
    FZ: "freezing", TS: "thunderstorm", SH: "shower", BL: "blowing",
    DR: "low drifting", PR: "partial", BC: "patches of", MI: "shallow"
  };
  const weatherMap = {
    DZ: "drizzle", RA: "rain", SN: "snow", SG: "snow grains", PL: "ice pellets",
    GR: "hail", GS: "small hail", BR: "misr", FG: "fog", FU: "smoke",
    VA: "volcanic ash", DU: "dust", SA: "sand", HZ: "haze", PO: "dust/sand whirls",
    SQ: "squalls", FC: "funnel cloud", SS: "sand storm", DS: "dust storm"
  };

  return rawWx.trim().split(/\s+/).map((token) => {
    let remainder = token;
    let intensity = "";
    if (remainder.startsWith("-")) {
      intensity = intensityMap["-"];
      remainder = remainder.slice(1);
    } else if (remainder.startsWith("+")) {
      intensity = intensityMap["+"];
      remainder = remainder.slice(1);
    } else if (remainder.startsWith("RE")) {
      intensity = intensityMap.RE;
      remainder = remainder.slice(2);
    } else if (remainder.startsWith("VC")) {
      intensity = intensityMap.VC;
      remainder = remainder.slice(2);
    }

    const descriptors = [];
    while (remainder.length >= 2 && descriptorMap[remainder.slice(0, 2)]) {
      descriptors.push(descriptorMap[remainder.slice(0, 2)]);
      remainder = remainder.slice(2);
    }

    const phenomena = [];
    while (remainder.length >= 2 && weatherMap[remainder.slice(0, 2)]) {
      phenomena.push(weatherMap[remainder.slice(0, 2)]);
      remainder = remainder.slice(2);
    }

    const parts = [...descriptors, ...phenomena];
    if (intensity) parts.push(intensity);
    const translated = parts.length ? parts.join(" ") : token;
    return `${escapeWeatherHtml(token)} (${translated.charAt(0).toUpperCase()}${translated.slice(1)})`;
  }).join(" ");
}

function weatherReportArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  return payload.data || payload.results || payload.metar || payload.METAR || [];
}

async function fetchWeatherReport(type, icao) {
  const targetUrl = `https://aviationweather.gov/api/data/${type}?ids=${encodeURIComponent(icao)}&format=json`;
  const response = await fetch(`${METAR_TAF_PROXY_URL}${encodeURIComponent(targetUrl)}`, {
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return weatherReportArray(await response.json());
}

function formatWeatherUtc(seconds, fallback = "--:--") {
  if (!seconds) return fallback;
  const date = new Date(seconds * 1000);
  return `${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}Z`;
}

function renderMetarDecoder(container, reports) {
  if (!reports.length) {
    container.innerHTML = '<div class="weather-empty">No METAR data found.</div>';
    return;
  }

  const coverTranslations = { FEW: "Few clouds", SCT: "Scattered clouds", BKN: "Broken clouds", OVC: "Overcast" };
  container.innerHTML = reports.map((report) => {
    const rawOb = report.rawOb || "";
    const rawVisibility = String(report.visib ?? "");
    const visibilityMiles = parseFloat(rawVisibility.replace("+", ""));
    const visibility = Number.isFinite(visibilityMiles) ? `${rawVisibility.includes("+") ? ">" : ""}${Math.round(visibilityMiles * 1.60934)} km` : "--";
    const windKmh = report.wspd !== undefined ? Math.round(report.wspd * 1.852) : "--";
    const gustKmh = report.wgst ? Math.round(report.wgst * 1.852) : null;
    const reportTime = report.reportTime ? new Date(report.reportTime) : null;
    const reportTimeText = reportTime ? `${String(reportTime.getUTCHours()).padStart(2, "0")}:${String(reportTime.getUTCMinutes()).padStart(2, "0")} Z` : "--";
    const variableWind = rawOb.match(/\b(\d{3})V(\d{3})\b/);
    const category = `flt-${String(report.fltCat || "vfr").toLowerCase()}`;
    const clouds = report.clouds?.length ? [...report.clouds].sort((a, b) => b.base - a.base).map((cloud) => {
      const translation = coverTranslations[cloud.cover] ? ` (${coverTranslations[cloud.cover]})` : "";
      let type = "";
      const baseCode = String(Math.round((cloud.base || 0) / 100)).padStart(3, "0");
      const match = rawOb.match(new RegExp(`\\b${cloud.cover}${baseCode}(CB|TCU)\\b`, "i"));
      if (match?.[1] === "CB") type = '<strong class="cloud-type-badge cb">Cumulonimbus</strong>';
      if (match?.[1] === "TCU") type = '<strong class="cloud-type-badge tcu">Towering cumulus</strong>';
      return `<div class="weather-cloud-item"><span>☁️ ${escapeWeatherHtml(cloud.cover)}${translation} ${type}</span><span>Base: ${cloud.base ?? "--"} ft (${cloud.base ? Math.round(cloud.base * 0.3048) : "--"} m)</span></div>`;
    }).join("") : '<div class="weather-cloud-item"><span>☀️ Sky Clear/No significant clouds (SKC/NSC)</span></div>';
    const weather = report.wxString ? `<div class="weather-clouds"><div class="weather-stat-label">Weather phenomena</div><div class="weather-cloud-item weather-phenomena">🌧️ ${decodeWeatherString(report.wxString)}</div></div>` : "";

    return `<article class="weather-card metar-card">
      <div class="weather-header"><div><h3>${escapeWeatherHtml(report.icaoId)} - ${escapeWeatherHtml(report.name || "Airport")}</h3><span>Report: ${reportTimeText} | Elevation: ${report.elev || 0} m</span></div><span class="flt-cat ${category}">${escapeWeatherHtml(report.fltCat || "N/A")}</span></div>
      <div class="weather-body">
        <div class="weather-main-stats"><div><span class="weather-stat-label">Temperature</span><strong>${report.temp ?? "--"} °C</strong></div><div><span class="weather-stat-label">Dew point</span><strong>${report.dewp ?? "--"} °C</strong></div><div><span class="weather-stat-label">Visibility</span><strong>${visibility}</strong></div><div><span class="weather-stat-label">QNH</span><strong>${report.altim ?? "--"} hPa</strong></div></div>
        <div class="weather-wind"><div class="weather-compass"><div class="weather-compass-arrow" style="transform: rotate(${report.wdir || 0}deg);"></div></div><div><span class="weather-stat-label">Wind</span><strong>${report.wdir ?? 0}° at ${report.wspd ?? 0} kt (${windKmh} km/h)</strong>${variableWind ? `<div class="weather-variable-wind">Variable between ${variableWind[1]}° and ${variableWind[2]}°</div>` : ""}${gustKmh ? `<div class="weather-gust">Gusts: ${report.wgst} kt (${gustKmh} km/h)</div>` : ""}</div></div>
        <div class="weather-clouds"><div class="weather-stat-label">Clouds layers</div>${clouds}</div>${weather}<div class="weather-raw">${escapeWeatherHtml(rawOb)}</div>
      </div>
    </article>`;
  }).join("");
}

function renderTafDecoder(container, reports) {
  if (!reports.length) {
    container.innerHTML = '<div class="weather-empty">No TAF data found.</div>';
    return;
  }

  const covers = { FEW: "Few clouds", SCT: "Scattered clouds", BKN: "Broken clouds", OVC: "Overcast", NSC: "No Significant Clouds", SKC: "Sky Clear" };
  container.innerHTML = reports.filter((report) => report.fcsts?.length).map((report) => {
    const hourly = [];
    for (let timestamp = report.validTimeFrom; timestamp <= report.validTimeTo; timestamp += 3600) {
      const changes = report.fcsts.slice(1).filter((forecast) => forecast.timeFrom <= timestamp && forecast.timeTo >= timestamp);
      hourly.push({ timestamp, base: report.fcsts[0], changes });
    }

    const windText = (wind) => {
      if (wind.wdir === undefined || wind.wdir === null) return "--";
      const direction = wind.wdir === "VRB" ? "VRB" : `${wind.wdir}°`;
      if (wind.wspd === undefined || wind.wspd === null) return direction;
      const gust = wind.wgst ? ` / G${wind.wgst}kt (${Math.round(wind.wgst * 1.852)}km/h)` : "";
      return `${direction} ${wind.wspd}kt (${Math.round(wind.wspd * 1.852)}km/h)${gust}`;
    };
    const visibilityMeters = (value) => value === "6+" ? 10000 : (parseFloat(value) || 0) * 1609.34;
    const visibilityText = (value) => !value ? "--" : visibilityMeters(value) >= 10000 ? ">10 km" : `${(visibilityMeters(value) / 1000).toFixed(1)} km`;
    const cloudsText = (clouds) => clouds?.length ? clouds.map((cloud) => `${covers[cloud.cover] || cloud.cover}${cloud.base ? ` ${cloud.base}ft` : ""}${cloud.type === "CB" ? ' <strong class="cloud-type-badge cb">Cumulonimbus</strong>' : cloud.type === "TCU" ? ' <strong class="cloud-type-badge tcu">Towering cumulus</strong>' : ""}`).join("<br>") : "NSC / CAVOK";
    const windKey = (forecast) => `${forecast.wdir ?? ""}/${forecast.wspd ?? ""}/${forecast.wgst ?? ""}`;
    const visibilityKey = (forecast) => forecast.visib === "6+" ? "10000" : String(forecast.visib ?? "");
    const cloudsKey = (forecast) => (forecast.clouds || []).map((cloud) => `${cloud.cover}/${cloud.base ?? ""}/${cloud.type ?? ""}`).join("|");
    const hasValue = (forecast, field) => {
      if (field === "clouds") return Array.isArray(forecast.clouds) && forecast.clouds.length > 0;
      if (field === "visib") return forecast.visib !== undefined && forecast.visib !== null && String(forecast.visib).trim() !== "";
      return forecast[field] !== undefined && forecast[field] !== null;
    };
    const changeClass = (forecast) => {
      const forecastIndex = report.fcsts.indexOf(forecast) - 1;
      return `change-color-${(forecastIndex >= 0 ? forecastIndex : 0) % 6}`;
    };
    const cellValue = (item, field, formatter, valueKey) => {
      let value = formatter(item.base);
      let change = "";
      item.changes.forEach((forecast) => {
        if (hasValue(forecast, field) && valueKey(forecast) !== valueKey(item.base)) {
          value = formatter(forecast);
          change = `<div class="cell-change ${changeClass(forecast)}"><span class="change-tag">${forecast.probability ? `PROB${forecast.probability} ` : ""}${forecast.fcstChange || "TEMPO"}</span>${value}</div>`;
        }
      });
      return change || value;
    };
    const row = (label, values) => `<tr><td class="cell-label">${label}</td>${values.map((value) => `<td>${value}</td>`).join("")}</tr>`;
    const headers = hourly.map((item) => { const date = new Date(item.timestamp * 1000); return `<th>${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCHours()).padStart(2, "0")}Z</th>`; }).join("");
    const rows = [
      row("Wind", hourly.map((item) => cellValue(item, "wdir", windText, windKey))),
      row("Visibility", hourly.map((item) => cellValue(item, "visib", (forecast) => visibilityText(forecast.visib), visibilityKey))),
      row("Clouds", hourly.map((item) => cellValue(item, "clouds", (forecast) => cloudsText(forecast.clouds), cloudsKey))),
      row("Weather", hourly.map((item) => {
        const values = [];
        if (item.base.wxString) values.push(decodeWeatherString(item.base.wxString));
        item.changes.forEach((forecast) => {
          if (forecast.wxString && forecast.wxString !== item.base.wxString) {
            values.push(`<div class="cell-change ${changeClass(forecast)}"><span class="change-tag">${forecast.probability ? `PROB${forecast.probability} ` : ""}${forecast.fcstChange || "TEMPO"}</span>${decodeWeatherString(forecast.wxString)}</div>`);
          }
        });
        return values.join("") || "--";
      }))
    ].join("");
    const temperatures = (report.rawTAF || "").match(/(?:TX|TN)(\d{2})\/(\d{2})(\d{2})Z/g)?.map((value) => `${value.startsWith("TX") ? "🔥 Max" : "❄️ Min"}: ${value.slice(2, 4)}°C (${value.slice(5, 7)} ${value.slice(7, 9)}:00Z)`).join(" | ");

    return `<article class="weather-card taf-card"><div class="weather-header"><div><h3>${escapeWeatherHtml(report.icaoId)} - ${escapeWeatherHtml(report.name || "Airport")}</h3><span>Elevation: ${report.elev || 0} m | Lat: ${report.lat ?? "--"}, Lon: ${report.lon ?? "--"}</span></div><div class="taf-validity">Valid: ${formatWeatherUtc(report.validTimeFrom)} ➔ ${formatWeatherUtc(report.validTimeTo)}</div></div>${temperatures ? `<div class="taf-temperatures">${temperatures}</div>` : ""}<div class="taf-table-wrapper"><table class="taf-table"><thead><tr><th class="cell-label">UTC Time</th>${headers}</tr></thead><tbody>${rows}</tbody></table></div><div class="weather-raw">${escapeWeatherHtml(report.rawTAF || "")}</div></article>`;
  }).join("");
}

function initMetarTafDecoder(root) {
  const container = document.getElementById("metar-taf-decoder");
  if (!container) return;
  const inputs = container.querySelectorAll(".weather-airport-input");
  const defaultAirports = {
    metar: airportCode(root, "origin").split("/")[0].trim(),
    taf: airportCode(root, "destination").split("/")[0].trim()
  };
  inputs.forEach((input) => {
    const type = input.dataset.weatherType;
    input.value = defaultAirports[type] && /^[A-Z]{4}$/.test(defaultAirports[type]) ? defaultAirports[type] : "";
    const applyButton = document.getElementById(`${type}-apply-btn`);
    const applySelection = async () => {
      const output = document.getElementById(`${type}-decoder-output`);
      const icao = input.value.trim().toUpperCase().replace(/\s+/g, "");
      input.value = icao;
      if (!output || !icao) return;
      if (!/^[A-Z]{4}$/.test(icao)) {
        output.innerHTML = '<div class="weather-error">Enter a valid four-letter ICAO code.</div>';
        return;
      }
      if (applyButton) applyButton.disabled = true;
      output.innerHTML = '<div class="weather-loading">Checking AviationWeather...</div>';
      try {
        const reports = await fetchWeatherReport(type, icao);
        if (type === "metar") renderMetarDecoder(output, reports);
        else renderTafDecoder(output, reports);
      } catch (error) {
        output.innerHTML = `<div class="weather-error">Error ${type.toUpperCase()}: ${escapeWeatherHtml(error.message)}</div>`;
      } finally {
        if (applyButton) applyButton.disabled = false;
      }
    };
    applyButton?.addEventListener("click", applySelection);
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") applySelection();
    });
    const output = document.getElementById(`${type}-decoder-output`);
    if (output) output.innerHTML = '<div class="weather-empty">Enter an airport and click Apply.</div>';
  });
}
