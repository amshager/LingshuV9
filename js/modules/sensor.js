/* js/modules/sensor.js */
import { UI } from '../dom.js';

export function initSensorSystem(onUpdate) {
    let ticking = false; // 节流标志位
    let lastHeading = 0;
    let lastBeta = 0;
    let lastGamma = 0;

    // 统一的更新函数，使用 requestAnimationFrame 节流
    function updateUI() {
        onUpdate(lastHeading, lastBeta, lastGamma);
        ticking = false;
    }

    function requestUpdate(h, b, g) {
        if (h !== null) lastHeading = h;
        if (b !== null) lastBeta = b;
        if (g !== null) lastGamma = g;

        if (!ticking) {
            requestAnimationFrame(updateUI);
            ticking = true;
        }
    }
    
    function handleAndroidAbsolute(e) {
        if(e.alpha !== null) {
            const h = 360 - e.alpha;
            requestUpdate(h, e.beta, e.gamma);
        }
    }

    function handleStandard(e) {
        let h = null;
        if (e.webkitCompassHeading) {
            // iOS
            h = e.webkitCompassHeading;
        } else if (!('ondeviceorientationabsolute' in window)) {
            // Android non-absolute fallback
            if (e.absolute === true || e.alpha !== null) {
                 h = 360 - e.alpha;
            }
        }
        // 无论是否有 heading，都需要更新水平仪数据 (beta, gamma)
        requestUpdate(h, e.beta, e.gamma);
    }

    function startListening() {
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', handleAndroidAbsolute, true);
        }
        window.addEventListener('deviceorientation', handleStandard, true);
    }

    // 权限逻辑
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        UI.btnStart.style.display = 'block';
        UI.btnStart.innerText = "点击开启罗盘";
        UI.btnStart.addEventListener('click', () => {
            DeviceOrientationEvent.requestPermission().then(res => {
                if(res === 'granted') {
                    UI.btnStart.style.display = 'none';
                    startListening();
                } else {
                    alert('需开启权限以观测风水');
                }
            });
        });
    } else {
        startListening();
    }
}
