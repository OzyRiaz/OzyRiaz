'use client';
import { useEffect } from 'react';
import { useBasket } from './BasketProvider';
/** Remembers the postcode used to reach a page so the basket can price delivery without asking again. */
export function RememberPostcode({ postcode }: { postcode: string | null }) {
  const { setPrefs, hydrated, prefs } = useBasket();
  useEffect(() => { if (hydrated && postcode && postcode !== prefs.postcode) setPrefs({ postcode }); }, [hydrated, postcode]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
