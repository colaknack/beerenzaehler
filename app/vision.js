/*
 * Beerenzaehler -- Bildverarbeitung, laeuft vollstaendig im Browser.
 *
 * Verfahren: Fast Radial Symmetry Transform. Beeren sind nahezu gleich grosse
 * Kreise; die FRST reagiert auf Kreissymmetrie statt auf Farbe. Dadurch ist die
 * Erkennung unabhaengig von gruenen, blauen, rose oder mischfarbigen Beeren und
 * weitgehend unempfindlich gegen Schlagschatten, da ein Schatten keine
 * geschlossene Radialsymmetrie besitzt.
 *
 * Der Beerenradius ist eine Konstante des Aufbaus (Stativ, gleiche Hoehe,
 * gleiche Platte). Er kommt als Vorgabewert aus der Bildgroesse und wird ueber
 * den Schieber je Sorte gespeichert. Automatische Schaetzer aus dem Bild wurden
 * geprueft und verworfen, siehe suggestRadius().
 *
 * Kein Framework, keine Module -- laeuft auch per Doppelklick von file:// .
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- Basics --

  function toGray(rgba, n) {
    const g = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    }
    return g;
  }

  function satVal(rgba, n) {
    const S = new Uint8Array(n), V = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      V[i] = mx;
      S[i] = mx === 0 ? 0 : ((mx - mn) * 255 / mx) | 0;
    }
    return { S: S, V: V };
  }

  function percentile(arr, q) {
    const hist = new Int32Array(256);
    for (let i = 0; i < arr.length; i++) hist[arr[i]]++;
    const target = q * arr.length;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  }

  /* Otsu mit drei Klassen; liefert die untere Schwelle. Bei Hintergrund,
     Schatten und Beere trennt erst die untere Schwelle sinnvoll ab. */
  function otsu3Low(hist) {
    let total = 0, sum = 0;
    for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
    if (!total) return 128;
    const cw = new Float64Array(257), cs = new Float64Array(257);
    for (let i = 0; i < 256; i++) { cw[i + 1] = cw[i] + hist[i]; cs[i + 1] = cs[i] + i * hist[i]; }
    const m = function (a, b) { return cw[b] - cw[a]; };
    const s = function (a, b) { return cs[b] - cs[a]; };
    let best = -1, bt = 85;
    for (let t1 = 1; t1 < 254; t1++) {
      const w0 = m(0, t1); if (w0 <= 0) continue;
      const m0 = s(0, t1) / w0;
      for (let t2 = t1 + 1; t2 < 255; t2++) {
        const w1 = m(t1, t2), w2 = m(t2, 256);
        if (w1 <= 0 || w2 <= 0) continue;
        const m1 = s(t1, t2) / w1, m2 = s(t2, 256) / w2;
        const mu = sum / total;
        const v = w0 * (m0 - mu) * (m0 - mu) + w1 * (m1 - mu) * (m1 - mu) +
                  w2 * (m2 - mu) * (m2 - mu);
        if (v > best) { best = v; bt = t1; }
      }
    }
    return bt;
  }

  // ------------------------------------------------------------ Morphologie --

  /* Chamfer-Distanztransformation (3-4). dist[i] = Abstand zum naechsten
     Nullpixel. Damit lassen sich Erosion und Dilatation mit grossem Radius
     in linearer Zeit ausdruecken. */
  function distTransform(mask, w, h) {
    const INF = 1e9, d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x; if (d[i] === 0) continue;
        let v = d[i];
        if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); }
        if (x > 0) v = Math.min(v, d[i - 1] + 3);
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x; if (d[i] === 0) continue;
        let v = d[i];
        if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); }
        if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
        d[i] = v;
      }
    }
    for (let i = 0; i < d.length; i++) d[i] /= 3;
    return d;
  }

  function erode(mask, w, h, r) {
    const d = distTransform(mask, w, h), out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i] > r ? 1 : 0;
    return out;
  }

  function dilate(mask, w, h, r) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
    const d = distTransform(inv, w, h), out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i] <= r ? 1 : 0;
    return out;
  }

  function closing(mask, w, h, r) { return erode(dilate(mask, w, h, r), w, h, r); }

  /* Groesste zusammenhaengende Flaeche, bevorzugt die um die Bildmitte. */
  function mainComponent(mask, w, h) {
    const lab = new Int32Array(w * h).fill(-1);
    const stack = new Int32Array(w * h);
    let best = -1, bestSize = 0, centreLabel = -1, id = 0;
    const cIdx = ((h >> 1) * w) + (w >> 1);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || lab[start] >= 0) continue;
      let sp = 0, size = 0; stack[sp++] = start; lab[start] = id;
      while (sp > 0) {
        const i = stack[--sp]; size++;
        const x = i % w, y = (i / w) | 0;
        if (x > 0 && mask[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - w] && lab[i - w] < 0) { lab[i - w] = id; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && lab[i + w] < 0) { lab[i + w] = id; stack[sp++] = i + w; }
      }
      if (size > bestSize) { bestSize = size; best = id; }
      id++;
    }
    if (lab[cIdx] >= 0) centreLabel = lab[cIdx];
    const pick = centreLabel >= 0 ? centreLabel : best;
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = lab[i] === pick ? 1 : 0;
    return out;
  }

  /* Loecher schliessen: alles, was vom Bildrand aus nicht erreichbar ist. */
  function fillHoles(mask, w, h) {
    const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
    let sp = 0;
    const push = function (i) { if (!mask[i] && !seen[i]) { seen[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp > 0) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = (mask[i] || !seen[i]) ? 1 : 0;
    return out;
  }

  // ------------------------------------------------------------- Filter ------

  function boxBlur(src, w, h, r) {
    if (r < 1) return src.slice();
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / win;
        acc -= src[row + Math.min(w - 1, Math.max(0, x - r))];
        acc += src[row + Math.min(w - 1, Math.max(0, x + r + 1))];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / win;
        acc -= tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x];
        acc += tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
      }
    }
    return out;
  }

  /* Drei Box-Durchlaeufe naehern eine Gaussfunktion hinreichend genau an. */
  function gauss(src, w, h, sigma) {
    const r = Math.max(1, Math.round(sigma * 1.2));
    let o = boxBlur(src, w, h, r);
    o = boxBlur(o, w, h, r);
    return boxBlur(o, w, h, r);
  }

  /* Gleitendes Extremum mit monotoner Deque: O(n) unabhaengig von der
     Fenstergroesse. sign=+1 liefert das Maximum, sign=-1 das Minimum. */
  function rankFilter(src, w, h, r, sign) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const dq = new Int32Array(Math.max(w, h) + 1);
    for (let y = 0; y < h; y++) {
      let head = 0, tail = 0; const row = y * w;
      for (let i = 0; i < w + r; i++) {
        if (i < w) {
          const v = src[row + i] * sign;
          while (tail > head && src[row + dq[tail - 1]] * sign <= v) tail--;
          dq[tail++] = i;
        }
        const c = i - r;
        if (c >= 0 && c < w) {
          while (dq[head] < c - r) head++;
          tmp[row + c] = src[row + dq[head]];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      let head = 0, tail = 0;
      for (let i = 0; i < h + r; i++) {
        if (i < h) {
          const v = tmp[i * w + x] * sign;
          while (tail > head && tmp[dq[tail - 1] * w + x] * sign <= v) tail--;
          dq[tail++] = i;
        }
        const c = i - r;
        if (c >= 0 && c < h) {
          while (dq[head] < c - r) head++;
          out[c * w + x] = tmp[dq[head] * w + x];
        }
      }
    }
    return out;
  }

  function maxFilter(src, w, h, r) { return rankFilter(src, w, h, r, 1); }
  function minFilter(src, w, h, r) { return rankFilter(src, w, h, r, -1); }

  // --------------------------------------------------------------- Schale ----

  /* Helligkeitsschwelle per Otsu, gerechnet nur ueber die unbunten Bildteile.
     Eine feste Prozentschwelle hat auf einer hellen Arbeitsplatte auch den
     Untergrund mitgenommen; der Schalenrand lieferte dann Scheinbeeren. Otsu
     trennt Schale und Untergrund dagegen an der tatsaechlichen Luecke im
     Histogramm. Der Faktor 0.9 gibt etwas Luft fuer abgeschattete Schalenecken. */
  function otsuV(S, V, n) {
    const hist = new Int32Array(256);
    let tot = 0;
    for (let i = 0; i < n; i++) if (S[i] < 80) { hist[V[i]]++; tot++; }
    if (!tot) return 128;
    let sum = 0;
    for (let v = 0; v < 256; v++) sum += v * hist[v];
    let wB = 0, sB = 0, best = -1, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = tot - wB;
      if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return thr;
  }

  function trayFrom(sv, w, h, thrV) {
    const n = w * h;
    const cand = new Uint8Array(n);
    for (let i = 0; i < n; i++) cand[i] = (sv.S[i] < 80 && sv.V[i] > thrV) ? 1 : 0;
    const mn = Math.min(w, h);
    let m = closing(cand, w, h, Math.max(2, mn * 0.012));
    m = mainComponent(m, w, h);
    m = fillHoles(m, w, h);
    m = erode(m, w, h, mn * 0.018);
    let a = 0;
    for (let i = 0; i < n; i++) a += m[i];
    return { mask: m, frac: a / n };
  }

  /* Groesstes einbeschriebenes achsparalleles Rechteck (Histogramm-Verfahren).
     Die Schale ist rechteckig; helle Stellen auf der Arbeitsplatte, die per
     Helligkeit mit in die Maske geraten, sind es nicht. Das Rechteck schneidet
     diese Auslaeufer ab, ohne die Schale selbst zu beschneiden. */
  function largestRect(mask, w, h) {
    const height = new Int32Array(w);
    const stack = new Int32Array(w + 1);
    let best = 0, bx0 = 0, by0 = 0, bx1 = w - 1, by1 = h - 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) height[x] = mask[row + x] ? height[x] + 1 : 0;
      let sp = 0;
      for (let i = 0; i <= w; i++) {
        const cur = i < w ? height[i] : 0;
        while (sp > 0 && height[stack[sp - 1]] >= cur) {
          const top = stack[--sp];
          const left = sp === 0 ? 0 : stack[sp - 1] + 1;
          const area = height[top] * (i - left);
          if (area > best) {
            best = area; bx0 = left; bx1 = i - 1;
            by1 = y; by0 = y - height[top] + 1;
          }
        }
        stack[sp++] = i;
      }
    }
    return { x0: bx0, y0: by0, x1: bx1, y1: by1, area: best };
  }

  function findTray(rgba, w, h) {
    const n = w * h, sv = satVal(rgba, n);
    const a = trayFrom(sv, w, h, otsuV(sv.S, sv.V, n) * 0.88);
    // Rueckfall: Otsu trennt Schale und Untergrund normalerweise sauber, kann
    // aber bei ungleichmaessigem Licht in die Schale hineinschneiden. Die Schale
    // fuellt das Bild immer weitgehend aus -- faellt die Maske klein aus, ist die
    // Schwelle zu hoch. Dann gilt wieder die alte, mildere Schwelle.
    let m = a.mask;
    if (a.frac < 0.25) {
      const b = trayFrom(sv, w, h, percentile(sv.V, 0.60) * 0.55);
      if (b.frac > a.frac) m = b.mask;
    }
    // Auf das einbeschriebene Rechteck begrenzen, mit Zugabe fuer eine leicht
    // schraeg liegende Schale.
    const r = largestRect(m, w, h);
    const pad = Math.round(Math.min(w, h) * 0.033);
    const x0 = r.x0 - pad, x1 = r.x1 + pad, y0 = r.y0 - pad, y1 = r.y1 + pad;
    for (let y = 0; y < h; y++) {
      const inY = y >= y0 && y <= y1;
      for (let x = 0; x < w; x++) {
        if (!inY || x < x0 || x > x1) m[y * w + x] = 0;
      }
    }
    return m;
  }

  // ------------------------------------------------------- Beerenkennwerte ---

  /* Log-Chromatizitaet: Schatten wirken multiplikativ und verschwinden dadurch
     vollstaendig. Zusaetzlich Helligkeitsverhaeltnis gegen den lokalen
     Hintergrund, um sehr dunkle Beeren und Glanzlichter mitzunehmen. */
  function berryFeatures(rgba, w, h, tray) {
    const n = w * h;
    const d = new Float32Array(n);
    const lr = new Float32Array(n), lg = new Float32Array(n), lb = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const a = Math.log(rgba[p] + 8), b = Math.log(rgba[p + 1] + 8), c = Math.log(rgba[p + 2] + 8);
      const m = (a + b + c) / 3;
      lr[i] = a - m; lg[i] = b - m; lb[i] = c - m;
    }
    const sr = [], sg = [], sb = [];
    for (let i = 0; i < n; i += 7) if (tray[i]) { sr.push(lr[i]); sg.push(lg[i]); sb.push(lb[i]); }
    const med = function (a) { a.sort(function (x, y) { return x - y; }); return a.length ? a[a.length >> 1] : 0; };
    const br = med(sr), bg = med(sg), bb = med(sb);
    let dmax = 1e-6;
    for (let i = 0; i < n; i++) {
      const x = lr[i] - br, y = lg[i] - bg, z = lb[i] - bb;
      d[i] = Math.sqrt(x * x + y * y + z * z);
      if (tray[i] && d[i] > dmax) dmax = d[i];
    }
    const gray = toGray(rgba, n);
    // Beleuchtungsfeld = Grauwert-Closing (erst Maximum, dann Minimum) mit
    // einem Fenster deutlich groesser als eine Beere. Nur zu dilatieren wuerde
    // den Hintergrund zu hell schaetzen und die Maske aufblaehen.
    const kk = Math.max(15, Math.round(Math.min(w, h) * 0.045));
    const bgV = gauss(minFilter(maxFilter(gray, w, h, kk), w, h, kk), w, h, kk / 2);
    const ratio = new Float32Array(n);
    for (let i = 0; i < n; i++) ratio[i] = gray[i] / Math.max(bgV[i], 1);
    return { d: d, dmax: dmax, ratio: ratio, gray: gray };
  }

  /* Zwei unabhaengige Merkmale: Farbabweichung und Verdunklung gegenueber dem
     Schalengrund. Beide Schwellen kommen aus einem Otsu mit drei Klassen, damit
     der Schatten als eigene Klasse abgetrennt wird.
     Genommen wird das Merkmal mit der KLEINEREN Flaeche: Das jeweils schwaechere
     Merkmal schleppt regelmaessig Schatten mit und faellt dadurch groesser aus.
     Bei hellen gruenen Beeren gewinnt so die Farbe, bei dunkelblauen die
     Helligkeit -- ohne dass die Beerenfarbe irgendwo vorgegeben waere. */
  function berryMask(f, tray, n) {
    const hd = new Int32Array(256), hr = new Int32Array(256);
    for (let i = 0; i < n; i++) {
      if (!tray[i]) continue;
      hd[Math.min(255, (f.d[i] / f.dmax * 255) | 0)]++;
      hr[Math.min(255, (f.ratio[i] * 180) | 0)]++;
    }
    const td = otsu3Low(hd) / 255 * f.dmax, tr = otsu3Low(hr) / 180;
    let ac = 0, ad = 0;
    for (let i = 0; i < n; i++) {
      if (!tray[i]) continue;
      const spec = f.ratio[i] > 1.18;               // Glanzlicht gehoert zur Beere
      if (f.d[i] > td || spec) ac++;
      if (f.ratio[i] < tr || spec) ad++;
    }
    const useChroma = ac <= ad;
    const m = new Uint8Array(n);
    let area = 0;
    for (let i = 0; i < n; i++) {
      if (!tray[i]) continue;
      const spec = f.ratio[i] > 1.18;
      const on = useChroma ? (f.d[i] > td || spec) : (f.ratio[i] < tr || spec);
      if (on) { m[i] = 1; area++; }
    }
    return { mask: m, area: area, useChroma: useChroma };
  }

  // ----------------------------------------------------------------- FRST ----

  function frst(gray, w, h, radii, alpha, beta) {
    const n = w * h;
    // Sobel 3x3. Ein 5x5-Kern wurde geprueft und lieferte deutlich schlechtere
    // Ergebnisse: zusammen mit der Vorglaettung verwischt er die Kontaktstellen
    // zwischen beruehrenden Beeren, die genau das Trennmerkmal sind.
    const gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
    let mmax = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = gray[i - w - 1], b = gray[i - w], c = gray[i - w + 1];
        const dd = gray[i - 1], e = gray[i + 1];
        const g1 = gray[i + w - 1], g2 = gray[i + w], g3 = gray[i + w + 1];
        const vx = (c + 2 * e + g3) - (a + 2 * dd + g1);
        const vy = (g1 + 2 * g2 + g3) - (a + 2 * b + c);
        gx[i] = vx; gy[i] = vy;
        const mg = Math.sqrt(vx * vx + vy * vy);
        mag[i] = mg; if (mg > mmax) mmax = mg;
      }
    }
    const thr = beta * mmax;
    const S = new Float32Array(n);
    for (let k = 0; k < radii.length; k++) {
      const rad = radii[k];
      const O = new Float32Array(n), M = new Float32Array(n);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x, mg = mag[i];
          if (mg <= thr) continue;
          const px = (x - gx[i] / mg * rad + 0.5) | 0;
          const py = (y - gy[i] / mg * rad + 0.5) | 0;
          // Stimmen, die aus dem Bild zeigen, verwerfen statt auf den Rand zu
          // klemmen -- sonst tuermt sich dort ein Ausreisser auf, der die
          // relative Schwelle unbrauchbar macht.
          if (px < 0 || px >= w || py < 0 || py >= h) continue;
          const j = py * w + px;
          O[j] += 1; M[j] += mg;
        }
      }
      let kn = 1;
      for (let i = 0; i < n; i++) if (O[i] > kn) kn = O[i];
      const F = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (O[i] === 0) continue;
        F[i] = Math.pow(O[i] / kn, alpha) * (M[i] / kn);
      }
      const B = gauss(F, w, h, Math.max(0.6, 0.25 * rad));
      for (let i = 0; i < n; i++) S[i] += B[i];
    }
    for (let i = 0; i < n; i++) S[i] /= radii.length;
    return S;
  }

  function nmsPeaks(S, w, h, minDist, thrRel, mask) {
    const r = Math.max(1, Math.round(minDist));
    const mx = maxFilter(S, w, h, r);
    // Bezugsgroesse nur innerhalb der Schale bilden, damit Randeffekte
    // ausserhalb die Schwelle nicht verschieben.
    let smax = 0;
    for (let i = 0; i < S.length; i++) if ((!mask || mask[i]) && S[i] > smax) smax = S[i];
    const lim = thrRel * smax, out = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask && !mask[i]) continue;
        if (S[i] >= mx[i] - 1e-9 && S[i] > lim) out.push({ x: x, y: y, s: S[i] });
      }
    }
    return out;
  }

  /* Verwirft Treffer auf leerer Schale oder auf dem Tisch daneben. */
  function validate(rgba, w, h, f, tray, peaks, r) {
    const n = w * h;
    const samp = [];
    for (let i = 0; i < n; i += 7) if (tray[i]) samp.push(f.d[i]);
    samp.sort(function (a, b) { return a - b; });
    const refD = samp.length ? samp[samp.length >> 1] : 0;
    const rr = Math.max(2, Math.round(r * 0.55));
    const out = [];
    for (let k = 0; k < peaks.length; k++) {
      const p = peaks[k];
      const x0 = Math.max(0, p.x - rr), x1 = Math.min(w, p.x + rr);
      const y0 = Math.max(0, p.y - rr), y1 = Math.min(h, p.y + rr);
      const ds = [], rs = [], hs = [], ss = [], vs = [];
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = y * w + x, q = i * 4;
          ds.push(f.d[i]); rs.push(f.ratio[i]);
          const R = rgba[q], G = rgba[q + 1], B = rgba[q + 2];
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          vs.push(mx); ss.push(mx === 0 ? 0 : (mx - mn) * 255 / mx);
          let hue = 0;
          if (mx !== mn) {
            if (mx === R) hue = 30 * (((G - B) / (mx - mn)) % 6);
            else if (mx === G) hue = 30 * ((B - R) / (mx - mn) + 2);
            else hue = 30 * ((R - G) / (mx - mn) + 4);
            if (hue < 0) hue += 180;
          }
          hs.push(hue);
        }
      }
      const med = function (a) { a.sort(function (u, v) { return u - v; }); return a[a.length >> 1]; };
      const pd = med(ds), pr = med(rs), ph = med(hs), ps = med(ss), pv = med(vs);
      if (ps > 95 && ph >= 8 && ph <= 30 && pv > 140) continue;   // Holzoberflaeche
      if (pd > refD * 1.6 || pr < 0.80) out.push(p);
    }
    return out;
  }

  // ------------------------------------------------------------- Pipeline ----

  /* Gegen fuenf ausgezaehlte Referenzbilder abgestimmt (474 Beeren).
     Die Schwelle wirkt relativ zum staerksten Treffer im Bild. Sie lag bei
     0.030 und war damit zu hoch, sobald dunkle und blasse Beeren gemischt
     auftreten: Die dunklen setzen das Maximum, blassgruene Beeren fallen dann
     unter die Schwelle und fehlen. Bei 0.022 werden sie gefunden, ohne dass
     nennenswert Fehltreffer dazukommen. */
  const CFG = { alpha: 2.0, beta: 0.05, thr: 0.022, nms: 1.10, factors: [0.85, 1.0, 1.15] };

  /* Startwert fuer den Beerenradius, wenn noch nicht kalibriert wurde.
     Bewusst eine feste Groesse statt einer Schaetzung aus dem Bild: Drei
     Verfahren wurden geprueft -- Maskenflaeche je Beere, Kantenprofil und
     Nachbarabstand. Alle drei schwankten auf nahezu gleichen Aufnahmen um mehr
     als ein Drittel, das Nachbarabstandsverfahren schaukelte sich sogar auf.
     Ein Viertelprozent der kurzen Bildkante trifft den Aufbau (Platte formatfuellend
     fotografiert) verlaesslich; Abweichungen davon regelt der Schieber, dessen
     Wert je Sorte gespeichert wird. */
  function suggestRadius(f, tray, n, w, h) {
    return Math.min(w, h) * 0.0233;
  }

  function count(rgba, w, h, opts) {
    const cfg = Object.assign({}, CFG, opts || {});
    const tray = cfg.tray || findTray(rgba, w, h);
    const f = cfg.features || berryFeatures(rgba, w, h, tray);
    const r = cfg.radius || suggestRadius(f, tray, w * h, w, h);

    const radii = cfg.factors.map(function (q) { return Math.max(3, Math.round(r * q)); });
    const S = frst(gauss(f.gray, w, h, Math.max(1, r * 0.06)), w, h, radii, cfg.alpha, cfg.beta);
    const raw = nmsPeaks(S, w, h, r * cfg.nms, cfg.thr, tray);
    const peaks = validate(rgba, w, h, f, tray, raw, r);
    return { peaks: peaks, radius: r, raw: raw.length, tray: tray, features: f };
  }

  const api = {
    count: count, findTray: findTray, frst: frst, nmsPeaks: nmsPeaks, CFG: CFG,
    // fuer Tests und Kalibrierung
    _i: { berryFeatures: berryFeatures, berryMask: berryMask, validate: validate,
          gauss: gauss, maxFilter: maxFilter, distTransform: distTransform,
          otsu3Low: otsu3Low, toGray: toGray }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Vision = api;
})(typeof window !== 'undefined' ? window : globalThis);
