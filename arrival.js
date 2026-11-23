import * as T from 'three';

const roomAngle = Math.atan2(0.73, 0.68);
export const gateX = 3.1;
const stopApproach = 2.4;
const toWorld = (x, z) => new T.Vector3(x, 0, z).applyAxisAngle(T.Object3D.DEFAULT_UP, roomAngle);
const route = new T.CubicBezierCurve3(
  toWorld(gateX + 0.76, -17),
  toWorld(gateX + 1.1, -10.7),
  toWorld(stopApproach, -stopApproach / Math.tan(roomAngle)),
  toWorld(0, 0),
);
route.arcLengthDivisions = 300;
const totalDistance = route.getLength();

export function arrivalDistance(time) {
  const accelerate = 0.25;
  const brake = 0.59;
  const brakeTime = 1 - brake;
  const total = accelerate / 2 + brake - accelerate + brakeTime / 2;
  if (time <= accelerate) {
    return (time - accelerate / Math.PI * Math.sin(Math.PI * time / accelerate)) / (2 * total);
  }
  if (time < brake) return (time - accelerate / 2) / total;
  const t = time - brake;
  return Math.min(1, (brake - accelerate / 2 + (t + brakeTime / Math.PI * Math.sin(Math.PI * t / brakeTime)) / 2) / total);
}
export function mountArrival(car, rig) {
  rig.updateMatrixWorld(true);
  const wheelMeshes = [car.getObjectByName('Object_33'), car.getObjectByName('Object_34')];
  const groups = Array.from({ length: 4 }, () => ({
    bounds: new T.Box3(), pivot: new T.Group(), meshes: [],
  }));
  const point = new T.Vector3();
  for (const source of wheelMeshes) {
    const byWheel = groups.map(() => []);
    const { index, attributes } = source.geometry;
    for (let offset = 0; offset < index.count; offset += 3) {
      point.fromBufferAttribute(attributes.position, index.getX(offset));
      rig.worldToLocal(source.localToWorld(point));
      const wheel = (point.x < 0 ? 2 : 0) + (point.z < 0 ? 1 : 0);
      for (let corner = 0; corner < 3; corner++) {
        const vertex = index.getX(offset + corner);
        byWheel[wheel].push(vertex);
        point.fromBufferAttribute(attributes.position, vertex);
        groups[wheel].bounds.expandByPoint(rig.worldToLocal(source.localToWorld(point)));
      }
    }
    byWheel.forEach((vertices, wheel) => {
      const geometry = new T.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) geometry.setAttribute(name, attribute);
      geometry.setIndex(vertices);
      const rim = new T.Mesh(geometry, source.material);
      source.add(rim);
      const { pivot, meshes } = groups[wheel];
      meshes.push(rim);
      if (!pivot.parent) rig.add(pivot);
      pivot.attach(rim);
    });
    source.visible = false;
  }
  for (const wheel of groups) {
    const center = wheel.bounds.getCenter(new T.Vector3());
    // Preserve the mesh world transforms when moving the pivot to the axle.
    for (const mesh of wheel.meshes) rig.attach(mesh);
    wheel.pivot.position.copy(center);
    for (const mesh of wheel.meshes) wheel.pivot.attach(mesh);
    wheel.radius = (wheel.bounds.max.y - wheel.bounds.min.y) / 2;
  }
  const direction = new T.Vector3();
  return (progress) => {
    route.getPointAt(progress, rig.position);
    route.getTangentAt(progress, direction);
    for (const { pivot, radius } of groups) pivot.rotation.x = totalDistance * (progress - 1) / radius;
    return Math.atan2(direction.x, direction.z);
  };
}
