// ============================================================
// OVERLAY DEL TOP (monedas o likes)
// ============================================================
//
// Una sola pagina para los dos overlays. Cual de las dos listas
// toca lo dice el servidor que la sirve (/api/lista), no la URL:
// asi el 5600 y el 5700 comparten archivos y cualquier arreglo vale
// para los dos.
//
// Los datos salen de /api/top del mismo servidor, o sea que no hay
// ninguna URL que configurar ni CORS con el que pelearse.
//
// config.json se relee en cada sondeo: titulos, cuantos puestos,
// fuente y escala se aplican sin refrescar la fuente de OBS.
// ============================================================

(() => {
    'use strict';

    const POR_DEFECTO = {
        cuantos: 5,
        sondeoMs: 3000,
        avatares: true,
        mostrarTitulo: false,
        titulos: { monedas: 'TOP DONADORES', likes: 'TOP LIKES' },
        fuente: 'pixel',
        fondoAlpha: 0.75,
        escala: 1,
    };

    let config = POR_DEFECTO;

    // "monedas" o "likes". Lo dice el servidor al arrancar; hasta que
    // conteste se asume monedas para no dejar la pagina en blanco.
    let tipo = 'monedas';

    // ------------------------------------------------------------
    // MODO PRUEBA
    // ------------------------------------------------------------
    //
    // Con ?test en la URL se pinta un top de mentira, para ver como
    // queda lleno sin esperar a que llegue gente. No toca el ranking
    // real ni le pide nada al servidor.
    //
    // Por parametro de URL y no con un boton dentro de la pagina,
    // porque esto se ve en OBS: un boton saldria en pantalla.
    // ------------------------------------------------------------

    const ES_PRUEBA = new URLSearchParams(location.search).has('test');

    const NOMBRES_PRUEBA = [
        'ElChicoDelBarrio', 'Maria Gamer', 'xX_Sniper_Xx', 'Pepito',
        'ana_99', 'ReploidFan', 'DrLight', 'zerofan2000',
        'comandante_x', 'Sigma',
    ];

    function datosDePrueba(cuantos) {
        const lista = [];

        // Numeros que bajan como en un top de verdad: el primero se
        // despega bastante del resto.
        let valor = tipo === 'likes' ? 24500 : 15005;

        for (let i = 0; i < cuantos; i++) {
            lista.push({
                key: 'prueba' + i,
                name: NOMBRES_PRUEBA[i % NOMBRES_PRUEBA.length],
                // Sin foto a proposito: asi tambien se ve que el
                // circulo vacio queda decente cuando a alguien no le
                // carga el avatar.
                avatar: '',
                coins: valor,
                likes: valor,
            });

            valor = Math.max(5, Math.round(valor * (0.52 + (Math.random() * 0.2))));
        }

        return lista;
    }

    const refs = {
        panel: document.querySelector('.top-panel'),
        titulo: document.getElementById('titulo'),
        lista: document.getElementById('lista'),
    };

    // Lo ultimo dibujado, para no rehacer el DOM en cada sondeo: si
    // se rehiciera, la animacion de entrada se reiniciaria sola cada
    // pocos segundos.
    let pintado = '';

    function esc(texto) {
        return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[c]));
    }

    // 1200 -> "1.200", 15005 -> "15.005", 1250000 -> "1.2M".
    //
    // Hasta el millon va entero con separador de miles, como en las
    // capturas de referencia: en un ranking el numero exacto es parte
    // de la gracia, y "15.005" se lee igual de bien que "15k".
    function formatear(n) {
        const valor = Number(n) || 0;

        if (valor >= 1000000) {
            const m = valor / 1000000;
            return (Number.isInteger(m) ? m : m.toFixed(1)) + 'M';
        }

        return valor.toLocaleString('es-ES');
    }

    // ------------------------------------------------------------
    // DIBUJOS
    // ------------------------------------------------------------
    //
    // Medallas, corona, corazon y moneda van en SVG dentro del propio
    // JS y no como PNG: se escalan sin dentarse a cualquier tamano de
    // fuente de OBS y no hay archivos sueltos que se puedan perder al
    // mover la carpeta.
    // ------------------------------------------------------------

    // Oro, plata y bronce. El cuarto en adelante no lleva medalla:
    // solo el numero, igual que en las capturas.
    const METALES = {
        1: { claro: '#ffe27a', medio: '#ffc93c', oscuro: '#a9760a', cinta: '#c9a227' },
        2: { claro: '#f2f5f8', medio: '#cfd8e3', oscuro: '#6f7d8c', cinta: '#9aa7b4' },
        3: { claro: '#f0ac6e', medio: '#d9822b', oscuro: '#8a4a12', cinta: '#a85f18' },
    };

    // Color del aro del avatar. Del cuarto para abajo, gris.
    const ARO_NEUTRO = '#7a8290';

    function medalla(puesto) {
        const m = METALES[puesto];

        if (!m) {
            // Cuarto en adelante: el numero pelado con su punto.
            return `<span class="top-numero">${puesto}.</span>`;
        }

        return `
          <svg class="top-medalla" viewBox="0 0 26 30" aria-hidden="true">
            <path d="M8.5 15 L4.5 29 L10.5 25 L13 30 Z" fill="${m.cinta}" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M17.5 15 L21.5 29 L15.5 25 L13 30 Z" fill="${m.cinta}" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/>
            <circle cx="13" cy="12" r="11" fill="${m.oscuro}" stroke="#000" stroke-width="1.4"/>
            <circle cx="13" cy="12" r="8.6" fill="${m.medio}"/>
            <path d="M13 3.6 A8.6 8.6 0 0 1 21.6 12 A8.6 8.6 0 0 0 13 3.6" fill="${m.claro}"/>
            <text x="13" y="16.4" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" font-weight="700" fill="${m.oscuro}">${puesto}</text>
          </svg>`;
    }

    const CORONA = `
      <svg class="top-corona" viewBox="0 0 28 18" aria-hidden="true">
        <path d="M2.5 16 L2.5 4.5 L8 9.5 L14 2 L20 9.5 L25.5 4.5 L25.5 16 Z"
              fill="#ffc93c" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>
        <circle cx="2.5" cy="3.6" r="1.9" fill="#ffe27a" stroke="#000" stroke-width="1.2"/>
        <circle cx="14" cy="1.9" r="1.9" fill="#ffe27a" stroke="#000" stroke-width="1.2"/>
        <circle cx="25.5" cy="3.6" r="1.9" fill="#ffe27a" stroke="#000" stroke-width="1.2"/>
      </svg>`;

    const ICONOS = {
        likes: `
          <svg class="top-icono" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21.2C12 21.2 3.2 15.7 3.2 9.6A4.9 4.9 0 0 1 12 6.6A4.9 4.9 0 0 1 20.8 9.6C20.8 15.7 12 21.2 12 21.2Z"
                  fill="#ff4757" stroke="#000" stroke-width="1.7" stroke-linejoin="round"/>
          </svg>`,
        monedas: `
          <svg class="top-icono" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9.4" fill="#ffc93c" stroke="#000" stroke-width="1.7"/>
            <circle cx="12" cy="12" r="5.4" fill="#e0a419"/>
          </svg>`,
    };

    // ------------------------------------------------------------
    // TAMANO
    // ------------------------------------------------------------
    //
    // La fuente de OBS puede tener cualquier alto, asi que el tamano
    // sale del alto REAL de la ventana y no de un px fijo. Cada fila
    // se lleva su parte del alto disponible.
    // ------------------------------------------------------------

    function ajustarTamano() {
        const filas = (Number(config.cuantos) || 5) +
            (config.mostrarTitulo ? 1.2 : 0.3);
        const base = (window.innerHeight / filas) * 0.36;
        const escala = Number(config.escala) || 1;

        // Redondeado a px entero: de ahi salen todos los demas
        // tamanos y la fuente de pixel se interpola (y saca flecos de
        // color) en cuanto le toca un tamano fraccionario.
        refs.panel.style.setProperty(
            '--top-size',
            `${Math.max(8, Math.round(base * escala))}px`
        );
    }

    // ------------------------------------------------------------
    // DIBUJO DE LA LISTA
    // ------------------------------------------------------------

    function fila(puesto, entrada, valor) {
        const aro = METALES[puesto] ? METALES[puesto].medio : ARO_NEUTRO;

        const avatar = config.avatares
            ? `<span class="top-foto" style="--aro: ${aro}">
                 ${puesto === 1 ? CORONA : ''}
                 ${entrada.avatar
                     ? `<img src="${esc(entrada.avatar)}" alt="" referrerpolicy="no-referrer" />`
                     : ''}
               </span>`
            : '';

        return `
          <li class="top-fila top-puesto-${puesto}">
            ${medalla(puesto)}
            ${avatar}
            <span class="top-datos">
              <span class="top-nombre">${esc(entrada.name)}</span>
              <span class="top-valor">${ICONOS[tipo]}${esc(formatear(valor))}</span>
            </span>
          </li>`;
    }

    function pintar(entradas) {
        const campo = tipo === 'likes' ? 'likes' : 'coins';

        // Huella: si no cambio nada, no se toca el DOM.
        const huella = `${tipo}|${config.avatares}|` + entradas
            .map((e) => `${e.key}:${e[campo]}:${e.name}`)
            .join('|');

        if (huella === pintado) {
            return;
        }

        pintado = huella;

        if (entradas.length === 0) {
            refs.lista.innerHTML = '<li class="top-vacio">Todavía nadie</li>';
            return;
        }

        refs.lista.innerHTML = entradas
            .map((entrada, i) => fila(i + 1, entrada, entrada[campo]))
            .join('');

        // Las fotos de TikTok caducan: si una no carga se esconde y
        // queda el circulo vacio, en vez de un icono de imagen rota.
        refs.lista.querySelectorAll('.top-foto img').forEach((img) => {
            img.addEventListener('error', () => {
                img.style.display = 'none';
            }, { once: true });
        });
    }

    // ------------------------------------------------------------
    // SONDEO
    // ------------------------------------------------------------

    async function leerConfig() {
        try {
            const res = await fetch('config.json', { cache: 'no-store' });
            const leido = await res.json();

            config = Object.assign({}, POR_DEFECTO, leido);
            config.titulos = Object.assign(
                {}, POR_DEFECTO.titulos, leido.titulos || {}
            );
        } catch {
            // config.json a medio guardar: se sigue con el ultimo bueno.
        }

        document.documentElement.dataset.fuente =
            config.fuente === 'normal' ? 'normal' : 'pixel';

        refs.panel.style.setProperty(
            '--top-fondo-alpha',
            String(Number(config.fondoAlpha ?? 0.75))
        );

        refs.titulo.textContent = config.titulos[tipo] ?? '';
        refs.titulo.hidden = !config.mostrarTitulo;

        ajustarTamano();
    }

    async function refrescar() {
        await leerConfig();

        const cuantos = Math.max(1, Math.min(20, Number(config.cuantos) || 5));

        if (ES_PRUEBA) {
            pintar(datosDePrueba(cuantos));
            return;
        }

        try {
            const res = await fetch(`/api/top?limit=${cuantos}`, {
                cache: 'no-store',
            });
            const datos = await res.json();

            // El servidor manda SU lista ya elegida, no las dos.
            pintar(datos.lista ?? []);
        } catch {
            // La app no esta levantada o se reinicio: se deja lo
            // ultimo que se vio en vez de vaciar el overlay en
            // pantalla.
        }
    }

    window.addEventListener('resize', ajustarTamano);

    // setTimeout que se reagenda y no setInterval: asi cambiar
    // "sondeoMs" en config.json se aplica a la siguiente vuelta.
    async function vuelta() {
        await refrescar();

        setTimeout(vuelta, Math.max(500, Number(config.sondeoMs) || 3000));
    }

    // Primero hay que saber QUE lista somos; despues ya se puede
    // dibujar. Si la peticion falla se sigue con "monedas".
    fetch('/api/lista', { cache: 'no-store' })
        .then((res) => res.json())
        .then((datos) => {
            if (datos && datos.tipo) {
                tipo = datos.tipo;
            }
        })
        .catch(() => {})
        .finally(vuelta);
})();
