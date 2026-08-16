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

cargarInteracciones();