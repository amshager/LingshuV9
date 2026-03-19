/* js/app.js */
import { mountCalendar } from './modules/calendar.js';
import { mountCompass } from './modules/compass.js';
import { mountBazi } from './modules/bazi.js';

// 初始化函数
const init = () => {
    mountCalendar();
    mountCompass();
    mountBazi();
    
    // Theme toggle logic
    const brandTitle = document.getElementById('brand-title-top');
    if (brandTitle) {
        brandTitle.addEventListener('click', () => {
            document.body.classList.toggle('theme-sapphire');
            const isSapphire = document.body.classList.contains('theme-sapphire');
            localStorage.setItem('lingshu_theme', isSapphire ? 'sapphire' : 'default');
        });
    }
    
    // Restore theme from local storage
    if (localStorage.getItem('lingshu_theme') === 'sapphire') {
        document.body.classList.add('theme-sapphire');
    }

    // About Modal Logic
    const btnAbout = document.getElementById('btn-about');
    const modalAbout = document.getElementById('about-modal');
    const btnCloseAbout = document.getElementById('btn-close-about');
    
    if (btnAbout && modalAbout) {
        btnAbout.addEventListener('click', () => {
            modalAbout.classList.remove('hidden');
            
            const state = window.__LingshuAstroState || {};
            const elSweph = document.getElementById('status-sweph');
            const elMoshier = document.getElementById('status-moshier');
            
            if (!state.workerInit) {
                elSweph.innerHTML = '<span style="color:#f44336;">🔴 初始化失败或未响应</span>';
                elMoshier.innerHTML = '<span style="color:#f44336;">🔴 外包 Worker 线程异常</span>';
            } else if (state.epheLoaded) {
                elSweph.innerHTML = `<span style="color:#4CAF50;">🟢 高精度星历已加载 (${state.loadedCount} 个文件)</span><br><span style="font-size:0.8em;color:var(--text-sub);">通过网络或离线缓存挂载</span>`;
                elMoshier.innerHTML = '<span style="color:var(--text-sub);">⚪ 待机中 (备用星历降级)</span>';
            } else {
                elSweph.innerHTML = '<span style="color:#ff9800;">🟡 高精度数据缺失(网络或路径错误)</span>';
                elMoshier.innerHTML = '<span style="color:#4CAF50;">🟢 生效中 (使用纯数学硬解)</span><br><span style="font-size:0.8em;color:var(--text-sub);">降级方案运行中，精度略低</span>';
            }
        });
        
        if (btnCloseAbout) {
            btnCloseAbout.addEventListener('click', () => {
                modalAbout.classList.add('hidden');
            });
        }
        
        // 点击外部关闭
        modalAbout.addEventListener('click', (e) => {
            if (e.target === modalAbout) {
                modalAbout.classList.add('hidden');
            }
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(registration => {
            console.log('SW registered');
        }).catch(err => {
            console.log('SW registration failed: ', err);
        });
    }

    console.log("Lingshu App Initialized");
};

// 健壮的加载逻辑：
// 如果通过 bundler 加载，app.js 执行时 DOM 可能已经 ready 了，
// 此时 DOMContentLoaded 事件不会再触发。
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM 已经准备好了 (Interactive 或 Complete)
    init();
}