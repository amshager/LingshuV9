
/* js/modules/bazi.js */
import { computeGanzhi, getWuXingFromNayin } from './ganzhi.js';
import { updateCalendarView, setOnDateSelect, getLunarPhaseStatus } from './calendar.js';
import { calculateAstroData, fetchVocDataLocal, fetchAstroDetailsLocal } from './astrology.js';
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
function calculateAspects(planets) {
    const aspects = [];
    const targetAngles = [
        { name: 'conjunction', angle: 0, symbol: '☌' },
        { name: 'sextile', angle: 60, symbol: '⚹' },
        { name: 'square', angle: 90, symbol: '□' },
        { name: 'trine', angle: 120, symbol: '△' },
        { name: 'opposition', angle: 180, symbol: '☍' }
    ];
    const moieties = {
        'Sun': 7.5,
        'Moon': 6.0,
        'Mercury': 3.5,
        'Venus': 3.5,
        'Mars': 4.0,
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
    aspects.sort((a, b) => a.orb - b.orb);
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
        
        if (data.isVoc) {
            UI.vocStatusIcon.innerText = '●';
            UI.vocStatusIcon.className = 'voc-active';
            UI.vocStatusText.innerText = `月亮空亡中 ${data.currentMoonPos.icon}${data.currentMoonPos.str}`;
            UI.vocStatusText.className = 'voc-active-text';
        } else {
            UI.vocStatusIcon.innerText = '○';
            UI.vocStatusIcon.className = '';
            UI.vocStatusText.innerText = `月亮运行中 ${data.currentMoonPos.icon}${data.currentMoonPos.str}`;
            UI.vocStatusText.className = '';
        }
        
        const formatTime = (isoStr) => {
            const d = new Date(isoStr);
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const dd = d.getDate().toString().padStart(2, '0');
            const hh = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${mm}/${dd} ${hh}:${min}`;
        };
        
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
                        const pName = planets[item.planet] || '未知';
                        const aName = aspectMap[item.angle] || `${item.angle}°`;
                        
                        let textColor = 'var(--text-main)';
                        let extraText = '';
                        
                        if (isVocStart) {
                            textColor = '#eab308'; // 橙黄色，代表警告/开始
                            extraText = ' <span style="font-size:0.85em; opacity:0.9;">[VOC开始]</span>';
                        } else if (item.jd < data.currentJd) {
                            textColor = 'var(--text-sub)'; // 过去的相位变灰
                        }
                        
                        html += `<div class="voc-row" style="color: ${textColor}; padding: 4px 0;">
                            <span class="voc-label" style="color: inherit;">${timeStr}</span>
                            <span class="voc-val">☽ ${item.moonPos.icon} ${pName} ${aName}${extraText}</span>
                        </div>`;
                    } else if (item.type === 'ingress') {
                        let textColor = '#10b981'; // 绿色，代表安全/结束
                        if (item.jd < data.currentJd) textColor = 'var(--text-sub)';
                        
                        html += `<div class="voc-row" style="color: ${textColor}; padding: 4px 0; margin-top: 2px;">
                            <span class="voc-label" style="color: inherit;">${timeStr}</span>
                            <span class="voc-val">☽ 进入 ${item.moonPos.icon}${item.moonPos.sign} <span style="font-size:0.85em; opacity:0.9;">[VOC结束]</span></span>
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

    // VOC Fetch Throttling
    const currentMinute = Math.floor(targetDate.getTime() / 60000);
    if (currentMinute !== lastVocFetchMinute) {
        lastVocFetchMinute = currentMinute;
        fetchVocData(targetDate);
    }
    
    if (currentMinute !== lastAstroFetchMinute) {
        lastAstroFetchMinute = currentMinute;
        fetchAstroDetails(targetDate);
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
            }
        }
    });
}

function renderAstroChart() {
    const chartContainer = document.getElementById('astro-chart-container');
    if (!chartContainer || !currentHoroscopeData) return;

    chartContainer.innerHTML = '';
    try {
        const showOuter = document.getElementById('chart-show-outer')?.checked ?? true;
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
        
        const aspects = calculateAspects(currentHoroscopeData.planets.filter(p => showOuter || !outerPlanets.includes(p.nameEn)));
        
        // 获取容器宽度
        const size = chartContainer.clientWidth || 500;
        const isMobile = size < 500;
        
        const chart = new Chart('astro-chart-container', size, size, {
            SYMBOL_SCALE: isMobile ? 0.7 : 0.9,
            MARGIN: isMobile ? 40 : 50,
            COLOR_BACKGROUND: "#fff",
            SHOW_ASPECTS: true,
            ASPECT_ORBS: { 'conjunction': 10, 'sextile': 6, 'square': 6, 'trine': 8, 'opposition': 10 },
            CUSTOM_SYMBOL_FN: function(name, x, y, context) {
                if (name === 'Vertex') {
                    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    const scale = context.settings.SYMBOL_SCALE;
                    g.setAttribute("transform", `translate(${x}, ${y}) scale(${scale})`);
                    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    text.setAttribute("x", "0");
                    text.setAttribute("y", "0");
                    text.setAttribute("font-size", "14");
                    text.setAttribute("fill", "#000");
                    text.setAttribute("font-family", "sans-serif");
                    text.setAttribute("font-weight", "bold");
                    text.setAttribute("text-anchor", "middle");
                    text.setAttribute("dominant-baseline", "central");
                    text.textContent = "Vx";
                    g.appendChild(text);
                    return g;
                }
                return null;
            }
        });
        
        if (state.radixData) {
            // Dual chart (Transit vs Radix)
            const transitData = {
                planets: {},
                cusps: state.radixData.houses.map(h => h.lon)
            };
            state.radixData.planets.forEach(p => {
                if (showOuter || !outerPlanets.includes(p.nameEn)) {
                    transitData.planets[p.nameEn] = [p.lon];
                }
            });
            
            // In AstroChart, radix is inner, transit is outer
            // Let's make Radix (user set) inner, Current as outer.
            const radixChart = chart.radix(transitData);
            radixChart.transit(radixData);
            
            // 转换我们计算的古典相位格式给 AstroChart 绘制连线
            const astroChartAspects = aspects.map(a => ({
                aspect: {
                    name: a.type.name,
                    degree: a.type.angle,
                    color: a.type.name === 'conjunction' ? 'transparent' : 
                           (a.type.name === 'square' || a.type.name === 'opposition' ? '#FF4500' : '#27AE60')
                },
                point: { name: a.p1.nameEn, position: a.p1.lon },
                toPoint: { name: a.p2.nameEn, position: a.p2.lon },
                precision: a.orb
            }));
            radixChart.aspects(astroChartAspects);
        } else {
            // Single chart
            const astroChartAspects = aspects.map(a => ({
                aspect: {
                    name: a.type.name,
                    degree: a.type.angle,
                    color: a.type.name === 'conjunction' ? 'transparent' : 
                           (a.type.name === 'square' || a.type.name === 'opposition' ? '#FF4500' : '#27AE60')
                },
                point: { name: a.p1.nameEn, position: a.p1.lon },
                toPoint: { name: a.p2.nameEn, position: a.p2.lon },
                precision: a.orb
            }));
            chart.radix(radixData).aspects(astroChartAspects);
        }

        // 设置缩放逻辑
        const zoomSlider = document.getElementById('chart-zoom-slider');
        if (zoomSlider) {
            zoomSlider.value = 1; // 重置缩放
            zoomSlider.oninput = (e) => {
                const scale = parseFloat(e.target.value);
                const svg = chartContainer.querySelector('svg');
                if (svg) {
                    const oldWidth = parseFloat(svg.getAttribute('width'));
                    const newWidth = size * scale;
                    
                    // 直接改变 SVG 的宽高属性，浏览器会根据 viewBox 自动缩放内容
                    // 这样也能让外层容器的 overflow: auto 正常工作，出现滚动条
                    svg.setAttribute('width', newWidth);
                    svg.setAttribute('height', newWidth);
                    
                    // 调整滚动条位置以保持中心缩放
                    const scrollDiff = (newWidth - oldWidth) / 2;
                    chartContainer.scrollLeft += scrollDiff;
                    chartContainer.scrollTop += scrollDiff;
                }
            };
        }

        // 添加鼠标/触摸拖拽移动功能
        let isDragging = false;
        let startX, startY, scrollLeft, scrollTop;

        const startDrag = (e) => {
            isDragging = true;
            chartContainer.style.cursor = 'grabbing';
            const pageX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
            const pageY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
            startX = pageX - chartContainer.offsetLeft;
            startY = pageY - chartContainer.offsetTop;
            scrollLeft = chartContainer.scrollLeft;
            scrollTop = chartContainer.scrollTop;
        };

        const stopDrag = () => {
            isDragging = false;
            chartContainer.style.cursor = 'grab';
        };

        const doDrag = (e) => {
            if (!isDragging) return;
            if (e.cancelable) e.preventDefault(); // 防止滚动页面
            const pageX = e.type.includes('mouse') ? e.pageX : e.touches[0].pageX;
            const pageY = e.type.includes('mouse') ? e.pageY : e.touches[0].pageY;
            const x = pageX - chartContainer.offsetLeft;
            const y = pageY - chartContainer.offsetTop;
            const walkX = (x - startX) * 1.5; // 滚动速度
            const walkY = (y - startY) * 1.5;
            chartContainer.scrollLeft = scrollLeft - walkX;
            chartContainer.scrollTop = scrollTop - walkY;
        };

        chartContainer.style.cursor = 'grab';
        chartContainer.onmousedown = startDrag;
        chartContainer.onmouseleave = stopDrag;
        chartContainer.onmouseup = stopDrag;
        chartContainer.onmousemove = doDrag;
        
        chartContainer.ontouchstart = startDrag;
        chartContainer.ontouchend = stopDrag;
        chartContainer.ontouchcancel = stopDrag;
        chartContainer.ontouchmove = doDrag;
        
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
        const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        UI.inputTime.value = localIso;
        UI.inputLat.value = state.lat; 
        UI.inputLon.value = state.lon;
        // Reset selectors on open (optional, or keep them stateful)
        UI.selProv.value = "";
        UI.selCity.innerHTML = `<option value="">- 市 -</option>`;
        UI.selDist.innerHTML = `<option value="">- 区/县 -</option>`;
        
        UI.modal.classList.remove('hidden');
    });

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

    // Add event listener for outer planets toggle
    const chartShowOuter = document.getElementById('chart-show-outer');
    if (chartShowOuter) {
        chartShowOuter.addEventListener('change', () => {
            if (currentHoroscopeData && UI.horoscopeModal && !UI.horoscopeModal.classList.contains('hidden')) {
                UI.btnViewHoroscope.click();
            }
        });
    }

    if (UI.btnViewHoroscope && UI.horoscopeModal) {
        UI.btnViewHoroscope.addEventListener('click', () => {
            if (currentHoroscopeData) {
                renderAstroChart();

                let html = '<div id="horoscope-data-grid" style="display: grid; gap: 8px; font-size: 0.85em;">';
                
                // Houses
                html += '<div class="data-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite);">宫位</h4>';
                currentHoroscopeData.houses.forEach((h, i) => {
                    html += `<div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 0.85em;">
                        <span style="color: var(--text-sub);">第${i+1}宫</span>
                        <span style="font-family: 'JetBrains Mono';">${h.icon}${h.str}</span>
                    </div>`;
                });
                html += '</div>';
                
                // Planets
                const showOuter = document.getElementById('chart-show-outer')?.checked ?? true;
                const outerPlanets = ['Uranus', 'Neptune', 'Pluto'];
                const filteredPlanets = currentHoroscopeData.planets.filter(p => showOuter || !outerPlanets.includes(p.nameEn));

                html += '<div class="data-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite);">星体与虚点</h4>';
                filteredPlanets.forEach(p => {
                    let speedStr = '';
                    if (p.speed < 0) speedStr = '<span style="color:#ef4444;">[R]</span>';
                    html += `<div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 0.85em;">
                        <span style="color: var(--text-sub);">${p.name}</span>
                        <span style="font-family: 'JetBrains Mono';">${p.pos.icon}${p.pos.str}${speedStr}</span>
                    </div>`;
                });
                html += '</div>';

                // Aspects
                const aspects = calculateAspects(filteredPlanets);
                const aspectNames = { 0: '合相', 60: '六分', 90: '四分', 120: '三分', 180: '对分' };
                
                const titleStr = showOuter ? '主要相位 (容许度)' : '七星相位 (容许度)';
                html += `<div class="aspects-panel" style="background: var(--bg-panel); padding: 8px; border-radius: 4px;"><h4 style="margin: 0 0 8px 0; color: var(--text-sub); font-size: 0.9em; border-bottom: 1px solid var(--border-lite);">${titleStr}</h4>`;
                if (aspects.length === 0) {
                    html += '<div style="color: var(--text-sub); font-size: 0.85em;">无主要相位</div>';
                } else {
                    aspects.forEach(a => {
                        const icon = a.type.symbol || '';
                        const name = aspectNames[a.type.angle] || '';
                        const stateStr = a.isApplying ? '<span style="color:#3b82f6;">入</span>' : '<span style="color:#f59e0b;">出</span>';
                        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 0.85em;">
                            <span style="color: var(--text-sub);">${a.p1.name} ${icon} ${a.p2.name}</span>
                            <span style="font-family: 'JetBrains Mono';">${stateStr} ${a.orb.toFixed(1)}°</span>
                        </div>`;
                    });
                }
                html += '</div>';
                
                html += '</div>';
                
                UI.horoscopeDataContainer.innerHTML = html;
                UI.horoscopeModal.classList.remove('hidden');
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
    console.log("Module: Bazi Pro (Combined Logic) Mounted");
}
