import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { glideAltitude } from "../../shared/approach";

export const NM_TO_WORLD = 110;
export const FT_TO_WORLD = NM_TO_WORLD / 6076.12;
const TILE_SPAN = 1420;
const mercatorY = (latitude: number) =>
  Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
// Match the square Web Mercator exports, including their aspect adjustment.
const regionalSouth = mercatorY(40.06);
const regionalNorth = mercatorY(40.275);
const regionalSpan = Math.max(
  (0.28 * Math.PI) / 180,
  regionalNorth - regionalSouth,
);
const detailSouth = mercatorY(40.094);
const detailNorth = mercatorY(40.137);
const detailSpan = Math.max((0.056 * Math.PI) / 180, detailNorth - detailSouth);
const AIRPORT_U = 0.5 + (0.05 * Math.PI) / 180 / regionalSpan;
const AIRPORT_V =
  0.5 +
  (detailSouth + detailNorth - regionalSouth - regionalNorth) /
    2 /
    regionalSpan;

/** Stable, local scenery. It never participates in the authoritative simulation. */
export function createScenery(scene: Scene) {
  const root = new TransformNode("approach-environment", scene);
  let seed = 404;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const material = (name: string, color: string, emission = 0) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.emissiveColor = m.diffuseColor.scale(emission);
    m.specularColor = new Color3(0.025, 0.025, 0.025);
    return m;
  };
  const canvasTexture = (
    name: string,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D) => void,
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d")!);
    const texture = new DynamicTexture(
      name,
      canvas,
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.anisotropicFilteringLevel = 8;
    texture.update();
    return texture;
  };
  const grain = (
    c: CanvasRenderingContext2D,
    w: number,
    h: number,
    count: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const value = random() > 0.5 ? 255 : 0;
      c.fillStyle = `rgba(${value},${value},${value},${0.025 + random() * 0.09})`;
      c.fillRect(
        random() * w,
        random() * h,
        1 + random() * 2,
        1 + random() * 2,
      );
    }
  };
  const grassTexture = canvasTexture("mown-grass", 512, 512, (c) => {
    c.fillStyle = "#78816a";
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? "#6f795f" : "#7d876e";
      c.fillRect(i * 32, 0, 32, 512);
    }
    grain(c, 512, 512, 24000);
  });
  const grass = material("airport-grass", "#ffffff");
  grass.diffuseTexture = grassTexture;
  grassTexture.uScale = 5;
  grassTexture.vScale = 7;
  grassTexture.wrapU = grassTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  const soil = material("dry-grass", "#a2a084");
  const asphalt = material("taxiway-asphalt", "#6d7171");
  const asphaltTexture = canvasTexture("asphalt-grain", 256, 256, (c) => {
    c.fillStyle = "#858886";
    c.fillRect(0, 0, 256, 256);
    grain(c, 256, 256, 18000);
    c.strokeStyle = "#747773";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(14, 0);
    c.lineTo(31, 87);
    c.lineTo(17, 141);
    c.lineTo(43, 256);
    c.stroke();
  });
  asphaltTexture.uScale = 5;
  asphaltTexture.vScale = 8;
  asphaltTexture.wrapU = asphaltTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  asphalt.diffuseTexture = asphaltTexture;
  const concrete = material("apron-concrete", "#b2b4a9");
  const apronTexture = canvasTexture("concrete-slabs", 512, 512, (c) => {
    c.fillStyle = "#c1c1b1";
    c.fillRect(0, 0, 512, 512);
    grain(c, 512, 512, 14000);
    c.strokeStyle = "#91968d";
    c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      c.beginPath();
      c.moveTo(i * 64, 0);
      c.lineTo(i * 64, 512);
      c.moveTo(0, i * 64);
      c.lineTo(512, i * 64);
      c.stroke();
    }
    for (let i = 0; i < 20; i++) {
      c.fillStyle = "#776f5d16";
      c.beginPath();
      c.ellipse(
        random() * 512,
        random() * 512,
        15 + random() * 25,
        10,
        random() * 3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  });
  concrete.diffuseTexture = apronTexture;
  apronTexture.uScale = 2;
  apronTexture.vScale = 3;
  apronTexture.wrapU = apronTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  const yellow = material("taxiway-yellow", "#ead47c", 0.2);
  const white = material("paint-white", "#f4f1df", 0.2);
  const wall = material("terminal-walls", "#b5b4a5");
  const roof = material("blue-gray-roofs", "#606d78");
  const glass = material("terminal-glass", "#447080", 0.16);
  glass.specularColor = new Color3(0.35, 0.4, 0.45);
  glass.specularPower = 70;
  const dark = material("building-shadow", "#343f3f");
  const bark = material("tree-trunks", "#625f46");
  const leaves = ["#556c44", "#63784b", "#6c7952"].map((c, i) =>
    material(`foliage-${i}`, c),
  );
  const whiteLight = material("runway-white-lights", "#fff2ca", 2);
  const blueLight = material("taxiway-blue-lights", "#65a5ff", 2);
  const greenLight = material("threshold-green-lights", "#74f09a", 2);
  const redLight = material("papi-red-lights", "#ff664c", 2);
  for (const lamp of [whiteLight, blueLight, greenLight, redLight]) {
    lamp.disableLighting = true;
    lamp.emissiveColor = lamp.diffuseColor.clone();
    lamp.diffuseColor = Color3.Black();
  }

  // Batch static airport and vegetation geometry by material to keep draw calls low.
  const batches = new Map<StandardMaterial, Mesh[]>();
  const add = (mesh: Mesh, m: StandardMaterial) => {
    mesh.material = m;
    mesh.isPickable = false;
    const group = batches.get(m) ?? [];
    group.push(mesh);
    batches.set(m, group);
    return mesh;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: StandardMaterial,
    rotation = 0,
  ) => {
    const mesh = CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    return add(mesh, m);
  };
  const strip = (
    name: string,
    x: number,
    z: number,
    w: number,
    d: number,
    m: StandardMaterial,
    y = 0.025,
    rotation = 0,
  ) => {
    const mesh = CreateGround(name, { width: w, height: d }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    return add(mesh, m);
  };
  const light = (x: number, z: number, m: StandardMaterial, size = 0.16) => {
    const mesh = CreateSphere(
      "airfield-light",
      { diameter: size, segments: 4 },
      scene,
    );
    mesh.position.set(x, 0.16, z);
    return add(mesh, m);
  };

  const terrainHeight = (x: number, z: number) => {
    // Keep the playable corridor level; hills and foothills are scenic, not obstacles.
    const west = Math.max(0, Math.abs(x) - 390);
    const behind = Math.max(0, z - 420);
    const ridge =
      Math.min(1, west / 650) * 105 + Math.min(1, behind / 1100) * 75;
    const waves =
      0.58 +
      0.23 * Math.sin(x * 0.009 + Math.sin(z * 0.008) * 2) +
      0.14 * Math.sin(z * 0.018 - x * 0.016) +
      0.06 * Math.sin(x * 0.039 + z * 0.025);
    return Math.max(0, ridge * waves);
  };
  const terrain = (
    name: string,
    size: number,
    segments: number,
    m: StandardMaterial,
    detail = false,
  ) => {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      normals: number[] = [];
    for (let row = 0; row <= segments; row++)
      for (let col = 0; col <= segments; col++) {
        const x = (col / segments - 0.5) * size,
          z = (row / segments - 0.5) * size;
        positions.push(x, terrainHeight(x, z) + (detail ? 0.008 : 0), z);
        uvs.push(
          detail ? col / segments : x / TILE_SPAN + AIRPORT_U,
          detail ? row / segments : z / TILE_SPAN + AIRPORT_V,
        );
        if (row < segments && col < segments) {
          const a = row * (segments + 1) + col,
            b = a + 1,
            c = a + segments + 1;
          indices.push(a, b, c, b, c + 1, c);
        }
      }
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    Object.assign(data, { positions, indices, normals, uvs });
    const mesh = new Mesh(name, scene);
    data.applyToMesh(mesh);
    mesh.material = m;
    mesh.parent = root;
    mesh.isPickable = false;
    return mesh;
  };
  const ground = material("orthophoto-landscape", "#dddcd0");
  ground.specularColor = Color3.Black();
  ground.ambientColor = new Color3(0.12, 0.12, 0.12);
  // Show terrain immediately, including on a slow first visit through a tunnel.
  ground.diffuseTexture = grassTexture;
  const ortho = new Texture(
    "/scenery/colorado-ortho.jpg",
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
    undefined,
    () => {
      // Render local procedural grass if a texture request fails; gameplay stays available.
      ground.diffuseTexture = grassTexture;
    },
  );
  ortho.anisotropicFilteringLevel = 8;
  ortho.onLoadObservable.addOnce(() => {
    ground.diffuseTexture = ortho;
  });
  if (ortho.isReady()) ground.diffuseTexture = ortho;
  terrain("regional-orthophoto-terrain", 5600, 176, ground);
  const closeGround = material("airport-detail-ortho", "#dddcd0");
  const detail = new Texture(
    "/scenery/airport-ortho.jpg",
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  detail.anisotropicFilteringLevel = 8;
  closeGround.diffuseTexture = detail;
  const feather = canvasTexture("ortho-edge-blend", 128, 128, (c) => {
    const data = c.createImageData(128, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4,
          v = Math.min(1, Math.min(x, y, 127 - x, 127 - y) / 8) * 255;
        data.data[i] = v;
        data.data[i + 1] = v;
        data.data[i + 2] = v;
        data.data[i + 3] = 255;
      }
    c.putImageData(data, 0, 0);
  });
  closeGround.opacityTexture = feather;
  feather.getAlphaFromRGB = true;
  const detailTerrain = terrain(
    "airport-orthophoto-detail",
    (TILE_SPAN * detailSpan) / regionalSpan,
    24,
    closeGround,
    true,
  );
  detail.onLoadObservable.addOnce(() => detailTerrain.setEnabled(true));
  detailTerrain.setEnabled(detail.isReady());

  // Airport platform follows the same world transform as the orthophoto ground.
  strip("mown-airport-platform", 39, 68, 126, 180, grass, 0.04);
  strip("runway-shoulders", 0, 65, 14, 138, soil, 0.05);
  strip("parallel-taxiway", 22, 67, 3.2, 137, asphalt, 0.065);
  strip("terminal-apron", 53, 67, 52, 68, concrete, 0.075);
  for (const z of [8, 38, 83, 122]) {
    strip("taxiway-link", 11, z, 22, 3.2, asphalt, 0.075);
    strip("taxiway-center", 11, z, 0.12, 22, yellow, 0.095, Math.PI / 2);
    strip("hold-short", 8, z, 2.2, 0.09, yellow, 0.1);
    strip("hold-short", 8.3, z, 2.2, 0.09, yellow, 0.1);
  }
  strip("taxiway-centerline", 22, 67, 0.1, 134, yellow, 0.09);
  for (let z = 0; z <= 132; z += 6) {
    light(-5.8, z, whiteLight);
    light(5.8, z, whiteLight);
    light(24, z, blueLight, 0.12);
  }
  for (let x = -5; x <= 5; x += 1) {
    light(x, 0, greenLight, 0.2);
    light(x, 130, redLight, 0.17);
  }
  for (let z = -50; z < 0; z += 5) {
    light(0, z, whiteLight, 0.22);
    if (z % 15 === -5)
      for (let x = -3; x <= 3; x += 1.5) light(x, z, whiteLight, 0.18);
  }

  const runwayTexture = canvasTexture("runway-27-surface", 512, 2048, (c) => {
    c.fillStyle = "#565b5b";
    c.fillRect(0, 0, 512, 2048);
    grain(c, 512, 2048, 95000);
    c.strokeStyle = "#3e4648";
    c.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      c.beginPath();
      c.moveTo(0, i * 120);
      c.lineTo(512, i * 120 + 8);
      c.stroke();
    }
    c.fillStyle = "#e2e5dd";
    c.fillRect(24, 0, 5, 2048);
    c.fillRect(483, 0, 5, 2048);
    for (let y = 525; y < 1530; y += 100) c.fillRect(250, y, 12, 42);
    for (const end of [0, 1]) {
      c.save();
      if (end) {
        c.translate(512, 2048);
        c.rotate(Math.PI);
      }
      c.fillRect(28, 17, 456, 8);
      for (let i = 0; i < 6; i++) {
        c.fillRect(50 + i * 31, 42, 17, 110);
        c.fillRect(289 + i * 31, 42, 17, 110);
      }
      c.font = "bold 102px Arial";
      c.textAlign = "center";
      // The near-to-far UV direction flips canvas Y. Keep the digits upright
      // from each runway end, and leave centerline paint clear of their area.
      c.save();
      c.translate(256, 220);
      c.scale(1, -1);
      c.fillText(end ? "09" : "27", 0, 0);
      c.restore();
      for (const x of [100, 362]) {
        c.fillRect(x, 382, 50, 95);
        c.fillRect(x, 635, 22, 76);
        c.fillRect(x + 28, 635, 22, 76);
      }
      c.restore();
    }
    // Long rubber deposits down the touchdown zone, not uniformly black pavement.
    for (let i = 0; i < 110; i++) {
      c.strokeStyle = `rgba(16,22,22,${random() * 0.12})`;
      c.lineWidth = 1 + random() * 4;
      const x = 204 + random() * 104,
        y = 350 + random() * 1300;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + random() * 3, y + 30 + random() * 220);
      c.stroke();
    }
  });
  const runwayMaterial = material("runway-asphalt", "#ffffff");
  runwayMaterial.diffuseTexture = runwayTexture;
  // +Z runs from threshold 27 toward the far end; texture's bottom is approach-facing.
  runwayTexture.vScale = -1;
  runwayTexture.vOffset = 1;
  strip("runway-27", 0, 65, 11, 130, runwayMaterial, 0.11);

  // Painted stand guidance and a compact terminal / hangar complex.
  for (let z = 44; z <= 88; z += 11) {
    strip("stand-centerline", 47, z, 0.1, 17, yellow, 0.11, Math.PI / 2);
    strip("stand-stop", 55, z, 3, 0.12, yellow, 0.12);
  }
  box("terminal", 74, 1.15, 67, 13, 2.3, 46, wall);
  box("terminal-roof", 74, 2.45, 67, 14, 0.3, 47, roof);
  box("terminal-windows", 67.42, 1.45, 67, 0.08, 0.8, 44, glass);
  for (let z = 48; z <= 86; z += 9) {
    box("terminal-column", 67.2, 1.2, z, 0.3, 2.4, 0.35, wall);
    box("jet-bridge", 63, 0.8, z, 8, 0.9, 1.1, wall);
  }
  for (let z = 105; z < 140; z += 13) {
    box("hangar", 62, 1.4, z, 16, 2.8, 10, wall);
    box("hangar-roof", 62, 2.9, z, 17, 0.35, 11, roof);
    box("hangar-doors", 53.9, 1.25, z, 0.12, 2.25, 8, dark);
    for (let j = 0; j < 6; j++)
      box("door-rib", 53.8, 1.25, z - 3.5 + j * 1.4, 0.1, 2.3, 0.09, roof);
  }
  box("tower-base", 79, 3.1, 25, 2.1, 6.2, 2.1, wall);
  box("tower-cab", 79, 6.25, 25, 4, 1.45, 3.2, glass, Math.PI / 8);
  box("tower-roof", 79, 7.05, 25, 4.5, 0.2, 3.7, roof, Math.PI / 8);
  box("tower-mast", 79, 8, 25, 0.09, 1.8, 0.09, white);
  // Parking and access road are part of the airfield, independent of photographed roads.
  strip("airport-access-road", 100, 72, 3, 169, asphalt, 0.07);
  strip("terminal-parking", 91, 69, 15, 51, asphalt, 0.08);
  for (let z = 47; z < 93; z += 3) {
    strip("parking-stall", 89, z, 5, 0.08, white, 0.1);
    strip("parking-stall", 95, z, 4, 0.08, white, 0.1);
  }
  for (let i = 0; i < 24; i++)
    box(
      "parked-car",
      i % 2 ? 89 : 95,
      0.2,
      48 + Math.floor(i / 2) * 3.5,
      0.65,
      0.4,
      1.45,
      i % 3 ? roof : white,
    );
  for (let z = 42; z <= 85; z += 14) {
    const fuselage = CreateCylinder(
      "parked-aircraft-body",
      { height: 5.2, diameter: 0.56, tessellation: 8 },
      scene,
    );
    fuselage.rotation.z = Math.PI / 2;
    fuselage.position.set(51, 0.63, z);
    add(fuselage, white);
    box("parked-wing", 51, 0.5, z, 1, 0.14, 5.5, white, -0.12);
    box("parked-tail", 53, 0.55, z, 0.65, 0.1, 2.1, white);
    box("parked-fin", 53, 0.96, z, 0.7, 1.2, 0.09, roof);
    box("ground-vehicle", 56, 0.32, z + 3, 1.5, 0.64, 0.75, white);
  }
  // Perimeter fence and approach-side trees give depth cues close to the ground.
  for (let z = -17; z < 162; z += 5)
    for (const x of [-23, 105])
      box("fence-post", x, 0.45, z, 0.045, 0.9, 0.045, dark);
  for (const x of [-23, 105])
    box("fence-rail", x, 0.6, 72, 0.045, 0.045, 180, roof);
  for (let i = 0; i < 250; i++) {
    const side = i % 2 ? 1 : -1,
      x = side * (35 + random() * 285),
      z = -420 + random() * 800;
    if (x > 0 && x < 115 && z > -30 && z < 175) continue;
    const h = 0.8 + random() * 1.35,
      y = terrainHeight(x, z);
    const crown = CreateSphere(
      "tree-crown",
      { diameter: h * 0.85, segments: 5 },
      scene,
    );
    crown.scaling.y = 1.35;
    crown.position.set(x, y + h * 0.7, z);
    add(crown, leaves[i % 3]);
    box("tree-trunk", x, y + h * 0.28, z, 0.11, h * 0.6, 0.11, bark);
  }
  for (let i = 0; i < 65; i++) {
    const x = -75 - (i % 9) * 5.2,
      z = 185 + Math.floor(i / 9) * 8.5 + (i % 2) * 2,
      h = 0.7 + random() * 1.1;
    box("nearby-house", x, h / 2, z, 2 + random(), h, 3.5, wall);
    box("house-roof", x, h + 0.12, z, 3, 0.22, 3.9, roof);
  }
  strip("town-road", -98, 220, 53, 2.1, asphalt, 0.025);
  strip("town-road", -98, 247, 53, 2.1, asphalt, 0.025);

  // PAPI is kept separate so its red/white pattern follows the actual glide error.
  const papi = Array.from({ length: 4 }, (_, i) => {
    box("papi-housing", -9 - i * 0.85, 0.18, 22, 0.48, 0.32, 0.36, dark);
    const lamp = CreateSphere(
      `papi-${i}`,
      { diameter: 0.3, segments: 4 },
      scene,
    );
    lamp.position.set(-9 - i * 0.85, 0.3, 21.78);
    lamp.parent = root;
    lamp.isPickable = false;
    return lamp;
  });
  for (const [mat, meshes] of batches) {
    const merged = Mesh.MergeMeshes(meshes, true, true);
    if (merged) {
      merged.name = `scenery-${mat.name}`;
      merged.parent = root;
      merged.isPickable = false;
    }
  }

  // Color-graded sky dome: horizon haze brightens naturally toward the distance.
  const sky = CreateSphere(
    "atmosphere",
    { diameter: 14000, segments: 24, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  const skyMat = material("sky-gradient", "#ffffff");
  skyMat.disableLighting = true;
  skyMat.emissiveColor = Color3.White();
  skyMat.fogEnabled = false;
  const skyTexture = canvasTexture("daylight-sky", 16, 512, (c) => {
    const gradient = c.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#437dac");
    gradient.addColorStop(0.38, "#8fb6d1");
    gradient.addColorStop(0.5, "#c3d4d9");
    gradient.addColorStop(0.57, "#b2c7cf");
    gradient.addColorStop(1, "#a2bac8");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 16, 512);
  });
  skyMat.diffuseTexture = skyTexture;
  sky.material = skyMat;
  sky.isPickable = false;
  sky.infiniteDistance = true;
  const cloudTexture = canvasTexture("soft-cloud", 256, 128, (c) => {
    c.clearRect(0, 0, 256, 128);
    for (let i = 0; i < 22; i++) {
      const x = 30 + random() * 190,
        y = 45 + random() * 33,
        r = 21 + random() * 22;
      const gradient = c.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "#fffef5b5");
      gradient.addColorStop(0.4, "#f2f5ed7a");
      gradient.addColorStop(1, "#eff5f000");
      c.fillStyle = gradient;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  cloudTexture.hasAlpha = true;
  const cloudMat = material("clouds", "#ffffff");
  cloudMat.diffuseTexture = cloudTexture;
  cloudMat.useAlphaFromDiffuseTexture = true;
  cloudMat.disableLighting = true;
  cloudMat.emissiveColor = new Color3(0.95, 0.96, 0.95);
  cloudMat.backFaceCulling = false;
  cloudMat.disableDepthWrite = true;
  const clouds = Array.from({ length: 18 }, (_, i) => {
    const cloud = CreatePlane(
      `cloud-bank-${i}`,
      { width: 180 + random() * 190, height: 60 + random() * 55 },
      scene,
    );
    cloud.position.set(
      (random() - 0.5) * 3000,
      150 + random() * 100,
      (random() - 0.5) * 3600,
    );
    cloud.material = cloudMat;
    cloud.parent = root;
    cloud.billboardMode = Mesh.BILLBOARDMODE_ALL;
    cloud.isPickable = false;
    return cloud;
  });
  scene.clearColor = new Color4(0.69, 0.78, 0.82, 1);
  scene.fogColor = new Color3(0.69, 0.78, 0.82);
  scene.fogDensity = 0.00062;
  return {
    root,
    update(
      altitude: number,
      distance: number,
      crossTrack: number,
      dt: number,
      animate: boolean,
    ) {
      root.position.set(
        -crossTrack * NM_TO_WORLD,
        -altitude * FT_TO_WORLD - 1.4,
        distance * NM_TO_WORLD,
      );
      const ideal = glideAltitude(distance),
        error = altitude - ideal;
      const reds =
        error > 130
          ? 0
          : error > 45
            ? 1
            : error > -45
              ? 2
              : error > -130
                ? 3
                : 4;
      papi.forEach(
        (lamp, i) => (lamp.material = i < reds ? redLight : whiteLight),
      );
      if (animate)
        for (const cloud of clouds) {
          cloud.position.x += dt * 0.28;
          if (cloud.position.x > 1800) cloud.position.x = -1800;
        }
    },
  };
}
