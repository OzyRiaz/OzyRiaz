/** The 14 major allergens that UK food businesses must declare (Food Information Regulations). */
export const ALLERGENS = [
  'celery', 'cereals containing gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk',
  'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soya', 'sulphites',
] as const;

export const DIETARY = ['vegetarian', 'vegan', 'halal', 'gluten-free option'] as const;

export const ALLERGEN_NOTICE =
  'If you have a food allergy or intolerance, please tell the restaurant before ordering and check with them directly. ' +
  'Allergen information is supplied by each restaurant and BD Feast cannot guarantee it is complete or that dishes are free from cross-contamination.';
