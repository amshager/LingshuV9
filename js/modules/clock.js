/* js/modules/clock.js */
import { UI } from '../dom.js';

export function mountClock() {
    function tick() {
        const now = new Date();
        const h = now.getHours().toString().padStart(2, '0');
        const m = now.getMinutes().toString().padStart(2, '0');
        UI.time.innerText = `${h}:${m}`;
        UI.date.innerText = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate()}`;
    }
    setInterval(tick, 1000);
    tick();
    console.log("Module: Clock Mounted");
}