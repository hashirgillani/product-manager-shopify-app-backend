// @ts-check
import dotenv from "dotenv";
import connectDB from "./db/index.js";

dotenv.config({
  path: "./.env",
});

const PORT = parseInt(
  process.env.BACKEND_PORT || process.env.PORT || "3000",
  10
);

const start = async () => {
  try {
    await connectDB();
    const { app } = await import("./app.js");
    app.listen(PORT, () => {
      console.log(`Backend listening on http://127.0.0.1:${PORT}`);
    });
  } catch (err) {
    console.error("Backend failed to start:", err);
    process.exit(1);
  }
};

start();