// ============================================================
// OVERLAY DE ORDENES Y CASTIGOS (juegos de consola)
// ============================================================
//
// Pide a la app lo que el streamer tiene que hacer ahora mismo
// (/api/ordenes) y lo dibuja.
//
// La cuenta atras NO se pide al servidor cada frame: se pide de vez
// en cuando (sondeoMs) y entre sondeo y sondeo se descuenta aqui con
// requestAnimationFrame. Asi baja suave aunque el sondeo sea lento,
// y si la app se cae el cartel se vacia solo en vez de quedarse
// congelado en pantalla mintiendo.
// ============================================================

(async () => {
    'use strict';

    const panel = document.getElementById('panel');

    // Ejemplo para colocar la fuente en OBS sin esperar a que llegue
    // gente. Va por parametro de URL y no por un boton: la pagina se
    // ve en OBS, y un boton saldria en pantalla.
    const MODO_PRUEBA = new URLSearchParams(location.search).has('test');

    let config = {
        maximo: 4,
        sondeoMs: 400,
        fuente: 'pixel',
        escala: 1,
        fondoAlpha: 0.82,
        abajo: false,
        mostrarUsuario: true,
        mostrarImagen: true,
    };

    // Lo ultimo que dijo el servidor, con el momento en que lo dijo:
    // de ahi sale la cuenta atras interpolada.
    let ordenes = [];
    let recibidoEn = performance.now();

    function aplicarConfig() {
        document.body.dataset.fuente = config.fuente === 'normal' ? 'normal' : 'pixel';
        document.body.dataset.abajo = config.abajo ? '1' : '0';

        // El tamaño sale del alto REAL de la ventana de OBS, no de un
        // px fijo: asi la misma pagina sirve en una esquina chica y a
        // pantalla completa.
        const base = Math.max(14, Math.round(window.innerHeight * 0.075 * (Number(config.escala) || 1)));

        panel.style.setProperty('--ord-size', `${base}px`);
        panel.style.setProperty('--ord-fondo', String(config.fondoAlpha ?? 0.82));
    }

    async function leerConfig() {
        try {
            const res = await fetch('config.json', { cache: 'no-store' });
            const data = await res.json();
            config = { ...config, ...data };
        } catch {
            // config.json a medio guardar: se sigue con la ultima buena.
        }

        aplicarConfig();
    }

    async function pedir() {
        if (MODO_PRUEBA) {
            return;
        }

        try {
            const res = await fetch('/api/ordenes', { cache: 'no-store' });
            const data = await res.json();

            ordenes = Array.isArray(data.ordenes) ? data.ordenes : [];
            recibidoEn = performance.now();
        } catch {
            // La app no responde (se esta reiniciando). No se borra lo
            // que hay: el descuento local lo apagara solo cuando toque.
        }
    }

    function ordenesDePrueba() {
        return [
            {
                id: 1, kind: 'restriccion', label: 'NO PUEDES ATACAR',
                user: 'espectador_1', image: '', seconds: 10, remaining: 7.4,
            },
            {
                id: 2, kind: 'orden', label: 'SALTA',
                user: 'otro_espectador', image: '', seconds: 0, remaining: 4,
            },
            {
                id: 3, kind: 'restriccion', label: 'JUEGA CON UNA MANO',
                user: 'alguien_mas', image: '', seconds: 20, remaining: 2.1,
            },
        ];
    }

    function tarjetaHTML(o, restante) {
        const esRestriccion = o.kind === 'restriccion';
        const poco = esRestriccion && restante <= 3;

        const segundos = esRestriccion
            ? `<span class="ord-segundos">${Math.ceil(restante)}</span>`
            : '';

        const barra = esRestriccion && o.seconds > 0
            ? `<span class="ord-barra"><i style="width:${Math.max(0, Math.min(100, (restante / o.seconds) * 100))}%"></i></span>`
            : '';

        const img = config.mostrarImagen && o.image
            ? `<img class="ord-img" src="${o.image}" alt="" onerror="this.remove()" />`
            : '';

        const quien = config.mostrarUsuario && o.user
            ? `<span class="ord-quien">${escapar(o.user)}</span>`
            : '';

        return `
          <div class="ord-item ${esRestriccion ? 'ord-restriccion' : 'ord-orden'} ${poco ? 'ord-poco' : ''}" data-id="${o.id}">
            ${img}
            <div class="ord-texto">
              <span class="ord-label">${escapar(o.label)}</span>
              ${quien}
            </div>
            ${segundos}
            ${barra}
          </div>`;
    }

    function escapar(t) {
        return String(t ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // Se redibuja entero solo cuando cambia QUE hay; mientras solo
    // baja el numero, se tocan los nodos que ya existen. Rehacer el
    // HTML cada frame reiniciaria la animacion de entrada sin parar.
    let firmaAnterior = '';

    function pintar() {
        const pasado = (performance.now() - recibidoEn) / 1000;

        const lista = (MODO_PRUEBA ? ordenesDePrueba() : ordenes)
            .map((o) => ({ o, restante: Math.max(0, Number(o.remaining ?? 0) - (MODO_PRUEBA ? 0 : pasado)) }))
            .filter(({ restante }) => restante > 0)
            .slice(-Math.max(1, Number(config.maximo) || 4));

        const firma = lista.map(({ o }) => `${o.id}:${o.label}`).join('|');

        if (firma !== firmaAnterior) {
            firmaAnterior = firma;
            panel.innerHTML = lista.map(({ o, restante }) => tarjetaHTML(o, restante)).join('');
            return;
        }

        // Mismos carteles: solo se actualizan los numeros y la barra.
        for (const { o, restante } of lista) {
            const nodo = panel.querySelector(`[data-id="${o.id}"]`);

            if (!nodo) continue;

            const seg = nodo.querySelector('.ord-segundos');
            if (seg) seg.textContent = String(Math.ceil(restante));

            const barra = nodo.querySelector('.ord-barra i');
            if (barra && o.seconds > 0) {
                barra.style.width = `${Math.max(0, Math.min(100, (restante / o.seconds) * 100))}%`;
            }

            nodo.classList.toggle('ord-poco', o.kind === 'restriccion' && restante <= 3);
        }
    }

    await leerConfig();
    await pedir();

    setInterval(async () => {
        await leerConfig();
        await pedir();
    }, Math.max(150, Number(config.sondeoMs) || 400));

    window.addEventListener('resize', aplicarConfig);

    (function bucle() {
        pintar();
        requestAnimationFrame(bucle);
    })();
})();
