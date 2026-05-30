let currentRoute = null;
let currentDirection = "O";
let refreshIntervalId = null;
let currentLang = "tc"; // Default state: Traditional Chinese

// --- Localization Translation Dictionary ---
const i18n = {
    en: {
        title: "Bus Arrival HK",
        searchPlaceholder: "Search route (e.g. 1A, 101)",
        popularRoutes: "Routes",
        searchResults: 'Results for "{query}"',
        back: "← Back",
        stopsTitle: "Stops & Real-time ETA",
        noStops: "No stops found.",
        noEta: "No ETA",
        min: "min",
        arr: "Arr",
        loading: "Loading stops and ETA...",
        error: "Failed to load data",
        outbound: "Outbound (O)",
        inbound: "Inbound (I)"
    },
    tc: {
        title: "巴士到站預報 HK",
        searchPlaceholder: "搜尋路線 (例如 1A, 101)",
        popularRoutes: "路線",
        searchResults: '「{query}」的搜尋結果',
        back: "← 返回",
        stopsTitle: "車站及實時預計時間",
        noStops: "找不到相關車站。",
        noEta: "暫無班次",
        min: "分鐘",
        arr: "到站中",
        loading: "正在載入車站及到站時間...",
        error: "載入數據失敗",
        outbound: "去程 (O)",
        inbound: "回程 (I)"
    }
};

let cachedStops = [];
let cachedStopDetails = {};
let cachedEtaData = [];
const expandedStops = new Set();

// --- Core Helper Functions ---

function getDisplayDest(route, dir) {
    const isReversed = (route.company === "KMB" && dir === "I") || (route.company === "CTB" && dir === "inbound");
    const baseDest = currentLang === "en" ? route.dest_en : route.dest_tc;
    if (isReversed && baseDest.includes(" → ")) {
        const parts = baseDest.split(" → ");
        return `${parts[1]} → ${parts[0]}`;
    }
    return baseDest;
}

function toggleLanguage() {
    currentLang = currentLang === "tc" ? "en" : "tc";
    updateLanguageUI();
}

function updateLanguageUI() {
    // 1. Static Layout Updates
    document.getElementById('langBtn').textContent = currentLang === "en" ? "繁體中文" : "English";
    document.querySelector('header h1').textContent = i18n[currentLang].title;
    document.getElementById('routeInput').placeholder = i18n[currentLang].searchPlaceholder;
    document.querySelector('#routeDetailView h3').textContent = i18n[currentLang].stopsTitle;
    document.querySelector('.back-btn').textContent = i18n[currentLang].back;

    // 2. Main List Updates
    const query = document.getElementById('routeInput').value.trim().toUpperCase();
    const title = document.getElementById('listTitle');
    title.textContent = query
        ? i18n[currentLang].searchResults.replace("{query}", query)
        : i18n[currentLang].popularRoutes;

    // Refresh lists rendering state
    const filtered = query ? localRouteList.filter(r => String(r.number).toUpperCase().includes(query)) : localRouteList;
    renderRoutes(filtered);

    // 3. Details Template Updates (If visible)
    if (currentRoute) {
        document.getElementById('dirBtn').textContent = (currentDirection === "O" || currentDirection === "outbound")
            ? i18n[currentLang].outbound
            : i18n[currentLang].inbound;
        document.getElementById('detailDest').textContent = getDisplayDest(currentRoute, currentDirection);
        renderStops();
    }
    // Inside updateLanguageUI() under "3. Details Template Updates (If visible)"
    if (currentRoute) {
        document.getElementById('detailCompany').textContent = getDisplayCompany(currentRoute.company); // <-- UPDATE THIS LINE
        document.getElementById('dirBtn').textContent = (currentDirection === "O" || currentDirection === "outbound")
            ? i18n[currentLang].outbound
            : i18n[currentLang].inbound;
        document.getElementById('detailDest').textContent = getDisplayDest(currentRoute, currentDirection);
        renderStops();
    }
    if (currentRoute) {
        document.getElementById('detailCompany').textContent = getDisplayCompany(currentRoute.company);

        // FIX: Use innerHTML to keep the ⇄ icon intact during language switches
        const dirLabel = (currentDirection === "O" || currentDirection === "outbound")
            ? i18n[currentLang].outbound
            : i18n[currentLang].inbound;
        document.getElementById('dirBtn').innerHTML = `⇄ ${dirLabel}`;

        document.getElementById('detailDest').textContent = getDisplayDest(currentRoute, currentDirection);
        renderStops();
    }
}

async function loadRouteData() {
    const container = document.getElementById('stopsContainer');
    container.innerHTML = `<div class="loading">${i18n[currentLang].loading}</div>`;

    try {
        const company = currentRoute.company.toLowerCase();
        const stopsRes = await fetch(`/route_stop?company=${company}&route=${currentRoute.number}&direction=${currentDirection}`);
        const stopsData = await stopsRes.json();
        cachedStops = stopsData.data || [];

        cachedStopDetails = {};
        const namePromises = cachedStops.map(s =>
            fetch(`/stop?company=${company}&stop=${s.stop}`).then(r => r.json())
        );
        const nameResults = await Promise.all(namePromises);

        nameResults.forEach((res, i) => {
            const details = res.data || res;
            if (details) {
                cachedStopDetails[cachedStops[i].stop] = details;
            }
        });

        const etaUrl = `/route_stop_arrival?company=${company}&route=${currentRoute.number}&direction=${currentDirection}`;
        const etaRes = await fetch(etaUrl);
        const etaData = await etaRes.json();
        cachedEtaData = etaData.data || [];

        renderStops();
    } catch (err) {
        console.error("[ERROR] Fetch failed:", err);
        container.innerHTML = `<div class="error">${i18n[currentLang].error}</div>`;
    }
}

function renderStops() {
    const container = document.getElementById('stopsContainer');
    container.innerHTML = "";

    if (cachedStops.length === 0) {
        container.innerHTML = `<div class="no-results">${i18n[currentLang].noStops}</div>`;
        return;
    }

    const etaMap = {};
    cachedEtaData.forEach(eta => {
        const stopKey = eta.stop || eta.bs_id || eta.seq;
        if (stopKey) {
            if (!etaMap[stopKey]) etaMap[stopKey] = [];
            etaMap[stopKey].push(eta);
        }
    });

    cachedStops.forEach((stopInfo, index) => {
        const stopId = stopInfo.stop;
        const details = cachedStopDetails[stopId] || {};

        // Use localized stop name properties intelligently
        const stopName = currentLang === "en"
            ? (details.name_en || stopInfo.name_en || details.name || "Bus Stop")
            : (details.name_tc || stopInfo.name_tc || details.name_en || details.name || "巴士站");

        const etas = etaMap[stopId] || etaMap[stopInfo.seq] || [];
        const isExpanded = expandedStops.has(stopId);
        const displayEtas = etas.slice(0, isExpanded ? 3 : 1);

        const div = document.createElement('div');
        div.className = `stop-item ${isExpanded ? 'expanded' : ''}`;
        div.onclick = () => toggleStopExpansion(stopId);

        let etaHTML = `<span class="no-eta">${i18n[currentLang].noEta}</span>`;

        if (displayEtas.length > 0) {
            etaHTML = displayEtas.map(eta => {
                const timeStr = eta.eta || eta.dest_time || eta.time || "";
                const timeDisplay = formatTimeDisplay(timeStr);
                return `<span class="eta-time">${timeDisplay}</span>`;
            }).join('');
        }

        div.innerHTML = `
            <div class="stop-info">
                <span class="stop-number">${index + 1}</span>
                <span class="stop-name">${stopName}</span>
            </div>
            <div class="eta-container">${etaHTML}</div>
        `;
        container.appendChild(div);
    });
}

function formatTimeDisplay(etaString) {
    if (!etaString) return "—";
    const diffMin = Math.ceil((new Date(etaString) - new Date()) / 60000);

    if (diffMin > 0 && diffMin < 15) return `<span class="countdown">${diffMin} ${i18n[currentLang].min}</span>`;
    if (diffMin <= 0) return `<span class="countdown">${i18n[currentLang].arr}</span>`;

    return etaString.includes('T')
        ? etaString.split('T')[1].substring(0, 5)
        : etaString.substring(11, 16);
}

function toggleStopExpansion(stopId) {
    if (expandedStops.has(stopId)) {
        expandedStops.delete(stopId);
    } else {
        expandedStops.add(stopId);
    }
    renderStops();
}

async function refreshETA() {
    if (!currentRoute) return;

    try {
        const company = currentRoute.company.toLowerCase();
        const etaUrl = `/route_stop_arrival?company=${company}&route=${currentRoute.number}&direction=${currentDirection}`;

        const etaRes = await fetch(etaUrl);
        const etaData = await etaRes.json();

        cachedEtaData = etaData.data || [];
        renderStops();
    } catch (err) {
        console.error("[ERROR] Seamless refresh failed:", err);
    }
}

function toggleDirection() {
    clearInterval(refreshIntervalId);

    if (currentRoute.company === "KMB") {
        currentDirection = currentDirection === "O" ? "I" : "O";
    } else {
        currentDirection = currentDirection === "outbound" ? "inbound" : "outbound";
    }

    // FIX: Use innerHTML to keep the ⇄ icon intact alongside the translation
    const dirLabel = (currentDirection === "O" || currentDirection === "outbound")
        ? i18n[currentLang].outbound
        : i18n[currentLang].inbound;
    document.getElementById('dirBtn').innerHTML = `⇄ ${dirLabel}`;

    document.getElementById('detailDest').textContent = getDisplayDest(currentRoute, currentDirection);

    loadRouteData().then(() => {
        refreshIntervalId = setInterval(refreshETA, 30000);
    });
}
function search(event) {
    if (event) event.preventDefault();
    const query = document.getElementById('routeInput').value.trim().toUpperCase();
    const title = document.getElementById('listTitle');
    document.getElementById('routeDetailView').classList.add('hidden');
    document.getElementById('routeListView').classList.remove('hidden');

    const filtered = query ? localRouteList.filter(r => String(r.number).toUpperCase().includes(query)) : localRouteList;
    title.textContent = query
        ? i18n[currentLang].searchResults.replace("{query}", query)
        : i18n[currentLang].popularRoutes;
    renderRoutes(filtered);
}

function renderRoutes(routes) {
    const container = document.getElementById('routeList');
    container.innerHTML = routes.length === 0 ? `<li class="no-results">${i18n[currentLang].noStops}</li>` : routes.map(route => `
    <li class="route-item" onclick='showRouteDetail(${JSON.stringify(route)})'>
        <div class="route-info">
            <!-- UPDATE THE LINE BELOW TO USE THE HELPER -->
            <span class="route-number">${getDisplayCompany(route.company)} ${route.number}</span>
            <span class="route-destination">${currentLang === "en" ? route.dest_en : route.dest_tc}</span>
        </div>
    </li>`).join('');
}

async function showRouteDetail(route) {
    clearInterval(refreshIntervalId);

    currentRoute = route;
    currentDirection = route.company === "KMB" ? "O" : "outbound";
    expandedStops.clear(); 
    
    document.getElementById('routeListView').classList.add('hidden');
    document.getElementById('routeDetailView').classList.remove('hidden');
    document.getElementById('detailRouteNumber').textContent = route.number;
    document.getElementById('detailCompany').textContent = getDisplayCompany(route.company); 
    document.getElementById('detailDest').textContent = getDisplayDest(route, currentDirection);
    
    document.getElementById('directionToggle').classList.remove('hidden');
    
    // FIX: Use innerHTML to set the initial layout icon and translation
    document.getElementById('dirBtn').innerHTML = `⇄ ${i18n[currentLang].outbound}`;
    
    await loadRouteData();
    refreshIntervalId = setInterval(refreshETA, 30000);
}

function backToList() {
    clearInterval(refreshIntervalId);
    currentRoute = null;
    document.getElementById('routeDetailView').classList.add('hidden');
    document.getElementById('routeListView').classList.remove('hidden');
}
function getDisplayCompany(companyCode) {
    if (currentLang === "en") return companyCode; // Returns "KMB" or "CTB"
    return companyCode === "KMB" ? "九巴" : "城巴";  // Returns "九巴" or "城巴"
}
window.onload = () => renderRoutes(localRouteList);