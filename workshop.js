import * as T from 'three';
import { mergeGeometries } from './assets/BufferGeometryUtils.js';

export function mountWorkshop(scene) {
  scene.background = new T.Color('#100e0d');
  scene.fog = new T.FogExp2('#100e0d', 0.045);
  const room = new T.Group();
  room.rotation.y = Math.atan2(0.73, 0.68);
  scene.add(room);
  const steel = new T.MeshStandardMaterial({ color: '#28282a', metalness: 0.35, roughness: 0.62 });
  const concrete = new T.MeshStandardMaterial({ color: '#22201f', roughness: 0.89 });
  const black = new T.MeshStandardMaterial({ color: '#101113', roughness: 0.71 });
  const orange = new T.MeshStandardMaterial({ color: '#c45125', metalness: 0.35, roughness: 0.62 });
  const light = new T.MeshBasicMaterial({ color: '#ffe9d4' });
  const amber = new T.MeshBasicMaterial({ color: '#b2683e' });
  function box(w, h, d, x, y, z, material, parent = room) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  box(32, 0.16, 42, 0, -0.11, -8, concrete);
  box(4.2, 4.3, 0.25, -4.55, 2.14, -8, steel);
  box(4.2, 4.3, 0.25, 4.55, 2.14, -8, steel);
  box(5, 1.25, 0.27, 0, 4.02, -8, steel);
  box(0.1, 3.5, 0.35, -2.45, 1.75, -7.91, orange);
  box(0.1, 3.5, 0.35, 2.45, 1.75, -7.91, orange);
  const shutter = new T.Group();
  room.add(shutter);
  box(4.82, 3.46, 0.12, 0, 0, -8.06, steel, shutter);
  for (let i = 0; i < 19; i++) box(4.81, 0.027, 0.035, 0, -1.7 + i * 0.186, -7.982, black, shutter);
  box(4.86, 0.08, 0.18, 0, -1.72, -8, orange, shutter);

  for (const side of [-1, 1]) {
    box(0.19, 4.55, 16, side * 6.6, 2.25, -3.7, concrete);
    box(0.048, 0.009, 16, side * 1.8, -0.025, -4.3, amber);
    box(0.07, 0.012, 16, side * 3.4, -0.023, -4.3, steel);
    for (const z of [-9.8, -5.5, -1.7, 2.1]) {
      box(3.4, 0.1, 0.17, side * 2.8, 4.05, z, black);
      box(3.3, 0.045, 0.1, side * 2.8, 3.99, z, light);
    }
    const x = side * 4.1;
    box(2.05, 0.87, 0.74, x, 0.48, -6.5, orange);
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
  box(4.2, 0.07, 0.1, 0, 3.61, -7.79, light);
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
  return (closed) => { shutter.position.y = 1.73 + (1 - closed) * 3.48; };
}
