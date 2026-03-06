/* js/modules/ganzhi.js */
// 依赖全局 Astronomy
export const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
export const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

export const NAYIN_TEXT = `
甲子乙丑海中金， 丙寅丁卯炉中火
戊辰己巳大林木， 庚午辛未路旁土
壬申癸酉剑锋金， 甲戌乙亥山头火
丙子丁丑涧下水 ，戊寅己卯城头土
庚辰辛巳白蜡金 ，壬午癸未杨柳木
甲申乙酉泉中水， 丙戌丁亥屋上土
戊子己丑霹雳火， 庚寅辛卯松柏木
壬辰癸巳长流水 ，甲午乙未沙中金
丙申丁酉山下火 ，戊戌己亥平地木
庚子辛丑壁上土 ，壬寅癸卯金箔金
甲辰乙巳覆灯火 ，丙午丁未天河水
戊申己酉大驿土 ，庚戌辛亥钗钏金
壬子癸丑桑柘木 ，甲寅乙卯大溪水
丙辰丁巳沙中土 ，戊午己未天上火
庚申辛酉石榴木， 壬戌癸亥大海水
`.trim();

export function buildNayinMapFromText(text = NAYIN_TEXT) {
  const s = text.replace(/[，,]/g, " ").replace(/\s+/g, " ").trim();
  const re = new RegExp(`([${STEMS.join("")}][${BRANCHES.join("")}])([${STEMS.join("")}][${BRANCHES.join("")}])([^ ]+?[金木水火土])`, "g");
  const map = new Map();
  let m;
  while ((m = re.exec(s))) {
    map.set(m[1], m[3]);
    map.set(m[2], m[3]);
  }
  return map;
}
export const NAYIN_MAP = buildNayinMapFromText();

export function getNayinForPillar(pillar) {
  const gz = pillar.text || (pillar.gan + pillar.zhi);
  return NAYIN_MAP.get(gz) || "";
}

export function getWuXingFromNayin(nayin) {
  return nayin ? nayin.slice(-1) : "";
}

function mod(n, m) { return ((n % m) + m) % m; }

function sunEclipticLongitudeDeg(dateUtc) {
  const ecl = Astronomy.SunPosition(dateUtc);
  return mod(ecl.elon, 360);
}

function equationOfTimeMinutes(dateUTC) {
  const y = dateUTC.getUTCFullYear();
  const start = Date.UTC(y, 0, 1, 0, 0, 0, 0);
  const ms = dateUTC.getTime();
  const day = Math.floor((ms - start) / 86400000) + 1;
  const hour = dateUTC.getUTCHours() + dateUTC.getUTCMinutes() / 60 + dateUTC.getUTCSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (day - 1 + (hour - 12) / 24);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  return eot;
}

export function toTrueSolarClockDate({ dateUTC, lon, tzOffsetMinutes }) {
  const tzHours = tzOffsetMinutes / 60;
  const lstm = tzHours * 15;
  const eotMin = equationOfTimeMinutes(dateUTC);
  const tcMin = 4 * (lon - lstm) + eotMin;
  const trueSolarMs = dateUTC.getTime() + (tzOffsetMinutes + tcMin) * 60000;
  return { trueSolarClock: new Date(trueSolarMs), eotMinutes: eotMin, timeCorrectionMinutes: tcMin };
}

function jdnGregorian(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}

const REF_DAY = { y: 1949, m: 10, d: 1, ganzhiIndex: 0 };
const REF_JDN = jdnGregorian(REF_DAY.y, REF_DAY.m, REF_DAY.d);

export function ganzhiDayFromGregorianDate(y, m, d) {
  const jdn = jdnGregorian(y, m, d);
  const idx = mod(jdn - REF_JDN + REF_DAY.ganzhiIndex, 60);
  return { index60: idx, gan: STEMS[idx % 10], zhi: BRANCHES[idx % 12], text: STEMS[idx % 10] + BRANCHES[idx % 12], stemIndex: idx % 10 };
}

// 简化版立春查找 (实际生产环境建议用缓存或更优算法，但这里够用)
function findSunLongitudeUTC({ startUTC, endUTC, targetDeg }) {
    // 简单的二分法
    let t1 = startUTC.getTime();
    let t2 = endUTC.getTime();
    for(let i=0; i<20; i++) {
        const tm = (t1 + t2) / 2;
        const lon = sunEclipticLongitudeDeg(new Date(tm));
        let diff = lon - targetDeg;
        if(diff > 180) diff -= 360;
        if(diff < -180) diff += 360;
        if(diff > 0) t2 = tm; else t1 = tm;
    }
    return new Date((t1+t2)/2);
}

export function ganzhiYearForInstant(dateUTC) {
  const gYear = dateUTC.getUTCFullYear();
  const start = new Date(Date.UTC(gYear, 0, 20));
  const end = new Date(Date.UTC(gYear, 1, 20));
  const lc = findSunLongitudeUTC({ startUTC: start, endUTC: end, targetDeg: 315 }); // 立春 315度
  const solarYear = (dateUTC.getTime() >= lc.getTime()) ? gYear : (gYear - 1);
  const idx60 = mod(solarYear - 1984, 60);
  return { solarYear, index60: idx60, gan: STEMS[idx60 % 10], zhi: BRANCHES[idx60 % 12], text: STEMS[idx60 % 10] + BRANCHES[idx60 % 12], stemIndex: idx60%10 };
}

export function ganzhiMonthForInstant(dateUTC, yearStemIndex) {
  const lon = sunEclipticLongitudeDeg(dateUTC);
  const shifted = mod(lon - 315, 360);
  const monthIndex = Math.floor(shifted / 30); 
  const monthBranchIndex = mod(2 + monthIndex, 12);
  const zhi = BRANCHES[monthBranchIndex];
  const startStemIndex = [2, 4, 6, 8, 0][mod(yearStemIndex, 5)];
  const monthStemIndex = mod(startStemIndex + monthIndex, 10);
  return { gan: STEMS[monthStemIndex], zhi, text: STEMS[monthStemIndex] + zhi };
}

export function ganzhiHourFromTrueSolarClock(trueSolarClock, dayStemIndex) {
  const h = trueSolarClock.getUTCHours();
  let branchIndex;
  if (h === 23 || h === 0) branchIndex = 0; else branchIndex = Math.floor((h + 1) / 2);
  const zhi = BRANCHES[branchIndex];
  const stemIndex = mod(dayStemIndex * 2 + branchIndex, 10);
  return { gan: STEMS[stemIndex], zhi, text: STEMS[stemIndex] + zhi };
}

export function computeGanzhi({ dateUTC, lat, lon, tzOffsetMinutes }) {
  const { trueSolarClock, eotMinutes, timeCorrectionMinutes } = toTrueSolarClockDate({ dateUTC, lon, tzOffsetMinutes });
  const h = trueSolarClock.getUTCHours();
  const isAfter23 = (h >= 23);
  const dayClock = isAfter23 ? new Date(trueSolarClock.getTime() + 86400000) : trueSolarClock;
  
  const day = ganzhiDayFromGregorianDate(dayClock.getUTCFullYear(), dayClock.getUTCMonth() + 1, dayClock.getUTCDate());
  const year = ganzhiYearForInstant(dateUTC);
  const month = ganzhiMonthForInstant(dateUTC, year.stemIndex);
  const hour = ganzhiHourFromTrueSolarClock(trueSolarClock, day.stemIndex);

  year.nayin = getNayinForPillar(year);
  month.nayin = getNayinForPillar(month);
  day.nayin = getNayinForPillar(day);
  hour.nayin = getNayinForPillar(hour);

  return { trueSolar: { trueSolarClock, eotMinutes, dayBoundaryApplied: isAfter23 }, pillars: { year, month, day, hour } };
}