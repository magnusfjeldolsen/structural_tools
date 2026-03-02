#!/usr/bin/env node
/**
 * Generate plate element metadata for steel cross-sections
 *
 * This script adds plate_elements metadata to all profiles in the database.
 * Each plate element includes:
 * - Geometric properties (dimensions, centroids, edges)
 * - Classification parameters (formulas for c, t)
 * - Reduction behavior patterns
 *
 * Usage: node generate_plate_metadata.js
 *
 * Standards: EN 1993-1-1 Table 5.2, EN 1993-1-5 Section 4.4
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Profile Type Handlers
// ============================================================================

const profileHandlers = {
  ipe: generateIPEMetadata,
  hea: generateIPEMetadata,  // Same structure as IPE
  heb: generateIPEMetadata,  // Same structure as IPE
  hem: generateIPEMetadata,  // Same structure as IPE
  hrhs: generateRHSMetadata,
  hshs: generateSHSMetadata,
  crhs: generateRHSMetadata,
  cshs: generateSHSMetadata,
  hchs: generateCHSMetadata,
  cchs: generateCHSMetadata
};

// ============================================================================
// I/H-Section Metadata Generator (IPE, HEA, HEB, HEM)
// ============================================================================

/**
 * Generate plate metadata for I and H sections
 * Applies to: IPE, HEA, HEB, HEM
 *
 * Structure:
 * - 1 web (internal element, y-direction)
 * - 2 flange tips (outstand elements, z-direction) per flange
 * - Total: 5 plate elements (1 web + 4 flange tips)
 */
function generateIPEMetadata(profile) {
  const { h, b, tw, tf, r } = profile;

  // Web effective length (between fillet radii)
  const web_c = h - 2*tf - 2*r;

  // Flange tip effective length (from web to flange edge)
  const flange_c = b/2 - tw/2 - r;

  return [
    // Web element
    {
      id: "web",
      type: "internal",
      orientation: "y-direction",
      geometry: {
        gross_length: h,
        thickness: tw,
        centroid: { y: 0, z: 0 },
        edges: {
          edge1: {
            id: "top_junction",
            position: { y: web_c/2, z: 0 },
            type: "junction"
          },
          edge2: {
            id: "bottom_junction",
            position: { y: -web_c/2, z: 0 },
            type: "junction"
          }
        }
      },
      classification: {
        c_formula: "(h - 2*tf - 2*r)",
        t_formula: "tw"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    // Top flange - left tip
    {
      id: "top_flange_tip_left",
      type: "outstand",
      orientation: "z-direction",
      geometry: {
        gross_length: flange_c,
        thickness: tf,
        centroid: {
          y: h/2 - tf/2,
          z: -(tw/2 + r + flange_c/2)
        },
        edges: {
          edge1: {
            id: "web_junction",
            position: { y: h/2 - tf/2, z: -(tw/2 + r) },
            type: "junction"
          },
          edge2: {
            id: "free_edge",
            position: { y: h/2 - tf/2, z: -(tw/2 + r + flange_c) },
            type: "free"
          }
        }
      },
      classification: {
        c_formula: "(b/2 - tw/2 - r)",
        t_formula: "tf"
      },
      reduction_patterns: {
        compression_psi_positive: "free_edge",
        bending_psi_negative: "internal_strip"
      }
    },

    // Top flange - right tip
    {
      id: "top_flange_tip_right",
      type: "outstand",
      orientation: "z-direction",
      geometry: {
        gross_length: flange_c,
        thickness: tf,
        centroid: {
          y: h/2 - tf/2,
          z: tw/2 + r + flange_c/2
        },
        edges: {
          edge1: {
            id: "web_junction",
            position: { y: h/2 - tf/2, z: tw/2 + r },
            type: "junction"
          },
          edge2: {
            id: "free_edge",
            position: { y: h/2 - tf/2, z: tw/2 + r + flange_c },
            type: "free"
          }
        }
      },
      classification: {
        c_formula: "(b/2 - tw/2 - r)",
        t_formula: "tf"
      },
      reduction_patterns: {
        compression_psi_positive: "free_edge",
        bending_psi_negative: "internal_strip"
      }
    },

    // Bottom flange - left tip
    {
      id: "bottom_flange_tip_left",
      type: "outstand",
      orientation: "z-direction",
      geometry: {
        gross_length: flange_c,
        thickness: tf,
        centroid: {
          y: -(h/2 - tf/2),
          z: -(tw/2 + r + flange_c/2)
        },
        edges: {
          edge1: {
            id: "web_junction",
            position: { y: -(h/2 - tf/2), z: -(tw/2 + r) },
            type: "junction"
          },
          edge2: {
            id: "free_edge",
            position: { y: -(h/2 - tf/2), z: -(tw/2 + r + flange_c) },
            type: "free"
          }
        }
      },
      classification: {
        c_formula: "(b/2 - tw/2 - r)",
        t_formula: "tf"
      },
      reduction_patterns: {
        compression_psi_positive: "free_edge",
        bending_psi_negative: "internal_strip"
      }
    },

    // Bottom flange - right tip
    {
      id: "bottom_flange_tip_right",
      type: "outstand",
      orientation: "z-direction",
      geometry: {
        gross_length: flange_c,
        thickness: tf,
        centroid: {
          y: -(h/2 - tf/2),
          z: tw/2 + r + flange_c/2
        },
        edges: {
          edge1: {
            id: "web_junction",
            position: { y: -(h/2 - tf/2), z: tw/2 + r },
            type: "junction"
          },
          edge2: {
            id: "free_edge",
            position: { y: -(h/2 - tf/2), z: tw/2 + r + flange_c },
            type: "free"
          }
        }
      },
      classification: {
        c_formula: "(b/2 - tw/2 - r)",
        t_formula: "tf"
      },
      reduction_patterns: {
        compression_psi_positive: "free_edge",
        bending_psi_negative: "internal_strip"
      }
    }
  ];
}

// ============================================================================
// RHS Metadata Generator (Hot-rolled and Cold-rolled)
// ============================================================================

/**
 * Generate plate metadata for Rectangular Hollow Sections
 * Applies to: HRHS, CRHS
 *
 * Structure:
 * - 2 flanges (horizontal, internal, z-direction)
 * - 2 webs (vertical, internal, y-direction)
 * - Total: 4 plate elements
 */
function generateRHSMetadata(profile) {
  const { h, b, t, r } = profile;

  // Effective lengths (straight part between corners)
  // Per EN 1993-1-1: effective length = nominal - 3t
  const h_eff = h - 3*t;
  const b_eff = b - 3*t;

  return [
    // Top flange
    {
      id: "top_flange",
      type: "internal",
      orientation: "z-direction",
      geometry: {
        gross_length: b,
        thickness: t,
        centroid: { y: h/2 - t/2, z: 0 },
        edges: {
          edge1: {
            id: "left_corner",
            position: { y: h/2 - t/2, z: -b_eff/2 },
            type: "junction"
          },
          edge2: {
            id: "right_corner",
            position: { y: h/2 - t/2, z: b_eff/2 },
            type: "junction"
          }
        }
      },
      classification: {
        c_formula: "(b - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    // Bottom flange
    {
      id: "bottom_flange",
      type: "internal",
      orientation: "z-direction",
      geometry: {
        gross_length: b,
        thickness: t,
        centroid: { y: -(h/2 - t/2), z: 0 },
        edges: {
          edge1: {
            id: "left_corner",
            position: { y: -(h/2 - t/2), z: -b_eff/2 },
            type: "junction"
          },
          edge2: {
            id: "right_corner",
            position: { y: -(h/2 - t/2), z: b_eff/2 },
            type: "junction"
          }
        }
      },
      classification: {
        c_formula: "(b - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    // Left web
    {
      id: "left_web",
      type: "internal",
      orientation: "y-direction",
      geometry: {
        gross_length: h,
        thickness: t,
        centroid: { y: 0, z: -(b/2 - t/2) },
        edges: {
          edge1: {
            id: "top_corner",
            position: { y: h_eff/2, z: -(b/2 - t/2) },
            type: "junction"
          },
          edge2: {
            id: "bottom_corner",
            position: { y: -h_eff/2, z: -(b/2 - t/2) },
            type: "junction"
          }
        }
      },
      classification: {
        c_formula: "(h - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    },

    // Right web
    {
      id: "right_web",
      type: "internal",
      orientation: "y-direction",
      geometry: {
        gross_length: h,
        thickness: t,
        centroid: { y: 0, z: b/2 - t/2 },
        edges: {
          edge1: {
            id: "top_corner",
            position: { y: h_eff/2, z: b/2 - t/2 },
            type: "junction"
          },
          edge2: {
            id: "bottom_corner",
            position: { y: -h_eff/2, z: b/2 - t/2 },
            type: "junction"
          }
        }
      },
      classification: {
        c_formula: "(h - 3*t)",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "symmetric_edge",
        compression_psi_positive: "asymmetric_edge",
        bending_psi_negative: "compression_edge"
      }
    }
  ];
}

// ============================================================================
// SHS Metadata Generator (Square Hollow Sections)
// ============================================================================

/**
 * Generate plate metadata for Square Hollow Sections
 * Applies to: HSHS, CSHS
 *
 * Same as RHS but with h = b
 */
function generateSHSMetadata(profile) {
  // SHS is just RHS with h = b
  return generateRHSMetadata(profile);
}

// ============================================================================
// CHS Metadata Generator (Circular Hollow Sections)
// ============================================================================

/**
 * Generate plate metadata for Circular Hollow Sections
 * Applies to: HCHS, CCHS
 *
 * Structure:
 * - 1 circular wall (treated as single element)
 * - Total: 1 plate element
 */
function generateCHSMetadata(profile) {
  const { D, t } = profile;

  return [
    {
      id: "circular_wall",
      type: "circular",
      orientation: "radial",
      geometry: {
        gross_length: Math.PI * D,  // Circumference
        thickness: t,
        centroid: { y: 0, z: 0 },
        edges: {}  // No discrete edges for circular sections
      },
      classification: {
        c_formula: "D",
        t_formula: "t"
      },
      reduction_patterns: {
        compression_psi_1: "uniform_reduction"
      }
    }
  ];
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Process all database files and add plate_elements metadata
 */
function processDatabase() {
  const dbPath = path.join(__dirname, '..', '..', 'steel_cross_section_database');

  console.log('\n========================================');
  console.log('Steel Cross-Section Metadata Generator');
  console.log('========================================\n');
  console.log(`Database path: ${dbPath}\n`);

  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: Database path not found: ${dbPath}`);
    process.exit(1);
  }

  let totalProfiles = 0;
  let processedProfiles = 0;
  let skippedProfiles = 0;

  // Process each profile type
  for (const [profileType, handler] of Object.entries(profileHandlers)) {
    const filename = `${profileType}.json`;
    const filepath = path.join(dbPath, filename);

    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  Skipping ${filename} (file not found)`);
      continue;
    }

    try {
      // Read database file
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

      if (!data.profiles || !Array.isArray(data.profiles)) {
        console.log(`⚠️  Skipping ${filename} (invalid format)`);
        continue;
      }

      totalProfiles += data.profiles.length;

      // Process each profile
      for (const profile of data.profiles) {
        // Skip if already has plate_elements
        if (profile.plate_elements) {
          skippedProfiles++;
          continue;
        }

        // Generate metadata
        try {
          profile.plate_elements = handler(profile);
          processedProfiles++;
        } catch (error) {
          console.error(`   ERROR processing ${profile.profile || 'unknown'}: ${error.message}`);
        }
      }

      // Write back to file with pretty formatting
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
      console.log(`✓ ${filename.padEnd(15)} → ${data.profiles.length} profiles`);

    } catch (error) {
      console.error(`ERROR processing ${filename}: ${error.message}`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('Summary:');
  console.log(`  Total profiles:     ${totalProfiles}`);
  console.log(`  Processed:          ${processedProfiles}`);
  console.log(`  Skipped (existing): ${skippedProfiles}`);
  console.log('========================================\n');

  if (processedProfiles === 0 && totalProfiles > 0) {
    console.log('ℹ️  All profiles already have metadata. Use --force to regenerate.\n');
  } else if (processedProfiles > 0) {
    console.log('✅ Metadata generation complete!\n');
  }
}

// ============================================================================
// Execute
// ============================================================================

// Check for --force flag to regenerate existing metadata
const forceRegenerate = process.argv.includes('--force');

if (forceRegenerate) {
  console.log('\n⚠️  Force regenerate mode: existing metadata will be overwritten\n');
  // Modify processDatabase to skip the plate_elements check
}

processDatabase();
