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