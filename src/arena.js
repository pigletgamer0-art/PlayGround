import * as THREE from 'three';
import {
  makeFloorTexture,
  makePanelTexture,
  makeNetTexture,
  makeBannerTexture,
  makeHaloTexture,
} from './textures.js';
import { rand, TAU } from './utils.js';

export const ARENA = {
  width: 64,
  length: 92,
  wallHeight: 15.5,
  glassStart: 5.2,
  goalWidth: 20,
  goalHeight: 9,
  goalDepth: 9,
  ceiling: 19,
};

const YOU = 0x3ee9ff;
const BOT = 0xff6b3d;

function makeBox(width, height, depth, material, x, y, z, { cast = false, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export class Arena {
  constructor(scene, glowTexture, { lowPower = false } = {}) {
    this.scene = scene;
    this.lowPower = lowPower;
    this.group = new THREE.Group();
    this.group.name = 'arena';
    scene.add(this.group);
    this.time = 0;
    this.pads = [];
    this.lights = [];
    this.glowTexture = glowTexture;
    this.haloTexture = makeHaloTexture();
    this.goalHalos = [];
    this.padGlowMaterial = null;
    this.banners = [];

    this.buildMaterials();
    this.buildFloor();
    this.buildWalls();
    this.buildGoals();
    this.buildStands();
    this.buildCeiling();
    this.buildLights();
    this.buildPads();
  }

  buildMaterials() {
    this.floorMaterial = new THREE.MeshStandardMaterial({
      map: makeFloorTexture(ARENA.width, ARENA.length),
      roughness: 0.62,
      metalness: 0.14,
      envMapIntensity: 0.28,
    });
    this.wallMaterial = new THREE.MeshStandardMaterial({
      map: makePanelTexture(),
      color: 0x829aad,
      roughness: 0.5,
      metalness: 0.6,
      envMapIntensity: 0.45,
    });
    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x182636,
      roughness: 0.3,
      metalness: 0.92,
      envMapIntensity: 0.9,
    });
    this.darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x060c15,
      roughness: 0.6,
      metalness: 0.45,
    });
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8fdcff,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.075,
      side: THREE.DoubleSide,
      depthWrite: false,
      envMapIntensity: 1.3,
    });
    this.netTexture = makeNetTexture();
    this.netMaterial = new THREE.MeshBasicMaterial({
      map: this.netTexture,
      color: 0xc8ecff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.crowdMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.82,
      metalness: 0.05,
    });
    this.lightBankMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xdaf5ff,
      emissiveIntensity: 2.4,
      toneMapped: true,
    });
    this.youEmissive = new THREE.MeshStandardMaterial({
      color: 0x08303a,
      emissive: YOU,
      emissiveIntensity: 2.6,
      roughness: 0.35,
      metalness: 0.4,
    });
    this.botEmissive = new THREE.MeshStandardMaterial({
      color: 0x2a120a,
      emissive: BOT,
      emissiveIntensity: 2.6,
      roughness: 0.35,
      metalness: 0.4,
    });
    this.padMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc35e,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.width, ARENA.length),
      this.floorMaterial
    );
    floor.rotation.x = -Math.PI / 2;
    floor.name = 'arena-floor';
    floor.receiveShadow = true;
    this.group.add(floor);

    // Glow strips around the pitch perimeter.
    const edgeYou = new THREE.Mesh(new THREE.BoxGeometry(ARENA.width - 0.8, 0.1, 0.35), this.youEmissive);
    edgeYou.position.set(0, 0.055, ARENA.length / 2 - 1.4);
    this.group.add(edgeYou);
    const edgeBot = new THREE.Mesh(new THREE.BoxGeometry(ARENA.width - 0.8, 0.1, 0.35), this.botEmissive);
    edgeBot.position.set(0, 0.055, -ARENA.length / 2 + 1.4);
    this.group.add(edgeBot);

    const underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.width + 26, ARENA.length + 24),
      new THREE.MeshBasicMaterial({ color: 0x061220 })
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = -0.08;
    this.group.add(underglow);
  }

  buildWalls() {
    const { width, length, wallHeight, glassStart, goalWidth, goalHeight } = ARENA;
    const glassHeight = wallHeight - glassStart;

    for (const side of [-1, 1]) {
      const x = side * (width / 2 + 0.3);
      const base = makeBox(0.6, glassStart, length, this.wallMaterial, x, glassStart / 2, 0);
      this.group.add(base);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(length, glassHeight), this.glassMaterial);
      glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      glass.position.set(x, glassStart + glassHeight / 2, 0);
      glass.renderOrder = 2;
      this.group.add(glass);

      const mullionCount = 12;
      for (let i = 0; i <= mullionCount; i += 1) {
        const z = -length / 2 + (length / mullionCount) * i;
        const mullion = makeBox(0.16, glassHeight, 0.16, this.frameMaterial, x, glassStart + glassHeight / 2, z);
        this.group.add(mullion);
      }

      // Rail lighting: cyan on the player's half, orange on NOVA's half.
      for (const [color, z, half] of [
        [this.youEmissive, length / 4, length / 2],
        [this.botEmissive, -length / 4, length / 2],
      ]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, half - 1), color);
        rail.position.set(x - side * 0.32, glassStart + 0.08, z);
        this.group.add(rail);
      }

      const topRail = makeBox(0.7, 0.34, length, this.frameMaterial, x, wallHeight + 0.1, 0);
      this.group.add(topRail);
      const topGlow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, length - 2), this.lightBankMaterial);
      topGlow.position.set(x - side * 0.36, wallHeight + 0.12, 0);
      this.group.add(topGlow);
    }

    // End walls with the goal openings left open.
    for (const end of [-1, 1]) {
      const z = end * (length / 2 + 0.3);
      const segWidth = (width - goalWidth) / 2;
      const cyanSide = end > 0;
      for (const side of [-1, 1]) {
        const x = side * (goalWidth / 2 + segWidth / 2);
        const wall = makeBox(segWidth, wallHeight, 0.6, this.wallMaterial, x, wallHeight / 2, z);
        this.group.add(wall);
        const vertical = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, wallHeight - 1.6, 0.12),
          cyanSide ? this.youEmissive : this.botEmissive
        );
        vertical.position.set(side * (goalWidth / 2 + 0.45), wallHeight / 2, z - end * 0.34);
        this.group.add(vertical);
      }

      const lintelHeight = wallHeight - goalHeight;
      const lintel = makeBox(goalWidth, lintelHeight, 0.7, this.wallMaterial, 0, goalHeight + lintelHeight / 2, z);
      this.group.add(lintel);

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(goalWidth, 0.16, 0.16),
        cyanSide ? this.youEmissive : this.botEmissive
      );
      trim.position.set(0, goalHeight + 0.1, z - end * 0.4);
      this.group.add(trim);

      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(29, 4.4),
        new THREE.MeshBasicMaterial({
          map: makeBannerTexture(cyanSide ? '#3ee9ff' : '#ff6b3d'),
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
      );
      banner.position.set(0, goalHeight + lintelHeight / 2 + 0.2, z - end * 0.37);
      banner.rotation.y = end > 0 ? Math.PI : 0;
      banner.renderOrder = 3;
      banner.name = 'arena-banner';
      this.banners.push(banner);
      this.group.add(banner);
    }
  }

  buildGoals() {
    const { length, goalWidth, goalHeight, goalDepth, width } = ARENA;
    for (const end of [-1, 1]) {
      const teamColor = end > 0 ? YOU : BOT;
      const emissive = end > 0 ? this.youEmissive : this.botEmissive;
      const goalZ = end * (length / 2);
      const backZ = end * (length / 2 + goalDepth);
      const midZ = (goalZ + backZ) / 2;

      const floor = makeBox(goalWidth, 0.08, goalDepth, this.darkMaterial, 0, 0.04, midZ);
      this.group.add(floor);

      const sideMat = this.frameMaterial;
      for (const side of [-1, 1]) {
        const wall = makeBox(0.3, goalHeight, goalDepth, sideMat, side * (goalWidth / 2 + 0.15), goalHeight / 2, midZ);
        this.group.add(wall);

        const sideNet = new THREE.Mesh(
          new THREE.PlaneGeometry(goalDepth - 0.4, goalHeight - 0.5),
          this.netMaterial
        );
        sideNet.rotation.y = side * Math.PI / 2;
        sideNet.position.set(side * (goalWidth / 2 - 0.05), goalHeight / 2, midZ);
        this.group.add(sideNet);
      }

      this.group.add(makeBox(goalWidth + 0.6, goalHeight + 0.2, 0.35, sideMat, 0, goalHeight / 2, backZ));
      this.group.add(makeBox(goalWidth + 0.6, 0.24, goalDepth + 0.4, sideMat, 0, goalHeight + 0.06, midZ));

      const backNet = new THREE.Mesh(
        new THREE.PlaneGeometry(goalWidth - 0.45, goalHeight - 0.45),
        this.netMaterial
      );
      backNet.position.set(0, goalHeight / 2, backZ - end * 0.2);
      backNet.rotation.y = end > 0 ? Math.PI : 0;
      this.group.add(backNet);

      const topNet = new THREE.Mesh(new THREE.PlaneGeometry(goalWidth - 0.45, goalDepth - 0.4), this.netMaterial);
      topNet.rotation.x = Math.PI / 2;
      topNet.position.set(0, goalHeight - 0.08, midZ);
      this.group.add(topNet);

      // Glowing frame posts and crossbar.
      const postGeo = new THREE.CylinderGeometry(0.23, 0.23, goalHeight, 12);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, emissive);
        post.position.set(side * (goalWidth / 2), goalHeight / 2, goalZ);
        this.group.add(post);
        const backPost = new THREE.Mesh(postGeo, this.frameMaterial);
        backPost.position.set(side * (goalWidth / 2), goalHeight / 2, backZ);
        this.group.add(backPost);
      }
      const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, goalWidth, 12), emissive);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set(0, goalHeight, goalZ);
      this.group.add(crossbar);

      const goalLine = new THREE.Mesh(new THREE.BoxGeometry(goalWidth, 0.06, 0.5), emissive);
      goalLine.position.set(0, 0.06, goalZ);
      this.group.add(goalLine);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.haloTexture,
        color: teamColor,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }));
      halo.scale.set(goalWidth * 1.2, goalHeight * 1.5, 1);
      halo.name = 'goal-halo';
      halo.position.set(0, goalHeight * 0.48, backZ - end * 0.8);
      this.group.add(halo);
      this.goalHalos.push(halo);

      const light = new THREE.PointLight(teamColor, 55, 28, 2);
      light.name = 'goal-light';
      light.position.set(0, goalHeight * 0.55, end * (length / 2 + 3.5));
      this.group.add(light);
      this.lights.push(light);

      // Pit lane strips leading into the goal mouth.
      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 6), emissive);
        strip.position.set(side * 11.9, 0.05, end * (length / 2 - 3));
        this.group.add(strip);
      }
    }
  }

  buildStands() {
    const { width, length } = ARENA;
    const standMat = new THREE.MeshStandardMaterial({ color: 0x080f1a, roughness: 0.82, metalness: 0.3 });
    const stepGlow = new THREE.MeshStandardMaterial({
      color: 0x0a121e,
      emissive: 0x3f8fae,
      emissiveIntensity: 0.65,
      roughness: 0.6,
    });

    const spectatorPositions = [];
    const spectatorColors = [];

    for (const side of [-1, 1]) {
      for (let row = 0; row < 4; row += 1) {
        const x = side * (width / 2 + 4.6 + row * 2.7);
        const y = 6.4 + row * 1.7;
        const stand = makeBox(2.8, 1.3, length + 4, standMat, x, y - 0.75, 0, { receive: false });
        this.group.add(stand);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, length + 4), stepGlow);
        lip.position.set(x - side * 1.45, y - 0.1, 0);
        this.group.add(lip);

        const count = 92;
        for (let i = 0; i < count; i += 1) {
          if (Math.random() < 0.16) continue;
          spectatorPositions.push(
            x + rand(-0.8, 0.8) + side * 0.2,
            y + 0.5,
            -length / 2 + rand(0, length)
          );
          const roll = Math.random();
          const color = roll < 0.2 ? 0x3ee9ff : roll < 0.38 ? 0xff6b3d : roll < 0.6 ? 0xd8e8f2 : 0x1b2b3d;
          const c = new THREE.Color(color);
          c.multiplyScalar(rand(0.55, 1));
          spectatorColors.push(c.r, c.g, c.b);
        }
      }
    }

    const count = spectatorPositions.length / 3;
    const geometry = new THREE.BoxGeometry(0.42, 0.72, 0.42);
    const crowd = new THREE.InstancedMesh(geometry, this.crowdMaterial, count);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      matrix.makeTranslation(
        spectatorPositions[i * 3],
        spectatorPositions[i * 3 + 1],
        spectatorPositions[i * 3 + 2]
      );
      matrix.multiply(new THREE.Matrix4().makeScale(1, rand(0.85, 1.15), 1));
      crowd.setMatrixAt(i, matrix);
      color.setRGB(spectatorColors[i * 3], spectatorColors[i * 3 + 1], spectatorColors[i * 3 + 2]);
      crowd.setColorAt(i, color);
    }
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    this.group.add(crowd);

    // Back-of-house glow walls behind the stands.
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(length + 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x03070e,
        emissive: 0x0a1626,
        emissiveIntensity: 0.6,
        roughness: 0.9,
      })
    );
    backdrop.rotation.y = Math.PI / 2;
    backdrop.position.set(-(width / 2 + 17), 13, 0);
    this.group.add(backdrop);
    const backdrop2 = backdrop.clone();
    backdrop2.rotation.y = -Math.PI / 2;
    backdrop2.position.x = width / 2 + 17;
    this.group.add(backdrop2);
  }

  buildCeiling() {
    const { width, length, ceiling } = ARENA;
    const ceilingPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 44, length + 34),
      new THREE.MeshStandardMaterial({ color: 0x02050b, roughness: 0.95, metalness: 0.1 })
    );
    ceilingPlane.rotation.x = Math.PI / 2;
    ceilingPlane.position.y = ceiling + 2;
    this.group.add(ceilingPlane);

    const trussMat = this.frameMaterial;
    for (let z = -length / 2; z <= length / 2; z += 15) {
      this.group.add(makeBox(width + 14, 0.5, 0.5, trussMat, 0, ceiling - 0.8, z, { receive: false }));
    }
    for (const x of [-width / 2 - 2, width / 2 + 2]) {
      this.group.add(makeBox(0.5, 0.5, length + 6, trussMat, x, ceiling - 0.8, 0, { receive: false }));
    }
    for (const x of [-12, 12]) {
      for (const z of [-26, 0, 26]) {
        const bank = makeBox(9.5, 0.3, 1.6, this.lightBankMaterial, x, ceiling - 1.4, z, { receive: false });
        bank.name = 'light-bank';
        this.group.add(bank);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: 0xdff8ff,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }));
        glow.scale.set(11, 3.4, 1);
        glow.position.set(x, ceiling - 1.7, z);
        this.group.add(glow);

        if (this.lowPower && z !== 0) continue;
        const light = new THREE.PointLight(0xd9f4ff, 38, 40, 2);
        light.name = 'ceiling-light';
        light.position.set(x, ceiling - 2.2, z);
        this.group.add(light);
        this.lights.push(light);
      }
    }
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x78d8ff, 0x080b12, 0.28);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xe6f8ff, 2.4);
    key.name = 'key-light';
    key.position.set(18, 38, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -58;
    key.shadow.camera.right = 58;
    key.shadow.camera.top = 62;
    key.shadow.camera.bottom = -62;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 120;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    this.scene.add(key);
    this.keyLight = key;

    const fill = new THREE.DirectionalLight(0x2e6dff, 0.32);
    fill.name = 'fill-light';
    fill.position.set(-26, 20, -24);
    this.scene.add(fill);

    const warm = new THREE.DirectionalLight(0xff8c55, 0.22);
    warm.name = 'warm-light';
    warm.position.set(20, 12, -30);
    this.scene.add(warm);
  }

  buildPads() {
    const big = [
      [-(ARENA.width / 2 - 7), -(ARENA.length / 4)],
      [ARENA.width / 2 - 7, -(ARENA.length / 4)],
      [-(ARENA.width / 2 - 7), ARENA.length / 4],
      [ARENA.width / 2 - 7, ARENA.length / 4],
    ];
    const small = [
      [-20, -34], [0, -36], [20, -34],
      [-24, -14], [24, -14],
      [-24, 14], [24, 14],
      [-20, 34], [0, 36], [20, 34],
      [0, -14], [0, 14],
    ];

    for (const [x, z] of big) this.addPad(x, z, true);
    for (const [x, z] of small) this.addPad(x, z, false);
  }

  addPad(x, z, big) {
    const amount = big ? 100 : 12;
    const radius = big ? 2.5 : 1.55;
    const group = new THREE.Group();
    group.name = 'boost-pad';
    group.position.set(x, 0.06, z);

    const color = big ? 0xffcf6b : 0xff9d4d;
    const discMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: big ? 0.14 : 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), discMat);
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);

    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.72, radius * 0.86, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);

    const inner = new THREE.Mesh(new THREE.RingGeometry(radius * 0.26, radius * 0.36, 6), ringMat.clone());
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.012;
    group.add(inner);

    this.group.add(group);
    this.pads.push({
      x, z, radius, amount, big, group, ring, inner, disc,
      active: true,
      respawn: big ? 7 : 4,
      timer: 0,
      phase: Math.random() * TAU,
    });
  }

  setBannersVisible(visible) {
    for (const banner of this.banners) banner.visible = visible;
  }

  checkPickups(car, onPickup) {
    if (!car) return;
    for (const pad of this.pads) {
      if (!pad.active) continue;
      const dx = car.pos.x - pad.x;
      const dz = car.pos.z - pad.z;
      if (dx * dx + dz * dz > (pad.radius + 1.2) * (pad.radius + 1.2)) continue;
      if (car.pos.y > 3.2) continue;
      pad.active = false;
      pad.timer = pad.respawn;
      pad.group.visible = false;
      onPickup?.(pad);
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const pad of this.pads) {
      if (!pad.active) {
        pad.timer -= dt;
        if (pad.timer <= 0) {
          pad.active = true;
          pad.group.visible = true;
          pad.group.scale.setScalar(0.2);
        }
        continue;
      }
      const pulse = 1 + Math.sin(t * 2.6 + pad.phase) * 0.05;
      pad.group.scale.setScalar(pulse);
      pad.ring.rotation.z += dt * (pad.big ? 0.9 : -1.3);
      pad.inner.rotation.z -= dt * 1.6;
      pad.disc.material.opacity = (pad.big ? 0.14 : 0.1) + Math.sin(t * 3 + pad.phase) * 0.03;
    }
    for (const [index, halo] of this.goalHalos.entries()) {
      halo.material.opacity = 0.2 + Math.sin(t * 1.7 + index * 1.6) * 0.05;
    }
    if (this.keyLight) {
      this.keyLight.position.z = 16 + Math.sin(t * 0.13) * 1.5;
    }
  }
}
