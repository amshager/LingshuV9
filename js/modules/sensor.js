/* js/modules/sensor.js */
import { UI } from '../dom.js';

export function initSensorSystem(onUpdate) {
    // onUpdate 是一个回调函数，接收 (heading, beta, gamma)
    
    function handleAndroidAbsolute(e) {
        if(e.alpha !== null) {
            const h = 360 - e.alpha;
            requestAnimationFrame(() => onUpdate(h, e.beta, e.gamma));
        }
    }

    function handleStandard(e) {
        let h = null;
        if (e.webkitCompassHeading) {
            h = e.webkitCompassHeading;
            requestAnimationFrame(() => onUpdate(h, e.beta, e.gamma));
        } else if (!('ondeviceorientationabsolute' in window)) {
            if (e.absolute === true || e.alpha !== null) {
                 h = 360 - e.alpha;
                 requestAnimationFrame(() => onUpdate(h, e.beta, e.gamma));
            }
        } else {
            // 仅更新水平仪
            requestAnimationFrame(() => onUpdate(null, e.beta, e.gamma));
        }
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