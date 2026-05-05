const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { AppError } = require("../errors/AppError");

function printLabel({
  requestId,
  command,
  jobs,
  renderedDir,
  swiftRendererBin,
  swiftCacheDir,
  directPrintPython,
  directPrintHelper,
  archBin,
  brotherConfig,
  ensureBrotherQueue,
  ensureRendererBinary,
}) {
  if (!jobs || jobs.length === 0) {
    return [];
  }

  if (!brotherConfig.enabled) {
    return [];
  }

  const printedFiles = [];
  ensureRendererBinary();

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const suffix = jobs.length > 1 ? `-${job.type || index + 1}` : "";
    const baseName = `${requestId}-${command}${suffix}`;
    const specPath = path.join(renderedDir, `${baseName}.json`);
    const pngPath = path.join(renderedDir, `${baseName}.png`);
    const directConfigPath = path.join(renderedDir, `${baseName}-direct.json`);

    fs.writeFileSync(specPath, JSON.stringify(job.spec));

    execFileSync(swiftRendererBin, [specPath, pngPath], {
      stdio: "pipe",
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH: swiftCacheDir,
      },
    });

    if (brotherConfig.directEnabled && fs.existsSync(directPrintPython)) {
      fs.writeFileSync(
        directConfigPath,
        JSON.stringify({
          png_path: pngPath,
          model: brotherConfig.directModel,
          label: brotherConfig.directLabel,
          printer_identifier: brotherConfig.directIdentifier,
          backend: brotherConfig.directBackend,
          rotate: "0",
          threshold: 70.0,
          dither: false,
          compress: false,
          dpi_600: false,
          hq: true,
          cut: true,
        })
      );

      try {
        execFileSync(archBin, ["-arm64", directPrintPython, directPrintHelper, directConfigPath], {
          stdio: "pipe",
        });
        fs.writeFileSync(
          path.join(renderedDir, `${baseName}-direct-ok.txt`),
          "direct brother print succeeded\n",
          "utf8"
        );
        printedFiles.push(pngPath);
        continue;
      } catch (directError) {
        const directMessage =
          directError && directError.stderr
            ? directError.stderr.toString("utf8")
            : String(directError.message || directError);
        fs.writeFileSync(
          path.join(renderedDir, `${baseName}-direct-error.txt`),
          directMessage,
          "utf8"
        );
      }
    }

    ensureBrotherQueue();
    execFileSync(
      "/usr/bin/lp",
      [
        "-d",
        brotherConfig.queueName,
        "-o",
        "PageSize=62mm",
        "-o",
        "CutMedia=Auto",
        "-o",
        `media=${brotherConfig.media}`,
        "-o",
        "print-color-mode=monochrome",
        "-o",
        job.spec.orientation === "landscape"
          ? "orientation-requested=4"
          : "orientation-requested=3",
        pngPath,
      ],
      { stdio: "pipe" }
    );
    fs.writeFileSync(
      path.join(renderedDir, `${baseName}-cups-fallback.txt`),
      "printed via cups fallback\n",
      "utf8"
    );
    printedFiles.push(pngPath);
  }

  return printedFiles;
}

module.exports = {
  printLabel,
};
