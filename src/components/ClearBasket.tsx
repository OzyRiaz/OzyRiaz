'use client';
import { useEffect } from 'react';
import { useBasket } from './BasketProvider';
export function ClearBasket() { const { clear, basket } = useBasket(); useEffect(() => { if (basket) clear(); }, [basket, clear]); return null; }
