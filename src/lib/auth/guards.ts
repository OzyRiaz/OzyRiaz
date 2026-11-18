import type { Restaurant, Session } from '../types';
/** Pure authorisation helpers (unit-tested). */
export const ownsRestaurant = (s: Session | null, restaurantId: string) => !!s && s.restaurantIds.includes(restaurantId);
export const isAdmin = (s: Session | null) => s?.role === 'admin';
export const canViewOrder = (s: Session | null, order: { customer_id: string; restaurant_id: string }) =>
  !!s && (s.userId === order.customer_id || ownsRestaurant(s, order.restaurant_id) || isAdmin(s));
export const isPubliclyVisible = (r: Pick<Restaurant, 'status'>) => r.status === 'approved';
