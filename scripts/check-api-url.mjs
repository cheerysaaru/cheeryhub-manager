import fs from "fs";
import path from "path";

const mode = process.env.BUILD_MODE || "local";
const bundleDir = path.resolve("frontend/dist/assets");
const prodUrl = "api.cheeryhub.space";

async function check() {
  try {
    const files = (await fs.promises.readdir(bundleDir)).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const content = await fs.promises.readFile(path.join(bundleDir, file), "utf8");
      if (mode === "production") {
        if (!content.includes(prodUrl)) {
          console.error(`FAILED: Production bundle ${file} missing ${prodUrl}`);
          process.exit(1);
        }
      } else {
        if (content.includes(prodUrl)) {
          console.error(`FAILED: Local bundle ${file} contains production URL ${prodUrl}`);
          process.exit(1);
        }
      }
    }
    console.log(`SUCCESS: Build verified for ${mode} mode.`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
