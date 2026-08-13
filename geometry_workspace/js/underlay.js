/**
 * underlay.js — bildeunderlag å tegne oppå.
 *
 * Bildet kan komme fra filvelger, drag & drop, eller lim inn (Ctrl+V) av et
 * skjermutklipp. Selve bildedataen lagres i IndexedDB, ikke localStorage,
 * fordi et skjermbilde fort sprenger localStorage-kvoten. Plasseringen og
 * målestokken ligger derimot i den vanlige modelltilstanden, så den følger
 * angre/gjør om og eksport som alt annet.
 */

const DB_NAME = 'geometry_workspace';
const STORE = 'underlay';
const KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Leser en Blob/File som data-URL. */
function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Laster en data-URL til et ferdig dekodet Image. */
export function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Klarte ikke å lese bildet'));
    img.src = dataUrl;
  });
}

export class UnderlayManager {
  /**
   * @param {(payload: {image: HTMLImageElement, dataUrl: string, name: string}) => void} onImage
   */
  constructor(onImage, onError = () => {}) {
    this.onImage = onImage;
    this.onError = onError;
    this.image = null;
  }

  /** Tar imot en File eller Blob fra filvelger, drop eller utklippstavla. */
  async accept(blob, name = 'bilde') {
    if (!blob || !/^image\//.test(blob.type || '')) {
      this.onError('Fila er ikke et bilde.');
      return null;
    }
    try {
      const dataUrl = await readAsDataURL(blob);
      const image = await loadImage(dataUrl);
      this.image = image;
      await idbPut({ dataUrl, name }).catch(() => {
        /* uten lagring virker bildet fortsatt i denne økta */
      });
      this.onImage({ image, dataUrl, name });
      return image;
    } catch (err) {
      this.onError(`Kunne ikke laste bildet: ${err.message}`);
      return null;
    }
  }

  /** Henter fram bildet fra forrige økt, hvis det finnes. */
  async restore() {
    try {
      const rec = await idbGet();
      if (!rec || !rec.dataUrl) return null;
      const image = await loadImage(rec.dataUrl);
      this.image = image;
      this.onImage({ image, dataUrl: rec.dataUrl, name: rec.name || 'bilde', restored: true });
      return image;
    } catch (err) {
      return null;
    }
  }

  async clear() {
    this.image = null;
    await idbDelete().catch(() => {});
  }

  /**
   * Kobler på drag & drop og lim inn. Returnerer en funksjon som kobler av.
   */
  bind(dropTarget) {
    const onDragOver = (e) => {
      if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        dropTarget.dataset.dropActive = 'true';
      }
    };
    const onDragLeave = () => delete dropTarget.dataset.dropActive;
    const onDrop = (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      e.preventDefault();
      delete dropTarget.dataset.dropActive;
      const file = [...files].find((f) => /^image\//.test(f.type));
      if (file) this.accept(file, file.name);
      else this.onError('Slipp en bildefil (PNG, JPG, …).');
    };
    const onPaste = (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && /^image\//.test(item.type)) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            this.accept(blob, 'utklipp');
            return;
          }
        }
      }
    };

    dropTarget.addEventListener('dragover', onDragOver);
    dropTarget.addEventListener('dragleave', onDragLeave);
    dropTarget.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);

    return () => {
      dropTarget.removeEventListener('dragover', onDragOver);
      dropTarget.removeEventListener('dragleave', onDragLeave);
      dropTarget.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }
}

/**
 * Standard plassering av et nytt bilde: sentrert i gjeldende utsnitt, skalert
 * til å dekke omtrent halve høyden. Målestokken settes riktig etterpå med
 * to-punkts kalibrering.
 */
export function defaultPlacement(image, view) {
  const aspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
  const height = view.viewHeight * 0.5;
  const width = height * aspect;
  return {
    x: view.center.x,
    y: view.center.y,
    width,
    height,
    rotation: 0,
    opacity: 0.65,
    visible: true,
    locked: false,
  };
}
