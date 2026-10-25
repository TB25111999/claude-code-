// Barcode-Scanner über die Kamera. Nutzt die native BarcodeDetector-API (Chrome/Android) und
// fällt sonst (z. B. iOS Safari, Firefox) auf die mitgelieferte ZXing-Bibliothek zurück.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

let zxingLoading;
function loadZXing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/zxing.min.js', import.meta.url).href;
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Scanner-Bibliothek konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return zxingLoading;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
}

function zxingHints(ZXing) {
  const hints = new Map();
  const F = ZXing.BarcodeFormat;
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return hints;
}

/**
 * Startet den Live-Scan im übergebenen <video>-Element.
 * Gibt ein Objekt mit stop() und toggleTorch() zurück; onResult wird genau einmal mit dem Code aufgerufen.
 */
export async function startScanner(video, onResult) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Dein Browser erlaubt keinen Kamerazugriff (HTTPS erforderlich).');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  let stopped = false;
  let done = false;
  const finish = (code) => {
    if (done || stopped) return;
    done = true;
    onResult(code);
  };

  const detector = await nativeDetector();
  let zxingReader;
  if (detector) {
    const loop = async () => {
      if (stopped || done) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes.length) return finish(codes[0].rawValue);
        }
      } catch { /* einzelner Frame fehlgeschlagen – weiter versuchen */ }
      setTimeout(loop, 120);
    };
    loop();
  } else {
    const ZXing = await loadZXing();
    zxingReader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing), 150);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const loop = () => {
      if (stopped || done) return;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const lum = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
          const bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lum));
          const res = zxingReader.decodeBitmap(bmp);
          if (res) return finish(res.getText());
        }
      } catch { /* kein Code im Bild */ }
      setTimeout(loop, 150);
    };
    loop();
  }

  const track = stream.getVideoTracks()[0];
  let torch = false;
  return {
    stop() {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
    get torchSupported() {
      return !!track?.getCapabilities?.().torch;
    },
    async toggleTorch() {
      torch = !torch;
      await track.applyConstraints({ advanced: [{ torch }] });
      return torch;
    },
  };
}

/** Barcode aus einem Foto (Datei) lesen – Fallback, falls der Live-Scan nicht klappt. */
export async function scanImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const detector = await nativeDetector();
    if (detector) {
      const codes = await detector.detect(img);
      if (codes.length) return codes[0].rawValue;
    }
    const ZXing = await loadZXing();
    const reader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing));
    const res = await reader.decodeFromImageElement(img);
    return res.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
