/* js/modules/luck.js */

// 标准二十八宿 (用于三合宿/通胜)
const ZODIAC_28 = "角亢氐房心尾箕斗牛女虚危室壁奎娄胃昴毕觜参井鬼柳星张翼轸";

// 农历宿专用序列：二十七宿 (去掉'牛'宿，用于月表查宿)
// 您的表格中，十一月从'斗'直接跳到了'女'，跳过了'牛'。
// 序列：角亢氐房心尾箕斗(7) 女(8) 虚(9) ...
const ZODIAC_27 = "角亢氐房心尾箕斗女虚危室壁奎娄胃昴毕觜参井鬼柳星张翼轸";

// 农历宿月首偏移量 (基于 ZODIAC_27 的索引)
// M1:室(11), M2:奎(13), M3:胃(15), M4:毕(17), M5:参(19), M6:鬼(21)
// M7:张(24), M8:角(0),  M9:氐(2),  M10:心(4), M11:斗(7), M12:虚(9)
const MONTH_START_OFFSETS_27 = [11, 13, 15, 17, 19, 21, 24, 0, 2, 4, 7, 9];

/**
 * 根据农历月日计算【农历宿】(二十七宿体系，去牛)
 * @param {number} lunarMonth 农历月份 (1-12)
 * @param {number} lunarDay 农历日期 (1-30)
 */
export function calculateLunarMansion(lunarMonth, lunarDay) {
    if (!lunarMonth || !lunarDay) return null;
    
    // 处理闰月：直接映射到原月份 (如闰正月视为正月)
    const mIndex = (lunarMonth - 1) % 12; 
    
    // 获取当月初一的起始宿索引 (基于27宿)
    const startIdx = MONTH_START_OFFSETS_27[mIndex];
    
    // 计算当日索引：(起始 + (日期-1)) % 27
    const currentIdx = (startIdx + (lunarDay - 1)) % 27;
    
    return ZODIAC_27[currentIdx];
}

/**
 * 计算【三合宿】(通胜日宿，二十八宿无限循环，基于公历时间)
 * 基准：2024年5月20日(周一) = 角宿 (Index 0 in ZODIAC_28)
 */
export function calculateSanHeXiu(date) {
    // 构造 UTC 正午时间以避免时区偏差
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
    const anchor = new Date(Date.UTC(2024, 4, 20, 12, 0, 0)); // 2024-05-20
    
    const diffMs = target.getTime() - anchor.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    
    // JS 的 % 运算符对负数表现不符合数学模运算，需修正
    let idx = diffDays % 28;
    if (idx < 0) idx += 28;
    
    return ZODIAC_28[idx];
}

/**
 * 灭没日计算
 * 规则：基于【三合宿】(xiuName) 与 月相 (lunarStatus)
 * 必须传入由 calculateSanHeXiu 计算出的宿名（因为灭没日基于二十八宿逻辑）
 */
export function checkMieMo(xiuName, lunarStatus) {
    if (lunarStatus.isXian && xiuName === '虚') return '灭没(弦日逢虚)';
    if (lunarStatus.isHui && xiuName === '娄') return '灭没(晦日逢娄)';
    if (lunarStatus.isShuo && xiuName === '角') return '灭没(朔日逢角)';
    if (lunarStatus.isWang && xiuName === '亢') return '灭没(望日逢亢)';
    if (lunarStatus.isXu && xiuName === '鬼') return '灭没(虚日逢鬼)';
    if (lunarStatus.isYing && xiuName === '牛') return '灭没(盈日逢牛)';
    return null;
}