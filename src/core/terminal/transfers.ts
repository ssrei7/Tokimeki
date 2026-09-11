import type { CurrencyDef, TerminalTransferRequest, WorldState } from '../../data/schema/save';
import { isAcceptedFriend } from './contacts';

export type TransferAction = 'accept' | 'reject';

export interface TerminalTransferResult {
  ok: boolean;
  changed: boolean;
  warning?: string;
  request?: TerminalTransferRequest;
}

function currencyFor(world: WorldState, currencyId: string): CurrencyDef | undefined {
  return world.economy.currencies[currencyId];
}

function validAmount(amount: number, currency: CurrencyDef): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const decimals = Math.max(0, Math.floor(currency.decimals));
  const scale = 10 ** decimals;
  const scaled = amount * scale;
  return Number.isSafeInteger(scaled) && Math.round(scaled) / scale === amount;
}

function nextRequestId(world: WorldState, characterId: string): string {
  return `transfer-${characterId}-${world.terminal.transferRequests.length + 1}`;
}

function findRequest(world: WorldState, requestId: string): TerminalTransferRequest | undefined {
  return world.terminal.transferRequests.find((request) => request.id === requestId);
}

export function listTerminalTransfers(world: WorldState, characterId?: string): TerminalTransferRequest[] {
  return world.terminal.transferRequests.filter((request) => !characterId || request.characterId === characterId);
}

export function sendPlayerTransfer(world: WorldState, characterId: string, currencyId: string, amount: number, day = world.clock.day): TerminalTransferResult {
  if (!isAcceptedFriend(world, characterId)) return { ok: false, changed: false, warning: '只有已接受的好友可以转账。' };
  const currency = currencyFor(world, currencyId);
  if (!currency) return { ok: false, changed: false, warning: '货币不存在于当前世界经济配置。' };
  if (!validAmount(amount, currency)) return { ok: false, changed: false, warning: '转账金额必须是有限、正数，并符合货币精度。' };
  const balanceBefore = world.player.stats[currency.statKey] ?? 0;
  if (!Number.isSafeInteger(Math.round(balanceBefore * 10 ** Math.max(0, Math.floor(currency.decimals)))) || balanceBefore < amount) return { ok: false, changed: false, warning: '余额不足或不是安全数值，转账未发送。' };
  const balanceAfter = balanceBefore - amount;
  if (!Number.isSafeInteger(Math.round(balanceAfter * 10 ** Math.max(0, Math.floor(currency.decimals))))) return { ok: false, changed: false, warning: '转账后余额不是安全数值，转账未发送。' };
  world.player.stats[currency.statKey] = balanceAfter;
  const request: TerminalTransferRequest = {
    id: nextRequestId(world, characterId), characterId, direction: 'outgoing', currencyId, amount,
    status: 'accepted', createdDay: Math.max(1, Math.floor(day)), updatedDay: Math.max(1, Math.floor(day)),
  };
  world.terminal.transferRequests.push(request);
  return { ok: true, changed: true, request };
}

export function createIncomingTransferProposal(world: WorldState, characterId: string, currencyId: string, amount: number, day = world.clock.day): TerminalTransferResult {
  if (!isAcceptedFriend(world, characterId)) return { ok: false, changed: false, warning: '只有已接受的好友可以提出转账。' };
  const currency = currencyFor(world, currencyId);
  if (!currency) return { ok: false, changed: false, warning: '货币不存在于当前世界经济配置。' };
  if (!validAmount(amount, currency)) return { ok: false, changed: false, warning: '转账金额必须是有限、正数，并符合货币精度。' };
  const request: TerminalTransferRequest = {
    id: nextRequestId(world, characterId), characterId, direction: 'incoming', currencyId, amount,
    status: 'pending', createdDay: Math.max(1, Math.floor(day)), updatedDay: Math.max(1, Math.floor(day)),
  };
  world.terminal.transferRequests.push(request);
  return { ok: true, changed: true, request };
}

export function resolveIncomingTransfer(world: WorldState, requestId: string, action: TransferAction, day = world.clock.day): TerminalTransferResult {
  const request = findRequest(world, requestId);
  if (!request) return { ok: false, changed: false, warning: '转账提议不存在。' };
  if (request.direction !== 'incoming') return { ok: false, changed: false, warning: '只有对方转入的提议可以在这里处理。', request };
  const targetStatus = action === 'accept' ? 'accepted' : 'rejected';
  if (request.status === targetStatus) return { ok: true, changed: false, request };
  if (request.status !== 'pending') return { ok: true, changed: false, request };
  if (action === 'reject') {
    request.status = 'rejected';
    request.updatedDay = Math.max(1, Math.floor(day));
    return { ok: true, changed: true, request };
  }
  if (!isAcceptedFriend(world, request.characterId)) return { ok: false, changed: false, warning: '好友状态已失效，不能收款。', request };
  const currency = currencyFor(world, request.currencyId);
  if (!currency || !validAmount(request.amount, currency)) return { ok: false, changed: false, warning: '转账提议的货币或金额已失效。', request };
  const balanceBefore = world.player.stats[currency.statKey] ?? 0;
  const scale = 10 ** Math.max(0, Math.floor(currency.decimals));
  if (!Number.isSafeInteger(Math.round(balanceBefore * scale))) return { ok: false, changed: false, warning: '当前余额不是安全数值，不能收款。', request };
  const balanceAfter = balanceBefore + request.amount;
  if (!Number.isSafeInteger(Math.round(balanceAfter * scale))) return { ok: false, changed: false, warning: '收款后余额不是安全数值，不能收款。', request };
  world.player.stats[currency.statKey] = balanceAfter;
  request.status = 'accepted';
  request.updatedDay = Math.max(1, Math.floor(day));
  return { ok: true, changed: true, request };
}
