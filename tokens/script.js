// ============================================================
// OVERLAY DE TOKENS
// ============================================================
//
// Muestra a los espectadores que tienen tokens SIN GASTAR, de mas
// a menos. Los que no tienen no salen: el filtro lo hace el
// servidor (listWithTokens en src/tokens.ts), asi que aqui nunca
// llega una fila con 0.
//
// Los datos salen de /api/tokens del mismo servidor que sirve esta
// pagina (el 5900), o sea que no hay ninguna URL que configurar ni
// CORS con el que pelearse.
//
// config.json se relee en cada sondeo: cuantos puestos, fuente y
// escala se aplican sin refrescar la fuente de OBS.
// ============================================================

(() => {
    'use strict';

    const POR_DEFECTO = {
        cuantos: 20,
        porPagina: 5,
        rotarMs: 4000,
        sondeoMs: 2500,
        avatares: true,
        mostrarTitulo: true,
        titulo: 'TOKENS',
        mostrarPrecio: true,
        fuente: 'pixel',
        fondoAlpha: 0.75,
        escala: 1,
    };

    let config = POR_DEFECTO;

    // ------------------------------------------------------------
    // PAGINACION
    // ------------------------------------------------------------
    //
    // Misma idea que el overlay del catalogo: si hay mas
    // espectadores con saldo que "porPagina", se reparten en paginas
    // y se va rotando sola cada "rotarMs". Con pocos no hay ni
    // rotacion: siempre es la misma pagina unica.
    // ------------------------------------------------------------

    // Ultima lista completa que mando el servidor (o la de prueba),
    // ya ordenada de mas a menos tokens. La pagina se calcula sobre
    // esto, no sobre lo que se pinto la vez anterior.
    let todos = [];
    let pagina = 0;

    function porPagina() {
        return Math.max(1, Number(config.porPagina) || 5);
    }

    function totalPaginas() {
        return Math.max(1, Math.ceil(todos.length / porPagina()));
    }

    // Cuantos likes cuesta un token. Lo dice la app en cada sondeo:
    // esta en rules.json y se puede cambiar en caliente, asi que no
    // tiene sentido escribirlo tambien aqui.
    let likesPorToken = 0;

    // Texto del precio que manda la app ya armado ("10 min = 1" en el
    // de Twitch, 5901). Si viene, gana sobre el de likes.
    let precioTexto = '';
    let plataforma = 'tiktok';

    // ------------------------------------------------------------
    // MODO PRUEBA
    // ------------------------------------------------------------
    //
    // Con ?test se pinta una lista de mentira, para colocar la
    // fuente en OBS sin esperar a que alguien junte 300 likes. No
    // toca nada real ni le pide nada al servidor.
    //
    // Por parametro de URL y no con un boton dentro de la pagina,
    // porque esto se ve en OBS: un boton saldria en pantalla.
    // ------------------------------------------------------------

    const ES_PRUEBA = new URLSearchParams(location.search).has('test');

    const NOMBRES_PRUEBA = [
        // El segundo es larguisimo a proposito: para ver el truncado.
        'ElChicoDelBarrio', 'NombreLarguisimoDeEspectador_Oficial_2026', 'xX_Sniper_Xx', 'Pepito',
        'ana_99', 'ReploidFan', 'DrLight', 'zerofan2000',
        'comandante_x', 'Sigma',
    ];

    function datosDePrueba(cuantos) {
        const lista = [];
        let saldo = 7;

        for (let i = 0; i < cuantos; i++) {
            lista.push({
                key: 'prueba' + i,
                name: NOMBRES_PRUEBA[i % NOMBRES_PRUEBA.length],
                // Sin foto a proposito: asi tambien se ve que el
                // circulo vacio queda decente cuando a alguien no le
                // carga el avatar.
                avatar: '',
                tokens: saldo,
            });

            saldo = Math.max(1, saldo - (i % 2 === 0 ? 1 : 0));
        }

        return lista;
    }

    const refs = {
        panel: document.getElementById('panel'),
        titulo: document.getElementById('titulo'),
        lista: document.getElementById('lista'),
    };

    // Lo ultimo dibujado, para no rehacer el DOM en cada sondeo: si
    // se rehiciera, la animacion de entrada se reiniciaria sola cada
    // pocos segundos.
    let pintado = '';

    // Nombre cortado a config.maxLetras caracteres (0 = sin cortar), con
    // "…" si sobraba. Por caracteres de verdad (Array.from), no por
    // unidades UTF-16: si no, un emoji se partiria por la mitad.
    function recortar(nombre) {
        const max = Math.floor(Number(config.maxLetras) || 0);
        const letras = Array.from(String(nombre ?? ''));

        return max > 0 && letras.length > max
            ? letras.slice(0, max).join('') + '…'
            : letras.join('');
    }

    function esc(texto) {
        return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[c]));
    }

    // ------------------------------------------------------------
    // DIBUJOS
    // ------------------------------------------------------------
    //
    // El token va en SVG dentro del propio JS y no como PNG: se
    // escala sin dentarse a cualquier tamano de fuente de OBS y no
    // hay archivos sueltos que se puedan perder al mover la carpeta.
    // Es una moneda PLATEADA con una estrella: el dorado es el de las
    // monedas de TikTok (overlay de donadores).
    // ------------------------------------------------------------

    const TOKEN = `
      <svg class="tk-icono" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.4" fill="#e4e8ee" stroke="#000" stroke-width="1.7"/>
        <circle cx="12" cy="12" r="6.6" fill="#9ea7b3"/>
        <path d="M7.2 8.6 A6.2 6.2 0 0 1 15.4 6.6" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>
        <path d="M12 6.8 L13.5 10.4 L17.3 10.7 L14.4 13.2 L15.3 16.9 L12 14.9 L8.7 16.9 L9.6 13.2 L6.7 10.7 L10.5 10.4 Z"
              fill="#ffffff" stroke="#4d5560" stroke-width="0.7" stroke-linejoin="round"/>
      </svg>`;

    // ------------------------------------------------------------
    // TAMANO
    // ------------------------------------------------------------
    //
    // La fuente de OBS puede tener cualquier alto, asi que el tamano
    // sale del alto REAL de la ventana y no de un px fijo.
    // ------------------------------------------------------------

    function ajustarTamano(cuantasFilas) {
        const filas = Math.max(1, cuantasFilas) +
            (config.mostrarTitulo ? 1.4 : 0.3);

        const base = (window.innerHeight / filas) * 0.36;
        const escala = Number(config.escala) || 1;

        // Redondeado a px entero: de ahi salen todos los demas
        // tamanos y la fuente de pixel se interpola (y saca flecos de
        // color) en cuanto le toca un tamano fraccionario.
        refs.panel.style.setProperty(
            '--tk-size',
            `${Math.max(8, Math.round(base * escala))}px`
        );

        refs.panel.style.setProperty(
            '--tk-fondo',
            String(Number(config.fondoAlpha) ?? 0.75)
        );

        document.body.dataset.fuente =
            config.fuente === 'normal' ? 'normal' : 'pixel';
    }

    // ------------------------------------------------------------
    // DIBUJO
    // ------------------------------------------------------------

    function fila(entrada) {
        const avatar = config.avatares
            ? `<span class="tk-foto">
                 ${entrada.avatar
                     ? `<img src="${esc(entrada.avatar)}" alt="" referrerpolicy="no-referrer" />`
                     : ''}
               </span>`
            : '';

        return `
          <li class="tk-fila">
            ${avatar}
            <span class="tk-datos">
              <span class="tk-nombre">${esc(recortar(entrada.name))}</span>
            </span>
            <span class="tk-saldo">${TOKEN}${esc(entrada.tokens)}</span>
          </li>`;
    }

    // Vuelve a dibujar la pagina ACTUAL de "todos". No pide nada al
    // servidor: eso lo hace sondear(). Se llama tanto al llegar datos
    // nuevos como al rotar de pagina sola.
    function render() {
        // Si se fueron espectadores y la pagina en la que estabamos
        // ya no existe, se recorta a la ultima que si.
        pagina = Math.min(pagina, totalPaginas() - 1);

        const desde = pagina * porPagina();
        const entradas = todos.slice(desde, desde + porPagina());

        // Huella: si no cambio nada (ni la pagina ni los datos), no
        // se toca el DOM.
        const huella = `${config.avatares}|${config.mostrarTitulo}|${config.maxLetras}|` +
            `${config.titulo}|${likesPorToken}|${precioTexto}|${pagina}/${totalPaginas()}|` +
            entradas.map((e) => `${e.key}:${e.tokens}:${e.name}`).join('|');

        if (huella === pintado) {
            return;
        }

        pintado = huella;

        // Sin NADIE con tokens no se dibuja nada: ni el titulo ni el
        // panel de fondo, que ocupa la fuente entera y en OBS
        // quedaria como un rectangulo oscuro vacio. En cuanto alguien
        // gane su primer token vuelve a aparecer solo. Para colocar
        // la fuente en OBS con la lista llena esta "?test".
        refs.panel.hidden = todos.length === 0;

        if (todos.length === 0) {
            refs.lista.innerHTML = '';
            return;
        }

        // Se mide siempre contra "porPagina", no contra cuantas filas
        // tenga ESTA pagina en concreto: si no, la letra cambiaria de
        // tamano cada vez que la ultima pagina (mas corta) entrara,
        // dando una sensacion de parpadeo al rotar.
        ajustarTamano(porPagina());

        if (config.mostrarTitulo) {
            const textoPrecio = precioTexto || (likesPorToken > 0 ? `${likesPorToken} likes = 1` : '');
            const precio = (config.mostrarPrecio && textoPrecio)
                ? `<span class="tk-precio">${esc(textoPrecio)}</span>`
                : '';

            // El de Twitch puede tener su propio título (tituloTwitch).
            const titulo = plataforma === 'twitch'
                ? (config.tituloTwitch ?? config.titulo ?? 'TOKENS')
                : (config.titulo ?? 'TOKENS');

            refs.titulo.innerHTML = esc(titulo) + precio;
            refs.titulo.hidden = false;
        } else {
            refs.titulo.hidden = true;
        }

        refs.lista.innerHTML = entradas.map(fila).join('');
    }

    // ------------------------------------------------------------
    // SONDEO
    // ------------------------------------------------------------

    async function leerConfig() {
        try {
            const res = await fetch('config.json?_=' + Date.now());

            if (res.ok) {
                config = { ...POR_DEFECTO, ...(await res.json()) };
            }
        } catch {
            // Si no se puede leer, se sigue con lo que hubiera: un
            // overlay que deja de pintarse por un config.json mal
            // guardado seria peor que uno con los valores de antes.
        }
    }

    async function sondear() {
        await leerConfig();

        const cuantos = Math.max(1, Number(config.cuantos) || 20);

        if (ES_PRUEBA) {
            likesPorToken = likesPorToken || 300;
            todos = datosDePrueba(cuantos);
            render();
            return;
        }

        try {
            const res = await fetch(`/api/tokens?limit=${cuantos}&_=${Date.now()}`);

            if (!res.ok) {
                return;
            }

            const data = await res.json();

            likesPorToken = Number(data?.config?.likesPorToken) || 0;
            precioTexto = String(data?.precio ?? '');
            plataforma = data?.plataforma === 'twitch' ? 'twitch' : 'tiktok';

            todos = Array.isArray(data.lista) ? data.lista : [];
            render();
        } catch {
            // La app se cayo o todavia no arranco. Se deja lo ultimo
            // que se pinto en vez de vaciar el overlay: en OBS es
            // menos feo que parpadear.
        }
    }

    ajustarTamano(Number(POR_DEFECTO.porPagina));

    window.addEventListener('resize', () => {
        pintado = '';
        void sondear();
    });

    void sondear();

    setInterval(() => {
        void sondear();
    }, Math.max(500, Number(config.sondeoMs) || 2500));

    // Rotacion de paginas: no vuelve a pedir nada al servidor, solo
    // avanza sobre "todos" (lo que ya se tiene) y repinta. Si todo
    // cabe en una sola pagina, esto avanza de 0 a 0 y no se nota.
    // El intervalo se lee una sola vez, igual que sondeoMs: cambiarlo
    // en config.json requiere refrescar la fuente de OBS.
    setInterval(() => {
        if (totalPaginas() <= 1) {
            return;
        }

        pagina = (pagina + 1) % totalPaginas();
        render();
    }, Math.max(1000, Number(config.rotarMs) || 4000));
})();
