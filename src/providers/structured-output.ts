/** Strict schema used only for the topic_tree task on providers that support OpenAI-style Structured Outputs. */
export const TOPIC_TREE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    charId: { type: 'string' },
    nodeId: { type: 'string' },
    generatedDay: { type: 'integer' },
    topics: {
      type: 'array', minItems: 4, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, label: { type: 'string' }, kind: { type: 'string', enum: ['daily', 'story'] },
          terminal: { type: 'boolean' }, require: { type: ['string', 'null'] }, response: { type: 'string' },
          usedResponse: { type: ['string', 'null'] }, ops: { type: 'array', items: {} }, unlocks: { type: 'array', items: { type: 'string' } }, generatedDay: { type: 'integer' },
        },
        required: ['id', 'label', 'kind', 'terminal', 'require', 'response', 'usedResponse', 'ops', 'unlocks', 'generatedDay'],
      },
    },
  },
  required: ['charId', 'nodeId', 'generatedDay', 'topics'],
} as const;
