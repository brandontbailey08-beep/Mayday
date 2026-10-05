import "./aircraft-viewer.css";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createAircraft } from "./aircraft";

const status = document.querySelector<HTMLElement>("#model-status")!;
try {
  const canvas = document.querySelector<HTMLCanvasElement>("#aircraft-canvas")!;
  const engine = new Engine(canvas, true, { stencil: false }, true);
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.047, 0.09, 0.145, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.013;
  scene.fogColor = new Color3(0.047, 0.09, 0.145);
  const camera = new ArcRotateCamera(
    "inspection-camera",
    0.79,
    1.14,
    25,
    new Vector3(0, 0.4, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 13;
  camera.upperRadiusLimit = 36;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.66;
  camera.panningSensibility = 0;
  camera.wheelDeltaPercentage = 0.015;
  camera.pinchDeltaPercentage = 0.015;
  camera.minZ = 0.1;
  const sky = new HemisphericLight("studio-fill", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.85;
  sky.groundColor = new Color3(0.2, 0.26, 0.34);
  const sun = new DirectionalLight(
    "studio-key",
    new Vector3(-0.5, -0.8, -0.45),
    scene,
  );
  sun.position.set(15, 20, 12);
  sun.intensity = 1.15;
  sun.diffuse = new Color3(0.96, 0.98, 1);
  const rim = new DirectionalLight(
    "studio-rim",
    new Vector3(0.5, -0.1, 0.6),
    scene,
  );
  rim.intensity = 0.35;
  rim.diffuse = new Color3(0.46, 0.7, 1);
  const aircraft = createAircraft(scene);
  const floor = CreateGround(
    "hangar-floor",
    { width: 1000, height: 1000 },
    scene,
  );
  floor.position.y = -2.25;
  floor.receiveShadows = true;
  const floorMaterial = new StandardMaterial("hangar-floor", scene);
  floorMaterial.diffuseColor = new Color3(0.09, 0.145, 0.21);
  floorMaterial.specularColor = Color3.Black();
  floor.material = floorMaterial;
  const shadow = new ShadowGenerator(1024, sun);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = 24;
  shadow.darkness = 0.35;
  shadow.bias = 0.002;
  for (const part of aircraft.root.getChildMeshes())
    shadow.addShadowCaster(part, false);
  let gear = false,
    orbit = false;
  let fitScale = 1;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gearButton =
    document.querySelector<HTMLButtonElement>("#preview-gear")!;
  gearButton.onclick = () => {
    gear = !gear;
    gearButton.setAttribute("aria-pressed", String(gear));
    gearButton.innerHTML = `Landing gear <b>${gear ? "DOWN" : "UP"}</b>`;
  };
  const orbitButton =
    document.querySelector<HTMLButtonElement>("#preview-orbit")!;
  orbitButton.onclick = () => {
    orbit = !orbit;
    orbitButton.setAttribute("aria-pressed", String(orbit));
    if (orbit)
      document
        .querySelectorAll("[data-view]")
        .forEach((button) => button.setAttribute("aria-pressed", "false"));
  };
  const presets: Record<string, [number, number, number]> = {
    quarter: [0.79, 1.14, 25],
    side: [0, 1.37, 25],
    front: [Math.PI / 2, 1.43, 25],
    rear: [-Math.PI / 2, 1.28, 25],
  };
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        [camera.alpha, camera.beta, camera.radius] =
          presets[button.dataset.view!];
        camera.radius *= fitScale;
        camera.inertialAlphaOffset =
          camera.inertialBetaOffset =
          camera.inertialRadiusOffset =
            0;
        orbit = false;
        orbitButton.setAttribute("aria-pressed", "false");
        document
          .querySelectorAll("[data-view]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      }),
  );
  canvas.addEventListener("pointerdown", () => {
    orbit = false;
    orbitButton.setAttribute("aria-pressed", "false");
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.setAttribute("aria-pressed", "false"));
  });
  scene.executeWhenReady(() => {
    status.hidden = true;
  });
  engine.runRenderLoop(() => {
    if (document.hidden) return;
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    aircraft.update(dt, gear, 0, reduced);
    if (orbit) camera.alpha += dt * 0.12;
    scene.render();
  });
  const resize = () => {
    engine.resize();
    const nextScale = Math.max(1, Math.min(2.1, 600 / canvas.clientWidth));
    camera.radius *= nextScale / fitScale;
    fitScale = nextScale;
    camera.lowerRadiusLimit = 13 * fitScale;
    camera.upperRadiusLimit = 36 * fitScale;
    camera.fov = canvas.clientWidth < 600 ? 0.95 : 0.74;
  };
  window.addEventListener("resize", resize);
  resize();
  window.addEventListener("pagehide", (event) => {
    // A history-cache restore reuses this page, including its WebGL canvas.
    if (event.persisted) return;
    window.removeEventListener("resize", resize);
    engine.dispose();
  });
} catch {
  status.textContent =
    "3D preview is unavailable. Open this page in a WebGL-enabled browser.";
}
