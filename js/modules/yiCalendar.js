/* js/modules/yiCalendar.js */

/**
 * 彝族十月太阳历核心算法
 * 基于冬至锚点 (Winter Solstice Anchor)
 * 结构：10个月 × 36天 = 360天
 * 岁余日：平年5天 / 闰年6天 (工程口径：格里历闰年规则)
 */

// 月份名称映射 (用户定制: 1=十, 2=乙 ... 不带“月”字)
const YI_MONTH_NAMES = [
    '十', // 1月 (代替甲) - 阳木
    '乙', // 2月 - 阴木
    '丙', // 3月 - 阳火
    '丁', // 4月 - 阴火
    '戊', // 5月 - 阳土
    '己', // 6月 - 阴土
    '庚', // 7月 - 阳金
    '辛', // 8月 - 阴金
    '壬', // 9月 - 阳水
    '癸'  // 10月 - 阴水
];

// 五行属性映射 (用于UI着色)
const YI_MONTH_ELEMENTS = [
    'mu',   // 十 (阳木)
    'mu',   // 乙 (阴木)
    'huo',  // 丙 (阳火)
    'huo',  // 丁 (阴火)
    'tu',   // 戊 (阳土)
    'tu',   // 己 (阴土)
    'jin',  // 庚 (阳金)
    'jin',  // 辛 (阴金)
    'shui', // 壬 (阳水)
    'shui'  // 癸 (阴水)
];

// ---------------------- 基础工具 ----------------------

function ensureAstronomy() {
    if (typeof Astronomy === 'undefined') {
        // console.warn('Astronomy.js not loaded');
        return null;
    }
    return Astronomy;
}

function astroTimeToDate(t) {
    if (t instanceof Date) return t;
    if (t && t.date instanceof Date) return t.date;
    return new Date(t);
}

function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysBetweenLocal(d1, d2) {
    // d2 - d1 的整日差（以本地“日界”计算）
    const a = startOfLocalDay(d1).getTime();
    const b = startOfLocalDay(d2).getTime();
    return Math.floor((b - a) / 86400000);
}

function isGregorianLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function getExtraDaysForYiYear(solsticeYear) {
    // 工程口径：以“冬至所在公历年”为该彝历年的锚年
    // 平年：5天岁余；闰年：6天岁余
    return isGregorianLeapYear(solsticeYear) ? 6 : 5;
}

function getWinterSolsticeInstantLocal(year) {
    const A = ensureAstronomy();
    if (!A) return new Date(year, 11, 21); // Fallback fallback
    
    // 高精度求该年的冬至时刻（December solstice）
    const seasons = A.Seasons(year); 
    const t = astroTimeToDate(seasons.dec_solstice);
    return new Date(t.getTime());
}

function getYiYearStartLocalDate(year) {
    // 彝历“岁余日第1天”的开始：冬至落在哪个本地日期，就取该日期的 00:00
    const solsticeLocalInstant = getWinterSolsticeInstantLocal(year);
    const D0 = startOfLocalDay(solsticeLocalInstant);
    return { D0, solsticeLocalInstant };
}

function chooseYiAnchorYear(dateLocal) {
    // 关键：判断输入时间属于哪个“冬至-冬至”的彝历年区间
    // 做法：算今年冬至日的D0、去年冬至日的D0
    const y = dateLocal.getFullYear();
    const A = getYiYearStartLocalDate(y);     // 本年冬至日 D0
    const B = getYiYearStartLocalDate(y - 1); // 上年冬至日 D0

    // 规则：若 dateLocal >= A.D0 => 属于锚年 y (即新的一年已经开始了)
    // 否则属于锚年 y-1
    const t = dateLocal.getTime();
    if (t >= A.D0.getTime()) return { anchorYear: y, anchor: A };
    return { anchorYear: y - 1, anchor: B };
}

// ---------------------- 导出逻辑 ----------------------

/**
 * 计算彝历日期
 * @param {Date} dateLocal 输入的本地时间
 * @returns {Object} { monthName: string, wuxing: string, isExtra: boolean }
 */
export function getYiCalendarDate(dateLocal) {
    if (!dateLocal) return null;

    const { anchorYear, anchor } = chooseYiAnchorYear(dateLocal);
    const extraDays = getExtraDaysForYiYear(anchorYear);
    const D0 = anchor.D0; // 岁余日第1天 00:00

    // deltaDays：从岁余日第1天开始算的第几天（0-based）
    const deltaDays = daysBetweenLocal(D0, dateLocal);

    // 判断是否在岁余日期间 (0 ~ 4 or 5)
    const isExtra = (deltaDays >= 0 && deltaDays < extraDays);
    
    let monthName = '';
    let wuxing = ''; // jin, mu, shui, huo, tu

    if (isExtra) {
        // 岁余日期间
        monthName = '歲餘'; // 繁体
        wuxing = 'tu'; // 岁余日通常归土，或者作为中性色，这里暂定用土色(赭石)
    } else {
        // 进入10个月系统
        const d = deltaDays - extraDays; // 偏移量
        // Math.floor(d / 36) 得到 0..9
        const monthIndex = Math.floor(d / 36);
        
        // 容错：防止超出10个月（理论上冬至计算准确不会超，除非闰年规则极度特殊）
        const safeIndex = Math.min(monthIndex, 9);
        
        monthName = YI_MONTH_NAMES[safeIndex]; // 不加“月”字
        wuxing = YI_MONTH_ELEMENTS[safeIndex];
    }

    return {
        monthName,
        wuxing,
        isExtra,
        anchorYear,
        deltaDays
    };
}