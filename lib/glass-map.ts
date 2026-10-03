/** Rounded-rectangle lens field. The flat reading area stays neutral; refraction lives in the rim. */
export function glassMap(width: number, height: number, radius: number, bezel = 12): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 180_000) {
    throw new RangeError("Glass maps must fit the bounded rendering budget.");
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  const r = Math.max(1, Math.min(radius, width / 2, height / 2));
  const edge = Math.max(1, Math.min(bezel, r));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = x + .5 - width / 2, dy = y + .5 - height / 2;
    const qx = Math.abs(dx) - (width / 2 - r), qy = Math.abs(dy) - (height / 2 - r);
    const ax = Math.max(qx, 0), ay = Math.max(qy, 0), length = Math.hypot(ax, ay);
    const distance = -(length + Math.min(Math.max(qx, qy), 0) - r);
    let red = 128, green = 128;
    if (distance > 0 && distance < edge) {
      const nx = length ? ax / length * Math.sign(dx) : qx > qy ? Math.sign(dx) : 0;
      const ny = length ? ay / length * Math.sign(dy) : qy >= qx ? Math.sign(dy) : 0;
      const t = Math.max(.015, Math.min(.985, distance / edge));
      const shape = Math.pow(1 - Math.pow(1 - t, 4), .25);
      const slope = 4 / edge * Math.pow(1 - t, 3) / Math.pow(shape, 3);
      const incidence = Math.atan(slope);
      const refraction = Math.asin(Math.sin(incidence) / 1.45);
      const displacement = Math.min(1, shape * Math.tan(incidence - refraction));
      red += Math.round(nx * displacement * 127);
      green += Math.round(ny * displacement * 127);
    }
    const i = (y * width + x) * 4;
    pixels[i] = red; pixels[i + 1] = green; pixels[i + 2] = 128; pixels[i + 3] = 255;
  }
  return pixels;
}

export function glassMapSize(width: number, height: number) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) return null;
  // Large scrolling sheets use the CSS material, never a raster filter.
  if (height > 240 || width * height > 240_000) return null;
  const scale = Math.min(1, 720 / width, 180 / height, Math.sqrt(180_000 / (width * height)));
  return { width:Math.max(1, Math.round(width * scale)), height:Math.max(1, Math.round(height * scale)), scale };
}
