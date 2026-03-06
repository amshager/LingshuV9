
/* js/modules/astrology.js */
const Util = {
    pad2: (n) => String(n).padStart(2, '0'),
    norm360: (deg) => ((deg % 360) + 360) % 360,
    degToDegMin: (deg) => {
        const d = Math.floor(deg + 1e-12);
        const m = Math.floor((deg - d) * 60 + 1e-10);
        return { d, m };
    }
};

const Qi = {
    BRANCH_BY_TROP_SIGN: ['戌','酉','申','未','午','巳','辰','卯','寅','丑','子','亥'],
    // Chinese Names for Western Zodiac Signs (Standard)
    ZODIAC_NAMES_CN: ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'],
    tropLonToPalace(lonDeg) { return this.BRANCH_BY_TROP_SIGN[Math.floor(Util.norm360(lonDeg) / 30)]; },
    lonToBranchText(lonDeg) {
        const lon = Util.norm360(lonDeg);
        const idx = Math.floor(lon / 30);
        const { d, m } = Util.degToDegMin(lon - idx * 30);
        return `${this.BRANCH_BY_TROP_SIGN[idx]}${d}°${Util.pad2(m)}′`;
    }
};

const Lahiri = {
    LAHIRI_BASE_DEG: 23.8530556,
    PRECESSION_DEG_PER_YEAR: 50.2388475 / 3600,
    ayanamsaDegrees(dateUtc) {
        const days = (dateUtc.getTime() - Date.UTC(2000, 0, 1)) / 86400000;
        return this.LAHIRI_BASE_DEG + (days / 365.2425) * this.PRECESSION_DEG_PER_YEAR;
    },
};

const Mansions = {
    MANSIONS: [
        {name:'角',ra:[13,25,11.5],span:11.925},{name:'亢',ra:[14,12,53.6],span:9.495},{name:'氐',ra:[14,50,52.6],span:16.995},{name:'房',ra:[15,58,51.0],span:5.580},{name:'心',ra:[16,21,11.2],span:7.665},{name:'尾',ra:[16,51,52.1],span:18.495},{name:'箕',ra:[18,5,48.3],span:9.960},{name:'斗',ra:[18,45,39.2],span:23.835},{name:'牛',ra:[20,21,0.5],span:6.660},{name:'女',ra:[20,47,40.3],span:10.980},{name:'虚',ra:[21,31,33.3],span:8.610},{name:'危',ra:[22,5,46.8],span:14.685},{name:'室',ra:[23,4,45.5],span:17.115},{name:'壁',ra:[0,13,14.1],span:10.995},{name:'奎',ra:[0,57,12.4],span:14.370},{name:'娄',ra:[1,54,38.3],span:12.195},{name:'胃',ra:[2,43,27.0],span:15.360},{name:'昴',ra:[3,44,52.5],span:10.935},{name:'毕',ra:[4,28,36.9],span:16.635},{name:'觜',ra:[5,35,8.2],span:1.410},{name:'参',ra:[5,40,45.5],span:10.545},{name:'井',ra:[6,22,57.6],span:32.145},{name:'鬼',ra:[8,31,35.7],span:1.530},{name:'柳',ra:[8,37,39.3],span:12.480},{name:'星',ra:[9,27,35.2],span:5.970},{name:'张',ra:[9,51,28.6],span:17.070},{name:'翼',ra:[10,59,46.4],span:19.005},{name:'轸',ra:[12,15,48.3],span:17.355}
    ],
    PALACE_BY_MANSION: {'角':'辰','亢':'辰','氐':'卯','房':'卯','心':'卯','尾':'寅','箕':'寅','斗':'丑','牛':'丑','女':'子','虚':'子','危':'子','室':'亥','壁':'亥','奎':'戌','娄':'戌','胃':'酉','昴':'酉','毕':'酉','觜':'申','参':'申','井':'未','鬼':'未','柳':'午','星':'午','张':'午','翼':'巳','轸':'巳'},
    init() { if(this.ready)return; this.STARTS=this.MANSIONS.map(x=>({name:x.name, start: (x.ra[0]+x.ra[1]/60+x.ra[2]/3600)*15, span:x.span})); this.ready=true; },
    getMansion(raDeg) {
        this.init();
        const ra = Util.norm360(raDeg);
        let bestMansion = null;
        let minD = 360;
        for(const m of this.STARTS) {
            const d = Util.norm360(ra - m.start);
            if(d < minD) {
                minD = d;
                bestMansion = m;
            }
        }
        if (bestMansion) {
            return { mansion: bestMansion.name, palace: this.PALACE_BY_MANSION[bestMansion.name], enterDeg: minD };
        }
        return { mansion:'?', palace:'?', enterDeg: NaN };
    },
    mansionText(raDeg) { 
        const r = this.getMansion(raDeg); 
        const degStr = (typeof r.enterDeg === 'number') ? r.enterDeg.toFixed(2) : '--';
        return `${r.palace}/${r.mansion} 入 ${degStr}°`; 
    }
};

const Overlap = {
    check(tropDeg, raDeg) {
        const q = Qi.tropLonToPalace(tropDeg);
        const m = Mansions.getMansion(raDeg);
        return { overlap: q===m.palace };
    }
};

export function calculateAstroData(dateUtc) {
    if (typeof Astronomy === 'undefined') return null;
    const t = new Astronomy.AstroTime(dateUtc);
    const vSun = Astronomy.GeoVector(Astronomy.Body.Sun, t, false);
    const vMoon = Astronomy.GeoVector(Astronomy.Body.Moon, t, false);
    const tropSun = Astronomy.Ecliptic(vSun).elon;
    const tropMoon = Astronomy.Ecliptic(vMoon).elon;
    const ayan = Lahiri.ayanamsaDegrees(dateUtc);
    const raSun = Astronomy.EquatorFromVector(vSun).ra * 15;
    const raMoon = Astronomy.EquatorFromVector(vMoon).ra * 15;

    return {
        ayanamsa: ayan,
        sun: { trop: Qi.lonToBranchText(tropSun), sid: Qi.lonToBranchText(tropSun - ayan), mans: Mansions.mansionText(raSun), ov: Overlap.check(tropSun, raSun) },
        moon: { trop: Qi.lonToBranchText(tropMoon), sid: Qi.lonToBranchText(tropMoon - ayan), mans: Mansions.mansionText(raMoon), ov: Overlap.check(tropMoon, raMoon) }
    };
}

import sweph from 'sweph-wasm';

let swInstance = null;
let epheLoaded = false;
let initPromise = null;

export async function getSweph() {
    if (swInstance) return swInstance;
    if (initPromise) return initPromise;
    
    initPromise = (async () => {
        swInstance = await sweph.init();
        try {
            const epheDir = '/ephe';
            if (!swInstance.wasm.FS.analyzePath(epheDir, true).exists) {
                swInstance.wasm.FS.mkdir(epheDir);
            }
            
            const files = ['seas_18.se1', 'semo_18.se1', 'sepl_18.se1'];
            // 兼容 Vite 和 原生 H5
            const basePath = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) 
                ? import.meta.env.BASE_URL 
                : window.location.pathname.replace(/\/[^\/]*$/, '/');
            const baseUrl = window.location.origin + basePath + 'ephe/';
            
            let loadedCount = 0;
            for (const file of files) {
                try {
                    const res = await fetch(baseUrl + file);
                    if (res.ok) {
                        const buffer = await res.arrayBuffer();
                        const data = new Uint8Array(buffer);
                        const filePath = `${epheDir}/${file}`;
                        if (swInstance.wasm.FS.analyzePath(filePath).exists) {
                            swInstance.wasm.FS.unlink(filePath);
                        }
                        swInstance.wasm.FS.createDataFile(epheDir, file, data, true, true, true);
                        loadedCount++;
                    } else {
                        console.warn(`Failed to fetch ${file}: ${res.status}`);
                    }
                } catch (err) {
                    console.warn(`Error fetching ${file}:`, err);
                }
            }
            
            if (loadedCount > 0) {
                // Allocate string for C function
                const ptr = swInstance.wasm._malloc(epheDir.length + 1);
                swInstance.wasm.stringToUTF8(epheDir, ptr, epheDir.length + 1);
                swInstance.wasm._swe_set_ephe_path(ptr);
                swInstance.wasm._free(ptr);
                epheLoaded = true;
                console.log(`Successfully loaded ${loadedCount} ephemeris files.`);
            } else {
                throw new Error("No ephemeris files could be loaded.");
            }
        } catch (e) {
            console.warn('Error setting up ephemeris, falling back to Moshier', e);
            epheLoaded = false;
        }
        return swInstance;
    })();
    
    return initPromise;
}

const SE_SUN = 0, SE_MOON = 1, SE_MERCURY = 2, SE_VENUS = 3, SE_MARS = 4;
const SE_JUPITER = 5, SE_SATURN = 6, SE_URANUS = 7, SE_NEPTUNE = 8, SE_PLUTO = 9;
const SE_TRUE_NODE = 11, SE_MEAN_APOG = 12, SE_CHIRON = 15;
const planets = [SE_SUN, SE_MERCURY, SE_VENUS, SE_MARS, SE_JUPITER, SE_SATURN, SE_URANUS, SE_NEPTUNE, SE_PLUTO];
const aspects = [0, 60, 90, 120, 180, 240, 270, 300];

const SIGNS = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];
const SIGN_ICONS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

function getFlag() {
    return epheLoaded ? 258 : 260; // 258 = SEFLG_SWIEPH(2) | SEFLG_SPEED(256), 260 = SEFLG_MOSEPH(256) | SEFLG_SPEED(4)
}

function formatPosition(lon) {
  const signIdx = Math.floor(lon / 30) % 12;
  const deg = Math.floor(lon % 30);
  const min = Math.floor((lon % 1) * 60);
  return {
    sign: SIGNS[signIdx],
    icon: SIGN_ICONS[signIdx],
    deg: deg,
    min: min,
    str: `${deg}°${min}'`
  };
}

function getPosition(sw, body, jd) {
  const res = sw.swe_calc_ut(jd, body, getFlag());
  return res[0];
}

function getAngleDiff(lon1, lon2) {
  let diff = (lon1 - lon2) % 360;
  if (diff < 0) diff += 360;
  return diff;
}

function findNextSignIngress(sw, jd_start) {
  let jd = jd_start;
  const start_lon = getPosition(sw, SE_MOON, jd);
  const current_sign = Math.floor(start_lon / 30);
  const target_lon = (current_sign + 1) * 30;
  
  let deg_to_go = target_lon - start_lon;
  if (deg_to_go < 0) deg_to_go += 360;
  if (deg_to_go === 0) deg_to_go = 30;
  
  jd += deg_to_go / 13.176;
  
  for (let i = 0; i < 10; i++) {
    const res = sw.swe_calc_ut(jd, SE_MOON, getFlag());
    const lon = res[0];
    const speed = res[3];
    let err = target_lon - lon;
    if (err > 180) err -= 360;
    if (err < -180) err += 360;
    if (Math.abs(err) < 0.00001) break;
    jd += err / speed;
  }
  return jd;
}

function findPrevSignIngress(sw, jd_start) {
  let jd = jd_start;
  const start_lon = getPosition(sw, SE_MOON, jd);
  const current_sign = Math.floor(start_lon / 30);
  const target_lon = current_sign * 30;
  
  let deg_to_go = start_lon - target_lon;
  if (deg_to_go < 0) deg_to_go += 360;
  if (deg_to_go === 0) deg_to_go = 30;
  
  jd -= deg_to_go / 13.176;
  
  for (let i = 0; i < 10; i++) {
    const res = sw.swe_calc_ut(jd, SE_MOON, getFlag());
    const lon = res[0];
    const speed = res[3];
    let err = lon - target_lon;
    if (err > 180) err -= 360;
    if (err < -180) err += 360;
    if (Math.abs(err) < 0.00001) break;
    jd -= err / speed;
  }
  return jd;
}

function findAllAspects(sw, jd_start, jd_end, planets_to_use) {
  let aspects_found = [];
  const step = 1 / 24;

  for (let p of planets_to_use) {
    let prev_diff = getAngleDiff(getPosition(sw, SE_MOON, jd_start), getPosition(sw, p, jd_start));
    for (let jd = jd_start + step; jd <= jd_end + step; jd += step) {
      const curr_diff = getAngleDiff(getPosition(sw, SE_MOON, jd), getPosition(sw, p, jd));
      for (let asp of aspects) {
        let min_d = Math.min(curr_diff, prev_diff);
        let max_d = Math.max(curr_diff, prev_diff);
        if (max_d - min_d > 180) {
          min_d += 360;
          let temp = min_d; min_d = max_d; max_d = temp;
        }
        let asp_adj = asp;
        if (asp_adj < min_d && max_d > 360) asp_adj += 360;
        
        if (asp_adj >= min_d && asp_adj <= max_d) {
          let jd_left = jd - step;
          let jd_right = jd;
          for (let i = 0; i < 20; i++) {
            const jd_mid = (jd_left + jd_right) / 2;
            const mid_diff = getAngleDiff(getPosition(sw, SE_MOON, jd_mid), getPosition(sw, p, jd_mid));
            let err_left = getAngleDiff(getPosition(sw, SE_MOON, jd_left), getPosition(sw, p, jd_left)) - asp;
            if (err_left > 180) err_left -= 360; if (err_left < -180) err_left += 360;
            let err_mid = mid_diff - asp;
            if (err_mid > 180) err_mid -= 360; if (err_mid < -180) err_mid += 360;
            if (err_left * err_mid <= 0) jd_right = jd_mid;
            else jd_left = jd_mid;
          }
          const exact_jd = (jd_left + jd_right) / 2;
          if (exact_jd >= jd_start && exact_jd <= jd_end) {
            aspects_found.push({ jd: exact_jd, planet: p, angle: asp });
          }
        }
      }
      prev_diff = curr_diff;
    }
  }
  
  aspects_found.sort((a, b) => a.jd - b.jd);
  return aspects_found;
}

let swephMutex = Promise.resolve();

async function withSwephLock(fn) {
    let release;
    const p = new Promise(resolve => release = resolve);
    const prev = swephMutex;
    swephMutex = prev.then(() => p);
    await prev;
    try {
        return await fn();
    } finally {
        release();
    }
}

export async function fetchVocDataLocal(dateParam, ruleStr) {
    return withSwephLock(async () => {
        const rule = ruleStr === '7' ? 7 : 10;
        const sw = await getSweph();
        
        const jd_now = sw.swe_julday(
          dateParam.getUTCFullYear(), 
          dateParam.getUTCMonth() + 1, 
          dateParam.getUTCDate(), 
          dateParam.getUTCHours() + dateParam.getUTCMinutes() / 60 + dateParam.getUTCSeconds() / 3600, 
          1
        );
        
        const jd_next_ingress = findNextSignIngress(sw, jd_now);
        const jd_prev_ingress = findPrevSignIngress(sw, jd_now);
        const jd_prev_prev_ingress = findPrevSignIngress(sw, jd_prev_ingress - 0.1);
        const jd_next_next_ingress = findNextSignIngress(sw, jd_next_ingress + 0.1);
        
        const planets_to_use = rule === 7 
          ? [SE_SUN, SE_MERCURY, SE_VENUS, SE_MARS, SE_JUPITER, SE_SATURN]
          : planets;
          
        const prev_aspects = findAllAspects(sw, jd_prev_prev_ingress, jd_prev_ingress, planets_to_use);
        const all_aspects = findAllAspects(sw, jd_prev_ingress, jd_next_ingress, planets_to_use);
        const next_aspects = findAllAspects(sw, jd_next_ingress, jd_next_next_ingress, planets_to_use);
        
        const last_aspect = all_aspects.length > 0 ? all_aspects[all_aspects.length - 1] : null;
        
        const is_voc = last_aspect ? (jd_now >= last_aspect.jd && jd_now < jd_next_ingress) : false;
        
        const formatJdDate = (d) => {
            const hrs = Math.floor(d.hour);
            const mins = Math.floor((d.hour - hrs) * 60);
            const secs = Math.floor(((d.hour - hrs) * 60 - mins) * 60);
            return new Date(Date.UTC(d.year, d.month - 1, d.day, hrs, mins, secs)).toISOString();
        };

        const formatAspect = (a) => ({
          type: 'aspect',
          jd: a.jd,
          date: formatJdDate(sw.swe_revjul(a.jd, 1)),
          planet: a.planet,
          angle: a.angle,
          moonPos: formatPosition(getPosition(sw, SE_MOON, a.jd))
        });

        const formatIngress = (jd) => ({
          type: 'ingress',
          jd: jd,
          date: formatJdDate(sw.swe_revjul(jd, 1)),
          moonPos: formatPosition(getPosition(sw, SE_MOON, jd + 0.0001))
        });

        let timeline = [
          ...prev_aspects.map(formatAspect),
          formatIngress(jd_prev_ingress),
          ...all_aspects.map(formatAspect),
          formatIngress(jd_next_ingress),
          ...next_aspects.map(formatAspect)
        ];

        timeline.sort((a, b) => a.jd - b.jd);

        let pastEvents = timeline.filter(e => e.jd <= jd_now);
        let futureEvents = timeline.filter(e => e.jd > jd_now);
        
        let displayEvents = [];
        if (pastEvents.length >= 3) {
          displayEvents.push(...pastEvents.slice(-3));
        } else {
          displayEvents.push(...pastEvents);
        }
        
        let neededFuture = 5 - displayEvents.length;
        if (futureEvents.length >= neededFuture) {
          displayEvents.push(...futureEvents.slice(0, neededFuture));
        } else {
          displayEvents.push(...futureEvents);
          let neededPast = 5 - displayEvents.length;
          if (neededPast > 0 && pastEvents.length > pastEvents.slice(-3).length) {
             let extraPast = pastEvents.slice(-3 - neededPast, -3);
             displayEvents = [...extraPast, ...displayEvents];
          }
        }

        const ingressDate = sw.swe_revjul(jd_next_ingress, 1);
        
        return {
          isVoc: is_voc,
          currentJd: jd_now,
          currentMoonPos: formatPosition(getPosition(sw, SE_MOON, jd_now)),
          ingressJd: jd_next_ingress,
          ingressDate: formatJdDate(ingressDate),
          ingressMoonPos: formatPosition(getPosition(sw, SE_MOON, jd_next_ingress)),
          lastAspect: last_aspect ? {
            date: formatJdDate(sw.swe_revjul(last_aspect.jd, 1)),
            planet: last_aspect.planet,
            angle: last_aspect.angle
          } : null,
          timeline: displayEvents
        };
    });
}

export async function fetchAstroDetailsLocal(dateParam, lat, lon) {
    return withSwephLock(async () => {
        const sw = await getSweph();
        
        const jd_now = sw.swe_julday(
      dateParam.getUTCFullYear(), 
      dateParam.getUTCMonth() + 1, 
      dateParam.getUTCDate(), 
      dateParam.getUTCHours() + dateParam.getUTCMinutes() / 60 + dateParam.getUTCSeconds() / 3600, 
      1
    );

    const rsmi_rise = sw.SE_CALC_RISE | sw.SE_BIT_DISC_CENTER | sw.SE_BIT_NO_REFRACTION;
    const rsmi_set = sw.SE_CALC_SET | sw.SE_BIT_DISC_CENTER | sw.SE_BIT_NO_REFRACTION;
    
    let jd_sunrise = sw.swe_rise_trans(jd_now - 1, sw.SE_SUN, "", getFlag(), rsmi_rise, [lon, lat, 0], 0, 0);
    if (jd_sunrise > jd_now) {
      jd_sunrise = sw.swe_rise_trans(jd_now - 2, sw.SE_SUN, "", getFlag(), rsmi_rise, [lon, lat, 0], 0, 0);
    }
    
    let jd_sunset = sw.swe_rise_trans(jd_sunrise, sw.SE_SUN, "", getFlag(), rsmi_set, [lon, lat, 0], 0, 0);
    
    let isDay = jd_now >= jd_sunrise && jd_now < jd_sunset;
    let hourLength, hoursPassed, startJd;
    let dayOfWeek;
    
    if (isDay) {
      hourLength = (jd_sunset - jd_sunrise) / 12;
      hoursPassed = Math.floor((jd_now - jd_sunrise) / hourLength);
      startJd = jd_sunrise;
      const dateSunrise = sw.swe_revjul(jd_sunrise, 1);
      const d = new Date(Date.UTC(dateSunrise.year, dateSunrise.month - 1, dateSunrise.day, Math.floor(dateSunrise.hour), Math.floor((dateSunrise.hour % 1) * 60)));
      dayOfWeek = d.getUTCDay();
    } else {
      let jd_next_sunrise = sw.swe_rise_trans(jd_sunset, sw.SE_SUN, "", getFlag(), rsmi_rise, [lon, lat, 0], 0, 0);
      if (jd_now < jd_sunrise) {
        jd_next_sunrise = jd_sunrise;
        jd_sunset = sw.swe_rise_trans(jd_now - 2, sw.SE_SUN, "", getFlag(), rsmi_set, [lon, lat, 0], 0, 0);
        if (jd_sunset > jd_now) {
           jd_sunset = sw.swe_rise_trans(jd_now - 3, sw.SE_SUN, "", getFlag(), rsmi_set, [lon, lat, 0], 0, 0);
        }
      }
      hourLength = (jd_next_sunrise - jd_sunset) / 12;
      hoursPassed = Math.floor((jd_now - jd_sunset) / hourLength);
      startJd = jd_sunset;
      let prev_sunrise = sw.swe_rise_trans(jd_sunset - 2, sw.SE_SUN, "", getFlag(), rsmi_rise, [lon, lat, 0], 0, 0);
      if (prev_sunrise > jd_sunset) {
        prev_sunrise = sw.swe_rise_trans(jd_sunset - 3, sw.SE_SUN, "", getFlag(), rsmi_rise, [lon, lat, 0], 0, 0);
      }
      const dateSunrise = sw.swe_revjul(prev_sunrise, 1);
      const d = new Date(Date.UTC(dateSunrise.year, dateSunrise.month - 1, dateSunrise.day, Math.floor(dateSunrise.hour), Math.floor((dateSunrise.hour % 1) * 60)));
      dayOfWeek = d.getUTCDay();
    }
    
    const dayRulers = [SE_SUN, SE_MOON, SE_MARS, SE_MERCURY, SE_JUPITER, SE_VENUS, SE_SATURN];
    const chaldeanOrder = [SE_SATURN, SE_JUPITER, SE_MARS, SE_SUN, SE_VENUS, SE_MERCURY, SE_MOON];
    
    const dayRuler = dayRulers[dayOfWeek];
    const startIndex = chaldeanOrder.indexOf(dayRuler);
    let currentHourPlanetIndex;
    if (isDay) {
      currentHourPlanetIndex = (startIndex + hoursPassed) % 7;
    } else {
      currentHourPlanetIndex = (startIndex + 12 + hoursPassed) % 7;
    }
    const currentHourPlanet = chaldeanOrder[currentHourPlanetIndex];
    
    const planetNames = {
      [SE_SUN]: '太阳', [SE_MOON]: '月亮', [SE_MERCURY]: '水星', [SE_VENUS]: '金星',
      [SE_MARS]: '火星', [SE_JUPITER]: '木星', [SE_SATURN]: '土星',
      [SE_URANUS]: '天王星', [SE_NEPTUNE]: '海王星', [SE_PLUTO]: '冥王星'
    };

    const retrogrades = [];
    const checkPlanets = [SE_MERCURY, SE_VENUS, SE_MARS, SE_JUPITER, SE_SATURN, SE_URANUS, SE_NEPTUNE, SE_PLUTO];
    
    for (let p of checkPlanets) {
      const res = sw.swe_calc_ut(jd_now, p, getFlag());
      const speed = res[3];
      if (speed < 0) {
        let jd_check = jd_now;
        let step = 1;
        let found = false;
        for (let i = 0; i < 365; i++) {
          const r = sw.swe_calc_ut(jd_check, p, getFlag());
          if (r[3] >= 0) {
            let left = jd_check - step;
            let right = jd_check;
            for (let j = 0; j < 10; j++) {
              let mid = (left + right) / 2;
              if (sw.swe_calc_ut(mid, p, getFlag())[3] >= 0) right = mid;
              else left = mid;
            }
            const dateDirect = sw.swe_revjul(right, 1);
            retrogrades.push({
              planet: p,
              name: planetNames[p],
              endDate: new Date(Date.UTC(dateDirect.year, dateDirect.month - 1, dateDirect.day, Math.floor(dateDirect.hour), Math.floor((dateDirect.hour % 1) * 60))).toISOString()
            });
            found = true;
            break;
          }
          jd_check += step;
        }
        if (!found) {
          retrogrades.push({ planet: p, name: planetNames[p], endDate: null });
        }
      }
    }

    const houses = sw.swe_houses(jd_now, lat, lon, 'R');
    const ascendant = houses.ascmc[0];
    const mc = houses.ascmc[1];
    
    const planetNamesEn = {
      [SE_SUN]: 'Sun', [SE_MOON]: 'Moon', [SE_MERCURY]: 'Mercury', [SE_VENUS]: 'Venus',
      [SE_MARS]: 'Mars', [SE_JUPITER]: 'Jupiter', [SE_SATURN]: 'Saturn',
      [SE_URANUS]: 'Uranus', [SE_NEPTUNE]: 'Neptune', [SE_PLUTO]: 'Pluto',
      [SE_TRUE_NODE]: 'NNode', [SE_MEAN_APOG]: 'Lilith', [SE_CHIRON]: 'Chiron'
    };

    const planetNamesExtended = {
      ...planetNames,
      [SE_TRUE_NODE]: '北交点', [SE_MEAN_APOG]: '莉莉丝', [SE_CHIRON]: '凯龙星'
    };

    const extendedPlanets = [...planets, SE_TRUE_NODE, SE_MEAN_APOG, SE_CHIRON];

    const chartPlanets = [];
    for (let p of extendedPlanets) {
      try {
        const res = sw.swe_calc_ut(jd_now, p, getFlag());
        chartPlanets.push({
          id: p,
          name: planetNamesExtended[p],
          nameEn: planetNamesEn[p],
          lon: res[0],
          speed: res[3],
          pos: formatPosition(res[0])
        });
      } catch (err) {
        console.warn(`Skipping planet ${p} due to error:`, err.message || err);
      }
    }

    const nnode = chartPlanets.find(p => p.nameEn === 'NNode');
    if (nnode) {
      const snodeLon = (nnode.lon + 180) % 360;
      chartPlanets.push({
        id: -1,
        name: '南交点',
        nameEn: 'SNode',
        lon: snodeLon,
        speed: nnode.speed,
        pos: formatPosition(snodeLon)
      });
    }

    if (houses.ascmc && houses.ascmc.length > 3) {
      const vertexLon = houses.ascmc[3];
      chartPlanets.push({
        id: -2,
        name: '宿命点',
        nameEn: 'Vertex',
        lon: vertexLon,
        speed: 0,
        pos: formatPosition(vertexLon)
      });
    }

    const sunPlanet = chartPlanets.find(p => p.nameEn === 'Sun');
    const moonPlanet = chartPlanets.find(p => p.nameEn === 'Moon');
    if (sunPlanet && moonPlanet && houses.ascmc && houses.ascmc.length > 0) {
      const asc = houses.ascmc[0];
      const sun = sunPlanet.lon;
      const moon = moonPlanet.lon;
      const desc = (asc + 180) % 360;
      const isDayBirth = ((sun - desc + 360) % 360) < 180;
      
      let fortune;
      if (isDayBirth) {
        fortune = (asc + moon - sun + 360) % 360;
      } else {
        fortune = (asc + sun - moon + 360) % 360;
      }
      chartPlanets.push({
        id: -3,
        name: '福点',
        nameEn: 'Fortune',
        lon: fortune,
        speed: 0,
        pos: formatPosition(fortune)
      });
    }

    const formatJdDate = (jd) => {
        if (!jd) return null;
        const d = sw.swe_revjul(jd, 1);
        const hrs = Math.floor(d.hour);
        const mins = Math.floor((d.hour - hrs) * 60);
        return new Date(Date.UTC(d.year, d.month - 1, d.day, hrs, mins, 0));
    };

    let nextEclipse = null;
    try {
        const geopos = [lon, lat, 0];
        let nextSolar = null;
        let jd_search = jd_now;
        for (let i = 0; i < 10; i++) {
            const res = sw.swe_sol_eclipse_when_loc(jd_search, getFlag(), geopos, false);
            if (res && res.eclipseContactTimes && res.eclipseContactTimes[0] > 0) {
                if (res.eclipseAttributes && res.eclipseAttributes[0] > 0.001) {
                    let validTrets = res.eclipseContactTimes.filter(t => t > 0);
                    nextSolar = {
                        type: 'solar',
                        name: '日食',
                        maxJd: res.eclipseContactTimes[0],
                        maxDate: formatJdDate(res.eclipseContactTimes[0]),
                        startDate: formatJdDate(Math.min(...validTrets)),
                        endDate: formatJdDate(Math.max(...validTrets)),
                        fraction: res.eclipseAttributes[0]
                    };
                    break;
                }
                jd_search = res.eclipseContactTimes[0] + 10;
            } else {
                break;
            }
        }

        let nextLunar = null;
        jd_search = jd_now;
        for (let i = 0; i < 10; i++) {
            const res = sw.swe_lun_eclipse_when_loc(jd_search, getFlag(), geopos, false);
            if (res && res.data && res.data[0] > 0) {
                if (res.Array && res.Array[1] > 0.001) {
                    let validTrets = res.data.filter(t => t > 0);
                    let name = '月食';
                    if (res.Array[0] >= 1) name = '月全食';
                    else if (res.Array[0] > 0) name = '月偏食';
                    else name = '半影月食';
                    
                    nextLunar = {
                        type: 'lunar',
                        name: name,
                        maxJd: res.data[0],
                        maxDate: formatJdDate(res.data[0]),
                        startDate: formatJdDate(Math.min(...validTrets)),
                        endDate: formatJdDate(Math.max(...validTrets)),
                        fraction: res.Array[0]
                    };
                    break;
                }
                jd_search = res.data[0] + 10;
            } else {
                break;
            }
        }

        if (nextSolar && nextLunar) {
            nextEclipse = nextSolar.maxJd < nextLunar.maxJd ? nextSolar : nextLunar;
        } else {
            nextEclipse = nextSolar || nextLunar;
        }
    } catch (e) {
        console.warn("Error calculating next eclipse:", e);
    }

    return {
      planetaryHour: {
        planet: currentHourPlanet,
        name: planetNames[currentHourPlanet],
        isDay: isDay,
        hourIndex: hoursPassed + 1
      },
      retrogrades: retrogrades,
      nextEclipse: nextEclipse,
      chart: {
        houses: houses.cusps.slice(1, 13).map(h => ({ ...formatPosition(h), lon: h })),
        ascendant: formatPosition(ascendant),
        mc: formatPosition(mc),
        planets: chartPlanets
      }
    };
    });
}

export async function fetchEclipsesForMonth(year, month, lat, lon) {
    return withSwephLock(async () => {
        const sw = await getSweph();
        const eclipses = [];
    
    let jd_start = sw.swe_julday(year, month + 1, 1, 0, 1) - 15;
    let jd_end = sw.swe_julday(year, month + 2, 1, 0, 1) + 15;
    
    const geopos = [lon, lat, 0];
    const ifl = getFlag();
    
    const formatJdDate = (jd) => {
        if (!jd) return null;
        const d = sw.swe_revjul(jd, 1);
        const hrs = Math.floor(d.hour);
        const mins = Math.floor((d.hour - hrs) * 60);
        return new Date(Date.UTC(d.year, d.month - 1, d.day, hrs, mins, 0));
    };

    // Solar Eclipses
    let jd = jd_start;
    while (jd < jd_end) {
        try {
            const res = sw.swe_sol_eclipse_when_loc(jd, ifl, geopos, false);
            if (res && res.eclipseContactTimes && res.eclipseContactTimes[0] > 0) {
                const maxJd = res.eclipseContactTimes[0];
                if (maxJd > jd_end) break;
                
                if (res.eclipseAttributes && res.eclipseAttributes[0] > 0) { // fraction > 0 means visible
                    const maxDate = formatJdDate(maxJd);
                    let validTrets = res.eclipseContactTimes.filter(t => t > 0);
                    let startJd = Math.min(...validTrets);
                    let endJd = Math.max(...validTrets);
                    
                    eclipses.push({
                        type: 'solar',
                        name: '日食',
                        maxJd: maxJd,
                        maxDate: maxDate,
                        startDate: formatJdDate(startJd),
                        endDate: formatJdDate(endJd),
                        fraction: res.eclipseAttributes[0],
                        dateStr: new Date(maxDate.getTime() + 8*3600*1000).toISOString().split('T')[0]
                    });
                }
                jd = maxJd + 10;
            } else {
                break;
            }
        } catch (e) {
            console.warn("Solar eclipse calc error", e);
            break;
        }
    }
    
    // Lunar Eclipses
    jd = jd_start;
    while (jd < jd_end) {
        try {
            const res = sw.swe_lun_eclipse_when_loc(jd, ifl, geopos, false);
            if (res && res.data && res.data[0] > 0) {
                const maxJd = res.data[0];
                if (maxJd > jd_end) break;
                
                if (res.Array && res.Array[1] > 0) { // penumbral magnitude > 0
                    const maxDate = formatJdDate(maxJd);
                    let validTrets = res.data.filter(t => t > 0);
                    let startJd = Math.min(...validTrets);
                    let endJd = Math.max(...validTrets);

                    let name = '月食';
                    if (res.Array[0] >= 1) name = '月全食';
                    else if (res.Array[0] > 0) name = '月偏食';
                    else name = '半影月食';
                    
                    eclipses.push({
                        type: 'lunar',
                        name: name,
                        maxJd: maxJd,
                        maxDate: maxDate,
                        startDate: formatJdDate(startJd),
                        endDate: formatJdDate(endJd),
                        fraction: res.Array[0],
                        dateStr: new Date(maxDate.getTime() + 8*3600*1000).toISOString().split('T')[0]
                    });
                }
                jd = maxJd + 10;
            } else {
                break;
            }
        } catch (e) {
            console.warn("Lunar eclipse calc error", e);
            break;
        }
    }
    
    return eclipses;
    });
}

