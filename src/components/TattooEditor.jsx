import React, { useEffect, useRef, useState } from "react";
import * as BABYLON from "@babylonjs/core";
import "@babylonjs/loaders";

export default function TattooEditor() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const engineRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const modelRootRef = useRef(null);

  const activeTattooRef = useRef(null);
  const sizeRef = useRef(0.25);
  const rotationRef = useRef(0);
  const decalsRef = useRef([]);

  const [models, setModels] = useState([]);
  const [activeModel, setActiveModel] = useState(null);

  const [tattoos, setTattoos] = useState([]);
  const [activeTattoo, setActiveTattoo] = useState(null);
  const [size, setSize] = useState(0.25);
  const [rotation, setRotation] = useState(0);

  const [loading, setLoading] = useState(false);
  const [modelUrl, setModelUrl] = useState("");

  const backendUrl =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

  /* ================= FETCH MODELS ================= */

  useEffect(() => {
    async function loadModels() {
      const res = await fetch(`${backendUrl}/api/list-models`);
      const data = await res.json();
      setModels(data.models);
    }
    loadModels();
  }, [loading]);

  /* ================= INIT BABYLON ================= */

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const preventZoom = (e) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    container.addEventListener("wheel", preventZoom, { passive: false });

    const engine = new BABYLON.Engine(canvas, true);
    engineRef.current = engine;

    const scene = new BABYLON.Scene(engine);
    sceneRef.current = scene;

    const camera = new BABYLON.ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 2.2,
      4,
      BABYLON.Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.zoomToMouseLocation = true;
    camera.wheelDeltaPercentage = 0.015;
    cameraRef.current = camera;

    new BABYLON.HemisphericLight(
      "light",
      new BABYLON.Vector3(0, 1, 0),
      scene
    ).intensity = 1.2;

    let pointerDown = false;

    scene.onPointerDown = () => {
      pointerDown = true;

      if (!activeTattooRef.current) return;

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (mesh) => mesh.metadata?.isModel
      );

      if (!pick?.hit || !pick.pickedMesh) return;

      disposePreview();

      const decal = applyTattooDecal(
        pick,
        activeTattooRef.current,
        sizeRef.current,
        rotationRef.current,
        scene
      );

      decal.isPickable = false;
      decalsRef.current.push(decal);
    };

    scene.onPointerUp = () => {
      pointerDown = false;
    };

    scene.onPointerMove = () => {
      if (pointerDown) {
        disposePreview();
        return;
      }

      if (!activeTattooRef.current) {
        disposePreview();
        return;
      }

      const pick = scene.pick(
        scene.pointerX,
        scene.pointerY,
        (mesh) => mesh.metadata?.isModel
      );

      if (!pick?.hit || !pick.pickedMesh) {
        disposePreview();
        return;
      }

      showPreviewDecal(
        pick,
        activeTattooRef.current,
        sizeRef.current,
        rotationRef.current,
        scene
      );
    };

    engine.runRenderLoop(() => scene.render());

    const resize = () => engine.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      engine.stopRenderLoop();
      engine.dispose();
      container.removeEventListener("wheel", preventZoom);
    };
  }, []);

  /* ================= LOAD MODEL ================= */

  useEffect(() => {
    if (!activeModel || !sceneRef.current) return;

    const scene = sceneRef.current;

    if (modelRootRef.current) {
      modelRootRef.current.dispose();
      decalsRef.current.forEach((d) => d.dispose());
      decalsRef.current = [];
    }

    BABYLON.SceneLoader.ImportMesh("", "", activeModel.url, scene, (meshes) => {
      const root = new BABYLON.TransformNode("modelRoot", scene);

      meshes.forEach((m) => {
        m.isPickable = true;
        m.metadata = { isModel: true };
        m.parent = root;
      });

      modelRootRef.current = root;

      const bounds = root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const size = bounds.max.subtract(bounds.min).length();

      root.position.subtractInPlace(center);
      cameraRef.current.setTarget(BABYLON.Vector3.Zero());
      cameraRef.current.radius = size * 0.6;
    });
  }, [activeModel]);

  /* ================= STATE → REF ================= */

  useEffect(() => {
    activeTattooRef.current = activeTattoo;
  }, [activeTattoo]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    rotationRef.current = -BABYLON.Tools.ToRadians(rotation);
  }, [rotation]);

  /* ================= UI ================= */

  function uploadTattoo(e) {
    Array.from(e.target.files).forEach((file) => {
      const url = URL.createObjectURL(file);
      setTattoos((prev) => [...prev, url]);
    });
  }

  useEffect(() => {
    if (modelUrl) {
      setActiveModel({ name: "Custom Model", url: modelUrl });
    }
  }, [modelUrl]);

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setModelUrl("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`${backendUrl}/api/image-to-3d`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setModelUrl(`${backendUrl}/models/${data.model}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" ref={containerRef}>
      <div className="sidebar">
        <h3>Models</h3>
        {models.map((m) => (
          <div
            key={m.url}
            className={`modelItem ${
              activeModel?.url === m.url ? "active" : ""
            }`}
            onClick={() => setActiveModel(m)}
          >
            {m.name}
          </div>
        ))}

        <h3>Generate 3D model</h3>
        <input type="file" accept="image/*" onChange={handleImageUpload} />
        {loading && <p>Generating 3D model...</p>}

        <h3>Tattoos</h3>
        <input type="file" accept="image/*" multiple onChange={uploadTattoo} />

        {activeTattoo && (
          <>
            <label>Size</label>
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.01"
              value={size}
              onChange={(e) => setSize(+e.target.value)}
            />

            <label>Rotation</label>
            <input
              type="range"
              min="0"
              max="360"
              value={rotation}
              onChange={(e) => setRotation(+e.target.value)}
            />
          </>
        )}

        <div className="tattooGrid">
          {tattoos.map((t, i) => (
            <img
              key={i}
              src={t}
              className={activeTattoo === t ? "active" : ""}
              onClick={() => setActiveTattoo(t)}
            />
          ))}
        </div>
      </div>

      <canvas ref={canvasRef} className="renderCanvas" />
    </div>
  );
}

/* ================= HELPERS ================= */

function disposePreview() {
  if (window._previewDecal) {
    window._previewDecal.dispose();
    window._previewDecal = null;
  }
}

function showPreviewDecal(pick, imageUrl, size, rotation, scene) {
  disposePreview();

  const tex = new BABYLON.Texture(imageUrl, scene);
  const aspect = tex.getSize().width / tex.getSize().height;

  const decal = BABYLON.MeshBuilder.CreateDecal("preview", pick.pickedMesh, {
    position: pick.pickedPoint,
    normal: pick.getNormal(true),
    size: new BABYLON.Vector3(size * aspect, size, size * 0.5),
    angle: rotation,
  });

  const mat = new BABYLON.StandardMaterial("previewMat", scene);
  mat.diffuseTexture = tex;
  mat.diffuseTexture.hasAlpha = true;
  mat.alpha = 0.5;
  mat.backFaceCulling = false;

  decal.material = mat;
  decal.isPickable = false;

  window._previewDecal = decal;
}

function applyTattooDecal(pick, imageUrl, size, rotation, scene) {
  const tex = new BABYLON.Texture(imageUrl, scene);
  const aspect = tex.getSize().width / tex.getSize().height;

  const decal = BABYLON.MeshBuilder.CreateDecal("tattoo", pick.pickedMesh, {
    position: pick.pickedPoint,
    normal: pick.getNormal(true),
    size: new BABYLON.Vector3(size * aspect, size, size * 0.5),
    angle: rotation,
  });

  const mat = new BABYLON.PBRMaterial("tattooMat", scene);
  mat.albedoTexture = tex;
  mat.albedoTexture.hasAlpha = true;
  mat.metallic = 0.0;
  mat.roughness = 0.9;
  mat.zOffset = -2;
  mat.backFaceCulling = false;

  decal.material = mat;
  decal.isPickable = false;

  return decal;
}
