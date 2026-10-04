import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
const MeshBuilder = { CreateSphere, CreateCylinder };
import { createScenery } from "./scenery";
import type { FlightView } from "../../shared/protocol";

export function createWorld(canvas: HTMLCanvasElement) {
  const engine = new Engine(
    canvas,
    true,
    { stencil: false, preserveDrawingBuffer: false },
    true,
  );
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.fogMode = Scene.FOGMODE_EXP2;
  const camera = new UniversalCamera("camera", new Vector3(22, 10, 26), scene);
  camera.setTarget(new Vector3(0, 0, 0));
  camera.fov = 0.7;
  const ambient = new HemisphericLight(
    "sky-light",
    new Vector3(0, 1, 0),
    scene,
  );
  ambient.intensity = 0.78;
  ambient.groundColor = new Color3(0.3, 0.34, 0.31);
  const sun = new DirectionalLight("sun", new Vector3(-1, -0.4, 0.3), scene);
  sun.intensity = 0.8;
  sun.diffuse = new Color3(1, 0.96, 0.87);
  camera.minZ = 0.08;
  camera.maxZ = 10000;
  const material = (name: string, hex: string, glow = 0) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = new Color3(0.35, 0.4, 0.4);
    m.emissiveColor = m.diffuseColor.scale(glow);
    return m;
  };
  const ivory = material("airframe", "#d7ded3");
  const dark = material("carbon", "#17282b");
  const accent = material("rescue orange", "#d17848");
  const glass = material("glass", "#25434c");
  const green = material("navigation green", "#b9e983", 1);
  const red = material("navigation red", "#fc594a", 1);
  const plane = new TransformNode("flight404", scene);
  const body = MeshBuilder.CreateSphere(
    "fuselage",
    { diameter: 2, segments: 24 },
    scene,
  );
  body.scaling = new Vector3(0.8, 0.82, 6.8);
  body.material = ivory;
  body.parent = plane;
  const prism = (
    name: string,
    points: number[][],
    height: number,
    mat: StandardMaterial,
  ) => {
    const mesh = new Mesh(name, scene);
    const positions: number[] = [],
      indices: number[] = [];
    for (const y of [-height / 2, height / 2])
      for (const [x, z] of points) positions.push(x, y, z);
    const n = points.length;
    for (let i = 1; i < n - 1; i++)
      indices.push(0, i + 1, i, n, n + i, n + i + 1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      indices.push(i, j, n + j, i, n + j, n + i);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = mat;
    mesh.parent = plane;
    mat.backFaceCulling = false;
    return mesh;
  };
  for (const side of [-1, 1]) {
    prism(
      `wing${side}`,
      [
        [side * 0.6, 2],
        [side * 9, -2.5],
        [side * 9, -3.4],
        [side * 0.6, -1.3],
      ],
      0.14,
      ivory,
    );
    prism(
      `tail${side}`,
      [
        [side * 0.4, -3.8],
        [side * 3.5, -5.8],
        [side * 3.5, -6.4],
        [side * 0.3, -5.4],
      ],
      0.12,
      ivory,
    );
    const nacelle = MeshBuilder.CreateCylinder(
      `engine${side}`,
      { diameter: 1.1, height: 2.8, tessellation: 24 },
      scene,
    );
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 3.1, -0.8, 0.1);
    nacelle.parent = plane;
    nacelle.material = ivory;
    const intake = MeshBuilder.CreateCylinder(
      `intake${side}`,
      { diameter: 0.87, height: 0.03, tessellation: 24 },
      scene,
    );
    intake.rotation.x = Math.PI / 2;
    intake.position.set(side * 3.1, -0.8, 1.52);
    intake.parent = plane;
    intake.material = dark;
    const light = MeshBuilder.CreateSphere(
      `nav${side}`,
      { diameter: 0.14 },
      scene,
    );
    light.position.set(side * 9, 0.1, -2.8);
    light.parent = plane;
    light.material = side < 0 ? red : green;
    for (let i = 0; i < 14; i++) {
      const window = MeshBuilder.CreateSphere(
        "window",
        { diameter: 0.18, segments: 6 },
        scene,
      );
      window.scaling = new Vector3(0.15, 1, 1.4);
      window.position.set(side * 0.77, 0.3, 3.6 - i * 0.49);
      window.parent = plane;
      window.material = glass;
    }
  }
  const tail = prism(
    "vertical tail",
    [
      [0, -3.4],
      [2.5, -5.8],
      [2.5, -6.5],
      [0, -5.8],
    ],
    0.16,
    accent,
  );
  tail.rotation.z = Math.PI / 2;
  tail.position.y = 0.45;
  const cockpit = MeshBuilder.CreateSphere(
    "cockpit",
    { diameter: 1.1, segments: 16 },
    scene,
  );
  cockpit.scaling = new Vector3(1.15, 0.4, 1.1);
  cockpit.position.set(0, 0.55, 5);
  cockpit.parent = plane;
  cockpit.material = glass;
  const scenery = createScenery(scene);
  let view: FlightView | undefined;
  type VisualFlight = Pick<
    FlightView,
    | "altitude"
    | "distance"
    | "crossTrack"
    | "heading"
    | "bank"
    | "verticalSpeed"
    | "speed"
  >;
  let visual: VisualFlight | undefined;
  let time = 0;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  engine.runRenderLoop(() => {
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    // The engineer workspace covers the canvas. Avoid spending GPU time behind it.
    if (document.hidden || document.body.dataset.station === "engineer") return;
    time += dt;
    const inFlight = !!view && document.body.dataset.screen === "flight";
    const target: VisualFlight =
      inFlight && view
        ? view
        : {
            altitude: 2200,
            distance: 2.1,
            crossTrack: 0.45,
            heading: 270,
            bank: 4,
            verticalSpeed: 0,
            speed: 180,
          };
    if (
      !visual ||
      Math.abs(visual.distance - target.distance) > 0.6 ||
      Math.abs(visual.altitude - target.altitude) > 700
    ) {
      visual = { ...target };
    } else {
      // Interpolate the 10 Hz network snapshots without changing flight physics.
      const blend = 1 - Math.exp(-dt * 12);
      for (const key of [
        "altitude",
        "distance",
        "crossTrack",
        "bank",
        "verticalSpeed",
        "speed",
      ] as const)
        visual[key] += (target[key] - visual[key]) * blend;
      visual.heading +=
        (((target.heading - visual.heading + 540) % 360) - 180) * blend;
      visual.heading = (visual.heading + 360) % 360;
    }
    scenery.update(
      visual.altitude,
      visual.distance,
      visual.crossTrack,
      dt,
      !reduced,
    );
    const inCockpit = inFlight && document.body.dataset.station === "pilot";
    plane.setEnabled(!inCockpit);
    plane.rotation.z = (-visual.bank * Math.PI) / 180;
    plane.rotation.x = -visual.verticalSpeed / 18000;
    plane.rotation.y = ((visual.heading - 270) * Math.PI) / 180;
    plane.position.y = reduced ? 0 : Math.sin(time * 0.55) * 0.18;
    if (inCockpit) {
      const heading = ((visual.heading - 270) * Math.PI) / 180;
      const pitch = Math.atan2(
        visual.verticalSpeed / 60,
        Math.max(1, visual.speed * 1.688),
      );
      camera.position.set(0, 0.5, 0);
      camera.setTarget(
        new Vector3(
          Math.sin(heading) * 200,
          0.5 + Math.tan(pitch) * 200,
          Math.cos(heading) * 200,
        ),
      );
      camera.rotation.z = (-visual.bank * Math.PI) / 180;
      camera.fov = 0.85;
    } else {
      const final = inFlight && view?.landing !== null;
      const cameraGoal = final
        ? new Vector3(0, 7, -29)
        : new Vector3(22, 10, 26);
      camera.position = Vector3.Lerp(
        camera.position,
        cameraGoal,
        Math.min(1, dt * 3),
      );
      camera.setTarget(final ? new Vector3(0, -2, 60) : Vector3.Zero());
      camera.rotation.z = 0;
      camera.fov = 0.7;
    }
    scene.render();
  });
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  return {
    update: (flight: FlightView) => {
      view = flight;
    },
    dispose: () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      engine.dispose();
    },
  };
}
