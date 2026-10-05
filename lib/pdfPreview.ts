"use client";

let workerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");

  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }

  return pdfjs;
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        canvas.toBlob(
          (fallback) => {
            if (fallback) resolve(fallback);
            else reject(new Error("Could not create PDF preview."));
          },
          "image/png",
        );
      },
      "image/webp",
      0.9,
    );
  });
}

export async function renderPdfFirstPage(pdfBlob: Blob) {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });

  try {
    const pdfDocument = await loadingTask.promise;
    const page = await pdfDocument.getPage(1);
    try {
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 1200;
        const scale = Math.min(2.5, Math.max(1, targetWidth / baseViewport.width));
        const viewport = page.getViewport({ scale });

        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("PDF preview canvas is unavailable.");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas,
          viewport,
        }).promise;

        return await canvasToBlob(canvas);
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
