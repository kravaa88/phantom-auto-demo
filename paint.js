import * as T from 'three';

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
  for (const [name, sign, faces] of groups) {
    const source = car.getObjectByName(name);
    const surface = surfaces.get(sign);
    const geometry = new T.BufferGeometry();
    const positions = source.geometry.attributes.position;
    const index = source.geometry.index;
    const coordinates = [];
    const uv = [];
    const point = new T.Vector3();
    for (const face of faces) {
      for (let corner = 0; corner < 3; corner++) {
        point.fromBufferAttribute(positions, index.getX(face * 3 + corner));
        coordinates.push(point.x, point.y, point.z);
        source.localToWorld(point);
        rig.worldToLocal(point);
        uv.push(sign * (point.z - 0.17) / 1.45 + 0.5, (point.y - 0.27) / 0.74);
      }
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(coordinates, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    const layer = new T.Mesh(geometry, new T.MeshBasicMaterial({
      map: surface.texture, transparent: true, depthWrite: false, alphaTest: 0.02,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    source.add(layer);
    surface.meshes.push(layer);
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
    const hit = ray.intersectObjects(current().meshes, false)[0];
    return hit && [hit.uv.x * 2048, (1 - hit.uv.y) * 1024];
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
