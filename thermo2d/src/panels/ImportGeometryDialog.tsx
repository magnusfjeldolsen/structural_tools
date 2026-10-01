import { useState } from 'react';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Dialog } from '../components/ui.js';
import { pickFileFallback } from '../state/persistence.js';

export function ImportGeometryDialog(props: { onClose: () => void }) {
  const t = useT();
  const dispatch = useStore((s) => s.dispatch);
  const [text, setText] = useState('');
  const [name, setName] = useState('import');
  const detect = (src: string): 'json' | 'dxf' | 'csv' => {
    const s = src.trim();
    if (s.startsWith('{') || s.startsWith('[')) return 'json';
    if (/^\s*0\s*\r?\n\s*SECTION/m.test(s) || /ENTITIES/.test(s)) return 'dxf';
    return 'csv';
  };
  const run = () => {
    const kind = detect(text);
    const res =
      kind === 'json'
        ? dispatch([{ type: 'import.geometryWorkspace', json: JSON.parse(text) }])
        : kind === 'dxf'
          ? dispatch([{ type: 'import.dxf', text }])
          : dispatch([{ type: 'import.polygonCsv', text, name }]);
    if (res) props.onClose();
  };
  const pick = async () => {
    const f = await pickFileFallback('.json,.dxf,.csv,.txt');
    if (!f) return;
    setName(f.name.replace(/\.[^.]+$/, ''));
    setText(await f.text());
  };
  return (
    <Dialog
      title={t('importGeometry')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('close')}</Button>
          <Button primary disabled={!text.trim()} onClick={run}>
            {t('add')}
          </Button>
        </>
      }
    >
      <p className="hint">{t('importGeometryHint')}</p>
      <div className="row">
        <Button small onClick={() => void pick()}>
          {t('open')}…
        </Button>
      </div>
      <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={'0;0\n300;0\n300;500\n0;500'} />
    </Dialog>
  );
}
