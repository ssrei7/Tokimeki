import { whoIsWhere } from '../encounter/schedule';
import type { AssetRef, TerminalFriendRequest, WorldState } from '../../data/schema/save';

export type ContactDirection = 'outgoing' | 'incoming';
export type FriendRequestAction = 'accept' | 'reject' | 'revoke';

export interface ContactCandidate {
  id: string;
  name: string;
  tier: 'formal' | 'semi';
  avatar?: AssetRef;
  fallbackInitial: string;
  summary: string;
  location?: {
    nodeId: string;
    nodeName: string;
    activity: string;
    source: 'schedule' | 'home' | 'roaming';
  };
  request?: TerminalFriendRequest;
}

export interface ContactOperationResult {
  ok: boolean;
  changed: boolean;
  warning?: string;
  request?: TerminalFriendRequest;
}

function latestRequest(world: WorldState, characterId: string, direction?: ContactDirection): TerminalFriendRequest | undefined {
  const request = [...world.terminal.friendRequests]
    .reverse()
    .find((request) => request.characterId === characterId && (!direction || request.direction === direction));
  if (request?.direction === 'outgoing' && request.status === 'pending') {
    return { ...request, status: 'accepted' };
  }
  return request;
}

function characterRecord(world: WorldState, characterId: string) {
  const formal = world.characters[characterId];
  if (formal) return { id: formal.id, name: formal.name, tier: formal.tier, avatar: formal.visuals.avatar };
  const npc = world.npcs[characterId];
  if (npc) return { id: npc.id, name: npc.name, tier: npc.tier, avatar: npc.visuals?.avatar };
  return undefined;
}

export function listContactCandidates(
  world: WorldState,
  day = world.clock.day,
  slotId = world.clock.slotId,
  daysPerWeek = 7,
): ContactCandidate[] {
  const locations = new Map(whoIsWhere(world, day, slotId, daysPerWeek).map((person) => [person.id, person]));
  const candidates = [
    ...Object.values(world.characters).map((character) => ({ id: character.id, name: character.name, tier: character.tier as 'formal' | 'semi', avatar: character.visuals.avatar, summary: character.card.description })),
    ...Object.values(world.npcs).map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier as 'formal' | 'semi', avatar: npc.visuals?.avatar, summary: npc.facts[0] ?? '' })),
  ];
  return candidates
    .map((candidate) => {
      const presence = locations.get(candidate.id);
      return {
        ...candidate,
        fallbackInitial: Array.from(candidate.name.trim())[0] ?? '?',
        summary: candidate.summary.trim() || (candidate.tier === 'formal' ? '正式角色' : '半正式角色 / NPC'),
        location: presence ? {
          nodeId: presence.nodeId,
          nodeName: world.map.nodes[presence.nodeId]?.name ?? presence.nodeId,
          activity: presence.activity,
          source: presence.source,
        } : undefined,
        request: latestRequest(world, candidate.id),
      } satisfies ContactCandidate;
    })
    .sort((a, b) => (a.tier === b.tier ? a.id.localeCompare(b.id) : a.tier === 'formal' ? -1 : 1));
}

export function createFriendRequest(world: WorldState, characterId: string, direction: ContactDirection, day = world.clock.day): ContactOperationResult {
  if (!characterRecord(world, characterId)) return { ok: false, changed: false, warning: '联系人不存在。' };
  const existingRaw = world.terminal.friendRequests.find((item) => item.characterId === characterId && item.direction === direction && (item.status === 'pending' || item.status === 'accepted'));
  if (existingRaw && direction === 'outgoing' && existingRaw.status === 'pending') {
    existingRaw.status = 'accepted';
    existingRaw.updatedDay = Math.max(1, Math.floor(day));
    return { ok: true, changed: true, request: existingRaw };
  }
  if (existingRaw) return { ok: true, changed: false, request: existingRaw };
  const request: TerminalFriendRequest = {
    id: `friend-request-${characterId}-${direction}-${world.terminal.friendRequests.length + 1}`,
    characterId,
    direction,
    // Friend requests are a local simulation: the counterpart confirms in
    // the same deterministic operation. Incoming legacy pending requests are
    // still supported by resolveFriendRequest below.
    status: 'accepted',
    createdDay: Math.max(1, Math.floor(day)),
    updatedDay: Math.max(1, Math.floor(day)),
  };
  world.terminal.friendRequests.push(request);
  return { ok: true, changed: true, request };
}

export function resolveFriendRequest(world: WorldState, requestId: string, action: FriendRequestAction, day = world.clock.day): ContactOperationResult {
  const request = world.terminal.friendRequests.find((item) => item.id === requestId);
  if (!request) return { ok: false, changed: false, warning: '好友申请不存在。' };
  const targetStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'revoked';
  if (request.status === targetStatus) return { ok: true, changed: false, request };
  if (request.status !== 'pending') return { ok: true, changed: false, request };
  if (action === 'accept' && request.direction !== 'incoming') return { ok: false, changed: false, warning: '只能接受对方发来的申请。', request };
  if (action === 'reject' && request.direction !== 'incoming') return { ok: false, changed: false, warning: '只能拒绝对方发来的申请。', request };
  if (action === 'revoke' && request.direction !== 'outgoing') return { ok: false, changed: false, warning: '只能撤回自己发出的申请。', request };
  request.status = targetStatus;
  request.updatedDay = Math.max(1, Math.floor(day));
  return { ok: true, changed: true, request };
}

/** Backward-compatible helper for old callers. New requests are accepted on creation. */
export function simulateFriendAcceptance(world: WorldState, requestId: string, day = world.clock.day): ContactOperationResult {
  const request = world.terminal.friendRequests.find((item) => item.id === requestId);
  if (!request) return { ok: false, changed: false, warning: '好友申请不存在。' };
  if (request.direction !== 'outgoing') return { ok: false, changed: false, warning: '只能模拟对方接受自己发出的申请。', request };
  if (request.status === 'accepted') return { ok: true, changed: false, request };
  if (request.status !== 'pending') return { ok: true, changed: false, request };
  request.status = 'accepted';
  request.updatedDay = Math.max(1, Math.floor(day));
  return { ok: true, changed: true, request };
}

export function isAcceptedFriend(world: WorldState, characterId: string): boolean {
  return world.terminal.friendRequests.some((request) => request.characterId === characterId && (request.status === 'accepted' || (request.direction === 'outgoing' && request.status === 'pending')));
}
