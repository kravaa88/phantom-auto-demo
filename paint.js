import * as T from 'three';
export const factoryPaint = '#d94c14';

export async function mountPaint(car, rig, camera, canvas, redraw, selectSide) {
  const panel = document.querySelector('#paint-tools');
  const toggle = document.querySelector('#paint-toggle');
  const status = document.querySelector('#paint-status');
  const undo = document.querySelector('#paint-undo');
  const clear = document.querySelector('#paint-clear');
  const color = document.querySelector('#paint-color');
  const size = document.querySelector('#paint-size');
  const endpoint = new URL('./assets/door-faces.json', import.meta.url);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Door geometry unavailable');
  const groups = await response.json();
  const surfaces = new Map([1, -1].map((sign) => {
    const sheet = document.createElement('canvas');
    sheet.width = 2048;
    sheet.height = 1024;
    const texture = new T.CanvasTexture(sheet);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return [sign, { sheet, ctx: sheet.getContext('2d'), texture, meshes: [], strokes: [] }];
  }));
  rig.updateMatrixWorld(true);
  const livery = car.getObjectByName('Object_28');
  for (const [sign, surface] of surfaces) {
    const mask = document.createElement('canvas');
    mask.width = 2048;
    mask.height = 1024;
    const maskCtx = mask.getContext('2d');
    maskCtx.fillStyle = '#fff';
    maskCtx.strokeStyle = '#fff';
    maskCtx.lineWidth = 1.7;
    const layerGroups = groups.filter(([, side]) => side === sign);
    const point = new T.Vector3();
    const { index, attributes } = livery.geometry;
    const liveryFaces = [];
    for (let face = 0; face < index.count / 3; face++) {
      point.fromBufferAttribute(attributes.position, index.getX(face * 3));
      rig.worldToLocal(livery.localToWorld(point));
      if (point.x * sign > 0.4) liveryFaces.push(face);
    }
    const alphaMap = new T.CanvasTexture(mask);
    const pickingMaterial = new T.MeshBasicMaterial();
    for (const [name, , faces] of [...layerGroups, ['Object_28', sign, liveryFaces]]) {
      const source = car.getObjectByName(name);
      const { index, attributes } = source.geometry;
      const coordinates = [];
      const uv = [];
      for (const face of faces) {
        if (name !== 'Object_28') maskCtx.beginPath();
        for (let corner = 0; corner < 3; corner++) {
          const vertex = index.getX(face * 3 + corner);
          point.fromBufferAttribute(attributes.position, vertex);
          coordinates.push(point.x, point.y, point.z);
          rig.worldToLocal(source.localToWorld(point));
          const u = sign * (point.z - 0.17) / 1.45 + 0.5;
          const v = (point.y - 0.27) / 0.74;
          uv.push(u, v);
          if (name !== 'Object_28') maskCtx[corner ? 'lineTo' : 'moveTo'](u * 2048, (1 - v) * 1024);
        }
        if (name !== 'Object_28') {
          maskCtx.closePath();
          maskCtx.fill();
          maskCtx.stroke();
        }
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(coordinates, 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      const layer = new T.Mesh(geometry, pickingMaterial);
      layer.visible = false;
      source.add(layer);
      surface.meshes.push(layer);
    }
    // The door silhouette is continuous across each horizontal scan line.
    // Fill interior gaps left by the split livery and the underlying shell.
    const silhouette = maskCtx.getImageData(0, 0, mask.width, mask.height);
    const rows = new Uint32Array(silhouette.data.buffer);
    for (let y = 0; y < mask.height; y++) {
      const start = y * mask.width;
      let left = start;
      let right = start + mask.width - 1;
      while (left <= right && rows[left] === 0) left++;
      while (right > left && rows[right] === 0) right--;
      if (left <= right) rows.fill(0xffffffff, left, right + 1);
    }
    maskCtx.putImageData(silhouette, 0, 0);
    alphaMap.needsUpdate = true;
    surface.alphaMap = alphaMap;
    surface.mask = silhouette.data;
  }

  // Paint is sampled on each original panel material so overlapping livery
  // and lower body geometry receive the same brush marks without depth gaps.
  for (const name of ['Object_6', 'Object_7', 'Object_23', 'Object_28']) {
    const panelMesh = car.getObjectByName(name);
    const panelToCar = rig.matrixWorld.clone().invert().multiply(panelMesh.matrixWorld);
    const material = panelMesh.material.clone();
    panelMesh.material = material;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.paintMatrix = { value: panelToCar };
      shader.uniforms.paintRight = { value: surfaces.get(1).texture };
      shader.uniforms.paintLeft = { value: surfaces.get(-1).texture };
      shader.uniforms.maskRight = { value: surfaces.get(1).alphaMap };
      shader.uniforms.maskLeft = { value: surfaces.get(-1).alphaMap };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 paintMatrix;\nvarying vec3 doorPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ndoorPosition = (paintMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 doorPosition;\nuniform sampler2D paintRight, paintLeft, maskRight, maskLeft;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float doorPaintAlpha = 0.0;
          bool rightDoor = doorPosition.x > 0.0;
          vec2 brushUV = vec2((rightDoor ? 1.0 : -1.0) * (doorPosition.z - 0.17) / 1.45 + 0.5, (doorPosition.y - 0.27) / 0.74);
          if (abs(doorPosition.x) > 0.65 && all(greaterThanEqual(brushUV, vec2(0.0))) && all(lessThanEqual(brushUV, vec2(1.0)))) {
            vec4 ink = rightDoor ? texture2D(paintRight, brushUV) : texture2D(paintLeft, brushUV);
            float mask = rightDoor ? texture2D(maskRight, brushUV).g : texture2D(maskLeft, brushUV).g;
            doorPaintAlpha = ink.a * mask;
            diffuseColor.rgb = mix(diffuseColor.rgb, ink.rgb, doorPaintAlpha);
          }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, doorPaintAlpha);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.61, doorPaintAlpha);');
    };
  }
  const ray = new T.Raycaster();
  const pointer = new T.Vector2();
  const sideControl = document.querySelector('#paint-side');
  let side = 1;
  let active = false;
  let stroke;
  let pointerId;
  const current = () => surfaces.get(side);

  function syncControls() {
    undo.disabled = clear.disabled = current().strokes.length === 0;
  }
  function pixel(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    const surface = current();
    for (const hit of ray.intersectObjects(surface.meshes, false)) {
      const x = hit.uv.x * 2048;
      const y = (1 - hit.uv.y) * 1024;
      if (x >= 0 && x < 2048 && y >= 0 && y < 1024 && surface.mask[(Math.floor(y) * 2048 + Math.floor(x)) * 4 + 3] > 100) {
        return [x, y];
      }
    }
  }
  function ink(ctx, path, prev, next) {
    ctx.globalCompositeOperation = path.erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = path.color;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = path.size;
    ctx.beginPath();
    if (prev) {
      ctx.moveTo(...prev);
      ctx.lineTo(...next);
      ctx.stroke();
    } else {
      ctx.arc(next[0], next[1], path.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function refresh(surface) {
    surface.ctx.clearRect(0, 0, 2048, 1024);
    for (const path of surface.strokes) {
      if (path.fill) {
        surface.ctx.globalCompositeOperation = 'source-over';
        surface.ctx.fillStyle = path.color;
        surface.ctx.fillRect(0, 0, 2048, 1024);
        continue;
      }
      let previous;
      for (const next of path.points) {
        if (next) ink(surface.ctx, path, previous, next);
        previous = next;
      }
    }
    surface.texture.needsUpdate = true;
    redraw();
    syncControls();
  }
  function extend(event) {
    const next = pixel(event);
    const previous = stroke.points.at(-1);
    if (!next && !previous) return;
    stroke.points.push(next || null);
    if (next) {
      const surface = current();
      ink(surface.ctx, stroke, previous, next);
      surface.texture.needsUpdate = true;
      redraw();
    }
  }
  toggle.onclick = () => {
    active = !active;
    panel.hidden = !active;
    toggle.setAttribute('aria-pressed', active);
    document.querySelector('.hero').classList.toggle('painting', active);
    selectSide(active ? side : 0);
    status.textContent = active ? 'Draw on the door using a mouse or finger.' : '';
    syncControls();
  };
  sideControl.onchange = () => {
    side = Number(sideControl.value);
    selectSide(side);
    syncControls();
  };
  document.querySelector('#paint-factory').onclick = () => {
    color.value = factoryPaint;
    document.querySelector('#paint-eraser').setAttribute('aria-pressed', false);
    status.textContent = 'Factory copper selected.';
  };
  document.querySelector('#paint-fill').onclick = () => {
    current().strokes.push({ fill: true, color: color.value });
    refresh(current());
    status.textContent = 'Door painted.';
  };
  undo.onclick = () => { current().strokes.pop(); refresh(current()); };
  clear.onclick = () => { current().strokes.length = 0; refresh(current()); };
  document.querySelector('#paint-eraser').onclick = (event) => {
    const pressed = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', pressed);
    status.textContent = pressed ? 'Eraser selected.' : 'Brush selected.';
  };
  toggle.hidden = false;
  return {
    active: () => active,
    start(event) {
      if (pointerId !== undefined) return;
      const first = pixel(event);
      if (!first) return;
      pointerId = event.pointerId;
      canvas.setPointerCapture(pointerId);
      stroke = {
        color: color.value, size: Number(size.value) * 4,
        erase: document.querySelector('#paint-eraser').getAttribute('aria-pressed') === 'true',
        points: [first],
      };
      const surface = current();
      surface.strokes.push(stroke);
      ink(surface.ctx, stroke, null, first);
      surface.texture.needsUpdate = true;
      redraw();
      syncControls();
    },
    move(event) {
      if (pointerId !== event.pointerId) return;
      for (const sample of event.getCoalescedEvents?.() || []) extend(sample);
      extend(event);
    },
    end(event) {
      if (pointerId === event.pointerId) pointerId = undefined;
    },
  };
}
