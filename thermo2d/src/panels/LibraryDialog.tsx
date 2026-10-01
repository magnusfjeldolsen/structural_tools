import { useMemo, useState } from 'react';
import { BUILTIN_LIBRARY, searchLibrary } from '@thermo2d/core';
import type { LibraryItem, MaterialCategory } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Dialog, SelectField } from '../components/ui.js';

const CATEGORIES: MaterialCategory[] = ['concrete', 'insulation', 'wood', 'gypsum', 'metal', 'masonry', 'air', 'ground', 'membrane', 'custom'];

export function LibraryDialog(props: { forRegionIds?: string[]; onClose: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.ui.lang);
  const dispatch = useStore((s) => s.dispatch);
  const [text, setText] = useState('');
  const [cat, setCat] = useState<'all' | MaterialCategory>('all');
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const items = useMemo(() => {
    try {
      return searchLibrary({ text: text || undefined, category: 'material', materialCategory: cat === 'all' ? undefined : cat }, BUILTIN_LIBRARY);
    } catch {
      return (BUILTIN_LIBRARY ?? []).filter((i) => i.category === 'material');
    }
  }, [text, cat]);

  const add = () => {
    if (!picked) return;
    const res = dispatch([{ type: 'material.addFromLibrary', libraryId: picked.id }]);
    const id = res?.createdIds[0]?.[0];
    if (id && props.forRegionIds?.length) dispatch([{ type: 'region.setMaterial', ids: props.forRegionIds, materialId: id }]);
    props.onClose();
  };
  const m = picked?.material;
  return (
    <Dialog
      title={t('addFromLibrary')}
      onClose={props.onClose}
      width={760}
      footer={
        <>
          <Button onClick={props.onClose}>{t('close')}</Button>
          <Button primary disabled={!picked} onClick={add}>
            {t('add')}
          </Button>
        </>
      }
    >
      <div className="row">
        <input className="field" style={{ flex: 1 }} placeholder={t('searchLibrary')} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <SelectField value={cat} onChange={setCat} options={[{ value: 'all', label: t('allCategories') }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
      </div>
      <div className="two-col">
        <div className="library-list">
          {items.map((it) => (
            <div key={it.id} className={`library-item ${picked?.id === it.id ? 'selected' : ''}`} onClick={() => setPicked(it)} onDoubleClick={() => (setPicked(it), add())}>
              <div>{lang === 'nb' && it.nameNb ? it.nameNb : it.name}</div>
              <div className="cat">
                {it.material?.category} · {t(qualityKey(it.quality))}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="empty">–</p>}
        </div>
        <div className="library-detail">
          {picked && m ? (
            <dl>
              <dt>{t('name')}</dt>
              <dd>{picked.name}</dd>
              <dt>{t('category')}</dt>
              <dd>{m.category}</dd>
              <dt>{t('source')}</dt>
              <dd>{picked.source.text}</dd>
              <dt>{t('quality')}</dt>
              <dd>{t(qualityKey(picked.quality))}</dd>
              <dt>{t('validRange')}</dt>
              <dd>
                {m.validRange[0]}–{m.validRange[1]} °C
              </dd>
              <dt>{t('emissivity')}</dt>
              <dd>{m.emissivity}</dd>
              {m.model.kind === 'constant' && (
                <>
                  <dt>λ / cₚ / ρ</dt>
                  <dd>
                    {m.model.lambda} W/mK · {m.model.cp} J/kgK · {m.model.rho} kg/m³
                  </dd>
                </>
              )}
              {m.model.kind !== 'constant' && (
                <>
                  <dt>{t('kind')}</dt>
                  <dd>{m.model.kind}</dd>
                </>
              )}
              {picked.tags.length > 0 && (
                <>
                  <dt>Tags</dt>
                  <dd>{picked.tags.join(', ')}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="empty">{t('nothingSelected')}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export function qualityKey(q: LibraryItem['quality']): 'qualityStandard' | 'qualityManufacturer' | 'qualityTypical' | 'qualityUser' {
  return q === 'standard' ? 'qualityStandard' : q === 'manufacturer' ? 'qualityManufacturer' : q === 'typical' ? 'qualityTypical' : 'qualityUser';
}
