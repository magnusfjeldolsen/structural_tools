/**
 * Results Panel Component
 * Displays analysis results in an organized table format
 *
 * Shows:
 * - Node displacements (DX, DY, RZ)
 * - Node reactions (FX, FY, MZ) for supports
 * - Element forces (max moment, shear, axial)
 * - Summary statistics
 *
 * Units (already converted by backend):
 * - Displacements: mm
 * - Rotations: rad
 * - Forces: kN
 * - Moments: kNm
 */

import { useModelStore } from '../store';

// Simple format helper
const fmt = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};

export function ResultsPanel() {
  const analysisResults = useModelStore((state) => state.analysisResults);
  const analysisError = useModelStore((state) => state.analysisError);
  const isAnalyzing = useModelStore((state) => state.isAnalyzing);

  if (isAnalyzing) {
    return (
      <div style={containerStyle}>
        <h3 style={headerStyle}>Analysis Results</h3>
        <div style={{ padding: '20px', textAlign: 'center', color: '#2196F3' }}>
          <p>🔄 Running analysis...</p>
        </div>
      </div>
    );
  }

  if (analysisError) {
    return (
      <div style={containerStyle}>
        <h3 style={headerStyle}>Analysis Results</h3>
        <div style={{ padding: '20px', color: '#f44336' }}>
          <p>❌ Analysis failed:</p>
          <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{analysisError}</pre>
        </div>
      </div>
    );
  }

  if (!analysisResults) {
    return (
      <div style={containerStyle}>
        <h3 style={headerStyle}>Analysis Results</h3>
        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
          <p>No results yet. Click "Run Analysis" to analyze the model.</p>
        </div>
      </div>
    );
  }

  // Extract node and element results
  const nodeEntries = Object.entries(analysisResults.nodes);
  const elementEntries = Object.entries(analysisResults.elements);

  return (
    <div style={containerStyle}>
      <h3 style={headerStyle}>Analysis Results ✓</h3>

      <div style={scrollContainerStyle}>
        {/* Node Results */}
        <section style={sectionStyle}>
          <h4 style={subHeaderStyle}>Node Displacements & Reactions</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={headerRowStyle}>
                <th style={cellStyle}>Node</th>
                <th style={cellStyle}>DX (mm)</th>
                <th style={cellStyle}>DY (mm)</th>
                <th style={cellStyle}>RZ (rad)</th>
                <th style={cellStyle}>RFX (kN)</th>
                <th style={cellStyle}>RFY (kN)</th>
                <th style={cellStyle}>RMZ (kNm)</th>
              </tr>
            </thead>
            <tbody>
              {nodeEntries.map(([name, result]) => {
                const hasReaction =
                  Math.abs(result.reactions.FX) > 0.001 ||
                  Math.abs(result.reactions.FY) > 0.001 ||
                  Math.abs(result.reactions.MZ) > 0.001;

                return (
                  <tr key={name} style={rowStyle}>
                    <td style={cellStyle}>{name}</td>
                    <td style={cellStyle}>{fmt(result.DX, 3)}</td>
                    <td style={cellStyle}>{fmt(result.DY, 3)}</td>
                    <td style={cellStyle}>{fmt(result.RZ, 6)}</td>
                    <td style={cellStyle}>
                      {hasReaction ? fmt(result.reactions.FX, 2) : '-'}
                    </td>
                    <td style={cellStyle}>
                      {hasReaction ? fmt(result.reactions.FY, 2) : '-'}
                    </td>
                    <td style={cellStyle}>
                      {hasReaction ? fmt(result.reactions.MZ, 2) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Element Results */}
        <section style={sectionStyle}>
          <h4 style={subHeaderStyle}>Element Forces</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={headerRowStyle}>
                <th style={cellStyle}>Element</th>
                <th style={cellStyle}>Max Moment (kNm)</th>
                <th style={cellStyle}>Max Shear (kN)</th>
                <th style={cellStyle}>Max Axial (kN)</th>
              </tr>
            </thead>
            <tbody>
              {elementEntries.map(([name, result]) => (
                <tr key={name} style={rowStyle}>
                  <td style={cellStyle}>{name}</td>
                  <td style={cellStyle}>{fmt(result.max_moment, 2)}</td>
                  <td style={cellStyle}>{fmt(result.max_shear, 2)}</td>
                  <td style={cellStyle}>{fmt(result.max_axial, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Summary Statistics */}
        <section style={sectionStyle}>
          <h4 style={subHeaderStyle}>Summary</h4>
          <div style={{ padding: '12px', fontSize: '14px' }}>
            <p>
              <strong>Total Nodes:</strong> {nodeEntries.length}
            </p>
            <p>
              <strong>Total Elements:</strong> {elementEntries.length}
            </p>
            <p>
              <strong>Max Displacement:</strong>{' '}
              {fmt(Math.max(...nodeEntries.map(([_, r]) => Math.abs(r.DY))), 3)} mm
            </p>
            <p>
              <strong>Max Moment:</strong>{' '}
              {fmt(Math.max(...elementEntries.map(([_, r]) => Math.abs(r.max_moment))), 2)} kNm
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#fff',
  borderLeft: '1px solid #ccc',
};

const scrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px',
};

const headerStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px',
  backgroundColor: '#f5f5f5',
  borderBottom: '1px solid #ccc',
  fontSize: '18px',
  fontWeight: 'bold',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '24px',
};

const subHeaderStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 'bold',
  marginBottom: '12px',
  color: '#333',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
};

const headerRowStyle: React.CSSProperties = {
  backgroundColor: '#2196F3',
  color: '#fff',
};

const rowStyle: React.CSSProperties = {
  borderBottom: '1px solid #e0e0e0',
};

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
};
