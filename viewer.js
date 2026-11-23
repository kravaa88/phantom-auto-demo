import * as THREE from 'three';
import { GLTFLoader } from './assets/GLTFLoader.js';
import { MeshoptDecoder } from './assets/meshopt_decoder.module.js';
import { RoomEnvironment } from './assets/RoomEnvironment.js';
import { mountHood } from './hood.js';
import { mountPaint } from './paint.js';
import { mountWorkshop } from './workshop.js';
import { offerGarageSound } from './garage-audio.js';

// Anchors use the normalized GLB coordinates. The front bumper is at +Z.
const anchors = {
  engine: [0, 0.78, 1.24],
  brakes: [0.96, 0.35, 1.36],
  tires: [0.98, 0.38, -1.37],
  diagnostics: [0.37, 1.11, 0.4],
};

export async function initViewer(services, openService, showFallback) {
  const canvas = document.getElementById('car');
  const garage = document.getElementById('garage');
  const story = document.getElementById('story');
  const inspection = document.getElementById('inspection');
  const controls = document.getElementById('workshop-actions');
  const progress = document.getElementById('garage-progress');
  const left = document.getElementById('turn-left');
  const right = document.getElementById('turn-right');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const scene = new THREE.Scene();
  const closeDoor = mountWorkshop(scene);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.35 : 1.7));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const reflections = pmrem.fromScene(environment, 0.04);
  scene.environment = reflections.texture;
  environment.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdce7ff, 0x464049, 1.35));
  function addLight(color, intensity, x, y, z) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
  }
  addLight(0xe4f1ff, 2.2, -3, 6, 3);
  addLight(0xff995a, 1.35, 4, 4, -4);
  addLight(0xffe2b1, 0.65, 1, 2, 6);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(0,0,0,0.94)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.67)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 6.45), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.025;

  const rig = new THREE.Group();
  rig.add(shadow);
  scene.add(rig);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL('./assets/bmw-m4.glb', import.meta.url).href);
  const car = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(car);
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 4.76 / bounds.getSize(new THREE.Vector3()).z;
  car.scale.setScalar(scale);
  car.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  car.traverse((object) => {
    const material = object.material;
    if (!material) return;
    if (object.name === 'Object_6' || ['Meshesbody151Mtl', 'Mesheslivery1Mtl'].includes(material.name)) {
      object.material = material.clone();
      object.material.map = null;
      object.material.color.set('#d94c14');
      object.material.metalness = 0.61;
      object.material.roughness = 0.28;
      return;
    }
    if (['Meshesm8rim1Mtl', 'Meshesm8rim0011Mtl', 'Mesheszx1Mtl', 'Mesheschrome51Mtl'].includes(material.name)) {
      material.color.set('#34383c');
      material.metalness = 0.78;
      material.roughness = 0.31;
    }
  });
  rig.add(car);
  let paintSide = 0;
  const paint = await mountPaint(car, rig, camera, canvas, requestDraw, (side) => {
    paintSide = side;
    entranceDone = true;
    requestDraw();
  });
  const hood = await mountHood(car, rig);

  const markers = Object.entries(anchors).filter(([id]) => services.has(id)).map(([id, anchor]) => {
    const button = document.createElement('button');
    const symbol = document.createElement('span');
    symbol.textContent = '+';
    symbol.setAttribute('aria-hidden', 'true');
    button.type = 'button';
    button.className = 'marker';
    button.dataset.part = id;
    button.setAttribute('aria-label', services.get(id).part + ' — ' + services.get(id).title);
    button.title = services.get(id).part;
    const label = document.createElement('small');
    label.textContent = services.get(id).part;
    label.setAttribute('aria-hidden', 'true');
    button.append(symbol, label);
    button.onclick = () => openService(id);
    document.getElementById('markers').append(button);
    return { id, button, anchor: new THREE.Vector3(...anchor) };
  });

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const projected = new THREE.Vector3();
  let entranceStarted = performance.now();
  let entranceDone = false;
  let stage = 0;
  let baseDistance = 7;
  let narrow = false;
  let targetYaw = 0;
  let yaw = 0;
  let frame = 0;
  let visible = true;
  let ready = true;
  let width = 0;
  let height = 0;

  function draw(now) {
    frame = 0;
    yaw = motion.matches ? targetYaw : THREE.MathUtils.lerp(yaw, targetYaw, 0.25);
    if (Math.abs(targetYaw - yaw) < 0.001) yaw = targetYaw;
    const animate = !motion.matches;
    const intro = animate && !entranceDone ? THREE.MathUtils.clamp((now - entranceStarted) / 4200, 0, 1) : 1;
    entranceDone ||= intro === 1 || stage > 0.04 || paintSide !== 0;
    const arrival = entranceDone ? 1 : THREE.MathUtils.smoothstep(intro, 0, 0.82);
    const closure = entranceDone ? 1 : THREE.MathUtils.smoothstep(intro, 0.73, 1);
    const lift = paintSide ? 0 : THREE.MathUtils.smoothstep(stage, 0.1, 0.68);
    const inspectionAngle = 0.24 * lift;
    rig.position.set(-0.73 * 17 * (1 - arrival), 0, -0.68 * 17 * (1 - arrival));
    rig.rotation.y = paintSide ? Math.atan2(0.73, 0.68) - paintSide * Math.PI / 2 : yaw + inspectionAngle + (1 - arrival) * 0.76;
    hood.rotation.x = -1.02 * lift;
    closeDoor(closure);
    story.classList.toggle('inspecting', stage > 0.44);
    progress.hidden = paintSide !== 0 || !animate || stage > 0.49;
    const distance = baseDistance * (1 + lift * (narrow ? 0.065 : 0.075));
    camera.position.set(distance * 0.73, distance * (0.24 + lift * 0.13), distance * 0.68);
        camera.zoom = paintSide ? (narrow ? 2.35 : 1.82) : 1;
    camera.updateProjectionMatrix();
    camera.lookAt(0, paintSide ? 0.65 : (narrow ? 0.69 : 0.86) + lift * 0.13, 0);
    renderer.render(scene, camera);
    for (const { id, button, anchor } of markers) {
      projected.copy(anchor);
      if (id === 'engine') projected.y -= 0.07 * lift;
      rig.localToWorld(projected);
      projected.project(camera);
      const x = (projected.x + 1) * width / 2;
      const y = (1 - projected.y) * height / 2;
      button.style.left = x + 'px';
      button.style.top = y + 'px';
      button.hidden = paintSide !== 0 || arrival < 0.96 || x < 22 || x > width - 22 || y < 22 || y > height - 22;
    }
    if (!entranceDone || yaw !== targetYaw) requestDraw();
  }
  function requestDraw() {
    if (visible && ready && !frame) frame = requestAnimationFrame(draw);
  }
  function resize() {
    width = garage.clientWidth;
    height = garage.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    narrow = camera.aspect < 1.02;
    baseDistance = narrow ? 7.2 / Math.min(1, camera.aspect / 1.02) : 6.7;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    requestDraw();
  }

  left.onclick = () => { targetYaw -= Math.PI / 5; requestDraw(); };
  right.onclick = () => { targetYaw += Math.PI / 5; requestDraw(); };
  left.disabled = right.disabled = false;
  canvas.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    (event.key === 'ArrowLeft' ? left : right).click();
  });

  let drag;
  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (paint.active()) { paint.start(event); return; }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, baseline: targetYaw, active: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (paint.active()) { paint.move(event); return; }
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active && (Math.abs(dx) < 7 || Math.abs(dx) <= Math.abs(dy))) return;
    drag.active = true;
    targetYaw = drag.baseline + dx * (2 * Math.PI / width);
    requestDraw();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(type, (event) => {
      paint.end(event);
      if (drag?.id === event.pointerId) drag = undefined;
    });
  }

  function updateStage() {
    const offset = story.getBoundingClientRect().top;
    const runway = inspection.offsetHeight;
    stage = motion.matches || !runway ? 0 : THREE.MathUtils.clamp(-offset / (runway * 0.76), 0, 1);
    requestDraw();
  }
  function syncMotion() {
    story.classList.toggle('story-active', !motion.matches);
    updateStage();
  }
  progress.addEventListener('click', (event) => {
    event.preventDefault();
    const top = story.getBoundingClientRect().top + scrollY;
    window.scrollTo({ top: top + inspection.offsetHeight * 0.57, behavior: 'smooth' });
  });
  window.addEventListener('scroll', updateStage, { passive: true });
  window.addEventListener('resize', updateStage, { passive: true });
  motion.addEventListener('change', syncMotion);
  offerGarageSound(document.getElementById('garage-sound'));
  syncMotion();
  new ResizeObserver(resize).observe(garage);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) requestDraw();
  }).observe(garage);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    ready = false;
    showFallback(new Error('WebGL context lost'));
  });
  document.getElementById('replay-entrance').onclick = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (paint.active()) document.getElementById('paint-toggle').click();
    targetYaw = yaw = 0;
    entranceStarted = performance.now();
    entranceDone = false;
    updateStage();
  };
  document.getElementById('export-frame').onclick = () => {
    const status = document.getElementById('export-status');
    if (renderer.capabilities.maxTextureSize < 4096 || renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) < 3840) {
      status.textContent = 'This device cannot render a 4K frame.';
      return;
    }
    const exportButton = document.getElementById('export-frame');
    exportButton.disabled = true;
    status.textContent = 'Rendering 4K…';
    const shot = camera.clone();
    shot.aspect = 3840 / 2160;
    if (narrow) {
      shot.position.multiplyScalar(7.4 / baseDistance);
      shot.zoom = paintSide ? 1.55 : 1;
      shot.lookAt(0, paintSide ? 0.65 : 0.88, 0);
    }
    shot.updateProjectionMatrix();
    const ratio = renderer.getPixelRatio();
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(3840, 2160, false);
      renderer.render(scene, shot);
      canvas.toBlob((blob) => {
        exportButton.disabled = false;
        if (!blob) { status.textContent = 'The 4K frame could not be saved.'; return; }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'phantom-auto-bmw-4k.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 30000);
        status.textContent = '4K frame ready.';
      }, 'image/png');
    } catch {
      exportButton.disabled = false;
      status.textContent = 'The 4K frame could not be saved.';
    } finally {
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      requestDraw();
    }
  };
  controls.hidden = false;
  resize();
  document.getElementById('load-state').hidden = true;
}
