import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeTab, isHostAccessError, isTransientNavigationError, requestCurrentSiteAccess } from '../../packages/core/src/chrome';

describe('active side-panel tab lookup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('accepts an active tab when Chrome omits its URL', async () => {
    const query = vi.fn().mockResolvedValue([{ id: 42, active: true }]);
    vi.stubGlobal('chrome', { tabs: { query } });
    await expect(activeTab()).resolves.toMatchObject({ id: 42 });
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('reports a missing tab only when no numeric tab ID exists', async () => {
    vi.stubGlobal('chrome', { tabs: { query: vi.fn().mockResolvedValue([{}]) } });
    await expect(activeTab()).rejects.toThrow('No active browser tab is available.');
  });

  it('recognizes Chrome host-access failures and signals the current tab', async () => {
    const addHostAccessRequest = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { permissions: { addHostAccessRequest } });
    expect(isHostAccessError(new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.'))).toBe(true);
    expect(isHostAccessError(new Error('The tab was closed.'))).toBe(false);
    expect(isTransientNavigationError(new Error('Frame with ID 0 was removed.'))).toBe(true);
    expect(isTransientNavigationError(new Error('No tab with id: 12.'))).toBe(true);
    expect(isTransientNavigationError(new Error('Cannot access contents of the page.'))).toBe(false);
    await requestCurrentSiteAccess(42);
    expect(addHostAccessRequest).toHaveBeenCalledWith({ tabId: 42 });
  });
});
