export const STREAMS = {
  PR_EVENTS:       "events:pr",         // Detection service → Agent + Broadcaster
  DECISIONS:       "events:decisions",  // Agent → GitHub Action Service + Broadcaster
  ACTIONS:         "events:actions",    // GitHub Action Service → Broadcaster
};

export const EVENT_TYPES = {
  // Detection
  PR_RECEIVED:     "pr.received",
  PR_SCORED:       "pr.scored",

  // Agent
  AGENT_THINKING:  "agent.thinking",
  AGENT_DECIDED:   "agent.decided",
  AGENT_ERROR:     "agent.error",

  // Actions
  ACTION_EXECUTED: "action.executed",
  ACTION_ERROR:    "action.error",
};

/**
 * Publish an event to a Redis Stream.
 * @param {import('ioredis').Redis} redis
 * @param {string} stream  - one of STREAMS.*
 * @param {string} type    - one of EVENT_TYPES.*
 * @param {object} data    - any JSON-serializable payload
 */
export async function publish(redis, stream, type, data) {
  return redis.xadd(stream, "*", "type", type, "data", JSON.stringify(data));
}


export function parseFields(fields) {
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}
