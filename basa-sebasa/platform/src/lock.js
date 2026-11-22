// One change at a time per job (and per customer chat). Customer taps, pro actions, payment confirmations
// and the background sweep can arrive at the same moment; without this, one could overwrite the other.
const chains = new Map();
export function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.then(() => fn());
  const tail = run.catch(() => {});
  chains.set(key, tail);
  tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  return run;
}
export const lockCount = () => chains.size;
