import { CourierDisabledError, type CourierProvider } from './types';

/** A provider that is wired into the architecture but cannot do anything: every call refuses without touching the network. */
function disabledProvider(id: string, name: string): CourierProvider {
  const off = (): never => { throw new CourierDisabledError(id); };
  return {
    id, name,
    isEnabled: () => false, // stays false until a real adapter is implemented, tested against the provider's sandbox, and approved by the owner
    disabledReason: () => 'No commercial agreement or API credentials; adapter not implemented. Paid courier bookings are disabled at launch.',
    checkAvailability: async () => off(), quote: async () => off(), book: async () => off(), track: async () => off(), cancel: async () => off(),
  };
}

export const gophr = disabledProvider('gophr', 'Gophr');
export const uberDirect = disabledProvider('uber_direct', 'Uber Direct');
