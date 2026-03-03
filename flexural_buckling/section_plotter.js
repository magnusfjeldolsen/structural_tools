/**
 * Section Plotter Module
 * Visualizes steel cross-sections with Class 4 effective properties.
 * Supports: IPE, HEA, HEB, HEM (I/H sections) and HRHS, HSHS, CRHS, CSHS (hollow sections)
 *
 * @requires HTML5 Canvas API
 * @requires Section object with appropriate geometry properties
 */

const SectionPlotter = (function () {
  'use strict';

  const DEFAULT_OPTIONS = {
    canvasWidth: 600,
    canvasHeight: 400,
    padding: 55,
    grossColor: '#93C5FD',      // Light blue
    grossStroke: '#1E40AF',     // Dark blue outline
    strokeWidth: 1.5,
    removedColor: '#EF4444',    // Red
    removedAlpha: 0.65,
    hatchRemoved: true,
    hatchSpacing: 4,            // mm in section coords
    showLegend: true,
    legendPosition: 'top-right',
    backgroundColor: '#1F2937', // Dark background to match UI
    profileType: null,
    sectionName: ''
  };

  /**
   * Detect section type from geometry properties
   * @param {Object} section - Section object
   * @returns {string} 'i-section', 'rhs', 'shs', or 'chs'
   */
  function _detectSectionType(section) {
    // I/H sections have: h, b, tw, tf
    if (section.tw && section.tf) {
      return 'i-section';
    }
    // Circular sections have: D (diameter) and t
    if (section.D && section.t) {
      return 'chs';
    }
    // Hollow sections have: t (uniform thickness), and either h+b or just b
    if (section.t) {
      // Square: only b (h = b implicitly)
      if (!section.h || section.h === section.b) {
        return 'shs';
      }
      // Rectangular: h !== b
      return 'rhs';
    }
    // Fallback to I-section
    return 'i-section';
  }

  /**
   * Main public API
   * @param {string} canvasId - Canvas element ID
   * @param {Object} section - Section from steelDatabase
   * @param {Object|null} effectiveProperties - Result from calculateClass4EffectiveProperties, or null
   * @param {Object} options - Plot options (merged with defaults)
   * @returns {Object} Metadata: { scale, canvasWidth, canvasHeight }
   */
  function plot(canvasId, section, effectiveProperties, options) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error('[SectionPlotter] Canvas not found:', canvasId);
      return null;
    }

    // Detect section type
    const sectionType = _detectSectionType(section);

    // Validate required properties based on type
    if (sectionType === 'i-section') {
      if (!section || !section.h || !section.b) {
        console.error('[SectionPlotter] I-section missing h or b:', section);
        return null;
      }
    } else if (sectionType === 'chs') {
      if (!section || !section.D || !section.t) {
        console.error('[SectionPlotter] CHS missing D or t:', section);
        return null;
      }
    } else {
      // RHS/SHS need at least b and t
      if (!section || !section.b || !section.t) {
        console.error('[SectionPlotter] Hollow section missing b or t:', section);
        return null;
      }
    }

    // For SHS: set h = b if not present
    const sectionWithDefaults = { ...section };
    if (sectionType === 'shs' && !sectionWithDefaults.h) {
      sectionWithDefaults.h = sectionWithDefaults.b;
    }

    // Set canvas pixel dimensions
    canvas.width = opts.canvasWidth;
    canvas.height = opts.canvasHeight;

    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pre-compute hasClass4 so legend height is known before layout
    const hasClass4 = !!(effectiveProperties &&
      effectiveProperties.is_effective &&
      effectiveProperties.removed_strips &&
      effectiveProperties.removed_strips.length > 0);

    // Legend height (must stay in sync with _drawLegend constants)
    const _ITEM_H = 28, _LEG_PAD = 12;
    const numLegendItems = opts.showLegend ? (hasClass4 ? 2 : 1) : 0;
    const legendBoxH = numLegendItems > 0 ? numLegendItems * _ITEM_H + 2 * _LEG_PAD : 0;

    // Asymmetric padding: extra left for breathing room; top reserves space for legend
    const padLeft   = opts.padding + 35;
    const padRight  = opts.padding;
    const padTop    = legendBoxH > 0
      ? Math.max(opts.padding, legendBoxH + 15)
      : opts.padding;
    const padBottom = opts.padding;

    // Calculate scale: fit section within the available plot area
    const availW = canvas.width  - padLeft  - padRight;
    const availH = canvas.height - padTop   - padBottom;

    // Determine section dimensions based on type
    let sectionWidth, sectionHeight;
    if (sectionType === 'chs') {
      sectionWidth = sectionWithDefaults.D;
      sectionHeight = sectionWithDefaults.D;
    } else {
      sectionWidth = sectionWithDefaults.b;
      sectionHeight = sectionWithDefaults.h;
    }

    const scale = Math.min(availW / sectionWidth, availH / sectionHeight);

    // Transform to section coordinate space (origin at section centre, Y up)
    ctx.save();
    ctx.translate(padLeft + availW / 2, padTop + availH / 2);
    ctx.scale(scale, -scale);

    // Draw gross section based on type
    if (sectionType === 'i-section') {
      _drawISection(ctx, sectionWithDefaults, opts, scale);
    } else if (sectionType === 'chs') {
      _drawCHSSection(ctx, sectionWithDefaults, opts, scale);
    } else {
      _drawHollowSection(ctx, sectionWithDefaults, opts, scale);
    }

    // Draw removed strips (if Class 4)
    if (effectiveProperties && effectiveProperties.is_effective) {
      if (sectionType === 'chs') {
        _drawCHSEffectiveWall(ctx, sectionWithDefaults, effectiveProperties, opts, scale);
      } else if (effectiveProperties.removed_strips) {
        _drawRemovedStrips(ctx, effectiveProperties.removed_strips, opts, scale);
      }
    }

    ctx.restore();

    // Draw section name label
    _drawSectionLabel(ctx, sectionWithDefaults, opts, canvas);

    // Draw legend in the reserved top strip (pass padTop so it can centre itself there)
    _drawLegend(ctx, sectionWithDefaults, effectiveProperties, opts, canvas, hasClass4, padTop);

    console.log('[SectionPlotter] Plotted', sectionWithDefaults.profile || opts.sectionName,
      'type=', sectionType, 'scale=', scale.toFixed(2), 'px/mm');

    return { scale, canvasWidth: canvas.width, canvasHeight: canvas.height };
  }

  /**
   * Draw gross I-section as outline polygon (top flange + web + bottom flange)
   * Context must be in section coordinate space.
   */
  function _drawISection(ctx, section, opts, scale) {
    const h = section.h;
    const b = section.b;
    const tw = section.tw;
    const tf = section.tf;
    const r = section.r || 0;   // fillet radius (mm); 0 = sharp corners

    const h2 = h / 2;
    const b2 = b / 2;
    const tw2 = tw / 2;
    const webTop = h2 - tf;      // y-coordinate where web meets flange (inner face)

    // Draw as single I-shape polygon for clean outline
    ctx.fillStyle = opts.grossColor;
    ctx.strokeStyle = opts.grossStroke;
    ctx.lineWidth = opts.strokeWidth / scale;
    ctx.lineJoin = 'miter';

    ctx.beginPath();

    // Top-left corner of top flange, going clockwise (in section coords, Y up)
    ctx.moveTo(-b2, h2);
    ctx.lineTo(b2, h2);
    ctx.lineTo(b2, webTop);

    // → Arrive on flange bottom going LEFT. Fillet at top-right web junction.
    ctx.lineTo(tw2 + r, webTop);
    ctx.arcTo(tw2, webTop, tw2, webTop - r, r);   // corner: (tw2, webTop) → going DOWN

    // Web right side → fillet at bottom-right web junction
    ctx.lineTo(tw2, -(webTop - r));
    ctx.arcTo(tw2, -webTop, tw2 + r, -webTop, r); // corner: (tw2, -webTop) → going RIGHT

    ctx.lineTo(b2, -webTop);
    ctx.lineTo(b2, -h2);
    ctx.lineTo(-b2, -h2);
    ctx.lineTo(-b2, -webTop);

    // → Arrive on bottom flange top going RIGHT. Fillet at bottom-left web junction.
    ctx.lineTo(-tw2 - r, -webTop);
    ctx.arcTo(-tw2, -webTop, -tw2, -webTop + r, r); // corner: (-tw2, -webTop) → going UP

    // Web left side → fillet at top-left web junction
    ctx.lineTo(-tw2, webTop - r);
    ctx.arcTo(-tw2, webTop, -tw2 - r, webTop, r);  // corner: (-tw2, webTop) → going LEFT

    ctx.lineTo(-b2, webTop);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();
  }

  /**
   * Draw hollow section (RHS or SHS) as rectangular tube
   * Context must be in section coordinate space.
   */
  function _drawHollowSection(ctx, section, opts, scale) {
    const h = section.h;
    const b = section.b;
    const t = section.t;  // Uniform wall thickness
    const ro = section.ro || section.r || 0;  // Outer corner radius
    const ri = section.ri || 0;  // Inner corner radius (usually ro - t)

    const h2 = h / 2;
    const b2 = b / 2;
    const h2i = h2 - t;  // Inner height half
    const b2i = b2 - t;  // Inner width half

    ctx.fillStyle = opts.grossColor;
    ctx.strokeStyle = opts.grossStroke;
    ctx.lineWidth = opts.strokeWidth / scale;
    ctx.lineJoin = 'round';

    // Draw outer rectangle
    ctx.beginPath();
    if (ro > 0) {
      // Rounded outer corners
      ctx.moveTo(-b2 + ro, h2);
      ctx.lineTo(b2 - ro, h2);
      ctx.arcTo(b2, h2, b2, h2 - ro, ro);
      ctx.lineTo(b2, -h2 + ro);
      ctx.arcTo(b2, -h2, b2 - ro, -h2, ro);
      ctx.lineTo(-b2 + ro, -h2);
      ctx.arcTo(-b2, -h2, -b2, -h2 + ro, ro);
      ctx.lineTo(-b2, h2 - ro);
      ctx.arcTo(-b2, h2, -b2 + ro, h2, ro);
    } else {
      // Sharp outer corners
      ctx.rect(-b2, -h2, b, h);
    }
    ctx.closePath();

    // Draw inner rectangle (hole) - reverse winding for proper fill
    ctx.moveTo(-b2i + ri, h2i);
    if (ri > 0) {
      // Rounded inner corners
      ctx.lineTo(-b2i, h2i - ri);
      ctx.arcTo(-b2i, h2i, -b2i + ri, h2i, ri);
      ctx.lineTo(b2i - ri, h2i);
      ctx.arcTo(b2i, h2i, b2i, h2i - ri, ri);
      ctx.lineTo(b2i, -h2i + ri);
      ctx.arcTo(b2i, -h2i, b2i - ri, -h2i, ri);
      ctx.lineTo(-b2i + ri, -h2i);
      ctx.arcTo(-b2i, -h2i, -b2i, -h2i + ri, ri);
      ctx.lineTo(-b2i, h2i - ri);
    } else {
      // Sharp inner corners - counter-clockwise for hole
      ctx.lineTo(-b2i, -h2i);
      ctx.lineTo(b2i, -h2i);
      ctx.lineTo(b2i, h2i);
      ctx.lineTo(-b2i, h2i);
    }
    ctx.closePath();

    ctx.fill('evenodd');  // Use even-odd fill rule for the hole
    ctx.stroke();
  }

  /**
   * Draw circular hollow section (CHS) as concentric circles
   * Context must be in section coordinate space.
   */
  function _drawCHSSection(ctx, section, opts, scale) {
    const D = section.D;          // Outer diameter
    const t = section.t;          // Wall thickness
    const R = D / 2;              // Outer radius
    const Ri = R - t;             // Inner radius

    ctx.fillStyle = opts.grossColor;
    ctx.strokeStyle = opts.grossStroke;
    ctx.lineWidth = opts.strokeWidth / scale;

    // Draw outer circle
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, 2 * Math.PI);

    // Draw inner circle (hole) - reverse winding
    ctx.arc(0, 0, Ri, 0, 2 * Math.PI, true);
    ctx.closePath();

    ctx.fill('evenodd');  // Use even-odd fill rule for the hole
    ctx.stroke();

    // Also stroke inner circle for clarity
    ctx.beginPath();
    ctx.arc(0, 0, Ri, 0, 2 * Math.PI);
    ctx.stroke();
  }

  /**
   * Draw CHS effective wall (Class 4) as reduced thickness visualization
   * For CHS, rho reduction means effective wall thickness is reduced
   * Context must be in section coordinate space.
   */
  function _drawCHSEffectiveWall(ctx, section, effectiveProperties, opts, scale) {
    // Check if CHS has uniform reduction
    const plateReduction = effectiveProperties.plate_reductions?.find(
      pr => pr.element === 'circular_wall'
    );

    if (!plateReduction || plateReduction.rho >= 1.0) {
      return;  // No reduction
    }

    const D = section.D;
    const t = section.t;
    const rho = plateReduction.rho;

    // Effective thickness
    const t_eff = rho * t;
    const t_removed = t - t_eff;

    // Draw removed thickness band (on inner face - wall gets thinner)
    const R = D / 2;
    const Ri = R - t;
    const R_eff_inner = Ri + t_removed;  // Effective inner radius (wall is thinner)

    ctx.save();
    ctx.fillStyle = opts.removedColor;
    ctx.globalAlpha = opts.removedAlpha;

    // Draw annular ring between Ri and R_eff_inner
    ctx.beginPath();
    ctx.arc(0, 0, R_eff_inner, 0, 2 * Math.PI);
    ctx.arc(0, 0, Ri, 0, 2 * Math.PI, true);
    ctx.closePath();
    ctx.fill('evenodd');

    // Optional: add radial hatching for consistency
    if (opts.hatchRemoved) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = opts.removedColor;
      ctx.lineWidth = 1.0 / scale;

      // Draw radial lines
      const numLines = 24;
      for (let i = 0; i < numLines; i++) {
        const angle = (i / numLines) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Ri * Math.cos(angle), Ri * Math.sin(angle));
        ctx.lineTo(R_eff_inner * Math.cos(angle), R_eff_inner * Math.sin(angle));
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Draw removed strips with hatching.
   * Context must be in section coordinate space.
   */
  function _drawRemovedStrips(ctx, strips, opts, scale) {
    for (const strip of strips) {
      const rect = _stripToRect(strip);
      if (!rect) {
        console.warn('[SectionPlotter] Could not compute rect for strip:', strip.id);
        continue;
      }

      // Fill strip
      ctx.save();
      ctx.fillStyle = opts.removedColor;
      ctx.globalAlpha = opts.removedAlpha;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.globalAlpha = 1.0;

      // Hatch
      if (opts.hatchRemoved) {
        _drawHatching(ctx, rect, opts, scale);
      }

      ctx.restore();
    }
  }

  /**
   * Convert a removed strip to a canvas rectangle.
   * All coordinates in section mm.
   * strip.width is the removed portion width; strip.centroid is its centre.
   */
  function _stripToRect(strip) {
    const c = strip.centroid;
    const w = strip.width;       // dimension in orientation direction (mm)
    const t = strip.thickness;   // perpendicular dimension (mm)

    if (strip.orientation === 'y-direction') {
      // Strip extends vertically (Y), thickness in Z
      return { x: c.z - t / 2, y: c.y - w / 2, width: t, height: w };

    } else if (strip.orientation === 'z-direction') {
      // Strip extends horizontally (Z), thickness in Y
      return { x: c.z - w / 2, y: c.y - t / 2, width: w, height: t };
    }

    return null;
  }

  /**
   * Draw diagonal hatching within a clipped rectangle.
   * rect is in section coordinates. scale is px/mm.
   * Lines are at 45° in section space (which appears as 45° on screen since scale is uniform).
   */
  function _drawHatching(ctx, rect, opts, scale) {
    ctx.save();

    // Clip to strip rectangle
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();

    ctx.strokeStyle = opts.removedColor;
    ctx.lineWidth = 1.0 / scale;  // ~1px on screen
    ctx.globalAlpha = 0.9;

    const sp = opts.hatchSpacing; // spacing in section mm

    // Draw lines with slope +1 in section space (=45° right-up on screen, since Y is flipped)
    // We cover a diagonal extent larger than the rect to ensure full coverage
    const diag = Math.abs(rect.width) + Math.abs(rect.height);
    const n = Math.ceil(diag / sp) + 2;

    ctx.beginPath();
    for (let i = -n; i <= n; i++) {
      // Line passes through (rect.x + i*sp, rect.y) with slope +1
      const x1 = rect.x + i * sp - rect.height;
      const y1 = rect.y;
      const x2 = rect.x + i * sp + rect.height;
      const y2 = rect.y + rect.height;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw section name and key dimensions at the bottom of the canvas.
   */
  function _drawSectionLabel(ctx, section, opts, canvas) {
    const name = section.profile || opts.sectionName || '';
    if (!name) return;

    // Build dimension string based on section type
    let dims;
    if (section.D && section.t) {
      // Circular section
      dims = `D=${section.D} mm, t=${section.t} mm`;
    } else if (section.tw && section.tf) {
      // I/H section
      dims = `h=${section.h} mm, b=${section.b} mm, tw=${section.tw} mm, tf=${section.tf} mm`;
    } else if (section.t) {
      // Hollow section (RHS/SHS)
      const ro = section.ro || section.r || 0;
      if (section.h && section.h !== section.b) {
        // Rectangular
        dims = `h=${section.h} mm, b=${section.b} mm, t=${section.t} mm` +
               (ro > 0 ? `, ro=${ro.toFixed(1)} mm` : '');
      } else {
        // Square
        dims = `b=${section.b} mm, t=${section.t} mm` +
               (ro > 0 ? `, ro=${ro.toFixed(1)} mm` : '');
      }
    } else {
      // Unknown - just show what we have
      dims = `b=${section.b} mm`;
    }

    ctx.save();
    ctx.fillStyle = '#6B7280';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillText(`${name}  ·  ${dims}`, canvas.width / 2, canvas.height - 6);
    ctx.restore();
  }

  /**
   * Draw legend in the reserved top strip (above the section plot area).
   * hasClass4 and padTop are pre-computed in plot() to avoid layout duplication.
   */
  function _drawLegend(ctx, section, effectiveProperties, opts, canvas, hasClass4, padTop) {
    if (!opts.showLegend) return;

    const numItems = hasClass4 ? 2 : 1;

    const itemH = 28;
    const pad = 12;
    const boxW = 230;
    const boxH = numItems * itemH + 2 * pad;
    const radius = 6;
    const squareSize = 16;

    // Centre legend horizontally; centre it vertically within the reserved top strip
    const lx = Math.max(8, (canvas.width - boxW) / 2);
    const ly = Math.max(6, (padTop - boxH) / 2);

    // Background panel
    ctx.save();
    ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 1;
    _roundRect(ctx, lx, ly, boxW, boxH, radius);
    ctx.fill();
    ctx.stroke();

    // Item 1: Gross section
    const item1Y = ly + pad;
    ctx.fillStyle = opts.grossColor;
    ctx.strokeStyle = opts.grossStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(lx + pad, item1Y, squareSize, squareSize);
    ctx.strokeRect(lx + pad, item1Y, squareSize, squareSize);

    ctx.fillStyle = '#D1D5DB';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gross section', lx + pad + squareSize + 8, item1Y + squareSize / 2);

    // Item 2: Removed strips
    if (hasClass4) {
      const item2Y = ly + pad + itemH;

      // Hatched red square
      ctx.fillStyle = opts.removedColor;
      ctx.globalAlpha = opts.removedAlpha;
      ctx.fillRect(lx + pad, item2Y, squareSize, squareSize);
      ctx.globalAlpha = 1.0;

      // Mini hatching lines
      ctx.save();
      ctx.beginPath();
      ctx.rect(lx + pad, item2Y, squareSize, squareSize);
      ctx.clip();
      ctx.strokeStyle = opts.removedColor;
      ctx.lineWidth = 1.5;
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(lx + pad + i * 5, item2Y);
        ctx.lineTo(lx + pad + i * 5 + squareSize, item2Y + squareSize);
        ctx.stroke();
      }
      ctx.restore();

      const rawPct = effectiveProperties.area_reduction_percent != null
        ? effectiveProperties.area_reduction_percent
        : effectiveProperties.area_reduction && effectiveProperties.gross_area
          ? (effectiveProperties.area_reduction / effectiveProperties.gross_area) * 100
          : null;
      const pct = rawPct != null ? rawPct.toFixed(1) : '?';
      ctx.fillStyle = '#D1D5DB';
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Removed (${pct}% area)`, lx + pad + squareSize + 8, item2Y + squareSize / 2);
    }

    ctx.restore();
  }

  /**
   * Draw a rounded rectangle path (polyfill for roundRect)
   */
  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Public API
  return { plot };

})();
