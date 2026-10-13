async function cargarInteracciones() {
  try {
    // Cargar configuración
    const configRes = await fetch('config.json');
    const config = await configRes.json();
    const { imageHeight, speedPxPerSec, itemGap, itemPaddingVertical, itemPaddingHorizontal } = config.sliderConfig;

    // Aplicar variables CSS desde config
    document.documentElement.style.setProperty('--slider-img-height', `${imageHeight}px`);
    document.documentElement.style.setProperty('--slider-item-gap', `${itemGap}px`);
    document.documentElement.style.setProperty('--item-padding-v', `${itemPaddingVertical}px`);
    document.documentElement.style.setProperty('--item-padding-h', `${itemPaddingHorizontal}px`);

    // Cargar datos
    const res = await fetch('data.json');
    const data = await res.json();
    const slider = document.getElementById('slider');

    data.forEach(item => {
      const div = document.createElement('div');
      div.className = `item item-${item.efecto}`;

      if (item.tipo === 'like') {
        // Caso especial de Likes
        div.innerHTML = `
          <div class="likes-box">
            <img src="${item.regalo}" alt="likes">
            <span class="cantidad">${item.cantidad}</span>
          </div>
          <img src="${item.imagen}" alt="efecto">
        `;
      } else {
        // Caso normal (imagen → imagen)
        div.innerHTML = `
          <img src="${item.regalo}" alt="regalo">
          <img src="${item.imagen}" alt="efecto">
        `;
      }

      slider.appendChild(div);
    });

    // Después de crear los elementos, triplicamos el contenido para la animación de ida y vuelta
    // (triplicado para crear una pista seamless sin saltos)
    // Hacemos esto aquí en lugar de en CSS para mantener control desde JS.
    const originalHTML = slider.innerHTML;
    slider.innerHTML = originalHTML + originalHTML + originalHTML;

let animationFrame = null;
let currentX = 0;
let direction = -1;
let lastTime = null;

function startAnimation() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  slider.style.animation = 'none';
  slider.style.willChange = 'transform';

  // Forzar que el navegador recalcule los tamaños
  slider.offsetWidth;

  const total = slider.scrollWidth;
  const containerWidth = slider.parentElement.clientWidth;

  if (!total || !containerWidth) return;

  // Posición final:
  // el último elemento de la tercera copia
  // queda exactamente en el borde derecho.
  const endX = containerWidth - total;

  currentX = 0;
  direction = -1;
  lastTime = null;

  function animate(timestamp) {
    if (lastTime === null) {
      lastTime = timestamp;
    }

    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    currentX += direction * speedPxPerSec * deltaTime;

    // Llegamos exactamente al final
    if (currentX <= endX) {
      currentX = endX;
      direction = 1;
    }

    // Llegamos exactamente al inicio
    if (currentX >= 0) {
      currentX = 0;
      direction = -1;
    }

    slider.style.transform = `translate3d(${currentX}px, 0, 0)`;

    animationFrame = requestAnimationFrame(animate);
  }

  animationFrame = requestAnimationFrame(animate);
}

    // Usar ResizeObserver para recalcular la animación cuando cambia el tamaño del slider
    const resizeObserver = new ResizeObserver(() => {
      startAnimation();
    });
    resizeObserver.observe(slider);

    // Esperar a que las imágenes carguen y a un frame para medir correctamente
    const imgs = slider.querySelectorAll('img');
    let loaded = 0;
    if (imgs.length === 0) {
      requestAnimationFrame(startAnimation);
    } else {
      imgs.forEach(img => {
        if (img.complete) {
          loaded++;
        } else {
          img.addEventListener('load', () => {
            loaded++;
            if (loaded === imgs.length) requestAnimationFrame(startAnimation);
          });
          img.addEventListener('error', () => {
            loaded++;
            if (loaded === imgs.length) requestAnimationFrame(startAnimation);
          });
        }
      });
      if (loaded === imgs.length) requestAnimationFrame(startAnimation);
    }

    // Recalcular al redimensionar
    window.addEventListener('resize', () => {
      // small debounce
      clearTimeout(window._sliderResizeTimeout);
      window._sliderResizeTimeout = setTimeout(startAnimation, 150);
    });
  } catch (err) {
    console.error('Error cargando data.json:', err);
  }
}

// ============================================================
// MODO "catalog"
// ============================================================
//
// A diferencia del slider (arriba, sin tocar), este modo NO
// muestra eventos que ya pasaron: muestra TODAS las opciones
// disponibles en rules.json, para que los viewers sepan que
// regalos existen y que hacen. Lee /api/rules (catalogo completo,
// con recarga en caliente).
//
// Pensado como franja arriba o abajo de la vista de celular: la
// franja SIEMPRE se llena entera. Buenos a la izquierda, malos a
// la derecha, cada equipo con su propia cuadricula
// (catalogConfig.bueno / catalogConfig.malo -> columns y rows).
// El tamaño de cada imagen sale de ahi: mas filas = celdas mas
// bajas = imagenes mas chicas.
//
// El ancho de la franja se reparte segun el numero de columnas de
// cada equipo, asi todas las celdas tienen el mismo ancho.
//
// Si un equipo tiene mas reglas que celdas, rota: cada cierto
// tiempo UNA celda cambia su regalo por otro que no se estaba
// mostrando. Se reemplaza en la misma celda (no se corre toda la
// cuadricula), por eso cada celda es fija y el item va encima.
//
// config.json se relee en cada sondeo: cambiar columns/rows se
// aplica sin refrescar la fuente de OBS.
// ============================================================

// Token de los comandos de chat: moneda PLATEADA con estrella. El
// dorado ya es de las monedas de TikTok (overlay de donadores).
// Mismo dibujo que el overlay de tokens (tokens/script.js).
const TOKEN_SVG = `<svg class="catalog-token-icon" viewBox="0 0 24 24" aria-hidden="true">
<circle cx="12" cy="12" r="9.4" fill="#e4e8ee" stroke="#000" stroke-width="1.7"/>
<circle cx="12" cy="12" r="6.6" fill="#9ea7b3"/>
<path d="M7.2 8.6 A6.2 6.2 0 0 1 15.4 6.6" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>
<path d="M12 6.8 L13.5 10.4 L17.3 10.7 L14.4 13.2 L15.3 16.9 L12 14.9 L8.7 16.9 L9.6 13.2 L6.7 10.7 L10.5 10.4 Z" fill="#ffffff" stroke="#4d5560" stroke-width="0.7" stroke-linejoin="round"/>
</svg>`;

async function iniciarModoCatalog(initialCatalogConfig) {
    let catalogConfig = initialCatalogConfig;

    const container = document.getElementById('catalogContainer');

    const teams = {
        bueno: createTeam('catalogTeamBueno', 'catalogTitleBueno', 'catalogBueno'),
        malo: createTeam('catalogTeamMalo', 'catalogTitleMalo', 'catalogMalo'),
        // catalogConfig.layout = "unico": una sola cuadricula con las
        // reglas de los dos equipos, en el orden del panel. El equipo
        // solo se nota en el color del borde de cada tarjeta.
        unico: createTeam('catalogTeamUnico', 'catalogTitleUnico', 'catalogUnico'),
    };

    // "equipos" (lo de siempre, y el valor si falta el campo) o
    // "unico". Se relee en cada sondeo: se cambia sin refrescar OBS.
    function readLayout() {
        return String(catalogConfig.layout || '').trim().toLowerCase() === 'unico'
            ? 'unico'
            : 'equipos';
    }

    function createTeam(wrapId, titleId, gridId) {
        const team = {
            // wrapEl envuelve titulo + cuadricula. Es el que lleva el
            // flex-grow (antes lo llevaba la cuadricula), porque es
            // el que se reparte el ancho de la franja.
            wrapEl: document.getElementById(wrapId),
            titleEl: document.getElementById(titleId),
            gridEl: document.getElementById(gridId),
            columns: 0,
            rows: 0,
            all: [],
            // Las reglas ya repartidas en paginas, teniendo en cuenta
            // cuantas celdas ocupa cada una (ver paginar()).
            pages: [],
            // Claves de lo que hay dibujado ahora mismo, para no
            // rehacer la cuadricula en cada sondeo de /api/rules.
            painted: '',
            // Pagina que se esta mostrando. Cada equipo lleva la
            // suya: los buenos y los malos pasan de pagina por su
            // cuenta, porque casi nunca tienen el mismo numero de
            // reglas ni el mismo numero de celdas.
            page: 0,
        };

        new ResizeObserver(() => {
            updateLabelSize(team);
            layoutTeam(team);
        }).observe(team.gridEl);

        return team;
    }

    // "Team Bueno" / "Team Malo". Sin title en config.json el <div>
    // se oculta y la cuadricula recupera todo el alto, que es como
    // se veia antes de que existieran los titulos.
    function applyTitle(team, teamConfig) {
        const title = String(teamConfig?.title ?? '').trim();

        // textContent y no innerHTML: el texto viene de un archivo de
        // configuracion, no se interpreta como HTML.
        team.titleEl.textContent = title;
        team.titleEl.hidden = !title;
    }

    function readDims(teamConfig) {
        return {
            columns: Math.max(1, Math.floor(Number(teamConfig?.columns) || 1)),
            rows: Math.max(1, Math.floor(Number(teamConfig?.rows) || 1)),
        };
    }

    // Sin catalogConfig.unico en config.json, el cuadro unico ocupa lo
    // mismo que los dos equipos juntos: sus columnas sumadas y el alto
    // del mas alto. Asi cambiar solo "layout" ya se ve razonable.
    function readUnicoDims() {
        if (catalogConfig.unico) {
            return readDims(catalogConfig.unico);
        }

        const bueno = readDims(catalogConfig.bueno);
        const malo = readDims(catalogConfig.malo);

        return {
            columns: bueno.columns + malo.columns,
            rows: Math.max(bueno.rows, malo.rows),
        };
    }

    // 1000 -> "1k", 1500 -> "1.5k", 500 -> "500". Solo entra en juego
    // desde 1000 (los umbrales de esta app hoy son 33/50/100/300/500,
    // que se leen bien tal cual).
    function formatLikeCount(n) {
        if (n >= 1000) {
            const k = n / 1000;
            return (Number.isInteger(k) ? String(k) : k.toFixed(1)) + 'k';
        }

        return String(n);
    }

    // rule.gifts (2026-09-20): varios regalos DISTINTOS disparando la
    // MISMA regla. Cuando está, reemplaza a giftName por completo (no
    // se combinan). Devuelve los nombres en el orden en que se
    // eligieron en el panel.
    function giftNamesOf(rule) {
        if (Array.isArray(rule.gifts) && rule.gifts.length > 0) {
            return rule.gifts
                .map((g) => String(g && g.name || '').trim())
                .filter(Boolean);
        }

        return rule.giftName ? [String(rule.giftName).trim()] : [];
    }

    function ruleKey(rule) {
        // Las reglas "like" no tienen giftName; el threshold hace de
        // identificador unico en su lugar (dos reglas "like" con el
        // mismo threshold serian ambiguas de por si, en la cola real).
        //
        // Una tarjeta de anuncio puede no tener ninguno de los dos: se
        // identifica por su texto, que es lo unico que tiene.
        const id = giftNamesOf(rule).join('+')
            || (rule.threshold ? `like:${rule.threshold}` : '')
            || (rule.event === 'follow' ? 'follow' : '')
            || `aviso:${rule.overlayText || ''}`;

        return `${id}|${rule.actionName || rule.action || ''}`;
    }

    function buildEntries(rules) {
        const bueno = [];
        const malo = [];
        // Todas juntas y en el orden del rules.json, para el modo
        // "unico": ahi no se separan, solo cambia el borde.
        const todas = [];

        rules.forEach((rule) => {
            // Regla apagada desde el panel: existe en el archivo pero
            // no esta en juego, asi que tampoco se anuncia aqui. El
            // campo puede no venir (reglas de siempre): ausente = si.
            if (rule.enabled === false) {
                return;
            }

            // overlayHidden: sigue disparando en el juego con
            // normalidad (regalo o likes), pero el streamer no quiere
            // que el chat la vea venir en la cuadrícula. Espejo de
            // overlayOnly (esa sale en el overlay y no hace nada en
            // el juego; esta hace algo en el juego y no sale acá).
            if (rule.overlayHidden === true) {
                return;
            }

            // Tres tipos de regla muestran algo en el catalogo:
            //   - "gift": dispara con un regalo puntual de TikTok.
            //   - "like": dispara cada N likes acumulados (threshold).
            //   - overlayOnly: tarjeta de anuncio. No hace nada en el
            //     juego, asi que puede no tener regalo ni umbral: le
            //     basta con su imagen y su texto. Si SI tiene regalo
            //     (algo que el streamer cumple a mano), se dibuja como
            //     cualquier otra.
            // El resto (por ejemplo reglas "like" sin threshold, mal
            // configuradas) no tiene nada que mostrar.
            const giftNames = giftNamesOf(rule);
            const isGiftRule = rule.event === 'gift' && giftNames.length > 0;
            const isLikeRule = rule.event === 'like' && rule.threshold;
            const isFollowRule = rule.event === 'follow';
            const isAviso = rule.overlayOnly === true;

            if (!isGiftRule && !isLikeRule && !isFollowRule && !isAviso) {
                return;
            }

            // Cantidad (spawn_enemy) o duracion (godmode, POWER...): una
            // regla no tiene las dos cosas a la vez, asi que un solo
            // badge alcanza. count == 1 no se muestra, no aporta nada.
            const count = rule.command && rule.command.count;
            const duration = rule.duration;
            let badge = '';

            // overlayHideCount (panel: "Cantidad en la tarjeta" ->
            // Ocultar): la accion no garantiza ese numero exacto (el
            // spawn de Mega Man X en BizHawk clona lo que haya en
            // pantalla), asi que no se promete un "x5" que no se cumple.
            if (count && count > 1 && rule.overlayHideCount !== true) {
                badge = `x${count}`;
            } else if (duration) {
                badge = `${duration}s`;
            }

            // Cuantas celdas de ancho y de alto ocupa la tarjeta.
            // Sirve para las acciones que necesitan que se lea un
            // texto largo, o simplemente para destacarlas. Por
            // defecto 1x1, o sea como ha sido siempre.
            //
            // El tope se aplica al dibujar, no aqui: depende de las
            // columnas del equipo, que las pone config.json y pueden
            // cambiar en caliente.
            const span = Math.max(1, Math.floor(Number(rule.overlaySpan) || 1));
            const rowSpan = Math.max(1, Math.floor(Number(rule.overlayRowSpan) || 1));

            // Retoque del tamaño del texto de ESTA tarjeta. 1 = el
            // recomendado (el que calcula el overlay segun la celda);
            // 1.5 = medio mas grande. Es un multiplicador y no un
            // numero de pixeles a proposito: asi sigue escalando solo
            // cuando cambia el tamaño de la fuente en OBS.
            const textBoost = Math.min(3, Math.max(0.4, Number(rule.overlayTextScale) || 1));

            // Retoques del numero "x2" / "12s" de ESTA tarjeta. Se SUMAN
            // (desplazamiento) o MULTIPLICAN (escala) al global de
            // config.json (catalogConfig.badge), asi mover el global
            // sigue moviendo tambien las tarjetas retocadas.
            const numeroFinito = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
            const badgeDx = numeroFinito(rule.overlayBadgeOffsetX);
            const badgeDy = numeroFinito(rule.overlayBadgeOffsetY);
            const badgeScale = Math.min(4, Math.max(0.3, Number(rule.overlayBadgeScale) || 1));
            // Tamaño del comando de chat de ESTA tarjeta, multiplica al
            // global (overlayCommandScale de la raiz de rules.json).
            const commandScale = Math.min(4, Math.max(0.3, Number(rule.overlayCommandScale) || 1));

            // Relleno interior de ESTA tarjeta en px. Sin el campo (o
            // vacio) manda el global (catalogConfig.padding).
            const padding = rule.overlayPadding === undefined || rule.overlayPadding === null
                || rule.overlayPadding === '' || !Number.isFinite(Number(rule.overlayPadding))
                ? null
                : Math.min(40, Math.max(0, Number(rule.overlayPadding)));

            // Mismo criterio de siempre: lo que no es "bueno" es malo.
            const team = rule.team === 'bueno' ? 'bueno' : 'malo';

            const entry = {
                key: ruleKey(rule),
                team,
                span,
                rowSpan,
                textBoost,
                badgeDx,
                badgeDy,
                badgeScale,
                commandScale,
                padding,
                // Texto de la tarjeta. Por defecto el nombre de la
                // accion, pero una regla puede poner el suyo con
                // "overlayText": mas corto, mas gracioso, o
                // simplemente el que entra en el ancho que tiene.
                label: String(rule.overlayText ?? rule.actionName ?? rule.action ?? ''),
                // Comando de chat (tokens), tal cual se escribio en el
                // panel. Sale debajo del texto principal a la mitad de
                // tamaño. Vacio = la regla no se pide por chat.
                chatCommand: String(rule.chatCommand ?? '').trim(),
                // Lo que cuesta en tokens, a la derecha del comando con
                // el token plateado: "!lento ····· 2 🪙". Sin precio = 0.
                tokenCost: Math.max(0, Math.round(Number(rule.tokenCost) || 0)),
                // Las reglas "like" no tienen un regalo real: se usa el
                // icono generico de like y el numero de likes como
                // "nombre de regalo" para el alt/etiqueta.
                // Una tarjeta de anuncio puede no tener regalo: ahi
                // giftName queda vacio y no se dibuja la esquina.
                //
                // Con varios regalos (rule.gifts), el PRIMERO es el que
                // se usa como icono de la esquina (giftName singular:
                // no tiene sentido mostrar N imagenes ahi) y el join
                // con " / " de TODOS es lo que ve buildItem() para la
                // linea de texto aparte (ver "giftNames" mas abajo).
                // Un follow tampoco tiene regalo: su esquina lleva el
                // icono del propio evento, igual que el corazon de los
                // likes (pero sin numero: no hay umbral que contar).
                giftName: isLikeRule ? 'Like' : (isFollowRule ? 'Follow' : (giftNames[0] || '')),
                giftLabel: isLikeRule
                    ? `${rule.threshold} likes`
                    : (isFollowRule ? 'Nuevo seguidor' : giftNames.join(' / ')),
                giftNames,
                actionName: rule.actionName || rule.action || '',
                actionImage: rule.overlayImage || '',
                badge,
                // Numero centrado sobre el corazon, solo para reglas
                // "like". "" para reglas de regalo: no se dibuja nada.
                likeCount: isLikeRule ? formatLikeCount(rule.threshold) : '',
            };

            if (team === 'bueno') {
                bueno.push(entry);
            } else {
                malo.push(entry);
            }

            todas.push(entry);
        });

        return { bueno, malo, todas };
    }

    // El texto no puede escalar con CSS puro de forma fiable en el
    // navegador de OBS (container queries no estan en todas sus
    // versiones), asi que se calcula aqui a partir del tamaño real
    // de la celda.
    function updateLabelSize(team) {
        if (!team.columns || !team.rows) {
            return;
        }

        const cellWidth = team.gridEl.clientWidth / team.columns;
        const cellHeight = team.gridEl.clientHeight / team.rows;
        const fontPx = Math.max(8, Math.min(cellHeight * 0.16, cellWidth * 0.085));

        // Se define en el envoltorio y no en la cuadricula para que
        // tambien lo herede el titulo, que es hermano de la
        // cuadricula y no hijo suyo.
        team.wrapEl.style.setProperty('--catalog-label-size', `${fontPx}px`);
    }

    function applyLayout(team, { columns, rows }) {
        if (team.columns === columns && team.rows === rows) {
            return;
        }

        team.columns = columns;
        team.rows = rows;

        team.gridEl.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
        team.gridEl.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
        // El flex-grow va en el envoltorio: es el que compite por el
        // ancho de la franja contra el otro equipo.
        team.wrapEl.style.flexGrow = String(columns);

        team.gridEl.replaceChildren();
        team.painted = '';
        // Cambiar columns/rows cambia cuantas celdas hay y por tanto
        // como se reparten las paginas: la pagina que se veia ya no
        // significa lo mismo, asi que se vuelve a la primera.
        team.page = 0;

        updateLabelSize(team);
    }

    // ------------------------------------------------------------
    // BADGE PEGADO A LA IMAGEN
    // ------------------------------------------------------------
    //
    // Las imagenes se dibujan con object-fit: contain dentro de una
    // caja que ocupa toda la celda, asi que casi nunca la llenan: un
    // sprite ancho y bajo deja franjas vacias arriba y abajo. El
    // badge ("x5", "15s") estaba anclado a la CAJA, por eso se veia
    // siempre arriba del todo y despegado del dibujo.
    //
    // containedRect() rehace la cuenta que hace contain y devuelve el
    // rectangulo que de verdad ocupa la imagen; el badge se ancla a
    // ESE rectangulo. Asi no hace falta que todos los PNG midan lo
    // mismo: cada uno lleva su badge pegado a su propia esquina.
    // ------------------------------------------------------------

    function containedRect(img, box) {
        const boxW = box.clientWidth;
        const boxH = box.clientHeight;
        const natW = img.naturalWidth;
        const natH = img.naturalHeight;

        // Imagen todavia sin cargar (o rota) / caja sin medir aun.
        if (!boxW || !boxH || !natW || !natH) {
            return null;
        }

        const scale = Math.min(boxW / natW, boxH / natH);
        const width = natW * scale;
        const height = natH * scale;

        return { width, height, left: (boxW - width) / 2, top: (boxH - height) / 2 };
    }

    function layoutItem(item) {
        const mainWrap = item.querySelector('.catalog-main-wrap');
        const main = item.querySelector('.catalog-main-img');
        const badge = item.querySelector('.catalog-count-badge');

        if (badge && main && mainWrap) {
            const rect = containedRect(main, mainWrap);

            if (rect) {
                badge.style.top = `${rect.top}px`;
                badge.style.right = `${rect.left}px`;
            }
        }

        // Mismo problema con el numero de likes: iba centrado en la
        // caja, no en el corazon.
        const giftWrap = item.querySelector('.catalog-gift-wrap');
        const gift = item.querySelector('.catalog-gift-badge');
        const likeCount = item.querySelector('.catalog-like-count');

        if (likeCount && gift && giftWrap) {
            const rect = containedRect(gift, giftWrap);

            if (rect) {
                likeCount.style.top = `${rect.top + (rect.height / 2)}px`;
                likeCount.style.left = `${rect.left + (rect.width / 2)}px`;
            }
        }
    }

    // Al cambiar el tamaño de la fuente de OBS (o las columnas/filas)
    // cambia la celda y con ella el rectangulo de cada imagen.
    function layoutTeam(team) {
        team.gridEl.querySelectorAll('.catalog-item').forEach(layoutItem);
    }

    // Sin imagen (nombre provisional o png que todavia no existe) se
    // oculta, en vez de mostrar otra cosa que confunda al viewer.
    function hideOnError(img) {
        img.addEventListener('error', () => {
            img.style.visibility = 'hidden';
        }, { once: true });
    }

    function buildItem(entry, ancho) {
        const item = document.createElement('div');
        // El color del equipo (borde, badge) cuelga de la propia
        // tarjeta y no de la columna: asi vale igual en el cuadro
        // unico, donde buenos y malos comparten cuadricula.
        item.className = `catalog-item catalog-item-${entry.team} catalog-item-entering`;

        // Una tarjeta que ocupa mas de una columna se reparte distinto:
        // imagen a la izquierda y texto grande a la derecha. El ancho
        // que llega es el YA recortado a las columnas del equipo, no el
        // que pidio la regla: si no entro, tampoco cambia el reparto.
        if (ancho > 1) {
            item.classList.add('catalog-item-wide');
        }

        // El CSS multiplica por esta variable todos los tamaños de
        // texto de la tarjeta. Solo se pone cuando la regla la cambia,
        // asi el valor por defecto del var() sigue siendo el que
        // manda en todo lo demas.
        if (entry.textBoost !== 1) {
            item.style.setProperty('--catalog-text-boost', String(entry.textBoost));
        }

        // Retoques por regla del numero y del relleno. Mismo criterio:
        // solo se ponen si la regla los trae. Las del numero son
        // variables APARTE de las globales (el CSS las suma o
        // multiplica); el relleno, en cambio, pisa al global.
        if (entry.badgeDx !== 0) {
            item.style.setProperty('--catalog-badge-x-regla', `${entry.badgeDx}px`);
        }

        if (entry.badgeDy !== 0) {
            item.style.setProperty('--catalog-badge-y-regla', `${entry.badgeDy}px`);
        }

        if (entry.commandScale !== 1) {
            item.style.setProperty('--catalog-command-scale-regla', String(entry.commandScale));
        }

        if (entry.badgeScale !== 1) {
            item.style.setProperty('--catalog-badge-scale-regla', String(entry.badgeScale));
        }

        if (entry.padding !== null) {
            item.style.setProperty('--catalog-padding', `${entry.padding}px`);
        }

        // encodeURIComponent: hay regalos con espacios y apostrofes
        // ("Guardian's Pledge").
        const giftSrc = `images/regalos/${encodeURIComponent(entry.giftName)}.png`;

        const visual = document.createElement('div');
        visual.className = 'catalog-visual';

        // Envoltorio propio para la imagen principal: asi el badge de
        // cantidad/duracion se ancla a SU esquina (position:relative)
        // sin volver relativo a .catalog-visual entero, que rompería
        // la fila accion/regalo.
        const mainWrap = document.createElement('div');
        mainWrap.className = 'catalog-main-wrap';

        // La accion es la imagen grande y el regalo va chico en la
        // esquina. Si la regla no tiene overlayImage, el regalo pasa
        // a ser la imagen grande y no se repite en la esquina.
        const main = document.createElement('img');
        main.className = 'catalog-main-img';
        main.src = entry.actionImage || giftSrc;
        main.alt = entry.actionImage ? entry.actionName : entry.giftLabel;
        hideOnError(main);
        // Hasta que no carga no se sabe su proporcion, y sin eso no
        // se puede pegar el badge a la imagen.
        main.addEventListener('load', () => {
            // Su forma: en la tarjeta ancha la caja de la imagen toma
            // todo el alto y este ancho (ver .catalog-item-wide en el
            // CSS), asi una imagen cuadrada o apaisada no sale enana.
            if (main.naturalWidth && main.naturalHeight) {
                mainWrap.style.setProperty('--catalog-img-ratio', String(main.naturalWidth / main.naturalHeight));
            }

            layoutItem(item);
        });
        mainWrap.appendChild(main);

        // "x2", "x50"... para spawns con mas de 1, o "12s", "20s"...
        // para efectos con duracion. Nunca las dos cosas a la vez.
        if (entry.badge) {
            const badge = document.createElement('span');
            badge.className = 'catalog-count-badge';
            badge.textContent = entry.badge;
            mainWrap.appendChild(badge);
        }

        visual.appendChild(mainWrap);

        // entry.giftName tambien: una tarjeta de anuncio puede no
        // tener regalo, y sin esto se colaria un <img> a
        // "images/regalos/.png" que solo se esconde al fallar (deja su
        // hueco en la fila y descoloca la imagen principal).
        if (entry.actionImage && entry.giftName) {
            const giftWrap = document.createElement('div');
            giftWrap.className = 'catalog-gift-wrap';

            // Varios regalos (rule.gifts): uno encima de otro en la
            // esquina, cada uno en su propia caja. Con uno solo (o en
            // likes/follow) se dibuja como siempre.
            if (entry.giftNames.length > 1 && !entry.likeCount) {
                giftWrap.classList.add('catalog-gift-stack');

                entry.giftNames.forEach((name) => {
                    const cell = document.createElement('div');
                    cell.className = 'catalog-gift-cell';

                    const gift = document.createElement('img');
                    gift.className = 'catalog-gift-badge';
                    gift.src = `images/regalos/${encodeURIComponent(name)}.png`;
                    gift.alt = name;
                    hideOnError(gift);
                    cell.appendChild(gift);
                    giftWrap.appendChild(cell);
                });
            } else {
                const gift = document.createElement('img');
                gift.className = 'catalog-gift-badge';
                gift.src = giftSrc;
                gift.alt = entry.giftLabel;
                hideOnError(gift);
                gift.addEventListener('load', () => layoutItem(item));
                giftWrap.appendChild(gift);
            }

            // "50", "300", "1k"... centrado sobre el corazon. Solo en
            // reglas "like": las de regalo no tienen un numero que
            // mostrar aqui (el conteo real de gente que lo envio no
            // lo sabe el overlay, y mentir un numero seria peor que
            // no mostrar nada).
            if (entry.likeCount) {
                const count = document.createElement('span');
                count.className = 'catalog-like-count';
                count.textContent = entry.likeCount;
                giftWrap.appendChild(count);
            }

            visual.appendChild(giftWrap);
        }

        const label = document.createElement('span');
        label.className = 'catalog-action-label';
        // entry.label, no entry.actionName: una regla puede poner su
        // propio texto con "overlayText" (mas corto, o el que entra en
        // el ancho que tiene la tarjeta).
        label.textContent = entry.label;

        // "!lento" debajo del texto principal, a la mitad de tamaño.
        // En la tarjeta normal (columna) basta con ponerlo a
        // continuacion; en la ancha el texto va a la DERECHA de la
        // imagen, asi que etiqueta y comando se agrupan en un bloque
        // propio para que queden uno encima del otro. Sin comando no
        // se envuelve nada: las tarjetas de siempre no cambian.
        if (entry.chatCommand) {
            const command = document.createElement('span');
            command.className = 'catalog-chat-command';

            // Comando a la izquierda y coste a la derecha
            // (justify-content: space-between), con el token PLATEADO:
            // el dorado es el de las monedas de TikTok.
            const name = document.createElement('span');
            name.className = 'catalog-chat-name';
            name.textContent = entry.chatCommand;

            const cost = document.createElement('span');
            cost.className = 'catalog-chat-cost';
            cost.innerHTML = `<span>${entry.tokenCost}</span>${TOKEN_SVG}`;

            command.append(name, cost);

            if (ancho > 1) {
                const text = document.createElement('div');
                text.className = 'catalog-text-block';
                text.append(label, command);
                item.append(visual, text);
            } else {
                item.append(visual, label, command);
            }
        } else {
            item.append(visual, label);
        }

        // Varios regalos para la misma accion (2026-09-20): sus
        // nombres, separados por "/", en una segunda linea chica
        // debajo del nombre de la accion. Con un solo regalo (el
        // 99% de las reglas de siempre) esto no se dibuja nada -
        // cero cambio visual para las tarjetas de toda la vida.
        //
        // Solo en tarjetas normales (ancho == 1): las anchas
        // (overlaySpan, "CADENAS"/"TERREMOTO") reparten imagen y
        // texto en FILA, no en columna, y meter una linea mas ahi
        // pedía repensar ese layout aparte. Sin casos de uso todavía
        // (un combo de varios regalos para un efecto con tarjeta
        // ancha), así que se dejó afuera a propósito.
        if (entry.giftNames.length > 1 && ancho <= 1) {
            const giftNames = document.createElement('span');
            giftNames.className = 'catalog-gift-names';
            giftNames.textContent = entry.giftNames.join(' / ');
            item.appendChild(giftNames);
        }

        return item;
    }

    // ------------------------------------------------------------
    // PAGINACION
    // ------------------------------------------------------------
    //
    // La cuadricula funciona como paginas: se muestra un grupo de
    // reglas y cada rotateIntervalMs cambia el grupo ENTERO por el
    // siguiente. No se va sustituyendo celda por celda.
    //
    // Cada pagina se llena HASTA EL TOPE con la cuadricula que diga
    // config.json (columns x rows). La ultima puede quedar con una o
    // dos tarjetas y huecos al lado: es a proposito, la cuadricula
    // es la que define el usuario y se respeta tal cual. (Antes se
    // repartian parejo entre paginas para evitar esos huecos, y el
    // resultado era que casi nunca se veia la franja completa.)
    //
    // Antes cada regla ocupaba exactamente una celda, asi que repartir
    // era dividir. Ahora una regla puede pedir mas de una celda de
    // ancho o de alto ("overlaySpan" / "overlayRowSpan"), asi que hay
    // que ir COLOCANDOLAS: se recorre la cuadricula de arriba a abajo
    // y de izquierda a derecha buscando el primer hueco donde entre, y
    // cuando ya no entra se empieza otra pagina.
    //
    // El orden de las reglas se respeta, no se reordena para tapar
    // huecos: el catalogo tiene que leerse igual que la lista del
    // panel.
    // ------------------------------------------------------------

    function paginar(team) {
        const cols = team.columns;
        const rows = team.rows;

        team.pages = [];

        if (!cols || !rows) {
            return;
        }

        let ocupado = null;
        let pagina = null;

        function nuevaPagina() {
            ocupado = Array.from({ length: rows }, () => new Array(cols).fill(false));
            pagina = [];
            team.pages.push(pagina);
        }

        function cabe(fila, col, ancho, alto) {
            if (fila + alto > rows || col + ancho > cols) {
                return false;
            }

            for (let y = fila; y < fila + alto; y++) {
                for (let x = col; x < col + ancho; x++) {
                    if (ocupado[y][x]) {
                        return false;
                    }
                }
            }

            return true;
        }

        function colocar(entry, fila, col, ancho, alto) {
            for (let y = fila; y < fila + alto; y++) {
                for (let x = col; x < col + ancho; x++) {
                    ocupado[y][x] = true;
                }
            }

            pagina.push({ entry, fila, col, ancho, alto });
        }

        nuevaPagina();

        team.all.forEach((entry) => {
            // Una tarjeta nunca puede pedir mas de lo que hay: si la
            // cuadricula tiene 2 columnas y la regla pide 3, se queda
            // en 2. Asi un config.json mas chico no la hace desaparecer.
            const ancho = Math.min(entry.span, cols);
            const alto = Math.min(entry.rowSpan, rows);

            // Dos vueltas: en esta pagina y, si no entra, en una nueva.
            // Una tercera no hace falta porque ancho <= cols y
            // alto <= rows, o sea que en una pagina vacia SIEMPRE entra.
            for (let vuelta = 0; vuelta < 2; vuelta++) {
                for (let fila = 0; fila < rows; fila++) {
                    for (let col = 0; col < cols; col++) {
                        if (cabe(fila, col, ancho, alto)) {
                            colocar(entry, fila, col, ancho, alto);
                            return;
                        }
                    }
                }

                nuevaPagina();
            }
        });
    }

    function renderPage(team) {
        if (!team.columns || !team.rows) {
            return;
        }

        // Si se borraron reglas y ahora hay menos paginas, la pagina
        // actual puede haberse quedado fuera de rango.
        if (team.page >= team.pages.length) {
            team.page = 0;
        }

        const pagina = team.pages[team.page] || [];

        // Huella de lo que habria que dibujar. Sin esto, el sondeo de
        // /api/rules (cada pollRulesIntervalMs) volveria a montar las
        // tarjetas cada pocos segundos y la animacion de entrada se
        // reiniciaria sola.
        const huella = pagina
            .map((p) => `${p.entry.key}#${p.entry.team}${p.entry.chatCommand}(${p.entry.tokenCost})@${p.fila},${p.col}:${p.ancho}x${p.alto}t${p.entry.textBoost}b${p.entry.badgeDx},${p.entry.badgeDy},${p.entry.badgeScale}c${p.entry.commandScale}p${p.entry.padding}`)
            .join('|');

        if (huella === team.painted) {
            return;
        }

        team.painted = huella;
        team.gridEl.replaceChildren();

        pagina.forEach((puesto) => {
            // El envoltorio es el que se coloca en la cuadricula; la
            // tarjeta va dentro y sigue siendo position:absolute sobre
            // el, que es como estaba armado el CSS.
            const slot = document.createElement('div');
            slot.className = 'catalog-slot';
            slot.style.gridColumn = `${puesto.col + 1} / span ${puesto.ancho}`;
            slot.style.gridRow = `${puesto.fila + 1} / span ${puesto.alto}`;

            const item = buildItem(puesto.entry, puesto.ancho);
            slot.appendChild(item);
            team.gridEl.appendChild(slot);

            // Imagen ya en cache: el evento "load" no vuelve a dispararse.
            layoutItem(item);

            // Forzar reflow antes de quitar la clase de entrada, si no
            // el navegador salta directo al estado final sin animar.
            void item.offsetWidth;
            requestAnimationFrame(() => item.classList.remove('catalog-item-entering'));
        });
    }

    function syncTeam(team, entries) {
        team.all = entries;
        paginar(team);
        renderPage(team);
    }

    function nextPage(team) {
        // Todo cabe en una pagina: no hay a donde pasar.
        if (team.pages.length <= 1) {
            return;
        }

        team.page = (team.page + 1) % team.pages.length;
        renderPage(team);
    }

    // ------------------------------------------------------------
    // DE DONDE SALEN LAS REGLAS
    // ------------------------------------------------------------
    //
    // Primero se prueba el MISMO ORIGEN que esta pagina, y solo si eso
    // falla se cae al apiBase de config.json (el panel en el 3000).
    //
    // El orden importa: si la pagina la sirve la app (que es lo
    // normal ahora), el mismo origen funciona siempre, incluso a
    // traves de un tunel de Cloudflare. Con apiBase a 127.0.0.1 el
    // navegador de quien abra la URL publica buscaria el 3000 en SU
    // maquina y el overlay saldria vacio.
    //
    // El respaldo es para cuando la pagina la sirve otra cosa (el
    // run-overlay.bat de toda la vida, o un servidor de pruebas).
    let origenReglas = null;

    // Lo que dice config.json -> "skin". Se relee en cada sondeo.
    let skinConfig = '';

    async function pedirReglas() {
        const candidatos = origenReglas !== null
            ? [origenReglas]
            : ['', catalogConfig.apiBase || 'http://127.0.0.1:3000'];

        let ultimoError = null;

        for (const base of candidatos) {
            try {
                const res = await fetch(`${base}/api/rules`, { cache: 'no-store' });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();

                // Se recuerda el que funciono para no reintentar el
                // otro en cada sondeo.
                origenReglas = base;

                return data;
            } catch (err) {
                ultimoError = err;
            }
        }

        throw ultimoError;
    }

    async function refresh() {
        try {
            const configRes = await fetch('config.json', { cache: 'no-store' });
            const config = await configRes.json();
            catalogConfig = config.catalogConfig || catalogConfig;
            skinConfig = String(config.skin || '').trim();
        } catch {
            // config.json a medio guardar: se sigue con la ultima buena.
        }

        container.style.setProperty('--catalog-gap', `${Number(catalogConfig.gap ?? 6)}px`);

        // Badge "x5" / "15s": tamaño y posicion finos desde
        // config.json (catalogConfig.badge). Se releen en cada
        // sondeo, igual que columns/rows, asi que se pueden ajustar
        // sin refrescar la fuente de OBS.
        //
        // Los valores neutros (escala 1, sin desplazar) dejan el
        // badge donde ha estado siempre, asi que un config.json sin
        // la clave "badge" no cambia nada.
        const badge = catalogConfig.badge || {};
        const badgeScale = Number(badge.scale);
        const badgeX = Number(badge.offsetX);
        const badgeY = Number(badge.offsetY);

        container.style.setProperty(
            '--catalog-badge-scale',
            String(Number.isFinite(badgeScale) && badgeScale > 0 ? badgeScale : 1)
        );
        container.style.setProperty(
            '--catalog-badge-x',
            `${Number.isFinite(badgeX) ? badgeX : 0}px`
        );
        container.style.setProperty(
            '--catalog-badge-y',
            `${Number.isFinite(badgeY) ? badgeY : 0}px`
        );

        // Relleno interior de todas las tarjetas (catalogConfig.padding,
        // px). Sin la clave, el de siempre (4 px del CSS). Una regla
        // puede pisarlo con su overlayPadding.
        const padding = Number(catalogConfig.padding);

        if (Number.isFinite(padding) && padding >= 0) {
            container.style.setProperty('--catalog-padding', `${Math.min(40, padding)}px`);
        } else {
            container.style.removeProperty('--catalog-padding');
        }

        // Tarjeta ancha: hasta que parte del ancho puede ocupar la
        // imagen (con el regalo), que ahora toma todo el alto
        // (catalogConfig.wideImageMax, 0.2-0.8; sin la clave, 0.40).
        const wideMax = Number(catalogConfig.wideImageMax);

        if (Number.isFinite(wideMax) && wideMax > 0) {
            container.style.setProperty('--catalog-wide-img-max', `${Math.round(Math.min(0.8, Math.max(0.2, wideMax)) * 100)}%`);
        } else {
            container.style.removeProperty('--catalog-wide-img-max');
        }

        const layout = readLayout();
        const unico = layout === 'unico';

        // Se enseña un reparto u otro. El que no se usa se queda
        // vacio (syncTeam con []), asi al volver a mostrarse se
        // repinta entero en vez de enseñar tarjetas viejas.
        teams.bueno.wrapEl.hidden = unico;
        teams.malo.wrapEl.hidden = unico;
        teams.unico.wrapEl.hidden = !unico;

        applyLayout(teams.bueno, readDims(catalogConfig.bueno));
        applyLayout(teams.malo, readDims(catalogConfig.malo));
        applyLayout(teams.unico, readUnicoDims());

        applyTitle(teams.bueno, catalogConfig.bueno);
        applyTitle(teams.malo, catalogConfig.malo);
        applyTitle(teams.unico, catalogConfig.unico);

        try {
            const data = await pedirReglas();

            // "auto": el skin del juego activo (overlaySkin de su
            // perfil), que viaja con las reglas. Asi cambiar de juego
            // en el panel cambia tambien el aspecto, sin tocar OBS.
            aplicarSkin(skinConfig === 'auto' ? data.skin : skinConfig);

            // Tamaño global del comando de chat (overlayCommandScale en
            // la raiz de rules.json, se edita desde el panel).
            const cmdScale = Number(data.commandScale);
            container.style.setProperty(
                '--catalog-command-scale',
                String(Number.isFinite(cmdScale) && cmdScale > 0 ? cmdScale : 1)
            );

            const { bueno, malo, todas } = buildEntries(data.rules || []);

            syncTeam(teams.bueno, unico ? [] : bueno);
            syncTeam(teams.malo, unico ? [] : malo);
            syncTeam(teams.unico, unico ? todas : []);
        } catch (err) {
            console.error('Error cargando /api/rules:', err);
        }
    }

    await refresh();

    // Los intervalos se leen una sola vez: cambiarlos si requiere
    // refrescar la fuente de OBS.
    setInterval(refresh, catalogConfig.pollRulesIntervalMs || 3000);

    // Cada equipo avanza su propia pagina. Van en el mismo intervalo
    // pero cada uno tiene su numero de paginas, asi que se
    // desincronizan solos en cuanto uno da la vuelta antes.
    setInterval(() => {
        nextPage(teams.bueno);
        nextPage(teams.malo);
        nextPage(teams.unico);
    },catalogConfig.rotateIntervalMs || 4000);
}

// ============================================================
// PUNTO DE ENTRADA: elige modo segun config.json -> "mode"
// ============================================================
//
// "slider" (o si falta el campo) = comportamiento de siempre,
// cargarInteracciones() sin tocar ni una linea.
// "catalog" = el modo nuevo de arriba.
// ============================================================

/**
 * Pone (o quita, con '') el data-skin del <html>. Sin skin no
 * engancha ninguna regla [data-skin=...] y el overlay se ve como
 * siempre.
 */
function aplicarSkin(nombre) {
    const skin = String(nombre || '').trim();
    const html = document.documentElement;

    if (skin) {
        if (html.dataset.skin !== skin) {
            html.dataset.skin = skin;
        }
    } else if (html.dataset.skin !== undefined) {
        delete html.dataset.skin;
    }
}

async function init() {
    const configRes = await fetch('config.json');
    const config = await configRes.json();
    const mode = config.mode || 'slider';

    // ------------------------------------------------------------
    // SKIN (config.json -> "skin")
    // ------------------------------------------------------------
    //
    // Cambia solo el ASPECTO (marcos, fondo, colores, fuente), no la
    // estructura ni la logica: funciona igual en modo "slider" y en
    // modo "catalog".
    //
    // Sin "skin" en config.json NO se toca el <html>, asi que no
    // engancha ninguna regla [data-skin=...] del CSS y el overlay se
    // ve exactamente como siempre. Ese es el comportamiento por
    // defecto a proposito: un config.json viejo sigue funcionando.
    //
    // Skins disponibles hoy: "megaman" (style.css), "mario64",
    // "crash" y "sotn" (skins/*.css). "auto" = el del juego activo
    // (overlaySkin de su perfil en la app); solo en modo "catalog",
    // que es el que habla con la app.
    // ------------------------------------------------------------
    const skin = String(config.skin || '').trim();

    if (skin !== 'auto') {
        aplicarSkin(skin);
    }

    if (mode === 'catalog') {
        // style.display y no el atributo hidden: .overlay-container
        // tiene display:flex en style.css, que le gana a [hidden].
        // Sin esto el contenedor del slider (vacio, pero de 100% de
        // alto) empuja el catalogo fuera de la pantalla.
        document.querySelector('.overlay-container').style.display = 'none';
        document.getElementById('catalogContainer').hidden = false;
        await iniciarModoCatalog(config.catalogConfig || {});
    } else {
        cargarInteracciones();
    }
}

init();
