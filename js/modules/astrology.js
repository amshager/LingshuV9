
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
            let basePath = '/';
            if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) {
                basePath = import.meta.env.BASE_URL;
            } else {
                // Fallback for non-Vite environments
                basePath = window.location.pathname.replace(/\/[^\/]*$/, '/');
            }
            
            // Ensure basePath ends with '/' and doesn't duplicate slashes when combined
            basePath = basePath.replace(/\/+$/, '') + '/';
            const baseUrl = new URL('ephe/', window.location.origin + basePath).href;

            console.log(`[Astronomy] Loading ephemeris files from: ${baseUrl}`);
            
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

// Web Worker for heavy astronomical calculations
let astroWorker = null;
let workerPromise = null;

function initAstroWorker() {
    if (astroWorker) {
        console.log('[Main] Worker already initialized, returning existing worker');
        return Promise.resolve(astroWorker);
    }
    if (workerPromise) {
        console.log('[Main] Worker initialization in progress, waiting...');
        return workerPromise;
    }

    console.log('[Main] Starting new worker initialization');
    workerPromise = new Promise((resolve, reject) => {
        try {
            // Determine the correct path for the worker file
            let workerPath = './js/modules/astroWorker.js';
            if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) {
                workerPath = import.meta.env.BASE_URL + 'js/modules/astroWorker.js';
            }

            const worker = new Worker(workerPath, { type: 'module' });

            worker.onmessage = function(e) {
                const { type, data, error } = e.data;
                console.log(`[Main] Worker message received: ${type}`);
                if (type === 'INIT_COMPLETE') {
                    console.log('[Main] Worker initialization completed successfully');
                    astroWorker = worker; // Only set astroWorker after successful initialization
                    resolve(astroWorker);
                } else if (type === 'ERROR') {
                    console.error('[Main] Worker initialization error:', error);
                    reject(new Error(error));
                }
            };

            worker.onerror = function(error) {
                console.error('Worker error:', error);
                reject(new Error('Worker initialization failed: ' + error.message));
            };

            // Add timeout for worker initialization
            setTimeout(() => {
                reject(new Error('Worker initialization timeout'));
            }, 10000);

            // Initialize the worker
            let basePath = '/';
            if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) {
                basePath = import.meta.env.BASE_URL;
            } else {
                // Fallback for non-Vite environments
                basePath = window.location.pathname.replace(/\/[^\/]*$/, '/');
            }
            console.log(`[Main] Sending INIT_SW message with basePath: ${basePath}`);
            worker.postMessage({ type: 'INIT_SW', data: { basePath } });
        } catch (error) {
            reject(new Error('Failed to create worker: ' + error.message));
        }
    });

    return workerPromise;
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
    const worker = await initAstroWorker();

    return new Promise((resolve, reject) => {
        const messageId = Date.now() + Math.random();

        const handleMessage = function(e) {
            const { type, data, error } = e.data;
            if (type === 'VOC_RESULT') {
                worker.removeEventListener('message', handleMessage);
                resolve(data);
            } else if (type === 'ERROR') {
                worker.removeEventListener('message', handleMessage);
                reject(new Error(error));
            }
        };

        worker.addEventListener('message', handleMessage);
        console.log('[Main] Sending CALC_VOC message');
        worker.postMessage({
            type: 'CALC_VOC',
            data: { dateParam, ruleStr }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            worker.removeEventListener('message', handleMessage);
            reject(new Error('VOC calculation timeout'));
        }, 30000);
    });
}

export async function fetchAstroDetailsLocal(dateParam, lat, lon) {
    const worker = await initAstroWorker();

    return new Promise((resolve, reject) => {
        const messageId = Date.now() + Math.random();

        const handleMessage = function(e) {
            const { type, data, error } = e.data;
            if (type === 'ASTRO_DETAILS_RESULT') {
                worker.removeEventListener('message', handleMessage);
                resolve(data);
            } else if (type === 'ERROR') {
                worker.removeEventListener('message', handleMessage);
                reject(new Error(error));
            }
        };

        worker.addEventListener('message', handleMessage);
        console.log('[Main] Sending CALC_ASTRO_DETAILS message');
        worker.postMessage({
            type: 'CALC_ASTRO_DETAILS',
            data: { dateParam, lat, lon }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            worker.removeEventListener('message', handleMessage);
            reject(new Error('Astro details calculation timeout'));
        }, 30000);
    });
}

export async function fetchEclipsesForMonth(year, month, lat, lon) {
    const worker = await initAstroWorker();

    return new Promise((resolve, reject) => {
        const messageId = Date.now() + Math.random();

        const handleMessage = function(e) {
            const { type, data, error } = e.data;
            if (type === 'ECLIPSES_RESULT') {
                worker.removeEventListener('message', handleMessage);
                resolve(data);
            } else if (type === 'ERROR') {
                worker.removeEventListener('message', handleMessage);
                reject(new Error(error));
            }
        };

        worker.addEventListener('message', handleMessage);
        console.log('[Main] Sending CALC_ECLIPSES message');
        worker.postMessage({
            type: 'CALC_ECLIPSES',
            data: { year, month, lat, lon }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            worker.removeEventListener('message', handleMessage);
            reject(new Error('Eclipses calculation timeout'));
        }, 30000);
    });
}

