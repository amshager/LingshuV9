/* js/modules/compass.js */
import { UI } from '../dom.js';

let lastHeading = 0, cumulatedAngle = 0;
const mountains = ['子','癸','丑','艮','寅','甲','卯','乙','辰','巽','巳','丙','午','丁','未','坤','申','庚','酉','辛','戌','乾','亥','壬'];

function buildCompass() {
    if(!UI.ring) return;
    for(let j=0; j<8; j++) {
        const d = document.createElement('div'); d.className = 'cw-divider cardinal';
        d.style.transform = `rotate(${22.5 + j * 45}deg)`; UI.ring.appendChild(d);
    }
    for(let i=0; i<360; i+=15) {
        const l = document.createElement('div'); l.className = 'cw-shan'; l.innerText = mountains[i/15]; l.style.transform = `rotate(${i}deg)`; UI.ring.appendChild(l);
        const t = document.createElement('div'); t.className = 'cw-divider'; t.style.height='4px'; t.style.top='0'; t.style.transform = `rotate(${i+7.5}deg)`; UI.ring.appendChild(t);
    }
}

function updateView(heading, beta, gamma) {
    if (heading !== null) {
        let delta = heading - lastHeading;
        while (delta < -180) delta += 360; while (delta > 180) delta -= 360;
        if (Math.abs(delta) > 0.2) {
            cumulatedAngle += delta; lastHeading = heading;
            UI.ring.style.transform = `rotate(${-cumulatedAngle}deg)`;
            UI.deg.innerText = Math.round(heading);
            const dirs = ['正北','东北','正东','东南','正南','西南','正西','西北','正北'];
            UI.dir.innerText = dirs[Math.round(heading / 45)];
        }
    }
    if(beta!==null && gamma!==null) {
        let x = gamma/2, y = beta/2, dist = Math.sqrt(x*x+y*y);
        if(dist>8) { x*=(8/dist); y*=(8/dist); }
        UI.dot.style.transform = `translate(${x}px,${y}px)`;
        if(Math.abs(beta)<4 && Math.abs(gamma)<4) UI.dot.classList.add('centered'); else UI.dot.classList.remove('centered');
    }
}

export function mountCompass() {
    buildCompass();
    if('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', e => e.alpha!==null && requestAnimationFrame(()=>updateView(360-e.alpha, e.beta, e.gamma)));
    window.addEventListener('deviceorientation', e => {
        let h = e.webkitCompassHeading || (e.absolute && e.alpha ? 360-e.alpha : null);
        requestAnimationFrame(()=>updateView(h, e.beta, e.gamma));
    });
}