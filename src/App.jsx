import { useState } from "react";
import TattooEditor from "./components/TattooEditor";


export default function App() {
  const [loading, setLoading] = useState(false);
  const [modelUrl, setModelUrl] = useState("");
  
  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setModelUrl("");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("http://localhost:5000/api/image-to-3d", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || "Backend error");
      }

      const data = await res.json();

      if (!data.model) {
        throw new Error("No model returned");
      }

      setModelUrl(`http://localhost:5000/models/${data.model}`);
    } catch (err) {
      alert("❌ " + err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!modelUrl && (
        <input type="file" accept="image/*" onChange={handleImageUpload} />
      )}

      {loading && <p>Generating 3D model...</p>}

      {!loading && modelUrl && (
        <TattooEditor modelUrl={modelUrl} />
      )}
    </>
  );
}
