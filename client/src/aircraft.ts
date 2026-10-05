import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

type Ring = [z: number, radiusX: number, radiusY: number, centerY: number];
type Point = [x: number, y: number, z: number];
type WingSection = [
  span: number,
  height: number,
  leadingEdge: number,
  chord: number,
];
const TAU = Math.PI * 2;

/** Original fictional twinjet. All geometry/textures are created locally; +Z is forward. */
export function createAircraft(scene: Scene) {
  const root = new TransformNode("MF-404-airliner", scene);
  const batches = new Map<StandardMaterial, Mesh[]>();
  const mat = (name: string, color: string, shine = 0.2) => {
    const m = new StandardMaterial(`aircraft-${name}`, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = new Color3(shine, shine, shine);
    m.specularPower = 64;
    return m;
  };
  const paint = mat("pearl-white", "#e4edf5", 0.42);
  const navy = mat("midnight-blue", "#123d69", 0.42);
  const blue = mat("wingtip-blue", "#267ebc", 0.42);
  const metal = mat("brushed-titanium", "#9baebc", 0.7);
  const dark = mat("intake-shadow", "#131d29", 0.05);
  const rubber = mat("tires", "#202932", 0.03);
  const glass = mat("cockpit-glass", "#142e48", 0.8);
  glass.specularPower = 128;
  glass.backFaceCulling = false;
  const fanMetal = mat("fan-blades", "#657e90", 0.65);
  const texture = (
    name: string,
    width: number,
    height: number,
    draw: (c: CanvasRenderingContext2D) => void,
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext("2d")!);
    const t = new DynamicTexture(
      name,
      canvas,
      scene,
      true,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    t.anisotropicFilteringLevel = 8;
    t.update();
    return t;
  };
  const add = (
    mesh: Mesh,
    material: StandardMaterial,
    parent: TransformNode = root,
    batch = true,
  ) => {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.parent = parent;
    if (parent === root && batch) {
      const list = batches.get(material) ?? [];
      list.push(mesh);
      batches.set(material, list);
    }
    return mesh;
  };
  const mesh = (
    name: string,
    positions: number[],
    indices: number[],
    material: StandardMaterial,
    uvs?: number[],
    parent = root,
    batch = true,
  ) => {
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    Object.assign(data, { positions, indices, normals, uvs });
    const m = new Mesh(name, scene);
    data.applyToMesh(m);
    return add(m, material, parent, batch);
  };
  const ellipsoid = (
    name: string,
    at: Point,
    size: Point,
    material: StandardMaterial,
    parent = root,
  ) => {
    const m = CreateSphere(name, { diameter: 2, segments: 16 }, scene);
    m.position.set(...at);
    m.scaling.set(...size);
    return add(m, material, parent);
  };
  const box = (
    name: string,
    at: Point,
    size: Point,
    material: StandardMaterial,
    parent = root,
  ) => {
    const m = CreateBox(
      name,
      { width: size[0], height: size[1], depth: size[2] },
      scene,
    );
    m.position.set(...at);
    return add(m, material, parent);
  };
  const cylinder = (
    name: string,
    at: Point,
    diameter: number,
    height: number,
    material: StandardMaterial,
    parent = root,
    rotation: "x" | "z" | null = null,
  ) => {
    const m = CreateCylinder(
      name,
      { diameter, height, tessellation: 24 },
      scene,
    );
    m.position.set(...at);
    if (rotation) m.rotation[rotation] = Math.PI / 2;
    return add(m, material, parent);
  };
  // Ring lofts can also describe a hollow shell by returning along the inner wall.
  const loft = (
    name: string,
    rings: Ring[],
    material: StandardMaterial,
    parent = root,
    segments = 64,
  ) => {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    for (let r = 0; r < rings.length; r++) {
      const [z, rx, ry, cy] = rings[r];
      for (let j = 0; j <= segments; j++) {
        const theta = (j / segments) * TAU;
        positions.push(Math.sin(theta) * rx, cy - Math.cos(theta) * ry, z);
        uvs.push((z + 9.3) / 18.1, j / segments);
        if (r < rings.length - 1 && j < segments) {
          const a = r * (segments + 1) + j,
            b = a + 1,
            c = a + segments + 1;
          indices.push(a, c, b, b, c, c + 1);
        }
      }
    }
    return mesh(name, positions, indices, material, uvs, parent);
  };

  const bodyMaterial = mat("fuselage-livery", "#ffffff", 0.35);
  bodyMaterial.diffuseTexture = texture(
    "MF-404-painted-fuselage",
    2048,
    1024,
    (c) => {
      c.fillStyle = "#eaf0f5";
      c.fillRect(0, 0, 2048, 1024);
      const gradient = c.createLinearGradient(0, 0, 0, 1024);
      gradient.addColorStop(0, "#0e2c4d");
      gradient.addColorStop(0.16, "#174b78");
      gradient.addColorStop(0.18, "#4ba7d4");
      gradient.addColorStop(0.195, "#eaf0f5");
      gradient.addColorStop(0.805, "#eaf0f5");
      gradient.addColorStop(0.82, "#4ba7d4");
      gradient.addColorStop(0.84, "#174b78");
      gradient.addColorStop(1, "#0e2c4d");
      c.fillStyle = gradient;
      c.fillRect(0, 0, 2048, 1024);
      const u = (z: number) => ((z + 9.3) / 18.1) * 2048;
      // Very light skin joins retain the clean enamel finish at a distance.
      c.strokeStyle = "#23394e14";
      c.lineWidth = 1;
      for (let z = -7; z <= 7; z += 0.9) {
        c.beginPath();
        c.moveTo(u(z), 150);
        c.lineTo(u(z), 875);
        c.stroke();
      }
      const side = (flip: boolean) => {
        c.save();
        if (flip) {
          c.translate(2048, 1024);
          c.scale(-1, -1);
        }
        const localU = (z: number) => (flip ? 2048 - u(z) : u(z));
        const windowY = 714;
        for (let i = 0; i < 34; i++) {
          const x = localU(-5.75 + i * 0.337);
          c.fillStyle = "#a6b6c3";
          c.beginPath();
          c.roundRect(x - 9, windowY - 20, 18, 39, 7);
          c.fill();
          c.fillStyle = "#183348";
          c.beginPath();
          c.roundRect(x - 7, windowY - 17, 14, 33, 6);
          c.fill();
          c.fillStyle = "#5d859a";
          c.fillRect(x - 4, windowY - 12, 2, 18);
        }
        for (const [z, small] of [
          [5.9, false],
          [-6.5, false],
          [0.2, true],
          [-0.7, true],
        ] as const) {
          const x = localU(z),
            w = small ? 38 : 52,
            h = small ? 80 : 150;
          c.fillStyle = "#e9f0f5";
          c.strokeStyle = "#637d918a";
          c.lineWidth = 2;
          c.beginPath();
          c.roundRect(x - w / 2, windowY - 35, w, h, 10);
          c.fill();
          c.stroke();
          c.fillStyle = "#24455f";
          c.beginPath();
          c.roundRect(x - 8, windowY - 20, 16, 27, 5);
          c.fill();
          c.fillStyle = "#758999";
          c.fillRect(x + 10, windowY + 30, 10, 4);
          c.fillStyle = "#be7d58";
          c.fillRect(x - 12, windowY - 29, 24, 3);
        }
        c.textAlign = "center";
        c.fillStyle = "#164573";
        c.font = "700 62px Arial";
        c.fillText("MAYDAY", localU(3.35), 658);
        c.font = "20px Arial";
        c.fillStyle = "#4484a8";
        c.fillText("FLIGHT OPERATIONS", localU(3.35), 684);
        c.font = "23px Arial";
        c.fillStyle = "#36566e";
        c.fillText("MF–404", localU(-4.7), 788);
        c.restore();
      };
      side(false);
      side(true);
    },
  );
  const bodyRings: Ring[] = [
    [-9.3, 0.018, 0.025, 0.27],
    [-9.0, 0.1, 0.12, 0.26],
    [-8.5, 0.23, 0.27, 0.23],
    [-7.9, 0.4, 0.43, 0.17],
    [-7.2, 0.61, 0.65, 0.08],
    [-6.4, 0.78, 0.8, 0.02],
    [-5.5, 0.87, 0.89, 0],
    [-4.2, 0.9, 0.92, 0],
    [-2, 0.91, 0.93, 0],
    [0, 0.91, 0.93, 0],
    [2, 0.91, 0.93, 0],
    [4.4, 0.9, 0.92, 0],
    [5.5, 0.87, 0.9, -0.01],
    [6.15, 0.81, 0.84, -0.02],
    [6.7, 0.79, 0.78, -0.035],
    [7.15, 0.71, 0.67, -0.08],
    [7.55, 0.6, 0.52, -0.14],
    [7.95, 0.42, 0.35, -0.19],
    [8.2, 0.28, 0.23, -0.2],
    [8.4, 0.14, 0.12, -0.2],
    [8.46, 0.065, 0.065, -0.19],
    [8.48, 0.002, 0.003, -0.19],
  ];
  loft("sculpted-fuselage", bodyRings, bodyMaterial);
  const skin = (angle: number, z: number, lift = 0.012): Point => {
    const next = Math.max(
      1,
      bodyRings.findIndex((r) => r[0] >= z),
    );
    const a = bodyRings[next - 1],
      b = bodyRings[next];
    const t = (z - a[0]) / (b[0] - a[0]);
    const rx = a[1] + (b[1] - a[1]) * t + lift;
    const ry = a[2] + (b[2] - a[2]) * t + lift;
    const cy = a[3] + (b[3] - a[3]) * t;
    return [Math.sin(angle) * rx, cy - Math.cos(angle) * ry, z];
  };
  for (const side of [-1, 1]) {
    for (const [lo, hi, back, front] of [
      [1.78, 2.23, 6.05, 6.72],
      [2.03, 2.62, 6.8, 7.36],
      [2.67, 3.1, 7.03, 7.64],
    ]) {
      const angle = (a: number) => (side > 0 ? a : TAU - a);
      // A tessellated skin patch follows the curved nose; a flat quad would
      // intersect the fuselage and leave only the edges of the window visible.
      const positions: number[] = [],
        indices: number[] = [];
      const steps = 8;
      for (let row = 0; row <= steps; row++)
        for (let col = 0; col <= steps; col++) {
          const v = row / steps,
            u = col / steps;
          const z = (back + 0.08 * v) * (1 - u) + (front - 0.05 * v) * u;
          positions.push(...skin(angle(lo + (hi - lo) * v), z, 0.018));
          if (row < steps && col < steps) {
            const a = row * (steps + 1) + col,
              b = a + 1,
              c = a + steps + 1;
            indices.push(a, b, c, b, c + 1, c);
          }
        }
      mesh("flush-cockpit-pane", positions, indices, glass);
    }
  }
  ellipsoid("wing-body-fairing", [0, -0.57, -0.9], [1.28, 0.43, 2.8], navy);

  const wingMaterial = mat("wing-panels", "#ffffff", 0.35);
  wingMaterial.diffuseTexture = texture(
    "wing-surface-panels",
    1024,
    512,
    (c) => {
      c.fillStyle = "#cfdae4";
      c.fillRect(0, 0, 1024, 512);
      c.fillStyle = "#9dabb5";
      c.fillRect(0, 480, 1024, 32);
      c.fillStyle = "#b1c0cb";
      c.fillRect(0, 0, 1024, 115);
      c.strokeStyle = "#566c8077";
      c.lineWidth = 2;
      for (const y of [112, 135, 420]) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(1024, y);
        c.stroke();
      }
      for (const x of [185, 480, 790]) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, 420);
        c.stroke();
      }
      c.fillStyle = "#566777";
      c.fillRect(0, 210, 115, 105);
      c.strokeStyle = "#f1b865";
      c.lineWidth = 3;
      c.strokeRect(8, 218, 99, 89);
    },
  );
  const wing = (
    name: string,
    sections: WingSection[],
    side: number,
    material: StandardMaterial,
    thickness: number,
  ) => {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    const steps = 18,
      perimeter = steps * 2;
    for (let r = 0; r < sections.length; r++) {
      const [span, height, leading, chord] = sections[r];
      for (let j = 0; j <= perimeter; j++) {
        const upper = j <= steps;
        const t = upper ? j / steps : (perimeter - j) / steps;
        const foil =
          5 *
          thickness *
          chord *
          (0.2969 * Math.sqrt(t) -
            0.126 * t -
            0.3516 * t ** 2 +
            0.2843 * t ** 3 -
            0.1036 * t ** 4);
        positions.push(
          side * span,
          height +
            0.018 * chord * Math.sin(t * Math.PI) +
            (upper ? foil : -foil),
          leading - t * chord,
        );
        uvs.push(span / sections[sections.length - 1][0], t);
        if (r < sections.length - 1 && j < perimeter) {
          const a = r * (perimeter + 1) + j,
            b = a + 1,
            c = a + perimeter + 1;
          if (side > 0) indices.push(a, b, c, b, c + 1, c);
          else indices.push(a, c, b, b, c, c + 1);
        }
      }
    }
    return mesh(name, positions, indices, material, uvs);
  };
  // A thin profiled extrusion in Y/Z is used for the fin, pylons and winglets.
  const fin = (
    name: string,
    points: [number, number][],
    x: number,
    width: number,
    material: StandardMaterial,
    mirrored = false,
  ) => {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    for (const face of [-1, 1])
      for (const [y, z] of points) {
        positions.push(x + (face * width) / 2, y, z);
        uvs.push(face > 0 !== mirrored ? (z + 9) / 4 : 1 - (z + 9) / 4, y / 4);
      }
    const n = points.length;
    for (let i = 1; i < n - 1; i++)
      indices.push(0, i, i + 1, n, n + i + 1, n + i);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(i, n + i, j, j, n + i, n + j);
    }
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    const m = mesh(name, positions, indices, material, uvs);
    m.convertToFlatShadedMesh();
    return m;
  };
  const tailMaterial = mat("tail-livery", "#ffffff", 0.35);
  tailMaterial.backFaceCulling = false;
  tailMaterial.diffuseTexture = texture("MF-404-tail-art", 512, 512, (c) => {
    c.fillStyle = "#123b66";
    c.fillRect(0, 0, 512, 512);
    c.fillStyle = "#276fa8";
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(280, 0);
    c.lineTo(512, 512);
    c.lineTo(280, 512);
    c.closePath();
    c.fill();
    c.fillStyle = "#73c7e8";
    c.beginPath();
    c.moveTo(75, 0);
    c.lineTo(105, 0);
    c.lineTo(360, 512);
    c.lineTo(330, 512);
    c.closePath();
    c.fill();
    c.fillStyle = "#f2f7fb";
    c.font = "bold italic 115px Arial";
    c.textAlign = "center";
    c.fillText("404", 218, 292);
    c.font = "24px Arial";
    c.fillText("MAYDAY", 218, 329);
  });
  fin(
    "swept-vertical-stabilizer",
    [
      [0.46, -5.2],
      [3.5, -7.6],
      [3.66, -8.12],
      [3.57, -8.45],
      [0.28, -8.7],
    ],
    0,
    0.14,
    tailMaterial,
  );
  for (const side of [-1, 1]) {
    wing(
      "cambered-main-wing",
      [
        [0.68, -0.16, 1.85, 5.0],
        [1.7, -0.11, 1.3, 4.55],
        [3.4, 0.04, 0.48, 3.35],
        [5.9, 0.3, -1.0, 1.88],
        [7.65, 0.57, -2.08, 1.05],
        [8.05, 0.72, -2.36, 0.72],
      ],
      side,
      wingMaterial,
      0.105,
    );
    wing(
      "horizontal-stabilizer",
      [
        [0.34, 0.54, -5.8, 2.58],
        [1.3, 0.68, -6.21, 1.87],
        [2.97, 0.96, -7.45, 0.62],
      ],
      side,
      paint,
      0.085,
    );
    fin(
      "blended-blue-winglet",
      [
        [0.55, -2.12],
        [1.88, -2.83],
        [1.97, -3.09],
        [1.77, -3.2],
        [0.57, -3.12],
      ],
      side * 8.03,
      0.08,
      blue,
      side < 0,
    );
    for (const [span, z, length] of [
      [2.0, -2.2, 1.4],
      [3.8, -2.15, 1.1],
      [5.5, -2.5, 0.78],
    ])
      ellipsoid(
        "flap-track-fairing",
        [side * span, -0.12 + span * 0.038, z],
        [0.13, 0.13, length],
        paint,
      );
    fin(
      "engine-pylon",
      [
        [-0.03, 1.05],
        [-0.68, 1.17],
        [-0.82, -0.63],
        [-0.12, -1.1],
      ],
      side * 3.05,
      0.22,
      metal,
    );
  }

  const fans: TransformNode[] = [];
  for (const side of [-1, 1]) {
    const nacelle = new TransformNode(`engine-${side < 0 ? 1 : 2}`, scene);
    nacelle.parent = root;
    nacelle.position.set(side * 3.05, -0.95, 0.7);
    const rings = (points: [number, number][]): Ring[] =>
      points.map(([z, r]) => [z, r, r, 0]);
    loft(
      "engine-cowling",
      rings([
        [-1.4, 0.45],
        [-1.12, 0.59],
        [-0.55, 0.7],
        [0.1, 0.745],
        [0.65, 0.74],
        [0.85, 0.72],
      ]),
      paint,
      nacelle,
      48,
    );
    loft(
      "polished-intake-lip",
      rings([
        [0.85, 0.72],
        [1.01, 0.69],
        [1.09, 0.645],
        [1.075, 0.607],
        [0.94, 0.591],
      ]),
      metal,
      nacelle,
      48,
    );
    loft(
      "recessed-intake-duct",
      rings([
        [0.94, 0.591],
        [0.7, 0.563],
        [0.31, 0.492],
      ]),
      dark,
      nacelle,
      48,
    );
    loft(
      "exhaust-ring",
      rings([
        [-1.46, 0.445],
        [-1.58, 0.4],
        [-1.61, 0.34],
        [-1.44, 0.31],
      ]),
      metal,
      nacelle,
      48,
    );
    cylinder(
      "exhaust-dark-core",
      [0, 0, -1.39],
      0.64,
      0.09,
      dark,
      nacelle,
      "x",
    );
    const fan = new TransformNode("rotating-turbofan", scene);
    fan.parent = nacelle;
    fan.position.z = 0.35;
    fans.push(fan);
    cylinder("fan-shadow", [0, 0, -0.03], 0.98, 0.03, dark, fan, "x");
    const positions: number[] = [],
      indices: number[] = [];
    for (let blade = 0; blade < 20; blade++) {
      const angle = (blade / 20) * TAU,
        start = positions.length / 3;
      for (const [radius, sweep, depth] of [
        [0.145, 0, 0.03],
        [0.475, 0.24, 0],
        [0.479, 0.36, 0.025],
        [0.15, 0.14, 0.07],
      ]) {
        positions.push(
          Math.cos(angle + sweep) * radius,
          Math.sin(angle + sweep) * radius,
          depth,
        );
      }
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
    }
    fanMetal.backFaceCulling = false;
    mesh(
      "swept-fan-blades",
      positions,
      indices,
      fanMetal,
      undefined,
      fan,
      false,
    );
    const spinner = CreateCylinder(
      "fan-spinner",
      { diameterTop: 0, diameterBottom: 0.31, height: 0.3, tessellation: 24 },
      scene,
    );
    spinner.rotation.x = Math.PI / 2;
    spinner.position.z = 0.18;
    add(spinner, metal, fan);
    ellipsoid(
      "engine-blue-badge",
      [side * 0.726, -0.02, 0.07],
      [0.018, 0.16, 0.3],
      navy,
      nacelle,
    );
  }

  const gear = new TransformNode("retractable-undercarriage", scene);
  gear.parent = root;
  gear.position.y = -0.65;
  const wheel = (x: number, y: number, z: number, diameter: number) => {
    const tire = CreateTorus(
      "rubber-tire",
      {
        diameter: diameter * 0.76,
        thickness: diameter * 0.24,
        tessellation: 20,
      },
      scene,
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, y, z);
    add(tire, rubber, gear);
    cylinder("wheel-hub", [x, y, z], diameter * 0.5, 0.15, metal, gear, "z");
    cylinder("brake-hub", [x, y, z], diameter * 0.22, 0.165, dark, gear, "z");
  };
  for (const side of [-1, 1]) {
    const x = side * 1.35;
    box("gear-bay", [x, -0.78, -1.45], [0.55, 0.05, 1.05], dark);
    cylinder("main-oleo", [x, -0.57, -1.45], 0.11, 1.15, metal, gear);
    const brace = cylinder(
      "main-gear-brace",
      [x - side * 0.2, -0.35, -1.45],
      0.055,
      0.64,
      metal,
      gear,
    );
    brace.rotation.z = side * 0.65;
    cylinder("main-axle", [x, -1.22, -1.45], 0.12, 0.73, metal, gear, "z");
    wheel(x - 0.24, -1.22, -1.45, 0.64);
    wheel(x + 0.24, -1.22, -1.45, 0.64);
    box(
      "main-gear-door",
      [x + side * 0.22, -0.47, -1.47],
      [0.06, 0.8, 0.64],
      paint,
      gear,
    );
  }
  cylinder("nose-oleo", [0, -0.61, 5.7], 0.09, 1.13, metal, gear);
  cylinder("nose-axle", [0, -1.3, 5.7], 0.09, 0.48, metal, gear, "z");
  wheel(-0.16, -1.3, 5.7, 0.44);
  wheel(0.16, -1.3, 5.7, 0.44);
  box("nose-door", [0.22, -0.32, 5.7], [0.035, 0.5, 0.78], paint, gear);
  for (const z of [-1.7, 3.1])
    fin(
      "communications-antenna",
      [
        [0.92, z + 0.16],
        [1.16, z - 0.1],
        [0.93, z - 0.35],
      ],
      0,
      0.025,
      paint,
    );
  ellipsoid("apu-exhaust", [0, 0.27, -9.26], [0.055, 0.06, 0.045], dark);

  const lights: Mesh[] = [];
  const lamp = (name: string, color: string, at: Point, size: number) => {
    const m = mat(name, color, 0);
    m.disableLighting = true;
    m.emissiveColor = m.diffuseColor.clone();
    m.diffuseColor = Color3.Black();
    const light = ellipsoid(name, at, [size, size, size], m);
    lights.push(light);
    return light;
  };
  lamp("port-red", "#ff342d", [-8.08, 0.77, -2.8], 0.055);
  lamp("starboard-green", "#45ffa5", [8.08, 0.77, -2.8], 0.055);
  lamp("tail-white", "#e8f4ff", [0, 0.53, -8.85], 0.04);
  const beacon = lamp(
    "anti-collision-beacon",
    "#ff372b",
    [0, 0.96, 0.2],
    0.045,
  );
  lamp("landing-light-left", "#fff6db", [-1.12, -0.17, 1.29], 0.07);
  lamp("landing-light-right", "#fff6db", [1.12, -0.17, 1.29], 0.07);

  // Batch static parts; retain engine/gear transforms for their local animation.
  for (const [material, meshes] of batches) {
    const staticMeshes = meshes.filter((m) => !lights.includes(m));
    if (staticMeshes.length > 1) {
      const merged = Mesh.MergeMeshes(staticMeshes, true, true);
      if (merged) {
        merged.name = `airframe-${material.name}`;
        merged.parent = root;
        merged.isPickable = false;
      }
    }
  }
  let extension = 0,
    clock = 0;
  gear.setEnabled(false);
  return {
    root,
    update(
      dt: number,
      gearDown: boolean,
      speed: number,
      reducedMotion: boolean,
    ) {
      const target = gearDown ? 1 : 0;
      extension = reducedMotion
        ? target
        : extension +
          Math.sign(target - extension) *
            Math.min(Math.abs(target - extension), dt * 1.4);
      gear.setEnabled(extension > 0.001);
      gear.scaling.y = Math.max(0.001, extension);
      if (!reducedMotion) {
        clock += dt;
        for (const fan of fans)
          fan.rotation.z = (fan.rotation.z + dt * (3 + speed / 24)) % TAU;
        beacon.visibility = clock % 1.8 < 0.14 ? 1 : 0.12;
      } else beacon.visibility = 1;
      lights[4].setEnabled(gearDown);
      lights[5].setEnabled(gearDown);
    },
  };
}
