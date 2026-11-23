import * as THREE from 'three';

export async function mountHood(car, rig) {
  // The optimized GLB merges objects by material. The mask identifies the
  // connected hood faces of Object_6 without duplicating vertex buffers.
  const source = car.getObjectByName('Object_6');
  const index = source?.geometry.index?.array;
  if (index?.length !== 67731) throw new Error('Unexpected BMW hood mesh');
  const response = await fetch(new URL('./assets/hood-mask.bin', import.meta.url));
  if (!response.ok) throw new Error('Hood geometry mask unavailable');
  const mask = new Uint8Array(await response.arrayBuffer());
  if (mask.length !== Math.ceil(index.length / 24)) {
    throw new Error('Hood mask does not match the BMW model');
  }
  const hoodIndices = new Uint16Array(5078 * 3);
  const bodyIndices = new Uint16Array(index.length - hoodIndices.length);
  let hoodOffset = 0;
  let bodyOffset = 0;
  for (let face = 0; face < index.length / 3; face++) {
    const triangle = index.subarray(face * 3, face * 3 + 3);
    if (mask[face >> 3] & (1 << (face % 8))) {
      hoodIndices.set(triangle, hoodOffset);
      hoodOffset += 3;
    } else {
      bodyIndices.set(triangle, bodyOffset);
      bodyOffset += 3;
    }
  }
  if (hoodOffset !== hoodIndices.length || bodyOffset !== bodyIndices.length) {
    throw new Error('Unexpected BMW hood face count');
  }
  const hoodGeometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
    hoodGeometry.setAttribute(name, attribute);
  }
  hoodGeometry.setIndex(new THREE.BufferAttribute(hoodIndices, 1));
  source.geometry.setIndex(new THREE.BufferAttribute(bodyIndices, 1));
  const panel = new THREE.Mesh(hoodGeometry, source.material);
  panel.name = 'BMW bonnet';
  source.add(panel);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.92, 0.84);
  rig.add(hinge);
  hinge.attach(panel);
  return hinge;
}
