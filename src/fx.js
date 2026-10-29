// Confetti / debris burst using a single InstancedMesh.
import * as THREE from 'three';

const MAX = 160;
export class Burst {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.parts = Array.from({ length: MAX }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0, vr: 0, s: 1 }));
    this.dummy = new THREE.Object3D();
    this.next = 0;
    this.hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.hide);
    scene.add(this.mesh);
  }

  emit(origin, count, colors, { speed = 5, up = 4, spread = 1, gravity = 11, size = 1 } = {}) {
    const c = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      const q = this.parts[i];
      q.life = 0.9 + Math.random() * 0.7;
      q.p.copy(origin);
      q.v.set((Math.random() - 0.5) * speed * spread, up * (0.4 + Math.random()), (Math.random() - 0.3) * speed * spread);
      q.r = Math.random() * 6; q.vr = (Math.random() - 0.5) * 14; q.s = (0.6 + Math.random() * 0.9) * size; q.g = gravity;
      c.set(colors[(Math.random() * colors.length) | 0]);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, dz = 0) {
    const d = this.dummy;
    for (let i = 0; i < MAX; i++) {
      const q = this.parts[i];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { this.mesh.setMatrixAt(i, this.hide); continue; }
      q.v.y -= q.g * dt; q.p.addScaledVector(q.v, dt); q.p.z += dz; q.r += q.vr * dt;
      d.position.copy(q.p); d.rotation.set(q.r, q.r * 0.7, q.r * 1.3); d.scale.setScalar(q.s * Math.min(1, q.life * 2.5));
      d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
