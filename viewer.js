import * as THREE from 'three';
import { GLTFLoader } from './assets/GLTFLoader.js';
import { MeshoptDecoder } from './assets/meshopt_decoder.module.js';
import { RoomEnvironment } from './assets/RoomEnvironment.js';

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
  const left = document.getElementById('turn-left');
  const right = document.getElementById('turn-right');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const scene = new THREE.Scene();
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
  addLight(0xbdcaff, 1.1, 4, 4, -4);
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
    if (['Meshesbody151Mtl', 'Mesheslivery1Mtl'].includes(material.name)) {
      material.map = null;
      material.color.set('#326a62');
      material.metalness = 0.68;
      material.roughness = 0.33;
    }
    if (['Meshesm8rim1Mtl', 'Meshesm8rim0011Mtl', 'Mesheszx1Mtl', 'Mesheschrome51Mtl'].includes(material.name)) {
      material.color.set('#34383c');
      material.metalness = 0.78;
      material.roughness = 0.31;
    }
  });
  rig.add(car);

  const markers = Object.entries(anchors).filter(([id]) => services.has(id)).map(([id, anchor]) => {
    const button = document.createElement('button');
    const symbol = document.createElement('span');
    symbol.textContent = '+';
    symbol.setAttribute('aria-hidden', 'true');
    button.type = 'button';
    button.className = 'marker';
    button.setAttribute('aria-label', services.get(id).part + ' — ' + services.get(id).title);
    button.title = services.get(id).part;
    button.append(symbol);
    button.onclick = () => openService(id);
    document.getElementById('markers').append(button);
    return { button, anchor: new THREE.Vector3(...anchor) };
  });

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const projected = new THREE.Vector3();
  let targetYaw = 0;
  let yaw = 0;
  let frame = 0;
  let visible = true;
  let ready = true;
  let width = 0;
  let height = 0;

  function draw() {
    frame = 0;
    yaw = motion.matches ? targetYaw : THREE.MathUtils.lerp(yaw, targetYaw, 0.25);
    if (Math.abs(targetYaw - yaw) < 0.001) yaw = targetYaw;
    rig.rotation.y = yaw;
    renderer.render(scene, camera);
    for (const { button, anchor } of markers) {
      projected.copy(anchor);
      rig.localToWorld(projected);
      projected.project(camera);
      const x = (projected.x + 1) * width / 2;
      const y = (1 - projected.y) * height / 2;
      button.style.left = x + 'px';
      button.style.top = y + 'px';
      button.hidden = x < 22 || x > width - 22 || y < 22 || y > height - 22;
    }
    if (yaw !== targetYaw) requestDraw();
  }
  function requestDraw() {
    if (visible && ready && !frame) frame = requestAnimationFrame(draw);
  }
  function resize() {
    width = garage.clientWidth;
    height = garage.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    const narrow = camera.aspect < 1.02;
    const distance = narrow ? 7.9 / Math.min(1, camera.aspect / 1.02) : 7.9;
    camera.position.set(distance * 0.73, distance * 0.27, distance * 0.68);
    camera.lookAt(0, narrow ? 0.66 : 0.87, 0);
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
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, baseline: targetYaw, active: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
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
      if (drag?.id === event.pointerId) drag = undefined;
    });
  }

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
  resize();
  document.getElementById('load-state').hidden = true;
}
