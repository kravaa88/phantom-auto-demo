import * as T from 'three';
import { mergeGeometries } from './assets/BufferGeometryUtils.js';
import { gateX } from './arrival.js';
import { Reflector } from './assets/Reflector.js';

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function polishedConcrete() {
  const texture = canvasTexture(512, (ctx, size) => {
    let seed = 8471;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ctx.fillStyle = '#b9b8b6';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 29000; i++) {
      ctx.fillStyle = random() < 0.53 ? '#37363422' : '#efede744';
      ctx.fillRect(random() * size, random() * size, 0.6 + random() * 1.9, 0.5 + random() * 1.25);
    }
    for (let i = 0; i < 22; i++) {
      const x = random() * size;
      const y = random() * size;
      const radius = 10 + random() * 32;
      const shade = ctx.createRadialGradient(x, y, 0, x, y, radius);
      shade.addColorStop(0, '#1f1e191a');
      shade.addColorStop(1, '#1f1e1900');
      ctx.fillStyle = shade;
      ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    }
  });
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(9, 12);
  return texture;
}
const floorShader = {
  ...Reflector.ReflectorShader,
  uniforms: { ...Reflector.ReflectorShader.uniforms, texel: { value: new T.Vector2() } },
  fragmentShader: Reflector.ReflectorShader.fragmentShader
    .replace('uniform vec3 color;', 'uniform vec3 color; uniform vec2 texel;')
    .replace('vec4 base = texture2DProj( tDiffuse, vUv );', `
      vec2 uv = vUv.xy / vUv.w;
      vec3 reflection = texture2D(tDiffuse, uv).rgb * 0.28;
      reflection += texture2D(tDiffuse, uv + texel * vec2(2.2, 0.0)).rgb * 0.18;
      reflection += texture2D(tDiffuse, uv - texel * vec2(2.2, 0.0)).rgb * 0.18;
      reflection += texture2D(tDiffuse, uv + texel * vec2(0.0, 3.1)).rgb * 0.18;
      reflection += texture2D(tDiffuse, uv - texel * vec2(0.0, 3.1)).rgb * 0.18;
      float brightness = dot(reflection, vec3(0.2126, 0.7152, 0.0722));
    `)
    .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
      'gl_FragColor = vec4(reflection * color, mix(0.10, 0.40, smoothstep(0.16, 1.0, brightness)));'),
};
export function mountWorkshop(scene, touch) {
  scene.background = new T.Color('#100e0d');
  scene.fog = new T.FogExp2('#100e0d', 0.045);
  const room = new T.Group();
  room.rotation.y = Math.atan2(0.73, 0.68);
  scene.add(room);
  const steel = new T.MeshStandardMaterial({ color: '#28282a', metalness: 0.35, roughness: 0.62 });
  const concrete = new T.MeshStandardMaterial({ color: '#22201f', roughness: 0.89 });
  const floor = new T.MeshStandardMaterial({
    map: polishedConcrete(), color: '#686966', roughness: 0.49, metalness: 0.14,
  });
  const frame = new T.MeshStandardMaterial({ color: '#55595d', metalness: 0.63, roughness: 0.41 });
  const graphite = new T.MeshStandardMaterial({ color: '#33383d', metalness: 0.22, roughness: 0.55 });
  const black = new T.MeshStandardMaterial({ color: '#101113', roughness: 0.71 });
  const orange = new T.MeshStandardMaterial({ color: '#c45125', metalness: 0.35, roughness: 0.62 });
  const light = new T.MeshBasicMaterial({ color: '#fff0dd', toneMapped: false });
  const emitters = new T.Group();
  emitters.rotation.copy(room.rotation);
  const radiance = new T.MeshBasicMaterial({ color: new T.Color('#fff2df').multiplyScalar(13) });
  const amber = new T.MeshBasicMaterial({ color: '#b2683e' });
  function box(w, h, d, x, y, z, material, parent = room) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    if (material === light) {
      const emitter = new T.Mesh(mesh.geometry.clone(), radiance);
      emitter.position.copy(mesh.position);
      emitters.add(emitter);
    }
    return mesh;
  }

  box(32, 0.16, 42, 0, -0.11, -8, floor);
  box(9.6, 4.3, 0.25, -4.2, 2.14, -8, steel);
  box(3.4, 4.3, 0.25, 7.3, 2.14, -8, steel);
  box(5, 1.25, 0.27, gateX, 4.02, -8, steel);
  box(0.1, 3.5, 0.35, gateX - 2.45, 1.75, -7.91, orange);
  box(0.1, 3.5, 0.35, gateX + 2.45, 1.75, -7.91, orange);
  box(18, 0.19, 13.8, 0, 4.35, -1.1, graphite);
  for (const z of [-6.9, -3.4, 0.2, 3.9]) {
    box(18, 0.19, 0.26, 0, 4.13, z, black);
    box(9.8, 0.035, 0.12, -0.72, 4.023, z, light);
  }
  for (const x of [-7.7, -5.85, -3.98, -2.08, -0.25, 6.02, 7.87]) {
    box(0.04, 4.22, 0.045, x, 2.11, -7.851, frame);
  }
  box(8.9, 0.078, 0.088, -4.15, 2.93, -7.8, light);
  box(8.9, 0.19, 0.12, -4.15, 0.16, -7.77, black);
  box(2.72, 0.058, 0.088, 7.25, 2.93, -7.8, light);
  const shutter = new T.Group();
  shutter.position.x = gateX;
  room.add(shutter);
  box(4.82, 3.46, 0.12, 0, 0, -8.06, steel, shutter);
  for (let i = 0; i < 19; i++) box(4.81, 0.027, 0.035, 0, -1.7 + i * 0.186, -7.982, black, shutter);
  box(4.86, 0.08, 0.18, 0, -1.72, -8, orange, shutter);

  for (const side of [-1, 1]) {
    box(0.19, 4.55, 16, side * 9, 2.25, -3.7, concrete);
    const laneX = side * 1.48;
    box(0.048, 0.009, 7.8, gateX + laneX, -0.025, -11.9, amber);
    const guide = box(0.048, 0.009, Math.hypot(gateX, 8), laneX + gateX / 2, -0.025, -4, amber);
    guide.rotation.y = -Math.atan2(gateX, 8);
    box(0.048, 0.009, 4, laneX, -0.025, 2, amber);
    box(0.07, 0.012, 16, side * 3.4, -0.023, -4.3, steel);
    for (const z of [-9.8, -5.5, -1.7, 2.1]) {
      box(3.4, 0.1, 0.17, side * 2.8, 4.05, z, black);
      box(3.3, 0.045, 0.1, side * 2.8, 3.99, z, light);
    }
    const x = side < 0 ? -3.5 : 7.35;
    box(2.05, 0.87, 0.74, x, 0.48, -6.5, graphite);
    box(0.045, 0.77, 0.035, x - 0.95, 0.48, -6.11, orange);
    box(0.045, 0.77, 0.035, x + 0.95, 0.48, -6.11, orange);
    box(1.82, 0.59, 0.52, x, 2.67, -7.08, graphite);
    box(1.8, 0.034, 0.04, x, 2.38, -6.79, frame);
    box(0.024, 0.51, 0.028, x, 2.7, -6.79, black);
    box(0.57, 0.027, 0.032, x - 0.45, 2.5, -6.77, frame);
    box(0.57, 0.027, 0.032, x + 0.45, 2.5, -6.77, frame);
    box(2.16, 0.1, 0.85, x, 0.97, -6.5, black);
    box(2.06, 1.2, 0.08, x, 1.67, -6.87, black);
    for (let drawer = 0; drawer < 4; drawer++) {
      const y = 0.23 + drawer * 0.169;
      box(1.9, 0.016, 0.025, x, y, -6.119, black);
      box(0.64, 0.03, 0.028, x, y + 0.047, -6.09, steel);
    }
    for (let hook = 0; hook < 6; hook++) {
      const tool = box(0.05, 0.35 + hook * 0.033, 0.048, x - 0.74 + hook * 0.29, 1.65, -6.794, steel);
      tool.rotation.z = hook % 2 ? 0.16 : -0.16;
      box(0.11, 0.075, 0.061, tool.position.x, 1.84 + hook * 0.014, -6.78, amber);
    }
    box(1.92, 0.04, 0.055, x, 2.25, -6.79, light);
  }
  box(4.2, 0.07, 0.1, gateX, 3.61, -7.79, light);
  const dusk = new T.MeshBasicMaterial({ color: '#403c43' });
  box(20, 8, 0.12, gateX, 3, -23, dusk);
  box(0.1, 2.7, 0.17, gateX + 2.13, 1.35, -9.5, light);
  box(0.1, 2.7, 0.17, gateX - 2.13, 1.35, -9.5, light);
  const floorLight = new T.MeshBasicMaterial({
    map: canvasTexture(128, (ctx, size) => {
      const mid = size / 2;
      const pool = ctx.createRadialGradient(mid, mid, 1, mid, mid, mid);
      pool.addColorStop(0, '#fff1cc56');
      pool.addColorStop(0.45, '#fff1cc28');
      pool.addColorStop(1, '#fff1cc00');
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, size, size);
    }),
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.34,
  });
  for (const [x, z] of [[-3, -6], [3, -5], [0, -1.6], [0, 1.4]]) {
    const pool = new T.Mesh(new T.PlaneGeometry(6.3, 4.8), floorLight);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, -0.0285, z);
    room.add(pool);
  }
  // Batch static fittings by material and keep the rolling gate independent.
  for (const parent of [room, shutter]) {
    const materials = new Map();
    for (const mesh of [...parent.children].filter((child) => child.isMesh)) {
      mesh.updateMatrix();
      mesh.geometry.applyMatrix4(mesh.matrix);
      if (!materials.has(mesh.material)) materials.set(mesh.material, []);
      materials.get(mesh.material).push(mesh.geometry);
      parent.remove(mesh);
    }
    for (const [material, geometries] of materials) {
      parent.add(new T.Mesh(mergeGeometries(geometries), material));
      geometries.forEach((geometry) => geometry.dispose());
    }
  }
  const side = touch ? 320 : 512;
  const mirror = new Reflector(new T.PlaneGeometry(32, 42), {
    textureWidth: side * 2, textureHeight: side, clipBias: 0.002, multisample: 0,
    color: '#e9decc', shader: floorShader,
  });
  mirror.material.uniforms.texel.value.set(1 / (side * 2), 1 / side);
  mirror.material.transparent = true;
  mirror.material.depthWrite = false;
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(0, -0.029, -8);
  mirror.renderOrder = 1;
  room.add(mirror);

  return {
    emitters,
    closeDoor(closed) { shutter.position.y = 1.73 + (1 - closed) * 3.48; },
  };
}
