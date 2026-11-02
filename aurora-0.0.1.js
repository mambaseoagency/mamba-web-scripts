(async function () {
  const auroraContainers = document.querySelectorAll('.aurora-canvas-container');

  if (!auroraContainers.length) return;
  if (window.matchMedia('(max-width: 767px)').matches) return;
  if (window.__auroraGlobalInit) return;
  window.__auroraGlobalInit = true;

  const { Renderer, Program, Mesh, Triangle, Vec2 } = await import('https://esm.sh/ogl');

  function hexToRgb(hex) {
    const cleanHex = hex.replace('#', '');
    return [
      parseInt(cleanHex.substring(0, 2), 16) / 255,
      parseInt(cleanHex.substring(2, 4), 16) / 255,
      parseInt(cleanHex.substring(4, 6), 16) / 255,
    ];
  }

  const VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

  const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform float uBlend;
uniform float uIsWhite;

uniform vec2 uResolution;
uniform vec2 uMouse;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uWhiteBase;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

vec2 getCoverUv(vec2 uv, vec2 resolution) {
  float baseAspect = 16.0 / 9.0;
  float screenAspect = resolution.x / max(resolution.y, 1.0);
  vec2 correctedUv = uv - 0.5;
  if (screenAspect < baseAspect) {
    correctedUv.x *= screenAspect / baseAspect;
  } else {
    correctedUv.y *= baseAspect / screenAspect;
  }
  return correctedUv + 0.5;
}

void main() {
  vec2 safeResolution = max(uResolution, vec2(1.0));
  vec2 rawUv = gl_FragCoord.xy / safeResolution.xy;
  vec2 uv = getCoverUv(rawUv, safeResolution);
  uv += uMouse * 0.018;

  vec3 rampColor;
  if (uv.x < 0.5) {
    rampColor = mix(uColor1, uColor2, uv.x * 2.0);
  } else {
    rampColor = mix(uColor2, uColor3, (uv.x - 0.5) * 2.0);
  }

  float elegantFlow = uTime * 0.095;
  float height = snoise(vec2(uv.x * 2.15 + elegantFlow, uTime * 0.14)) * 0.5 * uAmplitude;
  height = exp(height);
  height = uv.y * 2.0 - height + 0.2;

  float intensity = 0.6 * height;
  float safeBlend = max(uBlend, 0.001);
  float auroraAlpha = smoothstep(0.20 - safeBlend * 0.5, 0.20 + safeBlend * 0.5, intensity);

  vec3 blackAuroraColor = intensity * rampColor;
  vec3 whiteAuroraColor = mix(uWhiteBase, rampColor, 0.42);
  whiteAuroraColor *= 0.82 + auroraAlpha * 0.18;

  vec3 finalColor = mix(blackAuroraColor, whiteAuroraColor, uIsWhite);
  float alphaStrength = mix(1.0, 0.72, uIsWhite);
  float finalAlpha = auroraAlpha * alphaStrength;

  fragColor = vec4(finalColor * finalAlpha, finalAlpha);
}`;

  const activeAuroras = new Set();

  let globalMouseX = 0;
  let globalMouseY = 0;

  window.addEventListener('pointermove', function (event) {
    globalMouseX = (event.clientX / window.innerWidth) * 2 - 1;
    globalMouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  }, { passive: true });

  function initAurora(container, attempt = 0) {
    if (!container) return;

    if (container.dataset.auroraInitialized === 'true' || container.dataset.auroraInitializing === 'true') return;

    const section = container.closest('.section.hero-sec') || container.closest('.section');

    if (!section) {
      console.warn('Aurora container must be inside a .section element.', container);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();

    if (containerRect.width < 2 || containerRect.height < 2 || sectionRect.width < 2 || sectionRect.height < 2) {
      if (attempt < 30) {
        window.setTimeout(function () { initAurora(container, attempt + 1); }, 100);
      } else {
        console.warn('Aurora could not initialize because its container has no size.', container);
      }
      return;
    }

    container.dataset.auroraInitializing = 'true';

    const isWhite = container.classList.contains('white');

    const config = {
      color1: container.dataset.color1 || '#CCFF30',
      color2: container.dataset.color2 || '#CCFF30',
      color3: container.dataset.color3 || '#CCFF30',
      whiteBase: container.dataset.whiteBase || '#fefefe',
      isWhite: isWhite ? 1 : 0,
      amplitude: 0,
      blend: 0.01,
      speed: 1,
      mouseX: 0,
      mouseY: 0,
    };

    let renderer, gl, program, mesh, resizeObserver, animationFrame, orientationTimer;
    let isDestroyed = false;
    let isContextLost = false;

    try {
      container.innerHTML = '';

      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      });

      gl = renderer.gl;
      if (!gl) throw new Error('WebGL renderer could not be created.');

      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.canvas.style.backgroundColor = 'transparent';

      container.appendChild(gl.canvas);

      const geometry = new Triangle(gl);
      if (geometry.attributes.uv) delete geometry.attributes.uv;

      program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uAmplitude: { value: config.amplitude },
          uBlend: { value: config.blend },
          uIsWhite: { value: config.isWhite },
          uResolution: { value: new Vec2(1, 1) },
          uMouse: { value: new Vec2(0, 0) },
          uColor1: { value: hexToRgb(config.color1) },
          uColor2: { value: hexToRgb(config.color2) },
          uColor3: { value: hexToRgb(config.color3) },
          uWhiteBase: { value: hexToRgb(config.whiteBase) },
        },
      });

      mesh = new Mesh(gl, { geometry, program });
    } catch (error) {
      console.error('Aurora initialization failed:', error);
      container.dataset.auroraInitializing = 'false';
      container.dataset.auroraInitialized = 'false';
      return;
    }

    let lastWidth = 0;
    let lastHeight = 0;

    function resizeAurora() {
      if (isDestroyed || isContextLost || !container.isConnected) return;

      const styles = window.getComputedStyle(container);
      const bleedX = parseFloat(styles.getPropertyValue('--aurora-bleed-x-2')) || 0;

      const currentSectionRect = section.getBoundingClientRect();
      const currentContainerRect = container.getBoundingClientRect();

      if (currentContainerRect.width < 2 || currentContainerRect.height < 2 || currentSectionRect.height < 2) return;

      const isResponsive = window.matchMedia('(max-width: 991px)').matches;
      const heightRatio = isResponsive ? 0.25 : 0.8;
      const maxAuroraHeight = currentSectionRect.height * heightRatio;

      const cssWidth = Math.max(1, Math.round(currentContainerRect.width + bleedX * 2));
      const cssHeight = Math.max(1, Math.round(Math.min(currentContainerRect.height, maxAuroraHeight)));

      if (cssWidth === lastWidth && cssHeight === lastHeight) return;

      lastWidth = cssWidth;
      lastHeight = cssHeight;

      renderer.setSize(cssWidth, cssHeight);
      gl.canvas.style.width = cssWidth + 'px';
      gl.canvas.style.height = cssHeight + 'px';
      program.uniforms.uResolution.value.set(cssWidth, cssHeight);
    }

    function startGsapAnimation() {
      if (!window.gsap) {
        config.amplitude = 0.78;
        config.blend = 0.5;
        config.speed = 0.85;
        return;
      }

      window.gsap.killTweensOf(config);

      window.gsap.to(config, {
        amplitude: 1,
        blend: 0.5,
        speed: 0.7,
        duration: 3.2,
        ease: 'power3.out',
        onComplete: function () {
          if (isDestroyed) return;
          window.gsap.to(config, { amplitude: 0.78, duration: 5.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
          window.gsap.to(config, { speed: 0.95, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        },
      });
    }

    let accumulatedTime = 0;
    let lastTime = performance.now();

    function updateAurora(now) {
      if (isDestroyed || isContextLost || !program || !mesh || !container.isConnected) return;

      animationFrame = requestAnimationFrame(updateAurora);

      if (document.hidden) { lastTime = now; return; }

      const delta = Math.min(now - lastTime, 50) * 0.01;
      lastTime = now;
      accumulatedTime += delta * config.speed * 0.1;

      config.mouseX += (globalMouseX - config.mouseX) * 0.035;
      config.mouseY += (globalMouseY - config.mouseY) * 0.035;

      program.uniforms.uTime.value = accumulatedTime;
      program.uniforms.uAmplitude.value = config.amplitude;
      program.uniforms.uBlend.value = config.blend;
      program.uniforms.uIsWhite.value = config.isWhite;
      program.uniforms.uMouse.value.set(config.mouseX, config.mouseY);

      renderer.render({ scene: mesh });
    }

    function handleOrientationChange() {
      window.clearTimeout(orientationTimer);
      orientationTimer = window.setTimeout(resizeAurora, 300);
    }

    function handleContextLost(event) {
      event.preventDefault();
      isContextLost = true;
      console.warn('Aurora WebGL context lost.', container);
    }

    function handleContextRestored() {
      container.destroyAurora?.();
      window.setTimeout(function () { initAurora(container); }, 100);
    }

    gl.canvas.addEventListener('webglcontextlost', handleContextLost, false);
    gl.canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    window.addEventListener('resize', resizeAurora, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange);

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(function () { requestAnimationFrame(resizeAurora); });
      resizeObserver.observe(container);
      resizeObserver.observe(section);
    }

    resizeAurora();

    requestAnimationFrame(function () {
      resizeAurora();
      requestAnimationFrame(resizeAurora);
    });

    window.setTimeout(resizeAurora, 300);
    window.setTimeout(resizeAurora, 1000);

    startGsapAnimation();

    animationFrame = requestAnimationFrame(updateAurora);

    container.dataset.auroraInitializing = 'false';
    container.dataset.auroraInitialized = 'true';

    activeAuroras.add(container);

    container.destroyAurora = function () {
      if (isDestroyed) return;
      isDestroyed = true;

      cancelAnimationFrame(animationFrame);
      window.clearTimeout(orientationTimer);

      resizeObserver?.disconnect();

      window.removeEventListener('resize', resizeAurora);
      window.removeEventListener('orientationchange', handleOrientationChange);

      gl.canvas.removeEventListener('webglcontextlost', handleContextLost);
      gl.canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      if (window.gsap) window.gsap.killTweensOf(config);

      gl.canvas.remove();

      activeAuroras.delete(container);

      container.dataset.auroraInitializing = 'false';
      container.dataset.auroraInitialized = 'false';
    };
  }

  function initializeAllAuroras() {
    document.querySelectorAll('.aurora-canvas-container').forEach(function (container) {
      initAurora(container);
    });
  }

  initializeAllAuroras();
  requestAnimationFrame(initializeAllAuroras);
  window.setTimeout(initializeAllAuroras, 300);
  window.setTimeout(initializeAllAuroras, 1000);

  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    document.querySelectorAll('.aurora-canvas-container').forEach(function (container) {
      container.destroyAurora?.();
      initAurora(container);
    });
  });
})();
