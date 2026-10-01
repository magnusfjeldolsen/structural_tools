import { useState } from 'react';
import type { Command, Transform } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Checkbox, Dialog, NumberField, SelectField } from '../components/ui.js';
import { ringCentroidOf } from '../editor/geometryTools.js';

export type TransformOp = 'move' | 'rotate' | 'mirror' | 'scale' | 'copy' | 'offset' | 'boolean' | 'polar';

export function TransformDialog(props: { op: TransformOp; onClose: () => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const dispatch = useStore((s) => s.dispatch);
  const ids = ui.selection.filter((s) => s.collection === 'regions' || s.collection === 'rebars' || s.collection === 'probes' || s.collection === 'lineProbes').map((s) => s.id);
  const regionIds = ui.selection.filter((s) => s.collection === 'regions').map((s) => s.id);
  const firstRegion = project.regions.find((r) => r.id === regionIds[0]);
  const c0 = firstRegion ? ringCentroidOf(firstRegion.polygon.outer) : [0, 0];
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [angle, setAngle] = useState(90);
  const [cx, setCx] = useState(c0[0]);
  const [cy, setCy] = useState(c0[1]);
  const [axis, setAxis] = useState<'x' | 'y'>('y');
  const [sx, setSx] = useState(1);
  const [sy, setSy] = useState(1);
  const [count, setCount] = useState(2);
  const [distance, setDistance] = useState(-35);
  const [asNew, setAsNew] = useState(true);
  const [boolOp, setBoolOp] = useState<'union' | 'subtract' | 'intersect' | 'xor'>('union');
  const [keepTools, setKeepTools] = useState(false);
  const [polar, setPolar] = useState(false);

  const titleKey = { move: 'toolMove', rotate: 'toolRotate', mirror: 'toolMirror', scale: 'toolScale', copy: 'toolCopy', offset: 'toolOffset', boolean: 'toolBoolean', polar: 'polar' } as const;
  const apply = () => {
    const cmds: Command[] = [];
    let tr: Transform | null = null;
    if (props.op === 'move') tr = { kind: 'move', dx, dy };
    if (props.op === 'rotate') tr = { kind: 'rotate', cx, cy, angleDeg: angle };
    if (props.op === 'mirror') tr = { kind: 'mirror', axis: axis === 'x' ? { p1: [cx, cy], p2: [cx + 1, cy] } : { p1: [cx, cy], p2: [cx, cy + 1] } };
    if (props.op === 'scale') tr = { kind: 'scale', cx, cy, sx, sy };
    if (tr) cmds.push({ type: 'entities.transform', ids, transform: tr });
    if (props.op === 'copy') {
      if (polar) cmds.push({ type: 'entities.polarArray', ids, cx, cy, count, angleDeg: angle });
      else cmds.push({ type: 'entities.copy', ids, dx, dy, count });
    }
    if (props.op === 'offset') for (const id of regionIds) cmds.push({ type: 'region.offset', id, distance, asNew });
    if (props.op === 'boolean' && regionIds.length >= 2) cmds.push({ type: 'region.boolean', op: boolOp, targetId: regionIds[0], toolIds: regionIds.slice(1), keepTools });
    if (cmds.length) dispatch(cmds);
    props.onClose();
  };
  const centreFields = (
    <>
      <NumberField label={`${t('centre')} x`} unit="mm" value={cx} onCommit={setCx} />
      <NumberField label={`${t('centre')} y`} unit="mm" value={cy} onCommit={setCy} />
    </>
  );
  return (
    <Dialog
      title={t(titleKey[props.op])}
      onClose={props.onClose}
      width={380}
      footer={
        <>
          <Button onClick={props.onClose}>{t('close')}</Button>
          <Button primary onClick={apply}>
            {t('apply')}
          </Button>
        </>
      }
    >
      <p className="hint">{t('selectedCount', { n: ids.length })}</p>
      {props.op === 'move' && (
        <>
          <NumberField label={t('dx')} unit="mm" value={dx} onCommit={setDx} />
          <NumberField label={t('dy')} unit="mm" value={dy} onCommit={setDy} />
        </>
      )}
      {props.op === 'rotate' && (
        <>
          <NumberField label={t('angle')} unit="°" value={angle} onCommit={setAngle} />
          {centreFields}
        </>
      )}
      {props.op === 'mirror' && (
        <>
          <SelectField label={t('axis')} value={axis} options={[{ value: 'y', label: 'y (↔)' }, { value: 'x', label: 'x (↕)' }]} onChange={setAxis} />
          {centreFields}
        </>
      )}
      {props.op === 'scale' && (
        <>
          <NumberField label={`${t('factor')} x`} value={sx} onCommit={setSx} />
          <NumberField label={`${t('factor')} y`} value={sy} onCommit={setSy} />
          {centreFields}
        </>
      )}
      {props.op === 'copy' && (
        <>
          <Checkbox label={t('polar')} checked={polar} onChange={setPolar} />
          <NumberField label={t('copies')} value={count} min={1} step={1} onCommit={(v) => setCount(Math.round(v))} />
          {polar ? (
            <>
              <NumberField label={t('angle')} unit="°" value={angle} onCommit={setAngle} />
              {centreFields}
            </>
          ) : (
            <>
              <NumberField label={t('dx')} unit="mm" value={dx} onCommit={setDx} />
              <NumberField label={t('dy')} unit="mm" value={dy} onCommit={setDy} />
            </>
          )}
        </>
      )}
      {props.op === 'offset' && (
        <>
          <NumberField label={t('distance')} unit="mm" value={distance} onCommit={setDistance} />
          <p className="hint">{t('offsetInward')}</p>
          <Checkbox label={t('asNewRegion')} checked={asNew} onChange={setAsNew} />
        </>
      )}
      {props.op === 'boolean' && (
        <>
          <SelectField value={boolOp} options={[{ value: 'union', label: t('union') }, { value: 'subtract', label: t('subtract') }, { value: 'intersect', label: t('intersect') }, { value: 'xor', label: t('xor') }]} onChange={setBoolOp} />
          <p className="hint">{t('booleanHint')}</p>
          <Checkbox label={t('keepTools')} checked={keepTools} onChange={setKeepTools} />
        </>
      )}
    </Dialog>
  );
}
