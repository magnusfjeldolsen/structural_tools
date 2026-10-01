import { useState } from 'react';
import { useStore, isSelected } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Empty, NumberField, Section, SelectField, TextField, fmtNum } from '../components/ui.js';
import { Help } from '../components/ui.js';

export function ProbesPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const { dispatch, select } = useStore.getState();
  const [pasted, setPasted] = useState('');
  const [depth, setDepth] = useState(25);
  const [along, setAlong] = useState(0.5);
  const [newX, setNewX] = useState(0);
  const [newY, setNewY] = useState(0);
  const edgeRef = ui.edgeSelection[0];

  const pasteProbes = () => {
    const cmds = [] as Parameters<typeof dispatch>[0];
    for (const line of pasted.split(/\r?\n/)) {
      const parts = line.split(/[\t;]|,(?=\s)/).map((s) => s.trim());
      if (parts.length < 2) continue;
      const nums = parts.slice(-2).map((s) => Number(s.replace(',', '.')));
      if (!nums.every(Number.isFinite)) continue;
      const name = parts.length >= 3 ? parts[0] : `P${project.probes.length + cmds.length + 1}`;
      cmds.push({ type: 'probe.add', probe: { name, position: [nums[0], nums[1]], kind: 'manual' } });
    }
    if (cmds.length) dispatch(cmds);
    setPasted('');
  };

  return (
    <>
      <Section
        title={t('probes')}
        actions={
          <Button small onClick={() => dispatch([{ type: 'probe.add', probe: { name: `P${project.probes.length + 1}`, position: [newX, newY], kind: 'manual' } }])}>
            + {t('addProbe')}
          </Button>
        }
      >
        {project.probes.length === 0 && <Empty>{t('probeHint')}</Empty>}
        {project.probes.length > 0 && (
          <table className="grid">
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('x')}</th>
                <th>{t('y')}</th>
                <th>{t('kind')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {project.probes.map((p) => (
                <tr key={p.id} className={isSelected(ui, 'probes', p.id) ? 'selected' : ''} onClick={() => select([{ collection: 'probes', id: p.id }])}>
                  <td>
                    <TextField value={p.name} onCommit={(name) => dispatch([{ type: 'probe.update', id: p.id, patch: { name } }])} />
                  </td>
                  <td className="num">
                    <NumberField value={p.position[0]} width={64} decimals={1} onCommit={(v) => dispatch([{ type: 'probe.update', id: p.id, patch: { position: [v, p.position[1]], kind: p.kind === 'rebar' ? 'manual' : p.kind, linkedRebarId: undefined } }])} />
                  </td>
                  <td className="num">
                    <NumberField value={p.position[1]} width={64} decimals={1} onCommit={(v) => dispatch([{ type: 'probe.update', id: p.id, patch: { position: [p.position[0], v], kind: p.kind === 'rebar' ? 'manual' : p.kind, linkedRebarId: undefined } }])} />
                  </td>
                  <td className="muted">{p.kind}</td>
                  <td>
                    <button className="icon-btn" onClick={(e) => (e.stopPropagation(), dispatch([{ type: 'probe.delete', ids: [p.id] }]))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <NumberField label={t('x')} unit="mm" value={newX} width={64} onCommit={setNewX} />
          <NumberField label={t('y')} unit="mm" value={newY} width={64} onCommit={setNewY} />
        </div>
        <div className="row">
          <Button small disabled={project.rebars.length === 0} onClick={() => dispatch([{ type: 'probe.addForRebars' }])}>
            {t('addForRebars')}
          </Button>
          <Button small disabled={project.probes.length === 0} onClick={() => dispatch([{ type: 'probe.delete', ids: project.probes.map((p) => p.id) }])} danger>
            {t('delete')} ({project.probes.length})
          </Button>
        </div>
      </Section>

      <Section title={t('addAtDepth')} collapsible>
        <p className="hint">{edgeRef ? `${t('hostEdge')}: ${project.regions.find((r) => r.id === edgeRef.regionId)?.name} #${edgeRef.edgeIndex}` : t('pickEdgeHint')}</p>
        <NumberField label={t('depth')} unit="mm" value={depth} min={0} onCommit={setDepth} />
        <Help text={t('probeDepthHelp')} />
        <NumberField label="0–1" value={along} min={0} max={1} step={0.1} onCommit={setAlong} />
        <div className="row right">
          <Button small disabled={!edgeRef} onClick={() => dispatch([{ type: 'probe.addAtDepth', edgeRef: edgeRef!, depth, along, name: `${fmtNum(depth, 0)} mm` }])}>
            {t('add')}
          </Button>
        </div>
      </Section>

      <Section title={t('pasteProbes')} collapsible defaultOpen={false}>
        <textarea className="field" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'P1\t150\t35\nP2\t150\t70'} />
        <div className="row right">
          <Button small disabled={!pasted.trim()} onClick={pasteProbes}>
            {t('add')}
          </Button>
        </div>
      </Section>

      <Section title={t('lineProbes')} collapsible>
        {project.lineProbes.length === 0 && <Empty>{t('lineProbeHint')}</Empty>}
        <ul className="tree">
          {project.lineProbes.map((p) => (
            <li key={p.id} className={isSelected(ui, 'lineProbes', p.id) ? 'selected' : ''} onClick={() => select([{ collection: 'lineProbes', id: p.id }])}>
              <span className="grow">{p.name}</span>
              <span className="muted">
                ({fmtNum(p.from[0], 0)}, {fmtNum(p.from[1], 0)}) → ({fmtNum(p.to[0], 0)}, {fmtNum(p.to[1], 0)})
              </span>
              <button className="icon-btn" onClick={(e) => (e.stopPropagation(), dispatch([{ type: 'lineProbe.delete', ids: [p.id] }]))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('origin')} collapsible defaultOpen={false}>
        <SelectField
          value={typeof project.settings.origin === 'string' ? project.settings.origin : 'bbox-min'}
          options={[{ value: 'bbox-min', label: t('originBbox') }, { value: 'centroid', label: t('originCentroid') }]}
          onChange={(v) => dispatch([{ type: 'project.setSettings', patch: { origin: v as 'bbox-min' | 'centroid' } }])}
        />
      </Section>
    </>
  );
}
