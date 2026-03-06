/* js/modules/calendar.js */
import { UI } from '../dom.js';
import { getLunarDate, getLunarTextForGrid } from './lunar.js';
import { calculateSanHeXiu, checkMieMo } from './luck.js';
import { ganzhiDayFromGregorianDate } from './ganzhi.js';
import { getYiCalendarDate } from './yiCalendar.js'; // 引入彝历模块
import { fetchEclipsesForMonth } from './astrology.js';

let onDateSelectCallback = null;

// 生成月相 SVG 路径
// forceFull: 强制绘制全圆 (用于望日，忽略具体时刻的缺角)
function getMoonSvgPath(phaseDeg, forceFull = false) {
    const size = 14; 
    const r = size / 2;
    const cx = size / 2;
    const cy = size / 2;
    
    // 如果强制全圆 (望日)
    if (forceFull) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--c-moon)" />`;
    }

    const normalized = phaseDeg % 360;
    const isWaxing = normalized < 180;
    
    let path = '';
    
    // 如果非常接近满月 (179-181)，视觉上直接给全圆
    if (normalized > 179 && normalized < 181) {
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--c-moon)" />`;
    }

    if (isWaxing) {
        // Waxing (0-180): Right side is lit.
        // 0 -> -1 (new), 90 -> 0 (half), 180 -> 1 (full)
        const f = (normalized - 90) / 90; 
        const curveX = cx - (f * r); 
        
        path = `M ${cx} 0 A ${r} ${r} 0 0 1 ${cx} ${size}`;
        path += ` Q ${curveX} ${cy} ${cx} 0 Z`;
        
    } else {
        // Waning (180-360): Left side is lit.
        // 180 -> 1 (full), 270 -> 0 (half), 360 -> -1 (new)
        const f = (270 - normalized) / 90; 
        const curveX = cx + (f * r);
        
        path = `M ${cx} 0 A ${r} ${r} 0 0 0 ${cx} ${size}`;
        path += ` Q ${curveX} ${cy} ${cx} 0 Z`;
    }
    
    return `<path d="${path}" fill="var(--c-moon)" stroke="none" />`;
}

// 寻找本月（视图范围）内精确的望日（满月）
function findWangDates(viewDate) {
    if (typeof Astronomy === 'undefined') return [];
    
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // 搜索范围：上个月25号到下个月5号，覆盖本月所有可能的满月
    const start = new Date(year, month, 1);
    const searchStart = new Date(start.getTime() - 10 * 86400000);
    const searchEnd = new Date(start.getTime() + 45 * 86400000);
    
    const wangDates = [];
    let t = Astronomy.MakeTime(searchStart);
    
    // 找满月 (180度)
    let nextFull = Astronomy.SearchMoonPhase(180, t, 60); 
    
    while(nextFull && nextFull.date <= searchEnd) {
        const bjTime = new Date(nextFull.date.getTime() + 8 * 3600 * 1000);
        wangDates.push(bjTime.toISOString().split('T')[0]);
        
        const nextStart = new Date(nextFull.date.getTime() + 20 * 86400000); // 跳过20天
        nextFull = Astronomy.SearchMoonPhase(180, Astronomy.MakeTime(nextStart), 30);
    }
    
    return wangDates;
}

// 公开此函数供 Luck 模块使用，判断某天是否为特定的月相日（朔望弦晦盈虚）
export function getLunarPhaseStatus(date) {
    if (typeof Astronomy === 'undefined') return { isShuo:false, isWang:false, isXian:false, isHui:false, isYing:false, isXu:false };

    const wangDatesStr = findWangDates(date); // 搜索该日期附近的望日
    const lunarData = getLunarDate(date);
    
    const dateStr = new Date(date.getTime() + 8*3600*1000).toISOString().split('T')[0];
    
    // 1. 望
    const isWang = wangDatesStr.includes(dateStr);
    
    // 2. 盈 (望 + 1, 望 + 2)
    let isYing = false;
    for (const wStr of wangDatesStr) {
        const wDay = new Date(wStr).getTime();
        const cDay = new Date(dateStr).getTime();
        const diffDays = Math.round((cDay - wDay) / 86400000);
        if (diffDays === 1 || diffDays === 2) {
            isYing = true;
            break;
        }
    }

    // 3. 虚 (晦前3天)
    const N = lunarData.daysInLunarMonth;
    const isXu = (lunarData.lunarDay >= N - 3) && (lunarData.lunarDay < N);

    // 4. 朔
    const isShuo = lunarData.lunarDay === 1;

    // 5. 晦
    const isHui = lunarData.isLastDay;

    // 6. 弦 (上弦7,8 下弦22,23)
    const isXian = [7, 8, 22, 23].includes(lunarData.lunarDay);

    return { isShuo, isWang, isXian, isHui, isYing, isXu };
}

function getGridMoonInfo(dateObj, lunarData, wangDatesStr) {
    if (typeof Astronomy === 'undefined') return { html: '' };
    
    const dateStr = new Date(dateObj.getTime() + 8*3600*1000).toISOString().split('T')[0];
    const isWang = wangDatesStr.includes(dateStr);
    
    let isYing = false;
    for (const wStr of wangDatesStr) {
        const wDay = new Date(wStr).getTime();
        const cDay = new Date(dateStr).getTime();
        const diffDays = Math.round((cDay - wDay) / 86400000);
        if (diffDays === 1 || diffDays === 2) {
            isYing = true;
            break;
        }
    }

    const N = lunarData.daysInLunarMonth;
    const isXu = (lunarData.lunarDay >= N - 3) && (lunarData.lunarDay < N);

    let label = '';
    let labelClass = '';
    
    if (isWang) {
        label = '望';
        labelClass = 'lbl-wang';
    } else if (lunarData.lunarDay === 1) {
        label = '朔';
        labelClass = 'lbl-shuo';
    } else if (lunarData.isLastDay) {
        label = '晦';
        labelClass = 'lbl-hui';
    } else if (lunarData.lunarDay === 7 || lunarData.lunarDay === 8) {
        label = '上弦';
        labelClass = 'lbl-xian';
    } else if (lunarData.lunarDay === 22 || lunarData.lunarDay === 23) {
        label = '下弦';
        labelClass = 'lbl-xian';
    } else if (isYing) {
        label = '盈';
        labelClass = 'lbl-ying';
    } else if (isXu) {
        label = '虚';
        labelClass = 'lbl-xu';
    }
    
    const phaseDeg = Astronomy.MoonPhase(dateObj); 
    const svgContent = getMoonSvgPath(phaseDeg, isWang);
    
    return {
        html: `
            ${label ? `<span class="moon-txt-small ${labelClass}">${label}</span>` : ''}
            <svg class="moon-icon-svg" viewBox="0 0 14 14">${svgContent}</svg>
        `
    };
}

let lastRenderedGridKey = '';

// date 参数：当前视图应该显示的月份参照，同时也是“选中”的日期
async function renderGrid(viewDate, lat = 0, lon = 0) {
    if (!UI.calGrid) return;
    
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const selectedDay = viewDate.getDate(); // 当前选中的天
    
    const gridKey = `${year}-${month}-${selectedDay}-${lat}-${lon}`;
    if (gridKey === lastRenderedGridKey) return;
    
    const firstDayObj = new Date(year, month, 1);
    const firstDayOfWeek = firstDayObj.getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const now = new Date();
    const isCurrentMonthReal = now.getFullYear() === year && now.getMonth() === month;
    const realToday = now.getDate();

    const viewLunar = getLunarDate(viewDate);
    const yiData = getYiCalendarDate(viewDate);

    if (UI.calTitleDate) {
        const mStr = (month + 1).toString().padStart(2, '0');
        const dStr = selectedDay.toString().padStart(2, '0');
        // 构造三历标题：公历 + 农历 + 彝历
        // 样式：字号统一，彝历为印章风格
        UI.calTitleDate.innerHTML = `${year}年${mStr}月${dStr}日 <span class="cal-title-sub">${viewLunar.monthName}</span> <span class="yi-title-stamp el-${yiData.wuxing}">${yiData.monthName}</span>`;
    }

    const wangDatesStr = findWangDates(viewDate);
    
    // 获取本月日月食数据
    let eclipses = [];
    try {
        eclipses = await fetchEclipsesForMonth(year, month, lat, lon);
    } catch (e) {
        console.warn("Error fetching eclipses for calendar grid:", e);
    }

    let html = '';
    
    for(let i=0; i<firstDayOfWeek; i++) {
        html += `<div class="c-day empty"></div>`;
    }
    
    for(let d=1; d<=daysInMonth; d++) {
        const cellDate = new Date(year, month, d, 12, 0, 0);
        
        // 1. 获取农历与月相
        const lunarData = getLunarDate(cellDate);
        const moonInfo = getGridMoonInfo(cellDate, lunarData, wangDatesStr);
        
        // 2. 预计算吉凶 (Grid Indicators)
        // 快速计算日支 (不跑完整的 Bazi 排盘，只算日)
        const dayGZ = ganzhiDayFromGregorianDate(year, month + 1, d);
        const xiuName = calculateSanHeXiu(cellDate, dayGZ.zhi);
        // 为了 grid 渲染速度，我们需要一个快速的 lunarStatus，复用 getGridMoonInfo 里的逻辑？
        // 其实 checkMieMo 需要具体的 isShuo/isWang 等状态。
        // getLunarPhaseStatus 函数开销稍大，但对于30天来说应该可以接受
        const lunarStatus = getLunarPhaseStatus(cellDate);
        const mieMoResult = checkMieMo(xiuName, lunarStatus);
        
        const blText = getLunarTextForGrid(lunarData);
        const isMonthStart = lunarData.lunarDay === 1;
        const blHtml = `<span style="${isMonthStart ? 'color:var(--gold-dim);font-weight:bold' : ''}">${blText}</span>`;

        const isSystemToday = isCurrentMonthReal && d === realToday;
        const isSelected = d === selectedDay; 
        
        let classes = 'c-day';
        if (isSystemToday) classes += ' today';
        if (isSelected) classes += ' selected';
        
        // 如果有灭没凶兆，添加标记 HTML
        let tlHtml = '';
        if (mieMoResult) {
            tlHtml = `<div class="omen-marker" title="${mieMoResult}"></div>`;
        }
        
        // 检查是否有日月食
        const cellDateStr = new Date(cellDate.getTime() + 8*3600*1000).toISOString().split('T')[0];
        const dayEclipses = eclipses.filter(e => e.dateStr === cellDateStr);
        let brHtml = '';
        if (dayEclipses.length > 0) {
            const eclipseTitles = dayEclipses.map(e => `${e.name} (${e.startDate.toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit'})} - ${e.endDate.toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit'})})`).join('&#10;');
            brHtml = `<div class="eclipse-marker" title="${eclipseTitles}"></div>`;
        }

        html += `
        <div class="${classes}" data-day="${d}" data-year="${year}" data-month="${month}">
            <div class="c-corner tl">${tlHtml}</div>
            <div class="c-corner tr">${moonInfo.html}</div>
            <div class="c-center">${d}</div>
            <div class="c-corner bl">${blHtml}</div>
            <div class="c-corner br">${brHtml}</div>
        </div>`;
    }
    
    UI.calGrid.innerHTML = html;
    lastRenderedGridKey = gridKey;
}

function updateAstronomyData(date, lat, lon) {
    if (typeof Astronomy === 'undefined' || !UI.moonPhase) return;
    
    // 安全检查 date
    if (!(date instanceof Date) || isNaN(date.getTime())) return;

    // 获取 Body 枚举
    const Body = Astronomy.Body;

    // 1. 照明度
    const illumInfo = Astronomy.Illumination(Body.Moon, date);
    const illum = (illumInfo && typeof illumInfo.phase_fraction === 'number') 
        ? illumInfo.phase_fraction * 100 
        : 0;
    
    // 2. 月相角 (0-360) 用于文字描述
    const phase = Astronomy.MoonPhase(date);
    
    // 3. 真实视距离 (Topocentric Angular Separation)
    try {
        const t = Astronomy.MakeTime(date);
        
        const observer = new Astronomy.Observer(lat || 0, lon || 0, 0);

        const eqSun = Astronomy.Equator(Body.Sun, t, observer, true, true);
        const eqMoon = Astronomy.Equator(Body.Moon, t, observer, true, true);
        
        const toRad = Math.PI / 180;
        
        const ra1 = eqSun.ra * 15 * toRad; 
        const dec1 = eqSun.dec * toRad;   
        
        const ra2 = eqMoon.ra * 15 * toRad;
        const dec2 = eqMoon.dec * toRad;
        
        const cosTheta = Math.sin(dec1) * Math.sin(dec2) + 
                         Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
        
        const clampedCos = Math.max(-1, Math.min(1, cosTheta));
        const angle = Math.acos(clampedCos) / toRad; 

        if (UI.moonAngle) {
             UI.moonAngle.innerText = `${angle.toFixed(2)}°`;
        }
    } catch (e) {
        console.error("Angle Calc Calc Error:", e);
        if (UI.moonAngle) UI.moonAngle.innerText = "--°";
    }
    
    let phaseName = "朔";
    if (phase >= 355 || phase < 5) phaseName = "新月(朔)";
    else if (phase < 90) phaseName = "蛾眉月";
    else if (phase < 100) phaseName = "上弦月";
    else if (phase < 175) phaseName = "盈凸月";
    else if (phase < 185) phaseName = "满月(望)";
    else if (phase < 260) phaseName = "亏凸月";
    else if (phase < 280) phaseName = "下弦月";
    else phaseName = "残月";

    UI.moonPhase.innerText = phaseName;
    UI.moonIllum.innerText = illum.toFixed(1) + '%';
}

export function setOnDateSelect(fn) { onDateSelectCallback = fn; }
export async function updateCalendarView(date, lat, lon) { await renderGrid(date, lat, lon); updateAstronomyData(date, lat, lon); }
export function mountCalendar() {
    if (UI.calGrid) UI.calGrid.addEventListener('click', (e) => {
        const t = e.target.closest('.c-day');
        if(t && !t.classList.contains('empty') && onDateSelectCallback) {
            const y = parseInt(t.dataset.year);
            const m = parseInt(t.dataset.month);
            const d = parseInt(t.dataset.day);
            const selectedDate = new Date(y, m, d);
            onDateSelectCallback(selectedDate); 
        }
    });
}