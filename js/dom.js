
/* js/dom.js */
export const UI = {
    // 日历相关
    calGrid: document.getElementById('cal-grid'),
    moonPhase: document.getElementById('moon-phase'),
    moonIllum: document.getElementById('moon-illum'),
    moonAngle: document.getElementById('moon-angle'), 
    calTitleDate: document.getElementById('cal-title-year-month'),
    
    // 兼容接口
    gzBox: document.getElementById('gz-container'),
    time: document.getElementById('time-display'),
    timeDelta: document.getElementById('time-delta'), 
    pentad: document.getElementById('pentad-display'),
    ring: document.getElementById('cw-ring'),
    deg: document.getElementById('deg-num'),
    dir: document.getElementById('dir-txt'),
    dot: document.getElementById('level-dot'),
    
    // Controls
    stepSel: document.getElementById('step-selector'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnReset: document.getElementById('btn-reset-now'),
    btnCopyInfo: document.getElementById('btn-copy-info'),
    btnSettings: document.getElementById('btn-settings'),
    
    // Modal
    modal: document.getElementById('settings-modal'),
    inputTime: document.getElementById('set-time'),
    inputTimeSolar: document.getElementById('set-time-solar'),
    inputLon: document.getElementById('set-lon'),
    inputLat: document.getElementById('set-lat'),
    btnCancel: document.getElementById('btn-cancel'),
    btnConfirm: document.getElementById('btn-confirm'),
    // New City Selectors
    selProv: document.getElementById('sel-prov'),
    selCity: document.getElementById('sel-city'),
    selDist: document.getElementById('sel-dist'),
    
    // Astro
    ayanVal: document.getElementById('ayanamsa-val'),
    sunTrop: document.getElementById('sun-trop'),
    sunSid:  document.getElementById('sun-sid'),
    sunMans: document.getElementById('sun-mans'),
    sunOv:   document.getElementById('sun-ov'),
    moonTrop: document.getElementById('moon-trop'),
    moonSid:  document.getElementById('moon-sid'),
    moonMans: document.getElementById('moon-mans'),
    moonOv:   document.getElementById('moon-ov'),
    
    // Luck (Updated)
    luckXiu: document.getElementById('luck-xiu'),           // 三合宿
    luckLunarXiu: document.getElementById('luck-lunar-xiu'), // 农历宿 (新增)
    luckOmens: document.getElementById('luck-omens'),
    
    // Solar Term (New)
    termPivot: document.getElementById('term-pivot'),
    termInfo: document.getElementById('term-info'),

    // VOC Monitor (New)
    vocBox: document.getElementById('voc-box'),
    vocStatusText: document.getElementById('voc-status-text'),
    vocStatusIcon: document.getElementById('voc-status-icon'),
    vocDetails: document.getElementById('voc-details'),
    vocAspectList: document.getElementById('voc-aspect-list'),
    vocRuleRadios: document.querySelectorAll('input[name="voc-rule"]'),

    // Astro Details (New)
    astroDetailsBox: document.getElementById('astro-details-box'),
    astroHeader: document.getElementById('astro-header'),
    astroDetails: document.getElementById('astro-details'),
    planetaryHourInfo: document.getElementById('planetary-hour-info'),
    retrogradeInfo: document.getElementById('retrograde-info'),
    btnViewHoroscope: document.getElementById('btn-view-horoscope'),
    horoscopeModal: document.getElementById('horoscope-modal'),
    horoscopeDataContainer: document.getElementById('horoscope-data-container'),
    btnCloseHoroscope: document.getElementById('btn-close-horoscope'),
    
    // Radix Settings (New)
    btnToggleRadix: document.getElementById('btn-toggle-radix'),
    radixSettingsPanel: document.getElementById('radix-settings-panel'),
    inputRadixDate: document.getElementById('radix-date'),
    inputRadixTime: document.getElementById('radix-time'),
    inputRadixLon: document.getElementById('radix-lon'),
    inputRadixLat: document.getElementById('radix-lat'),
    btnApplyRadix: document.getElementById('btn-apply-radix'),
    btnClearRadix: document.getElementById('btn-clear-radix'),

    // Misc
    gpsIndicator: document.getElementById('gps-indicator'),
    gpsDot: document.querySelector('.gps-dot'),
    gpsCoords: document.getElementById('gps-coords'),
    gpsAcc: document.getElementById('gps-accuracy'),
    modeDisplay: document.getElementById('mode-display'),
    tsTime: document.getElementById('true-solar-display'),
    legalDate: document.getElementById('date-display'),
    // 九宫飞星
    btnJiugong: document.getElementById('btn-jiugong'),
    jiugongOverlay: document.getElementById('jiugong-overlay'),
    jgStartPalace: document.getElementById('jg-start-palace'),
    jgStartNum: document.getElementById('jg-start-num'),
    jgDirection: document.getElementById('jg-direction'),
    btnFlyStars: document.getElementById('btn-fly-stars'),
    jiugongGrid: document.getElementById('jiugong-grid'),
    jgStartNum: document.getElementById('jg-start-num'),
    jgDirection: document.getElementById('jg-direction'),
    btnFlyStars: document.getElementById('btn-fly-stars'),
    jiugongGrid: document.getElementById('jiugong-grid'),

    legalTime: document.getElementById('time-display')
};
