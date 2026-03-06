/* js/modules/lunar.js */

// 常量定义
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const BJ_OFFSET_MS = 8 * HOUR; // 北京时间 = UTC + 8

// 缓存计算过的年份结构，key为年份数字
const lunarYearCache = new Map();

// ---------------------- 基础工具 ----------------------

function ensureAstronomy() {
    if (typeof Astronomy === 'undefined') {
        console.warn('Astronomy.js not loaded');
        return null;
    }
    return Astronomy;
}

function toAstroTime(A, dateUtc) {
    if (typeof A.MakeTime === 'function') return A.MakeTime(dateUtc);
    return dateUtc;
}

function astroTimeToDate(t) {
    if (t instanceof Date) return t;
    if (t && t.date instanceof Date) return t.date;
    return new Date(t);
}

// 北京时间 00:00 的 UTC 时间戳
function beijingMidnightUtcMs(dateUtc) {
    const bj = new Date(dateUtc.getTime() + BJ_OFFSET_MS);
    const y = bj.getUTCFullYear();
    const m = bj.getUTCMonth();
    const d = bj.getUTCDate();
    return Date.UTC(y, m, d, 0, 0, 0) - BJ_OFFSET_MS;
}

// ---------------------- 节气系统 (New) ----------------------

// 24节气表 (繁体)，从黄经 0° (春分) 开始
// 顺序：0=春分, 15=清明, ..., 315=立春, 330=雨水, 345=惊蛰
const SOLAR_TERMS = [
    "春分", "清明", "穀雨", "立夏", "小滿", "芒種",
    "夏至", "小暑", "大暑", "立秋", "處暑", "白露",
    "秋分", "寒露", "霜降", "立冬", "小雪", "大雪",
    "冬至", "小寒", "大寒", "立春", "雨水", "驚蟄"
];

// 七十二候表 (繁体)
// 对应 SOLAR_TERMS 的顺序，每个节气 3 候
const PENTADS = [
    ["玄鳥至", "雷乃發聲", "始電"], // 春分
    ["桐始華", "田鼠化為鴽", "虹始見"], // 清明
    ["萍始生", "鳴鳩拂其羽", "戴勝降于桑"], // 谷雨
    ["螻蟈鳴", "蚯蚓出", "王瓜生"], // 立夏
    ["苦菜秀", "靡草死", "麥秋至"], // 小满
    ["螳螂生", "鵙始鳴", "反舌無聲"], // 芒种
    ["鹿角解", "蜩始鳴", "半夏生"], // 夏至
    ["溫風至", "蟋蟀居壁", "鷹始摯"], // 小暑
    ["腐草為螢", "土潤溽暑", "大雨時行"], // 大暑
    ["涼風至", "白露降", "寒蟬鳴"], // 立秋
    ["鷹乃祭鳥", "天地始肅", "禾乃登"], // 处暑
    ["鴻雁來", "玄鳥歸", "群鳥養羞"], // 白露
    ["雷始收聲", "蟄蟲坯戶", "水始涸"], // 秋分
    ["鴻雁來賓", "雀入大水為蛤", "菊有黃華"], // 寒露
    ["豺乃祭獸", "草木黃落", "蟄蟲咸俯"], // 霜降
    ["水始冰", "地始凍", "雉入大水為蜃"], // 立冬
    ["虹藏不見", "天氣上升地氣下降", "閉塞而成冬"], // 小雪
    ["鶡鴠不鳴", "虎始交", "荔挺出"], // 大雪
    ["蚯蚓結", "麋角解", "水泉動"], // 冬至
    ["雁北鄉", "鵲始巢", "雉始雊"], // 小寒
    ["雞乳", "征鳥厲疾", "水澤腹堅"], // 大寒
    ["東風解凍", "蟄蟲始振", "魚上冰"], // 立春
    ["獺祭魚", "候雁北", "草木萌動"], // 雨水
    ["桃始華", "倉庚鳴", "鷹化為鳩"]  // 惊蛰
];

/**
 * 获取当前节气信息，以及上一节气和下一节气的时间点
 * @param {Date} dateUtc 当前UTC时间
 */
export function getSolarTermData(dateUtc) {
    const A = ensureAstronomy();
    if (!A) return null;

    // 1. 获取当前太阳黄经
    const sunPos = A.SunPosition(dateUtc);
    const lon = sunPos.elon; // 0~360

    // 2. 计算当前节气索引 (每15度一个节气)
    const normLon = (lon + 360) % 360;
    const termIndex = Math.floor(normLon / 15);
    
    // 当前节气名称
    const currentTerm = SOLAR_TERMS[termIndex];

    // 3. 计算上一节气 (开始) 时间
    const prevTargetDeg = termIndex * 15;
    const tCurrent = toAstroTime(A, dateUtc);
    
    const tSearchPrevStart = new Date(dateUtc.getTime() - 18 * DAY); 
    const tPrev = A.SearchSunLongitude(prevTargetDeg, toAstroTime(A, tSearchPrevStart), 20); 
    
    // 4. 计算下一节气 (结束/下个开始) 时间
    const nextTargetDeg = (prevTargetDeg + 15) % 360;
    const tNext = A.SearchSunLongitude(nextTargetDeg, tCurrent, 20);

    // 5. 判断季节五行颜色
    let seasonElement = 'wood'; 
    if (termIndex >= 3 && termIndex <= 8) seasonElement = 'fire';
    else if (termIndex >= 9 && termIndex <= 14) seasonElement = 'metal';
    else if (termIndex >= 15 && termIndex <= 20) seasonElement = 'water';

    // 6. 计算七十二候 (Pentad)
    // 每个节气15度，每候5度
    // 计算当前在节气内的度数偏移 (0~15)
    let offsetDeg = normLon - prevTargetDeg;
    if (offsetDeg < 0) offsetDeg += 360; // 修正跨越360度的情况 (如春分前)
    
    const pentadIndexLocal = Math.floor(offsetDeg / 5); // 0, 1, 2
    // 保护索引防止浮点误差导致为3
    const pIdx = Math.min(pentadIndexLocal, 2);
    
    const currentPentad = PENTADS[termIndex][pIdx];

    return {
        currentTerm: currentTerm,
        prevTermDate: astroTimeToDate(tPrev), // 当前节气的开始时间
        nextTermDate: astroTimeToDate(tNext), // 下一节气的开始时间
        nextTermName: SOLAR_TERMS[(termIndex + 1) % 24],
        seasonElement: seasonElement,
        currentPentad: currentPentad
    };
}

// ---------------------- 天文计算核心 (农历部分) ----------------------

// 寻找冬至 (270°)
function searchWinterSolstice(A, gregYear) {
    const start = new Date(Date.UTC(gregYear, 11, 15, 0, 0, 0));
    const t = A.SearchSunLongitude(270, toAstroTime(A, start), 40);
    return astroTimeToDate(t);
}

// 寻找下一个新月
function nextNewMoon(A, afterDateUtc) {
    const t = A.SearchMoonPhase(0, toAstroTime(A, afterDateUtc), 40);
    return astroTimeToDate(t);
}

// 寻找上一个新月
function prevNewMoon(A, beforeDateUtc) {
    let d0 = new Date(beforeDateUtc.getTime() - 45 * DAY);
    let nm = nextNewMoon(A, d0);
    let last = nm;
    for (let guard = 0; guard < 8; guard++) {
        if (nm.getTime() >= beforeDateUtc.getTime()) break;
        last = nm;
        nm = nextNewMoon(A, new Date(nm.getTime() + DAY));
    }
    return last;
}

// 生成两个时间点之间的所有新月
function buildNewMoonsBetween(A, startUtc, endUtc) {
    const arr = [];
    let nm = prevNewMoon(A, startUtc);
    arr.push(nm);
    for (let guard = 0; guard < 20; guard++) {
        nm = nextNewMoon(A, new Date(nm.getTime() + DAY));
        arr.push(nm);
        if (nm.getTime() > endUtc.getTime() + 35 * DAY) break;
    }
    return arr;
}

// 生成主气（中气）序列 targets
function principalTermTargetsFromWS() {
    const arr = [];
    let deg = 270;
    for (let i = 0; i < 13; i++) {
        arr.push(deg);
        deg = (deg + 30) % 360;
    }
    return arr;
}

// 计算中气时间点
function buildPrincipalTerms(A, ws0Utc, ws1Utc) {
    const targets = principalTermTargetsFromWS();
    const terms = [];
    let cursor = new Date(ws0Utc.getTime() - DAY);
    for (let i = 0; i < targets.length; i++) {
        const deg = targets[i];
        const t = A.SearchSunLongitude(deg, toAstroTime(A, cursor), 40);
        const d = astroTimeToDate(t);
        terms.push({ deg, dateUtc: d });
        cursor = new Date(d.getTime() + 6 * HOUR);
    }
    return terms;
}

function findMonthIndexByBJDayStarts(newMoonDayStartsUtcMs, timeUtc) {
    const t = beijingMidnightUtcMs(timeUtc);
    for (let i = 0; i < newMoonDayStartsUtcMs.length - 1; i++) {
        if (newMoonDayStartsUtcMs[i] <= t && t < newMoonDayStartsUtcMs[i + 1]) return i;
    }
    return -1;
}

function monthHasPrincipalTerm(monthStartUtc, monthEndUtc, principalTerms) {
    const a = beijingMidnightUtcMs(monthStartUtc);
    const b = beijingMidnightUtcMs(monthEndUtc);
    for (const pt of principalTerms) {
        const t = beijingMidnightUtcMs(pt.dateUtc);
        if (a <= t && t < b) return true;
    }
    return false;
}

// ---------------------- 核心逻辑封装 ----------------------

// 计算某一年（以冬至为界）的完整农历结构
function computeLunarYearStructure(A, wsYear) {
    // 1. 确定冬至时间 ws0 (该年) 和 ws1 (下一年)
    let ws0 = searchWinterSolstice(A, wsYear);
    // 确保年份对齐（searchWinterSolstice 只是在12月搜，为了保险起见）
    if (new Date(ws0.getTime() + BJ_OFFSET_MS).getUTCFullYear() !== wsYear) {
        // 极少情况，修正一下
    }
    let ws1 = searchWinterSolstice(A, wsYear + 1);

    // 2. 构建基础序列
    const newMoons = buildNewMoonsBetween(A, ws0, ws1);
    const newMoonDayStarts = newMoons.map(d => beijingMidnightUtcMs(d));
    const principalTerms = buildPrincipalTerms(A, ws0, ws1);

    // 3. 定位冬至所在的月索引
    const m11 = findMonthIndexByBJDayStarts(newMoonDayStarts, ws0);
    const m11next = findMonthIndexByBJDayStarts(newMoonDayStarts, ws1);

    if (m11 < 0 || m11next < 0) return null; // Error

    const monthCount = m11next - m11;
    const hasLeap = (monthCount === 13);
    let leapIndex = -1;

    // 4. 如有闰月，寻找无中气之月
    if (hasLeap) {
        for (let i = m11; i < m11next; i++) {
            const has = monthHasPrincipalTerm(newMoons[i], newMoons[i + 1], principalTerms);
            if (!has) {
                leapIndex = i;
                break;
            }
        }
    }

    // 5. 生成月份表
    const monthInfo = [];
    for (let i = m11; i < m11next; i++) {
        let monthNo, isLeap;
        if (i === m11) {
            monthNo = 11;
            isLeap = false;
        } else {
            const prev = monthInfo[monthInfo.length - 1];
            if (hasLeap && i === leapIndex) {
                monthNo = prev.monthNo;
                isLeap = true;
            } else {
                monthNo = (prev.monthNo % 12) + 1;
                isLeap = false;
            }
        }
        monthInfo.push({
            index: i,
            monthNo,
            isLeap,
            startUtc: newMoons[i],
            endUtc: newMoons[i + 1]
        });
    }

    return { newMoonDayStarts, monthInfo, m11, m11next };
}

// 获取某一天的农历信息
export function getLunarDate(dateObj) {
    const A = ensureAstronomy();
    if (!A) return { dayName: '', monthName: '', lunarYear: 0, lunarMonth: 0, lunarDay: 0, isLeap: false, daysInLunarMonth: 29 };

    const y = dateObj.getFullYear();
    const m = dateObj.getMonth();
    const d = dateObj.getDate();
    // 构造北京时间 12:00
    const inputUtc = new Date(Date.UTC(y, m, d, 12 - 8, 0, 0)); 
    const nextDayUtc = new Date(inputUtc.getTime() + DAY);

    // 1. 估算冬至年份 (输入时间的前一年或当年)
    const bjYear = y;
    let wsYear = bjYear; 
    
    // 我们先算 inputUtc 所在的冬至年
    let struct = lunarYearCache.get(wsYear);
    
    if (!struct) {
        struct = computeLunarYearStructure(A, wsYear);
        lunarYearCache.set(wsYear, struct);
    }
    
    const tInput = beijingMidnightUtcMs(inputUtc);
    const tStart = beijingMidnightUtcMs(struct.monthInfo[0].startUtc);
    
    if (tInput < tStart) {
        wsYear = wsYear - 1;
        if (!lunarYearCache.has(wsYear)) {
            lunarYearCache.set(wsYear, computeLunarYearStructure(A, wsYear));
        }
        struct = lunarYearCache.get(wsYear);
    } else {
        const lastMonth = struct.monthInfo[struct.monthInfo.length - 1];
        const tEnd = beijingMidnightUtcMs(lastMonth.endUtc);
        if (tInput >= tEnd) {
             wsYear = wsYear + 1;
             if (!lunarYearCache.has(wsYear)) {
                lunarYearCache.set(wsYear, computeLunarYearStructure(A, wsYear));
            }
            struct = lunarYearCache.get(wsYear);
        }
    }

    // 2. 在 struct 中查找月份
    const { newMoonDayStarts, monthInfo, m11 } = struct;
    const mi = findMonthIndexByBJDayStarts(newMoonDayStarts, inputUtc);
    const miNext = findMonthIndexByBJDayStarts(newMoonDayStarts, nextDayUtc); // 查明天在哪个月
    
    const localIdx = mi - m11;
    if (localIdx < 0 || localIdx >= monthInfo.length) {
        return { dayName: '错', monthName: '', isLeap: false, lunarDay: 0, daysInLunarMonth: 29 };
    }

    const mInfo = monthInfo[localIdx];
    
    // 3. 计算农历日
    const dStart = beijingMidnightUtcMs(mInfo.startUtc);
    const dEnd = beijingMidnightUtcMs(mInfo.endUtc);
    const lunarDay = Math.floor((tInput - dStart) / DAY) + 1;
    const daysInLunarMonth = Math.round((dEnd - dStart) / DAY);

    // 4. 农历年
    const m1 = monthInfo.find(x => x.monthNo === 1 && !x.isLeap);
    let lunarYearStr = wsYear;
    if (m1) {
        const bjY = new Date(m1.startUtc.getTime() + BJ_OFFSET_MS).getUTCFullYear();
        lunarYearStr = (tInput >= beijingMidnightUtcMs(m1.startUtc)) ? bjY : (bjY - 1);
    }

    // 5. 判定晦日：如果明天所在的月份索引与今天不同，说明明天是初一，今天就是晦
    // 也可以直接用 lunarDay === daysInLunarMonth
    const isLastDay = (lunarDay === daysInLunarMonth);

    return {
        lunarYear: lunarYearStr,
        lunarMonth: mInfo.monthNo,
        isLeap: mInfo.isLeap,
        lunarDay: lunarDay,
        daysInLunarMonth: daysInLunarMonth, // 导出该月总天数
        monthName: getMonthName(mInfo.monthNo, mInfo.isLeap),
        dayName: getDayName(lunarDay),
        isLastDay: isLastDay
    };
}

// ---------------------- 格式化工具 ----------------------

const CN_MONTHS = ['', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const CN_NUMS = ['初', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function getMonthName(m, isLeap) {
    return (isLeap ? '闰' : '') + CN_MONTHS[m];
}

export function getDayName(d) {
    if (d === 1) return '初一'; // 后续逻辑会替换为月名，但基础函数返回初一
    if (d === 10) return '初十';
    if (d === 20) return '二十';
    if (d === 30) return '三十';
    const prefix = d < 11 ? '初' : d < 20 ? '十' : '廿';
    const digit = d % 10;
    return prefix + (digit === 0 ? '' : CN_NUMS[digit]);
}

/**
 * 专门为日历格子显示的文本
 * 如果是初一，返回月名（如“七月”）；否则返回日名（如“初二”）。
 */
export function getLunarTextForGrid(lunarData) {
    if (lunarData.lunarDay === 1) {
        return lunarData.monthName;
    }
    return lunarData.dayName;
}