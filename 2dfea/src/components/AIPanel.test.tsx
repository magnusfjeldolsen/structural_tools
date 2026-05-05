/**
 * AIPanel tests (RTL).
 *
 * Phase 1 surface: render the pill, expand it, type into the composer,
 * submit through the manual provider, observe the streamed reply land in
 * the transcript, and verify the Stop button aborts an in-flight request.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AIPanel } from './AIPanel';
import {
  useAIStore,
  _resetAIStoreForTesting,
} from '../ai/store/useAIStore';
import {
  _resetManualForTesting,
  peekManualPending,
  submitManualResponse,
} from '../ai/providers/manual';
import { PROVIDERS } from '../ai/providers';

beforeEach(() => {
  for (const p of PROVIDERS) {
    if (p.tokenStorageKey) localStorage.removeItem(p.tokenStorageKey);
  }
  localStorage.removeItem('2dfea-ai-store');
  _resetManualForTesting();
  _resetAIStoreForTesting();
  // Phase-1 tests run against the manual provider so we never touch the
  // network. Each test that needs the panel open opts in. setState bypass
  // here also clears the "conversation cleared" notice that the provider-
  // switch path sets — tests assert the empty-state UI which is sensitive
  // to lastError.
  useAIStore.setState({ activeProviderId: 'manual', lastError: null });
});

afterEach(() => {
  _resetManualForTesting();
  _resetAIStoreForTesting();
});

describe('AIPanel — collapsed', () => {
  it('renders the pill button when panelOpen is false', () => {
    render(<AIPanel />);
    expect(screen.getByRole('button', { name: /Open AI assistant/i })).toBeDefined();
  });

  it('clicking the pill opens the panel dialog', () => {
    render(<AIPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Open AI assistant/i }));
    expect(screen.getByRole('dialog', { name: /AI Assistant/i })).toBeDefined();
  });
});

describe('AIPanel — composer + transcript', () => {
  beforeEach(() => {
    useAIStore.getState().setPanelOpen(true);
  });

  it('shows the empty-state hint before any messages', () => {
    render(<AIPanel />);
    // The hint is in a single <div>, but whitespace inside the source spans
    // multiple lines after JSX trims; match a unique substring.
    const transcript = screen.getByTestId('ai-transcript');
    expect(transcript.textContent).toMatch(/text-only chat/);
  });

  it('Send button is disabled when the textarea is empty', () => {
    render(<AIPanel />);
    const send = screen.getByRole('button', { name: /^Send$/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('typing + Enter dispatches send through the active provider', async () => {
    render(<AIPanel />);
    const textarea = screen.getByLabelText(/AI prompt/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hello world' } });

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
      // Yield until manual provider registers the pending request.
      while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    });

    // Manual paste textarea should be visible.
    expect(screen.getByTestId('ai-manual-paste')).toBeDefined();

    // User message rendered in transcript.
    const transcript = screen.getByTestId('ai-transcript');
    expect(transcript.textContent).toContain('hello world');

    // Submit a paste reply.
    await act(async () => {
      const pasteArea = screen.getByLabelText(/Manual provider paste area/i) as HTMLTextAreaElement;
      fireEvent.change(pasteArea, { target: { value: 'manual reply text' } });
      fireEvent.click(screen.getByRole('button', { name: /Submit manual reply/i }));
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(screen.getByTestId('ai-transcript').textContent).toContain('manual reply text');
  });

  it('Stop button aborts an in-flight manual request', async () => {
    render(<AIPanel />);
    fireEvent.change(screen.getByLabelText(/AI prompt/i), { target: { value: 'about to stop' } });

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/AI prompt/i), { key: 'Enter' });
      while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    });

    // Cancel via the manual-paste area's "Cancel" button (calls abort()
    // under the hood; the regular Stop button is not rendered while the
    // manual paste UI is open per AIPanel's Phase-1 layout).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
      await new Promise((r) => setTimeout(r, 5));
    });

    // The assistant message should be marked aborted; status idle.
    const t = useAIStore.getState().transcript;
    const assistant = t.find((entry) => entry.role === 'assistant');
    expect(assistant?.aborted).toBe(true);
    expect(useAIStore.getState().status).toBe('idle');
  });

  it('opening settings reveals the AI Settings dialog', () => {
    render(<AIPanel />);
    fireEvent.click(screen.getByRole('button', { name: /AI settings/i }));
    expect(screen.getByRole('dialog', { name: /AI Settings/i })).toBeDefined();
  });

  it('renders the model badge from active provider + selected model', () => {
    render(<AIPanel />);
    const dialog = screen.getByRole('dialog', { name: /AI Assistant/i });
    expect(dialog.textContent).toContain('Manual (paste responses)');
  });

  it('shows the GitHub Models pre-flight error when the user submits without a token', async () => {
    useAIStore.getState().setActiveProviderId('github-models');
    useAIStore.getState().setPanelOpen(true);
    render(<AIPanel />);
    fireEvent.change(screen.getByLabelText(/AI prompt/i), { target: { value: 'hi' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send$/ }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(useAIStore.getState().lastError).toMatch(/GitHub/);
    // Inline error visible.
    expect(screen.getByRole('alert').textContent).toMatch(/GitHub/);
  });
});
