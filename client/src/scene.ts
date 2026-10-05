import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { createAircraft } from "./aircraft";
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
  const aircraft = createAircraft(scene);
  const plane = aircraft.root;
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
    aircraft.update(dt, inFlight ? !!view?.gear : false, visual.speed, reduced);
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
