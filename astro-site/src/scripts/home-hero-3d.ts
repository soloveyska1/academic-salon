import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  TorusKnotGeometry,
  WebGLRenderer,
} from 'three';

type MountHero3DOptions = {
  canvas: HTMLCanvasElement;
  hero: HTMLElement;
};

export function mountHero3D({ canvas, hero }: MountHero3DOptions) {
  if (canvas.dataset.three === '1') {
    return function noop() {};
  }

  canvas.dataset.three = '1';
  canvas.classList.add('is-active');

  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 4.8);

  const goldColor = new Color(0xd4af37);
  const goldLight = new Color(0xf3df95);
  const brassLight = new Color(0xa27a2d);

  const geometry = new TorusKnotGeometry(0.92, 0.28, 96, 18, 2, 3);
  const material = new MeshStandardMaterial({
    color: goldColor,
    emissive: goldColor,
    emissiveIntensity: 0.12,
    metalness: 0.88,
    roughness: 0.32,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);

  const wireGeometry = geometry.clone();
  const wireMat = new MeshBasicMaterial({
    color: goldLight,
    wireframe: true,
    transparent: true,
    opacity: 0.035,
  });
  const wireMesh = new Mesh(wireGeometry, wireMat);
  wireMesh.scale.setScalar(0.94);
  scene.add(wireMesh);

  const particleCount = 36;
  const particleGeo = new BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < positions.length; i += 1) {
    positions[i] = (Math.random() - 0.5) * 5.4;
  }
  particleGeo.setAttribute('position', new BufferAttribute(positions, 3));

  const particleMat = new PointsMaterial({
    color: goldLight,
    size: 0.018,
    transparent: true,
    opacity: 0.36,
  });
  const particles = new Points(particleGeo, particleMat);
  scene.add(particles);

  const ambientLight = new AmbientLight(0x1a1610, 0.55);
  scene.add(ambientLight);

  const pointLight = new PointLight(goldColor, 1.6, 9);
  pointLight.position.set(2.1, 1.9, 3);
  scene.add(pointLight);

  const rimLight = new PointLight(brassLight, 0.35, 8);
  rimLight.position.set(-2.6, -0.8, 2.1);
  scene.add(rimLight);

  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  let rafId = 0;
  let active = true;
  let inView = true;

  function onMove(event: PointerEvent) {
    const rect = hero.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  }

  function onLeave() {
    targetX = 0;
    targetY = 0;
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function scheduleNextFrame() {
    if (!active || rafId) return;
    rafId = window.requestAnimationFrame(animate);
  }

  function animate(time: number) {
    rafId = 0;
    if (!active) return;
    if (!inView || document.hidden) {
      scheduleNextFrame();
      return;
    }

    const t = time * 0.001;

    mouseX += (targetX - mouseX) * 0.04;
    mouseY += (targetY - mouseY) * 0.04;

    mesh.rotation.x = t * 0.14 + mouseY * 0.24;
    mesh.rotation.y = t * 0.18 + mouseX * 0.24;
    mesh.rotation.z = t * 0.04;

    wireMesh.rotation.x = mesh.rotation.x + 0.08;
    wireMesh.rotation.y = mesh.rotation.y - 0.08;
    wireMesh.rotation.z = mesh.rotation.z;

    mesh.position.y = Math.sin(t * 0.45) * 0.11;
    wireMesh.position.y = mesh.position.y;

    particles.rotation.y = t * 0.024;
    particles.rotation.x = t * 0.015;

    pointLight.position.x = 2.1 + mouseX * 0.9;
    pointLight.position.y = 1.9 - mouseY * 0.9;

    renderer.render(scene, camera);
    scheduleNextFrame();
  }

  const visibilityObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function(entries) {
            inView = !!entries[0]?.isIntersecting;
            if (inView) {
              scheduleNextFrame();
            }
          },
          { threshold: 0.02 }
        )
      : null;

  visibilityObserver?.observe(hero);
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', scheduleNextFrame, { passive: true });

  resize();
  scheduleNextFrame();

  return function cleanup() {
    active = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    visibilityObserver?.disconnect();
    document.removeEventListener('visibilitychange', scheduleNextFrame);
    window.removeEventListener('resize', resize);
    hero.removeEventListener('pointermove', onMove);
    hero.removeEventListener('pointerleave', onLeave);
    renderer.dispose();
    geometry.dispose();
    wireGeometry.dispose();
    material.dispose();
    wireMat.dispose();
    particleGeo.dispose();
    particleMat.dispose();
    canvas.classList.remove('is-active');
    delete canvas.dataset.three;
  };
}
