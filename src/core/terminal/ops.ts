import { z } from 'zod';

import { OpRegistry } from '../ops';
import { createIncomingTransferProposal } from './transfers';

const TerminalTransferProposalSchema = z.object({
  op: z.literal('terminal_transfer_proposal'),
  characterId: z.string().min(1),
  currencyId: z.string().min(1),
  amount: z.number().finite().positive(),
}).strict();

export function createTerminalOpRegistry(): OpRegistry {
  const registry = new OpRegistry();
  registry.register({
    op: 'terminal_transfer_proposal',
    schema: TerminalTransferProposalSchema,
    clamp: {},
    promptDoc: 'terminal_transfer_proposal: {"op":"terminal_transfer_proposal","characterId":"current-contact-id","currencyId":"known-currency-id","amount":positive-number}; proposes a pending transfer from the current terminal contact. It never credits the player directly.',
    describe: (payload) => `terminal transfer proposal from ${payload.characterId}`,
    apply: (payload, context) => {
      if (!context.actorId || payload.characterId !== context.actorId) {
        return { ok: false, changes: [], warning: '转账提议联系人必须是当前生成回复的联系人。' };
      }
      const before = context.world.terminal.transferRequests.length;
      const result = createIncomingTransferProposal(context.world, payload.characterId, payload.currencyId, payload.amount, context.day);
      if (!result.ok) return { ok: false, changes: [], warning: result.warning };
      return {
        ok: true,
        changes: result.changed ? [{
          path: 'world.terminal.transferRequests',
          before,
          after: context.world.terminal.transferRequests.length,
          description: `Created a pending terminal transfer proposal from ${payload.characterId}.`,
        }] : [],
      };
    },
  });
  return registry;
}
