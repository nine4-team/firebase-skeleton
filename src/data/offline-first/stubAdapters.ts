import { StubOutboxAdapter, StubDeltaAdapter, StubSignalAdapter } from './adapters';

const stubOutboxAdapter = new StubOutboxAdapter();
const stubDeltaAdapter = new StubDeltaAdapter();
const stubSignalAdapter = new StubSignalAdapter();

export function getStubAdapters() {
  return {
    outboxAdapter: stubOutboxAdapter,
    deltaAdapter: stubDeltaAdapter,
    signalAdapter: stubSignalAdapter,
  };
}
