/**
 * Multi-API Vehicle to Parts Bridge Controller
 * 1. CarAPI (carapi.app) -> For Year, Make, Model, Trim Selection
 * 2. Auto Parts Catalog API (RapidAPI) -> For matching components via text queries
 *
 * SECURITY NOTE: The API keys below are hardcoded client-side, which means
 * they are visible to anyone who views this page's source or network tab.
 * If this app is ever deployed publicly, move these to a backend proxy and
 * rotate both keys immediately. See the note left at the bottom of this file.
 */
// CarAPI
const CAR_API_TOKEN = "662027e2-d568-4bb7-b35a-f3fe97b2b503";
const CAR_API_SECRET = "3228005a2ad9d9bfa3911b7957bade74";
let carApiJwt = null;
// Auto Parts API
const PARTS_API_KEY = "5445e27afemshcf2793b7b8988d2p19ccbajsn9105f136d748";
const PARTS_API_HOST = "auto-parts-catalog.p.rapidapi.com";

// DOM Element Bindings
const els = {
  year: document.getElementById("select-year"),
  maker: document.getElementById("select-maker"),
  model: document.getElementById("select-model"),
  trim: document.getElementById("select-trim"),
  group: document.getElementById("select-group"),
  partsGrid: document.getElementById("parts-display-grid"),
  vImgBox: document.getElementById("vehicle-img-box"),
  vTitle: document.getElementById("vehicle-txt-title"),
  vSubtitle: document.getElementById("vehicle-txt-subtitle"),
};

// Application State tracking text strings from CarAPI to bridge to the Parts API
let carApiState = {
  year: "",
  make: "",
  model: "",
  engineCc: "",
  engineHp: "",
  partsVehicleId: null, // The target ID we must discover in the Parts API database
};

// Authentication state for CarAPI JWT Token
let carApiToken = "";
let pendingAuthPromise = null;

// Helper to check if JWT token is expired or close to expiring
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    // Base64 decode URL-safe token payload
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.exp) {
      const now = Date.now() / 1000;
      // Refresh 30 seconds before actual expiration for safety margin
      return payload.exp - 30 < now;
    }
    return false;
  } catch (e) {
    return true; // Force re-auth on decode error
  }
}

// State tracking if we have fallen back to mock/simulation mode for the Parts API
let isPartsApiMocked = false;
// Human-readable reason the Parts API fell back, shown in the UI banner
let partsApiFallbackReason = "";

// High-Fidelity local catalog dataset fallback for CarAPI (in case of authorization errors or service outages)
let isCarApiMocked = false;

const MOCK_CAR_DATA = {
  years: [2020, 2019, 2018],
  makes: [
    { id: "toyota", name: "Toyota" },
    { id: "honda", name: "Honda" },
    { id: "ford", name: "Ford" },
    { id: "bmw", name: "BMW" },
  ],
  models: {
    toyota: [
      { id: "camry", name: "Camry" },
      { id: "corolla", name: "Corolla" },
      { id: "rav4", name: "RAV4" },
    ],
    honda: [
      { id: "civic", name: "Civic" },
      { id: "accord", name: "Accord" },
      { id: "crv", name: "CR-V" },
    ],
    ford: [
      { id: "mustang", name: "Mustang" },
      { id: "f150", name: "F-150" },
      { id: "explorer", name: "Explorer" },
    ],
    bmw: [
      { id: "3series", name: "3 Series" },
      { id: "5series", name: "5 Series" },
      { id: "x5", name: "X5" },
    ],
  },
  trims: {
    camry: [
      {
        id: "camry_le",
        trim: "LE",
        description: "LE 4dr Sedan (2.5L 4cyl 8A)",
        horsepower_hp: 203,
        size: 2.5,
      },
      {
        id: "camry_se",
        trim: "SE",
        description: "SE 4dr Sedan (2.5L 4cyl 8A)",
        horsepower_hp: 203,
        size: 2.5,
      },
      {
        id: "camry_xse",
        trim: "XSE V6",
        description: "XSE 4dr Sedan (3.5L 6cyl 8A)",
        horsepower_hp: 301,
        size: 3.5,
      },
    ],
    corolla: [
      {
        id: "corolla_le",
        trim: "LE",
        description: "LE 4dr Sedan (1.8L 4cyl CVT)",
        horsepower_hp: 139,
        size: 1.8,
      },
      {
        id: "corolla_se",
        trim: "SE",
        description: "SE 4dr Sedan (2.0L 4cyl CVT)",
        horsepower_hp: 169,
        size: 2.0,
      },
    ],
    rav4: [
      {
        id: "rav4_le",
        trim: "LE",
        description: "LE 4dr SUV (2.5L 4cyl 8A)",
        horsepower_hp: 203,
        size: 2.5,
      },
      {
        id: "rav4_xle",
        trim: "XLE",
        description: "XLE 4dr SUV (2.5L 4cyl 8A)",
        horsepower_hp: 203,
        size: 2.5,
      },
    ],
    civic: [
      {
        id: "civic_lx",
        trim: "LX",
        description: "LX 4dr Sedan (2.0L 4cyl CVT)",
        horsepower_hp: 158,
        size: 2.0,
      },
      {
        id: "civic_ex",
        trim: "EX",
        description: "EX 4dr Sedan (1.5L 4cyl Turbo CVT)",
        horsepower_hp: 180,
        size: 1.5,
      },
      {
        id: "civic_si",
        trim: "Si",
        description: "Si 4dr Sedan (1.5L 4cyl Turbo 6M)",
        horsepower_hp: 200,
        size: 1.5,
      },
    ],
    accord: [
      {
        id: "accord_lx",
        trim: "LX",
        description: "LX 4dr Sedan (1.5L 4cyl Turbo CVT)",
        horsepower_hp: 192,
        size: 1.5,
      },
      {
        id: "accord_sport",
        trim: "Sport",
        description: "Sport 4dr Sedan (2.0L 4cyl Turbo 10A)",
        horsepower_hp: 252,
        size: 2.0,
      },
    ],
    crv: [
      {
        id: "crv_lx",
        trim: "LX",
        description: "LX 4dr SUV (1.5L 4cyl Turbo CVT)",
        horsepower_hp: 190,
        size: 1.5,
      },
      {
        id: "crv_ex",
        trim: "EX",
        description: "EX 4dr SUV (1.5L 4cyl Turbo CVT)",
        horsepower_hp: 190,
        size: 1.5,
      },
    ],
    mustang: [
      {
        id: "mustang_ecoboost",
        trim: "EcoBoost",
        description: "EcoBoost 2dr Coupe (2.3L 4cyl Turbo 10A)",
        horsepower_hp: 310,
        size: 2.3,
      },
      {
        id: "mustang_gt",
        trim: "GT Premium",
        description: "GT Premium 2dr Coupe (5.0L 8cyl 6M)",
        horsepower_hp: 460,
        size: 5.0,
      },
    ],
    f150: [
      {
        id: "f150_xl",
        trim: "XL",
        description: "XL Regular Cab (3.3L 6cyl 10A)",
        horsepower_hp: 290,
        size: 3.3,
      },
      {
        id: "f150_lariat",
        trim: "Lariat",
        description: "Lariat SuperCrew (2.7L 6cyl Turbo 10A)",
        horsepower_hp: 325,
        size: 2.7,
      },
    ],
    explorer: [
      {
        id: "explorer_base",
        trim: "Base",
        description: "Base 4dr SUV (2.3L 4cyl Turbo 10A)",
        horsepower_hp: 300,
        size: 2.3,
      },
      {
        id: "explorer_limited",
        trim: "Limited",
        description: "Limited 4dr SUV (2.3L 4cyl Turbo 10A)",
        horsepower_hp: 300,
        size: 2.3,
      },
    ],
    "3series": [
      {
        id: "330i",
        trim: "330i",
        description: "330i 4dr Sedan (2.0L 4cyl Turbo 8A)",
        horsepower_hp: 255,
        size: 2.0,
      },
      {
        id: "m340i",
        trim: "M340i",
        description: "M340i 4dr Sedan (3.0L 6cyl Turbo 8A)",
        horsepower_hp: 382,
        size: 3.0,
      },
    ],
    "5series": [
      {
        id: "530i",
        trim: "530i",
        description: "530i 4dr Sedan (2.0L 4cyl Turbo 8A)",
        horsepower_hp: 248,
        size: 2.0,
      },
      {
        id: "m550i",
        trim: "M550i xDrive",
        description: "M550i xDrive 4dr Sedan (4.4L 8cyl Turbo 8A)",
        horsepower_hp: 523,
        size: 4.4,
      },
    ],
    x5: [
      {
        id: "x5_sdrive40i",
        trim: "sDrive40i",
        description: "sDrive40i 4dr SUV (3.0L 6cyl Turbo 8A)",
        horsepower_hp: 335,
        size: 3.0,
      },
      {
        id: "x5_xdrive50i",
        trim: "xDrive50i",
        description: "xDrive50i 4dr SUV (4.4L 8cyl Turbo 8A)",
        horsepower_hp: 456,
        size: 4.4,
      },
    ],
  },
};

function carApiFetchMock(endpoint, params = {}) {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (cleanEndpoint === "/years") {
    return MOCK_CAR_DATA.years;
  }

  if (cleanEndpoint === "/makes") {
    return { data: MOCK_CAR_DATA.makes };
  }

  if (cleanEndpoint === "/models/v2") {
    const makeId = params.make_id;
    return { data: MOCK_CAR_DATA.models[makeId] || [] };
  }

  if (cleanEndpoint === "/trims/v2") {
    const modelId = params.model_id;
    const list = MOCK_CAR_DATA.trims[modelId] || [];
    return {
      data: list.map((t) => ({
        id: t.id,
        trim: t.trim,
        description: t.description,
      })),
    };
  }

  if (cleanEndpoint.startsWith("/trims/v2/")) {
    const trimId = cleanEndpoint.split("/").pop();
    let foundTrim = null;
    for (const modelId in MOCK_CAR_DATA.trims) {
      const trim = MOCK_CAR_DATA.trims[modelId].find((t) => t.id === trimId);
      if (trim) {
        foundTrim = trim;
        break;
      }
    }
    if (foundTrim) {
      return {
        id: foundTrim.id,
        engines: [
          { horsepower_hp: foundTrim.horsepower_hp, size: foundTrim.size },
        ],
      };
    }
    return { id: trimId, engines: [] };
  }

  throw new Error(`Unknown mock endpoint: ${cleanEndpoint}`);
}

// Static mapping for core assembly groups recognized by standard parts schemas
const COMPONENT_GROUPS = [
  { id: "100005", name: "Brake System (Pads, Rotors)" },
  { id: "100260", name: "Filters (Air, Oil, Cabin)" },
  { id: "100010", name: "Ignition System (Spark Plugs)" },
  { id: "100008", name: "Engine Cooling System" },
];

document.addEventListener("DOMContentLoaded", async () => {
  setupHTMLForCarApi(); // Inject year dropdown if needed and adjust labels

  // Pre-configure initial parts API status
  if (PARTS_API_KEY) {
    updatePartsApiStatus("Active", "success");
  } else {
    updatePartsApiStatus("Key Missing", "error");
  }

  // Authenticate with CarAPI and bootstrap years list dynamically
  try {
    updateCarApiStatus("Authenticating...", "warning");
    await getCarApiToken();
    updateCarApiStatus("Connected", "success");
    await bootstrapYears();
  } catch (err) {
    console.warn(
      "CarAPI Initialization Failed, activating simulation mode:",
      err,
    );
    isCarApiMocked = true;
    updateCarApiStatus("Simulation Mode", "warning");
    await bootstrapYears();
  }

  // Bind event chain cascading listeners
  els.year.addEventListener("change", handleYearChange);
  els.maker.addEventListener("change", handleMakerChange);
  els.model.addEventListener("change", handleModelChange);
  els.trim.addEventListener("change", handleTrimChange);
  els.group.addEventListener("change", handleGroupChange);
});

/**
 * Status display helper functions
 */
// The visible "CarAPI: Simulation Mode" / "Parts API: Simulation Mode" badges
// have been removed from the UI per request. These functions are kept as
// no-ops (rather than deleted) so the many existing call sites throughout
// this file don't need to change. Simulation mode still runs the same way
// internally — it's just no longer displayed to the user.
function updateCarApiStatus(text, statusClass) {
  // intentionally no-op: status badge removed from UI
}

function updatePartsApiStatus(text, statusClass) {
  // intentionally no-op: status badge removed from UI
}

/**
 * Resets the application's vehicle state and clears visual layouts back to default.
 */
function resetAppState() {
  carApiState = {
    year: els.year && els.year.value ? els.year.value : "",
    make:
      els.maker && els.maker.value && els.maker.selectedIndex > 0
        ? els.maker.options[els.maker.selectedIndex].text
        : "",
    model:
      els.model && els.model.value && els.model.selectedIndex > 0
        ? els.model.options[els.model.selectedIndex].text
        : "",
    engineCc: "",
    engineHp: "",
    partsVehicleId: null,
  };

  // Reset vehicle showcase card
  const imgCard = document.getElementById("vehicle-img-card");
  if (imgCard) {
    imgCard.style.display = "";
  }
  if (els.vImgBox) {
    els.vImgBox.innerHTML = `
      <div class="has-text-grey has-text-centered p-4">
        Awaiting CarAPI vehicle parameters selection to fetch design renderings...
      </div>
    `;
  }
  if (els.vTitle) {
    els.vTitle.textContent = "—";
  }
  if (els.vSubtitle) {
    els.vSubtitle.textContent = "No vehicle contextualized";
  }

  // Reset compatible parts layout
  if (els.partsGrid) {
    els.partsGrid.innerHTML = `
      <div class="column is-full">
        <div class="notification is-info is-light has-text-centered py-6">
          <p class="title is-5 mb-3">Complete steps 1 through 4 using the configuration menu above.</p>
          <p class="subtitle is-6 has-text-grey">The backend engine will automatically map the structural parameters across databases to unlock the parts groups filter.</p>
        </div>
      </div>
    `;
  }
}

/**
 * Helper to adjust HTML on the fly to support CarAPI's requirement for a Year selector
 * Note: We keep this for compatibility, but index.html already has these elements properly declared.
 */
function setupHTMLForCarApi() {
  const grid = document.querySelector(".selectors-grid");
  if (grid && !document.getElementById("select-year")) {
    const group = document.createElement("div");
    group.className = "form-group";
    group.innerHTML = `<div class="form-group-header">
                         <label for="select-year">1. Year</label>
                         <span class="api-badge badge-carapi">CarAPI</span>
                       </div>
                       <select id="select-year"><option value="">Select Year...</option></select>`;
    grid.insertBefore(group, grid.firstChild);
    els.year = document.getElementById("select-year");
  }
}

/**
 * ============================================================================
 * CARAPI INTERACTION LAYER
 * ============================================================================
 */

async function getCarApiToken() {
  if (carApiToken && !isTokenExpired(carApiToken)) {
    return carApiToken;
  }

  // Deduplicate concurrent authentication requests
  if (pendingAuthPromise) {
    return pendingAuthPromise;
  }

  pendingAuthPromise = (async () => {
    try {
      const res = await fetch("https://carapi.app/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_token: CAR_API_TOKEN,
          api_secret: CAR_API_SECRET,
        }),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        throw new Error(
          `CarAPI Authentication Failed: ${res.status} ${res.statusText}${bodyText ? " - " + bodyText : ""}`,
        );
      }
      const token = (await res.text()).trim();
      carApiToken = token;
      return token;
    } catch (err) {
      carApiToken = "";
      throw err;
    } finally {
      pendingAuthPromise = null;
    }
  })();

  return pendingAuthPromise;
}

async function carApiFetch(endpoint, params = {}) {
  if (isCarApiMocked) {
    return carApiFetchMock(endpoint, params);
  }

  try {
    let token = await getCarApiToken();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = new URL(`https://carapi.app/api${cleanEndpoint}`);
    Object.keys(params).forEach((k) => url.searchParams.append(k, params[k]));

    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    // Reactive Token Refresh: Retry once if unauthorized (401)
    if (res.status === 401) {
      console.warn(
        "CarAPI token invalid or expired. Attempting automatic re-authentication...",
      );
      carApiToken = ""; // Force renewal
      token = await getCarApiToken();
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(
        `CarAPI Error: ${res.status}${bodyText ? " - " + bodyText.slice(0, 300) : ""}`,
      );
    }
    return await res.json();
  } catch (err) {
    console.error(
      `CarAPI execution failed for "${endpoint}", activating local fallback simulation mode:`,
      err,
    );
    isCarApiMocked = true;
    updateCarApiStatus("Simulation Mode", "warning");
    return carApiFetchMock(endpoint, params);
  }
}

async function bootstrapYears() {
  try {
    const years = await carApiFetch("/years");
    els.year.innerHTML = '<option value="">Select Year...</option>';
    years.forEach((year) => {
      const opt = document.createElement("option");
      opt.value = year;
      opt.textContent = year;
      els.year.appendChild(opt);
    });
  } catch (err) {
    console.error("Error fetching years list:", err);
    bootstrapYearsFallback();
  }
}

function bootstrapYearsFallback() {
  els.year.innerHTML = `
    <option value="">Select Year...</option>
    <option value="2020">2020 (Offline Fallback)</option>
    <option value="2019">2019 (Offline Fallback)</option>
  `;
}

async function handleYearChange() {
  const yearVal = els.year.value;
  carApiState.year = yearVal;

  resetSelect(els.maker, yearVal ? true : false);
  resetSelect(els.model, false);
  resetSelect(els.trim, false);
  resetSelect(els.group, false);

  resetAppState();

  if (!yearVal) return;

  try {
    els.maker.innerHTML = '<option value="">Loading Makes...</option>';
    const data = await carApiFetch("/makes", { year: carApiState.year });
    els.maker.innerHTML = '<option value="">Select Brand...</option>';

    if (data && Array.isArray(data.data)) {
      data.data.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.name;
        els.maker.appendChild(opt);
      });
      els.maker.disabled = false;
    } else {
      throw new Error("Invalid response format for makes");
    }
  } catch (err) {
    console.error("Error loading makes:", err);
    els.maker.innerHTML = '<option value="">Error loading makes</option>';
  }
}

async function handleMakerChange() {
  const makeId = els.maker.value;

  resetSelect(els.model, makeId ? true : false);
  resetSelect(els.trim, false);
  resetSelect(els.group, false);

  resetAppState();

  if (!makeId) return;

  try {
    els.model.innerHTML = '<option value="">Loading Models...</option>';
    const data = await carApiFetch("/models/v2", {
      year: carApiState.year,
      make_id: makeId,
    });
    els.model.innerHTML = '<option value="">Select Model...</option>';

    if (data && Array.isArray(data.data)) {
      data.data.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.name;
        els.model.appendChild(opt);
      });
      els.model.disabled = false;
    } else {
      throw new Error("Invalid response format for models");
    }
  } catch (err) {
    console.error("Error loading models:", err);
    els.model.innerHTML = '<option value="">Error loading models</option>';
  }
}

async function handleModelChange() {
  const modelId = els.model.value;

  resetSelect(els.trim, modelId ? true : false);
  resetSelect(els.group, false);

  resetAppState();

  if (!modelId) return;

  try {
    els.trim.innerHTML = '<option value="">Loading Trims...</option>';
    const data = await carApiFetch("/trims/v2", {
      year: carApiState.year,
      model_id: modelId,
    });
    els.trim.innerHTML = '<option value="">Select Trim...</option>';

    if (data && Array.isArray(data.data)) {
      data.data.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        const label = item.description || item.trim || "Standard";
        opt.textContent = label;
        els.trim.appendChild(opt);
      });
      els.trim.disabled = false;

      fetchVehicleVisual();
    } else {
      throw new Error("Invalid response format for trims");
    }
  } catch (err) {
    console.error("Error loading trims:", err);
    els.trim.innerHTML = '<option value="">Error loading trims</option>';
  }
}

/**
 * ============================================================================
 * BRIDGE INTERSECTION LAYER
 * ============================================================================
 */

// Normalizes brand/model strings for fuzzy comparison: lowercases, strips
// punctuation, and collapses whitespace so "BMW" / "B.M.W." / "bmw " all match.
function normalizeName(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Attempts an exact normalized match first, then falls back to a
// contains-either-direction match. Returns the matched item or null.
function fuzzyFindByName(list, targetName) {
  const target = normalizeName(targetName);
  if (!target) return null;

  // Pass 1: exact normalized match
  let match = list.find((item) => item && normalizeName(item.name) === target);
  if (match) return match;

  // Pass 2: contains, either direction (handles "3 Series" vs "3-Series Sedan")
  match = list.find((item) => {
    if (!item || !item.name) return false;
    const itemName = normalizeName(item.name);
    return itemName.includes(target) || target.includes(itemName);
  });
  if (match) return match;

  // Pass 3: word-overlap match (handles significant reordering/extra words)
  const targetWords = new Set(target.split(" ").filter((w) => w.length > 1));
  let bestScore = 0;
  let bestMatch = null;
  list.forEach((item) => {
    if (!item || !item.name) return;
    const itemWords = normalizeName(item.name)
      .split(" ")
      .filter((w) => w.length > 1);
    const overlap = itemWords.filter((w) => targetWords.has(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = item;
    }
  });
  if (bestMatch && bestScore > 0) return bestMatch;

  return null;
}

async function handleTrimChange() {
  const trimId = els.trim.value;

  resetSelect(els.group, false);
  clearPartsDisplay();

  if (!trimId) {
    resetAppState();
    return;
  }

  // Finalize selected text state values
  carApiState.year = els.year.value;
  carApiState.make = els.maker.options[els.maker.selectedIndex].text;
  carApiState.model = els.model.options[els.model.selectedIndex].text;

  els.partsGrid.innerHTML = `
    <div class="column is-full has-text-centered py-6">
      <div class="button is-loading is-large is-text mb-4" style="border: none;"></div>
      <p class="subtitle is-5 has-text-grey">Cross-referencing vehicle specs with parts catalog numbers...</p>
    </div>
  `;

  try {
    // Show a Loading status for specific engine properties extraction
    const trimDetails = await carApiFetch(`/trims/v2/${trimId}`);

    // Extract technical parameters from trim details response
    let engineHp = "";
    let engineCc = "";
    if (trimDetails && trimDetails.engines && trimDetails.engines.length > 0) {
      const eng = trimDetails.engines[0];
      engineHp = eng.horsepower_hp || "";
      if (eng.size) {
        engineCc = Math.round(parseFloat(eng.size) * 1000).toString();
      }
    }

    carApiState.engineCc = engineCc;
    carApiState.engineHp = engineHp;

    // Reset fallback flags for real API attempt
    isPartsApiMocked = false;
    partsApiFallbackReason = "";
    updatePartsApiStatus("Active", "success");

    // Step 1: Query Parts API using the text name of the Manufacturer discovered in CarAPI
    let manufacturers;
    try {
      manufacturers = await partsApiFetch("/getManufacturers", {
        typeId: "1", // Passenger cars
      });
    } catch (err) {
      // Distinguish "API is broken/unauthorized" (unrecoverable this session)
      // from "just couldn't find a match" (recoverable per-vehicle) so the
      // user sees the real problem instead of a generic fallback message.
      throw new PartsApiHardFailure(
        `Could not reach Parts API (getManufacturers): ${err.message}`,
      );
    }

    if (!Array.isArray(manufacturers)) {
      throw new PartsApiHardFailure(
        "Parts API returned an unexpected response for getManufacturers.",
      );
    }

    const matchedMaker = fuzzyFindByName(manufacturers, carApiState.make);

    if (!matchedMaker)
      throw new Error(
        `Manufacturer "${carApiState.make}" not found in Parts DB manufacturer list (${manufacturers.length} manufacturers checked).`,
      );

    // Step 2: Query Models belonging to that resolved manufacturer reference ID
    const models = await partsApiFetch("/getModels", {
      manufacturerId: matchedMaker.id,
      typeId: "1", // Passenger cars
    });

    if (!Array.isArray(models)) {
      throw new PartsApiHardFailure(
        "Parts API returned an unexpected response for getModels.",
      );
    }

    const matchedModel = fuzzyFindByName(models, carApiState.model);

    if (!matchedModel)
      throw new Error(
        `Model "${carApiState.model}" not found under manufacturer "${matchedMaker.name}" (${models.length} models checked).`,
      );

    // Step 3: Fetch engine architectural variants mapping to that specific sub-generation
    const engineTypes = await partsApiFetch("/getVehicleEngineTypes", {
      manufacturerId: matchedMaker.id,
      modelSeriesId: matchedModel.id,
      typeId: "1", // Passenger cars
    });

    if (!Array.isArray(engineTypes) || engineTypes.length === 0) {
      throw new Error(
        `No engine types resolved for "${matchedModel.name}" model series.`,
      );
    }

    // Best effort mapping: Match by Horsepower or Cylinder displacement properties passed over from CarAPI
    let targetEngine = engineTypes[0]; // Fallback default to avoid locking up
    if (carApiState.engineHp) {
      const closest = engineTypes.find(
        (e) =>
          e &&
          e.powerHp &&
          Math.abs(parseInt(e.powerHp) - parseInt(carApiState.engineHp)) < 15,
      );
      if (closest) targetEngine = closest;
    }

    // Successfully discovered the native structural parts database equivalent identifier!
    carApiState.partsVehicleId = targetEngine.id;

    // Unlock the Component Group categories selector drop-down menu
    els.group.innerHTML = '<option value="">Select Category...</option>';
    COMPONENT_GROUPS.forEach((grp) => {
      const opt = document.createElement("option");
      opt.value = grp.id;
      opt.textContent = grp.name;
      els.group.appendChild(opt);
    });
    els.group.disabled = false;

    els.vSubtitle.textContent = `${carApiState.make} ${carApiState.model} (${targetEngine.name || "Standard Specs"})`;
    clearPartsDisplay();
  } catch (err) {
    const isHardFailure = err instanceof PartsApiHardFailure;
    console.warn(
      `Switching to Mock Parts API Fallback due to ${isHardFailure ? "API failure" : "match failure"}:`,
      err.message,
    );

    // Switch to simulation mode seamlessly
    isPartsApiMocked = true;
    partsApiFallbackReason = err.message;
    updatePartsApiStatus("Simulation Mode", "warning");

    // Set a mock ID to proceed with standard dropdown logic
    carApiState.partsVehicleId = "MOCK_" + Date.now();

    // Unlock the Component Group categories selector drop-down menu
    els.group.innerHTML = '<option value="">Select Category...</option>';
    COMPONENT_GROUPS.forEach((grp) => {
      const opt = document.createElement("option");
      opt.value = grp.id;
      opt.textContent = grp.name;
      els.group.appendChild(opt);
    });
    els.group.disabled = false;

    const engineDesc = carApiState.engineHp
      ? `${carApiState.engineHp} HP`
      : "Standard Specs";
    els.vSubtitle.textContent = `${carApiState.make} ${carApiState.model} (${engineDesc})`;

    const hintText = isHardFailure
      ? "This looks like a Parts API connectivity/auth/subscription problem, not a matching problem — check your RapidAPI subscription status for this API and your monthly quota."
      : "This looks like a naming mismatch between CarAPI and the Parts DB for this specific vehicle — the fuzzy matcher couldn't find a confident match.";

    els.partsGrid.innerHTML = `
      <div class="column is-full">
        <div class="notification is-warning is-light has-text-centered">
          <p class="title is-4 mb-2">⚠️ Demo/Simulation Mode Activated</p>
          <p class="subtitle is-6 mb-3">We've mapped <strong>${carApiState.make} ${carApiState.model}</strong> using high-fidelity local catalog simulations.</p>
          <p class="is-size-7 mb-2"><strong>Reason:</strong> ${escapeHtml(err.message)}</p>
          <p class="is-size-7 has-text-grey mb-4">${hintText}</p>
          <p class="has-text-link has-text-weight-bold">Select a Parts Group above to view compatible components!</p>
        </div>
      </div>
    `;
  }
}

// Custom error type to distinguish "the Parts API itself failed/errored"
// (unauthorized, down, bad response shape) from "we made the call fine
// but couldn't fuzzy-match a manufacturer/model" — these need different
// messaging so users can tell a subscription problem from a data problem.
class PartsApiHardFailure extends Error {
  constructor(message) {
    super(message);
    this.name = "PartsApiHardFailure";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/**
 * ============================================================================
 * AUTO PARTS CATALOG API EXECUTION LAYER
 * ============================================================================
 */

async function partsApiFetch(endpoint, queryParams = {}) {
  const apiKey = PARTS_API_KEY;
  if (!apiKey) {
    throw new PartsApiHardFailure("Missing RapidAPI Key credential.");
  }

  const url = new URL(`https://${PARTS_API_HOST}${endpoint}`);
  Object.keys(queryParams).forEach((key) =>
    url.searchParams.append(key, queryParams[key]),
  );

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": PARTS_API_HOST,
      },
    });
  } catch (networkErr) {
    // fetch() itself threw: DNS/CORS/offline, not an HTTP error status
    throw new PartsApiHardFailure(
      `Network error calling Parts API (${endpoint}): ${networkErr.message}`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new PartsApiHardFailure(
      `RapidAPI rejected the request (HTTP ${response.status}) for ${endpoint} — key invalid or not subscribed to this API.`,
    );
  }

  if (response.status === 429) {
    throw new PartsApiHardFailure(
      `RapidAPI rate limit / monthly quota exceeded for ${endpoint} (HTTP 429).`,
    );
  }

  let json;
  try {
    json = await response.json();
  } catch (parseErr) {
    throw new PartsApiHardFailure(
      `Parts API returned a non-JSON response for ${endpoint} (HTTP ${response.status}).`,
    );
  }

  if (
    !response.ok ||
    (json && json.message && /not subscribed/i.test(json.message))
  ) {
    throw new PartsApiHardFailure(
      json && json.message
        ? json.message
        : `Parts Catalog Http Fault: ${response.status} on ${endpoint}`,
    );
  }
  return json;
}

async function handleGroupChange() {
  const vehicleId = carApiState.partsVehicleId;
  const productGroupId = els.group.value;

  if (!vehicleId || !productGroupId) {
    els.partsGrid.innerHTML = `
      <div class="column is-full">
        <div class="notification is-link is-light has-text-centered py-5">
          Select a Parts Group above to view compatible components!
        </div>
      </div>
    `;
    return;
  }

  els.partsGrid.innerHTML = `
    <div class="column is-full has-text-centered py-6">
      <div class="button is-loading is-large is-text mb-4" style="border: none;"></div>
      <p class="subtitle is-5 has-text-grey">Extracting physical parts records allocations...</p>
    </div>
  `;

  try {
    let data;
    if (isPartsApiMocked) {
      data = generateMockParts(
        carApiState.make,
        carApiState.model,
        productGroupId,
      );
    } else {
      data = await partsApiFetch("/getArticlesList", {
        vehicleId: vehicleId,
        productGroupId: productGroupId,
        typeId: "1", // Passenger cars
      });
    }

    if (!data || data.length === 0) {
      els.partsGrid.innerHTML = `
        <div class="column is-full">
          <div class="notification is-warning is-light has-text-centered py-5">
            No active reference components mapped to this specific model compilation profile.
          </div>
        </div>
      `;
      return;
    }

    els.partsGrid.innerHTML = "";

    data.forEach((article) => {
      const card = document.createElement("div");
      card.className = "column is-one-third-desktop is-half-tablet";
      const imgUrl =
        article.imgUrl ||
        "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&q=80&w=400";

      card.innerHTML = `
        <div class="card is-fullheight" style="display: flex; flex-direction: column; height: 100%;">
          <div class="card-image p-4 has-background-white" style="height: 180px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #ededed;">
            <figure class="image" style="max-height: 100%; max-width: 100%;">
              <img src="${imgUrl}" alt="${article.name || "Component Reference"}" style="max-height: 150px; object-fit: contain;" onerror="this.src='https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&q=80&w=400';">
            </figure>
          </div>
          <div class="card-content" style="flex-grow: 1; display: flex; flex-direction: column;">
            <p class="is-size-7 has-text-link has-text-weight-bold is-uppercase mb-1">${article.brandName || "Generic"}</p>
            <p class="title is-5 mb-3" style="line-height: 1.3;">${article.name || "Component Piece"}</p>
            <p class="subtitle is-7 has-text-grey mt-auto mb-0" style="font-family: monospace; background: #f5f5f5; padding: 0.25rem 0.5rem; border-radius: 4px; width: fit-content;">Part No: ${article.articleNo || "N/A"}</p>
          </div>
        </div>
      `;
      els.partsGrid.appendChild(card);
    });
  } catch (err) {
    console.error("Error executing part parameters parsing:", err);
    els.partsGrid.innerHTML = `
      <div class="column is-full">
        <div class="notification is-danger is-light has-text-centered py-5">
          <p class="has-text-weight-bold mb-2">Failed to execute part parameter parsing. Check monthly tier limit quotas.</p>
          <p class="is-size-7">${escapeHtml(err.message)}</p>
        </div>
      </div>
    `;
  }
}

/**
 * High-Fidelity Mock Parts Database Generator
 */
function generateMockParts(vehicleMake, vehicleModel, productGroupId) {
  const mockImages = {
    100005:
      "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&q=80&w=400", // Brakes
    100260:
      "https://images.unsplash.com/photo-1616788494707-ec28f08d05a1?auto=format&fit=crop&q=80&w=400", // Filters
    100010:
      "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&q=80&w=400", // Ignition
    100008:
      "https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&q=80&w=400", // Cooling
  };

  const defaultImg =
    "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&q=80&w=400";
  const partImg = mockImages[productGroupId] || defaultImg;

  const templates = {
    100005: [
      // Brake System
      { brandName: "Brembo", name: "Premium Ceramic Brake Pads (Front Set)" },
      { brandName: "Bosch", name: "QuietCast Premium Disc Brake Rotor" },
      { brandName: "Akebono", name: "ProACT Ultra-Premium Brake Pads" },
      {
        brandName: "PowerStop",
        name: "Z23 Evolution Sport Carbon-Fiber Ceramic Brake Pads",
      },
    ],
    100260: [
      // Filters
      { brandName: "K&N", name: "High-Flow Performance Air Filter" },
      { brandName: "Mobil 1", name: "Extended Performance Oil Filter" },
      { brandName: "Bosch", name: "Premium HEPA Cabin Air Filter" },
      { brandName: "Fram", name: "Tough Guard Protection Oil Filter" },
    ],
    100010: [
      // Ignition System
      { brandName: "NGK", name: "Laser Iridium Spark Plug (Set of 4)" },
      { brandName: "Denso", name: "Iridium Power Spark Plug (Set of 4)" },
      { brandName: "Bosch", name: "Double Iridium Spark Plug" },
      { brandName: "ACDelco", name: "GM Original Equipment Spark Plug Wire" },
    ],
    100008: [
      // Engine Cooling System
      { brandName: "Gates", name: "Engine Coolant Hose (Upper/Lower)" },
      { brandName: "ACDelco", name: "Professional Engine Water Pump Assembly" },
      { brandName: "Denso", name: "Radiator Cooling Fan Assembly" },
      { brandName: "Thermostat", name: "Coolant Thermostat with Housing" },
    ],
  };

  const groupTemplates = templates[productGroupId] || [];
  return groupTemplates.map((part, index) => {
    const articleNo =
      String(productGroupId) +
      String(1000 + index + Math.floor(Math.random() * 8000));
    return {
      brandName: part.brandName,
      name: `${part.name} for ${vehicleMake} ${vehicleModel}`,
      articleNo: articleNo,
      imgUrl: partImg,
    };
  });
}

/**
 * Car Visual Assets Loader Module
 */
function fetchVehicleVisual() {
  const query = encodeURIComponent(`${carApiState.make} ${carApiState.model}`);
  els.vTitle.textContent = `${carApiState.make} ${carApiState.model}`;
  els.vSubtitle.textContent = "Pulling exterior image context...";
  els.vImgBox.innerHTML =
    '<div class="button is-loading is-medium is-text" style="border: none;"></div>';

  const imgCard = document.getElementById("vehicle-img-card");

  fetch(`https://www.carimagery.com/api/v1/demo.json?car=${query}`)
    .then((res) => res.json())
    .then((data) => {
      if (data && data.original) {
        els.vImgBox.innerHTML = `<img src="${data.original}" alt="Vehicle Showcase" style="max-height: 250px; object-fit: contain;">`;
        if (imgCard) imgCard.style.display = "";
      } else {
        // No image found: hide the image box entirely rather than
        // showing an "unavailable" placeholder message.
        if (imgCard) imgCard.style.display = "none";
      }
    })
    .catch(() => {
      if (imgCard) imgCard.style.display = "none";
    });
}

function resetSelect(element, enableLoadingText) {
  element.innerHTML = enableLoadingText
    ? '<option value="">Awaiting selections...</option>'
    : '<option value="">Select...</option>';
  element.disabled = true;
}

function clearPartsDisplay() {
  els.partsGrid.innerHTML = `
    <div class="column is-full">
      <div class="notification is-info is-light has-text-centered py-5">
        Complete the setup cascade above to populate matching articles.
      </div>
    </div>
  `;
}

/**
 * ============================================================================
 * SECURITY NOTE — read before deploying
 * ============================================================================
 * CAR_API_TOKEN, CAR_API_SECRET, and PARTS_API_KEY above are embedded in
 * client-side JS, so they are visible to anyone who opens devtools or views
 * the page source — this is true no matter how they're formatted or hidden.
 * If this app has been deployed anywhere public, or this source file has
 * been shared/committed anywhere, treat these credentials as compromised:
 *   1. Rotate the CarAPI token/secret at carapi.app
 *   2. Rotate/regenerate the RapidAPI key at rapidapi.com
 *   3. Move both to a small backend proxy (serverless function is enough)
 *      that holds the real secrets and exposes only the endpoints this
 *      frontend needs, so keys never ship to the browser.
 * ============================================================================
 */