import express from "express";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";

const app = express();
app.use(cors());
const upload = multer({ dest: "models/" });
const PORT = 5000;
dotenv.config();

const MESHY_API_KEY = process.env.MESHY_AI_KEY_TEST;

app.use("/models", express.static("models"));

app.post("/api/image-to-3d", upload.single("image"), async (req, res) => {
  try {
    const base64 = fs.readFileSync(req.file.path, "base64");
    console.log("MESHY_API_KEY: ", MESHY_API_KEY);
    const headers = {
      Authorization: `Bearer ${MESHY_API_KEY}`,
      "Content-Type": "application/json",
    };

    const task = await axios.post(
      "https://api.meshy.ai/openapi/v1/image-to-3d",
      {
        image_url: `data:image/png;base64,${base64}`,
        enable_pbr: true,
        should_remesh: true,
        should_texture: true,
      },
      { headers }
    );
    const taskId = task.data.result;
    if (!taskId) {
      throw new Error("Meshy did not return task ID");
    }

    let modelUrl;
    while (!modelUrl) {
      await new Promise((r) => setTimeout(r, 5000));
      const response = await axios.get(
        `https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`,
        { headers }
      );
      console.log("Polling response:", response);
      if (response.status == 200) {
        modelUrl = response.data.model_urls.glb;
      }
      console.log("modelUrl", modelUrl);
    }
    const glb = await axios.get(modelUrl, { responseType: "arraybuffer" });

    const fileName = `generated_${Date.now()}.glb`;
    console.log("Saving model as:", fileName);
    const savePath = path.join("models", fileName);

    fs.writeFileSync(savePath, glb.data);
    fs.unlinkSync(req.file.path);

    return res.json({ model: fileName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Generation failed" });
  }
});

app.listen(PORT, () => console.log(`Backend running http://localhost:${PORT}`));
