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

async function iniciarModoCatalog(initialCatalogConfig) {
    let catalogConfig = initialCatalogConfig;

    const container = document.getElementById('catalogContainer');

    const teams = {
        bueno: createTeam('catalogTeamBueno', 'catalogTitleBueno', 'catalogBueno'),
        malo: createTeam('catalogTeamMalo', 'catalogTitleMalo', 'catalogMalo'),
    };

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
            slots: [],
            all: [],
            // Pagina que se esta mostrando. Cada equipo lleva la
            // suya: los buenos y los malos pasan de pagina por su
            // cuenta, porque casi nunca tienen el mismo numero de
            // reglas ni el mismo numero de celdas.
            page: 0,
        };

        new ResizeObserver(() => updateLabelSize(team)).observe(team.gridEl);

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

    function ruleKey(rule) {
        // Las reglas "like" no tienen giftName; el threshold hace de
        // identificador unico en su lugar (dos reglas "like" con el
        // mismo threshold serian ambiguas de por si, en la cola real).
        const id = rule.giftName || `like:${rule.threshold || ''}`;
        return `${id}|${rule.actionName || rule.action || ''}`;
    }

    function buildEntries(rules) {
        const bueno = [];
        const malo = [];

        rules.forEach((rule) => {
            // Dos tipos de regla muestran algo en el catalogo:
            //   - "gift": dispara con un regalo puntual de TikTok.
            //   - "like": dispara cada N likes acumulados (threshold).
            // El resto (por ejemplo reglas "like" sin threshold, mal
            // configuradas) no tiene nada que mostrar.
            const isGiftRule = rule.event === 'gift' && rule.giftName;
            const isLikeRule = rule.event === 'like' && rule.threshold;

            if (!isGiftRule && !isLikeRule) {
                return;
            }

            // Cantidad (spawn_enemy) o duracion (godmode, POWER...): una
            // regla no tiene las dos cosas a la vez, asi que un solo
            // badge alcanza. count == 1 no se muestra, no aporta nada.
            const count = rule.command && rule.command.count;
            const duration = rule.duration;
            let badge = '';

            if (count && count > 1) {
                badge = `x${count}`;
            } else if (duration) {
                badge = `${duration}s`;
            }

            const entry = {
                key: ruleKey(rule),
                // Las reglas "like" no tienen un regalo real: se usa el
                // icono generico de like y el numero de likes como
                // "nombre de regalo" para el alt/etiqueta.
                giftName: isLikeRule ? 'Like' : rule.giftName,
                giftLabel: isLikeRule ? `${rule.threshold} likes` : rule.giftName,
                actionName: rule.actionName || rule.action || '',
                actionImage: rule.overlayImage || '',
                badge,
                // Numero centrado sobre el corazon, solo para reglas
                // "like". "" para reglas de regalo: no se dibuja nada.
                likeCount: isLikeRule ? formatLikeCount(rule.threshold) : '',
            };

            if (rule.team === 'bueno') {
                bueno.push(entry);
            } else {
                malo.push(entry);
            }
        });

        return { bueno, malo };
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
        team.slots = [];
        // Cambiar columns/rows cambia cuantas celdas hay y por tanto
        // como se reparten las paginas: la pagina que se veia ya no
        // significa lo mismo, asi que se vuelve a la primera.
        team.page = 0;

        for (let i = 0; i < columns * rows; i++) {
            const el = document.createElement('div');
            el.className = 'catalog-slot';
            team.gridEl.appendChild(el);
            team.slots.push({ el, entry: null });
        }

        updateLabelSize(team);
    }

    // Sin imagen (nombre provisional o png que todavia no existe) se
    // oculta, en vez de mostrar otra cosa que confunda al viewer.
    function hideOnError(img) {
        img.addEventListener('error', () => {
            img.style.visibility = 'hidden';
        }, { once: true });
    }

    function buildItem(entry) {
        const item = document.createElement('div');
        item.className = 'catalog-item catalog-item-entering';

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

        if (entry.actionImage) {
            const giftWrap = document.createElement('div');
            giftWrap.className = 'catalog-gift-wrap';

            const gift = document.createElement('img');
            gift.className = 'catalog-gift-badge';
            gift.src = giftSrc;
            gift.alt = entry.giftLabel;
            hideOnError(gift);
            giftWrap.appendChild(gift);

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
        label.textContent = entry.actionName;

        item.append(visual, label);

        return item;
    }

    function setSlot(slot, entry) {
        const old = slot.el.querySelector('.catalog-item:not(.catalog-item-leaving)');

        if (old) {
            const remove = () => old.remove();
            old.classList.add('catalog-item-leaving');
            old.addEventListener('transitionend', remove, { once: true });
            // Red de seguridad por si transitionend no llega a disparar.
            setTimeout(remove, 700);
        }

        slot.entry = entry;

        if (!entry) {
            return;
        }

        const item = buildItem(entry);
        slot.el.appendChild(item);

        // Forzar reflow antes de quitar la clase de entrada, si no el
        // navegador salta directo al estado final sin animar.
        void item.offsetWidth;
        requestAnimationFrame(() => item.classList.remove('catalog-item-entering'));
    }

    // ------------------------------------------------------------
    // PAGINACION
    // ------------------------------------------------------------
    //
    // La cuadricula funciona como paginas: se muestra un grupo de
    // reglas y cada rotateIntervalMs cambia el grupo ENTERO por el
    // siguiente. No se va sustituyendo celda por celda.
    //
    // Las reglas se reparten PAREJO entre las paginas en vez de
    // llenar cada una hasta el tope. Con 12 reglas y 10 celdas, la
    // division normal daria una pagina de 10 y otra de 2, y esa
    // segunda se veria casi vacia la mitad del tiempo; repartiendo
    // salen dos paginas de 6. El numero de paginas es el mismo en
    // los dos casos, solo cambia lo llena que va cada una.
    // ------------------------------------------------------------

    function pageCount(team) {
        if (!team.slots.length || !team.all.length) {
            return 1;
        }

        return Math.ceil(team.all.length / team.slots.length);
    }

    // Cuantas reglas van en cada pagina una vez repartidas parejo.
    // Nunca pasa del numero de celdas: si hacen falta N paginas para
    // que quepan todas, repartirlas entre esas N nunca da mas de lo
    // que cabe en una.
    function perPage(team) {
        return Math.ceil(team.all.length / pageCount(team));
    }

    function renderPage(team) {
        if (!team.slots.length) {
            return;
        }

        const total = pageCount(team);

        // Si se borraron reglas y ahora hay menos paginas, la pagina
        // actual puede haberse quedado fuera de rango.
        if (team.page >= total) {
            team.page = 0;
        }

        const size = perPage(team);
        const start = team.page * size;

        team.slots.forEach((slot, index) => {
            const entry = index < size ? (team.all[start + index] || null) : null;

            // Solo se toca la celda que de verdad cambia. Sin esto,
            // el sondeo de /api/rules (cada pollRulesIntervalMs)
            // volveria a montar las tarjetas cada pocos segundos y
            // la animacion de entrada se reiniciaria sola.
            const actual = slot.entry ? slot.entry.key : null;
            const nueva = entry ? entry.key : null;

            if (actual !== nueva) {
                setSlot(slot, entry);
            }
        });
    }

    function syncTeam(team, entries) {
        team.all = entries;
        renderPage(team);
    }

    function nextPage(team) {
        // Todo cabe en una pagina: no hay a donde pasar.
        if (pageCount(team) <= 1) {
            return;
        }

        team.page = (team.page + 1) % pageCount(team);
        renderPage(team);
    }

    async function refresh() {
        try {
            const configRes = await fetch('config.json', { cache: 'no-store' });
            const config = await configRes.json();
            catalogConfig = config.catalogConfig || catalogConfig;
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

        applyLayout(teams.bueno, readDims(catalogConfig.bueno));
        applyLayout(teams.malo, readDims(catalogConfig.malo));

        applyTitle(teams.bueno, catalogConfig.bueno);
        applyTitle(teams.malo, catalogConfig.malo);

        try {
            const apiBase = catalogConfig.apiBase || 'http://127.0.0.1:3000';
            const res = await fetch(`${apiBase}/api/rules`, { cache: 'no-store' });
            const data = await res.json();
            const { bueno, malo } = buildEntries(data.rules || []);

            syncTeam(teams.bueno, bueno);
            syncTeam(teams.malo, malo);
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
    }, catalogConfig.rotateIntervalMs || 4000);
}

// ============================================================
// PUNTO DE ENTRADA: elige modo segun config.json -> "mode"
// ============================================================
//
// "slider" (o si falta el campo) = comportamiento de siempre,
// cargarInteracciones() sin tocar ni una linea.
// "catalog" = el modo nuevo de arriba.
// ============================================================

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
    // Skins disponibles hoy: "megaman".
    // ------------------------------------------------------------
    const skin = String(config.skin || '').trim();

    if (skin) {
        document.documentElement.dataset.skin = skin;
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
