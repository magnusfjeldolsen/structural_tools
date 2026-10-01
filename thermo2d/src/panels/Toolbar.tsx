import { useStore, type Tool } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button } from '../components/ui.js';
import type { StringKey } from '../i18n/index.js';

const TOOLS: { id: Tool; icon: string; label: StringKey; key?: string }[] = [
  { id: 'select', icon: '↖', label: 'toolSelect', key: 'V' },
  { id: 'pan', icon: '✋', label: 'toolPan', key: 'H' },
  { id: 'rect', icon: '▭', label: 'toolRect', key: 'R' },
  { id: 'circle', icon: '◯', label: 'toolCircle', key: 'C' },
  { id: 'polygon', icon: '⬠', label: 'toolPolygon', key: 'P' },
  { id: 'void', icon: '▣', label: 'toolVoid' },
  { id: 'split', icon: '⟋', label: 'toolSplit' },
  { id: 'edge', icon: '⟷', label: 'toolEdge', key: 'E' },
  { id: 'probe', icon: '⌖', label: 'toolProbe', key: 'M' },
  { id: 'lineProbe', icon: '⟍', label: 'toolLineProbe' },
];

export function Toolbar() {
  const t = useT();
  const tool = useStore((s) => s.ui.tool);
  const hasSelection = useStore((s) => s.ui.selection.length > 0);
  const regionsSelected = useStore((s) => s.ui.selection.filter((x) => x.collection === 'regions').length);
  const { setTool, setUi, dispatch } = useStore.getState();
  const openDialog = (op: 'move' | 'rotate' | 'mirror' | 'scale' | 'copy' | 'offset' | 'boolean' | 'polar') => setUi({ dialog: { kind: 'transform', op } });
  const del = () => {
    const sel = useStore.getState().ui.selection;
    const regionIds = sel.filter((s) => s.collection === 'regions').map((s) => s.id);
    const cmds = [] as Parameters<typeof dispatch>[0];
    if (regionIds.length) cmds.push({ type: 'region.delete', ids: regionIds, dependents: 'delete' });
    const others = sel.filter((s) => s.collection !== 'regions' && s.collection !== 'rebarSets' && s.collection !== 'boundaryConditions').map((s) => s.id);
    if (others.length) cmds.push({ type: 'entities.delete', ids: others });
    for (const s of sel.filter((x) => x.collection === 'rebarSets')) cmds.push({ type: 'rebarSet.delete', id: s.id });
    for (const s of sel.filter((x) => x.collection === 'boundaryConditions')) cmds.push({ type: 'bc.delete', id: s.id });
    if (cmds.length) dispatch(cmds);
  };
  return (
    <div className="toolbar">
      {TOOLS.map((tl) => (
        <Button key={tl.id} active={tool === tl.id} onClick={() => setTool(tl.id)} title={`${t(tl.label)}${tl.key ? ` (${tl.key})` : ''}`}>
          {tl.icon}
        </Button>
      ))}
      <hr />
      <Button disabled={!hasSelection} onClick={() => openDialog('move')} title={t('toolMove')}>
        ✥
      </Button>
      <Button disabled={!hasSelection} onClick={() => openDialog('rotate')} title={t('toolRotate')}>
        ⟳
      </Button>
      <Button disabled={!hasSelection} onClick={() => openDialog('mirror')} title={t('toolMirror')}>
        ⇔
      </Button>
      <Button disabled={!hasSelection} onClick={() => openDialog('scale')} title={t('toolScale')}>
        ⤢
      </Button>
      <Button disabled={!hasSelection} onClick={() => openDialog('copy')} title={t('toolCopy')}>
        ⧉
      </Button>
      <Button disabled={regionsSelected < 1} onClick={() => openDialog('offset')} title={t('toolOffset')}>
        ◎
      </Button>
      <Button disabled={regionsSelected < 2} onClick={() => openDialog('boolean')} title={t('toolBoolean')}>
        ∪
      </Button>
      <hr />
      <Button disabled={!hasSelection} onClick={del} title={`${t('toolDelete')} (Del)`} danger>
        🗑
      </Button>
    </div>
  );
}
