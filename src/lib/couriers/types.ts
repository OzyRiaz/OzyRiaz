/**
 * Provider-independent courier interface. NOTHING here calls a real service at launch: every provider is disabled until
 * a commercial agreement and credentials exist AND an admin explicitly enables it. No provider pricing or Bradford
 * availability is assumed anywhere in this codebase.
 */
export interface Address { line1: string; city: string; postcode: string }
export interface DeliveryRequest { orderId: string; pickup: Address & { name: string; phone: string }; dropoff: Address & { phone: string }; readyAt?: Date; itemsDescription: string }
export interface AvailabilityResult { available: boolean; reason?: string }
export interface Quote { provider: string; quoteRef: string; costPence: number; estimatedPickupAt: Date; estimatedDeliveryAt: Date; expiresAt: Date }
export interface Booking { provider: string; bookingRef: string; status: 'booked' | 'collected' | 'delivered' | 'failed' | 'cancelled'; trackingUrl?: string; actualCostPence?: number }
export interface TrackingInfo { status: Booking['status']; trackingUrl?: string; etaAt?: Date; failureReason?: string }

export class CourierDisabledError extends Error { constructor(provider: string) { super(`Courier provider "${provider}" is disabled (no commercial agreement/credentials configured)`); this.name = 'CourierDisabledError'; } }

export interface CourierProvider {
  readonly id: string;
  readonly name: string;
  isEnabled(): boolean;
  disabledReason(): string;
  checkAvailability(req: DeliveryRequest): Promise<AvailabilityResult>;
  quote(req: DeliveryRequest): Promise<Quote>;
  book(quote: Quote, req: DeliveryRequest): Promise<Booking>;
  track(bookingRef: string): Promise<TrackingInfo>;
  cancel(bookingRef: string): Promise<{ cancelled: boolean; feePence: number }>;
}
