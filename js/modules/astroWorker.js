/* js/modules/astroWorker.js */
import sweph from 'sweph-wasm';

let swInstance = null;
let epheLoaded = false;
let workerInitialized = false;

const SE_SUN = 0, SE_MOON = 1, SE_MERCURY = 2, SE_VENUS = 3, SE_MARS = 4;
const SE_JUPITER = 5, SE_SATURN = 6, SE_URANUS = 7, SE_NEPTUNE = 8, SE_PLUTO = 9;
const SE_TRUE_NODE = 11, SE_MEAN_APOG = 12, SE_CHIRON = 15;
const planets = [SE_SUN, SE_MERCURY, SE_VENUS, SE_MARS, SE_JUPITER, SE_SATURN, SE_URANUS, SE_NEPTUNE, SE_PLUTO];
const aspects = [0, 60, 90, 120, 180, 240, 270, 300]; // 包括所有方向的主要相位

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

function findMoonVoidOfCourse(sw, jd_start, jd_end) {
  const moonSpeedThreshold = 13.2; // degrees per day
  const step = 1 / 24; // hourly checks

  let voc_periods = [];
  let in_voc = false;
  let voc_start = null;

  for (let jd = jd_start; jd <= jd_end; jd += step) {
    const moonRes = sw.swe_calc_ut(jd, SE_MOON, getFlag());
    const moonLon = moonRes[0];
    const moonSpeed = moonRes[3];

    const isSlow = Math.abs(moonSpeed) < moonSpeedThreshold;

    if (isSlow && !in_voc) {
      in_voc = true;
      voc_start = jd;
    } else if (!isSlow && in_voc) {
      in_voc = false;
      voc_periods.push({ start: voc_start, end: jd });
    }
  }

  if (in_voc) {
    voc_periods.push({ start: voc_start, end: jd_end });
  }

  return voc_periods;
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
          let mid_diff; // Define mid_diff outside the loop
          for (let i = 0; i < 20; i++) {
            const jd_mid = (jd_left + jd_right) / 2;
            mid_diff = getAngleDiff(getPosition(sw, SE_MOON, jd_mid), getPosition(sw, p, jd_mid));
            let err_left = getAngleDiff(getPosition(sw, SE_MOON, jd_left), getPosition(sw, p, jd_left)) - asp;
            if (err_left > 180) err_left -= 360; if (err_left < -180) err_left += 360;
            let err_mid = mid_diff - asp;
            if (err_mid > 180) err_mid -= 360; if (err_mid < -180) err_mid += 360;

            if (err_left * err_mid <= 0) {
              jd_right = jd_mid;
            } else {
              jd_left = jd_mid;
            }
          }
          const exact_jd = (jd_left + jd_right) / 2;
          aspects_found.push({
            jd: exact_jd,
            planet: p,
            aspect: asp > 180 ? 360 - asp : asp, // 归一化为180度以内
            orb: Math.abs(mid_diff - asp)
          });
        }
      }
      prev_diff = curr_diff;
    }
  }
  
  // 按照时间(jd)对发现的所有相位进行排序！这一步对正确找到"最后一次相位"至关重要
  aspects_found.sort((a, b) => a.jd - b.jd);
  return aspects_found;
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

function calculateVocData(sw, dateParam, ruleStr) {
  const rule = ruleStr === '7' ? 7 : 10;
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
    : [SE_SUN, SE_MERCURY, SE_VENUS, SE_MARS, SE_JUPITER, SE_SATURN, SE_URANUS, SE_NEPTUNE, SE_PLUTO]; // 现代10星：9个行星（不包括月亮本身）
    
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
    angle: a.aspect,
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
      angle: last_aspect.aspect
    } : null,
    timeline: displayEvents
  };
}

function calculateAstroDetails(sw, dateParam, lat, lon) {
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

  const extendedPlanets = [SE_MOON, ...planets, SE_TRUE_NODE, SE_MEAN_APOG, SE_CHIRON];

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
}

function calculateEclipsesForMonth(sw, year, month, lat, lon) {
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
}

self.onmessage = function(e) {
  const { type, data } = e.data;
  try {
    // Only allow INIT_SW if not initialized, reject other messages until initialized
    if (!workerInitialized && type !== 'INIT_SW') {
      self.postMessage({ type: 'ERROR', error: 'Worker not initialized yet. Please wait for INIT_COMPLETE.' });
      return;
    }

    switch (type) {
      case 'INIT_SW':
        // Initialize Swiss Ephemeris with ephemeris files
        (async () => {
          try {
            swInstance = await sweph.init();
            if (swInstance) {
              workerInitialized = true;
            } else {
              throw new Error('sweph.init() returned null or undefined');
            }
            const epheDir = '/ephe';
            if (!swInstance.wasm.FS.analyzePath(epheDir, true).exists) {
              swInstance.wasm.FS.mkdir(epheDir);
            }

            const files = ['seas_18.se1', 'semo_18.se1', 'sepl_18.se1'];
            // In worker context, we need to use the main thread's base path
            // The main thread will pass the base URL in the init message
            let basePath = data?.basePath || '/';
            basePath = basePath.replace(/\/+$/, '') + '/';
            const baseUrl = basePath + 'ephe/';

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
                }
              } catch (err) {
                // Ignore fetch errors silently to reduce noise
              }
            }

            if (loadedCount > 0) {
              // Allocate string for C function
              const ptr = swInstance.wasm._malloc(epheDir.length + 1);
              swInstance.wasm.stringToUTF8(epheDir, ptr, epheDir.length + 1);
              swInstance.wasm._swe_set_ephe_path(ptr);
              swInstance.wasm._free(ptr);
              epheLoaded = true;
              console.log(`[Astronomy] Loaded ${loadedCount} ephemeris files.`);
              self.postMessage({ type: 'INIT_COMPLETE' });
            } else {
              epheLoaded = false;
              console.log('[Astronomy] No ephemeris loaded, using Moshier fallback.');
              self.postMessage({ type: 'INIT_COMPLETE' });
            }
          } catch (error) {
            console.error('[Astronomy Worker] Initialization error:', error);
            self.postMessage({ type: 'ERROR', error: error.message });
          }
        })();
        break;

      case 'CALC_ASPECTS':
        const aspectsFound = findAllAspects(swInstance, data.jd_start, data.jd_end, data.planets_to_use);
        self.postMessage({ type: 'ASPECTS_RESULT', data: aspectsFound });
        break;

      case 'CALC_VOC':
        if (!workerInitialized || !swInstance) {
          self.postMessage({ type: 'ERROR', error: 'Worker not properly initialized' });
          break;
        }
        const vocData = calculateVocData(swInstance, data.dateParam, data.ruleStr);
        self.postMessage({ type: 'VOC_RESULT', data: vocData });
        break;

      case 'CALC_ASTRO_DETAILS':
        if (!workerInitialized || !swInstance) {
          self.postMessage({ type: 'ERROR', error: 'Worker not properly initialized' });
          break;
        }
        const astroDetails = calculateAstroDetails(swInstance, data.dateParam, data.lat, data.lon);
        self.postMessage({ type: 'ASTRO_DETAILS_RESULT', data: astroDetails });
        break;

      case 'CALC_ECLIPSES':
        const eclipses = calculateEclipsesForMonth(swInstance, data.year, data.month, data.lat, data.lon);
        self.postMessage({ type: 'ECLIPSES_RESULT', data: eclipses });
        break;

      case 'CALC_POSITIONS':
        const positions = {};
        for (const planet of data.planets) {
          positions[planet] = getPosition(swInstance, planet, data.jd);
        }
        self.postMessage({ type: 'POSITIONS_RESULT', data: positions });
        break;

      default:
        self.postMessage({ type: 'ERROR', error: 'Unknown message type' });
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', error: error.message });
  }
};