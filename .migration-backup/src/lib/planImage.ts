const MAX_PLAN_EDGE = 2200;
const JPEG_QUALITY = 0.92;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Impossible de charger l'image du plan"));
    image.src = src;
  });
}

async function renderOptimizedImage(src: string): Promise<string> {
  const image = await loadImage(src);
  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > MAX_PLAN_EDGE ? MAX_PLAN_EDGE / longestEdge : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponible pour préparer le plan");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function optimizePlanImage(imageData: string): Promise<string> {
  return renderOptimizedImage(imageData);
}

export async function readAndOptimizeImageFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await renderOptimizedImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}