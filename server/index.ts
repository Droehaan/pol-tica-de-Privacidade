import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { apiRouter } from "./routes/api.js";
import { authMiddleware } from "./middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [k, ...rest] = part.trim().split("=");
      return [k, decodeURIComponent(rest.join("="))];
    })
  );
}

app.use((req, _res, next) => {
  req.cookies = parseCookies(req.headers.cookie);
  next();
});

app.use("/api", authMiddleware, apiRouter);

const webDist = path.join(__dirname, "../web-dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) next();
  });
});

let workerBusy = false;
async function workerTick() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const { processNextJobs } = await import("./services/pipeline.js");
    await processNextJobs(5);
  } catch (e) {
    console.error("worker", e);
  } finally {
    workerBusy = false;
  }
}

setInterval(workerTick, 15_000);

app.listen(port, () => {
  console.log(`Resale Hub em http://localhost:${port}`);
});
