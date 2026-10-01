import type { Issue } from '@thermo2d/core';
import { useStore, type SelectableCollection } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import type { StringKey, TFn } from '../i18n/index.js';

/** Runtime messages carry codes; translate the ones we own, pass the rest through. */
export function messageText(m: Issue, lang: 'nb' | 'en', t: TFn): string {
  if (m.code === 'runtime:run-blocked') return t('errorRunBlocked');
  if (m.code === 'runtime:mesh-check') return t('checkMeshNeedsResult');
  if (m.code === 'runtime:mesh-check-result') return t('checkMeshResult', { delta: m.message, verdict: t(m.suggestion === 'good' ? 'checkMeshGood' : 'checkMeshBad') });
  if (m.code === 'runtime:run') return `${t('runFailed')}: ${m.message}`;
  if (m.code === 'runtime:command') return `${t('commandFailed')}: ${m.message}`;
  return lang === 'nb' && m.messageNb ? m.messageNb : m.message;
}

const SEV_KEY: Record<Issue['severity'], StringKey> = { error: 'error', warning: 'warning', info: 'info' };

export function MessageStrip() {
  const t = useT();
  const lang = useStore((s) => s.ui.lang);
  const messages = useStore((s) => s.messages);
  const select = useStore((s) => s.select);
  if (messages.length === 0)
    return (
      <div className="messages">
        <p className="empty">{t('noIssues')}</p>
      </div>
    );
  const order: Record<Issue['severity'], number> = { error: 0, warning: 1, info: 2 };
  const sorted = [...messages].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="messages">
      <ul>
        {sorted.map((m, i) => (
          <li
            key={i}
            className={m.severity}
            onClick={() => {
              if (m.entity && isSelectable(m.entity.collection)) {
                select([{ collection: m.entity.collection, id: m.entity.id }]);
                useStore.getState().setMode('model');
              }
            }}
          >
            <span className="sev">{t(SEV_KEY[m.severity])}</span>
            <span>{messageText(m, lang, t)}</span>
            {m.suggestion && !m.code.startsWith('runtime:') && <span className="suggestion">— {m.suggestion}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function isSelectable(c: string): c is SelectableCollection {
  return ['regions', 'rebars', 'rebarSets', 'boundaryConditions', 'probes', 'lineProbes'].includes(c);
}
