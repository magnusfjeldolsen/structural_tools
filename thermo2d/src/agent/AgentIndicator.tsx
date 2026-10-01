import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { agentActivity } from './activity.js';
import { helpUi } from '../help/strings.js';
import '../help/help.css';

/** Fixed badge shown for a few seconds after every agent-API call, so the user sees who is driving. */
export function AgentIndicator() {
  const lang = useStore((s) => s.ui.lang);
  const calls = agentActivity((s) => s.calls);
  const [now, setNow] = useState(Date.now());
  const last = calls[calls.length - 1];
  useEffect(() => {
    if (!last) return;
    setNow(Date.now());
    const timer = setTimeout(() => setNow(Date.now()), 4100);
    return () => clearTimeout(timer);
  }, [last]);
  if (!last || now - last.at > 4000) return null;
  return (
    <div className="agent-badge" role="status">
      <span className="dot" />
      {helpUi(lang).agentActive}: {last.name}
    </div>
  );
}
