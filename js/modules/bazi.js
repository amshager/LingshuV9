
/* js/modules/bazi.js */
import { computeGanzhi, getWuXingFromNayin, toTrueSolarClockDate } from './ganzhi.js';
import { updateCalendarView, setOnDateSelect, getLunarPhaseStatus } from './calendar.js';
import { calculateAstroData, fetchVocDataLocal, fetchAstroDetailsLocal, fetchMoonCalendarForMonth } from './astrology.js';
import { calculateSanHeXiu, calculateLunarMansion, checkMieMo } from './luck.js'; 
import { getLunarDate, getSolarTermData } from './lunar.js'; 
// Yi Module is now handled in calendar.js for title display
import { UI } from '../dom.js'; 
import { CHINA_GEO_DATA } from './cityData.js'; // Updated import to use your static data
import { Chart } from '@astrodraw/astrochart';

const savedLoc = localStorage.getItem('lingshu_location');
let defaultLat = 39.9042;
let defaultLon = 116.4074;
let defaultLocName = '北京';

if (savedLoc) {
    try {
        const parsed = JSON.parse(savedLoc);
        if (parsed.lat && parsed.lon) {
            defaultLat = parsed.lat;
            defaultLon = parsed.lon;
            defaultLocName = parsed.name || '未知';
        }
    } catch(e) {}
}

let state = {
    mode: 'MANUAL', 
    manualDate: new Date(), 
    lat: defaultLat, 
    lon: defaultLon,
    locationName: defaultLocName, // Default name if no GPS
    radixData: null // Store radix data for outer ring
};

// 星座着色 Helper (全局可用)
window.styleZodiacIcon = function(icon) {
    if (!icon) return '';
    const nameToIcon = { '白羊座':'♈', '金牛座':'♉', '双子座':'♊', '巨蟹座':'♋', '狮子座':'♌', '处女座':'♍', '天秤座':'♎', '天蝎座':'♏', '射手座':'♐', '摩羯座':'♑', '水瓶座':'♒', '双鱼座':'♓' };
    const actualIcon = nameToIcon[icon] || icon;
    const icons = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
    const colors = ['#e53935', '#fbc02d', '#26c6da', '#42a5f5', '#e53935', '#fbc02d', '#26c6da', '#42a5f5', '#e53935', '#fbc02d', '#26c6da', '#42a5f5'];
    const idx = icons.indexOf(actualIcon);
    if (idx !== -1) {
        return `<span style="color: ${colors[idx]}; font-family: 'Segoe UI Symbol', 'Apple Symbols', 'Arial Unicode MS', 'Noto Sans Symbols', sans-serif; font-variant-emoji: text; font-weight: normal;">${actualIcon}&#xFE0E;</span>`;
    }
    return actualIcon;
};

// 五行映射表
const WUXING_MAP = {
    '甲': 'mu', '乙': 'mu', '寅': 'mu', '卯': 'mu',
    '丙': 'huo', '丁': 'huo', '巳': 'huo', '午': 'huo',
    '戊': 'tu', '己': 'tu', '辰': 'tu', '戌': 'tu', '丑': 'tu', '未': 'tu',
    '庚': 'jin', '辛': 'jin', '申': 'jin', '酉': 'jin',
    '壬': 'shui', '癸': 'shui', '亥': 'shui', '子': 'shui'
};

function getElClass(char) {
    return WUXING_MAP[char] ? `el-${WUXING_MAP[char]}` : '';
}

/**
 * Find nearest district/city in CHINA_GEO_DATA
 * Simple Euclidean distance search.
 * @param {number} lat 
 * @param {number} lon 
 * @returns {string} Name of the district or city
 */
function findNearestPlace(lat, lon) {
    let minDist = Infinity;
    let bestName = "";

    // Iterate Provinces
    for (const [provName, cities] of Object.entries(CHINA_GEO_DATA)) {
        // Iterate Cities
        for (const [cityName, districts] of Object.entries(cities)) {
            // Iterate Districts
            for (const [distName, coords] of Object.entries(districts)) {
                // coords is [lng, lat]
                const dLat = lat - coords[1];
                const dLon = lon - coords[0];
                const distSq = dLat*dLat + dLon*dLon;
                
                if (distSq < minDist) {
                    minDist = distSq;
                    // Prefer district name, if distinct from city, else use city
                    bestName = distName !== cityName ? distName : cityName;
                }
            }
        }
    }
    
    // If we found something reasonable (within China roughly), return it.
    // Otherwise return a generic text or empty if too far (optional check)
    return bestName || "未知地点";
}

/**
 * Unified UI Updater for GPS Status
 * @param {number} lat 
 * @param {number} lon 
 * @param {number|null} accuracy Null if manual mode
 * @param {string} type 'GPS' or 'MANUAL'
 * @param {string} manualName Optional name override for manual mode
 */
function updateGpsUI(lat, lon, accuracy, type, manualName = null) {
    if (!UI.gpsCoords || !UI.gpsAcc || !UI.gpsDot) return;

    // 提高显示精度到4位小数（约11米精度），避免四舍五入带来的误差感
    const latStr = lat.toFixed(4);
    const lonStr = lon.toFixed(4);
    
    // Update Dot Style
    if (type === 'GPS') {
        UI.gpsDot.className = 'gps-dot active';
        UI.gpsDot.title = "自动定位中";
    } else if (type === 'MANUAL') {
        UI.gpsDot.className = 'gps-dot manual'; // Amber color for manual
        UI.gpsDot.title = "手动定位模式";
    } else {
        UI.gpsDot.className = 'gps-dot'; // Off state
        UI.gpsDot.title = "定位关闭/失败";
    }

    // Display Coordinates
    UI.gpsCoords.innerText = `${lonStr}E,${latStr}N`;

    // Determine Location Name
    let displayLoc = manualName;
    if (!displayLoc) {
        // If no manual name provided, reverse geocode
        displayLoc = findNearestPlace(lat, lon);
    }
    
    // Update state to ensure features like Moon Calendar use the right name
    state.locationName = displayLoc;
    
    // Update Subtext (Name + Accuracy)
    if (type === 'GPS' && accuracy !== null) {
        UI.gpsAcc.innerText = `${displayLoc} ±${Math.round(accuracy)}m`;
    } else {
        // Manual mode or OFF, just show name
        UI.gpsAcc.innerText = displayLoc;
    }

    // Save to localStorage
    if (type === 'GPS' || type === 'MANUAL') {
        localStorage.setItem('lingshu_location', JSON.stringify({
            lat: lat,
            lon: lon,
            name: displayLoc
        }));
    }
}

// GPS 初始化
// Aspect calculation logic
function calculateAspects(planets, showMinorAspects = false) {
    const aspects = [];
    const targetAngles = [
        { name: 'conjunction', angle: 0, symbol: '☌' },
        { name: 'sextile', angle: 60, symbol: '⚹' },
        { name: 'square', angle: 90, symbol: '□' },
        { name: 'trine', angle: 120, symbol: '△' },
        { name: 'opposition', angle: 180, symbol: '☍' }
    ];
    
    if (showMinorAspects) {
        targetAngles.push(
            { name: 'semi-sextile', angle: 30, symbol: '⚺' },
            { name: 'quincunx', angle: 150, symbol: '⚻' }
        );
    }
    
    const moieties = {
        'Sun': 7.5,
        'Moon': 6.0,
        'Mercury': 3.5,
        'Venus': 3.5,
        'Mars': 3.5,
        'Jupiter': 4.5,
        'Saturn': 4.5,
        'Uranus': 2.5,
        'Neptune': 2.5,
        'Pluto': 2.5
    };
    const allowedPlanets = Object.keys(moieties);

    const tradPlanets = planets.filter(p => allowedPlanets.includes(p.nameEn));

    for (let i = 0; i < tradPlanets.length; i++) {
        for (let j = i + 1; j < tradPlanets.length; j++) {
            const p1 = tradPlanets[i];
            const p2 = tradPlanets[j];
            
            let pos_rel = p1.lon - p2.lon;
            while (pos_rel > 180) pos_rel -= 360;
            while (pos_rel < -180) pos_rel += 360;
            
            const dist = Math.abs(pos_rel);
            const maxOrb = moieties[p1.nameEn] + moieties[p2.nameEn];

            for (const aspectType of targetAngles) {
                const angle = aspectType.angle;
                if (Math.abs(dist - angle) <= maxOrb) {
                    const v_rel = p1.speed - p2.speed;
                    const exact_angle = (pos_rel >= 0) ? angle : -angle;
                    const err = pos_rel - exact_angle;
                    const isApplying = (err * v_rel < 0);
                    
                    aspects.push({
                        p1: p1,
                        p2: p2,
                        type: aspectType,
                        orb: Math.abs(err),
                        isApplying: isApplying
                    });
                }
            }
        }
    }
    aspects.sort((a, b) => {
        // Priority 1: isApplying (true first: 入, false second: 出)
        if (a.isApplying !== b.isApplying) {
            return a.isApplying ? -1 : 1;
        }
        
        // Priority 2: Planet name
        const p1Order = allowedPlanets.indexOf(a.p1.nameEn);
        const p2Order = allowedPlanets.indexOf(b.p1.nameEn);
        if (p1Order !== p2Order) return p1Order - p2Order;
        
        const p1SubOrder = allowedPlanets.indexOf(a.p2.nameEn);
        const p2SubOrder = allowedPlanets.indexOf(b.p2.nameEn);
        if (p1SubOrder !== p2SubOrder) return p1SubOrder - p2SubOrder;
        
        // Priority 3: Orb size
        return a.orb - b.orb;
    });
    return aspects;
}

async function fetchRadixData(date, lon, lat) {
    try {
        const data = await fetchAstroDetailsLocal(date, lat, lon);
        return data.chart;
    } catch (e) {
        console.error("Radix Fetch Error:", e);
        return null;
    }
}

function initGPS() {
    if ("geolocation" in navigator) {
        // 设置定位中状态
        if (UI.gpsDot) UI.gpsDot.className = 'gps-dot locating';
        
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                // 增加空值检查，防止 toFixed 报错
                if (typeof latitude === 'number') state.lat = latitude;
                if (typeof longitude === 'number') state.lon = longitude;
                
                // Update UI using helper
                updateGpsUI(state.lat, state.lon, accuracy, 'GPS');
                
                updateAll();
            },
            (err) => { 
                updateGpsUI(state.lat, state.lon, null, 'OFF', state.locationName);
            },
            { 
                enableHighAccuracy: true,
                timeout: 15000,      // 允许最多15秒获取真实卫星信号，而不是立即返回基站IP定位
                maximumAge: 0        // 强制不使用缓存的旧位置
            }
        );
    }
}

function createPillarHTML(pillar) {
    const ganClass = getElClass(pillar.gan);
    const zhiClass = getElClass(pillar.zhi);
    const nyWx = getWuXingFromNayin(pillar.nayin); 
    const nyMap = {金:'jin',木:'mu',水:'shui',火:'huo',土:'tu'};
    const nyClass = nyWx ? `el-${nyMap[nyWx]}` : '';

    return `
        <div class="pillar-item">
            <div class="gz-char ${ganClass}">${pillar.gan}</div>
            <div class="gz-char ${zhiClass}">${pillar.zhi}</div>
            <div class="nayin-sub ${nyClass}">${pillar.nayin}</div>
        </div>
    `;
}

// 格式化日期 MM/DD HH:mm (使用 zero-padding)
function formatTermDate(d) {
    if (!d) return '--/-- --:--';
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const dt = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${m}/${dt} ${hh}:${mm}`;
}

let lastVocFetchMinute = -1;

async function fetchVocData(targetDate) {
    if (!UI.vocBox) return;
    
    try {
        let rule = '10';
        if (UI.vocRuleRadios) {
            UI.vocRuleRadios.forEach(r => {
                if (r.checked) rule = r.value;
            });
        }
        
        const data = await fetchVocDataLocal(targetDate, rule);
        
        const formatTime = (isoStr) => {
            const d = new Date(isoStr);
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const dd = d.getDate().toString().padStart(2, '0');
            const hh = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${mm}/${dd} ${hh}:${min}`;
        };
        
        let nextAspect = data.timeline.find(e => e.jd > data.currentJd && e.type === 'aspect');
        let nextAspectStr = '';
        if (nextAspect) {
            const angleSymbols = { 0: '☌', 60: '⚹', 90: '□', 120: '△', 180: '☍' };
            const planetSymbols = {
                'Sun': '☉', 'Moon': '☽', 'Mercury': '☿', 'Venus': '♀', 'Mars': '♂', 
                'Jupiter': '♃', 'Saturn': '♄', 'Uranus': '♅', 'Neptune': '♆', 'Pluto': '♇',
                '太阳': '☉', '月亮': '☽', '水星': '☿', '金星': '♀', '火星': '♂',
                '木星': '♃', '土星': '♄', '天王星': '♅', '海王星': '♆', '冥王星': '♇',
                0: '☉', 1: '☽', 2: '☿', 3: '♀', 4: '♂', 5: '♃', 6: '♄', 7: '♅', 8: '♆', 9: '♇'
            };
            const pSymbol = planetSymbols[nextAspect.planet] || nextAspect.planet;
            const aSymbol = angleSymbols[nextAspect.angle] || nextAspect.angle;
            
            const nd = new Date(nextAspect.date);
            const ndd = nd.getDate().toString().padStart(2, '0');
            const nhh = nd.getHours().toString().padStart(2, '0');
            const nmin = nd.getMinutes().toString().padStart(2, '0');
            const moonSign = nextAspect.moonPos ? window.styleZodiacIcon(nextAspect.moonPos.icon) : '';
            
            nextAspectStr = `<span class="next-aspect-hint">${moonSign}☽${aSymbol}${pSymbol} ${ndd}-${nhh}:${nmin}</span>`;
        }

        if (data.isVoc) {
            UI.vocStatusIcon.innerText = '●';
            UI.vocStatusIcon.className = 'voc-active';
            UI.vocStatusText.innerHTML = `<span class="voc-main-text">VOC ${window.styleZodiacIcon(data.currentMoonPos.icon)}${data.currentMoonPos.str}</span>${nextAspectStr}`;
            UI.vocStatusText.className = 'voc-active-text';
        } else {
            UI.vocStatusIcon.innerText = '○';
            UI.vocStatusIcon.className = '';
            UI.vocStatusText.innerHTML = `<span class="voc-main-text">VOC ${window.styleZodiacIcon(data.currentMoonPos.icon)}${data.currentMoonPos.str}</span>${nextAspectStr}`;
            UI.vocStatusText.className = '';
        }
        
        const nowMs = targetDate.getTime();
        let vocStatusHtml = '';
        if (data.isVoc) {
            const endMs = new Date(data.ingressDate).getTime();
            const diffMins = Math.max(0, Math.floor((endMs - nowMs) / 60000));
            const h = Math.floor(diffMins / 60);
            const m = diffMins % 60;
            vocStatusHtml = `<div class="voc-row" style="margin-bottom: 12px; font-size: 0.95em;">
                <span class="voc-label" style="color: var(--text-sub);">空亡结束:</span>
                <span class="voc-val" style="color: #10b981; font-weight: 600;">${h}小时${m}分后 (${formatTime(data.ingressDate)})</span>
            </div>`;
        } else if (data.lastAspect) {
            const beginMs = new Date(data.lastAspect.date).getTime();
            const diffMins = Math.max(0, Math.floor((beginMs - nowMs) / 60000));
            const h = Math.floor(diffMins / 60);
            const m = diffMins % 60;
            vocStatusHtml = `<div class="voc-row" style="margin-bottom: 12px; font-size: 0.95em;">
                <span class="voc-label" style="color: var(--text-sub);">空亡开始:</span>
                <span class="voc-val" style="color: #eab308; font-weight: 600;">${h}小时${m}分后 (${formatTime(data.lastAspect.date)})</span>
            </div>`;
        }
        
        const planets = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星', '天王星', '海王星', '冥王星'];
        const aspectMap = {
            0: '合相(0°)',
            60: '六分相(60°)',
            90: '四分相(90°)',
            120: '三分相(120°)',
            180: '对分相(180°)',
            240: '三分相(120°)',
            270: '四分相(90°)',
            300: '六分相(60°)'
        };
        
        if (UI.vocAspectList) {
            let html = vocStatusHtml;
            if (data.timeline && data.timeline.length > 0) {
                data.timeline.forEach((item, idx) => {
                    const timeStr = formatTime(item.date);
                    const isVocStart = data.lastAspect && item.type === 'aspect' && item.date === data.lastAspect.date;
                    
                    if (item.type === 'aspect') {
                        const pName = planets[item.planet] || item.planet;
                        const aName = aspectMap[item.angle] || `${item.angle}°`;
                        
                        let textColor = 'var(--text-main)';
                        let extraText = '';
                        
                        if (isVocStart) {
                            textColor = '#eab308'; // 橙黄色，代表警告/开始
                            extraText = ' <span style="font-size:0.85em; opacity:0.9;">[VOC开始]</span>';
                        } else if (item.jd < data.currentJd) {
                            textColor = 'var(--text-sub)'; // 过去的相位变灰
                        }
                        
                        html += `<div class="voc-row" style="color: ${textColor}; padding: 4px 0; display:flex; justify-content:space-between;">
                            <span class="voc-label" style="color: inherit; font-family:'JetBrains Mono', serif;">${timeStr}</span>
                            <span class="voc-val">☽ ${window.styleZodiacIcon(item.moonPos.icon)} ${pName} ${aName}${extraText}</span>
                        </div>`;
                    } else if (item.type === 'ingress') {
                        let textColor = '#10b981'; // 绿色，代表安全/结束
                        if (item.jd < data.currentJd) textColor = 'var(--text-sub)';
                        
                        html += `<div class="voc-row" style="color: ${textColor}; padding: 4px 0; margin-top: 2px; display:flex; justify-content:space-between;">
                            <span class="voc-label" style="color: inherit; font-family:'JetBrains Mono', serif;">${timeStr}</span>
                            <span class="voc-val">☽ 进入 ${window.styleZodiacIcon(item.moonPos.icon)}${item.moonPos.sign} <span style="font-size:0.85em; opacity:0.9;">[VOC结束]</span></span>
                        </div>`;
                    }
                });
            } else {
                html += `<div class="voc-row"><span class="voc-label">无数据</span></div>`;
            }
            
            UI.vocAspectList.innerHTML = html;
        }
        
    } catch (e) {
        console.error("VOC Fetch Error:", e);
        if (UI.vocStatusText) UI.vocStatusText.innerText = '检测失败';
    }
}

function formatMoonCalTime(isoStr) {
    const d = new Date(isoStr);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}`;
}

function renderMoonCalendarList(events) {
    if (!UI.moonCalendarList) return;
    if (!events || events.length === 0) {
        UI.moonCalendarList.innerHTML = `<div class="moon-cal-row"><span class="moon-cal-time">--</span><span class="moon-cal-sign">无数据</span></div>`;
        return;
    }

    const aspectSymbolMap = {
        '合': '☌',
        '六合': '⚹',
        '刑': '□',
        '拱': '△',
        '对冲': '☍',
        '对分': '☍'
    };

    const signClassMap = {
        '白羊座': 'zodiac-aries',
        '金牛座': 'zodiac-taurus',
        '双子座': 'zodiac-gemini',
        '巨蟹座': 'zodiac-cancer',
        '狮子座': 'zodiac-leo',
        '处女座': 'zodiac-virgo',
        '天秤座': 'zodiac-libra',
        '天蝎座': 'zodiac-scorpio',
        '射手座': 'zodiac-sagittarius',
        '摩羯座': 'zodiac-capricorn',
        '水瓶座': 'zodiac-aquarius',
        '双鱼座': 'zodiac-pisces'
    };

    let insertedCurrent = false;
    const targetTime = state.manualDate.getTime();
    const rows = [];

    events.forEach(e => {
        const eventTime = new Date(e.date).getTime();
        let isCurrentLine = false;
        
        if (!insertedCurrent && eventTime > targetTime) {
            isCurrentLine = true;
            insertedCurrent = true;
        }

        const timeStr = formatMoonCalTime(e.date);
        const signText = `${window.styleZodiacIcon(e.sign)}${e.deg.toString().padStart(2, '0')}°${e.min.toString().padStart(2, '0')}'`;
        const signClass = signClassMap[e.sign] || '';
        let aspectText = '';
        if (e.type === 'aspect') {
            aspectText = `${e.aspect} ${e.planet}`;
        } else if (e.type === 'ingress') {
            aspectText = `进入 ${e.sign}`;
        }
        let vocTag = '';
        if (e.vocBegin) {
            vocTag = `<span class="moon-cal-voc begin">VOC开始</span>`;
        } else if (e.vocEnd) {
            vocTag = `<span class="moon-cal-voc end">VOC结束</span>`;
        }
        
        if (isCurrentLine) {
            rows.push(`
                <div class="moon-cal-current-time" title="当前选定时间">
                    <span class="crosshair-icon">▶</span>
                    <div class="crosshair-line"></div>
                </div>
            `);
        }

        rows.push(`
            <div class="moon-cal-row">
                <span class="moon-cal-time">${timeStr}</span>
                <span class="moon-cal-sign ${signClass}">${signText}</span>
                <span class="moon-cal-aspect">${aspectText}</span>
                ${vocTag}
            </div>
        `);
    });

    if (!insertedCurrent) {
        rows.push(`
            <div class="moon-cal-current-time" title="当前选定时间">
                <span class="crosshair-icon">▶</span>
                <div class="crosshair-line"></div>
            </div>
        `);
    }

    UI.moonCalendarList.innerHTML = rows.join('');

    // 自动滚动到当前时间指示线
    setTimeout(() => {
        if (UI.moonCalendarList) {
            const currentEl = UI.moonCalendarList.querySelector('.moon-cal-current-time');
            if (currentEl) {
                currentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, 50);
}

let lastAstroFetchMinute = -1;
let currentHoroscopeData = null;

async function fetchAstroDetails(targetDate) {
    if (!UI.astroDetailsBox) return;
    
    try {
        const data = await fetchAstroDetailsLocal(targetDate, state.lat, state.lon);
        
        currentHoroscopeData = data.chart;
        
        // 1. Planetary Hour
        if (UI.planetaryHourInfo) {
            const ph = data.planetaryHour;
            const period = ph.isDay ? '日间' : '夜间';
            UI.planetaryHourInfo.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>当前为 <strong>${period}第 ${ph.hourIndex} 时</strong></span>
                    <span style="color: #eab308; font-size: 1.1em;">主星: ${ph.name}</span>
                </div>
            `;
        }
        
        // 2. Retrogrades
        if (UI.retrogradeInfo) {
            const retro = data.retrogrades;
            if (retro.length === 0) {
                UI.retrogradeInfo.innerHTML = '<span style="color: #10b981;">当前无行星逆行</span>';
            } else {
                let html = '';
                retro.forEach(r => {
                    let endStr = '未知';
                    if (r.endDate) {
                        const d = new Date(r.endDate);
                        endStr = `${d.getMonth()+1}月${d.getDate()}日恢复顺行`;
                    }
                    html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #ef4444;">${r.name} 逆行</span>
                        <span style="color: var(--text-sub); font-size: 0.9em;">${endStr}</span>
                    </div>`;
                });
                UI.retrogradeInfo.innerHTML = html;
            }
        }

        // 3. Next Eclipse
        const eclipseInfoBox = document.getElementById('eclipse-info');
        if (eclipseInfoBox) {
            if (data.nextEclipse) {
                const e = data.nextEclipse;
                const formatTime = (d) => {
                    if (!d) return '--:--';
                    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                };
                const formatDate = (d) => {
                    if (!d) return '--/--';
                    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
                };
                
                eclipseInfoBox.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #eab308; font-weight: 600;">${e.name}</span>
                            <span style="color: var(--text-main);">${formatDate(e.maxDate)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: var(--text-sub);">
                            <span>起止时间</span>
                            <span>${formatTime(e.startDate)} - ${formatTime(e.endDate)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: var(--text-sub);">
                            <span>食甚时间</span>
                            <span>${formatTime(e.maxDate)}</span>
                        </div>
                    </div>
                `;
            } else {
                eclipseInfoBox.innerHTML = '<span style="color: var(--text-sub);">近期无本地可见日月食</span>';
            }
        }
        
    } catch (e) {
        console.error("Astro Details Fetch Error:", e);
        if (UI.planetaryHourInfo) UI.planetaryHourInfo.innerText = '加载失败';
        if (UI.retrogradeInfo) UI.retrogradeInfo.innerText = '加载失败';
    }
}

function updateAll() {
    let targetDate = state.manualDate;

    // VOC Fetch Throttling - Defer to prevent UI blocking
    const currentMinute = Math.floor(targetDate.getTime() / 60000);
    if (currentMinute !== lastVocFetchMinute) {
        lastVocFetchMinute = currentMinute;
        setTimeout(() => fetchVocData(targetDate), 10);
    }
    
    if (currentMinute !== lastAstroFetchMinute) {
        lastAstroFetchMinute = currentMinute;
        setTimeout(() => fetchAstroDetails(targetDate), 20);
    }

    // 0. 更新日历标题 (已移至 calendar.js 处理)
    
    // 1. 更新法定时间 UI
    if (UI.legalTime) {
        const pad = n => n.toString().padStart(2,'0');
        UI.legalTime.innerText = `${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}:${pad(targetDate.getSeconds())}`;
    }
    
    // 2. 更新模式图标 (已移除自动流逝，固定为静态模式)
    if (UI.modeDisplay) {
        UI.modeDisplay.innerText = "静态";
    }

    // 3. 核心计算
    if (typeof Astronomy !== 'undefined') {
        
        try {
            const jsOffset = targetDate.getTimezoneOffset();
            const tzOffset = -jsOffset; 

            const result = computeGanzhi({
                dateUTC: targetDate, 
                lat: state.lat, 
                lon: state.lon, 
                tzOffsetMinutes: tzOffset
            });

            // 显示真太阳时
            const { trueSolarClock, eotMinutes } = result.trueSolar;
            const pad = n => n.toString().padStart(2,'0');
            if(UI.tsTime) UI.tsTime.innerText = `${pad(trueSolarClock.getUTCHours())}:${pad(trueSolarClock.getUTCMinutes())}:${pad(trueSolarClock.getUTCSeconds())}`;
            
            // 计算 Delta
            const lonOffset = state.lon * 4;
            const deltaMins = lonOffset - tzOffset + eotMinutes;
            const deltaSign = deltaMins >= 0 ? '+' : '';
            
            if(UI.timeDelta) {
                // 确保 deltaMins 是数字
                const val = (typeof deltaMins === 'number') ? deltaMins.toFixed(1) : '--';
                UI.timeDelta.innerText = `Δ ${deltaSign}${val}m`;
            }

            // 显示四柱
            const { year, month, day, hour } = result.pillars;
            if(UI.gzBox) {
                UI.gzBox.innerHTML = `
                    ${createPillarHTML(year)}
                    ${createPillarHTML(month)}
                    ${createPillarHTML(day)}
                    ${createPillarHTML(hour)}
                `;
            }

            // 吉凶与宿值计算
            if (UI.luckXiu && UI.luckLunarXiu && UI.luckOmens) {
                // A. 计算三合宿 (日宿)
                const sanHeXiuName = calculateSanHeXiu(targetDate);
                UI.luckXiu.innerText = sanHeXiuName ? `${sanHeXiuName}宿` : '--';

                // B. 计算农历宿 (月表)
                const lunarData = getLunarDate(targetDate);
                const lunarXiuName = calculateLunarMansion(lunarData.lunarMonth, lunarData.lunarDay);
                UI.luckLunarXiu.innerText = lunarXiuName ? `${lunarXiuName}宿` : '--';
                
                // C. 计算吉凶 (灭没日) - 依据【三合宿】
                const lunarStatus = getLunarPhaseStatus(targetDate);
                const mieMoResult = checkMieMo(sanHeXiuName, lunarStatus);
                
                // 清空旧标签
                UI.luckOmens.innerHTML = '';
                
                // 如果有灭没凶兆
                if (mieMoResult) {
                    const tag = document.createElement('div');
                    tag.className = 'omen-tag bad';
                    tag.innerText = `⚠ ${mieMoResult}`; 
                    UI.luckOmens.appendChild(tag);
                }
            }

            // 节气更新 (New)
            if (UI.termPivot && UI.termInfo) {
                const termData = getSolarTermData(targetDate);
                if (termData) {
                    const { currentTerm, nextTermName, prevTermDate, nextTermDate, seasonElement, currentPentad } = termData;

                    // 更新 Pivot (当前节气)
                    // 拆分两个字以垂直排列
                    const cTerm = currentTerm || "--";
                    const char1 = cTerm.charAt(0);
                    const char2 = cTerm.charAt(1) || "";
                    UI.termPivot.innerHTML = `<span>${char1}</span><span>${char2}</span>`;
                    
                    // 应用五行季节颜色
                    UI.termPivot.className = 'hud-center-pivot'; 
                    UI.termPivot.classList.add(`season-${seasonElement}`);

                    // 更新 Term Info (上一节气 ~ 下一节气)
                    const prevStr = formatTermDate(prevTermDate);
                    const nextStr = formatTermDate(nextTermDate);
                    
                    UI.termInfo.innerHTML = `
                        <div class="ti-line"><span class="ti-name">${currentTerm}</span><span class="ti-time">${prevStr}</span></div>
                        <div class="ti-line"><span class="ti-name">${nextTermName}</span><span class="ti-time">${nextStr}</span></div>
                    `;

                    // 更新七十二候
                    if (UI.pentad) {
                        UI.pentad.innerText = currentPentad || '';
                    }
                }
            }
            
        } catch (e) { 
            console.error("排盘错误:", e); 
        }

        try {
            if (UI.ayanVal) {
                const astro = calculateAstroData(targetDate);
                // 增加判空
                if (astro && typeof astro.ayanamsa === 'number') {
                    UI.ayanVal.innerText = `Lahiri Ayan: ${astro.ayanamsa.toFixed(4)}°`;
                    UI.sunTrop.innerText = astro.sun.trop;
                    UI.sunSid.innerText  = astro.sun.sid;
                    UI.sunMans.innerText = astro.sun.mans;
                    UI.sunOv.innerHTML   = astro.sun.ov.overlap ? '<span class="ov-yes">是</span>' : '<span class="ov-no">否</span>';
                    UI.moonTrop.innerText = astro.moon.trop;
                    UI.moonSid.innerText  = astro.moon.sid;
                    UI.moonMans.innerText = astro.moon.mans;
                    UI.moonOv.innerHTML   = astro.moon.ov.overlap ? '<span class="ov-yes">是</span>' : '<span class="ov-no">否</span>';
                }
            }
        } catch (e) {
            console.error("天文数据错误:", e);
        }
    }

    // 4. 通知日历刷新 (传入坐标以计算 Topocentric 角距)
    updateCalendarView(targetDate, state.lat, state.lon);
}

// Controls
function addTime(sign) {
    const val = UI.stepSel.value;
    const unit = val.slice(-1);
    const amount = parseInt(val.slice(0, -1)) * sign;
    let base = new Date(state.manualDate);
    
    if (unit === 'm') base.setMinutes(base.getMinutes() + amount);
    if (unit === 'h') base.setHours(base.getHours() + amount);
    if (unit === 'd') base.setDate(base.getDate() + amount);
    if (unit === 'M') base.setMonth(base.getMonth() + amount);
    if (unit === 'y') base.setFullYear(base.getFullYear() + amount);
    
    state.manualDate = base; 
    state.mode = 'MANUAL'; 
    updateAll();
}

function resetNow() { 
    state.manualDate = new Date();
    state.mode = 'MANUAL'; 
    // Re-trigger GPS init to refresh active status
    initGPS();
    updateAll(); 
}

function getStdToSolar(stdIsoStr, lon) {
    if (!stdIsoStr) return "";
    const stdDate = new Date(stdIsoStr);
    if (isNaN(stdDate.getTime())) return "";
    const tzOffsetMinutes = -stdDate.getTimezoneOffset();
    const { trueSolarClock } = toTrueSolarClockDate({ dateUTC: stdDate, lon, tzOffsetMinutes });
    const pad = n => n.toString().padStart(2, '0');
    return `${trueSolarClock.getUTCFullYear()}-${pad(trueSolarClock.getUTCMonth()+1)}-${pad(trueSolarClock.getUTCDate())}T${pad(trueSolarClock.getUTCHours())}:${pad(trueSolarClock.getUTCMinutes())}:${pad(trueSolarClock.getUTCSeconds())}`;
}

function getSolarToStd(solarIsoStr, lon) {
    if (!solarIsoStr) return "";
    const parts = solarIsoStr.split(/\D/);
    if(parts.length < 5) return "";
    const y = parseInt(parts[0]), m = parseInt(parts[1])-1, d = parseInt(parts[2]), h = parseInt(parts[3]), min = parseInt(parts[4]);
    const sec = parts.length > 5 && parts[5] ? parseInt(parts[5]) : 0;
    const targetTrueSolarMs = Date.UTC(y, m, d, h, min, sec);
    
    let stdDate = new Date(y, m, d, h, min, sec);
    for(let i=0; i<3; i++) {
        const tzOffsetMinutes = -stdDate.getTimezoneOffset();
        const { trueSolarClock } = toTrueSolarClockDate({ dateUTC: stdDate, lon, tzOffsetMinutes });
        const errorMs = trueSolarClock.getTime() - targetTrueSolarMs;
        stdDate = new Date(stdDate.getTime() - errorMs);
    }
    const localIso = new Date(stdDate.getTime() - (stdDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 19);
    return localIso;
}

function saveSettings() {
    const tVal = UI.inputTime.value;
    const latVal = parseFloat(UI.inputLat.value);
    const lonVal = parseFloat(UI.inputLon.value);
    
    if (tVal) { state.manualDate = new Date(tVal); state.mode = 'MANUAL'; }
    if (!isNaN(latVal)) state.lat = latVal;
    if (!isNaN(lonVal)) state.lon = lonVal;
    
    // Determine Location Name
    let manualLocationName = null;
    const prov = UI.selProv.value;
    const city = UI.selCity.value;
    const dist = UI.selDist.value;
    
    // If user used selectors, use that name
    if (dist) manualLocationName = dist;
    else if (city) manualLocationName = city;
    
    // Update GPS Status UI to Manual Mode with specific name or nearest guess
    updateGpsUI(state.lat, state.lon, null, 'MANUAL', manualLocationName);

    UI.modal.classList.add('hidden'); 
    updateAll();
}

// --- City Selector Logic (Updated to use static CHINA_GEO_DATA) ---

function initCitySelectors() {
    if (!UI.selProv || !UI.selCity || !UI.selDist) return;

    // 1. Populate Provinces
    // 假设 CHINA_GEO_DATA 的结构是 { "省名": { "市名": { "区名": [lng, lat] } } }
    const provinces = Object.keys(CHINA_GEO_DATA);
    UI.selProv.innerHTML = `<option value="">- 省/直辖市 -</option>` + 
        provinces.map(p => `<option value="${p}">${p}</option>`).join('');

    // Reset helpers
    const resetCity = () => UI.selCity.innerHTML = `<option value="">- 市 -</option>`;
    const resetDist = () => UI.selDist.innerHTML = `<option value="">- 区/县 -</option>`;

    // Event: Province Change
    UI.selProv.addEventListener('change', (e) => {
        const prov = e.target.value;
        resetCity();
        resetDist();
        
        if (prov && CHINA_GEO_DATA[prov]) {
            const cities = Object.keys(CHINA_GEO_DATA[prov]);
            UI.selCity.innerHTML = `<option value="">- 市 -</option>` + 
                cities.map(c => `<option value="${c}">${c}</option>`).join('');
        }
    });

    // Event: City Change
    UI.selCity.addEventListener('change', (e) => {
        const prov = UI.selProv.value;
        const city = e.target.value;
        resetDist();

        if (prov && city && CHINA_GEO_DATA[prov] && CHINA_GEO_DATA[prov][city]) {
            const dists = Object.keys(CHINA_GEO_DATA[prov][city]);
            UI.selDist.innerHTML = `<option value="">- 区/县 -</option>` + 
                dists.map(d => `<option value="${d}">${d}</option>`).join('');
        }
    });

    // Event: District Change -> Set Lat/Lon
    UI.selDist.addEventListener('change', (e) => {
        const prov = UI.selProv.value;
        const city = UI.selCity.value;
        const dist = e.target.value;

        if (prov && city && dist && CHINA_GEO_DATA[prov][city] && CHINA_GEO_DATA[prov][city][dist]) {
            const coords = CHINA_GEO_DATA[prov][city][dist]; // [lon, lat]
            if (Array.isArray(coords) && coords.length === 2) {
                UI.inputLon.value = coords[0];
                UI.inputLat.value = coords[1];
                if (UI.inputLon) UI.inputLon.dispatchEvent(new Event('input'));
            }
        }
    });
}

// --- 九宫飞星逻辑 ---
// 存储多层飞星数据，每层是一个长为9的数组
let flyLayers = [];

function renderJiugong() {
    if (!UI.jiugongGrid) return;
    
    const startPalace = parseInt(UI.jgStartPalace.value);
    const startNum = parseInt(UI.jgStartNum.value);
    const direction = parseInt(UI.jgDirection.value);
    
    // 洛书九宫飞星顺序
    const flyPath = [5, 6, 7, 8, 9, 1, 2, 3, 4];
    
    // 宫位对应的视觉网格索引 (0-8)
    const palaceToGrid = {
        4: 0, 9: 1, 2: 2,
        3: 3, 5: 4, 7: 5,
        8: 6, 1: 7, 6: 8
    };
    
    // 九星名称与颜色 (移除文字，只保留颜色)
    // 根据主题自适应调整颜色
    const isGoldTheme = document.body.classList.contains('gold-theme');
    
    const starInfo = {
        1: { color: isGoldTheme ? '#64748b' : '#e2e8f0' }, // 白
        2: { color: isGoldTheme ? '#1e293b' : '#64748b' }, // 黑
        3: { color: '#10b981' }, // 碧
        4: { color: '#22c55e' }, // 绿
        5: { color: '#f59e0b' }, // 黄
        6: { color: isGoldTheme ? '#64748b' : '#e2e8f0' }, // 白
        7: { color: '#ef4444' }, // 赤
        8: { color: isGoldTheme ? '#64748b' : '#e2e8f0' }, // 白
        9: { color: '#a855f7' }  // 紫
    };
    
    const startIndex = flyPath.indexOf(startPalace);
    const newLayer = new Array(9);
    
    for (let i = 0; i < 9; i++) {
        const currentPalace = flyPath[(startIndex + i) % 9];
        let currentNum = startNum + (i * direction);
        while (currentNum <= 0) currentNum += 9;
        while (currentNum > 9) currentNum -= 9;
        
        const gridIndex = palaceToGrid[currentPalace];
        newLayer[gridIndex] = currentNum;
    }
    
    // 添加到层级中，最多保留5层
    flyLayers.push(newLayer);
    if (flyLayers.length > 5) {
        flyLayers.shift(); // 移除最老的一层
    }
    
    drawJiugongGrid();
}

// 修改飞星按钮行为，右键/长按可以清空
if (UI.btnFlyStars) {
    // 监听逻辑已在 mountBazi 中添加，这里只需实现 drawJiugongGrid
}

function drawJiugongGrid() {
    if (!UI.jiugongGrid) return;
    UI.jiugongGrid.innerHTML = '';
    
    const isGoldTheme = document.body.classList.contains('gold-theme');
    const starInfo = {
        1: { color: isGoldTheme ? '#64748b' : '#e2e8f0' }, // 白
        2: { color: isGoldTheme ? '#1e293b' : '#64748b' }, // 黑
        3: { color: '#10b981' }, // 碧
        4: { color: '#22c55e' }, // 绿
        5: { color: '#f59e0b' }, // 黄
        6: { color: isGoldTheme ? '#64748b' : '#e2e8f0' }, // 白
        7: { color: '#ef4444' }, // 赤
        8: { color: isGoldTheme ? '#64748b' : '#e2e8f0' }, // 白
        9: { color: '#a855f7' }  // 紫
    };
    
    // 生成9个格子
    for (let gridIdx = 0; gridIdx < 9; gridIdx++) {
        const cell = document.createElement('div');
        cell.style.cssText = `
            background: var(--bg-card);
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-content: center;
            gap: 4px;
            padding: 4px;
            position: relative;
            overflow: hidden;
        `;
        
        // 渲染该格子内的所有层数字
        flyLayers.forEach((layer, layerIdx) => {
            const num = layer[gridIdx];
            const info = starInfo[num];
            const numEl = document.createElement('div');
            
            // 动态调整字体大小：层数越多，字越小
            const fontSize = flyLayers.length <= 1 ? '2.5em' : 
                             flyLayers.length <= 2 ? '1.8em' : 
                             flyLayers.length <= 4 ? '1.4em' : '1.2em';
                             
            // 根据主题和数字优化1、6、8白星的颜色，避免金色主题下不显眼
            let finalColor = info.color;
            if (isGoldTheme && [1, 6, 8].includes(num)) {
                finalColor = '#52525b'; // 在金色主题下，使用更深的灰偏蓝色
            }
                             
            numEl.style.cssText = `
                font-size: ${fontSize};
                font-weight: bold;
                color: ${finalColor};
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            
            // 第一个飞布（最底层的盘）在背景放个极大的数字当底色水印（可选），这里我们选择简单并排
            numEl.innerText = num;
            cell.appendChild(numEl);
        });
        
        UI.jiugongGrid.appendChild(cell);
    }
}

function renderAstroChart() {
    const chartContainer = document.getElementById('astro-chart-container');
    if (!chartContainer || !currentHoroscopeData) return;

    chartContainer.innerHTML = '';
    try {
        const showOuter = document.getElementById('chart-show-outer')?.checked ?? false;
        const showMinorAspects = document.getElementById('chart-show-minor-aspects')?.checked ?? false;
        const outerPlanets = ['Uranus', 'Neptune', 'Pluto'];

        const radixData = {
            planets: {},
            cusps: currentHoroscopeData.houses.map(h => h.lon)
        };
        currentHoroscopeData.planets.forEach(p => {
            if (showOuter || !outerPlanets.includes(p.nameEn)) {
                radixData.planets[p.nameEn] = [p.lon];
            }
        });
        
        const aspects = calculateAspects(currentHoroscopeData.planets.filter(p => showOuter || !outerPlanets.includes(p.nameEn)), showMinorAspects);
        
        // 获取容器宽度
        const size = chartContainer.clientWidth || 500;
        const isMobile = size < 500;
        
        let addedZodiacs = [];
        
        const chart = new Chart('astro-chart-container', size, size, {
            SYMBOL_SCALE: isMobile ? 0.5 : 0.6,
            INNER_CIRCLE_RADIUS_RATIO: 12,
            INDOOR_CIRCLE_RADIUS_RATIO: 2.8,
            MARGIN: isMobile ? 40 : 50,
            COLOR_BACKGROUND: "transparent",
            SHOW_ASPECTS: true,
            ASPECT_ORBS: { 'conjunction': 10, 'sextile': 6, 'square': 6, 'trine': 8, 'opposition': 10 },
            CUSTOM_SYMBOL_FN: function(name, x, y, context) {
                  addedZodiacs.push({ name, x, y });
                  const customNames = { 'Vertex': 'Vx', 'Pars Fortuna': '⊗', 'SNode': '☋' };
                  if (customNames[name]) {
                      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                      const scale = context.settings.SYMBOL_SCALE;
                      g.setAttribute("transform", `translate(${x}, ${y}) scale(${scale})`);
                      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                      text.setAttribute("x", "0");
                      text.setAttribute("y", "0");
                      text.setAttribute("font-size", "14");
                      text.setAttribute("fill", "#000");
                      text.setAttribute("font-family", "sans-serif");
                      text.setAttribute("text-anchor", "middle");
                      text.setAttribute("dominant-baseline", "central");
                      text.classList.add("custom-keep-text");
                      text.textContent = customNames[name];
                      g.appendChild(text);
                      return g;
                  }
                  return null;
              }
          });

          // Draw the base chart
          let transitDataForZodiac = window._transitDataTemp;
          let radixChartInstance = null;

          if (state.radixData) {
              const transitData = {
                  planets: {},
                  cusps: state.radixData.houses.map(h => h.lon)
              };
              transitDataForZodiac = transitData;
              state.radixData.planets.forEach(p => {
                  if (showOuter || !outerPlanets.includes(p.nameEn)) {
                      transitData.planets[p.nameEn] = [p.lon];
                  }
              });

              radixChartInstance = chart.radix(transitData);
              radixChartInstance.transit(radixData);
              
              const astroChartAspects = aspects.map((a, idx) => {
                  const uniqueColor = '#' + idx.toString(16).padStart(6, '0');
                  a._uniqueColor = uniqueColor;
                  return {
                      aspect: {
                          name: a.type.name,
                          degree: a.type.angle,
                          color: uniqueColor
                      },
                      point: { name: a.p1.nameEn, position: a.p1.lon },
                      toPoint: { name: a.p2.nameEn, position: a.p2.lon },
                      precision: a.orb
                  };
              });
              radixChartInstance.aspects(astroChartAspects);
          } else {
              const astroChartAspects = aspects.map((a, idx) => {
                  const uniqueColor = '#' + idx.toString(16).padStart(6, '0');
                  a._uniqueColor = uniqueColor;
                  return {
                      aspect: {
                          name: a.type.name,
                          degree: a.type.angle,
                          color: uniqueColor
                      },
                      point: { name: a.p1.nameEn, position: a.p1.lon },
                      toPoint: { name: a.p2.nameEn, position: a.p2.lon },
                      precision: a.orb
                  };
              });
              chart.radix(radixData).aspects(astroChartAspects);
          }
          
          // Make transitDataForZodiac available globally to the timeout block
          window._transitDataTemp = transitDataForZodiac;

          setTimeout(() => {
              try {
                  const svg = chartContainer.querySelector('svg');
                  if (svg) {
                      // Remove native labels
                  }

                  // 1. Astrochart ring and cusp fixes
                  if (svg) {
                      const radius = size / 2 * 0.8;
                      // 稍微收缩 outerRadius，让分宫线止步于星座圆环的内边缘
                      const outerRadius = radius - (radius / 7);
                      const innerRadius = radius / 2.8;

                      // 精确计算最内圈真实的物理半径，专供分宫线的起点使用，防止由于内圈数字导致线悬空
                      const actualMargin = isMobile ? 40 : 50;
                      const lineStartRadius = ((size / 2) - actualMargin) / 2.8;
                      const redrawCusps = (chartLayerId, houses) => {
                          if (!houses) return;
                          
                          const layerGroup = chartContainer.querySelector(`g[id$="-${chartLayerId}-radix"]`) || svg.querySelector('g');
                          if (!layerGroup) return;

                          let cuspsGroup = chartContainer.querySelector(`#${chartLayerId}-cusps-custom`);
                          if (!cuspsGroup) {
                              cuspsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                              cuspsGroup.setAttribute('id', `${chartLayerId}-cusps-custom`);
                              layerGroup.appendChild(cuspsGroup);
                          } else {
                              cuspsGroup.innerHTML = '';
                          }

                          const shift = 360 - houses[0].lon;
                          const cx = size / 2;
                          const cy = size / 2;

                          

                          // Draw inner ring border
                          const houseRingOuter = innerRadius + 14 * (isMobile ? 0.5 : 0.6);
                          const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                          ring.setAttribute('cx', cx.toString());
                          ring.setAttribute('cy', cy.toString());
                          ring.setAttribute('r', houseRingOuter.toString());
                          ring.setAttribute('fill', 'none');
                          ring.setAttribute('stroke', '#333');
                          ring.setAttribute('stroke-width', '1');
                          cuspsGroup.appendChild(ring);

                          // Extend native house cusp lines to cross the planet track completely
                          const nativeCuspsGroup = layerGroup.querySelector(`g[id$="-cusps"]`);
                          if (nativeCuspsGroup) {
                              nativeCuspsGroup.querySelectorAll('line').forEach(line => {
                                  const x1 = parseFloat(line.getAttribute('x1'));
                                  const y1 = parseFloat(line.getAttribute('y1'));
                                  const x2 = parseFloat(line.getAttribute('x2'));
                                  const y2 = parseFloat(line.getAttribute('y2'));
                                  if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;

                                  const mx = (x1 + x2) / 2;
                                  const my = (y1 + y2) / 2;
                                  const vx = mx - cx;
                                  const vy = my - cy;
                                  const vDist = Math.sqrt(vx * vx + vy * vy);
                                  
                                  if (vDist > 0) {
                                      const dirX = vx / vDist;
                                      const dirY = vy / vDist;
                                      // The line should extend from the inner house ring to the outer zodiac ring inner edge
                                      line.setAttribute('x1', cx + dirX * lineStartRadius);
                                      line.setAttribute('y1', cy + dirY * lineStartRadius);
                                      line.setAttribute('x2', cx + dirX * outerRadius);
                                      line.setAttribute('y2', cy + dirY * outerRadius);
                                  }
                              });
                          }
                      };

                      const cleanupPointConnectorLines = (chartLayerId) => {
                          const pointsGroup = chartContainer.querySelector(`g[id$="-${chartLayerId}-planets"]`); 
                          if (!pointsGroup) return;

                          pointsGroup.querySelectorAll('line').forEach(line => {
                              const strokeWidth = parseFloat(line.getAttribute('stroke-width') || '0');
                              // 原本移除的是小连接线，现在恢复并美化它（变细、变淡）
                              if (strokeWidth <= (isMobile ? 0.5 : 0.6) * 0.55) {
                                  line.setAttribute('stroke', 'rgba(120, 120, 120, 0.93)'); // 中灰半透明，肉眼可见且不刺眼
                                  line.setAttribute('stroke-width', isMobile ? '0.5' : '0.6'); // 极细线 
                              }
                          });

                          pointsGroup.querySelectorAll('text:not(.custom-keep-text)').forEach(t => t.remove());

                          pointsGroup.querySelectorAll('[fill="#fff"], [fill="#ffffff"], [fill="none"][stroke="#fff"], [stroke="#ffffff"], circle[fill="white"]').forEach(el => {
                              if (el.tagName.toLowerCase() === 'circle') {
                                  el.setAttribute('r', (10 * (isMobile ? 0.5 : 0.6)).toString());
                              } else {
                                  el.setAttribute('stroke', 'transparent');
                              }
                          });
                      };

                      redrawCusps('radix', state.radixData?.houses ?? currentHoroscopeData?.houses);
                      if (state.radixData) redrawCusps('transit', currentHoroscopeData?.houses);
                      cleanupPointConnectorLines('radix');
                      cleanupPointConnectorLines('transit');
                  }
                  
                  // Zodiac overlays text logic
                  if (!svg) return;
                  const zGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                  zGroup.setAttribute("class", "zodiac-overlays");
                  const cx = size / 2;
                  const cy = size / 2;

                  let transitDataForZodiac = window._transitDataTemp;
                  addedZodiacs.forEach(p => {
                      let lon = null;
                      if (!transitDataForZodiac) {
                          lon = radixData.planets[p.name] ? radixData.planets[p.name][0] : null;
                      } else {
                          const dx = p.x - cx;
                          const dy = p.y - cy;
                          const dist = Math.sqrt(dx*dx + dy*dy);
                          if (dist > size * 0.35) {
                              lon = radixData.planets[p.name] ? radixData.planets[p.name][0] : null;
                          } else {
                              lon = transitDataForZodiac.planets[p.name] ? transitDataForZodiac.planets[p.name][0] : null;
                          }
                      }

                      if (lon !== null) {
                          const signIdx = Math.floor(lon / 30);
                          const degree = Math.floor(lon % 30);
                          const minute = Math.floor((lon % 1) * 60);

                          const signs = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];
                          const colors = ['#e53935', '#fbc02d', '#26c6da', '#42a5f5', '#e53935', '#fbc02d', '#26c6da', '#42a5f5', '#e53935', '#fbc02d', '#26c6da', '#42a5f5'];
                          
                          const dx = p.x - cx;
                          const dy = p.y - cy;
                          const dist = Math.sqrt(dx*dx + dy*dy);
                          const vx = dx / dist;
                          const vy = dy / dist;

                          const fSize = isMobile ? '8px' : '9px';
                          
                          const dDeg = isMobile ? 12 : 13;
                          const dSign = dDeg + (isMobile ? 12 : 13);
                          const dMin = dSign + (isMobile ? 12 : 13);

                          // Place from planet toward center.
                          // The sequence is: Star -> Degree -> Sign -> Minute
                          // Star is at dist.
                          const degR = dist - dDeg;
                          const signR = dist - dSign;
                          const minR = dist - dMin;

                          const rSign = signR; // just mapping correctly

                          const xMin = cx + vx * minR;
                          const yMin = cy + vy * minR;
                          const xSign = cx + vx * rSign;
                          const ySign = cy + vy * rSign;
                          const xDeg = cx + vx * degR;
                          const yDeg = cy + vy * degR;

                          const fStyle = `font-family: 'Segoe UI Symbol', 'Apple Symbols', 'Arial Unicode MS', sans-serif; font-weight: normal; font-size: ${fSize}; dominant-baseline: central; text-anchor: middle;`;
                          const strokeStyle = "stroke: #ffffff; stroke-width: 2.5px; stroke-linejoin: round; fill: none; paint-order: stroke fill;";
                          const fillStyle = "fill: #333333;";
                          const signFillStyle = `fill: ${colors[signIdx]};`;

                          const createText = (x, y, style, content) => {
                              const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
                              t.setAttribute("x", x);
                              t.setAttribute("y", y);
                              t.setAttribute("style", style);

                              let angle = Math.atan2(vy, vx) * 180 / Math.PI;
                              // Force readable direction
                              if (angle > 90) { angle -= 180; }
                              else if (angle < -90) { angle += 180; }
                              t.setAttribute("transform", "rotate(" + angle + ", " + x + ", " + y + ")");
                              t.innerHTML = content;
                              return t;
                          };

                          zGroup.appendChild(createText(xMin, yMin, fStyle + strokeStyle, minute + "'"));
                          zGroup.appendChild(createText(xSign, ySign, fStyle + strokeStyle, signs[signIdx]));
                          zGroup.appendChild(createText(xDeg, yDeg, fStyle + strokeStyle, degree + "&deg;"));

                          zGroup.appendChild(createText(xMin, yMin, fStyle + fillStyle, minute + "'"));
                          zGroup.appendChild(createText(xSign, ySign, fStyle + signFillStyle, signs[signIdx]));
                          zGroup.appendChild(createText(xDeg, yDeg, fStyle + fillStyle, degree + "&deg;"));
                      }
                  });

                  svg.appendChild(zGroup);

                  // 处理相位线
                  aspects.forEach(a => {
                      if (!a._uniqueColor) return;
                      const line = svg.querySelector(`*[stroke="${a._uniqueColor}"]`);
                      if (line) {
                          const realColor = a.type.name === 'conjunction' ? 'transparent' :
                                            (a.type.name === 'square' || a.type.name === 'opposition' ? '#FF4500' : '#27AE60');
                          line.setAttribute('stroke', realColor);
                          if (!a.isApplying) {
                              line.setAttribute('stroke-dasharray', '4,4'); // 分离相位
                          }

                          if (realColor !== 'transparent' && a.type.symbol) {
                              let mx = 0, my = 0;
                              if (line.tagName.toLowerCase() === 'line') {
                                  mx = (parseFloat(line.getAttribute('x1')) + parseFloat(line.getAttribute('x2'))) / 2;
                                  my = (parseFloat(line.getAttribute('y1')) + parseFloat(line.getAttribute('y2'))) / 2;
                              } else if (line.tagName.toLowerCase() === 'path') {
                                  const d = line.getAttribute('d');
                                  const matches = d.match(/M\s*([-\d.]+)[,\s]+([-\d.]+)\s*L\s*([-\d.]+)[,\s]+([-\d.]+)/);
                                  if (matches) {
                                      mx = (parseFloat(matches[1]) + parseFloat(matches[3])) / 2;
                                      my = (parseFloat(matches[2]) + parseFloat(matches[4])) / 2;
                                  }
                              }

                              if (mx !== 0 && my !== 0) {
                                  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                                  text.setAttribute("x", mx);
                                  text.setAttribute("y", my);
                                  text.setAttribute("font-size", "12");
                                  text.setAttribute("fill", realColor);
                                  text.setAttribute("font-family", "'Segoe UI Symbol', 'Apple Symbols', 'Arial Unicode MS', sans-serif");
                                  text.setAttribute("text-anchor", "middle");
                                  text.setAttribute("dominant-baseline", "central");
                                  text.textContent = a.type.symbol;
                                  // Append to a higher layer or zGroup so it renders on top
                                  svg.appendChild(text);
                              }
                          }
                      }
                  });

              } catch(err) { console.error(err); }
          }, 50);

        // --- 缩放与拖拽功能 ---
        chartContainer.style.overflow = 'hidden';
        chartContainer.style.touchAction = 'none'; // 防止移动端原生滚动干扰

        let currentScale = isMobile ? 1.2 : 1.0; 
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let startX, startY;
        let initialDistance = 0;
        let initialScale = 1;

        // 由于 Astrochart 渲染可能稍微滞后，放在 setTimeout 中查找SVG
        setTimeout(() => {
            const svgElement = chartContainer.querySelector('svg');
            if (!svgElement) return;

            // 设置原点为左上角，便于 translate 计算
            svgElement.style.transformOrigin = '0 0';
            
            // 初始居中显示
            const centerOffset = (size - size * currentScale) / 2;
            translateX = centerOffset;
            translateY = centerOffset;

            const updateTransform = () => {
                svgElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentScale})`;
            };
            updateTransform();

            // 鼠标事件 (PC端)
            chartContainer.onmousedown = (e) => {
                if (e.button !== 0) return; // 仅响应左键
                isDragging = true;
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
                chartContainer.style.cursor = 'grabbing';
            };

            chartContainer.onmousemove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                translateX = e.clientX - startX;
                translateY = e.clientY - startY;
                updateTransform();
            };

            chartContainer.onmouseup = chartContainer.onmouseleave = () => {
                isDragging = false;
                chartContainer.style.cursor = 'grab';
            };

            // 滚轮缩放 (PC端)
            chartContainer.onwheel = (e) => {
                e.preventDefault();
                const zoomSensitivity = 0.002;
                const delta = e.deltaY * -zoomSensitivity;
                const prevScale = currentScale;
                currentScale = Math.min(Math.max(0.4, currentScale + delta), 4);
                
                const rect = chartContainer.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const ratio = currentScale / prevScale;
                translateX = mouseX - (mouseX - translateX) * ratio;
                translateY = mouseY - (mouseY - translateY) * ratio;

                updateTransform();
            };

            // 触摸事件 (移动端)
            chartContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX - translateX;
                    startY = e.touches[0].clientY - translateY;
                } else if (e.touches.length === 2) {
                    isDragging = false;
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialDistance = Math.sqrt(dx * dx + dy * dy);
                    initialScale = currentScale;
                }
            }, { passive: false });

            chartContainer.addEventListener('touchmove', (e) => {
                e.preventDefault(); // 防止滚动页面
                if (e.touches.length === 1 && isDragging) {
                    translateX = e.touches[0].clientX - startX;
                    translateY = e.touches[0].clientY - startY;
                    updateTransform();
                } else if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (initialDistance > 0) {
                        const scaleDiff = distance / initialDistance;
                        const prevScale = currentScale;
                        currentScale = Math.min(Math.max(0.4, initialScale * scaleDiff), 4);
                        
                        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                        const rect = chartContainer.getBoundingClientRect();
                        const mouseX = centerX - rect.left;
                        const mouseY = centerY - rect.top;
                        
                        const ratio = currentScale / prevScale;
                        translateX = mouseX - (mouseX - translateX) * ratio;
                        translateY = mouseY - (mouseY - translateY) * ratio;

                        updateTransform();
                    }
                }
            }, { passive: false });

            chartContainer.addEventListener('touchend', (e) => {
                if (e.touches.length < 2) {
                    if (e.touches.length === 1) {
                        isDragging = true;
                        startX = e.touches[0].clientX - translateX;
                        startY = e.touches[0].clientY - translateY;
                    } else {
                        isDragging = false;
                    }
                }
            });

            chartContainer.style.cursor = 'grab';
        }, 100);
        
    } catch (err) {
        console.error("AstroChart Error:", err);
        chartContainer.innerHTML = `<div style="color:red; padding:20px; font-size:12px;">星盘渲染失败: ${err.message}</div>`;
    }
}

export function mountBazi() {
    initGPS();
    initCitySelectors(); // Initialize selectors
    
    if(UI.btnPrev) UI.btnPrev.addEventListener('click', () => addTime(-1));
    if(UI.btnNext) UI.btnNext.addEventListener('click', () => addTime(1));
    if(UI.btnReset) UI.btnReset.addEventListener('click', resetNow);
    
    if(UI.btnSettings) UI.btnSettings.addEventListener('click', () => {
        const now = state.manualDate;
        const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 19);
        UI.inputTime.value = localIso;
        UI.inputLat.value = state.lat; 
        UI.inputLon.value = state.lon;
        
        if (UI.inputTimeSolar) {
            UI.inputTimeSolar.value = getStdToSolar(localIso, state.lon);
        }

        // Reset selectors on open (optional, or keep them stateful)
        UI.selProv.value = "";
        UI.selCity.innerHTML = `<option value="">- 市 -</option>`;
        UI.selDist.innerHTML = `<option value="">- 区/县 -</option>`;
        
        UI.modal.classList.remove('hidden');
    });

    // 真太阳时和标准时间双向绑定
    if (UI.inputTime && UI.inputTimeSolar && UI.inputLon) {
        UI.inputTime.addEventListener('input', () => {
            const lon = parseFloat(UI.inputLon.value) || state.lon;
            UI.inputTimeSolar.value = getStdToSolar(UI.inputTime.value, lon);
        });

        UI.inputTimeSolar.addEventListener('input', () => {
            const lon = parseFloat(UI.inputLon.value) || state.lon;
            UI.inputTime.value = getSolarToStd(UI.inputTimeSolar.value, lon);
        });

        UI.inputLon.addEventListener('input', () => {
            const lon = parseFloat(UI.inputLon.value) || state.lon;
            if (UI.inputTime.value) {
                UI.inputTimeSolar.value = getStdToSolar(UI.inputTime.value, lon);
            }
        });
    }

    // 九宫飞星相关事件
    if (UI.btnJiugong) {
        UI.btnJiugong.addEventListener('click', () => {
            if (UI.jiugongOverlay.classList.contains('hidden')) {
                UI.jiugongOverlay.classList.remove('hidden');
                UI.btnJiugong.classList.add('active'); // 可选：给按钮加个激活状态样式
                // 如果是第一次打开且没有飞星，自动飞一次
                if (flyLayers.length === 0) {
                    renderJiugong();
                }
            } else {
                UI.jiugongOverlay.classList.add('hidden');
                UI.btnJiugong.classList.remove('active');
            }
        });
    }
    if (UI.btnFlyStars) {
        UI.btnFlyStars.addEventListener('click', renderJiugong);
        // 添加清空飞星的功能 (长按或右键)
        UI.btnFlyStars.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            flyLayers = [];
            drawJiugongGrid();
        });
    }

    if(UI.gpsIndicator) UI.gpsIndicator.addEventListener('click', () => {
        const targetDate = state.manualDate;
        
        // 1. 标准时间
        const pad = n => n.toString().padStart(2,'0');
        const stdTime = `${targetDate.getFullYear()}-${pad(targetDate.getMonth()+1)}-${pad(targetDate.getDate())} ${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}:${pad(targetDate.getSeconds())}`;
        
        // 2. 真太阳时
        let tsTimeStr = '--:--:--';
        if (typeof Astronomy !== 'undefined') {
            try {
                const jsOffset = targetDate.getTimezoneOffset();
                const tzOffset = -jsOffset; 
                const result = computeGanzhi({
                    dateUTC: targetDate, 
                    lat: state.lat, 
                    lon: state.lon, 
                    tzOffsetMinutes: tzOffset
                });
                const { trueSolarClock } = result.trueSolar;
                tsTimeStr = `${pad(trueSolarClock.getUTCHours())}:${pad(trueSolarClock.getUTCMinutes())}:${pad(trueSolarClock.getUTCSeconds())}`;
            } catch (e) {
                console.error("计算真太阳时失败:", e);
            }
        }
        
        // 3. 经纬度
        const latStr = state.lat.toFixed(4);
        const lonStr = state.lon.toFixed(4);
        
        // 4. 罗盘朝向
        let dirStr = '--';
        if (UI.dir && UI.dir.innerText) {
            dirStr = UI.dir.innerText;
        }
        
        // 5. VOC 状态
        let vocStr = '未知';
        if (UI.vocStatusIcon) {
            if (UI.vocStatusIcon.classList.contains('voc-active')) {
                vocStr = '是';
            } else {
                vocStr = '否';
            }
        }
        
        const copyText = `标准时间: ${stdTime}\n真太阳时: ${tsTimeStr}\n经纬度: ${lonStr}E, ${latStr}N\n罗盘朝向: ${dirStr}\nVOC: ${vocStr}`;
        
        navigator.clipboard.writeText(copyText).then(() => {
            // 简单的 Toast 提示
            const toast = document.createElement('div');
            toast.innerText = '盘面信息已复制';
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.backgroundColor = 'rgba(0,0,0,0.8)';
            toast.style.color = 'white';
            toast.style.padding = '8px 16px';
            toast.style.borderRadius = '4px';
            toast.style.zIndex = '10000';
            toast.style.fontSize = '14px';
            document.body.appendChild(toast);
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 2000);
        }).catch(err => {
            console.error('复制失败:', err);
            alert('复制失败，请手动复制');
        });
    });
    
    if(UI.btnConfirm) UI.btnConfirm.addEventListener('click', saveSettings);
    if(UI.btnCancel) UI.btnCancel.addEventListener('click', () => UI.modal.classList.add('hidden'));

    if(UI.vocBox) {
        const header = UI.vocBox.querySelector('.voc-header');
        if (header) {
            header.addEventListener('click', () => {
                UI.vocDetails.classList.toggle('hidden');
                const arrow = header.querySelector('.voc-toggle-arrow');
                if (arrow) {
                    if (UI.vocDetails.classList.contains('hidden')) {
                        arrow.style.transform = '';
                    } else {
                        arrow.style.transform = 'rotate(180deg)';
                    }
                }
            });
        }
    }

    if(UI.astroDetailsBox) {
        const header = document.getElementById('astro-header');
        if (header) {
            header.addEventListener('click', () => {
                const details = document.getElementById('astro-details');
                if (details) {
                    details.classList.toggle('hidden');
                    const arrow = document.getElementById('astro-toggle-arrow');
                    if (arrow) {
                        if (details.classList.contains('hidden')) {
                            arrow.style.transform = '';
                        } else {
                            arrow.style.transform = 'rotate(180deg)';
                        }
                    }
                }
            });
        }
    }

    if (UI.vocRuleRadios) {
        UI.vocRuleRadios.forEach(r => {
            r.addEventListener('change', () => {
                const targetDate = state.manualDate;
                fetchVocData(targetDate);
            });
        });
    }

    if (UI.btnMoonCalendar && UI.moonCalendarModal && UI.moonCalendarList) {
        UI.btnMoonCalendar.addEventListener('click', async () => {
            try {
                let rule = '10';
                if (UI.vocRuleRadios) {
                    UI.vocRuleRadios.forEach(r => {
                        if (r.checked) rule = r.value;
                    });
                }
                const d = state.manualDate;
                const year = d.getFullYear();
                const month = d.getMonth();
                const data = await fetchMoonCalendarForMonth(year, month, state.lat, state.lon, rule);
                const lonStr = state.lon.toFixed(4);
                const latStr = state.lat.toFixed(4);
                const locName = state.locationName || '';
                if (UI.moonCalendarTitle) {
                    UI.moonCalendarTitle.textContent = `${lonStr}E/${latStr}N ${locName}`.trim();
                }
                renderMoonCalendarList(data);
                UI.moonCalendarModal.classList.remove('hidden');
            } catch (e) {
                console.error('Moon calendar fetch error:', e);
                if (UI.moonCalendarList) {
                    UI.moonCalendarList.innerHTML = `<div class="moon-cal-row"><span class="moon-cal-sign">加载失败</span></div>`;
                }
            }
        });
    }
    if (UI.btnCloseMoonCalendar && UI.moonCalendarModal) {
        UI.btnCloseMoonCalendar.addEventListener('click', () => {
            UI.moonCalendarModal.classList.add('hidden');
        });
    }

    // Add event listener for outer planets toggle
    const chartShowOuter = document.getElementById('chart-show-outer');
    if (chartShowOuter) {
        chartShowOuter.addEventListener('change', () => {
            if (currentHoroscopeData && UI.horoscopeModal && !UI.horoscopeModal.classList.contains('hidden')) {
                UI.btnViewHoroscope.click();
            }
        });
    }

    const chartShowMinorAspects = document.getElementById('chart-show-minor-aspects');
    if (chartShowMinorAspects) {
        chartShowMinorAspects.addEventListener('change', () => {
            if (currentHoroscopeData && UI.horoscopeModal && !UI.horoscopeModal.classList.contains('hidden')) {
                UI.btnViewHoroscope.click();
            }
        });
    }

    if (UI.btnViewHoroscope && UI.horoscopeModal) {
        UI.btnViewHoroscope.addEventListener('click', () => {
            if (currentHoroscopeData) {
                // Show modal first so we can calculate correct clientWidth
                UI.horoscopeModal.classList.remove('hidden');
                
                renderAstroChart();

                let html = '<div id="horoscope-data-grid" style="display: grid; gap: 8px; font-size: 0.85em;">';
                
                // Houses
                html += '<div class="data-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite);">宫位</h4>';
                currentHoroscopeData.houses.forEach((h, i) => {
                    let houseName = `第${i+1}宫`;
                    if (i === 0) houseName = 'ASC';
                    if (i === 3) houseName = 'IC';
                    if (i === 6) houseName = 'DSC';
                    if (i === 9) houseName = 'MC';
                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 6px 8px; font-size: 0.85em; background: rgba(150, 150, 150, 0.08); border: 1px solid var(--border-lite); border-radius: 6px;">
                        <span style="color: var(--text-sub);">${houseName}</span>
                        <span style="font-family: 'JetBrains Mono';">${window.styleZodiacIcon(h.icon)}${h.str}</span>
                    </div>`;
                });
                html += '</div>';
                
                // Planets
                const showOuter = document.getElementById('chart-show-outer')?.checked ?? false;
                const outerPlanets = ['Uranus', 'Neptune', 'Pluto'];
                const filteredPlanets = currentHoroscopeData.planets.filter(p => showOuter || !outerPlanets.includes(p.nameEn));

                html += '<div class="data-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite);">星体与虚点</h4>';
                filteredPlanets.forEach(p => {
                    let speedStr = '';
                    if (p.speed < 0) speedStr = '<span style="color:#ef4444;">[R]</span>';
                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 6px 8px; font-size: 0.85em; background: rgba(150, 150, 150, 0.08); border: 1px solid var(--border-lite); border-radius: 6px;">
                        <span style="color: var(--text-sub);">${p.name}</span>
                        <span style="font-family: 'JetBrains Mono';">${window.styleZodiacIcon(p.pos.icon)}${p.pos.str}${speedStr}</span>
                    </div>`;
                });
                html += '</div>';

                // 底部分两列：左侧相位面板，右侧行星速度面板
                html += `<div class="bottom-panels" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: start; margin-top: 8px;">`;

                // Aspects
                const showMinorAspects = document.getElementById('chart-show-minor-aspects')?.checked ?? false;
                const aspects = calculateAspects(filteredPlanets, showMinorAspects);
                const aspectNames = { 0: '合相', 30: '半六分', 60: '六分', 90: '四分', 120: '三分', 150: '梅花', 180: '对分' };
                const titleStr = showOuter ? '星盘相位(容许度)' : '七星相位(容许度)';
                html += `<div class="aspects-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite);">${titleStr}</h4>`;
                if (aspects.length === 0) {
                    html += '<div style="color: var(--text-sub); font-size: 0.85em;">无主要相位</div>';
                } else {
                    const planetSymbolsMap = {
                        '太阳': '☉', '月亮': '☽', '水星': '☿', '金星': '♀', '火星': '♂',
                        '木星': '♃', '土星': '♄', '天王星': '♅', '海王星': '♆', '冥王星': '♇',
                        '北交点': '☊', '莉莉丝': '⚸', '凯龙星': '⚷',
                        'Sun': '☉', 'Moon': '☽', 'Mercury': '☿', 'Venus': '♀', 'Mars': '♂', 
                        'Jupiter': '♃', 'Saturn': '♄', 'Uranus': '♅', 'Neptune': '♆', 'Pluto': '♇'
                    };
                    aspects.forEach(a => {
                        const icon = a.type.symbol || '';
                        const p1Sym = planetSymbolsMap[a.p1.name] || planetSymbolsMap[a.p1.nameEn] || a.p1.name;
                        const p2Sym = planetSymbolsMap[a.p2.name] || planetSymbolsMap[a.p2.nameEn] || a.p2.name;
                        const stateStr = a.isApplying ? '<span style="color:#3b82f6;">入</span>' : '<span style="color:#f59e0b;">出</span>';
                        html += `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; padding: 6px 8px; font-size: 0.85em; background: rgba(150, 150, 150, 0.08); border: 1px solid var(--border-lite); border-radius: 6px;">
                            <span style="color: var(--text-sub); white-space: nowrap; text-align: left; font-family: 'Segoe UI Symbol', 'Apple Symbols', 'Arial Unicode MS', sans-serif;">${p1Sym} <span style="margin: 0 4px; opacity: 0.8; font-size: 0.9em;">${icon}</span> ${p2Sym}</span>
                            <span style="font-family: 'JetBrains Mono'; white-space: nowrap;">${stateStr} ${a.orb.toFixed(1)}°</span>
                        </div>`;
                    });
                }
                html += '</div>';
                
                // 行星速度面板
                html += `<div class="speed-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite); padding-bottom: 4px;">行星速度</h4>`;
                const realPlanets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
                const speedSortedPlanets = [...filteredPlanets].filter(p => realPlanets.includes(p.nameEn)).sort((a, b) => Math.abs(b.speed) - Math.abs(a.speed));
                speedSortedPlanets.forEach(p => {
                    const speedStr = (p.speed >= 0 ? '+' : '') + p.speed.toFixed(3) + '°/d';
                    const colorSpeed = p.speed < 0 ? '#ef4444' : 'var(--text-sub)';
                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 6px 8px; font-size: 0.85em; background: rgba(150, 150, 150, 0.08); border: 1px solid var(--border-lite); border-radius: 6px;">
                        <span style="color: var(--text-sub);">${p.name}</span>
                        <span style="font-family: 'JetBrains Mono'; color: ${colorSpeed};">${speedStr}</span>
                    </div>`;
                });
                html += '</div>';

                html += '</div>'; // End grid
                
                html += '</div>';
                
                UI.horoscopeDataContainer.innerHTML = html;
            } else {
                alert('星盘数据尚未加载完成，请稍候');
            }
        });
    }

    if (UI.btnCloseHoroscope && UI.horoscopeModal) {
        UI.btnCloseHoroscope.addEventListener('click', () => {
            UI.horoscopeModal.classList.add('hidden');
        });
    }

    // Radix Settings Logic
    if (UI.btnToggleRadix) {
        UI.btnToggleRadix.addEventListener('click', () => {
            UI.radixSettingsPanel.classList.toggle('hidden');
        });
    }

    if (UI.btnApplyRadix) {
        UI.btnApplyRadix.addEventListener('click', async () => {
            const dateStr = UI.inputRadixDate.value;
            const timeStr = UI.inputRadixTime.value;
            if (!dateStr || !timeStr) {
                alert('请选择日期和时间');
                return;
            }
            const date = new Date(`${dateStr}T${timeStr}`);
            const lon = parseFloat(UI.inputRadixLon.value);
            const lat = parseFloat(UI.inputRadixLat.value);
            
            UI.btnApplyRadix.innerText = '加载中...';
            UI.btnApplyRadix.disabled = true;
            
            const data = await fetchRadixData(date, lon, lat);
            if (data) {
                state.radixData = data;
                alert('外圈数据已加载');
                // Re-render chart
                UI.btnViewHoroscope.click();
            } else {
                alert('加载失败');
            }
            
            UI.btnApplyRadix.innerText = '应用外圈';
            UI.btnApplyRadix.disabled = false;
        });
    }

    if (UI.btnClearRadix) {
        UI.btnClearRadix.addEventListener('click', () => {
            state.radixData = null;
            alert('外圈数据已清除');
            UI.btnViewHoroscope.click();
        });
    }

    setOnDateSelect((d) => {
        const ref = state.manualDate;
        state.manualDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), ref.getHours(), ref.getMinutes(), ref.getSeconds());
        state.mode = 'MANUAL'; 
        updateAll();
    });

    updateAll();
    console.log("Module: Lingshu Pro (Combined Logic) Mounted");
}