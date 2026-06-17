import { createWorker } from "tesseract.js";

let worker;

async function getWorker() {
  if (!worker) worker = await createWorker("eng");
  return worker;
}

process.on("message", async (msg) => {
  try {
    if (msg.action === "ocr") {
      const w = await getWorker();
      const buf = Buffer.from(msg.data, "base64");
      const { data } = await w.recognize(buf);
      process.send({ id: msg.id, text: data.text || "" });
    } else if (msg.action === "terminate") {
      if (worker) await worker.terminate();
      process.exit(0);
    }
  } catch (e) {
    process.send({ id: msg.id, error: e.message });
  }
});
